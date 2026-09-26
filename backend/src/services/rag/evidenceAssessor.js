/**
 * Evidence Coverage Assessor
 * Evaluates the grounded alignment between a student inquiry's requested fields
 * and the factual content extracted across all retrieved chunks.
 *
 * Classifies coverage as:
 * - FULL: Most/all requested fields or core topics are directly supported.
 * - PARTIAL: Some requested structured fields are supported, but some details cannot be verified.
 * - INSUFFICIENT: Retrieved evidence does not contain relevant official information.
 */

// Regex patterns to detect field evidence in retrieved text
const FIELD_DETECTORS = {
  date: [
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+[0-9]{1,2}(?:st|nd|rd|th)?(?:,?\s+202[4-7])?\b/i,
    /\b[0-9]{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+202[4-7])?\b/i,
    /\b[0-9]{1,2}(?:st|nd|rd|th)?\s+(?:to|-|–)\s+[0-9]{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|june?|july?|aug|sep|oct|nov|dec)[a-z]*(?:\s+202[4-7])?\b/i,
    /\b[0-9]{1,2}[-/][0-9]{1,2}[-/](?:20)?2[4-7]\b/,
    /\b(?:202[4-7])[-/](?:20)?2[4-7]\b/,
    /\b(?:autumn|spring)\s+(?:semester|term)\s+202[4-7]\b/i,
    /\b(?:session|ay)\s+202[4-7][-–]2[5-8]\b/i,
  ],
  time: [
    /\b[0-9]{1,2}:[0-9]{2}\s*(?:am|pm)\b/i,
    /\b[0-9]{1,2}\s*(?:am|pm)\s*(?:to|-|–)\s*[0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm)\b/i,
    /\b(?:morning|evening|afternoon)\s+(?:shift|slot|session)\b/i,
    /\b(?:shift|slot)\s+[1-4]\b/i,
    /\b[0-9]{1,2}:[0-9]{2}\s*(?:to|-|–)\s*[0-9]{1,2}:[0-9]{2}\b/,
  ],
  subject: [
    /\b[A-Za-z]{2,4}[- ]?[0-9]{3}\b/, // e.g. CS301, MEIC 416
    /\b(?:computer science|information technology|electronics|mechanical|civil|electrical|mathematics|physics|chemistry)\b/i,
    /\b(?:data structures|algorithms|operating systems|computer networks|dbms|compiler design|machine learning|artificial intelligence|deep learning|cryptography|cloud computing)\b/i,
    /\b(?:paper|subject|course|module)\s+(?:code|title|name)?:?\s*[A-Z0-9- ]+\b/i,
  ],
  venue: [
    /\b(?:room|hall|lecture hall|seminar hall|auditorium|block|complex)\s*(?:no\.?|number)?\s*[A-Z0-9-]+\b/i,
    /\b(?:l-[0-9]+|lt-[0-9]+|cr-[0-9]+|audi|hall-[0-9]+)\b/i,
  ],
  criteria: [
    /\b(?:minimum|at least)\s+[0-9]{1,2}%\b/i,
    /\b[0-9]{1,2}%\s+attendance\b/i,
    /\b(?:passing|eligibility|condonation|debarred|attendance|grade point|cgpa|sgpa)\b/i,
  ],
  syllabus: [
    /\b(?:unit|module)\s+[1-5]\b/i,
    /\b(?:course outline|curriculum|prerequisite|topics covered|credits)\b/i,
  ],
  fee: [
    /\b(?:tuition|hostel|mess|examination|registration|semester|security|admission|caution)\s+fee[s]?\b/i,
    /\bfee\s+(?:structure|receipt|payment|amount|due|concession|waiver)\b/i,
    /\brs\.?\s*[0-9]+(?:,[0-9]+)?\b/i,
    /\binr\s*[0-9]+(?:,[0-9]+)?\b/i,
  ],
};

// Conversational qualifiers and meta-words that should NEVER be treated as requested fields or unverified missing fields
const META_QUALIFIERS = new Set([
  'what', 'is', 'the', 'a', 'an', 'for', 'of', 'in', 'on', 'at', 'to', 'how', 'can', 'i', 'do',
  'does', 'university', 'campus', 'college', 'student', 'students', 'about', 'tell', 'me', 'give',
  'show', 'find', 'any', 'are', 'was', 'were', 'been', 'with', 'by', 'from', 'get', 'need', 'want',
  'detail', 'details', 'detailed', 'policy', 'policies', 'rule', 'rules', 'guideline', 'guidelines',
  'regulation', 'regulations', 'procedure', 'procedures', 'process', 'information', 'info',
  'overview', 'summary', 'brief', 'description', 'document', 'documents', 'doc', 'docs', 'pdf',
  'page', 'pages', 'file', 'files', 'everything', 'all', 'full', 'complete', 'entire', 'whole',
  'nit', 'nitkkr', 'kurukshetra', 'please', 'regarding', 'concerning', 'related', 'which', 'some',
  'this', 'that', 'these', 'those'
]);

/**
 * Assess evidence coverage for a query across reranked chunks
 * @param {string} query - Raw student query
 * @param {object} analysis - Decomposed query signals
 * @param {Array<object>} retrievedChunks - Chunks after reranking
 * @returns {{
 *   coverage: 'FULL' | 'PARTIAL' | 'INSUFFICIENT',
 *   requestedFields: string[],
 *   supportedFields: string[],
 *   missingFields: string[],
 *   hasRelatedNotice: boolean,
 *   summary: string
 * }}
 */
export const assessEvidenceCoverage = (query = '', analysis = {}, retrievedChunks = []) => {
  if (!retrievedChunks || retrievedChunks.length === 0) {
    return {
      coverage: 'INSUFFICIENT',
      requestedFields: analysis.requestedFields || [],
      supportedFields: [],
      missingFields: analysis.requestedFields || [],
      hasRelatedNotice: false,
      summary: 'No relevant documents retrieved from the knowledge base.',
    };
  }

  // Combine top chunks into a single searchable text corpus
  const corpus = retrievedChunks
    .map((c) => `${c.documentTitle || ''} ${c.text || ''}`)
    .join('\n\n');

  // Determine requested fields (from analysis or substantive query keywords)
  const isExamOrDateQuery =
    Boolean(analysis.examType) ||
    Boolean(analysis.semester) ||
    /\b(exam|examination|schedule|datesheet|midsem|when|date|dates)\b/i.test(query);

  let requestedFields = [...(analysis.requestedFields || [])].filter((f) => !META_QUALIFIERS.has(f.toLowerCase()));
  if (requestedFields.length === 0) {
    if (isExamOrDateQuery) {
      requestedFields = ['date'];
      if (/\b(subject|course|paper)\b/i.test(query)) requestedFields.push('subject');
      if (/\b(time|timing|hours)\b/i.test(query)) requestedFields.push('time');
    } else {
      // General topic inquiry: extract substantive content words excluding meta-words and qualifiers
      const contentWords = query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !META_QUALIFIERS.has(w));

      requestedFields = contentWords.length > 0 ? contentWords.slice(0, 3) : ['policy'];
    }
  }

  const supportedFields = [];
  const missingFields = [];

  for (const field of requestedFields) {
    const patterns = FIELD_DETECTORS[field];
    let isSupported = false;
    if (patterns) {
      isSupported = patterns.some((p) => p.test(corpus));
    } else {
      // Lexical check for substantive keyword (allowing plural) in retrieved corpus
      const wordRegex = new RegExp(`\\b${field.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}s?\\b`, 'i');
      isSupported = wordRegex.test(corpus);
    }

    if (isSupported) {
      supportedFields.push(field);
    } else if (!META_QUALIFIERS.has(field.toLowerCase())) {
      missingFields.push(field);
    }
  }

  // Topic relevance validation: Extract substantive subject nouns (excluding meta-words and generic field types)
  const FIELD_TYPE_WORDS = new Set([
    'date', 'dates', 'time', 'timing', 'timings', 'fee', 'fees', 'amount', 'schedule', 'datesheet', 'venue'
  ]);

  const queryNouns = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !META_QUALIFIERS.has(w) && !FIELD_TYPE_WORDS.has(w));

  const topicMatch =
    queryNouns.length === 0 ||
    queryNouns.some((noun) => new RegExp(`\\b${noun}s?\\b`, 'i').test(corpus));

  // Entity validation: Check if semester / department match the corpus
  let entityMatch = true;
  if (analysis.semester) {
    const semRegex = new RegExp(`\\b(?:semester|sem)\\s*${analysis.semester}\\b|\\b${analysis.semester}(?:st|nd|rd|th)?\\s*(?:semester|sem)\\b`, 'i');
    if (!semRegex.test(corpus)) {
      // Check Roman representation
      const romanSem = analysis.semester === 7 ? 'vii' : analysis.semester === 8 ? 'viii' : analysis.semester === 6 ? 'vi' : analysis.semester === 5 ? 'v' : null;
      if (!romanSem || !new RegExp(`\\b(?:semester|sem)\\s+${romanSem}\\b|\\b${romanSem}\\s+(?:semester|sem)\\b`, 'i').test(corpus)) {
        entityMatch = false;
        if (!missingFields.includes('semester')) {
          missingFields.push(`semester ${analysis.semester}`);
        }
      }
    }
  }

  // Check top chunk rerank relevance
  const topScore = retrievedChunks[0]?.rerankScore || retrievedChunks[0]?.score || 0;
  const hasRelatedNotice = topScore >= 0.25 || retrievedChunks.length > 0;

  // Check if query is about exams/academics with detected fields
  const isExamOrSchedule =
    Boolean(analysis.examType) ||
    Boolean(analysis.semester) ||
    Boolean(analysis.department) ||
    requestedFields.includes('date');

  // For general queries (outside exam/schedule domain), ensure at least one substantive query term appears in corpus
  const hasSubstantiveMatch = isExamOrSchedule || topicMatch;

  let coverage = 'FULL';

  if (!hasRelatedNotice || !hasSubstantiveMatch || supportedFields.length === 0) {
    coverage = 'INSUFFICIENT';
    supportedFields.length = 0;
    missingFields.splice(0, missingFields.length, ...requestedFields);
  } else if (isExamOrSchedule && (missingFields.length > 0 || !entityMatch)) {
    coverage = 'PARTIAL';
  } else if (!isExamOrSchedule && missingFields.length > 0 && supportedFields.length === 0) {
    coverage = 'INSUFFICIENT';
  } else {
    coverage = 'FULL';
  }

  // Build diagnostic summary for LLM prompt
  let summary = '';
  if (coverage === 'FULL') {
    summary = `Retrieved evidence fully covers the requested topic (${supportedFields.join(', ')}).`;
  } else if (coverage === 'PARTIAL') {
    summary = `Retrieved evidence partially covers requested fields. Verified fields: [${supportedFields.join(', ')}]. Missing/unverified fields: [${missingFields.join(', ')}].`;
  } else {
    summary = `Retrieved evidence is insufficient to verify the requested information.`;
  }

  return {
    coverage,
    requestedFields,
    supportedFields,
    missingFields,
    hasRelatedNotice,
    summary,
  };
};

export default {
  assessEvidenceCoverage,
};
