import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import WebsiteSource from '../../models/WebsiteSource.js';
import CrawlJob from '../../models/CrawlJob.js';
import Document from '../../models/Document.js';
import DocumentVersion from '../../models/DocumentVersion.js';
import User from '../../models/User.js';
import { normalizeUrl, isAllowedDomain, isAllowedPathPrefix, isAllowedPdfDestination, isSSRFSafe } from './urlNormalizer.js';
import { isUrlAllowedByRobots } from './robotsParser.js';
import { politeFetch } from './politeFetcher.js';
import { isWithinTargetAcademicYear } from './documentEligibilityService.js';
import { inspectPdfBuffer } from './pdfInspector.js';
import { classifyDocument } from './documentClassifier.js';
import { processDocumentVersion } from '../ingestion/ingestionService.js';
import { storageService } from '../storage/storageService.js';
import cacheInvalidation from '../cache/cacheInvalidation.js';
import CRAWLER_CONFIG from './crawlerConfig.js';

/**
 * Extracts all HTML links and anchor titles from HTML string
 */
const extractLinksFromHtml = (html, baseUrl) => {
  const links = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = re.exec(html)) !== null) {
    const rawHref = match[1];
    const rawText = match[2]
      .replace(/<[^>]+>/g, '') // strip nested tags
      .replace(/\s+/g, ' ')
      .trim();

    const normalized = normalizeUrl(rawHref, baseUrl);
    if (normalized) {
      links.push({
        url: normalized,
        text: rawText,
      });
    }
  }

  return links;
};

/**
 * Adds log entry to CrawlJob
 */
const appendJobLog = async (job, level, message, url = null, details = null) => {
  const logEntry = {
    timestamp: new Date(),
    level,
    message,
    url,
    details,
  };
  job.logs.push(logEntry);
  console.log(`[CRAWLER ${level.toUpperCase()}] ${message}${url ? ` -> ${url}` : ''}`);
};

/**
 * Executes a controlled crawl job for a specific WebsiteSource
 *
 * @param {string} sourceId - WebsiteSource MongoDB ID
 * @param {string} [userId] - User triggering the crawl
 * @returns {Promise<object>} Completed CrawlJob document
 */
export const executeCrawl = async (sourceId, userId = null) => {
  const source = await WebsiteSource.findById(sourceId);
  if (!source) {
    throw new Error(`WebsiteSource with ID ${sourceId} not found`);
  }

  // Find admin user for document ownership
  let ownerId = userId;
  if (!ownerId) {
    const adminUser = await User.findOne({ role: 'admin' });
    ownerId = adminUser ? adminUser._id : null;
  }

  // Create new CrawlJob in running state
  const job = await CrawlJob.create({
    websiteSourceId: source._id,
    academicYear: source.academicYear || CRAWLER_CONFIG.TARGET_ACADEMIC_YEAR,
    status: 'running',
    startedAt: new Date(),
    triggeredBy: ownerId,
    metrics: {
      pagesDiscovered: 0,
      pagesFetched: 0,
      pagesSkipped: 0,
      pdfsDiscovered: 0,
      pdfsEligible: 0,
      pdfsSkippedOldYear: 0,
      pdfsYearUnknown: 0,
      pdfsDownloaded: 0,
      documentsCreated: 0,
      documentsUpdated: 0,
      documentsUnchanged: 0,
      documentsDeduplicated: 0,
      documentsFailed: 0,
    },
    logs: [],
  });

  source.lastCrawlStatus = 'running';
  source.lastCrawlJobId = job._id;
  await source.save();

  await appendJobLog(
    job,
    'info',
    `Starting polite crawl for "${source.name}" (Target Academic Year: ${source.academicYear})`
  );

  const allowedDomains = source.allowedDomains || ['nitkkr.ac.in'];
  const allowedPrefixes = source.allowedPathPrefixes || [];
  const maxPages = source.maxPagesPerRun || CRAWLER_CONFIG.DEFAULT_MAX_PAGES_PER_RUN;
  const requestDelayMs = source.requestDelayMs || CRAWLER_CONFIG.DEFAULT_REQUEST_DELAY_MS;

  // Crawl queues & tracking sets
  const pageQueue = [source.baseUrl];
  const visitedUrls = new Set();
  const candidatePdfs = new Map(); // url -> { url, anchorTitle, contextHeading, sourcePage }

  try {
    // ----------------------------------------------------
    // PHASE 1: DISCOVERY & HTML PAGE CRAWLING
    // ----------------------------------------------------
    while (pageQueue.length > 0 && job.metrics.pagesFetched < maxPages) {
      const currentUrl = pageQueue.shift();

      if (visitedUrls.has(currentUrl)) continue;
      visitedUrls.add(currentUrl);

      // Check URL domain & prefix
      if (!isAllowedDomain(currentUrl, allowedDomains) || !isAllowedPathPrefix(currentUrl, allowedPrefixes)) {
        job.metrics.pagesSkipped++;
        await appendJobLog(job, 'debug', `Skipped page outside allowed domain/prefix`, currentUrl);
        continue;
      }

      // Check SSRF
      const ssrf = isSSRFSafe(currentUrl);
      if (!ssrf.isSafe) {
        job.metrics.pagesSkipped++;
        await appendJobLog(job, 'warn', `Skipped URL blocked by SSRF policy`, currentUrl);
        continue;
      }

      // Check Robots.txt
      const allowedByRobots = await isUrlAllowedByRobots(currentUrl);
      if (!allowedByRobots) {
        job.metrics.pagesSkipped++;
        await appendJobLog(job, 'info', `Skipped page disallowed by robots.txt`, currentUrl);
        continue;
      }

      await appendJobLog(job, 'info', `Fetching HTML page (${job.metrics.pagesFetched + 1}/${maxPages})`, currentUrl);

      let fetchResult;
      try {
        fetchResult = await politeFetch(currentUrl, {
          allowedDomains,
          requestDelayMs,
          maxSizeBytes: CRAWLER_CONFIG.MAX_HTML_SIZE_BYTES,
        });
      } catch (fetchErr) {
        job.metrics.pagesSkipped++;
        await appendJobLog(job, 'warn', `Failed to fetch page: ${fetchErr.message}`, currentUrl);
        continue;
      }

      job.metrics.pagesFetched++;

      if (!fetchResult.text) continue;

      // Extract all links from page
      const extractedLinks = extractLinksFromHtml(fetchResult.text, currentUrl);

      for (const link of extractedLinks) {
        const linkUrl = link.url;
        const lowerUrl = linkUrl.toLowerCase();

        // Check if PDF document
        if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?')) {
          if (
            isAllowedDomain(linkUrl, allowedDomains) &&
            isAllowedPdfDestination(linkUrl, allowedPrefixes, CRAWLER_CONFIG.ALLOWED_PDF_PREFIX)
          ) {
            if (!candidatePdfs.has(linkUrl)) {
              candidatePdfs.set(linkUrl, {
                url: linkUrl,
                anchorTitle: link.text,
                sourcePage: currentUrl,
              });
              job.metrics.pdfsDiscovered++;
              await appendJobLog(job, 'debug', `Discovered candidate PDF: "${link.text || 'Untitled'}"`, linkUrl);
            }
          }
        } else {
          // HTML Link
          if (
            !visitedUrls.has(linkUrl) &&
            !pageQueue.includes(linkUrl) &&
            isAllowedDomain(linkUrl, allowedDomains) &&
            isAllowedPathPrefix(linkUrl, allowedPrefixes)
          ) {
            pageQueue.push(linkUrl);
            job.metrics.pagesDiscovered++;
          }
        }
      }
    }

    await appendJobLog(
      job,
      'info',
      `Page discovery complete. Discovered ${candidatePdfs.size} candidate PDF(s) across ${job.metrics.pagesFetched} page(s).`
    );

    // ----------------------------------------------------
    // PHASE 2: PDF ELIGIBILITY, DOWNLOAD & INGESTION
    // ----------------------------------------------------
    for (const [pdfUrl, candidate] of candidatePdfs.entries()) {
      const fileName = path.basename(new URL(pdfUrl).pathname);
      const evalContext = {
        title: candidate.anchorTitle,
        url: pdfUrl,
        fileName,
      };

      // 1. Pre-Download Eligibility Check (avoid downloading large old PDFs)
      const preEval = isWithinTargetAcademicYear(evalContext);

      if (preEval.yearDetectionStatus === 'OLD_YEAR') {
        job.metrics.pdfsSkippedOldYear++;
        await appendJobLog(
          job,
          'info',
          `[CRAWLER] URL: ${pdfUrl} Academic Year: ${preEval.academicYear} Decision: SKIP Reason: OUTSIDE_TARGET_ACADEMIC_YEAR (Pre-download)`
        );
        continue;
      }

      // 2. Polite Download
      await appendJobLog(job, 'info', `Downloading candidate PDF: ${fileName}`, pdfUrl);
      let pdfFetch;
      try {
        pdfFetch = await politeFetch(pdfUrl, {
          allowedDomains,
          requestDelayMs,
          maxSizeBytes: CRAWLER_CONFIG.MAX_PDF_SIZE_BYTES,
        });
      } catch (dlErr) {
        job.metrics.documentsFailed++;
        await appendJobLog(job, 'warn', `Failed to download PDF: ${dlErr.message}`, pdfUrl);
        continue;
      }

      job.metrics.pdfsDownloaded++;

      // 3. In-Depth PDF Inspection (Text & First-Page Heading Analysis)
      let inspection;
      try {
        inspection = await inspectPdfBuffer(pdfFetch.buffer, {
          url: pdfUrl,
          fileName,
          anchorTitle: candidate.anchorTitle,
        });
      } catch (inspectErr) {
        job.metrics.documentsFailed++;
        await appendJobLog(job, 'warn', `PDF inspection failed: ${inspectErr.message}`, pdfUrl);
        continue;
      }

      // Check strict 2025-26 eligibility
      if (inspection.yearDetectionStatus === 'OLD_YEAR') {
        job.metrics.pdfsSkippedOldYear++;
        await appendJobLog(
          job,
          'info',
          `[CRAWLER] URL: ${pdfUrl} Academic Year: ${inspection.academicYear} Decision: SKIP Reason: OUTSIDE_TARGET_ACADEMIC_YEAR (Post-download)`
        );
        continue;
      }

      if (inspection.yearDetectionStatus === 'UNKNOWN') {
        job.metrics.pdfsYearUnknown++;
        await appendJobLog(
          job,
          'info',
          `[CRAWLER] URL: ${pdfUrl} Decision: SKIP Reason: YEAR_UNKNOWN (Could not determine academic year reliably. Never guessing)`
        );
        continue;
      }

      // PDF is verified for Academic Year 2025-26!
      job.metrics.pdfsEligible++;
      await appendJobLog(
        job,
        'info',
        `[CRAWLER] URL: ${pdfUrl} Decision: ACCEPTED Reason: TARGET_ACADEMIC_YEAR_MATCH (${inspection.academicYear})`
      );

      // Check maximum PDF page count limit (process.env.MAX_PDF_PAGES, default 200)
      const maxPdfPages = parseInt(process.env.MAX_PDF_PAGES || '200', 10);
      if (maxPdfPages > 0 && inspection.totalPages > maxPdfPages) {
        job.metrics.documentsFailed++;
        const pageLimitMsg = `PDF exceeds maximum page limit. Pages: ${inspection.totalPages}, Maximum allowed: ${maxPdfPages}`;
        const errorDetail = `PDF exceeds configured maximum page limit of ${maxPdfPages}. (Pages: ${inspection.totalPages}, Maximum allowed: ${maxPdfPages})`;

        await appendJobLog(job, 'warn', pageLimitMsg, pdfUrl);

        try {
          const existingDoc = await Document.findOne({
            sourceUrl: pdfUrl,
            isDeleted: { $ne: true },
          });

          if (existingDoc) {
            const nextVersionNum = existingDoc.currentVersionNumber + 1;
            await DocumentVersion.create({
              documentId: existingDoc._id,
              versionNumber: nextVersionNum,
              fileName,
              storagePath: '',
              sourceUrl: pdfUrl,
              sourcePageUrl: candidate.sourcePage,
              fileHash: inspection.fileHash,
              fileSize: inspection.fileSize,
              mimeType: 'application/pdf',
              totalPages: inspection.totalPages,
              totalChunks: 0,
              processingStatus: 'failed',
              processingError: errorDetail,
              isActive: false, // Inactive! Previous active version remains active
              createdBy: ownerId,
            });
            await appendJobLog(
              job,
              'info',
              `Preserved previous active Version ${existingDoc.currentVersionNumber} for "${existingDoc.title}"`,
              pdfUrl
            );
          } else {
            const classification = classifyDocument({
              title: inspection.extractedTitle,
              url: pdfUrl,
              fileName,
              text: inspection.firstPageText,
            });

            const newDoc = await Document.create({
              title: inspection.extractedTitle,
              description: `Discovered from NIT KKR public website: ${candidate.sourcePage}`,
              category: classification.category || source.defaultCategory || 'academics',
              department: source.defaultDepartment || 'General',
              documentType: classification.documentType || 'notice',
              sourceType: 'website',
              sourceAuthority: source.sourceAuthority || 'official',
              sourceUrl: pdfUrl,
              sourcePageUrl: candidate.sourcePage,
              publicationDate: inspection.detectedDate || new Date(),
              knowledgeBaseScope: classification.knowledgeBaseScope || 'student',
              academicYear: '2025-26',
              year: inspection.detectedDate ? inspection.detectedDate.getUTCFullYear() : 2025,
              websiteSourceId: source._id,
              discoveredAt: new Date(),
              lastCheckedAt: new Date(),
              originalFileName: fileName,
              storagePath: '',
              fileSize: inspection.fileSize,
              mimeType: 'application/pdf',
              uploadedBy: ownerId,
              totalPages: inspection.totalPages,
              totalChunks: 0,
              status: 'failed',
              errorMessage: errorDetail,
              currentVersionNumber: 1,
              isActive: false,
            });

            await DocumentVersion.create({
              documentId: newDoc._id,
              versionNumber: 1,
              fileName,
              storagePath: '',
              sourceUrl: pdfUrl,
              sourcePageUrl: candidate.sourcePage,
              fileHash: inspection.fileHash,
              fileSize: inspection.fileSize,
              mimeType: 'application/pdf',
              totalPages: inspection.totalPages,
              totalChunks: 0,
              processingStatus: 'failed',
              processingError: errorDetail,
              isActive: false,
              createdBy: ownerId,
            });
          }
        } catch (dbErr) {
          console.warn(`[CRAWLER WARNING] Failed to record oversized PDF failure record: ${dbErr.message}`);
        }
        continue;
      }

      // 4. Deduplication & Ingestion into Phase 5 Document Registry
      try {
        // 4a. Check URL match in existing Document collection
        const existingDoc = await Document.findOne({
          sourceUrl: pdfUrl,
          isDeleted: { $ne: true },
        }).populate('currentVersionId');

        if (existingDoc) {
          existingDoc.lastCheckedAt = new Date();

          // Check hash against current active version
          const activeVersion = existingDoc.currentVersionId;
          if (activeVersion && activeVersion.fileHash === inspection.fileHash) {
            // Unchanged document!
            job.metrics.documentsUnchanged++;
            await existingDoc.save();
            await appendJobLog(job, 'info', `PDF unchanged (Identical SHA-256): "${existingDoc.title}"`, pdfUrl);
            continue;
          } else {
            // Changed document -> Create new version!
            await appendJobLog(
              job,
              'info',
              `PDF content changed -> Creating Version ${existingDoc.currentVersionNumber + 1} for "${existingDoc.title}"`,
              pdfUrl
            );

            // Save new physical file
            const tempFileName = `crawl-${Date.now()}-${fileName}`;
            const tempPath = path.join(process.cwd(), 'uploads', tempFileName);
            try {
              fs.writeFileSync(tempPath, pdfFetch.buffer);
              const stored = await storageService.saveFile(tempPath, tempFileName);

              const nextVersionNum = existingDoc.currentVersionNumber + 1;
              const newVersion = await DocumentVersion.create({
                documentId: existingDoc._id,
                versionNumber: nextVersionNum,
                fileName,
                storagePath: stored.storagePath,
                sourceUrl: pdfUrl,
                sourcePageUrl: candidate.sourcePage,
                fileHash: inspection.fileHash,
                fileSize: inspection.fileSize,
                mimeType: 'application/pdf',
                totalPages: inspection.totalPages,
                processingStatus: 'validating',
                isActive: false,
                createdBy: ownerId,
              });

              // Process version through Phase 5 pipeline (updates existingDoc atomically on index)
              await processDocumentVersion(existingDoc._id, newVersion._id);
              job.metrics.documentsUpdated++;

              // Invalidate Redis cache
              try {
                await cacheInvalidation.invalidateOnDocumentMutation(existingDoc._id);
              } catch (cErr) {
                console.warn(`[CACHE WARNING] Failed to invalidate cache: ${cErr.message}`);
              }

              await appendJobLog(job, 'info', `Successfully indexed updated Version ${nextVersionNum}`, pdfUrl);
            } finally {
              // Delete temporary download file
              try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              } catch (cleanErr) {
                // Non-critical cleanup
              }
            }
            continue;
          }
        }

        // 4b. Check if same file exists under different URL (Hash Deduplication)
        const duplicateVersion = await DocumentVersion.findOne({
          fileHash: inspection.fileHash,
          isActive: true,
        }).populate('documentId');

        if (duplicateVersion && duplicateVersion.documentId && !duplicateVersion.documentId.isDeleted) {
          job.metrics.documentsDeduplicated++;
          await appendJobLog(
            job,
            'info',
            `PDF deduplicated: Identical SHA-256 content already indexed under "${duplicateVersion.documentId.title}"`,
            pdfUrl
          );
          continue;
        }

        // Classify document type, category, and knowledge base scope
        const classification = classifyDocument({
          title: inspection.extractedTitle,
          url: pdfUrl,
          fileName,
          text: inspection.firstPageText,
        });

        // 4c. Completely New 2025-26 Document!
        await appendJobLog(
          job,
          'info',
          `Ingesting new 2025-26 document: "${inspection.extractedTitle}" [Type: ${classification.documentType}, Scope: ${classification.knowledgeBaseScope}]`,
          pdfUrl
        );

        // Save physical file
        const tempFileName = `crawl-${Date.now()}-${fileName}`;
        const tempPath = path.join(process.cwd(), 'uploads', tempFileName);
        try {
          fs.writeFileSync(tempPath, pdfFetch.buffer);
          const stored = await storageService.saveFile(tempPath, tempFileName);

          const newDoc = await Document.create({
            title: inspection.extractedTitle,
            description: `Discovered from NIT KKR public website: ${candidate.sourcePage}`,
            category: classification.category || source.defaultCategory || 'academics',
            department: source.defaultDepartment || 'General',
            documentType: classification.documentType || 'notice',
            sourceType: 'website',
            sourceAuthority: source.sourceAuthority || 'official',
            sourceUrl: pdfUrl,
            sourcePageUrl: candidate.sourcePage,
            publicationDate: inspection.detectedDate || new Date(),
            knowledgeBaseScope: classification.knowledgeBaseScope || 'student',
            academicYear: '2025-26',
            year: inspection.detectedDate ? inspection.detectedDate.getUTCFullYear() : 2025,
            websiteSourceId: source._id,
            discoveredAt: new Date(),
            lastCheckedAt: new Date(),
            originalFileName: fileName,
            storagePath: stored.storagePath,
            fileSize: stored.fileSize,
            mimeType: 'application/pdf',
            uploadedBy: ownerId,
            status: 'validating',
            currentVersionNumber: 1,
            isActive: false, // Activated atomically by processDocumentVersion
          });

          const newVersion = await DocumentVersion.create({
            documentId: newDoc._id,
            versionNumber: 1,
            fileName,
            storagePath: stored.storagePath,
            sourceUrl: pdfUrl,
            sourcePageUrl: candidate.sourcePage,
            fileHash: inspection.fileHash,
            fileSize: inspection.fileSize,
            mimeType: 'application/pdf',
            totalPages: inspection.totalPages,
            processingStatus: 'validating',
            isActive: false,
            createdBy: ownerId,
          });

          // Run through Phase 5 pipeline
          await processDocumentVersion(newDoc._id, newVersion._id);
          job.metrics.documentsCreated++;

          // Invalidate Redis cache
          try {
            await cacheInvalidation.invalidateOnDocumentMutation(newDoc._id);
          } catch (cErr) {
            console.warn(`[CACHE WARNING] Failed to invalidate cache: ${cErr.message}`);
          }

          await appendJobLog(job, 'info', `Successfully ingested and indexed "${newDoc.title}"`, pdfUrl);
        } finally {
          // Delete temporary download file from disk to satisfy cleanup requirement
          try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
          } catch (cleanErr) {
            // Non-critical cleanup
          }
        }
      } catch (ingestErr) {
        job.metrics.documentsFailed++;
        if (ingestErr.message && ingestErr.message.includes('maximum page limit')) {
          await appendJobLog(
            job,
            'warn',
            `PDF exceeds maximum page limit. Pages: ${inspection?.totalPages || 'unknown'}, Maximum allowed: ${maxPdfPages}`,
            pdfUrl
          );
        } else {
          await appendJobLog(job, 'error', `Failed to ingest PDF: ${ingestErr.message}`, pdfUrl);
        }
      }
    }

    // ----------------------------------------------------
    // PHASE 3: COMPLETION & PERSISTENCE
    // ----------------------------------------------------
    job.status = 'completed';
    job.completedAt = new Date();

    // Populate per-source breakdown
    const sourceKey = source.name || 'NIT KKR Source';
    job.metrics.perSourceMetrics = {
      [sourceKey]: {
        pagesChecked: job.metrics.pagesFetched,
        pdfsDiscovered: job.metrics.pdfsDiscovered,
        pdfsEligible: job.metrics.pdfsEligible,
        pdfsSkippedOldYear: job.metrics.pdfsSkippedOldYear,
        pdfsYearUnknown: job.metrics.pdfsYearUnknown,
        documentsCreated: job.metrics.documentsCreated,
        documentsUpdated: job.metrics.documentsUpdated,
        documentsUnchanged: job.metrics.documentsUnchanged,
        documentsDeduplicated: job.metrics.documentsDeduplicated,
        documentsFailed: job.metrics.documentsFailed,
      },
    };
    job.markModified('metrics');

    await appendJobLog(job, 'info', `Crawl job completed successfully.`);
    await job.save();

    source.lastCrawlStatus = 'completed';
    source.lastCrawlAt = new Date();
    await source.save();

    return job;
  } catch (globalErr) {
    job.status = 'failed';
    job.error = globalErr.message;
    job.completedAt = new Date();
    await appendJobLog(job, 'error', `Crawl job failed with fatal error: ${globalErr.message}`);
    await job.save();

    source.lastCrawlStatus = 'failed';
    await source.save();

    throw globalErr;
  }
};

export default {
  executeCrawl,
};
