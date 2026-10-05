const mongoose = require("mongoose");
const Classroom = require("./classRoomSchema");
const { computeSessionalBreakdown, STANDARD_SESSIONAL_KEYS } = require("../utils/sessionalWeights");
const { getGradeAndGpa } = require("../utils/gradeScale");
const { applyVivaMultiplier } = require("../utils/viva");

const getPercentage = (obtained = 0, total = 0) => {
  return total > 0 ? Number(((obtained / total) * 100).toFixed(2)) : 0;
};

// Official PUCIT Grading Letter Threshold Calculator
// Grade letters and grade points both come from the shared scale so the stored
// transcript, the leaderboard and the exported sheet can never disagree.

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
  // Viva gate. Off by default so every mark row that existed before this feature
  // keeps its exact marks. When on, `vivaMarks` (0-10) multiplies `obtainedMarks`
  // into `vivaAdjustedMarks`, which is what the grade is computed from.
  hasViva: { type: Boolean, default: false },
  vivaMarks: { type: Number, min: 0, max: 10, default: null },
  vivaAdjustedMarks: { type: Number, default: null },
  percentage: { type: Number, default: 0 },
  file: { type: cloudinaryFileSchema, default: () => ({}) },
}, { _id: true });

const customActivityItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  totalMarks: { type: Number, required: true, min: 1 },
  obtainedMarks: { type: Number, required: true, min: 0, default: 0 },
  isAbsent: { type: Boolean, default: false },
  isBypassed: { type: Boolean, default: false },
  hasViva: { type: Boolean, default: false },
  vivaMarks: { type: Number, min: 0, max: 10, default: null },
  vivaAdjustedMarks: { type: Number, default: null },
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
  hasViva: { type: Boolean, default: false },
  vivaMarks: { type: Number, min: 0, max: 10, default: null },
  vivaAdjustedMarks: { type: Number, default: null },
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
    // Grade point on the 0.00-4.00 scale. Stored alongside letterGrade so a
    // transcript or CGPA calculation never has to re-derive it from a percentage.
    gradePoint: { type: Number, default: 0, min: 0, max: 4 },
    isFailing: { type: Boolean, default: false },
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
  // Per-item percentage comes from the VIVA-ADJUSTED marks when the activity is
  // viva gated, and from the raw marks otherwise. The raw score the teacher typed
  // is preserved in obtainedMarks so the sheet can still show both numbers.
  const finalizeItem = (item) => {
    if (item.isBypassed) { item.vivaAdjustedMarks = 0; item.percentage = 0; return; }
    if (item.isAbsent) item.obtainedMarks = 0;
    item.vivaAdjustedMarks = item.hasViva
      ? applyVivaMultiplier(item.obtainedMarks, item.vivaMarks)
      : (Number(item.obtainedMarks) || 0);
    item.percentage = getPercentage(item.vivaAdjustedMarks, item.totalMarks);
  };

  STANDARD_SESSIONAL_KEYS.forEach((key) => {
    if (Array.isArray(this[key]) && this[key].length > 0) {
      this[key].forEach(finalizeItem);
    }
  });

  if (Array.isArray(this.customActivities)) {
    this.customActivities.forEach((customCat) => {
      if (Array.isArray(customCat.items) && customCat.items.length > 0) {
        customCat.items.forEach(finalizeItem);
      }
    });
  }

  // Items marked absent had their obtainedMarks zeroed above, so the shared
  // breakdown sees a clean document.
  const sessionalBreakdown = computeSessionalBreakdown(this, classroom);
  catPercentagesMap = sessionalBreakdown.categoryPercentages;

  // Process Mids
  if (this.mids) {
    if (this.mids.isBypassed) { this.mids.vivaAdjustedMarks = 0; this.mids.percentage = 0; }
    else {
      if (this.mids.isAbsent) this.mids.obtainedMarks = 0;
      this.mids.vivaAdjustedMarks = this.mids.hasViva
        ? applyVivaMultiplier(this.mids.obtainedMarks, this.mids.vivaMarks)
        : (Number(this.mids.obtainedMarks) || 0);
      this.mids.percentage = getPercentage(this.mids.vivaAdjustedMarks, this.mids.totalMarks);
    }
  }

  // Process Finals
  if (this.finals) {
    if (this.finals.isBypassed) { this.finals.vivaAdjustedMarks = 0; this.finals.percentage = 0; }
    else {
      if (this.finals.isAbsent) this.finals.obtainedMarks = 0;
      this.finals.vivaAdjustedMarks = this.finals.hasViva
        ? applyVivaMultiplier(this.finals.obtainedMarks, this.finals.vivaMarks)
        : (Number(this.finals.obtainedMarks) || 0);
      this.finals.percentage = getPercentage(this.finals.vivaAdjustedMarks, this.finals.totalMarks);
    }
  }

  // Process Final Project
  if (this.finalProject) {
    if (this.finalProject.isBypassed) { this.finalProject.vivaAdjustedMarks = 0; this.finalProject.percentage = 0; }
    else {
      if (this.finalProject.isAbsent) this.finalProject.obtainedMarks = 0;
      this.finalProject.vivaAdjustedMarks = this.finalProject.hasViva
        ? applyVivaMultiplier(this.finalProject.obtainedMarks, this.finalProject.vivaMarks)
        : (Number(this.finalProject.obtainedMarks) || 0);
      this.finalProject.percentage = getPercentage(this.finalProject.vivaAdjustedMarks, this.finalProject.totalMarks);
    }
  }

  let sessionalWeight = classroom?.gradingScheme?.sessionalWeight ?? 25;
  let midsWeight = classroom?.gradingScheme?.midsWeight ?? 35;
  let finalsWeight = classroom?.gradingScheme?.finalsWeight ?? 40;

  let activeWeightSum = 0;
  let weightedScoreSum = 0;

  const calculatedSessionalPct = sessionalBreakdown.sessionalPercentage;
  // The grading scheme is the fixed 100-mark split, so a category the teacher
  // configured always stays in the denominator and scores 0% until its marks
  // are entered. That keeps a student's grade climbing as marks arrive instead
  // of dropping when the next exam is filled in, and stops a student with
  // perfect sessionals but no finals entered being reported as 100%.
  if (sessionalWeight > 0) {
    weightedScoreSum += calculatedSessionalPct * sessionalWeight;
    activeWeightSum += sessionalWeight;
  }
  // Mids and finals follow the same fixed-weight rule as sessionals: a configured
  // exam always stays in the denominator and scores 0% until its marks are entered.
  // Gating these on `totalMarks > 0` meant an ungraded exam silently dropped OUT of
  // the denominator, so a student with perfect sessionals and no finals entered was
  // reported as 100% - and their grade jumped the moment finals were keyed in.
  // Only an explicit bypass removes an exam from the weighting.
  if (midsWeight > 0 && !this.mids?.isBypassed) {
    weightedScoreSum += (this.mids?.percentage || 0) * midsWeight;
    activeWeightSum += midsWeight;
  }
  if (finalsWeight > 0 && !this.finals?.isBypassed) {
    weightedScoreSum += (this.finals?.percentage || 0) * finalsWeight;
    activeWeightSum += finalsWeight;
  }

  const finalPercentage = activeWeightSum > 0 ? Number((weightedScoreSum / activeWeightSum).toFixed(2)) : 0;

  this.categoryPercentages = catPercentagesMap;
  this.studentClassPercentage = finalPercentage;

  const hasFinalsOrMids = (this.finals?.totalMarks > 0) || (this.mids?.totalMarks > 0);
  const graded = getGradeAndGpa(this.studentClassPercentage, hasFinalsOrMids);
  this.letterGrade = graded.grade;
  this.gradePoint = graded.gradePoint;
  this.isFailing = graded.isFailing;
});

module.exports = mongoose.model("Mark", markSchema);