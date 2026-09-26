import Course from '../../models/Course.js';
import cacheService from '../cache/cacheService.js';
import cacheInvalidation from '../cache/cacheInvalidation.js';
import { hashQuery } from '../cache/cacheKey.js';

/**
 * Course Service - Manages structured university course data with Redis caching (Phase 6)
 */
class CourseService {
  /**
   * Search courses with keyword matching and structured filters
   * Cached in Redis under the active versioned namespace
   * 
   * @param {string} query - Keyword search
   * @param {object} filters - { department, program, semester, type }
   * @returns {Promise<Array<object>>}
   */
  async searchCourses(query = '', filters = {}) {
    const version = await cacheInvalidation.getCacheVersion();
    const cacheKey = `rag:v${version}:courses:${hashQuery(JSON.stringify({ query: query.toLowerCase().trim(), filters }))}`;

    // 1. Check Redis Cache
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cErr) {
      // cache bypass
    }

    // 2. Build MongoDB query
    const mongoQuery = { isActive: true };

    if (filters.department && filters.department !== 'all') {
      mongoQuery.department = new RegExp(filters.department, 'i');
    }

    if (filters.program && filters.program !== 'all') {
      mongoQuery.program = new RegExp(filters.program, 'i');
    }

    if (filters.semester) {
      const semNum = parseInt(filters.semester, 10);
      if (!isNaN(semNum) && semNum > 0) {
        mongoQuery.semester = semNum;
      }
    }

    if (filters.type && filters.type !== 'all') {
      mongoQuery.type = filters.type;
    }

    if (query && query.trim()) {
      const cleanTerm = query.trim();
      const codeRegex = new RegExp(cleanTerm.replace(/[-\s]/g, '[- ]?'), 'i');
      const textRegex = new RegExp(cleanTerm, 'i');

      mongoQuery.$or = [
        { code: codeRegex },
        { name: textRegex },
        { description: textRegex },
      ];
    }

    const courses = await Course.find(mongoQuery)
      .sort({ semester: 1, code: 1 })
      .limit(30)
      .lean();

    // 3. Store in Redis (1 hour TTL)
    try {
      await cacheService.set(cacheKey, JSON.stringify(courses), 3600);
    } catch (sErr) {
      // safe ignore
    }

    return courses;
  }

  /**
   * Get paginated courses for admin catalog management
   */
  async getCourses(filters = {}, pagination = { page: 1, limit: 20 }) {
    const query = {};

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      query.$or = [
        { code: new RegExp(term, 'i') },
        { name: new RegExp(term, 'i') },
        { department: new RegExp(term, 'i') },
      ];
    }

    if (filters.department && filters.department !== 'all') {
      query.department = new RegExp(filters.department, 'i');
    }

    if (filters.program && filters.program !== 'all') {
      query.program = filters.program;
    }

    if (filters.semester && filters.semester !== 'all') {
      query.semester = parseInt(filters.semester, 10);
    }

    if (filters.type && filters.type !== 'all') {
      query.type = filters.type;
    }

    if (filters.isActive !== undefined && filters.isActive !== 'all') {
      query.isActive = filters.isActive === 'true' || filters.isActive === true;
    }

    const page = Math.max(1, parseInt(pagination.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(pagination.limit || 20, 10)));
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      Course.find(query).sort({ semester: 1, code: 1 }).skip(skip).limit(limit).lean(),
      Course.countDocuments(query),
    ]);

    return {
      courses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single course by ID
   */
  async getCourseById(id) {
    return await Course.findById(id);
  }

  /**
   * Create new course and invalidate course cache
   */
  async createCourse(courseData) {
    const existing = await Course.findOne({ code: courseData.code.toUpperCase().trim() });
    if (existing) {
      const err = new Error(`Course with code "${courseData.code}" already exists.`);
      err.status = 409;
      throw err;
    }

    const course = await Course.create({
      ...courseData,
      code: courseData.code.toUpperCase().trim(),
    });

    await cacheInvalidation.incrementCacheVersion(`Course Created: ${course.code}`);
    return course;
  }

  /**
   * Update course and invalidate course cache
   */
  async updateCourse(id, updateData) {
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase().trim();
      const duplicate = await Course.findOne({ code: updateData.code, _id: { $ne: id } });
      if (duplicate) {
        const err = new Error(`Another course with code "${updateData.code}" already exists.`);
        err.status = 409;
        throw err;
      }
    }

    const course = await Course.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!course) {
      const err = new Error('Course not found');
      err.status = 404;
      throw err;
    }

    await cacheInvalidation.incrementCacheVersion(`Course Updated: ${course.code}`);
    return course;
  }

  /**
   * Delete or deactivate course
   */
  async deleteCourse(id) {
    const course = await Course.findByIdAndDelete(id);
    if (!course) {
      const err = new Error('Course not found');
      err.status = 404;
      throw err;
    }

    await cacheInvalidation.incrementCacheVersion(`Course Deleted: ${course.code}`);
    return { success: true, message: `Course "${course.code}" removed successfully.` };
  }
}

export const courseService = new CourseService();
export default courseService;
