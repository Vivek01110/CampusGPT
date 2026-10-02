import express from 'express';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
  getDocumentFile,
} from '../controllers/documentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { uploadPDF } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Public / inline PDF file viewing
router.get('/:id/file', getDocumentFile);

// Admin only: Upload & Ingest PDF document
router.post(
  '/upload',
  protect,
  authorize('admin'),
  uploadPDF.single('file'),
  uploadDocument
);

// Authenticated users: List and view documents
router.get('/', protect, getDocuments);
router.get('/:id', protect, getDocumentById);

// Admin only: Delete document and Qdrant points
router.delete('/:id', protect, authorize('admin'), deleteDocument);

export default router;
