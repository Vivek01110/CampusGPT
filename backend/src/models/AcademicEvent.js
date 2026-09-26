import mongoose from 'mongoose';

/**
 * AcademicEvent Model - Structured University Academic Calendar & Deadlines (Phase 6)
 */
const academicEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    eventType: {
      type: String,
      enum: [
        'registration',
        'examination',
        'fee_payment',
        'holiday',
        'result',
        'admission',
        'deadline',
        'convocation',
        'other',
      ],
      default: 'deadline',
      index: true,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    registrationDeadline: {
      type: Date,
      default: null,
      index: true,
    },
    program: {
      type: String,
      default: 'all',
      index: true,
    },
    department: {
      type: String,
      default: 'all',
      index: true,
    },
    sourceDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indices for date queries and upcoming deadlines
academicEventSchema.index({ eventType: 1, registrationDeadline: 1 });
academicEventSchema.index({ isActive: 1, startDate: 1 });
academicEventSchema.index({ title: 'text', description: 'text' });

const AcademicEvent = mongoose.model('AcademicEvent', academicEventSchema);

export default AcademicEvent;
