/**
 * University Terminology Normalization & Domain Dictionaries
 * Normalizes colloquial student terminology into standard academic phrases.
 */

export const UNIVERSITY_TERM_MAP = {
  // Mid-semester exam variants
  'mid exam': 'mid semester examination',
  'mid exams': 'mid semester examinations',
  'mid-exam': 'mid semester examination',
  'mid sem': 'mid semester examination',
  'mid-sem': 'mid semester examination',
  'midsem': 'mid semester examination',
  'mid term': 'mid semester examination',
  'mid-term': 'mid semester examination',
  'midterm': 'mid semester examination',
  'mse': 'mid semester examination',

  // End-semester exam variants
  'end exam': 'end semester examination',
  'end exams': 'end semester examinations',
  'end-exam': 'end semester examination',
  'end sem': 'end semester examination',
  'end-sem': 'end semester examination',
  'endsem': 'end semester examination',
  'end term': 'end semester examination',
  'end-term': 'end semester examination',
  'endterm': 'end semester examination',
  'ese': 'end semester examination',

  // Schedule & Timetable
  'datesheet': 'examination schedule',
  'date sheet': 'examination schedule',
  'time table': 'timetable',
  'time-table': 'timetable',

  // Semesters (colloquial abbreviations)
  '1st sem': '1st semester',
  '2nd sem': '2nd semester',
  '3rd sem': '3rd semester',
  '4th sem': '4th semester',
  '5th sem': '5th semester',
  '6th sem': '6th semester',
  '7th sem': '7th semester',
  '8th sem': '8th semester',
  'sem 1': '1st semester',
  'sem 2': '2nd semester',
  'sem 3': '3rd semester',
  'sem 4': '4th semester',
  'sem 5': '5th semester',
  'sem 6': '6th semester',
  'sem 7': '7th semester',
  'sem 8': '8th semester',
  'sem-1': '1st semester',
  'sem-2': '2nd semester',
  'sem-3': '3rd semester',
  'sem-4': '4th semester',
  'sem-5': '5th semester',
  'sem-6': '6th semester',
  'sem-7': '7th semester',
  'sem-8': '8th semester',

  // Question Papers
  'pyq': 'previous year question paper',
  'pyqs': 'previous year question papers',
  'past paper': 'previous year question paper',
  'past papers': 'previous year question papers',
};

// Roman numeral to semester number mapping
export const ROMAN_SEMESTER_MAP = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
};

export const SEMESTER_TO_ROMAN = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
  8: 'VIII',
};

/**
 * Normalize colloquial university terms in a query string
 * @param {string} rawText 
 * @returns {string} Normalized text
 */
export const normalizeUniversityTerms = (rawText = '') => {
  if (!rawText || typeof rawText !== 'string') return '';

  let normalized = rawText;

  // Replace phrases based on term dictionary (longest matches first)
  const sortedTerms = Object.keys(UNIVERSITY_TERM_MAP).sort((a, b) => b.length - a.length);
  for (const term of sortedTerms) {
    const replacement = UNIVERSITY_TERM_MAP[term];
    const regex = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    normalized = normalized.replace(regex, replacement);
  }

  // Normalize Roman numeral semester references (e.g. "semester VII" -> "7th semester")
  normalized = normalized.replace(
    /\b(?:semester|sem)\s+(i|ii|iii|iv|v|vi|vii|viii)\b/gi,
    (match, roman) => {
      const num = ROMAN_SEMESTER_MAP[roman.toLowerCase()];
      return num ? `${num}th semester` : match;
    }
  );

  return normalized;
};

/**
 * Detect Exam Type from text
 * @param {string} text 
 * @returns {'mid_semester'|'end_semester'|'practical'|'supplementary'|null}
 */
export const detectExamType = (text = '') => {
  const lower = text.toLowerCase();
  if (/\b(mid|mse|midsem|mid-sem|mid term|midterm)\b/i.test(lower)) {
    return 'mid_semester';
  }
  if (/\b(end|ese|endsem|end-sem|end term|endterm|final)\b/i.test(lower)) {
    return 'end_semester';
  }
  if (/\b(practical|viva|lab exam)\b/i.test(lower)) {
    return 'practical';
  }
  if (/\b(supplementary|reappear|backlog|re-appear|improvement)\b/i.test(lower)) {
    return 'supplementary';
  }
  return null;
};

/**
 * Extract explicitly or implicitly requested fields from student query
 * @param {string} text 
 * @returns {Array<string>} e.g. ['subject', 'date', 'time']
 */
export const extractRequestedFields = (text = '') => {
  const lower = text.toLowerCase();
  const fields = new Set();

  // Date / Schedule requested
  if (/\b(date|dates|when|day|days|schedule|datesheet|calendar|timeline|deadline|last date)\b/i.test(lower)) {
    fields.add('date');
  }

  // Time / Timing requested
  if (/\b(time|timing|timings|slot|shift|hours|duration|am|pm)\b/i.test(lower)) {
    fields.add('time');
  }

  // Subject / Course requested
  if (/\b(subject|subjects|course|courses|paper|papers|branch|topic|topics)\b/i.test(lower)) {
    fields.add('subject');
  }

  // Venue / Location requested
  if (/\b(venue|room|hall|center|centre|where|building|seat|seating)\b/i.test(lower)) {
    fields.add('venue');
  }

  // Syllabus / Curriculum requested
  if (/\b(syllabus|curriculum|units|modules|topics)\b/i.test(lower)) {
    fields.add('syllabus');
  }

  // Criteria / Eligibility / Rules requested
  if (/\b(eligibility|criteria|marks|percentage|passing|attendance|rule|rules|condonation)\b/i.test(lower)) {
    fields.add('criteria');
  }

  // If query is an exam schedule query and no specific fields named, default to date & subject
  if (fields.size === 0 && /\b(exam|examination|schedule|datesheet)\b/i.test(lower)) {
    fields.add('date');
    fields.add('subject');
  }

  return Array.from(fields);
};

/**
 * Extract Academic Year from query (e.g. "2025-26", "2024-25", "2026")
 * @param {string} text 
 * @returns {string|null}
 */
export const extractAcademicYear = (text = '') => {
  // Full Academic Year format: e.g. "2025-26", "2025-2026", "2024-25"
  const ayMatch = text.match(/\b(20[2-3][0-9])[-/–]([0-9]{2,4})\b/);
  if (ayMatch) {
    const start = ayMatch[1];
    let end = ayMatch[2];
    if (end.length === 4) end = end.slice(2);
    return `${start}-${end}`;
  }

  // Single year reference: e.g. "2025" or "2026"
  const singleYear = text.match(/\b(20[2-3][0-9])\b/);
  if (singleYear) {
    const yr = parseInt(singleYear[1], 10);
    // If year is 2025 or 2026, align with 2025-26
    if (yr === 2025 || yr === 2026) {
      return '2025-26';
    }
    return `${yr}-${(yr + 1) % 100}`;
  }

  return null;
};

export default {
  UNIVERSITY_TERM_MAP,
  ROMAN_SEMESTER_MAP,
  SEMESTER_TO_ROMAN,
  normalizeUniversityTerms,
  detectExamType,
  extractRequestedFields,
  extractAcademicYear,
};
