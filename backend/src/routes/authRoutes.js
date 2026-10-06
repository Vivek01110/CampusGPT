import express from 'express';
import {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  logoutUser,
  getAdminCheck,
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Authentication endpoints protected by Redis rate limiting
router.post('/register', authRateLimiter, registerUser);
router.post('/login', authRateLimiter, loginUser);
router.get('/me', protect, getMe);
router.patch('/profile', protect, updateProfile);
router.post('/logout', logoutUser);

// Admin-only test/check endpoint
router.get('/admin-check', protect, authorize('admin'), getAdminCheck);

export default router;
