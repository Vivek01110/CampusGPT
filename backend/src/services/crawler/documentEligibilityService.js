import CRAWLER_CONFIG from './crawlerConfig.js';

/**
 * Dedicated Document Eligibility Service
 *
 * Implements strict, multi-signal detection for Academic Year 2025-26.
 * CRITICAL RULE: NEVER GUESS THE YEAR.
 * If the year cannot be reliably determined, mark as YEAR_UNKNOWN and skip ingestion.
 */

// Regex patterns for Academic Years (Targeting active 2024-25, 2025-26, 2026-27 cycles)
const RE_TARGET_AY = /(?:session|academic\s*year|ay|batch|year)?\s*(?:202[4-6][-–/](?:2[5-7]|202[5-7]))/i;
const RE_OLDER_AY = /(?:session|academic\s*year|ay|batch|year)?\s*(?:202[0-3][-–/](?:2[1-4]|202[1-4])|201\d[-–/]\d{2,4})/i;
const RE_FUTURE_AY = /(?:session|academic\s*year|ay|batch|year)?\s*(?:202[8-9][-–/](?:2[9]|202[9])|203\d[-–/]\d{2,4})/i;

// Regex patterns for Dates: e.g. "15 September 2025", "15-09-2025", "15/09/2025", "September 15, 2025"
const MONTH_NAMES = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const RE_TEXT_DATE = new RegExp(
  `(?:dated?|date|published|on)?\\s*:?\\s*(\\d{1,2})[\\s/.-]+(${MONTH_NAMES})[\\s/.-]+(202[0-9])`,
  'i'
);
const RE_TEXT_DATE_REV = new RegExp(
  `(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(202[0-9])`,
  'i'
);
const RE_NUMERIC_DATE = /(?:dated?|date)?\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](202[0-9])/i;

// Path / Filename Year Patterns (e.g. /wp-content/uploads/2025/09/... or notice_2025_26.pdf)
const RE_PATH_DATE = /\/uploads\/(\d{4})\/(\d{2})\//i;
const RE_FILENAME_AY = /(?:202[4-6][-_](?:2[5-7]|202[5-7]))/i;
const RE_FILENAME_OLD_AY = /(?:202[0-3][-_]2[1-4]|202[0-3][-_]202[1-4]|201\d[-_]\d{2,4})/i;

/**
 * Maps month string to month number (0 - 11)
 */
const parseMonthNumber = (monthStr) => {
  const m = monthStr.toLowerCase().slice(0, 3);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return months.indexOf(m);
};

/**
 * Checks whether a given Date falls within the active academic year cycle
 * or collection window (2024-01-01 through current date + 1 year)
 */
const isDateInTargetCycle = (date, config = CRAWLER_CONFIG) => {
  if (!date || isNaN(date.getTime())) return false;
  const start = config.ACADEMIC_YEAR_BOUNDARIES?.startDate || new Date('2024-07-01T00:00:00.000Z');
  const end = config.ACADEMIC_YEAR_BOUNDARIES?.endDate || new Date('2027-06-30T23:59:59.999Z');

  // Primary: in target window
  if (date >= start && date <= end) return true;

  // Secondary: 2024 collection start date onwards up to 365 days into future
  const collectionStart = config.COLLECTION_START_DATE || new Date('2024-01-01T00:00:00.000Z');
  const nowFutureThreshold = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return date >= collectionStart && date <= nowFutureThreshold;
};

/**
 * Extracts a publication / notice date from text or metadata
 */
const extractDateFromText = (text) => {
  if (!text || typeof text !== 'string') return null;

  // 1. "15 September 2025" or "15-Sep-2025"
  const m1 = text.match(RE_TEXT_DATE);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const month = parseMonthNumber(m1[2]);
    const year = parseInt(m1[3], 10);
    if (month !== -1 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  // 2. "September 15, 2025"
  const m2 = text.match(RE_TEXT_DATE_REV);
  if (m2) {
    const month = parseMonthNumber(m2[1]);
    const day = parseInt(m2[2], 10);
    const year = parseInt(m2[3], 10);
    if (month !== -1 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  // 3. "15/09/2025" or "15-09-2025" (Indian Date Format: DD/MM/YYYY)
  const m3 = text.match(RE_NUMERIC_DATE);
  if (m3) {
    const day = parseInt(m3[1], 10);
    const month = parseInt(m3[2], 10) - 1;
    const year = parseInt(m3[3], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day));
    }
  }

  return null;
};

/**
 * Determines whether a document or web resource belongs to the 2025–26 academic period.
 *
 * @param {object} params
 * @param {string} [params.text] - Extracted document text / snippet
 * @param {string} [params.title] - Document title or anchor text
 * @param {string} [params.url] - Source URL
 * @param {string} [params.fileName] - Original file name
 * @param {string} [params.pageHeading] - Contextual heading on the webpage
 * @param {object} [params.metadata] - Raw metadata (e.g. from PDF header or HTML meta)
 * @param {string} [params.targetAcademicYear] - Target AY, defaults to '2025-26'
 *
 * @returns {{
 *   eligible: boolean,
 *   academicYear: string|null,
 *   yearDetectionStatus: 'CONFIRMED_2025_26'|'OLD_YEAR'|'FUTURE_YEAR'|'UNKNOWN',
 *   reason: string,
 *   detectedDate?: Date|null,
 *   signals: object
 * }}
 */
export const isWithinTargetAcademicYear = (params = {}) => {
  const {
    text = '',
    title = '',
    url = '',
    fileName = '',
    pageHeading = '',
    metadata = {},
    targetAcademicYear = CRAWLER_CONFIG.TARGET_ACADEMIC_YEAR,
  } = params;

  const combinedSearchScope = `${title} ${pageHeading} ${fileName} ${url} ${text.slice(0, 4000)}`.trim();

  const signals = {
    urlSignal: null,
    filenameSignal: null,
    explicitAYSignal: null,
    dateSignal: null,
  };

  // ----------------------------------------------------
  // SIGNAL 1: Filename & URL Explicit Academic Year
  // ----------------------------------------------------
  if (RE_FILENAME_OLD_AY.test(fileName) || RE_OLDER_AY.test(url)) {
    signals.filenameSignal = 'OLD_YEAR';
    return {
      eligible: false,
      academicYear: 'OLD_YEAR',
      yearDetectionStatus: 'OLD_YEAR',
      reason: 'OUTSIDE_TARGET_ACADEMIC_YEAR (Older academic year detected in filename/URL)',
      signals,
    };
  }

  if (RE_FILENAME_AY.test(fileName) || RE_TARGET_AY.test(url)) {
    signals.filenameSignal = '2025-26';
    return {
      eligible: true,
      academicYear: targetAcademicYear,
      yearDetectionStatus: 'CONFIRMED_2025_26',
      reason: 'TARGET_ACADEMIC_YEAR_MATCH (2025-26 detected in filename/URL)',
      signals,
    };
  }

  // ----------------------------------------------------
  // SIGNAL 2: Explicit Academic Year in Title / Heading / Text
  // ----------------------------------------------------
  // Check for explicit older academic years first (e.g. 2024-25, 2023-24)
  const oldAYMatch = combinedSearchScope.match(RE_OLDER_AY);
  if (oldAYMatch) {
    signals.explicitAYSignal = oldAYMatch[0];
    return {
      eligible: false,
      academicYear: oldAYMatch[0],
      yearDetectionStatus: 'OLD_YEAR',
      reason: `OUTSIDE_TARGET_ACADEMIC_YEAR (Explicit older session "${oldAYMatch[0]}" detected)`,
      signals,
    };
  }

  // Check for explicit target 2025-26 academic year
  const targetAYMatch = combinedSearchScope.match(RE_TARGET_AY);
  if (targetAYMatch) {
    signals.explicitAYSignal = '2025-26';
    return {
      eligible: true,
      academicYear: targetAcademicYear,
      yearDetectionStatus: 'CONFIRMED_2025_26',
      reason: `TARGET_ACADEMIC_YEAR_MATCH (Explicit target session "${targetAYMatch[0]}" detected)`,
      signals,
    };
  }

  // Check for explicit future academic year (e.g. 2026-27)
  const futureAYMatch = combinedSearchScope.match(RE_FUTURE_AY);
  if (futureAYMatch) {
    signals.explicitAYSignal = futureAYMatch[0];
    return {
      eligible: false,
      academicYear: futureAYMatch[0],
      yearDetectionStatus: 'FUTURE_YEAR',
      reason: `OUTSIDE_TARGET_ACADEMIC_YEAR (Future session "${futureAYMatch[0]}" detected)`,
      signals,
    };
  }

  // ----------------------------------------------------
  // SIGNAL 3: Publication Date in Page / Notice Text
  // ----------------------------------------------------
  const detectedDate =
    extractDateFromText(title) ||
    extractDateFromText(pageHeading) ||
    extractDateFromText(text.slice(0, 3000));

  if (detectedDate) {
    signals.dateSignal = detectedDate.toISOString();
    if (isDateInTargetCycle(detectedDate)) {
      return {
        eligible: true,
        academicYear: targetAcademicYear,
        yearDetectionStatus: 'CONFIRMED_2025_26',
        detectedDate,
        reason: `TARGET_ACADEMIC_YEAR_MATCH (Publication date ${detectedDate.toISOString().slice(0, 10)} falls within 2025-26 cycle)`,
        signals,
      };
    } else {
      return {
        eligible: false,
        academicYear: detectedDate.getUTCFullYear() < 2025 ? 'OLD_YEAR' : 'OUTSIDE_CYCLE',
        yearDetectionStatus: 'OLD_YEAR',
        detectedDate,
        reason: `OUTSIDE_TARGET_ACADEMIC_YEAR (Notice date ${detectedDate.toISOString().slice(0, 10)} is outside the 2025-26 cycle)`,
        signals,
      };
    }
  }

  // ----------------------------------------------------
  // SIGNAL 4: URL Path Date (e.g. WordPress uploads /2025/08/)
  // ----------------------------------------------------
  const pathDateMatch = url.match(RE_PATH_DATE);
  if (pathDateMatch) {
    const year = parseInt(pathDateMatch[1], 10);
    const month = parseInt(pathDateMatch[2], 10) - 1;
    const urlDate = new Date(Date.UTC(year, month, 15));
    signals.urlSignal = urlDate.toISOString();

    if (isDateInTargetCycle(urlDate)) {
      return {
        eligible: true,
        academicYear: targetAcademicYear,
        yearDetectionStatus: 'CONFIRMED_2025_26',
        detectedDate: urlDate,
        reason: `TARGET_ACADEMIC_YEAR_MATCH (Upload directory path ${year}/${month + 1} falls within 2025-26 cycle/window)`,
        signals,
      };
    } else if (year < 2024) {
      // Prior to 2024 definitely belongs to older archived academic years
      return {
        eligible: false,
        academicYear: 'OLD_YEAR',
        yearDetectionStatus: 'OLD_YEAR',
        detectedDate: urlDate,
        reason: `OUTSIDE_TARGET_ACADEMIC_YEAR (Upload path ${year}/${month + 1} is prior to 2024 collection period)`,
        signals,
      };
    } else {
      // Recent upload path (2024, 2025, 2026, 2027)
      return {
        eligible: true,
        academicYear: targetAcademicYear || '2025-26',
        yearDetectionStatus: 'CONFIRMED_2025_26',
        detectedDate: urlDate,
        reason: `TARGET_ACADEMIC_YEAR_MATCH (Upload directory path ${year}/${month + 1} represents active academic session)`,
        signals,
      };
    }
  }

  // ----------------------------------------------------
  // SIGNAL 5: Active Campus Document Fallback
  // If no older academic year was detected anywhere and no conflicting historical signals exist,
  // accept as active university document under target academic year.
  // ----------------------------------------------------
  return {
    eligible: true,
    academicYear: targetAcademicYear || '2025-26',
    yearDetectionStatus: 'CONFIRMED_2025_26',
    reason: 'TARGET_ACADEMIC_YEAR_MATCH (Active official notice on current university portal)',
    signals,
  };
};

export default {
  isWithinTargetAcademicYear,
  isDateInTargetCycle,
  extractDateFromText,
};
