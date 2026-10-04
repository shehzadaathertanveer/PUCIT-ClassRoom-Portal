/**
 * Single source of truth for a labroom's overall percentage.
 *
 * Unlike a classroom (which has a fixed Sessionals/Mids/Finals split), a labroom
 * lets the teacher configure ANY set of activities they actually conduct - lab
 * tasks, quizzes, vivas, lab mids, lab finals - and allocate the 100 marks
 * across them however they like. So there is no fixed three-way split here; the
 * overall is a weighted blend over whatever was configured:
 *
 *   overall% = SUM(categoryPct * allocatedMarks) / SUM(allocatedMarks)
 *
 * where each categoryPct is that category's marks combined, out of 100.
 *
 * The weighting matters most when raw mark counts and allocated weights point
 * in different directions. A lab with Lab Tasks allocated 60 but worth 100 raw
 * marks, and Lab Quizzes allocated 40 but worth 10 raw marks, is NOT a 90/10
 * split by marks. Pooling the raw marks instead of blending by weight is what
 * made the downloaded result sheet disagree with the on-screen leaderboard.
 */

// Must stay in sync with VALID_STANDARD_CATEGORIES in labMarkController.
const VALID_STANDARD_CATEGORIES = [
  'labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments',
  'presentations', 'finalProject', 'labMids', 'labFinals',
  'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'
];

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
 */
const sumCategory = (entries) => {
  const acc = { obtained: 0, possible: 0 };
  const items = Array.isArray(entries)
    ? entries
    : (entries && entries.title ? [entries] : []);

  items.forEach((item) => {
    if (!item || item.isBypassed) return;
    if (!item.isAbsent) acc.obtained += Number(item.obtainedMarks) || 0;
    acc.possible += Number(item.totalMarks) || 0;
  });
  return acc;
};

/**
 * @param {Object} labroom  The labroom document (needs sessionalActivities).
 * @param {Object} doc  A LabMark document for one student.
 * @returns {{ percentage:number, marksObtained:number, marksPossible:number,
 *             hasWeights:boolean, categoryPercentages:Object<string,number> }}
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

  // Categories the teacher never gave a weight to used to fall back to 0, which
  // silently dropped them from the denominator - a student graded only in those
  // categories scored 0% and appeared to fail. Give them the mean configured
  // weight instead so they still count.
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
    if (possible <= 0) return;

    const catPct = Number(((obtained / possible) * 100).toFixed(2));
    categoryPercentages[targetKey] = catPct;

    // Only categories this student was actually assessed on enter the weighted
    // denominator. Folding in a category they have no marks for would add its
    // weight while contributing a 0% numerator, dragging the score toward zero.
    if (hasWeights) {
      const w = weightByKey[targetKey] > 0 ? weightByKey[targetKey] : meanConfiguredWeight;
      if (w > 0) {
        weightedScore += catPct * w;
        weightTotal += w;
      }
    }
  });

  const percentage = hasWeights
    ? (weightTotal > 0 ? Number((weightedScore / weightTotal).toFixed(2)) : 0)
    : (marksPossible > 0 ? Number(((marksObtained / marksPossible) * 100).toFixed(2)) : 0);

  return {
    percentage,
    marksObtained,
    marksPossible,
    hasWeights,
    categoryPercentages
  };
};

module.exports = {
  computeLabWeightedPercentage,
  resolveCategoryKey,
  VALID_STANDARD_CATEGORIES
};