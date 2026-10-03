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
  // Explicit graded state. Without this a legitimate 0 score is indistinguishable
  // from "never graded", because obtainedMarks defaults to 0.
  isGraded: { type: Boolean, default: false },
  isAbsent: { type: Boolean, default: false },
  // Bypass: this evaluation does not exist for this student. Excluded from
  // BOTH earned and possible. Enforced against labroom.bypassLimits.
  isBypassed: { type: Boolean, default: false },
  remarks: { type: String, trim: true, default: '' },
  file: { type: cloudinaryFileSchema, default: () => ({}) } // 👈 Persists file attachments in lab grading sheets
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

    // 🚀 Updated Individual Scores matching Labroom Schema Categories
    labTasks: [LabItemScoreSchema],
    quizzes: [LabItemScoreSchema],
    assignments: [LabItemScoreSchema],
    presentations: [LabItemScoreSchema],
    vivas: [LabItemScoreSchema],
    projects: [LabItemScoreSchema],
    finalProject: [LabItemScoreSchema],
    labMids: [LabItemScoreSchema],
    labFinals: [LabItemScoreSchema],
    labActivities: [LabItemScoreSchema],
    labBehavior: [LabItemScoreSchema],
    labWorksheets: [LabItemScoreSchema],
    troubleshooting: [LabItemScoreSchema],

    // Cached performance metrics for rapid analytics
    studentLabPercentage: { type: Number, default: 0 },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Compound unique index to ensure one mark sheet per student per labroom
labMarkSchema.index({ labroom: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('LabMark', labMarkSchema);