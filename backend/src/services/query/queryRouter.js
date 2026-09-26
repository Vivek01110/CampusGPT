import { analyzeQuery } from './queryAnalyzer.js';
import { classifyIntent, INTENTS } from './intentClassifier.js';
import courseService from '../courses/courseService.js';
import academicEventService from '../events/academicEventService.js';
import documentSearchService from '../documents/documentSearchService.js';
import { answerQuestion } from '../rag/ragService.js';
import { retrieveHybridContext } from '../retrieval/hybridRetriever.js';
import { generateAnswer } from '../ai/llmService.js';

/**
 * Format structured course results into a clean, human-readable student response
 */
const formatCoursesResponse = (courses, query) => {
  if (!courses || courses.length === 0) {
    return null;
  }

  let text = `Here are the matching courses found in the university academic catalog:\n\n`;

  courses.forEach((c, idx) => {
    text += `### ${idx + 1}. **${c.code}: ${c.name}**\n`;
    text += `- **Department:** ${c.department}\n`;
    text += `- **Semester:** ${c.semester} | **Program:** ${c.program || 'B.Tech'}\n`;
    text += `- **Credits:** ${c.credits} (${c.type.toUpperCase()})\n`;
    if (c.prerequisites && c.prerequisites.length > 0) {
      text += `- **Prerequisites:** ${c.prerequisites.join(', ')}\n`;
    }
    if (c.description) {
      text += `- **Description:** ${c.description}\n`;
    }
    text += `\n`;
  });

  return text.trim();
};

/**
 * Format structured academic deadline/event results
 */
const formatEventsResponse = (events, query) => {
  if (!events || events.length === 0) {
    return null;
  }

  let text = `Here are the relevant academic dates and deadlines from the official university calendar:\n\n`;

  events.forEach((ev, idx) => {
    text += `### ${idx + 1}. **${ev.title}**\n`;
    text += `- **Category:** ${ev.eventType.replace('_', ' ').toUpperCase()}\n`;
    if (ev.registrationDeadline) {
      text += `- **Registration Deadline:** ⏰ **${new Date(ev.registrationDeadline).toLocaleDateString('en-US', { dateStyle: 'full' })}**\n`;
    }
    if (ev.startDate) {
      text += `- **Start Date:** ${new Date(ev.startDate).toLocaleDateString('en-US', { dateStyle: 'medium' })}`;
      if (ev.endDate) {
        text += ` to ${new Date(ev.endDate).toLocaleDateString('en-US', { dateStyle: 'medium' })}`;
      }
      text += `\n`;
    }
    if (ev.description) {
      text += `- **Details:** ${ev.description}\n`;
    }
    if (ev.sourceUrl) {
      text += `- **Official Notice:** [View Notice](${ev.sourceUrl})\n`;
    }
    text += `\n`;
  });

  return text.trim();
};

/**
 * Format document discovery results (e.g. Previous Year Papers or Notices)
 */
const formatDocumentSearchResponse = (docs, query, analysis) => {
  if (!docs || docs.length === 0) {
    return null;
  }

  const isPYQ = analysis.documentType === 'previous_year_paper' || analysis.documentType === 'question_paper';
  const label = isPYQ ? 'Previous-Year Examination Question Papers' : 'Official University Documents';

  let text = `Found ${docs.length} verified ${label.toLowerCase()} matching your request:\n\n`;

  docs.forEach((doc, idx) => {
    text += `### ${idx + 1}. 📄 **${doc.title}**\n`;
    text += `- **Type:** ${doc.documentType.replace(/_/g, ' ').toUpperCase()} | **Category:** ${doc.category}\n`;
    text += `- **Department:** ${doc.department}\n`;
    if (doc.year) text += `- **Academic Year:** ${doc.year}\n`;
    if (doc.courseCode) text += `- **Course Code:** ${doc.courseCode}\n`;
    if (doc.sourceUrl) text += `- **Official Source:** [Download/View Document](${doc.sourceUrl})\n`;
    text += `\n`;
  });

  return text.trim();
};

/**
 * Intelligent Query Router (Phase 6)
 * Routes incoming inquiry to optimal handler:
 * - 'clarification': Asks student for options when query is ambiguous
 * - 'structured': Fast, accurate database queries for courses or deadlines
 * - 'document_search': Metadata-driven document & PYQ discovery
 * - 'hybrid': Blends structured facts (courses/programs) + policy regulations
 * - 'rag': Deep multi-stage retrieval across indexed university regulations
 * 
 * @param {string} rawQuery - Student message
 * @param {object} user - Authenticated user context
 * @param {object} options - Retrieval & model options
 * @returns {Promise<object>} Complete response object
 */
export const routeQuery = async (rawQuery, user = null, options = {}) => {
  if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
    return {
      answer: 'Please provide a campus question.',
      queryType: 'rag',
      intent: 'empty',
      sources: [],
      structuredData: null,
      clarification: null,
      retrieval: { strategy: 'none', cached: false },
    };
  }

  const query = rawQuery.trim();

  // 1. Analyze domain signals & classify intent
  const analysis = analyzeQuery(query);
  const classification = classifyIntent(analysis);

  console.log(`[QUERY ROUTER] Query: "${query.slice(0, 50)}..." -> Intent: ${classification.intent}, Strategy: ${classification.queryType}`);

  // --------------------------------------------------------------------------
  // STRATEGY 1: Clarification
  // --------------------------------------------------------------------------
  if (classification.queryType === 'clarification') {
    return {
      answer: `${classification.clarification.question}\n\n` +
        classification.clarification.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n') +
        `\n\nPlease select an option or specify your request so I can give you the exact official information.`,
      queryType: 'clarification',
      intent: classification.intent,
      coverage: 'CLARIFICATION',
      sources: [],
      structuredData: null,
      clarification: classification.clarification,
      retrieval: { strategy: 'clarification_response', cached: false },
    };
  }

  // --------------------------------------------------------------------------
  // STRATEGY 2: Structured Course Search
  // --------------------------------------------------------------------------
  if (classification.queryType === 'structured' && classification.intent === INTENTS.COURSE_SEARCH) {
    const courseSearchTerm = analysis.subject || analysis.courseCode || analysis.searchQuery;
    const courses = await courseService.searchCourses(courseSearchTerm, {
      department: analysis.department,
      program: analysis.program,
      semester: analysis.semester,
    });

    if (courses && courses.length > 0) {
      const formattedText = formatCoursesResponse(courses, query);
      return {
        answer: formattedText,
        queryType: 'structured',
        intent: classification.intent,
        sources: [],
        structuredData: { courses },
        clarification: null,
        retrieval: { strategy: 'structured_database_search', cached: false },
      };
    }

    // Fallback: If no structured database records found, run hybrid RAG to search course syllabi/handbooks
    console.log('[QUERY ROUTER] No structured courses found in DB. Falling back to syllabus/policy RAG...');
    const ragFallback = await answerQuestion(query, { ...options, user });
    return {
      ...ragFallback,
      queryType: 'rag',
      intent: classification.intent,
      clarification: null,
      retrieval: {
        strategy: 'rag_fallback',
        cached: ragFallback.cache?.hit || false,
      },
    };
  }

  // --------------------------------------------------------------------------
  // STRATEGY 3: Structured Academic Deadlines & Dates
  // --------------------------------------------------------------------------
  if (classification.queryType === 'structured' && classification.intent === INTENTS.DEADLINE_INQUIRY) {
    const events = await academicEventService.searchEvents(analysis.searchQuery, {
      eventType: analysis.eventType,
      program: analysis.program,
      department: analysis.department,
      upcomingOnly: false,
    });

    if (events && events.length > 0) {
      const formattedDeadlines = formatEventsResponse(events, query);
      return {
        answer: formattedDeadlines,
        queryType: 'structured',
        intent: classification.intent,
        sources: [],
        structuredData: { events },
        clarification: null,
        retrieval: { strategy: 'structured_database_search', cached: false },
      };
    }

    // Fallback: search academic calendar document via RAG
    console.log('[QUERY ROUTER] No structured events found in DB. Falling back to academic calendar RAG...');
    const ragFallback = await answerQuestion(query, { ...options, user });
    return {
      ...ragFallback,
      queryType: 'rag',
      intent: classification.intent,
      clarification: null,
      retrieval: {
        strategy: 'rag_fallback',
        cached: ragFallback.cache?.hit || false,
      },
    };
  }

  // --------------------------------------------------------------------------
  // STRATEGY 4: Document Discovery & PYQ Search
  // --------------------------------------------------------------------------
  if (classification.queryType === 'document_search') {
    const docs = await documentSearchService.searchDocuments(analysis.searchQuery, {
      documentType: analysis.documentType,
      department: analysis.department,
      year: analysis.year,
      courseCode: analysis.courseCode,
      subject: analysis.subject,
    });

    if (docs && docs.length > 0) {
      const formattedDocs = formatDocumentSearchResponse(docs, query, analysis);
      const sources = docs.map((d) => ({
        documentId: d.documentId,
        title: d.title,
        category: d.category,
        department: d.department,
        documentType: d.documentType,
        year: d.year,
        sourceUrl: d.sourceUrl,
        sourceAuthority: d.sourceAuthority,
        pageDisplay: `${d.totalPages} pages`,
      }));

      return {
        answer: formattedDocs,
        queryType: 'document_search',
        intent: classification.intent,
        sources,
        structuredData: { documents: docs },
        clarification: null,
        retrieval: { strategy: 'metadata_document_search', cached: false },
      };
    }

    // If no document registry metadata matches, search text in RAG
    console.log('[QUERY ROUTER] No documents matched metadata search. Falling back to hybrid RAG...');
    const ragFallback = await answerQuestion(query, { ...options, user });
    return {
      ...ragFallback,
      queryType: 'rag',
      intent: classification.intent,
      clarification: null,
      retrieval: {
        strategy: 'rag_fallback',
        cached: ragFallback.cache?.hit || false,
      },
    };
  }

  // --------------------------------------------------------------------------
  // STRATEGY 5: Hybrid Question Handling (Structured Facts + Policy Regulations)
  // --------------------------------------------------------------------------
  if (classification.queryType === 'hybrid') {
    // 1. Fetch relevant structured course / event info
    const [courses, events] = await Promise.all([
      courseService.searchCourses(analysis.subject || analysis.courseCode || analysis.searchQuery, {
        department: analysis.department,
        program: analysis.program,
        semester: analysis.semester,
      }),
      academicEventService.searchEvents(analysis.searchQuery, {
        program: analysis.program,
        department: analysis.department,
      }),
    ]);

    // 2. Fetch grounded policy regulations via Phase 3 Hybrid RAG
    const ragContext = await retrieveHybridContext(query, {
      topK: 6,
      filters: {
        category: analysis.category || 'academics',
        department: analysis.department,
      },
    });

    const contextItems = [
      ...courses.map(c => ({
        documentTitle: `Course Catalog: ${c.code} (${c.name})`,
        pageNumber: c.semester ? `Semester ${c.semester}` : 'Catalog',
        text: `[STRUCTURED COURSE DATABASE RECORD]\nCourse Code: ${c.code}\nCourse Name: ${c.name}\nDepartment: ${c.department}\nProgram: ${c.program || 'B.Tech'}\nSemester: ${c.semester}\nCredits: ${c.credits} (${c.type.toUpperCase()})\nPrerequisites: ${(c.prerequisites || []).join(', ') || 'None'}\nDescription: ${c.description || 'N/A'}`,
      })),
      ...events.map(e => ({
        documentTitle: `Academic Calendar: ${e.title}`,
        pageNumber: 'Calendar',
        text: `[ACADEMIC CALENDAR EVENT / DEADLINE]\nTitle: ${e.title}\nCategory: ${e.eventType.toUpperCase()}\nRegistration Deadline: ${e.registrationDeadline ? new Date(e.registrationDeadline).toLocaleDateString() : 'N/A'}\nDates: ${e.startDate ? new Date(e.startDate).toLocaleDateString() : 'N/A'} to ${e.endDate ? new Date(e.endDate).toLocaleDateString() : 'N/A'}\nDetails: ${e.description || 'N/A'}`,
      })),
      ...ragContext.chunks.map(c => ({
        documentTitle: c.documentTitle,
        pageNumber: c.pageNumber,
        text: `[OFFICIAL UNIVERSITY REGULATION CLAUSE]\n${c.text}`,
      })),
    ];

    const answer = await generateAnswer(query, contextItems);

    // Group document sources
    const sources = ragContext.chunks.map(c => ({
      documentId: c.documentId,
      title: c.documentTitle,
      category: c.category,
      department: c.department,
      documentType: c.documentType,
      pageNumber: c.pageNumber,
      pageDisplay: `Page ${c.pageNumber}`,
      sourceUrl: c.sourceUrl || null,
      sourceAuthority: c.sourceAuthority || 'official',
    }));

    return {
      answer,
      queryType: 'hybrid',
      intent: classification.intent,
      sources,
      structuredData: {
        courses: courses.length > 0 ? courses : null,
        events: events.length > 0 ? events : null,
      },
      clarification: null,
      retrieval: {
        strategy: 'hybrid_structured_rag',
        retrievedChunks: ragContext.chunks.length,
        cached: false,
      },
    };
  }

  // --------------------------------------------------------------------------
  // STRATEGY 6: Default Policy RAG (Phase 4 Cached Hybrid Retrieval)
  // --------------------------------------------------------------------------
  const ragResult = await answerQuestion(query, { ...options, user });
  return {
    ...ragResult,
    queryType: 'rag',
    intent: classification.intent,
    clarification: null,
    retrieval: {
      strategy: 'hybrid_rag',
      cached: ragResult.cache?.hit || false,
    },
  };
};

export default {
  routeQuery,
};
