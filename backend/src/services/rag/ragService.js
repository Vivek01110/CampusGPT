import { retrieveHybridContext } from '../retrieval/hybridRetriever.js';
import { retrieveVectorCandidates } from '../retrieval/vectorRetriever.js';
import { generateAnswer } from '../ai/llmService.js';
import { assessEvidenceCoverage } from './evidenceAssessor.js';
import { analyzeQuery } from '../query/queryAnalyzer.js';
import exactQueryCache from '../cache/exactQueryCache.js';
import semanticCache from '../cache/semanticCache.js';
import cacheInvalidation from '../cache/cacheInvalidation.js';
import { isSemanticCacheEligible } from '../cache/cacheKey.js';

/**
 * Format and deduplicate sources by grouping chunks belonging to the same document
 * @param {Array<object>} chunks
 * @returns {Array<object>} Clean, grouped source citations
 */
export const groupSources = (chunks = []) => {
  const docMap = new Map();

  for (const chunk of chunks) {
    const docId = chunk.documentId || 'doc-unknown';
    if (!docMap.has(docId)) {
      docMap.set(docId, {
        documentId: docId,
        title: chunk.documentTitle || 'Official University Document',
        documentTitle: chunk.documentTitle || 'Official University Document',
        category: chunk.category || 'academics',
        department: chunk.department || 'General',
        documentType: chunk.documentType || 'regulation',
        sourceAuthority: chunk.sourceAuthority || 'official',
        year: chunk.year || null,
        academicYear: chunk.academicYear || null,
        pages: new Set(),
        chunkIndices: [],
        sourceUrl: chunk.sourceUrl || null,
        sourcePageUrl: chunk.sourcePageUrl || null,
        knowledgeBaseScope: chunk.knowledgeBaseScope || 'student',
        topScore: chunk.rerankScore || chunk.rrfScore || chunk.score || 0,
      });
    }

    const docEntry = docMap.get(docId);
    if (chunk.pageNumber) docEntry.pages.add(chunk.pageNumber);
    if (chunk.chunkIndex !== undefined) docEntry.chunkIndices.push(chunk.chunkIndex);
    if (!docEntry.sourcePageUrl && chunk.sourcePageUrl) docEntry.sourcePageUrl = chunk.sourcePageUrl;
    const score = chunk.rerankScore || chunk.rrfScore || chunk.score || 0;
    if (score > docEntry.topScore) docEntry.topScore = score;
  }

  const sources = [];
  for (const entry of docMap.values()) {
    const sortedPages = Array.from(entry.pages).sort((a, b) => a - b);
    let pageDisplay = null;
    if (sortedPages.length === 1) {
      pageDisplay = `Page ${sortedPages[0]}`;
    } else if (sortedPages.length > 1) {
      // Check if continuous range
      const isRange =
        sortedPages.length === sortedPages[sortedPages.length - 1] - sortedPages[0] + 1;
      pageDisplay = isRange
        ? `Pages ${sortedPages[0]}–${sortedPages[sortedPages.length - 1]}`
        : `Pages ${sortedPages.join(', ')}`;
    }

    sources.push({
      documentId: entry.documentId,
      documentTitle: entry.title,
      title: entry.title,
      category: entry.category,
      department: entry.department,
      documentType: entry.documentType,
      sourceAuthority: entry.sourceAuthority || 'official',
      year: entry.year,
      academicYear: entry.academicYear,
      pageNumber: sortedPages[0] || 1,
      pages: sortedPages,
      pageDisplay,
      sourceUrl: entry.sourceUrl,
      sourcePageUrl: entry.sourcePageUrl,
      knowledgeBaseScope: entry.knowledgeBaseScope,
      relevanceScore: Math.round(entry.topScore * 100) / 100,
    });
  }

  // Sort sources by relevanceScore descending
  return sources.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

/**
 * End-to-end RAG orchestrator with Multi-Query Retrieval, Evidence Coverage & Partial Answers:
 * Question -> Exact Cache -> Semantic Cache -> Multi-Query Hybrid Retrieval -> RRF -> Reranking -> Evidence Assessment -> Grounded LLM -> Cache Store
 * 
 * @param {string} question - Student inquiry
 * @param {object} options - Options (user, mode, topK, filters, bypassCache, semanticThreshold)
 * @returns {Promise<{
 *   answer: string,
 *   sources: Array<object>,
 *   retrievedCount: number,
 *   coverage: 'FULL'|'PARTIAL'|'INSUFFICIENT'|'CLARIFICATION',
 *   requestedFields: string[],
 *   supportedFields: string[],
 *   missingFields: string[],
 *   clarification?: object|null,
 *   diagnostics: object,
 *   cache: object
 * }>}
 */
export const answerQuestion = async (question, options = {}) => {
  if (!question || !question.trim()) {
    return {
      answer: 'Please provide a valid campus question.',
      sources: [],
      retrievedCount: 0,
      coverage: 'INSUFFICIENT',
      requestedFields: [],
      supportedFields: [],
      missingFields: [],
      diagnostics: {},
      cache: { hit: false, type: 'none' },
    };
  }

  const query = question.trim();
  const isPublic = options.isPublic !== false && !options.user?.isPrivateQuery;
  const version = await cacheInvalidation.getCacheVersion();

  // ----------------------------------------------------
  // STEP 1: Exact Query Cache Lookup
  // ----------------------------------------------------
  if (!options.bypassCache) {
    const exactResult = await exactQueryCache.get({
      query,
      user: options.user,
      version,
      isPublic,
    });

    if (exactResult) {
      return {
        answer: exactResult.answer,
        sources: exactResult.sources || [],
        retrievedCount: (exactResult.sources || []).length,
        coverage: exactResult.coverage || 'FULL',
        requestedFields: exactResult.requestedFields || [],
        supportedFields: exactResult.supportedFields || [],
        missingFields: exactResult.missingFields || [],
        diagnostics: { cache: 'exact', version, cachedAt: exactResult.cachedAt },
        cache: {
          hit: true,
          type: 'exact',
          cachedAt: exactResult.cachedAt,
          version,
        },
      };
    }
  }

  // ----------------------------------------------------
  // STEP 2: Semantic Query Cache Lookup
  // ----------------------------------------------------
  if (!options.bypassCache && isSemanticCacheEligible(query, { isPrivate: !isPublic })) {
    const semanticResult = await semanticCache.findSimilar({
      query,
      version,
      threshold: options.semanticThreshold,
    });

    if (semanticResult) {
      return {
        answer: semanticResult.answer,
        sources: semanticResult.sources || [],
        retrievedCount: (semanticResult.sources || []).length,
        coverage: semanticResult.coverage || 'FULL',
        requestedFields: semanticResult.requestedFields || [],
        supportedFields: semanticResult.supportedFields || [],
        missingFields: semanticResult.missingFields || [],
        diagnostics: {
          cache: 'semantic',
          version,
          similarity: semanticResult.cache?.similarity,
          matchedQuery: semanticResult.cache?.matchedQuery,
        },
        cache: {
          hit: true,
          type: 'semantic',
          similarity: semanticResult.cache?.similarity,
          threshold: semanticResult.cache?.threshold,
          matchedQuery: semanticResult.cache?.matchedQuery,
          cachedAt: semanticResult.cachedAt,
          version,
        },
      };
    }
  }

  // ----------------------------------------------------
  // STEP 3: Multi-Query Hybrid Retrieval & Evidence Assessment
  // ----------------------------------------------------
  let retrievedChunks = [];
  let diagnostics = {};
  let analysis = {};

  if (options.mode === 'vector_only') {
    const topK = options.topK || parseInt(process.env.RAG_TOP_K, 10) || 5;
    analysis = analyzeQuery(query);
    retrievedChunks = await retrieveVectorCandidates(query, {
      limit: topK,
      filters: options.filters,
    });
    diagnostics = { mode: 'vector_only', chunkCount: retrievedChunks.length };
  } else {
    const hybridResult = await retrieveHybridContext(query, options);
    retrievedChunks = hybridResult.chunks;
    diagnostics = hybridResult.diagnostics;
    analysis = hybridResult.analysis || analyzeQuery(query);
  }

  // Assess evidence coverage across retrieved chunks
  const coverageReport = assessEvidenceCoverage(query, analysis, retrievedChunks);
  diagnostics.coverage = coverageReport.coverage;
  diagnostics.requestedFields = coverageReport.requestedFields;
  diagnostics.supportedFields = coverageReport.supportedFields;
  diagnostics.missingFields = coverageReport.missingFields;

  // Ambiguous Exam Schedule Clarification check:
  // e.g. "Give me the mid exam schedule." without semester or program
  const isAmbiguousExamQuery =
    (analysis.examType || /\b(mid exam|end exam|exam schedule|midsem schedule|datesheet)\b/i.test(query)) &&
    !analysis.semester &&
    !analysis.program &&
    !analysis.courseCode;

  if (isAmbiguousExamQuery && (coverageReport.coverage === 'INSUFFICIENT' || retrievedChunks.length === 0)) {
    const clarificationQuestion = 'Which programme and semester are you asking about?';
    const clarificationOptions = [
      '7th semester CSE',
      '5th semester CSE',
      '7th semester ECE',
      '3rd semester Mechanical',
    ];

    const clarificationAnswer = `${clarificationQuestion}\n\nFor example:\n${clarificationOptions
      .map((opt) => `• ${opt}`)
      .join('\n')}\n\nPlease specify your semester and branch so I can retrieve the exact examination datesheet.`;

    return {
      answer: clarificationAnswer,
      sources: [],
      retrievedCount: 0,
      coverage: 'CLARIFICATION',
      requestedFields: coverageReport.requestedFields,
      supportedFields: [],
      missingFields: coverageReport.requestedFields,
      clarification: {
        needed: true,
        question: clarificationQuestion,
        options: clarificationOptions,
      },
      diagnostics,
      cache: { hit: false, type: 'miss' },
    };
  }

  // Anti-hallucination check: if genuinely no relevant context found
  if (!retrievedChunks || retrievedChunks.length === 0 || coverageReport.coverage === 'INSUFFICIENT') {
    const unverifiedAnswer =
      analysis.semester && analysis.department
        ? `I couldn't verify the ${analysis.semester}th-semester ${analysis.department} mid-semester schedule from the currently indexed official documents.`
        : "I couldn't find this information in the available university documents.";

    return {
      answer: unverifiedAnswer,
      sources: [],
      retrievedCount: 0,
      coverage: 'INSUFFICIENT',
      requestedFields: coverageReport.requestedFields,
      supportedFields: [],
      missingFields: coverageReport.missingFields,
      diagnostics,
      cache: { hit: false, type: 'miss' },
    };
  }

  // Grounded LLM generation with coverage guidance (Full or Partial)
  console.log(
    `[RAG] Generating answer with ${retrievedChunks.length} context chunk(s) [Coverage: ${coverageReport.coverage}]...`
  );
  const answer = await generateAnswer(query, retrievedChunks, { coverageReport });
  console.log('[RAG] Grounded answer generated successfully');

  // Format clean, deduplicated and grouped sources
  const sources = groupSources(retrievedChunks);

  // ----------------------------------------------------
  // STEP 4: Store Grounded Answer in Exact & Semantic Caches
  // ----------------------------------------------------
  const isAnswerNotFound =
    answer.toLowerCase().includes("couldn't find this information") ||
    answer.toLowerCase().includes('not found in the available');

  if (!isAnswerNotFound && answer && answer.trim().length > 10) {
    const cachePayload = {
      answer,
      sources,
      coverage: coverageReport.coverage,
      requestedFields: coverageReport.requestedFields,
      supportedFields: coverageReport.supportedFields,
      missingFields: coverageReport.missingFields,
    };

    // 4a. Store in Exact Cache
    await exactQueryCache.set({
      query,
      user: options.user,
      version,
      isPublic,
      response: cachePayload,
    });

    // 4b. Store in Semantic Cache (only if query is eligible)
    if (isSemanticCacheEligible(query, { isPrivate: !isPublic })) {
      await semanticCache.store({
        query,
        response: cachePayload,
        version,
      });
    }
  }

  return {
    answer,
    sources,
    retrievedCount: retrievedChunks.length,
    coverage: coverageReport.coverage,
    requestedFields: coverageReport.requestedFields,
    supportedFields: coverageReport.supportedFields,
    missingFields: coverageReport.missingFields,
    diagnostics,
    cache: {
      hit: false,
      type: 'miss',
    },
  };
};

export default {
  answerQuestion,
  groupSources,
};
