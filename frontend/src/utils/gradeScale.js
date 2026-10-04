// The grade-point scale, mirroring backend/utils/gradeScale.js.
//
// The classroom results sheet used to re-derive letters from the percentage with
// its own hardcoded A+/A/B+ ladder, so an exported sheet could disagree with the
// grade shown in the app and with the stored transcript. The backend value is
// preferred wherever it is available (see `gradeFromRow` in ClassroomDetail);
// this copy only covers the case where a row has no server-supplied grade.
//
//   0-49 F 0.00 | 50-54 D 1.00 | 55-57 C- 1.70 | 58-60 C 2.00 | 61-64 C+ 2.30
//   65-69 B- 2.70 | 70-74 B 3.00 | 75-79 B+ 3.30 | 80-84 A- 3.70 | 85-100 A 4.00
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

export const getGradeAndGpa = (percentage, hasFinalsOrMids = true) => {
  const pct = Number(percentage);
  if (!Number.isFinite(pct)) return { grade: 'F', gradePoint: 0, isFailing: true };
  if (!hasFinalsOrMids) return { grade: 'In Progress (Sessional)', gradePoint: 0, isFailing: false };

  const band = GRADE_SCALE.find((b) => pct >= b.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
  return {
    grade: band.grade,
    gradePoint: band.gradePoint,
    isFailing: band.grade === 'F'
  };
};