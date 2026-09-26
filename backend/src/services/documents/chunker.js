import { cleanText } from './textCleaner.js';

/**
 * Split text into semantic chunks with sentence preservation and overlap
 * 
 * Target size: ~1800 characters (~450-600 tokens)
 * Overlap: ~350 characters (~80-120 tokens)
 */
const DEFAULT_CHUNK_SIZE = 1800;
const DEFAULT_CHUNK_OVERLAP = 350;

/**
 * Split a single block of text into overlapping sentence-aware chunks
 * @param {string} text 
 * @param {number} pageNumber 
 * @param {number} startingChunkIndex 
 * @param {number} chunkSize 
 * @param {number} chunkOverlap 
 * @returns {Array<{ chunkIndex: number, pageNumber: number, text: string }>}
 */
export const chunkTextBlock = (
  text,
  pageNumber = 1,
  startingChunkIndex = 0,
  chunkSize = DEFAULT_CHUNK_SIZE,
  chunkOverlap = DEFAULT_CHUNK_OVERLAP
) => {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  if (cleaned.length <= chunkSize) {
    return [
      {
        chunkIndex: startingChunkIndex,
        pageNumber,
        text: cleaned,
      },
    ];
  }

  // Split into paragraphs or sentences
  const sentences = cleaned.match(/[^.!?\n]+[.!?\n]+/g) || [cleaned];
  const chunks = [];
  let currentChunk = '';
  let currentIndex = startingChunkIndex;

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        chunkIndex: currentIndex++,
        pageNumber,
        text: currentChunk.trim(),
      });

      // Maintain overlap by retaining the trailing portion of the previous chunk
      const overlapText = currentChunk.slice(-chunkOverlap);
      currentChunk = overlapText + ' ' + trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      chunkIndex: currentIndex++,
      pageNumber,
      text: currentChunk.trim(),
    });
  }

  return chunks;
};

/**
 * Chunk a multi-page document while preserving page attribution
 * @param {Array<{ pageNumber: number, text: string }>} pages 
 * @param {object} options 
 * @returns {Array<{ chunkIndex: number, pageNumber: number, text: string }>}
 */
export const chunkDocumentPages = (pages, options = {}) => {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;

  const allChunks = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageChunks = chunkTextBlock(
      page.text,
      page.pageNumber,
      globalChunkIndex,
      chunkSize,
      chunkOverlap
    );

    for (const chunk of pageChunks) {
      allChunks.push(chunk);
      globalChunkIndex++;
    }
  }

  return allChunks;
};

export default {
  chunkTextBlock,
  chunkDocumentPages,
};
