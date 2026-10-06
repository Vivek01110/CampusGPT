import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    documentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentVersion',
      default: null,
      index: true,
    },
    versionNumber: {
      type: Number,
      default: 1,
    },
    documentTitle: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: 'academics',
      index: true,
    },
    department: {
      type: String,
      default: 'General',
      index: true,
    },
    documentType: {
      type: String,
      default: 'regulation',
      index: true,
    },
    sourceAuthority: {
      type: String,
      default: 'official',
    },
    sourceTrust: {
      type: String,
      default: 'official',
      index: true,
    },
    sourceType: {
      type: String,
      default: 'upload',
      index: true,
    },
    courseCode: {
      type: String,
      default: null,
      index: true,
    },
    semester: {
      type: Number,
      default: null,
      index: true,
    },
    branch: {
      type: String,
      default: null,
      index: true,
    },
    questionNumber: {
      type: Number,
      default: null,
    },
    year: {
      type: Number,
      default: null,
      index: true,
    },
    academicYear: {
      type: String,
      default: null,
    },
    pageNumber: {
      type: Number,
      default: 1,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    tokenCount: {
      type: Number,
      default: 0,
    },
    sourceUrl: {
      type: String,
      default: '',
    },
    sourcePageUrl: {
      type: String,
      default: '',
    },
    knowledgeBaseScope: {
      type: String,
      enum: ['student', 'administrative', 'research', 'general'],
      default: 'student',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    qdrantPointId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for quick document chunks query - unique per document version
chunkSchema.index({ documentVersionId: 1, chunkIndex: 1 }, { unique: true });
chunkSchema.index({ documentId: 1, versionNumber: 1 });

const Chunk = mongoose.model('Chunk', chunkSchema);

export default Chunk;
