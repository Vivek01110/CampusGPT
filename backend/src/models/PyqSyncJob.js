import mongoose from 'mongoose';

const pyqSyncLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info',
    },
    message: {
      type: String,
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const pyqSyncJobSchema = new mongoose.Schema(
  {
    syncType: {
      type: String,
      enum: ['FULL_SYNC', 'INCREMENTAL_SYNC'],
      default: 'FULL_SYNC',
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'stopped'],
      default: 'queued',
      index: true,
    },
    rootFolderUrl: {
      type: String,
      required: true,
    },
    rootFolderId: {
      type: String,
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    metrics: {
      foldersDiscovered: { type: Number, default: 0 },
      pdfsDiscovered: { type: Number, default: 0 },
      pdfsProcessed: { type: Number, default: 0 },
      pdfsSkippedUnchanged: { type: Number, default: 0 },
      pdfsDuplicates: { type: Number, default: 0 },
      nativeTextPdfs: { type: Number, default: 0 },
      scannedPdfs: { type: Number, default: 0 },
      questionsExtracted: { type: Number, default: 0 },
      questionsIndexed: { type: Number, default: 0 },
      chunksCreated: { type: Number, default: 0 },
      qdrantVectorsUpserted: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      statusMessage: { type: String, default: null },
      currentPhase: { type: String, default: null },
    },
    logs: [pyqSyncLogSchema],
    error: {
      type: String,
      default: null,
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

pyqSyncJobSchema.index({ createdAt: -1 });

const PyqSyncJob = mongoose.model('PyqSyncJob', pyqSyncJobSchema);

export default PyqSyncJob;
