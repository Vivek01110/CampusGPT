import mongoose from 'mongoose';

const websiteSourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name for this website source'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },
    baseUrl: {
      type: String,
      required: [true, 'Please provide a base URL'],
      trim: true,
    },
    allowedDomains: {
      type: [String],
      default: ['nitkkr.ac.in'],
    },
    allowedPathPrefixes: {
      type: [String],
      default: ['/academic-notifications/', '/wp-content/uploads/'],
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'high',
      index: true,
    },
    studentKnowledgeBaseOnly: {
      type: Boolean,
      default: true,
    },
    sourceAuthority: {
      type: String,
      enum: ['official', 'department', 'internal'],
      default: 'official',
    },
    academicYear: {
      type: String,
      required: true,
      default: '2025-26',
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    crawlFrequency: {
      type: String,
      enum: ['manual', 'hourly', 'daily', 'weekly'],
      default: 'manual',
    },
    maxPagesPerRun: {
      type: Number,
      default: 25,
      min: 1,
      max: 100,
    },
    requestDelayMs: {
      type: Number,
      default: 1000,
      min: 200,
      max: 10000,
    },
    defaultCategory: {
      type: String,
      default: 'academics',
    },
    defaultDepartment: {
      type: String,
      default: 'General',
    },
    lastCrawlAt: {
      type: Date,
      default: null,
    },
    lastCrawlStatus: {
      type: String,
      enum: ['idle', 'running', 'completed', 'failed'],
      default: 'idle',
    },
    lastCrawlJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrawlJob',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

websiteSourceSchema.index({ enabled: 1, academicYear: 1 });

const WebsiteSource = mongoose.model('WebsiteSource', websiteSourceSchema);

export default WebsiteSource;
