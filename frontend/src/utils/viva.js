/**
 * Client-side mirror of backend/utils/viva.js.
 *
 * This exists so the marksheet can show a student their final marks AS THEY
 * TYPE, not just after a save round-trip. The server recomputes and re-stores
 * everything, so this file must never be treated as the source of truth - it is
 * the same formula, duplicated, so the preview and the saved grade agree.
 *
 * Kept deliberately tiny: clamping, the ceil rounding and nothing else.
 */

export const VIVA_MAX = 10;

// Trims binary float noise (9.1 * 100 = 910.0000000000001) so an exact score
// never gets bumped by a rounding artefact.
const roundTo = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Clamps to a 0-10 score; returns null for blank/unusable input. */
export const normalizeVivaScore = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '') return null;
  // 'A' means the student was absent for the viva: no multiplier, so the
  // activity marks are zeroed exactly as a viva of 0 would do (marks x 0 = 0).
  if (str.toUpperCase() === 'A') return 0;
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < 0) return 0;
  if (num > VIVA_MAX) return VIVA_MAX;
  // Vivas can carry decimals: a 9.1 viva is a 91% multiplier, not a 90% one.
  return roundTo(num, 2);
};

/** ceil(marks * viva / 10) - matches the server exactly. */
export const applyVivaMultiplier = (obtainedMarks, vivaMarks) => {
  const obtained = Number(obtainedMarks) || 0;
  const viva = normalizeVivaScore(vivaMarks);
  if (viva === null) return obtained;
  return Math.ceil(roundTo((obtained * viva) / VIVA_MAX, 6));
};

/**
 * The marks a student actually earns for one sheet row, or null while the row is
 * still ungraded/absent/bypassed so the caller can render a dash instead of a
 * misleading 0.
 */
export const rowFinalMarks = ({ obtainedMarks, isAbsent, isBypassed, vivaEnabled, vivaMarks, isUngraded }) => {
  if (isAbsent || isBypassed || isUngraded) return null;
  const obtained = Number(obtainedMarks);
  if (!Number.isFinite(obtained)) return null;
  return vivaEnabled ? applyVivaMultiplier(obtained, vivaMarks) : obtained;
};

/**
 * The marks a stored row contributes to a grade - the client mirror of the
 * server's effectiveMarks, used when re-deriving a percentage in the browser.
 * Any readout that recomputes a category or class average must use this, or it
 * will report a different number from the letter grade the server stored.
 */
export const effectiveMarks = (item) => {
  if (!item) return 0;
  if (item.hasViva) return applyVivaMultiplier(item.obtainedMarks, item.vivaMarks);
  return Number(item.obtainedMarks) || 0;
};
