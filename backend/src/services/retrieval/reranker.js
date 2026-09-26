import dotenv from 'dotenv';
dotenv.config();

/**
 * Local Cross-Feature Scoring Reranker
 * Evaluates semantic alignment, token coverage, exact code matches, and document recency.
 * 
 * @param {string} query - Student query
 * @param {object} chunk - Candidate chunk
 * @returns {number} Score between 0.0 and 1.0
 */
const scoreChunkLocally = (query, chunk) => {
  const qLower = query.toLowerCase();
  const textLower = chunk.text.toLowerCase();
  const titleLower = (chunk.documentTitle || '').toLowerCase();

  // Extract query keywords (ignoring small stop words)
  const qTokens = qLower
    .replace(/[^\w\s.-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (qTokens.length === 0) return chunk.rrfScore || 0.5;

  // 1. Term overlap ratio
  let matchCount = 0;
  for (const token of qTokens) {
    if (textLower.includes(token) || titleLower.includes(token)) {
      matchCount++;
    }
  }
  const overlapRatio = matchCount / qTokens.length;

  // 2. Exact phrase bonus
  let exactMatchBonus = 0;
  if (textLower.includes(qLower) || titleLower.includes(qLower)) {
    exactMatchBonus = 0.35;
  }

  // 3. Technical code match (regulation numbers like 4.2.3, course codes like CS302)
  let codeBonus = 0;
  const codes = query.match(/\b(?:[0-9]+(?:\.[0-9]+)+|[A-Za-z]{2,4}[0-9]{3})\b/g) || [];
  for (const code of codes) {
    if (textLower.includes(code.toLowerCase())) {
      codeBonus += 0.25;
    }
  }

  // 4. Source diversity bonus: if candidate was retrieved by BOTH vector and keyword
  const hybridBonus = chunk.sourcesFoundIn?.length > 1 ? 0.15 : 0.0;

  // 5. Document freshness / recency bonus (e.g. 2026 vs 2024)
  let recencyBonus = 0.0;
  if (chunk.year) {
    const currentYear = new Date().getFullYear();
    if (chunk.year >= currentYear) recencyBonus = 0.05;
  }

  // 6. Vector score contribution if present
  const vectorScoreComponent = (chunk.vectorScore || 0) * 0.2;

  const totalScore =
    overlapRatio * 0.35 +
    exactMatchBonus +
    codeBonus +
    hybridBonus +
    recencyBonus +
    vectorScoreComponent;

  // Normalize to 0.0 - 1.0 range
  return Math.min(1.0, Math.max(0.01, totalScore));
};

/**
 * Gemini LLM-based Reranker (optional provider)
 */
const rerankWithGemini = async (query, candidates) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing for gemini reranker');

  const candidatesBrief = candidates.slice(0, 15).map((c, i) => ({
    id: i,
    title: c.documentTitle,
    page: c.pageNumber,
    preview: c.text.slice(0, 250).replace(/\n/g, ' '),
  }));

  const prompt = `You are a search relevance evaluator.
Query: "${query}"

Score each candidate from 0 to 10 on how directly and accurately it answers the query.
Return ONLY a valid JSON array of objects with "id" and "score", e.g.:
[{"id": 0, "score": 9.5}, {"id": 1, "score": 4.0}]

Candidates:
${JSON.stringify(candidatesBrief, null, 2)}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.0 },
    }),
    signal: AbortSignal.timeout(6000),
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const scores = JSON.parse(text);

  const scoreMap = new Map();
  for (const item of scores) {
    scoreMap.set(item.id, (item.score || 0) / 10.0);
  }

  return candidates.map((c, i) => ({
    ...c,
    rerankScore: scoreMap.has(i) ? scoreMap.get(i) : scoreChunkLocally(query, c),
  }));
};

/**
 * Main Reranker Interface
 * Reranks candidate chunks with automatic safe fallback to RRF fused order on any error.
 * 
 * @param {string} query - Student query
 * @param {Array<object>} candidates - Hybrid candidate chunks
 * @param {object} options - Options (topK, provider)
 * @returns {Promise<Array<object>>} Top K ranked chunks with rerankScore
 */
export const rerank = async (query, candidates = [], options = {}) => {
  if (!candidates || candidates.length === 0) return [];

  const topK = options.topK || parseInt(process.env.RAG_FINAL_TOP_K, 10) || 5;
  const provider = options.provider || process.env.RERANKER_PROVIDER || 'local';

  try {
    let ranked = [];

    if (provider === 'gemini') {
      try {
        ranked = await rerankWithGemini(query, candidates);
      } catch (geminiErr) {
        console.warn(`[RERANKER Warning] Gemini reranker failed: ${geminiErr.message}. Falling back to local cross-scoring.`);
        ranked = candidates.map((c) => ({
          ...c,
          rerankScore: scoreChunkLocally(query, c),
        }));
      }
    } else {
      // Default: High-speed local cross-feature scorer
      ranked = candidates.map((c) => ({
        ...c,
        rerankScore: scoreChunkLocally(query, c),
      }));
    }

    // Sort descending by rerankScore
    ranked.sort((a, b) => b.rerankScore - a.rerankScore);

    console.log(`[RERANKER] Successfully reranked ${candidates.length} candidates -> returning top ${Math.min(topK, ranked.length)} (Provider: ${provider})`);

    return ranked.slice(0, topK);
  } catch (error) {
    console.error(`[RERANKER ERROR] Reranking pipeline failed: ${error.message}. Executing safe RRF fallback.`);
    // Fallback: Return fused candidates sliced to topK with fallback scores
    return candidates.slice(0, topK).map((c) => ({
      ...c,
      rerankScore: c.rrfScore || 0.5,
    }));
  }
};

export default {
  rerank,
};
