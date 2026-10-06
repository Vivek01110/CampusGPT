import WebsiteSource from '../../models/WebsiteSource.js';
import CrawlJob from '../../models/CrawlJob.js';
import { executeCrawl } from './crawlerEngine.js';
import CRAWLER_CONFIG from './crawlerConfig.js';

/**
 * Ensures the initial NIT KKR 2025-26 source is seeded in MongoDB
 */
export const seedDefaultSources = async (adminUserId = null) => {
  try {
    const count = await WebsiteSource.countDocuments();
    if (count === 0) {
      for (const src of CRAWLER_CONFIG.DEFAULT_SOURCES) {
        await WebsiteSource.create({
          ...src,
          createdBy: adminUserId,
        });
        console.log(`[CRAWLER SEED] Seeded default source: "${src.name}" (${src.baseUrl})`);
      }
    }
  } catch (err) {
    console.warn(`[CRAWLER SEED WARNING] Could not seed default sources: ${err.message}`);
  }
};

/**
 * Triggers a crawl job asynchronously in the background
 *
 * @param {string} sourceId - WebsiteSource ID
 * @param {string} [userId] - Admin user ID
 * @returns {Promise<{ jobId: string, status: string, message: string }>}
 */
export const queueCrawlJob = async (sourceId, userId = null) => {
  const source = await WebsiteSource.findById(sourceId);
  if (!source) {
    throw new Error(`Website source with ID ${sourceId} not found`);
  }

  if (source.lastCrawlStatus === 'running') {
    throw new Error(`A crawl job is already currently running for "${source.name}"`);
  }

  // Check if source is enabled
  if (!source.enabled) {
    throw new Error(`Cannot run crawl: Website source "${source.name}" is currently disabled`);
  }

  // Pre-create queued job record to return immediately
  const initialJob = await CrawlJob.create({
    websiteSourceId: source._id,
    academicYear: source.academicYear || CRAWLER_CONFIG.TARGET_ACADEMIC_YEAR,
    status: 'queued',
    triggeredBy: userId,
  });

  source.lastCrawlStatus = 'running';
  source.lastCrawlJobId = initialJob._id;
  await source.save();

  // Asynchronous background execution (fire and forget from HTTP response perspective)
  setImmediate(async () => {
    try {
      await executeCrawl(sourceId, userId, initialJob._id);
    } catch (err) {
      console.error(`[BACKGROUND CRAWL ERROR] Failed executing crawl for source ${sourceId}: ${err.message}`);
    }
  });

  return {
    jobId: initialJob._id.toString(),
    status: 'QUEUED',
    message: `Crawl job queued for "${source.name}". Running politely in background.`,
  };
};

/**
 * Get paginated list of crawl jobs
 */
export const getCrawlJobs = async (params = {}) => {
  const { sourceId, status, page = 1, limit = 10 } = params;
  const filter = {};

  if (sourceId) filter.websiteSourceId = sourceId;
  if (status && status !== 'all') filter.status = status;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const total = await CrawlJob.countDocuments(filter);
  const jobs = await CrawlJob.find(filter)
    .populate('websiteSourceId', 'name baseUrl academicYear')
    .populate('triggeredBy', 'name email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  return {
    jobs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
};

/**
 * Get single crawl job with complete logs and metrics
 */
export const getCrawlJobById = async (jobId) => {
  const job = await CrawlJob.findById(jobId)
    .populate('websiteSourceId', 'name baseUrl allowedDomains allowedPathPrefixes academicYear')
    .populate('triggeredBy', 'name email role');

  if (!job) {
    throw new Error(`Crawl job with ID ${jobId} not found`);
  }

  return job;
};

export default {
  seedDefaultSources,
  queueCrawlJob,
  getCrawlJobs,
  getCrawlJobById,
};
