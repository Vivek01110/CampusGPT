import fs from 'fs';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import Chunk from '../models/Chunk.js';
import IngestionJob from '../models/IngestionJob.js';
import {
  processDocumentVersion,
  reindexDocument as serviceReindex,
  retryVersionIngestion as serviceRetry,
} from '../services/ingestion/ingestionService.js';
import { calculateFileHash } from '../services/ingestion/fileHasher.js';
import {
  validateDocumentMetadata,
  validatePhysicalFile,
} from '../services/ingestion/documentValidator.js';
import { storageService } from '../services/storage/storageService.js';
import {
  deletePointsByDocumentId,
  setPointsActiveByVersionId,
} from '../services/vector/qdrantService.js';
import cacheInvalidation from '../services/cache/cacheInvalidation.js';

/**
 * @desc    Get paginated admin document registry with filters
 * @route   GET /api/admin/documents
 * @access  Private (Admin only)
 */
export const getAdminDocuments = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '10', 10)));
    const skip = (page - 1) * limit;

    const { category, department, documentType, status, isActive, search } = req.query;

    const filter = {
      isDeleted: { $ne: true }, // Default: exclude soft-deleted
    };

    if (category) filter.category = category;
    if (department) filter.department = department;
    if (documentType) filter.documentType = documentType;
    if (status) filter.status = status;
    if (isActive !== undefined && isActive !== '') {
      filter.isActive = isActive === 'true';
    }

    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { originalFileName: { $regex: search.trim(), $options: 'i' } },
        { department: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const total = await Document.countDocuments(filter);
    const documents = await Document.find(filter)
      .populate('uploadedBy', 'name email role')
      .populate('currentVersionId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      message: 'Admin document registry retrieved.',
      data: {
        documents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get single document with full version history
 * @route   GET /api/admin/documents/:id
 * @access  Private (Admin only)
 */
export const getAdminDocumentById = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('uploadedBy', 'name email role')
      .populate('currentVersionId');

    if (!doc || doc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or has been deleted.',
      });
    }

    const versions = await DocumentVersion.find({ documentId: doc._id })
      .populate('createdBy', 'name email')
      .sort({ versionNumber: -1 });

    const latestJob = await IngestionJob.findOne({ documentId: doc._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        document: doc,
        versions,
        latestJob,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Create new document record and ingest Version 1
 * @route   POST /api/admin/documents
 * @access  Private (Admin only)
 */
export const createDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid PDF document to upload.',
      });
    }

    // 1. Validate file
    const fileVal = validatePhysicalFile(req.file.path);
    if (!fileVal.isValid) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: fileVal.error,
      });
    }

    // 2. Validate metadata
    const {
      title,
      description = '',
      category = 'academics',
      department = 'General',
      documentType = 'regulation',
      sourceType = 'upload',
      sourceAuthority = 'official',
      sourceUrl = '',
      year,
      academicYear,
    } = req.body;

    const docTitle = title?.trim() || req.file.originalname.replace(/\.pdf$/i, '');
    const metaVal = validateDocumentMetadata({
      title: docTitle,
      category,
      department,
      documentType,
      sourceType,
      sourceAuthority,
      sourceUrl,
    });

    if (!metaVal.isValid) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: metaVal.errors.join(' '),
      });
    }

    // 3. Compute file hash
    const fileHash = await calculateFileHash(req.file.path);

    // Check if an existing active document has identical hash
    const duplicateDoc = await Document.findOne({
      fileHash,
      isDeleted: { $ne: true },
    });
    if (duplicateDoc) {
      console.warn(`[INGESTION] Warning: Uploaded file matches existing document "${duplicateDoc.title}"`);
    }

    // 4. Save file via Storage Service
    const stored = await storageService.saveFile(req.file.path, req.file.filename);

    // 5. Create Document record
    const doc = await Document.create({
      title: docTitle,
      description: description.trim(),
      category,
      department: department.trim() || 'General',
      documentType,
      sourceType,
      sourceAuthority,
      sourceUrl: sourceUrl.trim(),
      year: year ? parseInt(year, 10) : null,
      academicYear: academicYear?.trim() || null,
      originalFileName: req.file.originalname,
      storagePath: stored.storagePath,
      fileSize: stored.fileSize,
      mimeType: req.file.mimetype,
      uploadedBy: req.user._id,
      status: 'validating',
      currentVersionNumber: 1,
      isActive: false, // Activated atomically once indexed
    });

    // 6. Create Version 1 record
    const version = await DocumentVersion.create({
      documentId: doc._id,
      versionNumber: 1,
      fileName: req.file.originalname,
      storagePath: stored.storagePath,
      sourceUrl: sourceUrl.trim(),
      fileHash,
      fileSize: stored.fileSize,
      mimeType: req.file.mimetype,
      processingStatus: 'validating',
      currentStage: 'validating',
      processingProgress: 10,
      createdBy: req.user._id,
      isActive: false,
    });

    // 7. Create Ingestion Job
    const job = await IngestionJob.create({
      documentId: doc._id,
      documentVersionId: version._id,
      status: 'processing',
      currentStage: 'validating',
      progress: 10,
      createdBy: req.user._id,
      startedAt: new Date(),
    });

    // 8. Process version
    try {
      const result = await processDocumentVersion({
        documentId: doc._id,
        versionId: version._id,
        jobId: job._id,
      });

      return res.status(201).json({
        success: true,
        message: 'Document and Version 1 successfully created and indexed.',
        data: {
          document: result.document,
          version: result.version,
        },
      });
    } catch (ingestErr) {
      return res.status(422).json({
        success: false,
        message: `Document created, but initial indexing failed: ${ingestErr.message}`,
        data: {
          document: await Document.findById(doc._id),
          version: await DocumentVersion.findById(version._id),
        },
      });
    }
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    next(err);
  }
};

/**
 * @desc    Upload a new version for an existing document
 * @route   POST /api/admin/documents/:id/versions
 * @access  Private (Admin only)
 */
export const uploadNewVersion = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc || doc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid PDF document for the new version.',
      });
    }

    // 1. Validate physical file
    const fileVal = validatePhysicalFile(req.file.path);
    if (!fileVal.isValid) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: fileVal.error,
      });
    }

    // 2. Calculate file hash
    const newFileHash = await calculateFileHash(req.file.path);

    // 3. Compare with current active version hash
    const currentVersion = doc.currentVersionId
      ? await DocumentVersion.findById(doc.currentVersionId)
      : null;

    if (currentVersion && currentVersion.fileHash === newFileHash) {
      // Clean up uploaded redundant file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(409).json({
        success: false,
        isDuplicate: true,
        message: `This document is identical to current Version ${currentVersion.versionNumber}. No new version created.`,
        data: {
          currentVersion,
        },
      });
    }

    // 4. Determine next sequential version number
    const latestVersion = await DocumentVersion.findOne({ documentId: doc._id }).sort({ versionNumber: -1 });
    const nextVerNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    // 5. Store file
    const stored = await storageService.saveFile(req.file.path, req.file.filename);

    // 6. Create new DocumentVersion record (inactive initially)
    const newVersion = await DocumentVersion.create({
      documentId: doc._id,
      versionNumber: nextVerNumber,
      fileName: req.file.originalname,
      storagePath: stored.storagePath,
      sourceUrl: req.body.sourceUrl?.trim() || doc.sourceUrl || '',
      fileHash: newFileHash,
      fileSize: stored.fileSize,
      mimeType: req.file.mimetype,
      processingStatus: 'validating',
      currentStage: 'validating',
      processingProgress: 10,
      createdBy: req.user._id,
      isActive: false, // Activated atomically only on successful indexing!
    });

    // 7. Create Ingestion Job
    const job = await IngestionJob.create({
      documentId: doc._id,
      documentVersionId: newVersion._id,
      status: 'processing',
      currentStage: 'validating',
      progress: 10,
      createdBy: req.user._id,
      startedAt: new Date(),
    });

    // 8. Process version
    try {
      const result = await processDocumentVersion({
        documentId: doc._id,
        versionId: newVersion._id,
        jobId: job._id,
      });

      return res.status(201).json({
        success: true,
        message: `Version ${nextVerNumber} successfully indexed and activated.`,
        data: {
          document: result.document,
          version: result.version,
        },
      });
    } catch (ingestErr) {
      return res.status(422).json({
        success: false,
        message: `Version ${nextVerNumber} created but indexing failed: ${ingestErr.message}. Previous active version remains in service.`,
        data: {
          document: await Document.findById(doc._id),
          version: await DocumentVersion.findById(newVersion._id),
        },
      });
    }
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    next(err);
  }
};

/**
 * @desc    Get all versions for a document
 * @route   GET /api/admin/documents/:id/versions
 * @access  Private (Admin only)
 */
export const getDocumentVersions = async (req, res, next) => {
  try {
    const versions = await DocumentVersion.find({ documentId: req.params.id })
      .populate('createdBy', 'name email')
      .sort({ versionNumber: -1 });

    return res.status(200).json({
      success: true,
      count: versions.length,
      data: {
        versions,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Re-index the current active version of a document
 * @route   POST /api/admin/documents/:id/reindex
 * @access  Private (Admin only)
 */
export const reindexDocument = async (req, res, next) => {
  try {
    const result = await serviceReindex(req.params.id, req.user._id);

    return res.status(200).json({
      success: true,
      message: `Active Version ${result.version.versionNumber} successfully re-indexed.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Retry ingestion for a failed document version
 * @route   POST /api/admin/documents/:id/retry
 * @access  Private (Admin only)
 */
export const retryVersion = async (req, res, next) => {
  try {
    const versionId = req.body?.versionId;
    if (!versionId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide versionId to retry.',
      });
    }

    const result = await serviceRetry(versionId, req.user._id);

    return res.status(200).json({
      success: true,
      message: `Version ${result.version.versionNumber} ingestion retried and activated.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Toggle document active/inactive status
 * @route   PATCH /api/admin/documents/:id/status
 * @access  Private (Admin only)
 */
export const setDocumentStatus = async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean (true or false).',
      });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc || doc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    doc.isActive = isActive;
    doc.status = isActive ? 'indexed' : 'inactive';
    await doc.save();

    // Toggle active version and its chunks
    if (doc.currentVersionId) {
      await DocumentVersion.findByIdAndUpdate(doc.currentVersionId, { isActive });
      await Chunk.updateMany({ documentVersionId: doc.currentVersionId }, { isActive });

      try {
        await setPointsActiveByVersionId(doc.currentVersionId.toString(), isActive);
      } catch (qErr) {
        console.warn(`[STATUS WARNING] Failed to update Qdrant points: ${qErr.message}`);
      }
    }

    // Invalidate RAG cache
    try {
      await cacheInvalidation.incrementCacheVersion(
        `Document Status Changed: "${doc.title}" (isActive: ${isActive})`
      );
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: `Document "${doc.title}" is now ${isActive ? 'ACTIVE' : 'INACTIVE'}.`,
      data: {
        document: doc,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Soft-delete document and exclude from retrieval
 * @route   DELETE /api/admin/documents/:id
 * @access  Private (Admin only)
 */
export const deleteDocument = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // 1. Soft-delete document record
    doc.isDeleted = true;
    doc.isActive = false;
    doc.deletedAt = new Date();
    await doc.save();

    // 2. Mark all versions and chunks inactive
    await DocumentVersion.updateMany({ documentId: doc._id }, { isActive: false });
    await Chunk.updateMany({ documentId: doc._id }, { isActive: false });

    // 3. Deactivate or delete points from Qdrant vector collection
    try {
      await deletePointsByDocumentId(doc._id.toString());
      console.log(`[QDRANT] Purged vector points for deleted document ${doc._id}`);
    } catch (qdrantErr) {
      console.warn(`[QDRANT WARNING] Could not purge vector points: ${qdrantErr.message}`);
    }

    // 4. Invalidate RAG cache version
    try {
      await cacheInvalidation.incrementCacheVersion(`Document Deleted: "${doc.title}"`);
    } catch (cacheErr) {
      console.warn(`[CACHE WARNING] Could not bump cache version: ${cacheErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: `Document "${doc.title}" has been soft-deleted and permanently excluded from retrieval.`,
      data: null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get live ingestion status/stage for document
 * @route   GET /api/admin/documents/:id/status
 * @access  Private (Admin only)
 */
export const getDocumentStatus = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id).populate('currentVersionId');
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    const latestJob = await IngestionJob.findOne({ documentId: doc._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: {
        documentId: doc._id,
        status: doc.status,
        isActive: doc.isActive,
        version: doc.currentVersionNumber,
        currentStage: latestJob?.currentStage || doc.status,
        progress: latestJob?.progress ?? (doc.status === 'indexed' ? 100 : 0),
        error: latestJob?.error || doc.errorMessage,
      },
    });
  } catch (err) {
    next(err);
  }
};

export default {
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
};
