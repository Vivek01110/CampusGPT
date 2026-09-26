import mongoose from 'mongoose';

const crawlLogSchema = new mongoose.Schema(
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
    url: {
      type: String,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false }
);

const crawlJobSchema = new mongoose.Schema(
  {
    websiteSourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebsiteSource',
      required: true,
      index: true,
    },
    academicYear: {
      type: String,
      required: true,
      default: '2025-26',
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'stopped'],
      default: 'queued',
      index: true,
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
      pagesDiscovered: { type: Number, default: 0 },
      pagesFetched: { type: Number, default: 0 },
      pagesSkipped: { type: Number, default: 0 },
      pdfsDiscovered: { type: Number, default: 0 },
      pdfsEligible: { type: Number, default: 0 },
      pdfsSkippedOldYear: { type: Number, default: 0 },
      pdfsYearUnknown: { type: Number, default: 0 },
      pdfsDownloaded: { type: Number, default: 0 },
      documentsCreated: { type: Number, default: 0 },
      documentsUpdated: { type: Number, default: 0 },
      documentsUnchanged: { type: Number, default: 0 },
      documentsDeduplicated: { type: Number, default: 0 },
      documentsFailed: { type: Number, default: 0 },
      perSourceMetrics: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    logs: [crawlLogSchema],
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

crawlJobSchema.index({ websiteSourceId: 1, createdAt: -1 });

const CrawlJob = mongoose.model('CrawlJob', crawlJobSchema);

export default CrawlJob;
