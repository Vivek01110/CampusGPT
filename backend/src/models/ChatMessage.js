import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    sources: [
      {
        documentId: {
          type: String,
        },
        title: {
          type: String,
        },
        page: {
          type: Number,
        },
        chunkIndex: {
          type: Number,
        },
        score: {
          type: Number,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for user chat history retrieval
chatMessageSchema.index({ userId: 1, createdAt: -1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
