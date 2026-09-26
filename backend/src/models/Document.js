import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide a document title'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      enum: {
        values: [
          'academics',
          'examinations',
          'hostel',
          'admissions',
          'courses',
          'placements',
          'notices',
          'scholarships',
          'other',
        ],
        message: '{VALUE} is not a valid category',
      },
      default: 'academics',
    },
    department: {
      type: String,
      trim: true,
      default: 'General',
    },
    documentType: {
      type: String,
      enum: {
        values: [
          'regulation',
          'syllabus',
          'academic_calendar',
          'notice',
          'question_paper',
          'previous_year_paper',
          'notification',
          'academic_notification',
          'exam_notification',
          'scholarship',
          'result',
          'student_notice',
          'admission',
          'ordinance',
          'timetable',
          'registration',
          'open_elective',
          'hostel',
          'student_affairs',
          'announcement',
          'circular',
          'handbook',
          'policy',
          'course',
          'fee',
          'research',
          'recruitment',
          'other',
          'unknown',
        ],
        message: '{VALUE} is not a valid document type',
      },
      default: 'regulation',
    },
    subject: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    courseCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    semester: {
      type: Number,
      default: null,
      index: true,
    },
    examinationSession: {
      type: String,
      trim: true,
      default: null,
    },
    sourceType: {
      type: String,
      enum: ['upload', 'url', 'website'],
      default: 'upload',
    },
    sourceAuthority: {
      type: String,
      enum: ['official', 'department', 'internal', 'user_uploaded'],
      default: 'official',
    },
    year: {
      type: Number,
      default: null,
    },
    academicYear: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: 'application/pdf',
    },
    sourceUrl: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    sourcePageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    publicationDate: {
      type: Date,
      default: null,
      index: true,
    },
    knowledgeBaseScope: {
      type: String,
      enum: ['student', 'administrative', 'research', 'general'],
      default: 'student',
      index: true,
    },
    websiteSourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WebsiteSource',
      default: null,
      index: true,
    },
    discoveredAt: {
      type: Date,
      default: null,
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    currentVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentVersion',
      default: null,
    },
    currentVersionNumber: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalPages: {
      type: Number,
      default: 0,
    },
    totalChunks: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: [
        'draft',
        'uploaded',
        'validating',
        'processing',
        'indexing',
        'indexed',
        'failed',
        'inactive',
      ],
      default: 'uploaded',
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster category, status, and active filtering
documentSchema.index({ category: 1, status: 1 });
documentSchema.index({ department: 1 });
documentSchema.index({ isActive: 1, isDeleted: 1 });

const Document = mongoose.model('Document', documentSchema);

export default Document;
