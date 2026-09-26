import courseService from '../services/courses/courseService.js';

/**
 * Admin Course Controller (Phase 6)
 */

export const getAdminCourses = async (req, res, next) => {
  try {
    const { search, department, program, semester, type, isActive, page, limit } = req.query;
    const result = await courseService.getCourses(
      { search, department, program, semester, type, isActive },
      { page, limit }
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminCourseById = async (req, res, next) => {
  try {
    const course = await courseService.getCourseById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    return res.status(200).json({ success: true, data: { course } });
  } catch (error) {
    next(error);
  }
};

export const createAdminCourse = async (req, res, next) => {
  try {
    const { code, name, department, program, semester, credits, type, description, prerequisites, syllabusUrl } = req.body;

    if (!code || !name || !department || !semester) {
      return res.status(400).json({
        success: false,
        message: 'Course code, name, department, and semester are required.',
      });
    }

    const course = await courseService.createCourse({
      code,
      name,
      department,
      program: program || 'B.Tech',
      semester: parseInt(semester, 10),
      credits: credits ? parseFloat(credits) : 3,
      type: type || 'core',
      description: description || '',
      prerequisites: Array.isArray(prerequisites) ? prerequisites : [],
      syllabusUrl: syllabusUrl || '',
      createdBy: req.user?._id,
    });

    return res.status(201).json({
      success: true,
      message: `Course ${course.code} created successfully.`,
      data: { course },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminCourse = async (req, res, next) => {
  try {
    const course = await courseService.updateCourse(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: `Course ${course.code} updated successfully.`,
      data: { course },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminCourse = async (req, res, next) => {
  try {
    const result = await courseService.deleteCourse(req.params.id);
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAdminCourses,
  getAdminCourseById,
  createAdminCourse,
  updateAdminCourse,
  deleteAdminCourse,
};
