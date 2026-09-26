import AcademicEvent from '../../models/AcademicEvent.js';
import cacheService from '../cache/cacheService.js';
import cacheInvalidation from '../cache/cacheInvalidation.js';
import { hashQuery } from '../cache/cacheKey.js';

/**
 * Academic Event Service - Manages university deadlines, calendar dates & registrations (Phase 6)
 */
class AcademicEventService {
  /**
   * Search academic events and deadlines with Redis caching
   * 
   * @param {string} query - Keyword search
   * @param {object} filters - { eventType, program, department, upcomingOnly }
   * @returns {Promise<Array<object>>}
   */
  async searchEvents(query = '', filters = {}) {
    const version = await cacheInvalidation.getCacheVersion();
    const cacheKey = `rag:v${version}:events:${hashQuery(JSON.stringify({ query: query.toLowerCase().trim(), filters }))}`;

    // 1. Check Redis Cache
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cErr) {
      // safe cache bypass
    }

    // 2. Build MongoDB query
    const mongoQuery = { isActive: true };

    if (filters.eventType && filters.eventType !== 'all') {
      mongoQuery.eventType = filters.eventType;
    }

    if (filters.program && filters.program !== 'all') {
      mongoQuery.program = { $in: [new RegExp(filters.program, 'i'), 'all'] };
    }

    if (filters.department && filters.department !== 'all') {
      mongoQuery.department = { $in: [new RegExp(filters.department, 'i'), 'all'] };
    }

    if (filters.upcomingOnly) {
      const now = new Date();
      mongoQuery.$or = [
        { registrationDeadline: { $gte: now } },
        { endDate: { $gte: now } },
        { startDate: { $gte: now } },
      ];
    }

    if (query && query.trim()) {
      const cleanTerm = query.trim();
      const textRegex = new RegExp(cleanTerm, 'i');
      if (!mongoQuery.$or) {
        mongoQuery.$or = [
          { title: textRegex },
          { description: textRegex },
        ];
      } else {
        mongoQuery.$and = [
          { $or: mongoQuery.$or },
          { $or: [{ title: textRegex }, { description: textRegex }] },
        ];
        delete mongoQuery.$or;
      }
    }

    const events = await AcademicEvent.find(mongoQuery)
      .sort({ registrationDeadline: 1, startDate: 1 })
      .limit(20)
      .lean();

    // 3. Store in Redis
    try {
      await cacheService.set(cacheKey, JSON.stringify(events), 3600);
    } catch (sErr) {
      // safe ignore
    }

    return events;
  }

  /**
   * Get paginated events for admin management
   */
  async getEvents(filters = {}, pagination = { page: 1, limit: 20 }) {
    const query = {};

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      query.$or = [
        { title: new RegExp(term, 'i') },
        { description: new RegExp(term, 'i') },
      ];
    }

    if (filters.eventType && filters.eventType !== 'all') {
      query.eventType = filters.eventType;
    }

    if (filters.program && filters.program !== 'all') {
      query.program = filters.program;
    }

    if (filters.isActive !== undefined && filters.isActive !== 'all') {
      query.isActive = filters.isActive === 'true' || filters.isActive === true;
    }

    const page = Math.max(1, parseInt(pagination.page || 1, 10));
    const limit = Math.min(100, Math.max(1, parseInt(pagination.limit || 20, 10)));
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      AcademicEvent.find(query)
        .sort({ registrationDeadline: 1, startDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AcademicEvent.countDocuments(query),
    ]);

    return {
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single event by ID
   */
  async getEventById(id) {
    return await AcademicEvent.findById(id);
  }

  /**
   * Create academic event
   */
  async createEvent(eventData) {
    const event = await AcademicEvent.create(eventData);
    await cacheInvalidation.incrementCacheVersion(`Academic Event Created: ${event.title}`);
    return event;
  }

  /**
   * Update academic event
   */
  async updateEvent(id, updateData) {
    const event = await AcademicEvent.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!event) {
      const err = new Error('Academic event not found');
      err.status = 404;
      throw err;
    }

    await cacheInvalidation.incrementCacheVersion(`Academic Event Updated: ${event.title}`);
    return event;
  }

  /**
   * Delete academic event
   */
  async deleteEvent(id) {
    const event = await AcademicEvent.findByIdAndDelete(id);
    if (!event) {
      const err = new Error('Academic event not found');
      err.status = 404;
      throw err;
    }

    await cacheInvalidation.incrementCacheVersion(`Academic Event Deleted: ${event.title}`);
    return { success: true, message: `Academic event "${event.title}" deleted.` };
  }
}

export const academicEventService = new AcademicEventService();
export default academicEventService;
