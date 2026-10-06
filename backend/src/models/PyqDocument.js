import mongoose from 'mongoose';

/**
 * Question Schema - question-level indexing
 */
const pyqQuestionSchema = new mongoose.Schema(
  {
    questionNumber: {
      type: String,
      required: true,
      trim: true,
    },
    subQuestion: {
      type: String,
      default: null,
    },
    marks: {
      type: Number,
      default: null,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    topic: {
      type: String,
      trim: true,
      default: null,
    },
    pageNumber: {
      type: Number,
      default: 1,
    },
    pageNumbers: {
      type: [Number],
      default: [1],
    },
    qdrantPointId: {
      type: String,
      default: null,
    },
  },
  { _id: true }
);

/**
 * PYQ Document Schema
 * Stores complete structured information for question papers ingested from Public Google Drive
 */
const pyqDocumentSchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    driveFileId: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      trim: true,
    },
    sourceType: {
      type: String,
      default: 'student_drive',
      index: true,
    },
    sourceTrust: {
      type: String,
      default: 'community',
      index: true,
    },
    sourceName: {
      type: String,
      default: 'NIT KKR PYQ Drive',
    },
    sourceUrl: {
      type: String,
      required: true,
      trim: true,
    },
    webViewLink: {
      type: String,
      required: true,
      trim: true,
    },
    driveWebViewLink: {
      type: String,
      trim: true,
    },
    extractionMethod: {
      type: String,
      enum: ['native_text', 'vision'],
      default: 'native_text',
      index: true,
    },
    processingStatus: {
      type: String,
      enum: ['DISCOVERED', 'DOWNLOADING', 'EXTRACTING', 'EXTRACTED', 'EMBEDDING', 'INDEXED', 'FAILED'],
      default: 'DISCOVERED',
      index: true,
    },
    pageCount: {
      type: Number,
      default: 1,
    },
    extraction: {
      metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
      questions: { type: Array, default: [] },
    },
    failedStage: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    webContentLink: {
      type: String,
      trim: true,
      default: null,
    },
    mimeType: {
      type: String,
      default: 'application/pdf',
    },
    size: {
      type: Number,
      default: 0,
    },
    driveFolderPath: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    folderMetadata: {
      year: { type: Number, default: null, index: true },
      program: { type: String, default: 'B.Tech', trim: true },
      branch: { type: String, default: null, trim: true, index: true },
      semester: { type: Number, default: null, index: true },
    },
    documentMetadata: {
      institution: { type: String, default: 'NIT Kurukshetra' },
      program: { type: String, default: 'B.Tech' },
      branch: { type: String, default: null, trim: true, index: true },
      semester: { type: Number, default: null, index: true },
      courseCode: { type: String, default: null, trim: true, uppercase: true, index: true },
      courseName: { type: String, default: null, trim: true, index: true },
      examYear: { type: Number, default: null, index: true },
      examMonth: { type: String, default: null, trim: true },
      examType: {
        type: String,
        default: 'END_SEM',
      },
      questionCount: { type: Number, default: 0 },
    },
    questions: [pyqQuestionSchema],
    questionCount: {
      type: Number,
      default: 0,
    },
    contentHash: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    totalPages: {
      type: Number,
      default: 1,
    },
    isScannedPdf: {
      type: Boolean,
      default: false,
    },
    extractedTextSample: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'failed'],
      default: 'approved',
      index: true,
    },
    reviewNotes: {
      type: String,
      default: null,
    },
    qdrantDocumentId: {
      type: String,
      default: null,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    lastCrawledAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Indexes for fast queries
pyqDocumentSchema.index({ 'documentMetadata.courseCode': 1, 'documentMetadata.examYear': 1 });
pyqDocumentSchema.index({ 'folderMetadata.branch': 1, 'folderMetadata.semester': 1, 'folderMetadata.year': 1 });
pyqDocumentSchema.index({ 'documentMetadata.branch': 1, 'documentMetadata.semester': 1 });
pyqDocumentSchema.index({ status: 1, createdAt: -1 });

const PyqDocument = mongoose.model('PyqDocument', pyqDocumentSchema);

export default PyqDocument;
