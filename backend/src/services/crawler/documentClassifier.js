/**
 * Document Classifier & Relevance Service for NIT KKR Documents
 *
 * Classifies discovered documents into standard document types:
 * academic_notification, exam_notification, academic_calendar, scholarship, result,
 * student_notice, admission, regulation, ordinance, syllabus, timetable, registration,
 * open_elective, hostel, student_affairs, announcement, circular, research, recruitment, other.
 *
 * Also assigns knowledgeBaseScope:
 * - 'student': Relevant to academic studies, exams, registration, hostels, scholarships, events, timetables.
 * - 'administrative': Purely staff recruitment, vendor tenders, procurement, auction, store, engineer civil works.
 * - 'research': PhD dissertations, grant tenders, faculty publications.
 * - 'general': General circulars, institutional reports, holiday lists.
 */

// Classification rules mapped by keywords / regexes
const CLASSIFICATION_RULES = [
  {
    type: 'academic_calendar',
    patterns: [/academic\s*calender/i, /academic\s*calendar/i, /calendar\s*for.*session/i],
    category: 'academics',
    scope: 'student',
  },
  {
    type: 'exam_notification',
    patterns: [
      /exam-notifications/i,
      /examination/i,
      /end[-_\s]*sem(?:ester)?/i,
      /mid[-_\s]*sem(?:ester)?/i,
      /re[-_\s]*appear/i,
      /date[-_\s]*sheet/i,
      /exam\s*schedule/i,
      /cutoff/i,
      /seating\s*plan/i,
      /practical\s*exam/i,
    ],
    category: 'examinations',
    scope: 'student',
  },
  {
    type: 'result',
    patterns: [/resultnotifications/i, /result/i, /grade\s*card/i, /marksheet/i, /gazette/i, /provisional\s*result/i],
    category: 'examinations',
    scope: 'student',
  },
  {
    type: 'scholarship',
    patterns: [/scholarship/i, /fee\s*concession/i, /financial\s*aid/i, /fellowship/i, /stipend/i, /national\s*scholarship/i],
    category: 'scholarships',
    scope: 'student',
  },
  {
    type: 'registration',
    patterns: [
      /registration\s*process/i,
      /semester\s*registration/i,
      /course\s*registration/i,
      /enrollment/i,
      /subject\s*registration/i,
      /portal\s*opening/i,
    ],
    category: 'academics',
    scope: 'student',
  },
  {
    type: 'open_elective',
    patterns: [/open\s*elective/i, /elective\s*allotment/i, /program\s*elective/i, /oe[-_\s]*allotment/i],
    category: 'courses',
    scope: 'student',
  },
  {
    type: 'timetable',
    patterns: [/time[-_\s]*table/i, /class\s*schedule/i, /slot\s*system/i, /teaching\s*load/i],
    category: 'academics',
    scope: 'student',
  },
  {
    type: 'hostel',
    patterns: [/hostel/i, /mess/i, /warden/i, /chief\s*warden/i, /room\s*allotment/i, /hall\s*of\s*residence/i],
    category: 'hostel',
    scope: 'student',
  },
  {
    type: 'admission',
    patterns: [/admission/i, /seat\s*allotment/i, /counseling/i, /dasa/i, /iccr/i, /csab/i, /josaa/i, /b[-_\s]*tech\s*admission/i],
    category: 'admissions',
    scope: 'student',
  },
  {
    type: 'regulation',
    patterns: [/ordinance/i, /regulation/i, /academic\s*ordinance/i, /rules\s*and\s*regulations/i, /code\s*of\s*conduct/i],
    category: 'academics',
    scope: 'student',
  },
  {
    type: 'syllabus',
    patterns: [/curriculum/i, /syllabus/i, /scheme\s*of\s*study/i, /course\s*structure/i],
    category: 'courses',
    scope: 'student',
  },
  {
    type: 'student_affairs',
    patterns: [/student\s*council/i, /clubs/i, /fest/i, /techniche/i, /confluence/i, /sports/i, /gymkhana/i, /nss/i, /ncc/i],
    category: 'other',
    scope: 'student',
  },
  {
    type: 'recruitment',
    patterns: [
      /recruitment/i,
      /advertisement\s*for.*post/i,
      /walk[-_\s]*in[-_\s]*interview/i,
      /non[-_\s]*teaching/i,
      /faculty\s*position/i,
      /junior\s*research\s*fellow/i,
      /jrf/i,
      /srf/i,
      /project\s*assistant/i,
    ],
    category: 'other',
    scope: 'administrative',
  },
  {
    type: 'announcement',
    patterns: [/tender/i, /quotation/i, /auction/i, /procurement/i, /bid/i, /e[-_\s]*tender/i, /corrigendum/i],
    category: 'other',
    scope: 'administrative',
  },
  {
    type: 'academic_notification',
    patterns: [/academic[-_\s]*notifications/i, /academic\s*notice/i, /dean\s*academic/i, /attendance\s*relaxation/i, /detained/i],
    category: 'academics',
    scope: 'student',
  },
  {
    type: 'placement_policy',
    patterns: [/placement\s*policy/i, /internship\s*policy/i, /tpo\s*rules/i, /spc\s*policy/i],
    category: 'placements',
    scope: 'student',
  },
  {
    type: 'placement_notice',
    patterns: [/placement/i, /training\s*and\s*placement/i, /tpo/i, /job\s*offer/i, /ctc/i, /package/i, /jinf/i, /sinf/i],
    category: 'placements',
    scope: 'student',
  },
  {
    type: 'event',
    patterns: [/event/i, /workshop/i, /seminar/i, /conference/i, /hackathon/i, /fest/i, /poster/i, /competition/i],
    category: 'notices',
    scope: 'student',
  },
  {
    type: 'circular',
    patterns: [/circular/i, /notification-notices/i, /notification/i, /office\s*order/i],
    category: 'notices',
    scope: 'student',
  },
];

/**
 * Classifies document type, category, and knowledge base scope based on text, title, and URL signals
 *
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.url
 * @param {string} params.fileName
 * @param {string} [params.text]
 * @returns {{ documentType: string, category: string, knowledgeBaseScope: string }}
 */
export const classifyDocument = ({ title = '', url = '', fileName = '', text = '' }) => {
  const combined = `${title} ${fileName} ${url} ${text.slice(0, 1500)}`.toLowerCase();

  // Test against rules in priority order
  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return {
          documentType: rule.type,
          category: rule.category,
          knowledgeBaseScope: rule.scope,
        };
      }
    }
  }

  // Default fallback if undetermined
  return {
    documentType: 'other',
    category: 'academics',
    knowledgeBaseScope: 'student',
  };
};

export default {
  classifyDocument,
};
