/**
 * Single source of truth for a labroom's overall percentage and final marks.
 *
 * Unlike a classroom (which has a fixed Sessionals/Mids/Finals split), a labroom
 * lets the teacher configure ANY set of activities they actually conduct - lab
 * tasks, quizzes, vivas, presentations, lab mids, lab finals - and split the
 * total across them however they like. There is no fixed three-way split here.
 *
 * What the teacher allocates is NOT marks, it is each activity's PERCENTAGE of
 * the room's total solid marks, and the percentages are meant to add up to 100:
 *
 *   lab task 45% + lab quiz 7% + ... = 100%
 *
 *   overall%    = SUM(categoryPct * weight) / SUM(weight)
 *   final marks = overall% / 100 * labroom.totalMarks
 *
 * totalMarks defaults to 100 but is editable, because a lab can be worth 100,
 * 50 or 40 solid marks. The percentage is unaffected by that choice - only the
 * marks the student is awarded scale with it.
 *
 * A CONFIGURED activity always joins the blend, scoring 0% until its marks are
 * entered, exactly like a classroom's sessional activities. Weights are fixed
 * when the room is created, so this keeps a student's score climbing as marks
 * arrive instead of dropping when the next activity is filled in.
 *
 * The weighting matters most when raw mark counts and allocated percentages
 * point in different directions. A lab with Lab Tasks allocated 45% but worth
 * 100 raw marks, and Lab Quizzes allocated 7% but worth 10 raw marks, is NOT a
 * ~91/9 split by marks. Pooling the raw marks instead of blending by weight is
 * what made the downloaded result sheet disagree with the on-screen leaderboard.
 */

// Must stay in sync with VALID_STANDARD_CATEGORIES in labMarkController.
const VALID_STANDARD_CATEGORIES = [
  'labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments',
  'presentations', 'finalProject', 'labMids', 'labFinals',
  'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'
];

const { effectiveMarks } = require('./viva');

const normKey = (s) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    .replace(/ies$/, 'y').replace(/sses$/, 'ss').replace(/([^s])s$/, '$1');

/**
 * Exact match wins. Otherwise accept a substring match only when it is
 * unambiguous - guessing between "projects" and "finalProject" would silently
 * apply the wrong weight, which is worse than applying none.
 */
const resolveCategoryKey = (category) => {
  const a = normKey(category);
  if (!a) return null;
  const exact = VALID_STANDARD_CATEGORIES.find((k) => normKey(k) === a);
  if (exact) return exact;
  const partial = VALID_STANDARD_CATEGORIES.filter((k) => {
    const b = normKey(k);
    return b.includes(a) || a.includes(b);
  });
  return partial.length === 1 ? partial[0] : null;
};

/**
 * Sums one category's entries.
 *  - Bypassed ("B") entries are excluded from BOTH sides: the activity does not
 *    exist for this student, so it must neither help nor hurt them.
 *  - Absent entries contribute 0 earned but KEEP their possible marks, because
 *    absent is a real zero rather than a missing grade.
 *
 * Earned marks are the VIVA-ADJUSTED ones (see utils/viva), so the marks scaled
 * out of labroom.totalMarks reflect the viva gate rather than the raw score.
 */
const sumCategory = (entries) => {
  const acc = { obtained: 0, possible: 0 };
  const items = Array.isArray(entries)
    ? entries
    : (entries && entries.title ? [entries] : []);

  items.forEach((item) => {
    if (!item || item.isBypassed) return;
    if (!item.isAbsent) acc.obtained += effectiveMarks(item);
    acc.possible += Number(item.totalMarks) || 0;
  });
  return acc;
};

/**
 * @param {Object} labroom  The labroom document (needs sessionalActivities, optional totalMarks).
 * @param {Object} doc  A LabMark document for one student.
 * @returns {{ percentage:number, marksObtained:number, marksPossible:number, totalMarks:number,
 *             finalMarks:number, hasWeights:boolean, categoryPercentages:Object<string,number> }}
 */
const computeLabWeightedPercentage = (labroom, doc) => {
  const weightByKey = {};
  ((labroom && labroom.sessionalActivities) || []).forEach((act) => {
    const key = resolveCategoryKey(act.category);
    const marks = Number(act.allocatedMarks || 0);
    if (key && marks > 0) weightByKey[key] = marks;
  });

  const configuredWeights = Object.values(weightByKey);
  const hasWeights = configuredWeights.length > 0;

  // The room's total solid marks. Defaults to 100 so a lab that has never had
  // its total edited keeps behaving as a 100-mark lab.
  const totalMarks = Number(labroom && labroom.totalMarks) > 0
    ? Number(labroom.totalMarks)
    : 100;

  // Categories the teacher never gave a percentage to used to fall back to 0,
  // which silently dropped them from the denominator - a student graded only in
  // those categories scored 0% and appeared to fail. Give them the mean
  // configured percentage instead so they still count.
  const meanConfiguredWeight = hasWeights
    ? configuredWeights.reduce((a, b) => a + b, 0) / configuredWeights.length
    : 0;

  let marksObtained = 0;
  let marksPossible = 0;
  let weightedScore = 0;
  let weightTotal = 0;
  const categoryPercentages = {};

  VALID_STANDARD_CATEGORIES.forEach((targetKey) => {
    const { obtained, possible } = sumCategory(doc ? doc[targetKey] : null);
    marksObtained += obtained;
    marksPossible += possible;

    const hasEntries = possible > 0;
    const isConfigured = weightByKey[targetKey] > 0;

    // Configured activities always count, so an activity whose marks have not
    // been entered yet scores 0% while still holding its share of the total.
    // An activity the teacher never configured and never assessed is ignored.
    if (!hasEntries && !isConfigured) return;

    const catPct = hasEntries ? Number(((obtained / possible) * 100).toFixed(2)) : 0;
    categoryPercentages[targetKey] = catPct;

    if (hasWeights) {
      const w = isConfigured ? weightByKey[targetKey] : meanConfiguredWeight;
      if (w > 0) {
        weightedScore += catPct * w;
        weightTotal += w;
      }
    }
  });

  const percentage = hasWeights
    ? (weightTotal > 0 ? Number((weightedScore / weightTotal).toFixed(2)) : 0)
    : (marksPossible > 0 ? Number(((marksObtained / marksPossible) * 100).toFixed(2)) : 0);

  // Percentage -> marks out of the room's (editable) total. A student at 70%
  // in a 50-mark lab is awarded 35 of 50.
  const finalMarks = Number(((percentage / 100) * totalMarks).toFixed(2));

  return {
    percentage,
    marksObtained,
    marksPossible,
    totalMarks,
    finalMarks,
    hasWeights,
    categoryPercentages
  };
};

module.exports = {
  computeLabWeightedPercentage,
  resolveCategoryKey,
  VALID_STANDARD_CATEGORIES
};