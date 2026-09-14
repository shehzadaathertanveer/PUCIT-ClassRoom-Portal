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

    // NOTICE BOARD FOR ANNOUNCEMENTS (With attachment support & auto-url normalization)
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
    strict: false // Allows dynamic custom activity arrays & fields without stripping them
  }
);

// Helper function to normalize Cloudinary raw resource URLs (e.g. PDFs)
const normalizeNoticeAttachments = (doc) => {
  if (doc && doc.notices && Array.isArray(doc.notices)) {
    doc.notices.forEach(notice => {
      if (notice.attachment && notice.attachment.url) {
        const isRaw = notice.attachment.fileType === 'raw' || 
                      notice.attachment.fileName?.toLowerCase().match(/\.(pdf|docx?|xlsx?|zip|rar|txt)$/);
        
        if (isRaw && notice.attachment.url.includes('/image/upload/')) {
          notice.attachment.url = notice.attachment.url.replace('/image/upload/', '/raw/upload/');
          notice.attachment.fileType = 'raw';
        }
      }
    });
  }
};

// Pre-save hook using async/await (No next callback required)
classroomSchema.pre('save', async function () {
  normalizeNoticeAttachments(this);
});

// Post-query middleware to fix any legacy URLs returned to the client
classroomSchema.post(['find', 'findOne', 'findOneAndUpdate'], function (docs) {
  if (!docs) return;
  if (Array.isArray(docs)) {
    docs.forEach(doc => normalizeNoticeAttachments(doc));
  } else {
    normalizeNoticeAttachments(docs);
  }
});

// Performance Indexes for Roster Lookups and Auto-Enrollment Sync
classroomSchema.index({ isActive: 1, sectionPrefix: 1 });
classroomSchema.index({ isActive: 1, approvedRollNumbers: 1 });
classroomSchema.index({ isActive: 1, taRollNumbers: 1 });

module.exports = mongoose.model('Classroom', classroomSchema);