import WebsiteSource from '../models/WebsiteSource.js';
import { queueCrawlJob, getCrawlJobs as serviceGetJobs, getCrawlJobById as serviceGetJobById, seedDefaultSources } from '../services/crawler/crawlJobService.js';
import { normalizeUrl } from '../services/crawler/urlNormalizer.js';

/**
 * @desc    Get all configured website sources
 * @route   GET /api/admin/crawler/sources
 * @access  Private (Admin only)
 */
export const getSources = async (req, res, next) => {
  try {
    // Seed default source if empty
    await seedDefaultSources(req.user?._id);

    const sources = await WebsiteSource.find()
      .populate('createdBy', 'name email')
      .populate('lastCrawlJobId', 'status startedAt completedAt metrics')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: { sources },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get single website source by ID
 * @route   GET /api/admin/crawler/sources/:id
 * @access  Private (Admin only)
 */
export const getSourceById = async (req, res, next) => {
  try {
    const source = await WebsiteSource.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('lastCrawlJobId');

    if (!source) {
      return res.status(404).json({
        success: false,
        message: 'Website source not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: { source },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Create new website source
 * @route   POST /api/admin/crawler/sources
 * @access  Private (Admin only)
 */
export const createSource = async (req, res, next) => {
  try {
    const {
      name,
      baseUrl,
      allowedDomains = ['nitkkr.ac.in'],
      allowedPathPrefixes = ['/academic-notifications/'],
      priority = 'high',
      studentKnowledgeBaseOnly = true,
      sourceAuthority = 'official',
      academicYear = '2025-26',
      enabled = true,
      crawlFrequency = 'manual',
      maxPagesPerRun = 25,
      requestDelayMs = 1000,
      defaultCategory = 'academics',
      defaultDepartment = 'General',
    } = req.body;

    if (!name || !baseUrl) {
      return res.status(400).json({
        success: false,
        message: 'Source name and base URL are required',
      });
    }

    const normalizedBase = normalizeUrl(baseUrl);
    if (!normalizedBase) {
      return res.status(400).json({
        success: false,
        message: 'Invalid base URL provided',
      });
    }

    const source = await WebsiteSource.create({
      name: name.trim(),
      baseUrl: normalizedBase,
      allowedDomains,
      allowedPathPrefixes,
      priority,
      studentKnowledgeBaseOnly: Boolean(studentKnowledgeBaseOnly),
      sourceAuthority,
      academicYear: academicYear.trim(),
      enabled: Boolean(enabled),
      crawlFrequency,
      maxPagesPerRun: Number(maxPagesPerRun),
      requestDelayMs: Number(requestDelayMs),
      defaultCategory,
      defaultDepartment,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Website source successfully created.',
      data: { source },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Update website source
 * @route   PATCH /api/admin/crawler/sources/:id
 * @access  Private (Admin only)
 */
export const updateSource = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (updates.baseUrl) {
      updates.baseUrl = normalizeUrl(updates.baseUrl);
    }

    const source = await WebsiteSource.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!source) {
      return res.status(404).json({
        success: false,
        message: 'Website source not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Website source updated successfully.',
      data: { source },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Delete website source
 * @route   DELETE /api/admin/crawler/sources/:id
 * @access  Private (Admin only)
 */
export const deleteSource = async (req, res, next) => {
  try {
    const source = await WebsiteSource.findByIdAndDelete(req.params.id);
    if (!source) {
      return res.status(404).json({
        success: false,
        message: 'Website source not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Website source "${source.name}" deleted.`,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Queue and run a background crawl job for a website source
 * @route   POST /api/admin/crawler/sources/:id/run
 * @access  Private (Admin only)
 */
export const runCrawl = async (req, res, next) => {
  try {
    const result = await queueCrawlJob(req.params.id, req.user._id);

    return res.status(202).json({
      success: true,
      jobId: result.jobId,
      status: result.status,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get paginated crawl jobs history
 * @route   GET /api/admin/crawler/jobs
 * @access  Private (Admin only)
 */
export const getCrawlJobs = async (req, res, next) => {
  try {
    const data = await serviceGetJobs(req.query);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get single crawl job details with metrics and full logs
 * @route   GET /api/admin/crawler/jobs/:id
 * @access  Private (Admin only)
 */
export const getCrawlJobById = async (req, res, next) => {
  try {
    const job = await serviceGetJobById(req.params.id);

    return res.status(200).json({
      success: true,
      data: { job },
    });
  } catch (err) {
    next(err);
  }
};

export default {
  getSources,
  getSourceById,
  createSource,
  updateSource,
  deleteSource,
  runCrawl,
  getCrawlJobs,
  getCrawlJobById,
};
