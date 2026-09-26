import mongoose from 'mongoose';

const ingestionJobSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed'],
      default: 'queued',
      index: true,
    },
    currentStage: {
      type: String,
      enum: [
        'queued',
        'validating',
        'extracting',
        'chunking',
        'embedding',
        'indexing',
        'completed',
        'failed',
      ],
      default: 'queued',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    error: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

ingestionJobSchema.index({ documentId: 1, createdAt: -1 });

const IngestionJob = mongoose.model('IngestionJob', ingestionJobSchema);

export default IngestionJob;
