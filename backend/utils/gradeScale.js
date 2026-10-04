/**
 * The grade-point scale for a subject, shared by classrooms and labrooms.
 *
 * This is the ONE place grade letters and grade points are defined. The old
 * A+/A/B+/B/C+/C/D thresholds were duplicated in three spots (markSchema's
 * pre-save hook, the classroom analytics, and the lab CSV export), which is how
 * a student's transcript grade could disagree with their exported result sheet.
 *
 *   percentage  grade  gradePoint
 *   0  - 49     F      0.00   (fail)
 *   50 - 54     D      1.00
 *   55 - 57     C-     1.70
 *   58 - 60     C      2.00
 *   61 - 64     C+     2.30
 *   65 - 69     B-     2.70
 *   70 - 74     B      3.00
 *   75 - 79     B+     3.30
 *   80 - 84     A-     3.70
 *   85 - 100    A      4.00
 *
 * A labroom uses exactly the same scale as a classroom - a lab is graded on the
 * same percentage scale, its total marks only scaling the marks awarded.
 */

// Descending so the first matching band wins.
const GRADE_SCALE = [
  { min: 85, grade: 'A', gradePoint: 4.0 },
  { min: 80, grade: 'A-', gradePoint: 3.7 },
  { min: 75, grade: 'B+', gradePoint: 3.3 },
  { min: 70, grade: 'B', gradePoint: 3.0 },
  { min: 65, grade: 'B-', gradePoint: 2.7 },
  { min: 61, grade: 'C+', gradePoint: 2.3 },
  { min: 58, grade: 'C', gradePoint: 2.0 },
  { min: 55, grade: 'C-', gradePoint: 1.7 },
  { min: 50, grade: 'D', gradePoint: 1.0 },
  { min: 0, grade: 'F', gradePoint: 0.0 }
];

// Shown to students before any exam has been graded. Carries no grade point
// because there is nothing to grade yet.
const IN_PROGRESS_GRADE = 'In Progress (Sessional)';

/**
 * @param {number} percentage  Final overall percentage for the subject.
 * @param {boolean} hasFinalsOrMids  False while the subject is still
 *   sessional-only, which reports "In Progress" instead of a provisional grade.
 * @returns {{ grade: string, gradePoint: number, isFailing: boolean }}
 */
const getGradeAndGpa = (percentage, hasFinalsOrMids = true) => {
  const pct = Number(percentage);
  if (!Number.isFinite(pct)) return { grade: 'F', gradePoint: 0, isFailing: true };
  if (!hasFinalsOrMids) return { grade: IN_PROGRESS_GRADE, gradePoint: 0, isFailing: false };

  const band = GRADE_SCALE.find((b) => pct >= b.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
  return {
    grade: band.grade,
    gradePoint: band.gradePoint,
    isFailing: band.grade === 'F'
  };
};

module.exports = {
  GRADE_SCALE,
  IN_PROGRESS_GRADE,
  getGradeAndGpa
};