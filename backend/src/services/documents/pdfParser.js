import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');

/**
 * Quickly inspect total page count of a PDF without loading all page text into memory
 * 
 * @param {string|Buffer} source - Absolute file path or Buffer
 * @returns {Promise<number>} Total page count
 */
export const getPDFPageCount = async (source) => {
  let dataBuffer;
  if (Buffer.isBuffer(source)) {
    dataBuffer = source;
  } else if (typeof source === 'string') {
    if (!fs.existsSync(source)) {
      throw new Error(`PDF file not found at path: ${source}`);
    }
    dataBuffer = fs.readFileSync(source);
  } else {
    throw new Error('Invalid source provided to getPDFPageCount (expected path string or Buffer)');
  }

  // Modern class-based PDFParse (pdf-parse v2+)
  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: dataBuffer });
    try {
      if (typeof parser.getInfo === 'function') {
        const info = await parser.getInfo();
        return info.total || (info.pages && info.pages.length) || 1;
      }
      const result = await parser.getText();
      return result.total || (result.pages && result.pages.length) || 1;
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  // Fallback for function-based pdf-parse
  const parseFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
  if (typeof parseFn === 'function') {
    const data = await parseFn(dataBuffer, { max: 1 });
    return data.numpages || 1;
  }

  return 1;
};

/**
 * Extract text and page structures from a PDF file path
 * Preserves exact page numbers for citation tracking.
 * Respects configured MAX_PDF_PAGES limit without loading oversized text into memory.
 * 
 * @param {string} filePath - Absolute path to PDF file
 * @param {object} [options] - Options
 * @param {number} [options.maxPages] - Maximum allowed pages (defaults to process.env.MAX_PDF_PAGES or 200)
 * @returns {Promise<{ totalPages: number, pages: Array<{ pageNumber: number, text: string }>, fullText: string }>}
 */
export const parsePDF = async (filePath, options = {}) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found at path: ${filePath}`);
  }

  const maxAllowedPages = options.maxPages !== undefined
    ? Number(options.maxPages)
    : parseInt(process.env.MAX_PDF_PAGES || '200', 10);

  const dataBuffer = fs.readFileSync(filePath);

  // 1. Inspect page count early before heavy text extraction to prevent memory spikes
  const totalPages = await getPDFPageCount(dataBuffer);

  if (maxAllowedPages > 0 && totalPages > maxAllowedPages) {
    const err = new Error(
      `PDF exceeds configured maximum page limit of ${maxAllowedPages}. (Pages: ${totalPages}, Maximum allowed: ${maxAllowedPages})`
    );
    err.totalPages = totalPages;
    err.maxPages = maxAllowedPages;
    err.code = 'EXCEEDS_PAGE_LIMIT';
    throw err;
  }

  // 2. Extract page contents within allowed limits
  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({ data: dataBuffer });
    try {
      const result = await parser.getText();
      const detectedPages = result.total || result.pages?.length || totalPages;
      const pages = (result.pages || []).map((p, idx) => ({
        pageNumber: p.num || idx + 1,
        text: (p.text || '').trim(),
      }));

      // Avoid duplicating memory when result.text is already available
      const fullText = result.text || pages.map((p) => p.text).join('\n\n');

      return {
        totalPages: detectedPages,
        pages: pages.filter((p) => p.text.length > 0),
        fullText,
      };
    } finally {
      if (typeof parser.destroy === 'function') {
        await parser.destroy();
      }
    }
  }

  // Fallback for function-based pdf-parse
  const parseFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
  if (typeof parseFn === 'function') {
    const data = await parseFn(dataBuffer);
    const numPages = data.numpages || totalPages;
    const fullText = data.text || '';

    return {
      totalPages: numPages,
      pages: [{ pageNumber: 1, text: fullText.trim() }],
      fullText,
    };
  }

  throw new Error('Incompatible pdf-parse library version loaded');
};

export default {
  getPDFPageCount,
  parsePDF,
};
