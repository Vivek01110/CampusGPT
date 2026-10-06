import mongoose from 'mongoose';

const documentVersionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      default: '',
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
    sourcePageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    fileHash: {
      type: String,
      required: true,
      index: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: 'application/pdf',
    },
    totalPages: {
      type: Number,
      default: 0,
    },
    totalChunks: {
      type: Number,
      default: 0,
    },
    processingStatus: {
      type: String,
      enum: [
        'draft',
        'uploaded',
        'validating',
        'extracting',
        'chunking',
        'embedding',
        'indexing',
        'indexed',
        'processing',
        'failed',
      ],
      default: 'uploaded',
      index: true,
    },
    processingProgress: {
      type: Number,
      default: 0,
    },
    currentStage: {
      type: String,
      default: 'uploaded',
    },
    processingStartedAt: {
      type: Date,
      default: null,
    },
    processingCompletedAt: {
      type: Date,
      default: null,
    },
    processingError: {
      type: String,
      default: null,
    },
    indexedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure unique version numbers per document
documentVersionSchema.index({ documentId: 1, versionNumber: 1 }, { unique: true });
documentVersionSchema.index({ documentId: 1, fileHash: 1 });

const DocumentVersion = mongoose.model('DocumentVersion', documentVersionSchema);

export default DocumentVersion;
