import mongoose from 'mongoose';

/**
 * Course Model - Structured Academic Course Catalog (Phase 6)
 */
const courseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Course code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true,
      index: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
      index: true,
    },
    program: {
      type: String,
      enum: ['B.Tech', 'M.Tech', 'MCA', 'MBA', 'PhD', 'Dual Degree', 'All'],
      default: 'B.Tech',
      index: true,
    },
    semester: {
      type: Number,
      min: 1,
      max: 10,
      required: [true, 'Semester is required'],
      index: true,
    },
    credits: {
      type: Number,
      required: true,
      min: 0,
      max: 20,
      default: 3,
    },
    type: {
      type: String,
      enum: ['core', 'elective', 'lab', 'project', 'open_elective', 'audit'],
      default: 'core',
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    prerequisites: {
      type: [String],
      default: [],
    },
    syllabusUrl: {
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

// Text index for semantic keyword search across name, code, description
courseSchema.index({ code: 'text', name: 'text', description: 'text' });
courseSchema.index({ department: 1, semester: 1 });
courseSchema.index({ program: 1, department: 1, semester: 1 });

const Course = mongoose.model('Course', courseSchema);

export default Course;
