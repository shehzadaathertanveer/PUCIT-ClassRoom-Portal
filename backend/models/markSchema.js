const mongoose = require("mongoose");
const Classroom = require("./classRoomSchema");
const { computeSessionalBreakdown, STANDARD_SESSIONAL_KEYS } = require("../utils/sessionalWeights");

const getPercentage = (obtained = 0, total = 0) => {
  return total > 0 ? Number(((obtained / total) * 100).toFixed(2)) : 0;
};

// Official PUCIT Grading Letter Threshold Calculator
const getPucitLetterGrade = (percentage, hasFinalsOrMids) => {
  if (!hasFinalsOrMids) return 'In Progress (Sessional)';
  if (percentage >= 85) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 75) return 'B+';
  if (percentage >= 70) return 'B';
  if (percentage >= 65) return 'C+';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
};

const cloudinaryFileSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileName: { type: String, default: "" },
  },
  { _id: false }
);

const individualMarkSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  totalMarks: { type: Number, required: true, min: 1 },
  obtainedMarks: { type: Number, required: true, min: 0, default: 0 },
  isAbsent: { type: Boolean, default: false },
  // Bypass: this activity does not exist for this student. Excluded from BOTH
  // earned and possible so it cannot dilute their average or inflate the
  // denominator. Enforced against classroom.bypassLimits at the controller.
  isBypassed: { type: Boolean, default: false },
  percentage: { type: Number, default: 0 },
  file: { type: cloudinaryFileSchema, default: () => ({}) },
}, { _id: true });

const customActivityItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  totalMarks: { type: Number, required: true, min: 1 },
  obtainedMarks: { type: Number, required: true, min: 0, default: 0 },
  isAbsent: { type: Boolean, default: false },
  isBypassed: { type: Boolean, default: false },
  percentage: { type: Number, default: 0 },
  file: { type: cloudinaryFileSchema, default: () => ({}) },
}, { _id: true });

const customCategorySchema = new mongoose.Schema({
  categoryName: { type: String, required: true, trim: true },
  items: [customActivityItemSchema],
}, { _id: true });

const singleMarkSchema = new mongoose.Schema({
  title: { type: String, default: 'Exam', trim: true },
  totalMarks: { type: Number, default: 0, min: 0 },
  obtainedMarks: { type: Number, default: 0, min: 0 },
  isAbsent: { type: Boolean, default: false },
  isBypassed: { type: Boolean, default: false },
  percentage: { type: Number, default: 0 },
  file: { type: cloudinaryFileSchema, default: () => ({}) },
}, { _id: false });

const markSchema = new mongoose.Schema(
  {
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Fixed Multi-Entry Sessional Categories
    quizzes: [individualMarkSchema],
    assignments: [individualMarkSchema],
    presentations: [individualMarkSchema],
    projects: [individualMarkSchema],
    homework: [individualMarkSchema],
    classActivities: [individualMarkSchema],
    classParticipation: [individualMarkSchema],
    vivas: [individualMarkSchema],
    specialMarks: [individualMarkSchema],

    // Dynamic Custom Sessional Categories
    customActivities: [customCategorySchema],

    // Strictly Single-Entry Exams & Milestones
    mids: { type: singleMarkSchema, default: () => ({}) },
    finals: { type: singleMarkSchema, default: () => ({}) },
    finalProject: { type: singleMarkSchema, default: () => ({}) },

    categoryPercentages: { type: Map, of: Number, default: {} },
    studentClassPercentage: { type: Number, default: 0 },
    letterGrade: { type: String, default: 'In Progress (Sessional)' },
  },
  { timestamps: true, strict: true }
);

markSchema.index({ classroom: 1, student: 1 }, { unique: true });

markSchema.pre("save", async function () {
  let classroom = null;
  try {
    classroom = await Classroom.findById(this.classroom).lean();
  } catch (err) {
    console.warn("Could not fetch classroom in markSchema pre-save:", err.message);
  }

  let catPercentagesMap = {};

// Per-item percentages are still derived here because they are persisted on the
  // document, but the CATEGORY and overall sessional maths is delegated to
  // computeSessionalBreakdown so this hook and getClassAnalytics cannot drift
  // apart and report two different percentages for the same student.
  STANDARD_SESSIONAL_KEYS.forEach((key) => {
    if (Array.isArray(this[key]) && this[key].length > 0) {
      this[key].forEach((item) => {
        if (item.isBypassed) { item.percentage = 0; return; }
        if (item.isAbsent) item.obtainedMarks = 0;
        item.percentage = getPercentage(item.obtainedMarks, item.totalMarks);
      });
    }
  });

  if (Array.isArray(this.customActivities)) {
    this.customActivities.forEach((customCat) => {
      if (Array.isArray(customCat.items) && customCat.items.length > 0) {
        customCat.items.forEach((item) => {
          if (item.isBypassed) { item.percentage = 0; return; }
          if (item.isAbsent) item.obtainedMarks = 0;
          item.percentage = getPercentage(item.obtainedMarks, item.totalMarks);
        });
      }
    });
  }

  // Items marked absent had their obtainedMarks zeroed above, so the shared
  // breakdown sees a clean document.
  const sessionalBreakdown = computeSessionalBreakdown(this, classroom);
  catPercentagesMap = sessionalBreakdown.categoryPercentages;

  // Process Mids
  if (this.mids) {
    if (this.mids.isBypassed) { this.mids.percentage = 0; }
    else {
      if (this.mids.isAbsent) this.mids.obtainedMarks = 0;
      this.mids.percentage = getPercentage(this.mids.obtainedMarks, this.mids.totalMarks);
    }
  }
  
  // Process Finals
  if (this.finals) {
    if (this.finals.isBypassed) { this.finals.percentage = 0; }
    else {
      if (this.finals.isAbsent) this.finals.obtainedMarks = 0;
      this.finals.percentage = getPercentage(this.finals.obtainedMarks, this.finals.totalMarks);
    }
  }

  // Process Final Project
  if (this.finalProject) {
    if (this.finalProject.isBypassed) { this.finalProject.percentage = 0; }
    else {
      if (this.finalProject.isAbsent) this.finalProject.obtainedMarks = 0;
      this.finalProject.percentage = getPercentage(this.finalProject.obtainedMarks, this.finalProject.totalMarks);
    }
  }

  let sessionalWeight = classroom?.gradingScheme?.sessionalWeight ?? 25;
  let midsWeight = classroom?.gradingScheme?.midsWeight ?? 35;
  let finalsWeight = classroom?.gradingScheme?.finalsWeight ?? 40;

  let activeWeightSum = 0;
  let weightedScoreSum = 0;

  const calculatedSessionalPct = sessionalBreakdown.sessionalPercentage;
  if (sessionalBreakdown.hasSessionals) {
    weightedScoreSum += calculatedSessionalPct * sessionalWeight;
    activeWeightSum += sessionalWeight;
  }
  // A bypassed exam is excluded from the weighting entirely - it must not
  // contribute its weight to the denominator either, or the remaining exams
  // would be dragged down toward zero.
  if ((this.mids?.totalMarks || 0) > 0 && !this.mids?.isBypassed) {
    weightedScoreSum += (this.mids.percentage || 0) * midsWeight;
    activeWeightSum += midsWeight;
  }
  if ((this.finals?.totalMarks || 0) > 0 && !this.finals?.isBypassed) {
    weightedScoreSum += (this.finals.percentage || 0) * finalsWeight;
    activeWeightSum += finalsWeight;
  }

  const finalPercentage = activeWeightSum > 0 ? Number((weightedScoreSum / activeWeightSum).toFixed(2)) : 0;

  this.categoryPercentages = catPercentagesMap;
  this.studentClassPercentage = finalPercentage;

  const hasFinalsOrMids = (this.finals?.totalMarks > 0) || (this.mids?.totalMarks > 0);
  this.letterGrade = getPucitLetterGrade(this.studentClassPercentage, hasFinalsOrMids);
});

module.exports = mongoose.model("Mark", markSchema);