const mongoose = require("mongoose");
const Classroom = require("./classRoomSchema");

const getPercentage = (obtained = 0, total = 0) => {
  return total > 0 ? Number(((obtained / total) * 100).toFixed(2)) : 0;
};

const getArrayTotals = (items = []) => {
  return items.reduce(
    (acc, curr) => {
      acc.obtained += (curr.isAbsent ? 0 : (curr.obtainedMarks || 0));
      acc.total += curr.totalMarks || 0;
      return acc;
    },
    { obtained: 0, total: 0 }
  );
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
  percentage: { type: Number, default: 0 },
  file: { type: cloudinaryFileSchema, default: () => ({}) },
}, { _id: true });

const singleMarkSchema = new mongoose.Schema({
  title: { type: String, default: 'Exam', trim: true },
  totalMarks: { type: Number, default: 0, min: 0 },
  obtainedMarks: { type: Number, default: 0, min: 0 },
  isAbsent: { type: Boolean, default: false },
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

// Map category names to exact schema array keys
const getCategoryTargetKey = (catName = '') => {
  const clean = catName.trim().toLowerCase();
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('present')) return 'presentations';
  if (clean.includes('final project')) return 'finalProject';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('homework')) return 'homework';
  if (clean.includes('class activ')) return 'classActivities';
  if (clean.includes('particip')) return 'classParticipation';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('special')) return 'specialMarks';
  return 'quizzes';
};

markSchema.pre("save", async function () {
  let classroom = null;
  try {
    classroom = await Classroom.findById(this.classroom).lean();
  } catch (err) {
    console.warn("Could not fetch classroom in markSchema pre-save:", err.message);
  }

  const sessionalActivities = classroom?.sessionalActivities || [
    { category: 'Quizzes', allocatedMarks: 10 },
    { category: 'Assignments', allocatedMarks: 15 }
  ];

  let totalAllocatedWeight = 0;
  let weightedEarnedSum = 0;
  let catPercentagesMap = {};

  // Process all sessional category arrays
  sessionalActivities.forEach((act) => {
    const targetKey = getCategoryTargetKey(act.category);
    const allocatedWeight = Number(act.allocatedMarks || 0);
    totalAllocatedWeight += allocatedWeight;

    if (this[targetKey] && Array.isArray(this[targetKey])) {
      this[targetKey].forEach((item) => {
        if (item.isAbsent) item.obtainedMarks = 0;
        item.percentage = getPercentage(item.obtainedMarks, item.totalMarks);
      });

      const totals = getArrayTotals(this[targetKey]);
      const catPct = getPercentage(totals.obtained, totals.total);
      catPercentagesMap[targetKey] = catPct;
      weightedEarnedSum += (catPct * allocatedWeight);
    } else {
      catPercentagesMap[targetKey] = 0;
    }
  });

  // Process Mids
  if (this.mids) {
    if (this.mids.isAbsent) this.mids.obtainedMarks = 0;
    this.mids.percentage = getPercentage(this.mids.obtainedMarks, this.mids.totalMarks);
  }
  
  // Process Finals
  if (this.finals) {
    if (this.finals.isAbsent) this.finals.obtainedMarks = 0;
    this.finals.percentage = getPercentage(this.finals.obtainedMarks, this.finals.totalMarks);
  }

  // Process Final Project
  if (this.finalProject) {
    if (this.finalProject.isAbsent) this.finalProject.obtainedMarks = 0;
    this.finalProject.percentage = getPercentage(this.finalProject.obtainedMarks, this.finalProject.totalMarks);
  }

  let sessionalWeight = classroom?.gradingScheme?.sessionalWeight ?? 25;
  let midsWeight = classroom?.gradingScheme?.midsWeight ?? 35;
  let finalsWeight = classroom?.gradingScheme?.finalsWeight ?? 40;

  let activeWeightSum = 0;
  let weightedScoreSum = 0;

  const calculatedSessionalPct = totalAllocatedWeight > 0 ? (weightedEarnedSum / totalAllocatedWeight) * 100 : 0;
  if (totalAllocatedWeight > 0) {
    weightedScoreSum += calculatedSessionalPct * sessionalWeight;
    activeWeightSum += sessionalWeight;
  }
  if ((this.mids?.totalMarks || 0) > 0) {
    weightedScoreSum += (this.mids.percentage || 0) * midsWeight;
    activeWeightSum += midsWeight;
  }
  if ((this.finals?.totalMarks || 0) > 0) {
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