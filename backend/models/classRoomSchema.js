const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema(
  {
    className: { 
      type: String, 
      required: [true, 'Classroom name is required'], 
      trim: true 
    },
    creditHours: {
      type: Number,
      required: [true, 'Credit hours are required'],
      default: 3,
      min: [1, 'Credit hours must be at least 1']
    },
    sectionPrefix: { 
      type: String, 
      required: [true, 'Section Prefix is required'], 
      uppercase: true, 
      trim: true 
    },
    gradingScheme: {
      sessionalWeight: { type: Number, default: 25, min: 0 },
      midsWeight: { type: Number, default: 35, min: 0 },
      finalsWeight: { type: Number, default: 40, min: 0 }
    },
    sessionalActivities: [{
      category: { type: String, required: true, trim: true },
      allocatedMarks: { type: Number, required: true, min: 0 }
    }],
    teacher: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      default: null
    },
    placeholderTeacherName: { 
      type: String, 
      default: 'Faculty / TBD',
      trim: true
    },

    // TA ASSIGNMENTS
    tas: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }],
    taRollNumbers: [{ 
      type: String, 
      uppercase: true, 
      trim: true 
    }],

    // STUDENT ASSIGNMENTS & ROSTER SECURITY
    students: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }],
    maxCapacity: { 
      type: Number, 
      default: 60,
      min: [1, 'Capacity must be at least 1'] 
    },
    approvedRollNumbers: { 
      type: [String], 
      default: [] 
    },
    regularRollNumbers: { 
      type: [String], 
      default: [] 
    },
    addDropRollNumbers: { 
      type: [String], 
      default: [] 
    },

    // NOTICE BOARD FOR ANNOUNCEMENTS (With attachment support)
    notices: [{
      title: { type: String, required: true, trim: true },
      content: { type: String, required: true, trim: true },
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      authorName: { type: String, trim: true },
      authorRole: { type: String, trim: true },
      attachment: {
        url: { type: String, default: '' },
        public_id: { type: String, default: '' },
        fileType: { type: String, default: '' },
        fileName: { type: String, default: '' }
      },
      createdAt: { type: Date, default: Date.now }
    }],

    // ANONYMOUS COMPLAINT BOX (Embedded per classroom)
    complaints: [{
      message: { type: String, required: true, trim: true },
      createdAt: { type: Date, default: Date.now }
    }],

    // GRADED ITEMS TRACKING (Preset & Dynamic Custom Categories)
    quizzes: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    assignments: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],

    isActive: { 
      type: Boolean, 
      default: true, 
      index: true 
    },
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
  },
  { 
    timestamps: true,
    strict: false // 👈 CRITICAL: Allows dynamic custom activity arrays & fields without stripping them
  }
);

// Performance Indexes for Roster Lookups and Auto-Enrollment Sync
classroomSchema.index({ isActive: 1, sectionPrefix: 1 });
classroomSchema.index({ isActive: 1, approvedRollNumbers: 1 });
classroomSchema.index({ isActive: 1, taRollNumbers: 1 });

module.exports = mongoose.model('Classroom', classroomSchema);