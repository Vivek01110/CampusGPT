/**
 * Text Cleaner utility for PDF extractions
 * Preserves semantic structure while removing extraction artifacts and noise
 */

/**
 * Clean and normalize text extracted from documents
 * @param {string} rawText
 * @returns {string} Cleaned text
 */
export const cleanText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }

  let cleaned = rawText;

  // Replace carriage returns with standard newlines
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Fix hyphenated words broken across line breaks (e.g., "regula-\ntion" -> "regulation")
  cleaned = cleaned.replace(/(\w+)-\n(\w+)/g, '$1$2');

  // Remove common non-printable / control characters (preserve tabs and newlines)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Normalize excessive horizontal spaces and tabs into single spaces
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // Normalize 3 or more consecutive newlines into double newlines (paragraphs)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim leading/trailing whitespace on every line
  cleaned = cleaned
    .split('\n')
    .map((line) => line.trim())
    .join('\n');

  return cleaned.trim();
};

export default {
  cleanText,
};
