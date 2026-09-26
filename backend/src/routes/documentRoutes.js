import express from 'express';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
} from '../controllers/documentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { uploadPDF } from '../middleware/uploadMiddleware.js';

const router = express.Router();

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
