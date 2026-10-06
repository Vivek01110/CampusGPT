import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Helper to pause execution
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generate a grounded answer using Gemini LLM strictly based on retrieved context,
 * supporting multi-chunk synthesis, partial answers, and graceful clarification.
 * 
 * @param {string} question - User inquiry
 * @param {Array<{ text: string, documentTitle: string, pageNumber: number }>|string} contexts - Retrieved chunks
 * @param {object} [options] - Generation options
 * @param {object} [options.coverageReport] - Evidence coverage assessment
 * @returns {Promise<string>} Grounded answer
 */
export const generateAnswer = async (question, contexts = [], options = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  const { coverageReport = null } = options;

  // Format retrieved chunks into context string
  let contextBlock = '';
  if (typeof contexts === 'string') {
    contextBlock = contexts;
  } else if (Array.isArray(contexts) && contexts.length > 0) {
    contextBlock = contexts
      .map(
        (c, idx) =>
          `[Source ${idx + 1}: ${c.documentTitle || 'Document'} | Page ${c.pageNumber || 'N/A'}]\n${c.text}`
      )
      .join('\n\n---\n\n');
  }

  let coverageGuidance = '';
  if (coverageReport) {
    if (coverageReport.coverage === 'PARTIAL') {
      coverageGuidance = `
EVIDENCE COVERAGE STATUS: PARTIAL
MANDATORY INSTRUCTIONS:
1. Answer the user's inquiry directly using all verified facts, rules, and guidelines present in the Context.
2. DO NOT include internal system disclaimers or apologies (e.g. NEVER say "the provided context consists of excerpts", "pages 4, 5, 6", or "not the unbroken document").
3. DO NOT add a separate "What could not be verified" section or explain what query was not fulfilled. Simply provide the verified information directly.
4. DO NOT invent, assume, or extrapolate unverified dates, subjects, or numbers.
5. DO NOT reject the entire answer with "I couldn't find this information" when useful official information is present in Context.`;
    } else if (coverageReport.coverage === 'INSUFFICIENT') {
      coverageGuidance = `
EVIDENCE COVERAGE STATUS: INSUFFICIENT
1. If the user question is underspecified or ambiguous (e.g. asking for "the mid exam schedule" without mentioning semester, branch, or program), ask a concise, helpful clarification question offering specific options (e.g. "Which programme and semester are you asking about? For example: - 7th semester CSE, - 5th semester CSE, - 7th semester ECE").
2. If the user query was already specific but no matching evidence exists in the Context, state clearly: "I couldn't find verified information on this topic in the currently indexed official documents." If any related official information exists in Context, provide it as related context without fabricating.`;
    }
  }

  const systemInstruction = `You are AskCampusAi, an official AI assistant for a university campus.
Your task is to answer the student or faculty member's inquiry using ONLY the provided official context chunks below.

STRICT GROUNDING & RETRIEVAL RULES:
1. Grounding & Zero Hallucination: Base your answer EXCLUSIVELY on the provided Context. DO NOT invent or extrapolate facts, attendance requirements, course codes, deadlines, or rules from general knowledge.
2. Direct Grounded Answers: Present all verified facts, policies, rules, and guidelines found in the Context directly, clearly, and concisely. DO NOT include meta-commentary, apologies, or disclaimers about RAG chunking (e.g. NEVER mention that you only have excerpts, page numbers, or not the unbroken document). DO NOT add separate sections titled "What could not be verified" or explain what query was not fulfilled. Just give the user the verified response based on what was found in the official documents.
3. Multi-Chunk Synthesis: Synthesize and combine relevant evidence across multiple chunks seamlessly (e.g., combining examination dates from one chunk with subject codes or time slots from another).
4. Accuracy & Attribution: Accurately preserve all regulation numbers (e.g. Regulation 1.1, 4.2.3), course codes (e.g. CS302, MEIC 416), dates, percentages, and monetary amounts.
5. Missing Information: If no relevant evidence exists at all, or if the question is ambiguous, follow the guidance provided below. Never guess.
6. Tone: Provide concise, professional, student-friendly answers without technical retrieval jargon (such as BM25, vectors, or RRF).
7. Formatting & Presentation (Dynamic & Content-Aware Markdown):
   - Adapt the response structure naturally to the user's inquiry, matching modern ChatGPT-quality presentation:
   - For simple, direct questions (e.g. asking for a date, venue, single rule, or short definition), give a direct, concise paragraph response without forcing artificial headings or unnecessary bullet lists.
   - For complex, multi-part, or structured topics (e.g., question papers, examination schedules, policies, syllabus outlines, regulations):
     * Use logical Markdown headings (### or ####) to separate major sections instead of raw bold text with trailing colons. Never use excessive or redundant H1/H2 headers.
     * Use short, scannable paragraphs with clean spacing between ideas.
     * Use bullet points (* or -) or numbered lists (1., 2.) only when presenting actual lists, distinct steps, or enumerated conditions.
     * Keep related content unified within its parent bullet point rather than fragmenting one thought or code fragment across multiple dangling sub-bullets.
   - Code & Algorithms: Always encapsulate code snippets, pseudo-code, algorithms, or programmatic statements in standard fenced code blocks with appropriate language tags (such as python, cpp, c, pseudocode, or text). Never break a single snippet into separate inline backtick blocks across fragmented lines.
   - Mathematics & Formulas: Always use standard LaTeX syntax: "$formula$" for inline math expressions (e.g. "$O(1)$", "$116x^4 + 4x^3$", "$N = 6$", "$n - 1$") and "$$formula$$" on separate lines for standalone block formulas or proofs.
   - Tables: Use standard Markdown tables ("| Header 1 | Header 2 |") whenever tabular data, schedules, credit breakdowns, or comparison charts are helpful.
   - Selective Bold: Use **bold** judiciously for critical terms, codes, or deadlines without overusing it.
   - Content Preservation: Preserve exact numbers, equations, technical terms, and original meaning from the source documents. Never invent facts just to satisfy formatting.
8. Source Attribution & Usage Tag:
   - Ground your answer ONLY in the sources that directly contain verified information answering the student's question.
   - At the VERY END of your response, on a final new line, write which Source numbers you actually retrieved information from:
     [USED_SOURCES: 1, 2]
   - If the provided Context does NOT contain information to answer the question, or if you could not find the requested information, state clearly that you couldn't find this information in the official documents, and write:
     [USED_SOURCES: NONE]`;

  const promptText = `CONTEXT FROM OFFICIAL UNIVERSITY DOCUMENTS:
${contextBlock || 'NO MATCHING CONTEXT FOUND.'}

${coverageGuidance}

USER QUESTION:
${question}

GROUNDED ANSWER:`;

  const configuredModel = process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
  const modelsToTry = [
    configuredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ];

  let lastError;

  for (const model of modelsToTry) {
    // Try each model with up to 2 attempts for transient 503 spikes
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

        const payload = {
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              parts: [{ text: promptText }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
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
          throw new Error(data.error?.message || `LLM generation error (${response.status})`);
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          const usedMatch = reply.match(/\[USED_SOURCES:\s*([^\]]+)\]/i);
          let usedSourceIndices = [];
          if (usedMatch) {
            const val = usedMatch[1].trim();
            if (!val.toLowerCase().includes('none')) {
              usedSourceIndices = val
                .split(',')
                .map((s) => parseInt(s.trim().replace(/[^0-9]/g, ''), 10))
                .filter((n) => !isNaN(n) && n > 0);
            }
          }
          const cleanAnswer = reply.replace(/\n*\[USED_SOURCES:[^\]]*\]/gi, '').trim();

          // Return string object with attached metadata for 100% backward compatibility
          const result = new String(cleanAnswer);
          result.answer = cleanAnswer;
          result.usedSourceIndices = usedSourceIndices;
          return result;
        }
      } catch (err) {
        lastError = err;
        // If 503 high demand spike, pause briefly before retrying
        if (err.message.includes('high demand') || err.message.includes('503')) {
          await sleep(1200);
        }
      }
    }
  }

  throw new Error(`[LLM Service Failed] ${lastError?.message || 'Unable to generate response'}`);
};

/**
 * Generate an answer for general knowledge, coding, or concept questions
 * using Gemini's general model knowledge directly (without forcing campus RAG).
 * 
 * @param {string} question - User question
 * @param {string} [systemContext] - Optional context or instruction
 * @returns {Promise<string>} Rich formatted response
 */
export const generateGeneralAnswer = async (question, systemContext = '') => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  const systemInstruction = `You are CampusGPT, an intelligent academic and technical AI assistant.
Answer the user's question clearly, accurately, and thoroughly using modern ChatGPT-style presentation.
Formatting Guidelines:
- Use clean Markdown headings (### or ####) for structured topics.
- For coding, algorithms, or technical definitions, provide well-commented code snippets in fenced code blocks.
- For mathematics or theory, use LaTeX notation ($inline$, $$block$$).
- Use bullet points or numbered steps for explanations and comparisons.
- Be concise, educational, and helpful.`;

  const configuredModel = process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
  const modelsToTry = [
    configuredModel,
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ];

  let lastError;
  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
        const payload = {
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              parts: [{ text: systemContext ? `${systemContext}\n\nQuestion: ${question}` : question }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
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
          throw new Error(data.error?.message || `LLM generation error (${response.status})`);
        }

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return reply.trim();
        }
      } catch (err) {
        lastError = err;
        if (err.message.includes('high demand') || err.message.includes('503')) {
          await sleep(1200);
        }
      }
    }
  }

  throw new Error(`[LLM General Failed] ${lastError?.message || 'Unable to generate response'}`);
};

export default {
  generateAnswer,
  generateGeneralAnswer,
};
