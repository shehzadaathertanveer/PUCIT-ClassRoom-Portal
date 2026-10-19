const mongoose = require('mongoose');

const { applyVivaToDoc } = require('../utils/viva');
const { VALID_STANDARD_CATEGORIES } = require('../utils/labWeights');

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
  // Viva gate. Off by default so every pre-existing row keeps its exact marks.
  // When on, `vivaMarks` (0-10) multiplies `obtainedMarks` into
  // `vivaAdjustedMarks`, and it is the adjusted figure that feeds labWeights and
  // therefore the percentage, the scaled final marks and the letter grade.
  hasViva: { type: Boolean, default: false },
  vivaMarks: { type: Number, min: 0, max: 10, default: null },
  vivaAdjustedMarks: { type: Number, default: null },
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
    labTests: [LabItemScoreSchema],
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
    // Grade letter and grade point on the same 0.00-4.00 scale a classroom uses,
    // so a CGPA can treat theory and practical the same way.
    letterGrade: { type: String, default: 'In Progress (Sessional)' },
    gradePoint: { type: Number, default: 0, min: 0, max: 4 },
    isFailing: { type: Boolean, default: false },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

/**
 * Refreshes every row's cached `vivaAdjustedMarks` on save.
 *
 * LabMark has no grade hook (the weighted percentage is derived on read by
 * labWeights, not cached by a hook), so without this the cached adjusted value
 * could go stale: a row written by an older client, or one whose viva was edited
 * through a path that forgot to recompute, would keep advertising a figure that
 * disagrees with its own score and viva. Refreshing here means no write path can
 * skip it. Cheap - it touches no database, just re-derives numbers in memory.
 */
labMarkSchema.pre('save', function () {
  applyVivaToDoc(this, VALID_STANDARD_CATEGORIES);
});

// Compound unique index to ensure one mark sheet per student per labroom
labMarkSchema.index({ labroom: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('LabMark', labMarkSchema);