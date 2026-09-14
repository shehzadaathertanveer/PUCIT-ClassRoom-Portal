const mongoose = require('mongoose');

const cloudinaryFileSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileName: { type: String, default: "" },
  },
  { _id: false }
);

const LabItemScoreSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  obtainedMarks: { type: Number, default: 0, min: 0 },
  totalMarks: { type: Number, required: true, min: 1 },
  isAbsent: { type: Boolean, default: false },
  remarks: { type: String, trim: true, default: '' },
  file: { type: cloudinaryFileSchema, default: () => ({}) } // 👈 Persists file attachments in lab grading sheets
}, { _id: false });

const CustomCategoryScoreSchema = new mongoose.Schema({
  categoryName: { type: String, required: true, trim: true },
  items: [LabItemScoreSchema]
}, { _id: false });

const labMarkSchema = new mongoose.Schema(
  {
    labroom: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Labroom', 
      required: true,
      index: true 
    },
    student: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },

    // Individual scores per category
    labTasks: [LabItemScoreSchema],
    vivas: [LabItemScoreSchema],
    labTests: [LabItemScoreSchema],
    projects: [LabItemScoreSchema],
    quizzes: [LabItemScoreSchema],
    assignments: [LabItemScoreSchema],
    customActivities: [CustomCategoryScoreSchema],

    // Cached performance metrics for rapid analytics
    studentLabPercentage: { type: Number, default: 0 },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Compound unique index to ensure one mark sheet per student per labroom
labMarkSchema.index({ labroom: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('LabMark', labMarkSchema);