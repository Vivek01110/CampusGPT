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

  const model = process.env.EMBEDDING_MODEL || 'gemini-embedding-2';
  const dimension = parseInt(process.env.EMBEDDING_DIMENSION, 10) || 768;

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
};

/**
 * Generate embeddings for an array of texts sequentially or with controlled concurrency
 * @param {string[]} texts - Array of chunk text strings
 * @param {number} batchSize - Concurrent batch size (default 3 to prevent API rate limits)
 * @returns {Promise<Array<number[]>>}
 */
export const generateEmbeddings = async (texts, batchSize = 3) => {
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchPromises = batch.map((txt) => generateEmbedding(txt));
    const batchEmbeddings = await Promise.all(batchPromises);
    results.push(...batchEmbeddings);

    // Minor delay between batches to respect Gemini rate quotas
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
};

export default {
  generateEmbedding,
  generateEmbeddings,
};
