import express from 'express';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
} from '../controllers/conversationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All conversation routes require authentication
router.use(protect);

router.route('/')
  .get(listConversations)
  .post(createConversation);

router.route('/:id')
  .get(getConversation)
  .patch(updateConversation)
  .delete(deleteConversation);

export default router;
