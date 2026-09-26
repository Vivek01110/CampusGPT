import { generateEmbedding } from '../ai/embeddingService.js';
import { searchPoints } from '../vector/qdrantService.js';

/**
 * Retrieve the most relevant document chunks from Qdrant for a user query
 * @param {string} query - Student inquiry
 * @param {object} options - Search parameters (limit, scoreThreshold)
 * @returns {Promise<Array<{ text: string, documentTitle: string, documentId: string, pageNumber: number, chunkIndex: number, score: number, sourceUrl: string }>>}
 */
export const retrieveContext = async (query, options = {}) => {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  const cleanQuery = query.trim();
  console.log(`[RAG] Query received: "${cleanQuery}"`);

  // 1. Generate embedding for user query
  const queryEmbedding = await generateEmbedding(cleanQuery);
  console.log(`[RAG] Query embedding generated successfully`);

  // 2. Perform vector similarity search in Qdrant
  const topK = options.limit || parseInt(process.env.RAG_TOP_K, 10) || 5;
  const minScore = options.scoreThreshold ?? parseFloat(process.env.RAG_MIN_SCORE || '0.45');

  const searchResults = await searchPoints(queryEmbedding, {
    limit: topK,
    scoreThreshold: minScore,
    filter: options.filter,
  });

  console.log(`[RAG] Retrieved ${searchResults.length} relevant chunk(s) (threshold: ${minScore})`);

  // 3. Extract and normalize chunk payloads
  return searchResults.map((hit) => ({
    text: hit.payload?.text || '',
    documentTitle: hit.payload?.documentTitle || 'Campus Document',
    documentId: hit.payload?.documentId || '',
    category: hit.payload?.category || '',
    department: hit.payload?.department || '',
    pageNumber: hit.payload?.pageNumber || null,
    chunkIndex: hit.payload?.chunkIndex ?? 0,
    sourceUrl: hit.payload?.sourceUrl || '',
    score: hit.score,
  }));
};

export default {
  retrieveContext,
};
