/**
 * Intent Classifier - Classifies student campus inquiries and determines routing strategy (Phase 6)
 * Supported Query Types:
 * - 'rag': Policy, regulations, handbook rules, campus life
 * - 'structured': Courses, academic deadlines, official calendars
 * - 'document_search': Past examination papers (PYQs), circulars, notices
 * - 'hybrid': Queries combining structured facts (courses/programs) with regulation rules
 * - 'clarification': Ambiguous queries requiring student clarification
 */

export const INTENTS = {
  EXAM_SCHEDULE: 'exam_schedule',
  COURSE_SEARCH: 'course_search',
  DEADLINE_INQUIRY: 'deadline_inquiry',
  PREVIOUS_YEAR_PAPER_SEARCH: 'previous_year_paper_search',
  DOCUMENT_LOOKUP: 'document_lookup',
  HYBRID_INQUIRY: 'hybrid_inquiry',
  AMBIGUOUS_REGISTRATION: 'ambiguous_registration',
  AMBIGUOUS_EXAM_SCHEDULE: 'ambiguous_exam_schedule',
  POLICY_QUESTION: 'policy_question',
  GENERAL_CHAT: 'general_chat',
};

/**
 * Classify user intent and choose optimal query execution strategy
 * @param {object} analysis - Extracted entities and signals from queryAnalyzer
 * @returns {{ intent: string, queryType: string, confidence: number, clarification: object|null }}
 */
export const classifyIntent = (analysis = {}) => {
  const rawQuery = (analysis.rawQuery || '').trim();
  const lower = rawQuery.toLowerCase();

  // 1. Ambiguous Registration Check
  // Ambiguous: "when is registration?", "what is the registration deadline?", "registration deadline?", "how to register?", "registration date"
  // Unambiguous: "when is course registration?", "when is semester registration?", "when is exam registration?"
  const isGenericRegistration =
    /\b(when is|what is the last date for|when does|last date of|date for|what is the)\s+(the\s+)?registration(\s+deadline|\s+date)?\b/i.test(lower) ||
    /\bregistration\s+deadline\b/i.test(lower) ||
    /^(when is|date for|what is the)?\s*registration\s*(\?|deadline)?$/i.test(lower);

  const hasSpecificRegistrationModifier =
    /\b(course|semester|hostel|exam|examination|phd|admission|m\.tech|b\.tech)\s+registration\b/i.test(lower);

  if (isGenericRegistration && !hasSpecificRegistrationModifier) {
    return {
      intent: INTENTS.AMBIGUOUS_REGISTRATION,
      queryType: 'clarification',
      confidence: 0.95,
      clarification: {
        needed: true,
        question: 'Which registration are you asking about?',
        options: [
          'Course Registration (Autumn/Spring semester electives & subjects)',
          'Semester Academic Registration (Fee payment & enrollment)',
          'Examination Form Registration (End-semester exams)',
          'Hostel / Room Registration (Hostel allotment & mess)',
        ],
      },
    };
  }

  // 1b. Ambiguous Exam Schedule Check
  // Ambiguous: "Give me the mid exam schedule.", "mid exam schedule", "exam schedule", "when is mid sem exam?"
  // Unambiguous: "Give me the mid exam schedule for 7th sem CSE", "CS302 exam schedule"
  const isGenericExamSchedule =
    (/\b(mid exam|mid semester exam|end exam|end semester exam|exam schedule|midsem schedule|datesheet)\b/i.test(lower) ||
      (/\b(mid|end)\s+(exam|semester)\b/i.test(lower) && /\b(schedule|datesheet|dates|when)\b/i.test(lower))) &&
    !analysis.semester &&
    !analysis.department &&
    !analysis.program &&
    !analysis.courseCode;

  if (isGenericExamSchedule) {
    return {
      intent: INTENTS.AMBIGUOUS_EXAM_SCHEDULE,
      queryType: 'clarification',
      confidence: 0.95,
      clarification: {
        needed: true,
        question: 'Which programme and semester are you asking about?',
        options: [
          '7th semester CSE',
          '5th semester CSE',
          '7th semester ECE',
          '3rd semester Mechanical',
        ],
      },
    };
  }

  // 2. Previous Year Paper Search
  const isPastPaperQuery =
    /\b(previous year|past paper|question paper|past year paper|old paper|pyq|pyqs|exam paper)\b/i.test(lower) ||
    analysis.documentType === 'question_paper' ||
    analysis.documentType === 'previous_year_paper';

  if (isPastPaperQuery) {
    return {
      intent: INTENTS.PREVIOUS_YEAR_PAPER_SEARCH,
      queryType: 'document_search',
      confidence: 0.92,
      clarification: null,
    };
  }

  // 3. Document / Circular Discovery
  const isDocumentLookupQuery =
    /\b(which documents|find documents|show documents|list documents|official notice|circulars|all notices|show circular)\b/i.test(lower) ||
    (analysis.documentType && /\b(find|show|list|get)\b/i.test(lower) && !isPastPaperQuery);

  if (isDocumentLookupQuery) {
    return {
      intent: INTENTS.DOCUMENT_LOOKUP,
      queryType: 'document_search',
      confidence: 0.88,
      clarification: null,
    };
  }

  const isExamScheduleQuery =
    Boolean(analysis.examType) ||
    /\b(mid exam|end exam|midsem|datesheet|exam schedule|mid semester exam|end semester exam|examination schedule)\b/i.test(lower);

  if (isExamScheduleQuery) {
    return {
      intent: INTENTS.EXAM_SCHEDULE,
      queryType: 'rag',
      confidence: 0.95,
      clarification: null,
    };
  }

  // 4. Course Catalog / Structured Course Search
  // Triggers: "Find machine learning courses", "Show CSE courses in 6th semester", "Which courses are related to databases?"
  const isCourseSearchQuery =
    !isExamScheduleQuery &&
    ((/\b(courses|course|electives|elective|subjects|subject|syllabus)\b/i.test(lower) &&
      (/\b(find|show|list|which|available|recommend|related to|in semester|in sem)\b/i.test(lower) ||
        analysis.semester ||
        analysis.courseCode)) ||
    /\b(courses in|courses for|subjects for|syllabus of)\b/i.test(lower));

  // Check if query is HYBRID: contains course/subject AND asks about policy/regulations
  // e.g. "Is attendance below 75% allowed for B.Tech CSE students?", "What are passing criteria for DBMS CS301?"
  const hasPolicySignal =
    /\b(attendance|condonation|debarred|passing criteria|minimum marks|regulation|rule|clause|policy|medical leave|hostel|curfew)\b/i.test(lower);

  const hasStructuredSignal =
    analysis.courseCode ||
    analysis.semester ||
    (analysis.program && analysis.department) ||
    (isCourseSearchQuery && hasPolicySignal);

  if (hasStructuredSignal && hasPolicySignal) {
    return {
      intent: INTENTS.HYBRID_INQUIRY,
      queryType: 'hybrid',
      confidence: 0.90,
      clarification: null,
    };
  }

  if (isCourseSearchQuery && !hasPolicySignal) {
    return {
      intent: INTENTS.COURSE_SEARCH,
      queryType: 'structured',
      confidence: 0.92,
      clarification: null,
    };
  }

  // 5. Academic Deadlines & Dates
  // Triggers: "What are the upcoming academic deadlines?", "When is the last date for registration?", "exam schedule"
  const isDeadlineQuery =
    /\b(deadlines|deadline|last date|due date|submission date|start date|end date|schedule|academic calendar|datesheet)\b/i.test(lower) ||
    (/\b(when is|what is the date)\b/i.test(lower) && /\b(registration|exam|examination|submission|convocation|fee|payment)\b/i.test(lower));

  if (isDeadlineQuery) {
    return {
      intent: INTENTS.DEADLINE_INQUIRY,
      queryType: 'structured',
      confidence: 0.91,
      clarification: null,
    };
  }

  // 6. Default: General Policy RAG
  // Triggers: "What is the minimum attendance requirement?", "Hostel rules", "Regulation 4.2.3"
  return {
    intent: INTENTS.POLICY_QUESTION,
    queryType: 'rag',
    confidence: 0.85,
    clarification: null,
  };
};

export default {
  INTENTS,
  classifyIntent,
};
