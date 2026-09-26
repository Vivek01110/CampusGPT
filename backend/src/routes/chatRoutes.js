import express from 'express';
import { sendMessage, getChatHistory, debugRetrieval } from '../controllers/chatController.js';
import { protect } from '../middleware/authMiddleware.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Private: Send campus inquiry to RAG system (rate limited by Redis)
router.post('/', protect, chatRateLimiter, sendMessage);

// Private: Retrieve user's previous dialogue history
router.get('/history', protect, getChatHistory);

// Protected: Diagnostics / debug retrieval endpoint (Admin or Dev only)
router.post('/debug', protect, debugRetrieval);

export default router;
