const mongoose = require("mongoose");
const Classroom = require("./classRoomSchema");

const getPercentage = (obtained = 0, total = 0) => {
  return total > 0 ? Number(((obtained / total) * 100).toFixed(2)) : 0;
};

const getArrayTotals = (items = []) => {
  return items.reduce(
    (acc, curr) => {
      acc.obtained += curr.obtainedMarks || 0;
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

// Sub-schema for Cloudinary File Metadata
const cloudinaryFileSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    public_id: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileName: { type: String, default: "" },
  },
  { _id: false }
);

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
    quizzes: [
      {
        title: { type: String, required: true, trim: true },
        totalMarks: { type: Number, required: true, min: 1 },
        obtainedMarks: { type: Number, required: true, min: 0, default: 0 },
        isAbsent: { type: Boolean, default: false },
        percentage: { type: Number, default: 0 },
        file: { type: cloudinaryFileSchema, default: () => ({}) },
      },
    ],
    assignments: [
      {
        title: { type: String, required: true, trim: true },
        totalMarks: { type: Number, required: true, min: 1 },
        obtainedMarks: { type: Number, required: true, min: 0, default: 0 },
        isAbsent: { type: Boolean, default: false },
        percentage: { type: Number, default: 0 },
        file: { type: cloudinaryFileSchema, default: () => ({}) },
      },
    ],
    labMarks: [
      {
        title: { type: String, required: true, trim: true },
        totalMarks: { type: Number, required: true, min: 1 },
        obtainedMarks: { type: Number, required: true, min: 0, default: 0 },
        isAbsent: { type: Boolean, default: false },
        percentage: { type: Number, default: 0 },
        file: { type: cloudinaryFileSchema, default: () => ({}) },
      },
    ],
    mids: {
      totalMarks: { type: Number, default: 0, min: 0 },
      obtainedMarks: { type: Number, default: 0, min: 0 },
      isAbsent: { type: Boolean, default: false },
      percentage: { type: Number, default: 0 },
      file: { type: cloudinaryFileSchema, default: () => ({}) },
    },
    finals: {
      totalMarks: { type: Number, default: 0, min: 0 },
      obtainedMarks: { type: Number, default: 0, min: 0 },
      isAbsent: { type: Boolean, default: false },
      percentage: { type: Number, default: 0 },
      file: { type: cloudinaryFileSchema, default: () => ({}) },
    },

    categoryPercentages: {
      quizPercentage: { type: Number, default: 0 },
      assignmentPercentage: { type: Number, default: 0 },
      sessionalPercentage: { type: Number, default: 0 },
      labPercentage: { type: Number, default: 0 },
      midsPercentage: { type: Number, default: 0 },
      finalsPercentage: { type: Number, default: 0 },
    },
    studentClassPercentage: { type: Number, default: 0 },
    letterGrade: { type: String, default: 'In Progress (Sessional)' },
  },
  { timestamps: true }
);

markSchema.index({ classroom: 1, student: 1 }, { unique: true });

// FIXED: Weighted percentage calculation incorporating Classroom grading scheme weights
markSchema.pre("save", async function () {
  // Handle Absence logic and individual percentages
  ["quizzes", "assignments", "labMarks"].forEach((category) => {
    if (this[category] && this[category].length > 0) {
      this[category].forEach((item) => {
        if (item.isAbsent) {
          item.obtainedMarks = 0;
        }
        item.percentage = getPercentage(item.obtainedMarks, item.totalMarks);
      });
    }
  });

  if (this.mids) {
    if (this.mids.isAbsent) this.mids.obtainedMarks = 0;
    this.mids.percentage = getPercentage(this.mids.obtainedMarks, this.mids.totalMarks);
  }
  
  if (this.finals) {
    if (this.finals.isAbsent) this.finals.obtainedMarks = 0;
    this.finals.percentage = getPercentage(this.finals.obtainedMarks, this.finals.totalMarks);
  }

  const quizTotals = getArrayTotals(this.quizzes);
  const assignTotals = getArrayTotals(this.assignments);
  const labTotals = getArrayTotals(this.labMarks);

  const quizPct = getPercentage(quizTotals.obtained, quizTotals.total);
  const assignPct = getPercentage(assignTotals.obtained, assignTotals.total);
  const labPct = getPercentage(labTotals.obtained, labTotals.total);
  const midsPct = getPercentage(this.mids?.obtainedMarks, this.mids?.totalMarks);
  const finalsPct = getPercentage(this.finals?.obtainedMarks, this.finals?.totalMarks);

  // Combine quizzes and assignments for sessional percentage
  const sessionalObtained = quizTotals.obtained + assignTotals.obtained;
  const sessionalTotal = quizTotals.total + assignTotals.total;
  const sessionalPct = getPercentage(sessionalObtained, sessionalTotal);

  this.categoryPercentages = {
    quizPercentage: quizPct,
    assignmentPercentage: assignPct,
    sessionalPercentage: sessionalPct,
    labPercentage: labPct,
    midsPercentage: midsPct,
    finalsPercentage: finalsPct,
  };

  // Fetch classroom grading weights (defaults: 25% sessional, 35% mids, 40% finals)
  let sessionalWeight = 25;
  let midsWeight = 35;
  let finalsWeight = 40;
  let courseType = 'CLASSROOM';

  try {
    const classroom = await Classroom.findById(this.classroom).lean();
    if (classroom) {
      courseType = classroom.courseType || 'CLASSROOM';
      if (classroom.gradingScheme) {
        sessionalWeight = classroom.gradingScheme.sessionalWeight ?? 25;
        midsWeight = classroom.gradingScheme.midsWeight ?? 35;
        finalsWeight = classroom.gradingScheme.finalsWeight ?? 40;
      }
    }
  } catch (err) {
    console.warn("Could not fetch classroom grading weights in markSchema pre-save:", err.message);
  }

  let finalPercentage = 0;

  if (courseType === 'LAB') {
    // Labs are usually 100% based on lab performance/finals
    finalPercentage = labPct > 0 ? labPct : getPercentage(labTotals.obtained, labTotals.total);
  } else {
    // Dynamically calculate weighted average based on available components
    let activeWeightSum = 0;
    let weightedScoreSum = 0;

    if (sessionalTotal > 0) {
      weightedScoreSum += sessionalPct * sessionalWeight;
      activeWeightSum += sessionalWeight;
    }
    if ((this.mids?.totalMarks || 0) > 0) {
      weightedScoreSum += midsPct * midsWeight;
      activeWeightSum += midsWeight;
    }
    if ((this.finals?.totalMarks || 0) > 0) {
      weightedScoreSum += finalsPct * finalsWeight;
      activeWeightSum += finalsWeight;
    }

    finalPercentage = activeWeightSum > 0 ? Number((weightedScoreSum / activeWeightSum).toFixed(2)) : 0;
  }

  this.studentClassPercentage = finalPercentage;

  // Check if finals or mids have been uploaded before assigning final letter grade
  const hasFinalsOrMids = (this.finals?.totalMarks > 0) || (this.mids?.totalMarks > 0);
  this.letterGrade = getPucitLetterGrade(this.studentClassPercentage, hasFinalsOrMids);
});

module.exports = mongoose.model("Mark", markSchema);