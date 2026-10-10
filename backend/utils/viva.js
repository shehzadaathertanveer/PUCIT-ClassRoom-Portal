/**
 * Single source of truth for the per-activity VIVA multiplier.
 *
 * An activity can be marked "viva gated": the teacher records the activity score
 * as normal, and additionally records a viva out of 10 for each student. The viva
 * is a MULTIPLIER on that student's activity marks:
 *
 *   final marks = ceil(activity marks * viva / 10)
 *
 *   100 marks + viva 8  -> 80
 *    80 marks + viva 0  -> 0
 *
 * This is deliberately per-ACTIVITY, not a standalone "viva" activity: a student
 * who cannot explain their assignment loses the marks for that assignment, not
 * marks from an unrelated viva entry. The legacy `vivas` activity category still
 * exists and is graded as a normal activity - this multiplier is a separate,
 * optional layer on top of any activity.
 *
 * Two rules keep this safe:
 *
 *  - `hasViva` defaults to FALSE everywhere. Every mark row that existed before
 *    this feature has no viva recorded, and treating "no viva data" as "viva 0"
 *    would silently wipe out every existing grade. Off by default means legacy
 *    rows keep their exact marks until a teacher explicitly opts in.
 *
 *  - The RAW score the teacher typed is never overwritten. `obtainedMarks` stays
 *    as entered and the multiplied result is stored alongside it as
 *    `vivaAdjustedMarks`, so the sheet can always show both "you scored 80" and
 *    "after your viva of 0 that is 0" and nothing is lost.
 */

const VIVA_MAX = 10;

// Marks a teacher can score before a viva of 10/10 still returns them nothing.
const ceilTo = (value) => Math.ceil(value);

// Trims binary float noise (9.1 * 100 = 910.0000000000001) so an exact score
// never gets bumped by a rounding artefact.
const roundTo = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Clamps and validates a viva score. Accepts the strings the UI can produce
 * ('', '-', decimals) and returns null when there is nothing usable, so callers
 * can distinguish "teacher left it blank" from "teacher scored 0".
 */
const normalizeVivaScore = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '') return null;
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < 0) return 0;
  if (num > VIVA_MAX) return VIVA_MAX;
  // Vivas can carry decimals: a 9.1 viva is a 91% multiplier, not a 90% one.
  // Rounding to two places keeps a clean stored value while still honouring the
  // fraction the teacher typed.
  return roundTo(num, 2);
};

/**
 * The multiplier maths. Rounded UP so a partial viva never costs a student marks
 * they actually earned: 7 marks at viva 8 -> ceil(5.6) = 6, not 5.
 */
const applyVivaMultiplier = (obtainedMarks, vivaMarks) => {
  const obtained = Number(obtainedMarks) || 0;
  const viva = normalizeVivaScore(vivaMarks);
  // No viva recorded means the activity stands on its own - this is the path
  // every legacy mark row takes.
  if (viva === null) return obtained;
  // Round away float noise before ceil, otherwise an exact 91 could land at
  // 91.00000000000001 and round up to 92.
  return ceilTo(roundTo((obtained * viva) / VIVA_MAX, 6));
};

/**
 * Marks that count towards a grade.
 *
 * When the activity is viva gated the multiplied marks are authoritative;
 * otherwise the raw marks are. Everything that sums or averages marks
 * (sessional weights, lab weights, analytics, exports) must read this rather
 * than `obtainedMarks` so no two code paths can disagree about a grade.
 *
 * Deliberately DERIVED from `hasViva`/`vivaMarks` rather than read from the
 * stored `vivaAdjustedMarks`. A stored copy can go stale (an old row written
 * before the viva was enabled, or a bulk write that bypassed the hooks) and a
 * stale adjusted figure would silently change a grade. `vivaAdjustedMarks`
 * exists to be DISPLAYED; this function is the thing that decides.
 *
 * A viva-gated row with no viva recorded falls back to the raw marks rather than
 * to zero. The write paths reject a blank viva up front, so this only applies to
 * rows that predate the toggle - and zeroing those would be exactly the data loss
 * the off-by-default rule exists to prevent. A viva explicitly scored 0 is not
 * blank and does produce 0.
 */
const effectiveMarks = (item) => {
  if (!item) return 0;
  if (item.hasViva) return applyVivaMultiplier(item.obtainedMarks, item.vivaMarks);
  return Number(item.obtainedMarks) || 0;
};

/**
 * Recomputes `vivaAdjustedMarks` for a stored mark row. Called from the schema
 * hooks and the lab recalculation pass so the derived value is always fresh and
 * never depends on a client having sent it.
 */
const withVivaAdjusted = (item) => {
  if (!item) return item;
  if (item.hasViva) {
    item.vivaAdjustedMarks = applyVivaMultiplier(item.obtainedMarks, item.vivaMarks);
  } else {
    item.vivaAdjustedMarks = Number(item.obtainedMarks) || 0;
  }
  return item;
};

/**
 * Applies the multiplier to every mark entry on a document. Handles the classroom
 * layout (arrays of entries plus the single mids/finals/finalProject subdocs and
 * custom category items) and the labroom layout (arrays of scores).
 */
const applyVivaToDoc = (doc, arrayKeys = []) => {
  if (!doc) return doc;
  arrayKeys.forEach((key) => {
    if (Array.isArray(doc[key])) doc[key].forEach(withVivaAdjusted);
  });
  if (Array.isArray(doc.customActivities)) {
    doc.customActivities.forEach((cat) => {
      if (Array.isArray(cat && cat.items)) cat.items.forEach(withVivaAdjusted);
    });
  }
  ['mids', 'finals', 'finalProject'].forEach((key) => {
    if (doc[key] && typeof doc[key] === 'object') withVivaAdjusted(doc[key]);
  });
  return doc;
};

module.exports = {
  VIVA_MAX,
  applyVivaMultiplier,
  applyVivaToDoc,
  effectiveMarks,
  normalizeVivaScore,
  withVivaAdjusted
};