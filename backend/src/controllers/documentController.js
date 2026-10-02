import fs from 'fs';
import Document from '../models/Document.js';
import Chunk from '../models/Chunk.js';
import { ingestDocument } from '../services/documents/ingestionService.js';
import { deletePointsByDocumentId } from '../services/vector/qdrantService.js';
import cacheInvalidation from '../services/cache/cacheInvalidation.js';

/**
 * @desc    Upload and ingest a new university document
 * @route   POST /api/documents/upload
 * @access  Private (Admin only)
 */
export const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file was uploaded. Please attach a valid PDF document.',
      });
    }

    const {
      title,
      description,
      category = 'academics',
      department = 'General',
      documentType = 'regulation',
      sourceUrl = '',
    } = req.body;

    const docTitle = (title && title.trim()) || req.file.originalname.replace(/\.pdf$/i, '');

    // 1. Create document record in MongoDB
    const doc = await Document.create({
      title: docTitle,
      description: description?.trim() || '',
      category,
      department: department?.trim() || 'General',
      documentType,
      originalFileName: req.file.originalname,
      storagePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      sourceUrl: sourceUrl?.trim() || '',
      uploadedBy: req.user._id,
      status: 'uploaded',
    });

    // 2. Trigger ingestion pipeline (Parse -> Clean -> Chunk -> Embed -> Qdrant)
    try {
      const indexedDoc = await ingestDocument(doc._id);
      return res.status(201).json({
        success: true,
        message: 'Document uploaded and successfully indexed into vector database.',
        data: {
          document: indexedDoc,
        },
      });
    } catch (ingestError) {
      // Return 202/422 with failure status record
      return res.status(422).json({
        success: false,
        message: `Document uploaded but indexing failed: ${ingestError.message}`,
        data: {
          document: await Document.findById(doc._id),
        },
      });
    }
  } catch (error) {
    // Clean up uploaded file on unhandled failure
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        // Ignore unlink error
      }
    }
    next(error);
  }
};

/**
 * @desc    Get all documents with optional category or status filters
 * @route   GET /api/documents
 * @access  Private (Authenticated users)
 */
export const getDocuments = async (req, res, next) => {
  try {
    const { category, status, department, search } = req.query;
    const filter = {
      isDeleted: { $ne: true },
    };

    // Non-admin students only see active documents
    if (req.user?.role !== 'admin') {
      filter.isActive = { $ne: false };
    }

    if (category) filter.category = category;
    if (status) filter.status = status;
    if (department) filter.department = department;
    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    const documents = await Document.find(filter)
      .populate('uploadedBy', 'name role email')
      .populate('currentVersionId')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: 'Documents retrieved successfully.',
      count: documents.length,
      data: {
        documents,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single document details by ID
 * @route   GET /api/documents/:id
 * @access  Private (Authenticated users)
 */
export const getDocumentById = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('uploadedBy', 'name role email')
      .populate('currentVersionId');

    if (!doc || doc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        document: doc,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete document, its disk file, and all associated Qdrant vector points
 * @route   DELETE /api/documents/:id
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

    // 1. Delete points from Qdrant vector collection
    try {
      await deletePointsByDocumentId(doc._id.toString());
      console.log(`[QDRANT] Deleted points for document ${doc._id}`);
    } catch (qdrantErr) {
      console.warn(`[QDRANT Warning] Could not remove vector points: ${qdrantErr.message}`);
    }

    // 2. Remove file from disk
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      try {
        fs.unlinkSync(doc.storagePath);
      } catch (fileErr) {
        console.warn(`[File Warning] Could not unlink ${doc.storagePath}: ${fileErr.message}`);
      }
    }

    // 3. Delete chunks from MongoDB Chunk collection
    await Chunk.deleteMany({ documentId: req.params.id });

    // 4. Delete document record from MongoDB
    await Document.findByIdAndDelete(req.params.id);

    // 5. Invalidate RAG cache version so queries no longer serve deleted document answers
    try {
      await cacheInvalidation.incrementCacheVersion(`Document Deleted: ${doc.title}`);
    } catch (cacheErr) {
      console.warn(`[CACHE WARNING] Could not bump cache version: ${cacheErr.message}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Document, file, and all vector points deleted successfully.',
      data: null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    View / download document file inline in browser
 * @route   GET /api/documents/:id/file
 * @access  Public
 */
export const getDocumentFile = async (req, res, next) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc || doc.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
      });
    }

    // 1. If file exists on physical storage, stream inline
    if (doc.storagePath && fs.existsSync(doc.storagePath)) {
      res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
      const safeFilename = encodeURIComponent(doc.originalFileName || `${doc.title}.pdf`);
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
      return fs.createReadStream(doc.storagePath).pipe(res);
    }

    // 2. If original sourceUrl exists (e.g. official portal link), redirect
    if (doc.sourceUrl) {
      return res.redirect(doc.sourceUrl);
    }

    return res.status(404).json({
      success: false,
      message: 'Document file not found on disk.',
    });
  } catch (error) {
    next(error);
  }
};

export default {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
  getDocumentFile,
};
