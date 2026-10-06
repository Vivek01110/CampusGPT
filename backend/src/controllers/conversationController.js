import Conversation from '../models/Conversation.js';
import ChatMessage from '../models/ChatMessage.js';

/**
 * @desc    List all conversations for the authenticated user
 * @route   GET /api/conversations
 * @access  Private (Authenticated users)
 */
export const listConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Check if user has legacy messages without a conversationId and adopt them into an isolated conversation
    const orphanCount = await ChatMessage.countDocuments({
      userId,
      $or: [{ conversationId: null }, { conversationId: { $exists: false } }],
    });

    if (orphanCount > 0) {
      let legacyConv = await Conversation.findOne({ userId, title: 'Previous Inquiries' });
      if (!legacyConv) {
        legacyConv = await Conversation.create({
          userId,
          title: 'Previous Inquiries',
        });
      }
      await ChatMessage.updateMany(
        { userId, $or: [{ conversationId: null }, { conversationId: { $exists: false } }] },
        { conversationId: legacyConv._id }
      );
    }

    const conversations = await Conversation.find({ userId })
      .sort({ pinned: -1, updatedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Conversations retrieved successfully.',
      data: {
        conversations: conversations.map((c) => ({
          id: c._id.toString(),
          _id: c._id.toString(),
          title: c.title,
          pinned: !!c.pinned,
          summary: c.summary || null,
          tags: c.tags || [],
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create a new conversation session
 * @route   POST /api/conversations
 * @access  Private (Authenticated users)
 */
export const createConversation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { title, pinned = false, summary = null, tags = [] } = req.body;

    const conversation = await Conversation.create({
      userId,
      title: title && title.trim() ? title.trim() : 'Campus Inquiry',
      pinned: !!pinned,
      summary: summary || null,
      tags: Array.isArray(tags) ? tags : [],
    });

    return res.status(201).json({
      success: true,
      message: 'Conversation created successfully.',
      data: {
        conversation: {
          id: conversation._id.toString(),
          _id: conversation._id.toString(),
          title: conversation.title,
          pinned: conversation.pinned,
          summary: conversation.summary,
          tags: conversation.tags,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a specific conversation and all its messages
 * @route   GET /api/conversations/:id
 * @access  Private (Authenticated users)
 */
export const getConversation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied.',
      });
    }

    const messages = await ChatMessage.find({ conversationId: id, userId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Conversation retrieved successfully.',
      data: {
        conversation: {
          id: conversation._id.toString(),
          _id: conversation._id.toString(),
          title: conversation.title,
          pinned: conversation.pinned,
          summary: conversation.summary,
          tags: conversation.tags,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
        messages: messages.map((m) => ({
          id: m._id.toString(),
          _id: m._id.toString(),
          conversationId: m.conversationId ? m.conversationId.toString() : id,
          role: m.role,
          sender: m.role,
          content: m.content,
          text: m.content,
          sources: m.sources || [],
          suggestions: m.suggestions || [],
          createdAt: m.createdAt,
          timestamp: m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update conversation title, pinned status, or summary
 * @route   PATCH /api/conversations/:id
 * @access  Private (Authenticated users)
 */
export const updateConversation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { title, pinned, summary, tags } = req.body;

    const conversation = await Conversation.findOne({ _id: id, userId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied.',
      });
    }

    if (typeof title === 'string' && title.trim()) {
      conversation.title = title.trim();
    }
    if (typeof pinned === 'boolean') {
      conversation.pinned = pinned;
    }
    if (typeof summary === 'string') {
      conversation.summary = summary.trim();
    }
    if (Array.isArray(tags)) {
      conversation.tags = tags;
    }

    await conversation.save();

    return res.status(200).json({
      success: true,
      message: 'Conversation updated successfully.',
      data: {
        conversation: {
          id: conversation._id,
          _id: conversation._id,
          title: conversation.title,
          pinned: conversation.pinned,
          summary: conversation.summary,
          tags: conversation.tags,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a conversation and all its messages
 * @route   DELETE /api/conversations/:id
 * @access  Private (Authenticated users)
 */
export const deleteConversation = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const conversation = await Conversation.findOneAndDelete({ _id: id, userId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied.',
      });
    }

    // Cascade delete associated messages
    await ChatMessage.deleteMany({ conversationId: id, userId });

    return res.status(200).json({
      success: true,
      message: 'Conversation and messages deleted successfully.',
      data: { id },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
};
