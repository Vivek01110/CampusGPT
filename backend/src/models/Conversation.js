import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Campus Inquiry',
      maxlength: 120,
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    summary: {
      type: String,
      trim: true,
      default: null,
      maxlength: 500,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for querying a user's conversations (pinned first, then newest updated)
conversationSchema.index({ userId: 1, pinned: -1, updatedAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation;
