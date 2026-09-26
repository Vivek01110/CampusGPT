import { analyzeQuery, expandQuery } from '../query/queryAnalyzer.js';
import { retrieveVectorCandidates } from './vectorRetriever.js';
import { retrieveKeywordCandidates } from './keywordRetriever.js';
import { reciprocalRankFusion } from './fusion.js';
import { rerank } from './reranker.js';

/**
 * Orchestrates the complete Phase 3 Hybrid Retrieval Pipeline with Multi-Query Expansion:
 * 1. Query Decomposition (Extract intent, entities, requested fields, academic year, confident metadata filters)
 * 2. Query Expansion (Generate 2-4 targeted variants using university terminology)
 * 3. Multi-Query Parallel Vector Search (Qdrant) + Keyword Search (BM25)
 * 4. Reciprocal Rank Fusion (RRF) candidate merge
 * 5. Cross-Feature Reranking
 * 6. Returns final top-K grounded chunks with diagnostics and analysis
 * 
 * @param {string} rawQuery - Student inquiry
 * @param {object} options - Retrieval options (vectorTopK, keywordTopK, finalTopK, filters, enableExpansion)
 * @returns {Promise<{ chunks: Array<object>, diagnostics: object, analysis: object, expandedQueries: Array<string> }>}
 */
export const retrieveHybridContext = async (rawQuery, options = {}) => {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return {
      chunks: [],
      diagnostics: { totalCandidates: 0, finalCount: 0 },
      analysis: {},
      expandedQueries: [],
    };
  }

  const startTime = Date.now();
  console.log(`\n======================================================`);
  console.log(`[RAG] Query: "${rawQuery.trim()}"`);

  // 1. Query Decomposition & Analysis
  const analysis = analyzeQuery(rawQuery);
  const activeFilters = {
    ...(analysis.category ? { category: analysis.category } : {}),
    ...(analysis.department ? { department: analysis.department } : {}),
    ...(analysis.documentType ? { documentType: analysis.documentType } : {}),
    ...(analysis.academicYear ? { academicYear: analysis.academicYear } : {}),
    ...(analysis.year ? { year: analysis.year } : {}),
    ...options.filters,
  };

  console.log(`[QUERY ANALYSIS] Intent: ${analysis.intent || 'generic'}`);
  console.log(`[QUERY ANALYSIS] Requested Fields: ${JSON.stringify(analysis.requestedFields)}`);
  console.log(`[QUERY ANALYSIS] Search query: "${analysis.searchQuery}"`);
  console.log(`[QUERY ANALYSIS] Filters: ${JSON.stringify(activeFilters)}`);

  // 2. Query Expansion (2 to 4 variants)
  const expandedQueries = options.enableExpansion !== false ? expandQuery(rawQuery, analysis) : [];
  const retrievalQueries = [analysis.searchQuery || rawQuery, ...expandedQueries].slice(0, 4);

  console.log(`[MULTI-QUERY] Expanded into ${retrievalQueries.length} query variant(s):`);
  retrievalQueries.forEach((q, idx) => console.log(`   [Q${idx + 1}] "${q}"`));

  const vectorLimit = options.vectorTopK || parseInt(process.env.RAG_VECTOR_TOP_K, 10) || 20;
  const keywordLimit = options.keywordTopK || parseInt(process.env.RAG_KEYWORD_TOP_K, 10) || 20;
  const finalLimit = options.finalTopK || parseInt(process.env.RAG_FINAL_TOP_K, 10) || 6;

  // 3. Multi-Query Retrieval across Vector & Keyword Engines
  // Keyword BM25 queries run across all variants in parallel (fast in-memory)
  const keywordPromises = retrievalQueries.map((queryVariant) =>
    retrieveKeywordCandidates(queryVariant, analysis, {
      limit: keywordLimit,
      filters: activeFilters,
    })
  );

  // Vector queries run sequentially across top query variants with graceful error handling
  const vectorCandidates = [];
  const vectorQueriesToRun = retrievalQueries.slice(0, 2);
  for (const queryVariant of vectorQueriesToRun) {
    try {
      const candidates = await retrieveVectorCandidates(queryVariant, {
        limit: vectorLimit,
        filters: activeFilters,
      });
      if (Array.isArray(candidates)) {
        vectorCandidates.push(...candidates);
      }
    } catch (err) {
      console.warn(`[HYBRID RETRIEVER] Vector search variant failed: ${err.message}`);
    }
  }

  const keywordResults = await Promise.all(keywordPromises);
  const keywordCandidates = keywordResults.flat();

  let combinedVectorCandidates = vectorCandidates;
  let combinedKeywordCandidates = keywordCandidates;

  // Deduplicate before fusion while preserving highest initial scores
  const dedupMap = (candidates) => {
    const map = new Map();
    for (const c of candidates) {
      const key = c.documentId && c.chunkIndex !== undefined ? `${c.documentId}:${c.chunkIndex}` : c.text.slice(0, 100);
      if (!map.has(key) || (c.score && c.score > map.get(key).score)) {
        map.set(key, c);
      }
    }
    return Array.from(map.values());
  };

  const dedupedVector = dedupMap(combinedVectorCandidates);
  const dedupedKeyword = dedupMap(combinedKeywordCandidates);

  console.log(`[MULTI-QUERY POOL] Vector: ${dedupedVector.length} | Keyword: ${dedupedKeyword.length}`);

  // 4. Candidate Fusion via Reciprocal Rank Fusion (RRF)
  const fusedCandidates = reciprocalRankFusion(dedupedVector, dedupedKeyword, {
    k: parseInt(process.env.RAG_RRF_K, 10) || 60,
  });

  console.log(`[HYBRID RRF] Fused Candidates: ${fusedCandidates.length}`);

  // Graceful fallback if strict filters yielded 0 results: try without restrictive category/dept filters
  let candidatesToRerank = fusedCandidates;
  if (candidatesToRerank.length === 0 && Object.keys(activeFilters).length > 0) {
    console.log('[RAG] No candidates found with strict filters. Executing graceful relaxation...');
    const relaxedResults = await Promise.all([
      retrieveVectorCandidates(analysis.searchQuery || rawQuery, { limit: vectorLimit }),
      retrieveKeywordCandidates(rawQuery, analysis, { limit: keywordLimit }),
    ]);
    candidatesToRerank = reciprocalRankFusion(relaxedResults[0], relaxedResults[1], {
      k: parseInt(process.env.RAG_RRF_K, 10) || 60,
    });
    console.log(`[RAG RELAXED] Fused Candidates: ${candidatesToRerank.length}`);
  }

  // 5. Reranking (Cross-feature scorer / Gemini with safe fallback)
  const finalChunks = await rerank(rawQuery, candidatesToRerank, {
    topK: finalLimit,
    provider: process.env.RERANKER_PROVIDER || 'local',
  });

  const durationMs = Date.now() - startTime;
  console.log(`[RERANK] Candidates: ${candidatesToRerank.length} -> Final: ${finalChunks.length} (${durationMs}ms)`);
  console.log(`======================================================\n`);

  const diagnostics = {
    query: rawQuery,
    analyzedSearchQuery: analysis.searchQuery,
    appliedFilters: activeFilters,
    expandedQueries,
    regulationNumber: analysis.regulationNumber,
    courseCode: analysis.courseCode,
    vectorCount: dedupedVector.length,
    keywordCount: dedupedKeyword.length,
    fusedCandidateCount: fusedCandidates.length,
    finalChunkCount: finalChunks.length,
    durationMs,
  };

  return {
    chunks: finalChunks,
    diagnostics,
    analysis,
    expandedQueries,
  };
};

export default {
  retrieveHybridContext,
};
