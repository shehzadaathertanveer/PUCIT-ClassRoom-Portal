/**
 * Single source of truth for how a student's SESSIONAL percentage is derived.
 *
 * A classroom's sessional marks are a weighted blend, not a pooled ratio:
 * every configured activity (Quizzes, Assignments, Homework, ...) has its own
 * `allocatedMarks`, and each activity contributes its CATEGORY percentage
 * (all of that category's marks combined) scaled by that weight.
 *
 *   sessional% = SUM(categoryPct * weight) / SUM(weight)
 *
 * A CONFIGURED activity (one listed in classroom.sessionalActivities) always
 * counts in that denominator, scoring 0% until its marks are entered. An
 * activity the teacher never configured is not counted at all.
 *
 * The distinction matters. Given quizzes worth 20 raw marks but allocated a
 * weight of 10, and assignments worth 10 raw marks also allocated 10:
 *
 *   student scores 20/20 quizzes and 5/10 assignments
 *   pooled ratio  -> 25/35 = 71.43%   (what the analytics endpoint used to say)
 *   weighted     -> (100*10 + 50*10)/20 = 75%   (what the stored grade says)
 *
 * Both numbers were previously produced by different code, so a student's
 * letter grade could disagree with the leaderboard row for the very same
 * student. markSchema and markController now both call computeSessionalBreakdown.
 */

const { effectiveMarks } = require('./viva');

// The sessional category keys that live directly on the marks document.
const STANDARD_SESSIONAL_KEYS = [
  'quizzes', 'assignments', 'presentations', 'projects',
  'homework', 'classActivities', 'classParticipation', 'vivas', 'specialMarks'
];

// Weight given to a standard category the teacher never allocated marks to.
// Preserved from the original per-category fallbacks so existing classrooms
// (created before per-activity weights) keep the same grade they had.
const UNCONFIGURED_STANDARD_WEIGHT = 100 / STANDARD_SESSIONAL_KEYS.length;
const UNCONFIGURED_CUSTOM_WEIGHT = 10;

/**
 * Maps a teacher-facing activity label onto the key its marks are stored under.
 * Mirrors the resolver in markSchema so a weight configured as "Quizzes" is
 * found by the category stored as `quizzes`.
 */
const resolveCategoryKey = (catName = '') => {
  const clean = String(catName || '').trim().toLowerCase();
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
  return clean;
};

const pct = (obtained = 0, total = 0) => (total > 0 ? Number(((obtained / total) * 100).toFixed(2)) : 0);

/**
 * Sums a category's entries. A bypassed ("B") entry is dropped from BOTH sides:
 * it counts for nothing rather than counting as a zero. An absent entry still
 * contributes its possible marks, since the activity was still worth marks.
 *
 * Earned marks are the VIVA-ADJUSTED ones (see utils/viva). Reading
 * `obtainedMarks` here instead would make a student's grade in this breakdown
 * disagree with the letter grade the pre-save hook stored, which is exactly the
 * class of bug this module exists to prevent.
 */
const sumEntries = (entries) => {
  const acc = { obtained: 0, total: 0, count: 0 };
  (Array.isArray(entries) ? entries : []).forEach((item) => {
    if (!item || item.isBypassed) return;
    if (!item.isAbsent) acc.obtained += effectiveMarks(item);
    acc.total += Number(item.totalMarks) || 0;
    acc.count += 1;
  });
  return acc;
};

/**
 * @param {Object} markDoc  A Mark document (schema instance or lean object).
 * @param {Object} classroom  The owning classroom, for the configured weights.
 * @returns {{ sessionalPercentage: number, categoryPercentages: Object<string, number>, hasSessionals: boolean }}
 */
const computeSessionalBreakdown = (markDoc, classroom) => {
  const categoryPercentages = {};

  const weightByKey = {};
  ((classroom && classroom.sessionalActivities) || []).forEach((act) => {
    const marks = Number(act.allocatedMarks || 0);
    // A configured weight of 0 is treated as "not configured" rather than as a
    // real 0. The schema allows min: 0, so a teacher can easily leave an
    // activity at 0 while setting up the others. Honouring that 0 literally
    // multiplied the category percentage by 0 AND added 0 to the denominator,
    // so if every activity sat at 0 the whole sessional score collapsed to 0
    // and the leaderboard showed 0.00% for every student.
    if (marks > 0) weightByKey[resolveCategoryKey(act.category)] = marks;
  });

  let weightedEarned = 0;
  let weightTotal = 0;

  const fold = (key, entries, fallbackWeight) => {
    const totals = sumEntries(entries);
    const hasEntries = totals.count > 0 && totals.total > 0;

    // The weightage of an activity is fixed when the teacher creates the
    // classroom, so a CONFIGURED activity joins the blend even with nothing
    // entered yet - it simply scores 0%. That is deliberate: the sessional
    // score then only ever climbs as marks are entered, instead of starting
    // high and dropping the moment the next activity is filled in.
    //
    //   quizzes 10 (100%), assignments 15 (not entered) -> 40%, not 100%
    //   ...assignments later entered at 40%             -> 64%, it went up
    //
    // An activity the teacher never configured is left out entirely, so unused
    // categories are never silently penalised.
    const isConfigured = weightByKey[key] !== undefined;
    if (!hasEntries && !isConfigured) return;

    const categoryPct = hasEntries ? pct(totals.obtained, totals.total) : 0;
    categoryPercentages[key] = categoryPct;
    const weight = isConfigured ? weightByKey[key] : fallbackWeight;
    // A fallback of 0 would drop the category from both sides of the ratio and
    // silently erase it, so treat any non-positive weight as unconfigured.
    const effectiveWeight = weight > 0 ? weight : fallbackWeight;
    weightedEarned += categoryPct * effectiveWeight;
    weightTotal += effectiveWeight;
  };

  STANDARD_SESSIONAL_KEYS.forEach((key) => {
    fold(key, markDoc ? markDoc[key] : null, UNCONFIGURED_STANDARD_WEIGHT);
  });

  ((markDoc && markDoc.customActivities) || []).forEach((customCat) => {
    if (!customCat || !customCat.categoryName) return;
    const key = customCat.categoryName.trim().toLowerCase();
    fold(key, customCat.items, UNCONFIGURED_CUSTOM_WEIGHT);
  });

  return {
    sessionalPercentage: weightTotal > 0 ? Number((weightedEarned / weightTotal).toFixed(2)) : 0,
    categoryPercentages,
    hasSessionals: weightTotal > 0
  };
};

module.exports = {
  computeSessionalBreakdown,
  resolveCategoryKey,
  STANDARD_SESSIONAL_KEYS
};