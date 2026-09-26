import crypto from 'crypto';
import { createRequire } from 'module';
import { isWithinTargetAcademicYear } from './documentEligibilityService.js';

// CJS interop: pdf-parse does not expose an ESM default export
const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');

/**
 * Inspects a downloaded PDF buffer to determine:
 * 1. SHA-256 content hash
 * 2. Total pages and text from first page
 * 3. 2025-26 academic year eligibility using multi-signal analysis
 *
 * @param {Buffer} pdfBuffer - Raw PDF binary buffer
 * @param {object} context - Contextual hints (url, fileName, anchorTitle, pageHeading)
 * @returns {Promise<{
 *   eligible: boolean,
 *   academicYear: string|null,
 *   yearDetectionStatus: string,
 *   reason: string,
 *   fileHash: string,
 *   fileSize: number,
 *   totalPages: number,
 *   extractedTitle: string,
 *   firstPageText: string
 * }>}
 */
export const inspectPdfBuffer = async (pdfBuffer, context = {}) => {
  const { url = '', fileName = '', anchorTitle = '', pageHeading = '' } = context;

  // 1. Compute cryptographic SHA-256 hash
  const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const fileSize = pdfBuffer.length;

  let totalPages = 1;
  let firstPageText = '';
  let metadataTitle = '';

  try {
    // Modern class-based PDFParse (pdf-parse v2+)
    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: pdfBuffer });
      try {
        const result = await parser.getText();
        totalPages = result.total || result.pages?.length || 1;
        firstPageText = result.text || (result.pages || []).slice(0, 2).map((p) => p.text || '').join('\n');
        if (result.info) metadataTitle = result.info.Title || '';
      } finally {
        if (typeof parser.destroy === 'function') await parser.destroy();
      }
    } else {
      // Fallback: legacy function-based pdf-parse
      const parseFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
      if (typeof parseFn !== 'function') throw new Error('Incompatible pdf-parse version');

      const parsed = await parseFn(pdfBuffer, { max: 2 });
      totalPages = parsed.numpages || 1;
      firstPageText = parsed.text ? parsed.text.trim() : '';
      if (parsed.info) metadataTitle = parsed.info.Title || '';
    }
  } catch (err) {
    console.warn(`[PDF INSPECTOR] Warning: Could not parse text from PDF buffer: ${err.message}`);
  }

  // Determine cleanest document title
  const cleanTitle = (anchorTitle || metadataTitle || fileName || 'NIT KKR Document')
    .replace(/\.pdf$/i, '')
    .trim();

  // 2. Evaluate Academic Year Eligibility with strict 2025-26 rules
  const eligibility = isWithinTargetAcademicYear({
    text: firstPageText,
    title: cleanTitle,
    url,
    fileName,
    pageHeading,
    metadata: { totalPages },
  });

  const maxAllowedPages = parseInt(process.env.MAX_PDF_PAGES || '200', 10);
  const exceedsPageLimit = maxAllowedPages > 0 && totalPages > maxAllowedPages;

  return {
    eligible: eligibility.eligible,
    academicYear: eligibility.academicYear,
    yearDetectionStatus: eligibility.yearDetectionStatus,
    reason: eligibility.reason,
    fileHash,
    fileSize,
    totalPages,
    exceedsPageLimit,
    maxAllowedPages,
    extractedTitle: cleanTitle,
    firstPageText: firstPageText.slice(0, 1000),
  };
};

export default {
  inspectPdfBuffer,
};
