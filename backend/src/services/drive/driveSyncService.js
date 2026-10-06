import PyqSyncJob from '../../models/PyqSyncJob.js';
import PyqDocument from '../../models/PyqDocument.js';
import CrawlUrl from '../../models/CrawlUrl.js';
import driveClient from './driveClient.js';
import pyqProcessor from '../pyq/pyqProcessor.js';

/**
 * Append log entry to PyqSyncJob
 */
const appendSyncLog = async (job, level, message, details = null) => {
  job.logs.push({
    timestamp: new Date(),
    level,
    message,
    details,
  });
  console.log(`[DRIVE SYNC ${level.toUpperCase()}] ${message}`);
  // Keep logs bounded to last 200 entries to prevent document bloat
  if (job.logs.length > 200) {
    job.logs = job.logs.slice(-200);
  }
};

/**
 * Reconcile stale sync jobs that were left running after server crashes/restarts
 */
export const reconcileStaleSyncJobs = async () => {
  const staleThreshold = new Date(Date.now() - 20 * 60 * 1000);
  const staleJobs = await PyqSyncJob.find({
    status: 'running',
    updatedAt: { $lt: staleThreshold },
  });
  for (const job of staleJobs) {
    job.status = 'stopped';
    job.completedAt = new Date();
    job.error = 'Sync automatically stopped due to inactivity or server restart.';
    await appendSyncLog(job, 'warn', 'Marked stale running job as stopped.');
    await job.save();
  }
};

/**
 * Stop any active Drive sync job
 */
export const stopDriveSync = async (jobId = null) => {
  const query = jobId ? { _id: jobId, status: 'running' } : { status: 'running' };
  const jobs = await PyqSyncJob.find(query);
  for (const job of jobs) {
    job.status = 'stopped';
    job.completedAt = new Date();
    await appendSyncLog(job, 'warn', 'Sync was stopped by user request.');
    await job.save();
  }
  return jobs;
};

/**
 * Execute Public Google Drive Sync Asynchronously
 * 
 * @param {string} syncType - 'FULL_SYNC' | 'INCREMENTAL_SYNC'
 * @param {string} [userId] - Admin user triggering sync
 * @param {string} [customFolderUrl] - Optional override folder URL
 * @returns {Promise<object>} Created PyqSyncJob document
 */
export const startDriveSync = async (syncType = 'FULL_SYNC', userId = null, customFolderUrl = null) => {
  const rootUrl = customFolderUrl || process.env.PYQ_DRIVE_FOLDER_URL;
  if (!rootUrl) {
    throw new Error('PYQ_DRIVE_FOLDER_URL environment variable is not configured');
  }

  const rootFolderId = driveClient.extractFolderId(rootUrl);
  if (!rootFolderId) {
    throw new Error(`Could not extract Google Drive folder ID from URL: ${rootUrl}`);
  }

  // Reconcile stale jobs first
  await reconcileStaleSyncJobs();

  // If there's an active running job, avoid duplicate concurrent syncs
  const activeExisting = await PyqSyncJob.findOne({ status: 'running' });
  if (activeExisting) {
    throw new Error('A Drive sync is already actively running. Please stop it or wait for it to finish.');
  }

  // Create Sync Job
  const job = await PyqSyncJob.create({
    syncType,
    status: 'running',
    rootFolderUrl: rootUrl,
    rootFolderId,
    startedAt: new Date(),
    triggeredBy: userId,
    metrics: {
      foldersDiscovered: 1,
      pdfsDiscovered: 0,
      pdfsProcessed: 0,
      pdfsSkippedUnchanged: 0,
      pdfsDuplicates: 0,
      questionsExtracted: 0,
      chunksCreated: 0,
      qdrantVectorsUpserted: 0,
      failed: 0,
    },
    logs: [],
  });

  await appendSyncLog(
    job,
    'info',
    `Starting ${syncType} for Public Google Drive (Folder ID: ${rootFolderId})`
  );
  await job.save();

  // Run async in background without blocking the HTTP caller
  setImmediate(async () => {
    try {
      await runSyncEngine(job);
    } catch (fatalErr) {
      console.error(`[DRIVE SYNC FATAL]`, fatalErr);
      job.status = 'failed';
      job.error = fatalErr.message;
      job.completedAt = new Date();
      await appendSyncLog(job, 'error', `Sync failed with fatal error: ${fatalErr.message}`);
      await job.save();
    }
  });

  return job;
};

/**
 * Internal Sync Engine Runner
 */
const runSyncEngine = async (job) => {
  const isIncremental = job.syncType === 'INCREMENTAL_SYNC';
  const visitedFolderIds = new Set();
  const folderQueue = [
    {
      id: job.rootFolderId,
      path: 'Question Papers',
      depth: 0,
    },
  ];

  const discoveredPdfs = [];

  // 1. Pre-seed candidate PDFs from CrawlUrl if previously discovered
  const cachedPdfUrls = await CrawlUrl.find({ sourceType: 'student_drive', type: 'pdf' }).lean();
  if (cachedPdfUrls.length > 0) {
    for (const cu of cachedPdfUrls) {
      discoveredPdfs.push({
        fileItem: {
          id: cu.driveFileId,
          name: cu.metadata?.name || `Document_${cu.driveFileId}.pdf`,
          webViewLink: cu.url,
          webContentLink: `https://drive.google.com/uc?export=download&id=${cu.driveFileId}`,
          size: cu.fileSize || 0,
        },
        folderPath: cu.metadata?.folderPath || 'Question Papers',
        folderMetadata: cu.metadata?.folderMetadata || driveClient.extractMetadataFromFolderPath(cu.metadata?.folderPath || ''),
      });
    }
    job.metrics.pdfsDiscovered = discoveredPdfs.length;
    await appendSyncLog(
      job,
      'info',
      `Loaded ${discoveredPdfs.length} candidate PDF(s) from database index for immediate processing.`
    );
    await job.save();
  }

  // ----------------------------------------------------
  // PHASE 1: RECURSIVE FOLDER & FILE DISCOVERY (PARALLELIZED)
  // ----------------------------------------------------
  // In Incremental Sync, if we already have candidate PDFs discovered, skip the 40-minute web crawl and start ingesting immediately!
  const shouldSkipDiscovery = isIncremental && discoveredPdfs.length > 0;

  if (shouldSkipDiscovery) {
    await appendSyncLog(
      job,
      'info',
      `Incremental Sync: Skipping redundant folder crawl (${discoveredPdfs.length} PDFs already catalogued). Proceeding directly to question extraction.`
    );
  } else {
    job.metrics.currentPhase = 'DISCOVERY';
    job.metrics.statusMessage = 'Discovering Google Drive folders...';
    await job.save();

    while (folderQueue.length > 0) {
      // Check cancellation
      const refreshed = await PyqSyncJob.findById(job._id).select('status');
      if (refreshed?.status === 'stopped' || refreshed?.status === 'failed') {
        console.log(`[DRIVE SYNC] Job ${job._id} stopped during discovery.`);
        return;
      }

      // Process up to 6 folders concurrently for maximum traversal throughput
      const currentBatch = folderQueue.splice(0, 6);

      await Promise.all(
        currentBatch.map(async (currentFolder) => {
          if (visitedFolderIds.has(currentFolder.id)) return;
          visitedFolderIds.add(currentFolder.id);

          let items = [];
          try {
            items = await driveClient.listFolderItems(currentFolder.id);
          } catch (listErr) {
            await appendSyncLog(job, 'warn', `Failed to list folder ${currentFolder.path}: ${listErr.message}`);
            return;
          }

          const folderMetadata = driveClient.extractMetadataFromFolderPath(currentFolder.path);

          for (const item of items) {
            if (item.isFolder) {
              if (!visitedFolderIds.has(item.id)) {
                const childPath = `${currentFolder.path} / ${item.name}`;
                folderQueue.push({
                  id: item.id,
                  path: childPath,
                  depth: currentFolder.depth + 1,
                });
                job.metrics.foldersDiscovered++;

                // Register in CrawlUrl
                await CrawlUrl.findOneAndUpdate(
                  { normalizedUrl: item.webViewLink, sourceType: 'student_drive' },
                  {
                    url: item.webViewLink,
                    normalizedUrl: item.webViewLink,
                    sourceType: 'student_drive',
                    type: 'folder',
                    status: 'processed',
                    driveFolderId: item.id,
                    depth: currentFolder.depth + 1,
                    firstDiscoveredAt: new Date(),
                  },
                  { upsert: true }
                );
              }
            } else if (item.isPdf) {
              job.metrics.pdfsDiscovered++;
              discoveredPdfs.push({
                fileItem: item,
                folderPath: currentFolder.path,
                folderMetadata,
              });

              // Register in CrawlUrl as discovered/queued with metadata for fast incremental re-runs
              await CrawlUrl.findOneAndUpdate(
                { normalizedUrl: item.webViewLink, sourceType: 'student_drive' },
                {
                  url: item.webViewLink,
                  normalizedUrl: item.webViewLink,
                  sourceType: 'student_drive',
                  type: 'pdf',
                  status: 'queued',
                  driveFileId: item.id,
                  depth: currentFolder.depth,
                  metadata: {
                    name: item.name,
                    folderPath: currentFolder.path,
                    folderMetadata,
                  },
                  firstDiscoveredAt: new Date(),
                },
                { upsert: true }
              );
            }
          }
        })
      );

      job.metrics.statusMessage = `Scanning folders (${visitedFolderIds.size} folders scanned, ${discoveredPdfs.length} PDFs discovered)...`;

      // Periodic progress save & cancellation check on every batch
      await job.save();
    }
  }

  job.metrics.currentPhase = 'INGESTION';
  job.metrics.statusMessage = `Ingesting ${discoveredPdfs.length} question papers...`;
  await appendSyncLog(
    job,
    'info',
    `Catalogued ${discoveredPdfs.length} candidate PDF(s). Starting extraction...`
  );
  await job.save();

  // ----------------------------------------------------
  // PHASE 2: PDF DOWNLOAD, METADATA & QUESTION INGESTION
  // ----------------------------------------------------
  const concurrency = parseInt(process.env.PYQ_INGESTION_CONCURRENCY || '8', 10);

  // Upfront in-memory index map to eliminate per-document database round-trips for unchanged files
  const allDiscoveredIds = discoveredPdfs.map((p) => p.fileItem.id);
  const existingDocs = await PyqDocument.find(
    { fileId: { $in: allDiscoveredIds } },
    'fileId processingStatus status error lastCrawledAt'
  ).lean();

  const existingMap = new Map();
  for (const doc of existingDocs) {
    existingMap.set(doc.fileId, doc);
  }

  // Pre-filter unchanged PDFs in milliseconds
  const pendingPdfs = [];
  for (const item of discoveredPdfs) {
    const existing = existingMap.get(item.fileItem.id);
    if (existing && (existing.processingStatus === 'INDEXED' || existing.status === 'approved') && !existing.error) {
      if (
        !item.fileItem.modifiedTime ||
        !existing.lastCrawledAt ||
        new Date(item.fileItem.modifiedTime) <= new Date(existing.lastCrawledAt)
      ) {
        job.metrics.pdfsSkippedUnchanged++;
        continue;
      }
    }
    pendingPdfs.push(item);
  }

  job.metrics.statusMessage = `Ingesting ${pendingPdfs.length} question papers (${job.metrics.pdfsSkippedUnchanged} skipped as unchanged)...`;
  await job.save();

  for (let i = 0; i < pendingPdfs.length; i += concurrency) {
    // Check if job was stopped by admin
    const checkJob = await PyqSyncJob.findById(job._id).select('status');
    if (checkJob?.status === 'stopped' || checkJob?.status === 'failed') {
      console.log(`[DRIVE SYNC] Job ${job._id} stopped during ingestion loop.`);
      return;
    }

    const batch = pendingPdfs.slice(i, i + concurrency);
    job.metrics.statusMessage = `Processing PDF (${i + 1}/${pendingPdfs.length}): "${batch[0]?.fileItem?.name || ''}"`;

    await Promise.allSettled(
      batch.map(async ({ fileItem, folderPath, folderMetadata }, batchIdx) => {
        const itemIndex = i + batchIdx + 1;

        await appendSyncLog(
          job,
          'info',
          `Downloading and processing PDF (${itemIndex}/${pendingPdfs.length}): "${fileItem.name}"`,
          { folderPath }
        );

        let downloadResult;
        try {
          downloadResult = await driveClient.downloadPublicDrivePdf(fileItem.id);
        } catch (dlErr) {
          job.metrics.failed++;
          await appendSyncLog(job, 'warn', `Failed to download PDF "${fileItem.name}": ${dlErr.message}`);
          await CrawlUrl.findOneAndUpdate(
            { normalizedUrl: fileItem.webViewLink, sourceType: 'student_drive' },
            { status: 'failed', error: dlErr.message }
          );
          return;
        }

        // Process PDF content, metadata, question-level indexing & Qdrant upsert
        try {
          const processResult = await pyqProcessor.processDrivePdf(
            fileItem,
            downloadResult.buffer,
            folderPath,
            folderMetadata
          );

          if (processResult.skipped) {
            job.metrics.pdfsDuplicates++;
            await appendSyncLog(
              job,
              'debug',
              `Skipped identical duplicate content for: "${fileItem.name}"`
            );
          } else {
            job.metrics.pdfsProcessed++;
            if (processResult.extractionMethod === 'vision') {
              job.metrics.scannedPdfs = (job.metrics.scannedPdfs || 0) + 1;
            } else {
              job.metrics.nativeTextPdfs = (job.metrics.nativeTextPdfs || 0) + 1;
            }

            const qCount = processResult.doc.questionCount || 0;
            job.metrics.questionsExtracted = (job.metrics.questionsExtracted || 0) + qCount;
            job.metrics.questionsIndexed = (job.metrics.questionsIndexed || 0) + qCount;
            job.metrics.chunksCreated = (job.metrics.chunksCreated || 0) + (processResult.doc.chunkCount || qCount);
            job.metrics.qdrantVectorsUpserted =
              (job.metrics.qdrantVectorsUpserted || 0) + (processResult.doc.chunkCount || qCount);

            await appendSyncLog(
              job,
              'info',
              `Successfully indexed PYQ [${processResult.extractionMethod?.toUpperCase()}]: "${processResult.doc.name}" (${qCount} questions, ${processResult.doc.chunkCount} vectors)`
            );
          }
        } catch (procErr) {
          job.metrics.failed++;
          await appendSyncLog(
            job,
            'warn',
            `Failed to process/index PYQ "${fileItem.name}": ${procErr.message}`
          );
          await CrawlUrl.findOneAndUpdate(
            { normalizedUrl: fileItem.webViewLink, sourceType: 'student_drive' },
            { status: 'failed', error: procErr.message }
          );
        }
      })
    );

    // Periodic state save after each concurrent batch
    await job.save();
  }

  // ----------------------------------------------------
  // COMPLETION
  // ----------------------------------------------------
  job.status = 'completed';
  job.completedAt = new Date();
  job.metrics.currentPhase = 'COMPLETED';
  job.metrics.statusMessage = `Sync complete! Processed ${job.metrics.pdfsProcessed} papers, ${job.metrics.questionsExtracted} questions.`;
  await appendSyncLog(
    job,
    'info',
    `PYQ Sync completed successfully! Processed: ${job.metrics.pdfsProcessed}, Skipped: ${job.metrics.pdfsSkippedUnchanged}, Duplicates: ${job.metrics.pdfsDuplicates}, Questions: ${job.metrics.questionsExtracted}, Qdrant vectors: ${job.metrics.qdrantVectorsUpserted}, Failed: ${job.metrics.failed}.`
  );
  await job.save();
};

/**
 * Get active or latest sync job
 */
export const getLatestSyncJob = async () => {
  return await PyqSyncJob.findOne().sort({ createdAt: -1 });
};

export default {
  startDriveSync,
  stopDriveSync,
  reconcileStaleSyncJobs,
  getLatestSyncJob,
};
