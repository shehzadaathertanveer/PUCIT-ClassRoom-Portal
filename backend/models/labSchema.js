const mongoose = require('mongoose');
const { ROOM_COLOR_KEYS, DEFAULT_ROOM_COLOR } = require('../utils/roomColors');

const labRoomSchema = new mongoose.Schema(
  {
    labName: { 
      type: String, 
      required: [true, 'Lab name is required'], 
      trim: true 
    },
    creditHours: {
      type: Number,
      required: [true, 'Credit hours are required'],
      default: 1,
      min: [1, 'Credit hours must be at least 1']
    },
    sectionPrefix: { 
      type: String, 
      required: [true, 'Section Prefix is required'], 
      uppercase: true, 
      trim: true 
    },
    
    // Lab Grading Scheme (100% Continuous Sessional Weight by default, fully flexible)
    gradingScheme: {
      sessionalWeight: { type: Number, default: 100, min: 0, max: 100 }
    },

    // Total solid marks this lab is worth. The activity percentages configured in
    // sessionalActivities are percentages OF this total, so it only scales the
    // marks a student is awarded - the percentage itself is unaffected. Defaults
    // to 100 but stays editable, because a lab can be worth 100, 50 or 40 marks.
    totalMarks: {
      type: Number,
      default: 100,
      min: [1, 'Total lab marks must be at least 1']
    },
    
    // Max bypasses ("B") allowed per student, per category. Same semantics as
    // the classroom field: 0/absent means the category cannot be bypassed.
    bypassLimits: {
      type: Map,
      of: Number,
      default: () => new Map()
    },

    // Same palette as Classroom so a course's theory and practical halves can be
    // paired; the room type is distinguished by the hinge treatment, not colour.
    colorKey: {
      type: String,
      enum: ROOM_COLOR_KEYS,
      default: DEFAULT_ROOM_COLOR
    },
    
    // Dynamic Activity Categories Configured by Teacher
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

    // STUDENT ROSTER & SECURITY
    students: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    }],
    maxCapacity: { 
      type: Number, 
      default: 40,
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
    smartSearchRejectedRolls: {
      type: [String],
      default: []
    },

    // NOTICE BOARD FOR LAB ANNOUNCEMENTS
    notices: [{
      title: { type: String, required: true, trim: true },
      content: { type: String, required: true, trim: true },
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      authorName: { type: String, trim: true },
      authorRole: { type: String, trim: true },
      updatedAt: { type: Date },
      attachment: {
        url: { type: String, default: '' },
        public_id: { type: String, default: '' },
        fileType: { type: String, default: '' },
        fileName: { type: String, default: '' }
      },
      createdAt: { type: Date, default: Date.now }
    }],

    // ANONYMOUS COMPLAINT / FEEDBACK BOX
    // Feedback stays anonymous: no author is stored. `readBy` tracks which staff
    // have seen each item so every TA gets their own unread count instead of one
    // shared flag, and `deletedBy`/`deletedAt` keep a soft-delete audit trail
    // without needing a second collection.
    complaints: [{
      message: { type: String, required: true, trim: true },
      createdAt: { type: Date, default: Date.now },
      readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      deletedAt: { type: Date, default: null },
      deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }],

    // 🚀 FULLY EXPANDED LAB EVALUATION STORAGE ARRAYS
    labTasks: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labTests: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
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
    presentations: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    vivas: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    projects: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    homework: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    classParticipation: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    specialMarks: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    finalProject: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labMids: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labFinals: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labActivities: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labBehavior: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labWorksheets: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    troubleshooting: [{
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
    strict: false 
  }
);

// Performance Indexes for Roster Lookups
labRoomSchema.index({ isActive: 1, sectionPrefix: 1 });
labRoomSchema.index({ isActive: 1, approvedRollNumbers: 1 });
labRoomSchema.index({ isActive: 1, taRollNumbers: 1 });

module.exports = mongoose.model('Labroom', labRoomSchema);