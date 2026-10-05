/**
 * Re-derives stored percentages after a teacher changes how a room is graded.
 *
 * Activity percentages are fixed when the room is created or edited, but each
 * Mark document also CACHES the numbers derived from them
 * (`studentClassPercentage`, `letterGrade`, `studentLabPercentage`). Editing a
 * weight therefore has to push the new numbers back onto every existing student,
 * otherwise the room's stored grades keep describing the OLD weighting until
 * each student happens to have a mark re-saved - the leaderboard and the
 * transcript would then disagree.
 *
 * Both helpers are deliberately best-effort per document: one student's failure
 * to re-save must not abandon the rest of the class.
 */

const Classroom = require('../models/classRoomSchema');
const Labroom = require('../models/labSchema');
const Mark = require('../models/markSchema');
const LabMark = require('../models/labMarkSchema');
const { computeLabWeightedPercentage, VALID_STANDARD_CATEGORIES } = require('./labWeights');
const { getGradeAndGpa } = require('./gradeScale');
const { applyVivaToDoc } = require('./viva');

/**
 * Re-saves every Mark in the classroom so the schema's pre-save hook re-runs the
 * percentage and letter-grade maths against the room's CURRENT weights.
 *
 * @returns {Promise<{updated:number, failed:number}>}
 */
const recalculateClassroomGrades = async (classroomId) => {
  if (!classroomId) return { updated: 0, failed: 0 };

  const docs = await Mark.find({ classroom: classroomId });
  let updated = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      // The hook rewrites per-item percentages plus categoryPercentages,
      // studentClassPercentage and letterGrade.
      await doc.save();
      updated += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `recalculateClassroomGrades: could not re-save mark ${doc._id}:`,
        err.message
      );
    }
  }

  return { updated, failed };
};

/**
 * LabMark has no pre-save hook, so the weighted percentage is recomputed here
 * from the same helper the leaderboard and the CSV export use.
 *
 * @returns {Promise<{updated:number, failed:number}>}
 */
const recalculateLabGrades = async (labroomId) => {
  if (!labroomId) return { updated: 0, failed: 0 };

  const labroom = await Labroom.findById(labroomId).lean();
  if (!labroom) return { updated: 0, failed: 0 };

  const docs = await LabMark.find({ labroom: labroomId });
  let updated = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      // Refresh vivaAdjustedMarks from the stored score + viva before weighing.
      // labWeights reads that derived field, so skipping this would let a stale
      // adjusted value survive a re-save and disagree with its own inputs.
      applyVivaToDoc(doc, VALID_STANDARD_CATEGORIES);
      const { percentage } = computeLabWeightedPercentage(labroom, doc);
      // A lab is graded on the same scale as a classroom, so grade and grade
      // point are stored too rather than recomputed by every consumer.
      const graded = getGradeAndGpa(percentage);
      doc.studentLabPercentage = percentage;
      doc.letterGrade = graded.grade;
      doc.gradePoint = graded.gradePoint;
      doc.isFailing = graded.isFailing;
      await doc.save();
      updated += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `recalculateLabGrades: could not re-save lab mark ${doc._id}:`,
        err.message
      );
    }
  }

  return { updated, failed };
};

/**
 * True when the submitted activity list actually differs from what is stored, so
 * a save that only renamed the class does not needlessly re-save every mark.
 */
const activitiesChanged = (currentList, nextList) => {
  const normalise = (list) =>
    (Array.isArray(list) ? list : [])
      .map((a) => `${String(a.category || '').trim()}::${Number(a.allocatedMarks || 0)}`)
      .join('|');
  return normalise(currentList) !== normalise(nextList);
};

module.exports = {
  recalculateClassroomGrades,
  recalculateLabGrades,
  activitiesChanged
};