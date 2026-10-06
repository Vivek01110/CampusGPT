import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Generate embedding for a single text using Gemini API
 * @param {string} text - Input text string
 * @returns {Promise<number[]>} Vector array of numbers
 */
export const generateEmbedding = async (text) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  const configuredModel = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';
  const dimension = parseInt(process.env.EMBEDDING_DIMENSION, 10) || 768;
  const modelsToTry = [configuredModel, 'text-embedding-004'];

  let lastError;
  for (const model of modelsToTry) {
    try {
      const url = `${GEMINI_API_BASE}/models/${model}:embedContent?key=${apiKey}`;

      const payload = {
        content: {
          parts: [{ text: text.slice(0, 8000) }], // Safeguard token limit
        },
        outputDimensionality: dimension,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const errorMsg = data.error?.message || `Embedding API error (${response.status})`;
        throw new Error(`[Gemini Embedding Error] ${errorMsg}`);
      }

      if (!data.embedding?.values) {
        throw new Error('[Gemini Embedding Error] No embedding values returned');
      }

      return data.embedding.values;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
};

/**
 * Generate embeddings for an array of texts using Gemini batchEmbedContents API
 * Dramatically accelerates processing by sending up to 50 texts in a single HTTP request.
 * @param {string[]} texts - Array of chunk text strings
 * @param {number} batchSize - Concurrent batch size (default 50)
 * @returns {Promise<Array<number[]>>}
 */
export const generateEmbeddings = async (texts, batchSize = 50) => {
  if (!texts || texts.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  const model = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';
  const dimension = parseInt(process.env.EMBEDDING_DIMENSION, 10) || 768;
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const url = `${GEMINI_API_BASE}/models/${model}:batchEmbedContents?key=${apiKey}`;
      const payload = {
        requests: batch.map((txt) => ({
          model: `models/${model}`,
          content: {
            parts: [{ text: (txt || '').slice(0, 8000) }],
          },
          outputDimensionality: dimension,
        })),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok && Array.isArray(data.embeddings)) {
        for (let j = 0; j < data.embeddings.length; j++) {
          const emb = data.embeddings[j];
          if (emb?.values) {
            results.push(emb.values);
          } else {
            throw new Error(`Embedding index ${j} missing values`);
          }
        }
      } else {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }
    } catch (batchErr) {
      console.warn(`[Gemini Batch Embedding Warning] ${batchErr.message}. Falling back to sequential embedding for this batch.`);
      for (const txt of batch) {
        const single = await generateEmbedding(txt);
        results.push(single);
      }
    }

    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return results;
};

export default {
  generateEmbedding,
  generateEmbeddings,
};
