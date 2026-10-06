import mongoose from 'mongoose';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

/**
 * @desc    Register a new student or admin user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    // Check database connection status
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection offline. Please start local MongoDB or provide a valid MONGODB_URI in backend/.env.',
      });
    }

    const { name, email, password, role, department, year } = req.body;

    // Basic input validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: name, email, and password.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Validate role: only vivekadmin@gmail.com is allowed admin privileges
    const normalizedEmail = email.toLowerCase().trim();
    const assignedRole = (role === 'admin' && normalizedEmail === 'vivekadmin@gmail.com') ? 'admin' : 'student';

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: assignedRole,
      department: department?.trim() || 'Computer Science & Engineering',
      year: year?.trim() || '1st Year',
    });

    // Generate token
    const token = generateToken(user._id, user.role);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      data: {
        user: user.toSafeObject(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    // Check database connection status
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection offline. Please start local MongoDB or provide a valid MONGODB_URI in backend/.env.',
      });
    }

    const { email, password } = req.body;

    // Validate email and password presence
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    // Check for user and explicitly select password field
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials.',
      });
    }

    // Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password credentials.',
      });
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: user.toSafeObject(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently logged in user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = async (req, res, next) => {
  try {
    const safeUser = req.user.toSafeObject ? req.user.toSafeObject() : req.user;

    return res.status(200).json({
      success: true,
      message: 'User profile retrieved successfully.',
      data: {
        user: safeUser,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update authenticated user profile
 * @route   PATCH /api/auth/profile
 * @access  Private
 */
export const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      'name',
      'department',
      'branch',
      'program',
      'degree',
      'semester',
      'year',
      'batch',
      'academicYear',
      'campus',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true });
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user: updatedUser.toSafeObject(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Logout user (client clears stored token)
 * @route   POST /api/auth/logout
 * @access  Public / Private
 */
export const logoutUser = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'User logged out successfully.',
    data: null,
  });
};

/**
 * @desc    Admin verification endpoint
 * @route   GET /api/auth/admin-check
 * @access  Private (Admin only)
 */
export const getAdminCheck = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Admin access verified successfully.',
    data: {
      adminId: req.user._id,
      adminName: req.user.name,
      role: req.user.role,
      systemStatus: 'Operational',
      phase: 'Phase 1 - Foundation & Authentication',
    },
  });
};
