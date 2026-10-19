const mongoose = require('mongoose');
const { ROOM_COLOR_KEYS, DEFAULT_ROOM_COLOR } = require('../utils/roomColors');

// Whether this activity is viva gated. Stored on the ROOM side as well as on each
// student's mark row so the marksheet knows to show the second viva input before
// any marks have been entered. Defaults to false, which is why every activity
// that predates the viva feature keeps behaving exactly as before.
const vivaGateFields = {
  hasViva: { type: Boolean, default: false }
};

const evaluationItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  totalMarks: { type: Number, required: true, min: 1 },
  ...vivaGateFields,
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const singleEvaluationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, default: 'Exam' },
  totalMarks: { type: Number, required: true, min: 1, default: 30 },
  ...vivaGateFields,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

// Shared shape for a notice file. Kept as a sub-schema so the single legacy
// `attachment` and the new `attachments` array cannot drift apart.
const noticeAttachmentSchema = new mongoose.Schema({
  url: { type: String, default: '' },
  public_id: { type: String, default: '' },
  fileType: { type: String, default: '' },
  fileName: { type: String, default: '' }
}, { _id: false });

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
    // Max number of activities per category that a single student may have
    // bypassed ("B"). Keyed by the normalised category key so it lines up with
    // the mark arrays. 0 or absent means that category cannot be bypassed.
    // Enforced server-side so a TA cannot exceed it; editable by teacher/admin.
    bypassLimits: {
      type: Map,
      of: Number,
      default: () => new Map()
    },
    // Room tint so students can tell rooms apart on the dashboard. Validated
    // against the shared palette so a hand-crafted request cannot inject CSS.
    colorKey: {
      type: String,
      enum: ROOM_COLOR_KEYS,
      default: DEFAULT_ROOM_COLOR
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
    smartSearchRejectedRolls: {
      type: [String],
      default: []
    },

    // NOTICE BOARD FOR ANNOUNCEMENTS
    notices: [{
      title: { type: String, required: true, trim: true },
      content: { type: String, required: true, trim: true },
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      authorName: { type: String, trim: true },
      authorRole: { type: String, trim: true },
      updatedAt: { type: Date },
      attachment: { type: noticeAttachmentSchema, default: () => ({}) },
      attachments: { type: [noticeAttachmentSchema], default: [] },
      createdAt: { type: Date, default: Date.now }
    }],

    // ANONYMOUS COMPLAINT BOX
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

    // =========================================================================
    // FIXED UNIVERSITY EVALUATION STRUCTURE (Strict Validation & No Dynamic Bugs)
    // =========================================================================
    
    // Multiple-entry sessional activities
    quizzes: [evaluationItemSchema],
    assignments: [evaluationItemSchema],
    presentations: [evaluationItemSchema],
    projects: [evaluationItemSchema],
    homework: [evaluationItemSchema],
    classActivities: [evaluationItemSchema],
    classParticipation: [evaluationItemSchema],
    vivas: [evaluationItemSchema],
    specialMarks: [evaluationItemSchema],

    // Strictly single-entry exams & major milestones
    mids: { 
      type: singleEvaluationSchema, 
      default: null 
    },
    finals: { 
      type: singleEvaluationSchema, 
      default: null 
    },
    finalProject: { 
      type: singleEvaluationSchema, 
      default: null 
    },

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
    strict: true // Locked down tightly to prevent arbitrary schema pollution
  }
);

// Performance Indexes for Roster Lookups and Auto-Enrollment Sync
classroomSchema.index({ isActive: 1, sectionPrefix: 1 });
classroomSchema.index({ isActive: 1, approvedRollNumbers: 1 });
classroomSchema.index({ isActive: 1, taRollNumbers: 1 });

module.exports = mongoose.model('Classroom', classroomSchema);