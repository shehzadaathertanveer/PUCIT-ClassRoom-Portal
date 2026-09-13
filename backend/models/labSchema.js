const mongoose = require('mongoose');

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
    // Lab Grading Scheme (100% Continuous Sessional Weight)
    gradingScheme: {
      sessionalWeight: { type: Number, default: 100, min: 100, max: 100 }
    },
    
    // Dynamic Activity Categories Configured by Teacher (e.g., Lab Tasks, Vivas, or any custom dropdown/typed option)
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

    // NOTICE BOARD FOR LAB ANNOUNCEMENTS (Supports image/file attachments)
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

    // ANONYMOUS COMPLAINT / FEEDBACK BOX
    complaints: [{
      message: { type: String, required: true, trim: true },
      createdAt: { type: Date, default: Date.now }
    }],

    // 🚀 STANDARD & CUSTOM EVALUATION STORAGE ARRAYS
    // Standard pools for fast direct queries
    labTasks: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    vivas: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    labTests: [{
      title: { type: String, required: true, trim: true },
      totalMarks: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now }
    }],
    projects: [{
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

    // 🌟 UNIVERSAL FALLBACK: Handles any custom activity a teacher picks or types on the fly!
    customActivities: [{
      categoryName: { type: String, required: true, trim: true }, // e.g. "Hackathon", "Code Reviews"
      items: [{
        title: { type: String, required: true, trim: true },
        totalMarks: { type: Number, required: true, min: 1 },
        createdAt: { type: Date, default: Date.now }
      }]
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
  { timestamps: true }
);

// Performance Indexes for Roster Lookups
labRoomSchema.index({ isActive: 1, sectionPrefix: 1 });
labRoomSchema.index({ isActive: 1, approvedRollNumbers: 1 });
labRoomSchema.index({ isActive: 1, taRollNumbers: 1 });

module.exports = mongoose.model('Labroom', labRoomSchema);