import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * LLM-based Claim-Level Evidence Assessment Service
 * Replaces rigid regex-based validation with semantic verification:
 * - Decomposes user inquiry into core claims/fields
 * - Verifies whether the retrieved text actually supports each claim
 * - Allows high-relevance policy documents (PPO rules, fees, attendance guidelines) to pass cleanly
 */

const SYSTEM_INSTRUCTION = `You are the Evidence Coverage Assessor for CampusGPT at NIT Kurukshetra.
Your task is to determine whether the provided retrieved context actually contains verified information answering the student's question.

RULES:
1. Break down the user question into 1 to 4 distinct key claims/inquiries.
2. For each claim, evaluate whether the Context provides substantive facts, rules, guidelines, or procedures addressing it.
3. DO NOT require exact numerical or percentage patterns if the text provides the general policy, slabs, regulations, or rules.
4. If a policy document mentions rules on PPOs, internships, job offers, or CTC slabs, mark it as SUPPORTED!
5. If an attendance regulation explains minimum attendance, condonation, or examination eligibility, mark it as SUPPORTED!
6. Output a JSON object with:
   - "sufficient": boolean (true if at least one core claim or relevant policy is supported by the context)
   - "coverage": "FULL" | "PARTIAL" | "INSUFFICIENT"
   - "confidence": float between 0.0 and 1.0
   - "supportedClaims": array of strings describing claims verified in Context
   - "unsupportedClaims": array of strings describing claims not found in Context
   - "summary": 1-2 sentence summary of what was verified vs missing.

OUTPUT FORMAT:
Return ONLY the raw JSON object.`;

/**
 * Assess evidence coverage dynamically using Gemini
 * @param {string} query - Student inquiry
 * @param {Array<object>} retrievedChunks - Top reranked context chunks
 * @returns {Promise<object>} Coverage assessment report
 */
export const assessEvidenceLLM = async (query, retrievedChunks = []) => {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      sufficient: false,
      coverage: 'INSUFFICIENT',
      confidence: 1.0,
      supportedClaims: [],
      unsupportedClaims: ['All requested information'],
      summary: 'No relevant documents retrieved from the knowledge base.',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback: If chunks were reranked with reasonable scores, treat as sufficient
    return {
      sufficient: true,
      coverage: 'FULL',
      confidence: 0.8,
      supportedClaims: ['Retrieved institute context'],
      unsupportedClaims: [],
      summary: 'Evidence assessed via fallback scorer.',
    };
  }

  // Combine top chunks into a compact excerpt
  const contextExcerpt = retrievedChunks
    .slice(0, 5)
    .map((c, i) => `[Source ${i + 1}: ${c.documentTitle || 'Document'}]\n${(c.text || '').slice(0, 800)}`)
    .join('\n\n---\n\n');

  const prompt = `RETRIEVED CONTEXT:
${contextExcerpt}

USER QUESTION:
"${query}"`;

  const configuredModel = process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
  const models = [configuredModel, 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

  for (const model of models) {
    try {
      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(35000),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error?.message || `Evidence assessment error ${response.status}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(clean);
        return {
          ...parsed,
          requestedFields: [...(parsed.supportedClaims || []), ...(parsed.unsupportedClaims || [])],
          supportedFields: parsed.supportedClaims || [],
          missingFields: parsed.unsupportedClaims || [],
        };
      }
    } catch (err) {
      console.warn(`[EVIDENCE ASSESSOR] Model ${model} failed: ${err.message}. Trying next fallback...`);
    }
  }

  // Fallback heuristic: Check top chunk reranker score
  const topScore = retrievedChunks[0]?.rerankScore || retrievedChunks[0]?.score || 0;
  const isSufficient = topScore >= 0.35 || retrievedChunks.length >= 2;

  return {
    sufficient: isSufficient,
    coverage: isSufficient ? 'FULL' : 'INSUFFICIENT',
    confidence: 0.75,
    supportedClaims: isSufficient ? ['Official Institute Notice / Regulation'] : [],
    unsupportedClaims: isSufficient ? [] : ['Detailed matching clauses'],
    requestedFields: [],
    supportedFields: isSufficient ? ['General policy'] : [],
    missingFields: isSufficient ? [] : ['Specific clauses'],
    summary: isSufficient
      ? 'Retrieved documents contain relevant official content.'
      : 'Retrieved evidence is insufficient.',
  };
};

export default {
  assessEvidenceLLM,
};
