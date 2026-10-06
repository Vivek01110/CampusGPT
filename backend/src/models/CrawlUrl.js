import mongoose from 'mongoose';

/**
 * Universal Crawl URL Registry
 * Tracks all discovered URLs for both Public Google Drive and Official NIT KKR Website
 */
const crawlUrlSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedUrl: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ['student_drive', 'official_nitkkr', 'community', 'third_party'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['folder', 'pdf', 'image', 'html', 'external'],
      default: 'html',
      index: true,
    },
    status: {
      type: String,
      enum: ['discovered', 'queued', 'processing', 'processed', 'failed', 'skipped'],
      default: 'discovered',
      index: true,
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
    depth: {
      type: Number,
      default: 0,
    },
    driveFileId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    driveFolderId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    httpStatus: {
      type: Number,
      default: null,
    },
    contentHash: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    contentType: {
      type: String,
      trim: true,
      default: null,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    lastCrawledAt: {
      type: Date,
      default: null,
    },
    firstDiscoveredAt: {
      type: Date,
      default: Date.now,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
crawlUrlSchema.index({ normalizedUrl: 1, sourceType: 1 }, { unique: true });
crawlUrlSchema.index({ sourceType: 1, status: 1 });
crawlUrlSchema.index({ sourceType: 1, type: 1 });

const CrawlUrl = mongoose.model('CrawlUrl', crawlUrlSchema);

export default CrawlUrl;
