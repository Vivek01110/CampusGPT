import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Dynamic Query Understanding Service
 * Uses Gemini as an open-domain intent, entity, and clarification analyzer.
 * Eliminates brittle hardcoded regex/contains checks for individual queries.
 */

const SYSTEM_PROMPT = `You are the Query Understanding & Routing Engine for CampusGPT (NIT Kurukshetra's official AI assistant).
Analyze the student or user query and output a strictly valid JSON object.

YOU MUST DETERMINE:
1. "intent": An open-domain descriptive category (e.g., "PYQ_SEARCH", "ATTENDANCE_REGULATION", "EXAM_SCHEDULE", "SCHOLARSHIP_INQUIRY", "PLACEMENT_POLICY", "MINOR_DEGREE", "COURSE_CATALOG", "HOSTEL_REGULATION", "GENERAL_CONCEPT", "HYBRID_EXPLANATION", "GREETING", etc.). Do NOT restrict yourself to a fixed list.
2. "queryType": One of ["rag", "general", "hybrid", "structured", "clarification", "chat"]
   - "general": Pure conceptual/coding/knowledge question (e.g. "Explain binary search", "What is PCA?", "Who won the World Cup?"). Does NOT need NIT Kurukshetra documents.
   - "hybrid": Combines a general conceptual explanation with an institute-specific query (e.g. "Explain DBMS and tell me which DBMS course is offered at NIT Kurukshetra").
   - "rag": Needs official NIT Kurukshetra regulations, notices, circulars, syllabi, or policies.
   - "structured": Queries seeking courses, faculty catalog, or specific datesheet schedules.
   - "clarification": Incomplete queries where the answer fundamentally CANNOT be answered without missing information.
   - "chat": Simple greetings, gratitude, or identity questions.
3. "entities": Extract any explicit or implied entities:
   - subject (e.g., "DBMS", "Computer Networks", "Data Structures")
   - courseCode (e.g., "CS301", "ITOE 301")
   - branch (e.g., "CSE", "ECE", "Mechanical", "Civil", "Electrical", "IT")
   - department
   - program (e.g., "B.Tech", "M.Tech", "MCA", "MBA", "PhD")
   - degree
   - semester (integer 1-8, or null)
   - academicYear (e.g., "2025-26", "2026-27")
   - year (integer, e.g. 2025, 2026)
   - examType (e.g., "mid_semester", "end_semester", "reappear", null)
   - documentType (e.g., "question_paper", "regulation", "syllabus", "notice", "policy", null)
   - category (e.g., "academics", "examinations", "placements", "scholarships", "hostel", null)
4. "missingInformation": Array of strings of genuinely essential missing fields needed to answer.
   IMPORTANT RULES ON CLARIFICATION:
   - DO NOT request clarification for general policy/regulation questions! E.g. "What are the attendance rules at NIT Kurukshetra?" or "What is the placement policy?" or "What scholarships are available?" have institute-wide answers. Do NOT ask for semester/branch for these!
   - DO ask for clarification only when an answer is completely impossible without it. E.g. "Give me PYQs" without a subject cannot return a specific paper; asking for the subject with examples is appropriate.
5. "needsClarification": boolean (true only if essential missing information prevents ANY accurate answer).
6. "clarificationQuestion": string or null (if needsClarification is true, a polite question asking for what is missing with 3-4 realistic examples).
7. "rewrittenQuery": A search-engine friendly version of the user query with relevant institute context expanded.
8. "expandedTerms": Array of 3-5 related synonyms, acronyms, or expanded terms for BM25 and vector search (e.g., for "PPO": ["pre-placement offer", "job offer", "placement policy", "placement internship rules"]).
9. "hybridSplit": if queryType is "hybrid", an object { generalPart: string, institutePart: string }, otherwise null.
10. "confidence": float between 0.0 and 1.0.

OUTPUT FORMAT:
Return ONLY the raw JSON object. No markdown backticks, no explanatory comments.`;

/**
 * Understand user query dynamically using Gemini
 * @param {string} query - Student inquiry
 * @param {object} userContext - Resolved profile context (branch, semester, program, degree, etc.)
 * @returns {Promise<object>} Structured query understanding state
 */
export const understandQuery = async (query, userContext = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  const prompt = `CURRENT USER CONTEXT (from stored profile / conversation):
${JSON.stringify(userContext || {}, null, 2)}

STUDENT USER QUERY:
"${query}"`;

  const configuredModel = process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
  const models = [configuredModel, 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];

  for (const model of models) {
    try {
      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
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
        throw new Error(data.error?.message || `Gemini query understanding error ${response.status}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const clean = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(clean);
        return parsed;
      }
    } catch (err) {
      console.warn(`[QUERY UNDERSTANDING] Model ${model} failed: ${err.message}. Trying next fallback...`);
    }
  }

  // Graceful rule-free fallback if API fails
  return {
    intent: 'CAMPUS_INQUIRY',
    queryType: 'rag',
    entities: {},
    missingInformation: [],
    needsClarification: false,
    clarificationQuestion: null,
    rewrittenQuery: query,
    expandedTerms: [],
    hybridSplit: null,
    confidence: 0.7,
  };
};

export default {
  understandQuery,
};
