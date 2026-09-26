/**
 * Candidate Fusion using Reciprocal Rank Fusion (RRF)
 * Combines heterogeneous retrieval scores (Vector similarity + BM25 lexical) into a unified ranking.
 * Formula: RRF_Score(d) = sum_{r in systems} [ 1 / (k + rank_r(d)) ]
 */

/**
 * Fuse vector candidates and keyword candidates using RRF
 * @param {Array<object>} vectorCandidates - Ranked candidates from vector retriever
 * @param {Array<object>} keywordCandidates - Ranked candidates from BM25 retriever
 * @param {object} options - Fusion options (k parameter)
 * @returns {Array<object>} Fused and deduplicated candidate chunks sorted by rrfScore descending
 */
export const reciprocalRankFusion = (vectorCandidates = [], keywordCandidates = [], options = {}) => {
  const k = options.k || parseInt(process.env.RAG_RRF_K, 10) || 60;

  // Map to collect candidates by unique key: documentId + chunkIndex
  const fusedMap = new Map();

  const getCandidateKey = (cand) => {
    if (cand.documentId && cand.chunkIndex !== undefined) {
      return `${cand.documentId}:${cand.chunkIndex}`;
    }
    if (cand.chunkId) {
      return cand.chunkId;
    }
    return cand.text.slice(0, 100);
  };

  // 1. Process Vector candidates
  vectorCandidates.forEach((cand, index) => {
    const rank = index + 1; // 1-based rank
    const key = getCandidateKey(cand);

    const rrfContribution = 1.0 / (k + rank);

    fusedMap.set(key, {
      ...cand,
      vectorRank: rank,
      vectorScore: cand.score,
      keywordRank: null,
      keywordScore: null,
      rrfScore: rrfContribution,
      sourcesFoundIn: ['vector'],
    });
  });

  // 2. Process Keyword candidates
  keywordCandidates.forEach((cand, index) => {
    const rank = index + 1; // 1-based rank
    const key = getCandidateKey(cand);

    const rrfContribution = 1.0 / (k + rank);

    if (fusedMap.has(key)) {
      const existing = fusedMap.get(key);
      existing.keywordRank = rank;
      existing.keywordScore = cand.score;
      existing.rrfScore += rrfContribution;
      existing.sourcesFoundIn.push('keyword');
    } else {
      fusedMap.set(key, {
        ...cand,
        vectorRank: null,
        vectorScore: null,
        keywordRank: rank,
        keywordScore: cand.score,
        rrfScore: rrfContribution,
        sourcesFoundIn: ['keyword'],
      });
    }
  });

  // 3. Convert to array and sort descending by fused rrfScore
  const fusedList = Array.from(fusedMap.values());
  fusedList.sort((a, b) => b.rrfScore - a.rrfScore);

  // Assign unified fusedRank
  return fusedList.map((item, idx) => ({
    ...item,
    fusedRank: idx + 1,
  }));
};

export default {
  reciprocalRankFusion,
};
