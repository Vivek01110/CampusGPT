import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import cacheInvalidation from '../services/cache/cacheInvalidation.js';
import cacheService from '../services/cache/cacheService.js';
import { getRedisStatus } from '../config/redis.js';
import { uploadPDF } from '../middleware/uploadMiddleware.js';
import {
  getAdminDocuments,
  getAdminDocumentById,
  createDocument,
  uploadNewVersion,
  getDocumentVersions,
  reindexDocument,
  retryVersion,
  setDocumentStatus,
  deleteDocument,
  getDocumentStatus,
} from '../controllers/adminDocumentController.js';

const router = express.Router();

// Apply Admin protection to all /api/admin routes
router.use(protect, authorize('admin'));

// --------------------------------------------------------------------------
// CACHE CONTROLS & ANALYTICS
// --------------------------------------------------------------------------
router.get('/cache/stats', async (req, res, next) => {
  try {
    const version = await cacheInvalidation.getCacheVersion();
    const metrics = await cacheService.getMetrics();
    const redisStatus = getRedisStatus();

    return res.status(200).json({
      success: true,
      data: {
        status: redisStatus,
        cacheVersion: `v${version}`,
        versionNumber: version,
        exactCache: {
          hits: metrics.exactHits,
          misses: metrics.exactMisses,
          hitRate: metrics.exactHitRate,
        },
        semanticCache: {
          hits: metrics.semanticHits,
          misses: metrics.semanticMisses,
          hitRate: metrics.semanticHitRate,
        },
        rateLimits: {
          blockedRequests: metrics.rateLimitBlocks,
        },
        bypasses: metrics.cacheBypasses,
        overallHitRate: metrics.overallHitRate,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/cache/invalidate', async (req, res, next) => {
  try {
    const reason = req.body?.reason || 'Admin Manual Invalidation';
    const result = await cacheInvalidation.invalidateRagCache(reason);

    return res.status(200).json({
      success: true,
      message: `RAG Cache successfully invalidated. Active version is now v${result.newVersion}.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------------
// DOCUMENT REGISTRY & VERSIONING
// --------------------------------------------------------------------------
router.get('/documents', getAdminDocuments);
router.post('/documents', uploadPDF.single('file'), createDocument);
router.get('/documents/:id', getAdminDocumentById);
router.get('/documents/:id/status', getDocumentStatus);
router.post('/documents/:id/versions', uploadPDF.single('file'), uploadNewVersion);
router.get('/documents/:id/versions', getDocumentVersions);
router.post('/documents/:id/reindex', reindexDocument);
router.post('/documents/:id/retry', retryVersion);
router.patch('/documents/:id/status', setDocumentStatus);
router.delete('/documents/:id', deleteDocument);

import {
  getAdminCourses,
  getAdminCourseById,
  createAdminCourse,
  updateAdminCourse,
  deleteAdminCourse,
} from '../controllers/adminCourseController.js';
import {
  getAdminEvents,
  getAdminEventById,
  createAdminEvent,
  updateAdminEvent,
  deleteAdminEvent,
} from '../controllers/adminEventController.js';

// --------------------------------------------------------------------------
// STRUCTURED COURSE CATALOG MANAGEMENT (Phase 6)
// --------------------------------------------------------------------------
router.get('/courses', getAdminCourses);
router.post('/courses', createAdminCourse);
router.get('/courses/:id', getAdminCourseById);
router.patch('/courses/:id', updateAdminCourse);
router.delete('/courses/:id', deleteAdminCourse);

// --------------------------------------------------------------------------
// STRUCTURED ACADEMIC EVENTS & DEADLINES MANAGEMENT (Phase 6)
// --------------------------------------------------------------------------
router.get('/events', getAdminEvents);
router.post('/events', createAdminEvent);
router.get('/events/:id', getAdminEventById);
router.patch('/events/:id', updateAdminEvent);
router.delete('/events/:id', deleteAdminEvent);

import {
  getSources,
  getSourceById,
  createSource,
  updateSource,
  deleteSource,
  runCrawl,
  getCrawlJobs,
  getCrawlJobById,
} from '../controllers/adminCrawlerController.js';

// --------------------------------------------------------------------------
// NIT KKR WEBSITE CRAWLER & AUTOMATED INGESTION (Phase 7)
// --------------------------------------------------------------------------
router.get('/crawler/sources', getSources);
router.post('/crawler/sources', createSource);
router.get('/crawler/sources/:id', getSourceById);
router.patch('/crawler/sources/:id', updateSource);
router.delete('/crawler/sources/:id', deleteSource);
router.post('/crawler/sources/:id/run', runCrawl);
router.get('/crawler/jobs', getCrawlJobs);
router.get('/crawler/jobs/:id', getCrawlJobById);

export default router;
