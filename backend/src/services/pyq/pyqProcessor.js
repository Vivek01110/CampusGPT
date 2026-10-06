import crypto from 'crypto';
import { createRequire } from 'module';
import PyqDocument from '../../models/PyqDocument.js';
import CrawlUrl from '../../models/CrawlUrl.js';
import { generateEmbeddings } from '../ai/embeddingService.js';
import { upsertPoints } from '../vector/qdrantService.js';

const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');

// Candidate Gemini models with automatic fallback
const GEMINI_MODELS = [
  process.env.LLM_MODEL || 'gemini-3.5-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
];

/**
 * Extract native text and page breakdown from a PDF Buffer
 * @param {Buffer} buffer
 * @returns {Promise<{ totalPages: number, pages: Array<{ pageNumber: number, text: string }>, fullText: string, isScanned: boolean }>}
 */
export const extractPdfTextFromBuffer = async (buffer) => {
  let totalPages = 1;
  let pages = [];
  let fullText = '';

  try {
    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: buffer });
      try {
        const res = await parser.getText();
        totalPages = res.total || (res.pages && res.pages.length) || 1;
        pages = (res.pages || []).map((p, idx) => ({
          pageNumber: p.num || idx + 1,
          text: (p.text || '').trim(),
        }));
        fullText = res.text || pages.map((p) => p.text).join('\n\n');
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    } else {
      const parseFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
      if (typeof parseFn === 'function') {
        const res = await parseFn(buffer);
        totalPages = res.numpages || 1;
        fullText = (res.text || '').trim();
        pages = [{ pageNumber: 1, text: fullText }];
      }
    }
  } catch (err) {
    console.warn(`[PDF PARSE] Native text extraction error: ${err.message}`);
    fullText = '';
    totalPages = 1;
    pages = [];
  }

  return { totalPages, pages, fullText };
};

/**
 * PDF Classification: Determine if PDF has sufficient native machine-readable text
 * or if it is a photograph/scan requiring Gemini Document/Vision OCR.
 *
 * @param {Buffer} buffer
 * @param {object} nativeParseResult
 * @returns {{ extractionMethod: 'native_text' | 'vision', meaningfulChars: number, charsPerPage: number, isScanned: boolean }}
 */
export const classifyPdf = (buffer, nativeParseResult) => {
  const minCharsPerPage = parseInt(process.env.PYQ_MIN_TEXT_CHARS_PER_PAGE || '180', 10);
  const totalPages = Math.max(nativeParseResult?.totalPages || 1, 1);
  const rawText = (nativeParseResult?.fullText || '').trim();

  // Strip standard PDF page markers (e.g. "-- 1 of 1 --") and whitespace
  const cleaned = rawText
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const meaningfulChars = cleaned.replace(/[^a-zA-Z0-9]/g, '').length;
  const charsPerPage = meaningfulChars / totalPages;

  // If total meaningful characters is < 50 or below threshold per page, classify as vision
  const isScanned = meaningfulChars < 50 || charsPerPage < minCharsPerPage;

  return {
    extractionMethod: isScanned ? 'vision' : 'native_text',
    meaningfulChars,
    charsPerPage,
    isScanned,
  };
};

/**
 * Gemini Document/Vision OCR for Scanned / Image-Only Examination PDFs
 * Reads visible printed text, extracts metadata and segments into questions & subquestions.
 *
 * @param {Buffer} buffer - PDF binary buffer
 * @param {object} folderMetadata - Hints from Drive hierarchy
 * @returns {Promise<{ metadata: object, questions: Array<object> }>}
 */
export const extractPyqFromScannedPdf = async (buffer, folderMetadata = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for scanned PDF vision extraction');
  }

  const base64Pdf = buffer.toString('base64');

  const prompt = `You are extracting a university examination question paper.

Extract ONLY the textual content required to search and retrieve individual examination questions.
The input may be a scanned or photographed examination paper.
Read the visible printed text carefully.

Return:
- exam metadata when clearly visible
- individual questions
- subquestions

DO NOT describe diagrams, graphs, figures, tables, images, or other visual objects.
If a question refers to a visual element, preserve the textual reference exactly.
For example: 'Find the parametric equation ... as shown in the figure.' must remain as text.
Do not replace it with a description of the figure.
Do not invent missing words. If text is genuinely unreadable, use [unclear] rather than guessing.

Preserve:
- mathematical expressions
- numbers
- units
- symbols
- variables
- question numbering
- subquestion numbering (e.g. 5(a), 5(b), Q1(a))

Folder Hierarchy Hints (use only if not clearly printed on paper):
- Inferred Year: ${folderMetadata.year || 'unknown'}
- Inferred Program: ${folderMetadata.program || 'B.Tech'}
- Inferred Branch: ${folderMetadata.branch || 'unknown'}
- Inferred Semester: ${folderMetadata.semester || 'unknown'}

Return ONLY valid JSON matching this exact structure:
{
  "metadata": {
    "institution": "NIT Kurukshetra or stated institute",
    "examDate": "Dec-2024 or stated date",
    "year": 2024,
    "program": "B.Tech or M.Tech or MCA",
    "branch": "Computer Engineering or Machine Design",
    "semester": "1 or 7 or 1st",
    "subject": "Computer Aided Design",
    "courseCode": "MME1CO3 or CO401",
    "examType": "END_SEM or MID_SEM or THEORY EXAMINATION",
    "maximumMarks": "50",
    "duration": "3 hours"
  },
  "questions": [
    {
      "questionNumber": "1",
      "questionText": "exact question text",
      "pageNumbers": [1]
    }
  ]
}`;

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      const data = await res.json();
      if (data.error) {
        lastError = new Error(`[Gemini ${model}] ${data.error.code}: ${data.error.message}`);
        console.warn(`[PYQ VISION] ${model} warning: ${data.error.message.slice(0, 120)}`);
        continue;
      }

      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawJson) {
        continue;
      }

      const parsed = JSON.parse(rawJson);
      const meta = parsed.metadata || {};
      const questions = (parsed.questions || []).map((q, idx) => ({
        questionNumber: String(q.questionNumber || idx + 1),
        questionText: (q.questionText || '').trim(),
        pageNumbers: Array.isArray(q.pageNumbers) ? q.pageNumbers : [1],
        pageNumber: Array.isArray(q.pageNumbers) && q.pageNumbers[0] ? q.pageNumbers[0] : 1,
      }));

      return {
        metadata: {
          institution: meta.institution || 'NIT Kurukshetra',
          program: meta.program || folderMetadata.program || 'B.Tech',
          branch: meta.branch || folderMetadata.branch || null,
          semester: meta.semester ? parseInt(String(meta.semester).replace(/\D/g, ''), 10) || folderMetadata.semester : folderMetadata.semester,
          courseCode: meta.courseCode ? meta.courseCode.toUpperCase().replace(/\s+/g, '') : null,
          courseName: meta.subject || null,
          examYear: meta.year ? parseInt(String(meta.year), 10) : folderMetadata.year || null,
          examMonth: meta.examDate || null,
          examType: meta.examType || 'END_SEM',
          maximumMarks: meta.maximumMarks || null,
          duration: meta.duration || null,
        },
        questions,
      };
    } catch (err) {
      lastError = err;
      console.warn(`[PYQ VISION] Model ${model} failed: ${err.message}`);
    }
  }

  throw lastError || new Error('Failed to extract questions from scanned PDF via Gemini Vision');
};

/**
 * Native Text Metadata Extraction via Gemini
 */
export const extractPyqMetadataWithGemini = async (textSample, folderMetadata = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !textSample || textSample.trim().length < 20) {
    return {
      institution: 'NIT Kurukshetra',
      program: folderMetadata.program || 'B.Tech',
      branch: folderMetadata.branch || null,
      semester: folderMetadata.semester || null,
      courseCode: null,
      courseName: null,
      examYear: folderMetadata.year || null,
      examMonth: null,
      examType: 'END_SEM',
    };
  }

  const prompt = `You are an expert academic document metadata extractor for National Institute of Technology, Kurukshetra (NIT KKR).
Analyze the following text from an examination question paper and extract structured metadata in strict JSON format.

Folder Hierarchy Hints:
- Year: ${folderMetadata.year || 'unknown'}
- Program: ${folderMetadata.program || 'B.Tech'}
- Branch: ${folderMetadata.branch || 'unknown'}
- Semester: ${folderMetadata.semester || 'unknown'}

Return ONLY valid JSON matching this schema:
{
  "institution": "NIT Kurukshetra or specific name",
  "program": "B.Tech or M.Tech or MCA",
  "branch": "Computer Engineering or official branch",
  "semester": integer between 1 and 8 or null,
  "courseCode": "CO401 or CS-301 or null",
  "courseName": "Advanced Data Structure or subject title or null",
  "examYear": 4-digit year integer or null,
  "examMonth": "December or May or null",
  "examType": "END_SEM or MID_SEM"
}

Exam Paper Text:
${textSample.slice(0, 4000)}
`;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const parsed = JSON.parse(rawText);
      return {
        institution: parsed.institution || 'NIT Kurukshetra',
        program: parsed.program || folderMetadata.program || 'B.Tech',
        branch: parsed.branch || folderMetadata.branch || null,
        semester: parsed.semester || folderMetadata.semester || null,
        courseCode: parsed.courseCode ? parsed.courseCode.toUpperCase().replace(/\s+/g, '') : null,
        courseName: parsed.courseName || null,
        examYear: parsed.examYear || folderMetadata.year || null,
        examMonth: parsed.examMonth || null,
        examType: parsed.examType || 'END_SEM',
      };
    } catch (e) {
      // try next model
    }
  }

  return {
    institution: 'NIT Kurukshetra',
    program: folderMetadata.program || 'B.Tech',
    branch: folderMetadata.branch || null,
    semester: folderMetadata.semester || null,
    courseCode: null,
    courseName: null,
    examYear: folderMetadata.year || null,
    examMonth: null,
    examType: 'END_SEM',
  };
};

/**
 * Question segmentation for native text PDFs
 */
export const extractQuestionsFromText = async (fullText, pages = []) => {
  const regex = /(?:(?:Question|Q\.?)\s*([0-9]+[a-zA-Z\(\)]*)|(?:\n|^)\s*([0-9]+[a-zA-Z\(\)]*)\s*[\.\)])\s*([\s\S]*?)(?=(?:(?:Question|Q\.?)\s*[0-9]+[a-zA-Z\(\)]*|(?:\n|^)\s*[0-9]+[a-zA-Z\(\)]*\s*[\.\)])|$)/gi;
  const questions = [];
  let match;
  let qNum = 1;

  while ((match = regex.exec(fullText)) !== null) {
    const rawNum = match[1] || match[2] || String(qNum);
    const text = (match[3] || '').trim();
    if (text.length > 15) {
      questions.push({
        questionNumber: String(rawNum),
        marks: null,
        questionText: text,
        pageNumbers: [1],
        pageNumber: 1,
      });
      qNum++;
    }
  }

  if (questions.length > 0) {
    return questions;
  }

  // Page-level fallback
  if (pages && pages.length > 0) {
    return pages.map((p, idx) => ({
      questionNumber: String(idx + 1),
      marks: null,
      questionText: p.text.trim() || `Page ${p.pageNumber} examination content`,
      pageNumbers: [p.pageNumber],
      pageNumber: p.pageNumber,
    }));
  }

  return [
    {
      questionNumber: '1',
      marks: null,
      questionText: fullText.trim() || 'Examination question paper',
      pageNumbers: [1],
      pageNumber: 1,
    },
  ];
};

/**
 * Ingest, Classify, Extract & Index a Public Google Drive PDF
 * Supports both TYPE A (Native Text) and TYPE B (Scanned/Photograph PDF)
 *
 * @param {object} fileItem - Drive file item metadata
 * @param {Buffer} buffer - PDF binary buffer
 * @param {string} driveFolderPath - Full path string
 * @param {object} folderMetadata - Inferred from path
 * @returns {Promise<object>} Saved PyqDocument and indexing metrics
 */
export const processDrivePdf = async (fileItem, buffer, driveFolderPath, folderMetadata) => {
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Check if document was already successfully indexed with matching content
  let pyqDoc = await PyqDocument.findOne({ fileId: fileItem.id });
  if (
    pyqDoc &&
    pyqDoc.contentHash === contentHash &&
    pyqDoc.processingStatus === 'INDEXED' &&
    pyqDoc.status === 'approved'
  ) {
    return { doc: pyqDoc, skipped: true, reason: 'ALREADY_INDEXED' };
  }

  if (!pyqDoc) {
    pyqDoc = new PyqDocument({
      fileId: fileItem.id,
      driveFileId: fileItem.id,
      name: fileItem.name,
      fileName: fileItem.name,
      sourceType: 'student_drive',
      sourceTrust: 'community',
      sourceName: 'NIT KKR PYQ Drive',
      sourceUrl: fileItem.webViewLink,
      webViewLink: fileItem.webViewLink,
      driveWebViewLink: fileItem.webViewLink,
      webContentLink: fileItem.webContentLink,
      mimeType: fileItem.mimeType || 'application/pdf',
      size: buffer.length,
      driveFolderPath,
      folderMetadata,
      contentHash,
      processingStatus: 'DOWNLOADING',
      status: 'approved',
    });
    await pyqDoc.save();
  }

  // ----------------------------------------------------
  // STEP 1: CLASSIFICATION (Native Text vs Scanned/Vision)
  // ----------------------------------------------------
  pyqDoc.processingStatus = 'EXTRACTING';

  let extractionMethod = 'native_text';
  let totalPages = 1;
  let questions = [];
  let docMetadata = {};

  try {
    // Check if extraction is already cached in MongoDB
    if (pyqDoc.extraction?.questions && pyqDoc.extraction.questions.length > 0) {
      console.log(`[PYQ EXTRACTION] Using cached extraction for: "${fileItem.name}"`);
      questions = pyqDoc.extraction.questions;
      docMetadata = pyqDoc.extraction.metadata || pyqDoc.documentMetadata || {};
      extractionMethod = pyqDoc.extractionMethod || 'native_text';
      totalPages = pyqDoc.totalPages || 1;
    } else {
      const nativeParseResult = await extractPdfTextFromBuffer(buffer);
      totalPages = nativeParseResult.totalPages || 1;

      const classification = classifyPdf(buffer, nativeParseResult);
      extractionMethod = classification.extractionMethod;

      if (extractionMethod === 'vision') {
        console.log(`[PYQ PROCESSOR] PDF classified as SCANNED/IMAGE: "${fileItem.name}" -> Running Gemini Vision OCR`);
        const visionResult = await extractPyqFromScannedPdf(buffer, folderMetadata);
        docMetadata = visionResult.metadata;
        questions = visionResult.questions;
      } else {
        console.log(`[PYQ PROCESSOR] PDF classified as NATIVE TEXT: "${fileItem.name}" -> Running text extraction`);
        const textSample = nativeParseResult.fullText.slice(0, 4000);
        docMetadata = await extractPyqMetadataWithGemini(textSample, folderMetadata);
        questions = await extractQuestionsFromText(nativeParseResult.fullText, nativeParseResult.pages);

        // Quality & Completeness check:
        // If native text yielded incomplete data (< 2 questions, missing course info, low char count, or generic page fallbacks),
        // automatically fallback to scanning as image via Gemini Vision OCR so all questions & exam metadata are captured.
        const trimmedLen = nativeParseResult.fullText.trim().length;
        const hasFewQuestions = !questions || questions.length < 2;
        const hasMissingCourse = !docMetadata.courseCode && !docMetadata.courseName && !docMetadata.subject;
        const hasGenericFallback = (questions || []).some((q) => (q.questionText || '').includes('examination content'));

        if (trimmedLen < 250 || hasFewQuestions || (hasMissingCourse && (questions || []).length < 4) || hasGenericFallback) {
          console.log(`[PYQ PROCESSOR] Native text extraction incomplete for "${fileItem.name}" (${questions?.length || 0} questions, length: ${trimmedLen}, courseCode: ${docMetadata.courseCode || 'none'}). Scanning as image via Gemini Vision OCR...`);
          try {
            const visionResult = await extractPyqFromScannedPdf(buffer, folderMetadata);
            if (visionResult?.questions && visionResult.questions.length > 0) {
              docMetadata = {
                ...docMetadata,
                ...visionResult.metadata,
                courseCode: visionResult.metadata.courseCode || docMetadata.courseCode,
                courseName: visionResult.metadata.courseName || docMetadata.courseName,
                subject: visionResult.metadata.subject || docMetadata.subject,
              };
              questions = visionResult.questions;
              extractionMethod = 'vision';
              console.log(`[PYQ PROCESSOR] Image OCR scan successfully recovered ${questions.length} questions and course code "${docMetadata.courseCode || 'N/A'}" for "${fileItem.name}"`);
            }
          } catch (visionFallbackErr) {
            console.warn(`[PYQ PROCESSOR] Vision OCR scan fallback failed: ${visionFallbackErr.message}. Retaining native text.`);
          }
        }
      }

      // Cache extraction in MongoDB
      pyqDoc.extraction = {
        metadata: docMetadata,
        questions,
      };
      pyqDoc.extractionMethod = extractionMethod;
      pyqDoc.isScannedPdf = extractionMethod === 'vision';
      pyqDoc.totalPages = totalPages;
      pyqDoc.pageCount = totalPages;
      pyqDoc.documentMetadata = docMetadata;
      pyqDoc.questions = questions.map((q) => ({
        questionNumber: String(q.questionNumber),
        questionText: q.questionText,
        pageNumbers: q.pageNumbers || [1],
        pageNumber: q.pageNumber || 1,
      }));
      pyqDoc.questionCount = questions.length;
      pyqDoc.processingStatus = 'EXTRACTED';
      await pyqDoc.save();
    }
  } catch (extractErr) {
    pyqDoc.processingStatus = 'FAILED';
    pyqDoc.failedStage = 'EXTRACTING';
    pyqDoc.errorMessage = extractErr.message;
    pyqDoc.retryCount = (pyqDoc.retryCount || 0) + 1;
    await pyqDoc.save();
    throw extractErr;
  }

  // ----------------------------------------------------
  // STEP 2: QUESTION-LEVEL EMBEDDING & QDRANT INDEXING
  // ----------------------------------------------------
  pyqDoc.processingStatus = 'EMBEDDING';

  try {
    const subject = docMetadata.courseName || docMetadata.subject || folderMetadata.branch || 'General';
    const courseCode = docMetadata.courseCode || null;
    const program = docMetadata.program || folderMetadata.program || 'B.Tech';
    const branch = docMetadata.branch || folderMetadata.branch || null;
    const semester = docMetadata.semester || folderMetadata.semester || null;
    const year = docMetadata.examYear || folderMetadata.year || null;

    // Build enriched embedding text per Section 16
    const embeddingTexts = questions.map((q) => {
      return `Subject: ${subject}
Course Code: ${courseCode || ''}
Program: ${program}
Branch: ${branch || ''}
Semester: ${semester || ''}
Year: ${year || ''}

Question:
${q.questionText}`.trim();
    });

    const embeddings = await generateEmbeddings(embeddingTexts, 50);

    const points = questions.map((q, idx) => {
      const pointIdHash = crypto
        .createHash('md5')
        .update(`pyq_${fileItem.id}_q_${q.questionNumber}_${idx}`)
        .digest('hex');
      const pointUuid = `${pointIdHash.slice(0, 8)}-${pointIdHash.slice(8, 12)}-4${pointIdHash.slice(
        13,
        16
      )}-a${pointIdHash.slice(17, 20)}-${pointIdHash.slice(20, 32)}`;

      return {
        id: pointUuid,
        vector: embeddings[idx],
        payload: {
          documentId: pyqDoc._id.toString(),
          pyqId: pyqDoc._id.toString(),
          sourceType: 'student_drive',
          sourceName: 'NIT KKR PYQ Drive',
          sourceTrust: 'community',
          driveFileId: fileItem.id,
          sourceUrl: fileItem.webViewLink,
          documentUrl: fileItem.webViewLink,
          fileName: fileItem.name,
          title: `${subject}${courseCode ? ` (${courseCode})` : ''}${year ? ` - ${year}` : ''}`,
          pageNumbers: q.pageNumbers || [q.pageNumber || 1],
          questionNumber: String(q.questionNumber),
          questionText: q.questionText,
          text: q.questionText,
          subject,
          courseCode,
          program,
          branch,
          semester,
          year,
          examYear: year,
          extractionMethod,
          isActive: true,
        },
      };
    });

    await upsertPoints(points);

    pyqDoc.qdrantDocumentId = pyqDoc._id.toString();
    pyqDoc.chunkCount = points.length;
    pyqDoc.processingStatus = 'INDEXED';
    pyqDoc.failedStage = null;
    pyqDoc.errorMessage = null;
    await pyqDoc.save();

    // Update URL registry
    await CrawlUrl.findOneAndUpdate(
      { normalizedUrl: fileItem.webViewLink, sourceType: 'student_drive' },
      {
        url: fileItem.webViewLink,
        normalizedUrl: fileItem.webViewLink,
        sourceType: 'student_drive',
        type: 'pdf',
        status: 'processed',
        sourceUrl: fileItem.webViewLink,
        driveFileId: fileItem.id,
        contentHash,
        fileSize: buffer.length,
        lastCrawledAt: new Date(),
      },
      { upsert: true }
    );

    return { doc: pyqDoc, skipped: false, extractionMethod, questionCount: questions.length };
  } catch (vectorErr) {
    pyqDoc.processingStatus = 'FAILED';
    pyqDoc.failedStage = 'EMBEDDING';
    pyqDoc.errorMessage = vectorErr.message;
    pyqDoc.retryCount = (pyqDoc.retryCount || 0) + 1;
    await pyqDoc.save();
    throw vectorErr;
  }
};

export default {
  extractPdfTextFromBuffer,
  classifyPdf,
  extractPyqFromScannedPdf,
  extractPyqMetadataWithGemini,
  extractQuestionsFromText,
  processDrivePdf,
};
