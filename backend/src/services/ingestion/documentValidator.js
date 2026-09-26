import fs from 'fs';
import path from 'path';

const MAX_SIZE_MB = parseInt(process.env.MAX_DOCUMENT_SIZE_MB || '25', 10);
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;

export const getMaxPdfPages = () => parseInt(process.env.MAX_PDF_PAGES || '200', 10);

/**
 * Validate that PDF page count does not exceed configured maximum page limit
 * @param {number} totalPages 
 * @returns {{ isValid: boolean, error: string|null, totalPages: number, maxPages: number }}
 */
export const validatePdfPageCount = (totalPages) => {
  const maxPages = getMaxPdfPages();
  if (totalPages > maxPages) {
    return {
      isValid: false,
      error: `PDF exceeds configured maximum page limit of ${maxPages}. (Pages: ${totalPages}, Maximum allowed: ${maxPages})`,
      totalPages,
      maxPages,
    };
  }
  return {
    isValid: true,
    error: null,
    totalPages,
    maxPages,
  };
};

export const VALID_CATEGORIES = [
  'academics',
  'examinations',
  'hostel',
  'admissions',
  'courses',
  'placements',
  'notices',
  'scholarships',
  'other',
];

export const VALID_DOCUMENT_TYPES = [
  'regulation',
  'syllabus',
  'academic_calendar',
  'notice',
  'question_paper',
  'previous_year_paper',
  'notification',
  'timetable',
  'circular',
  'handbook',
  'policy',
  'course',
  'fee',
  'other',
];

export const VALID_SOURCE_AUTHORITIES = [
  'official',
  'department',
  'internal',
  'user_uploaded',
];

export const VALID_SOURCE_TYPES = ['upload', 'url'];

/**
 * Validate metadata fields for a document
 * @param {object} metadata 
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export const validateDocumentMetadata = (metadata = {}) => {
  const errors = [];

  if (!metadata.title || typeof metadata.title !== 'string' || !metadata.title.trim()) {
    errors.push('Document title is required and cannot be empty.');
  } else if (metadata.title.trim().length > 200) {
    errors.push('Document title cannot exceed 200 characters.');
  }

  if (metadata.category && !VALID_CATEGORIES.includes(metadata.category)) {
    errors.push(`Invalid category: "${metadata.category}". Allowed: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (metadata.documentType && !VALID_DOCUMENT_TYPES.includes(metadata.documentType)) {
    errors.push(`Invalid document type: "${metadata.documentType}". Allowed: ${VALID_DOCUMENT_TYPES.join(', ')}`);
  }

  if (metadata.sourceAuthority && !VALID_SOURCE_AUTHORITIES.includes(metadata.sourceAuthority)) {
    errors.push(`Invalid source authority: "${metadata.sourceAuthority}". Allowed: ${VALID_SOURCE_AUTHORITIES.join(', ')}`);
  }

  if (metadata.sourceType && !VALID_SOURCE_TYPES.includes(metadata.sourceType)) {
    errors.push(`Invalid source type: "${metadata.sourceType}". Allowed: ${VALID_SOURCE_TYPES.join(', ')}`);
  }

  // URL syntax validation if sourceUrl is provided
  if (metadata.sourceUrl && typeof metadata.sourceUrl === 'string' && metadata.sourceUrl.trim()) {
    try {
      const parsed = new URL(metadata.sourceUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push('Source URL must use http or https protocol.');
      }
    } catch (e) {
      errors.push('Invalid source URL format.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate physical file before ingestion
 * Checks file presence, extension, size limit, and PDF magic number
 * @param {string} filePath 
 * @returns {{ isValid: boolean, error: string|null }}
 */
export const validatePhysicalFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return { isValid: false, error: 'File does not exist on disk.' };
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf') {
    return { isValid: false, error: 'Invalid file extension. Only .pdf files are accepted.' };
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { isValid: false, error: 'The uploaded file is empty (0 bytes).' };
  }

  if (stats.size > MAX_BYTES) {
    return { isValid: false, error: `File size (${(stats.size / 1024 / 1024).toFixed(1)}MB) exceeds limit of ${MAX_SIZE_MB}MB.` };
  }

  // Inspect first 5 bytes for standard PDF magic header (%PDF-)
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(5);
    fs.readSync(fd, buffer, 0, 5, 0);
    fs.closeSync(fd);

    const header = buffer.toString('utf-8');
    if (!header.startsWith('%PDF')) {
      return { isValid: false, error: 'File header corrupt or not a valid PDF document.' };
    }
    return { isValid: true, error: null };
  } catch (err) {
    return { isValid: false, error: `Unable to read file header: ${err.message}` };
  }
};

/**
 * Validate file buffer in memory
 * @param {Buffer} buffer 
 * @param {string} fileName 
 * @param {string} mimeType 
 * @returns {{ isValid: boolean, error: string|null }}
 */
export const validateFileBuffer = (buffer, fileName = '', mimeType = '') => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { isValid: false, error: 'Invalid buffer provided.' };
  }

  const ext = path.extname(fileName).toLowerCase();
  if (ext !== '.pdf') {
    return { isValid: false, error: 'Invalid file extension. Only .pdf files are accepted.' };
  }

  if (buffer.length === 0) {
    return { isValid: false, error: 'The uploaded file is empty (0 bytes).' };
  }

  if (buffer.length > MAX_BYTES) {
    return { isValid: false, error: `File size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds limit of ${MAX_SIZE_MB}MB.` };
  }

  // Check %PDF magic header
  const header = buffer.slice(0, 5).toString('utf-8');
  if (!header.startsWith('%PDF')) {
    return { isValid: false, error: 'File header corrupt or not a valid PDF document.' };
  }

  return { isValid: true, error: null };
};

export const validateMetadata = validateDocumentMetadata;
export const validateFile = validatePhysicalFile;

export default {
  validateDocumentMetadata,
  validatePhysicalFile,
  validateFileBuffer,
  validateMetadata,
  validateFile,
  VALID_CATEGORIES,
  VALID_DOCUMENT_TYPES,
  VALID_SOURCE_AUTHORITIES,
  VALID_SOURCE_TYPES,
};
