import academicEventService from '../services/events/academicEventService.js';

/**
 * Admin Academic Event & Deadline Controller (Phase 6)
 */

export const getAdminEvents = async (req, res, next) => {
  try {
    const { search, eventType, program, isActive, page, limit } = req.query;
    const result = await academicEventService.getEvents(
      { search, eventType, program, isActive },
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

export const getAdminEventById = async (req, res, next) => {
  try {
    const event = await academicEventService.getEventById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Academic event not found' });
    }
    return res.status(200).json({ success: true, data: { event } });
  } catch (error) {
    next(error);
  }
};

export const createAdminEvent = async (req, res, next) => {
  try {
    const {
      title,
      description,
      eventType,
      startDate,
      endDate,
      registrationDeadline,
      program,
      department,
      sourceDocumentId,
      sourceUrl,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Event title is required.',
      });
    }

    const event = await academicEventService.createEvent({
      title,
      description: description || '',
      eventType: eventType || 'deadline',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
      program: program || 'all',
      department: department || 'all',
      sourceDocumentId: sourceDocumentId || null,
      sourceUrl: sourceUrl || '',
      createdBy: req.user?._id,
    });

    return res.status(201).json({
      success: true,
      message: `Academic event "${event.title}" created successfully.`,
      data: { event },
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminEvent = async (req, res, next) => {
  try {
    const event = await academicEventService.updateEvent(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      message: `Academic event "${event.title}" updated successfully.`,
      data: { event },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminEvent = async (req, res, next) => {
  try {
    const result = await academicEventService.deleteEvent(req.params.id);
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getAdminEvents,
  getAdminEventById,
  createAdminEvent,
  updateAdminEvent,
  deleteAdminEvent,
};
