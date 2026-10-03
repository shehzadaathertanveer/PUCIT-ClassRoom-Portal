/**
 * Shared room colour palette.
 *
 * Rooms are tinted so a student can tell their Classroom and Labroom apart at a
 * glance on the dashboard.
 *
 * The SAME keys are valid for Classroom and Labroom so a teacher can pair the
 * theory and practical halves of a course with matching colours. The two room
 * types are told apart by their hinge treatment (a solid spine on Labroom, a
 * dashed spine on Classroom) rather than by a different palette.
 *
 * Each entry provides:
 *   hex    - the spine / edge colour. The DEEP, saturated tone.
 *   swatch - the brighter tone used for the picker chip. Optional; falls back to
 *            hex. Only the newer, deeper colours declare it.
 *   tint   - very low-alpha wash for the card body
 *   wash   - slightly stronger wash for headers and hover states
 *   text   - an accessible tint of the hue for labels on the dark surface
 *
 * Why the newer colours carry two tones
 * -------------------------------------
 * The first fifteen are pale-to-mid tones that read clearly on a dark surface on
 * their own. The fifteen newer ones are deliberately deeper and more saturated
 * ("regular and dark"), which is what makes them distinguishable from the
 * originals at a glance - but a deep tone dropped straight onto a dark UI turns
 * muddy and the swatch vanishes. So for those, `hex` (deep) paints the hinge
 * while `swatch` (vivid) paints the picker chip, and tint/wash are mixed from
 * the vivid tone so the card still reads as coloured rather than black.
 *
 * Keys are stored on the room document and validated by enum, so a hand-crafted
 * request cannot inject an arbitrary CSS value.
 */

const ROOM_COLORS = Object.freeze({
  slate:   { hex: '#94a3b8', tint: 'rgba(148,163,184,0.10)', wash: 'rgba(148,163,184,0.18)', text: '#cbd5e1' },
  stone:   { hex: '#a8a29e', tint: 'rgba(168,162,158,0.10)', wash: 'rgba(168,162,158,0.18)', text: '#d6d3d1' },
  red:     { hex: '#f87171', tint: 'rgba(248,113,113,0.10)', wash: 'rgba(248,113,113,0.18)', text: '#fca5a5' },
  rose:    { hex: '#fb7185', tint: 'rgba(251,113,133,0.10)', wash: 'rgba(251,113,133,0.18)', text: '#fda4af' },
  pink:    { hex: '#f472b6', tint: 'rgba(244,114,182,0.10)', wash: 'rgba(244,114,182,0.18)', text: '#f9a8d4' },
  purple:  { hex: '#c084fc', tint: 'rgba(192,132,252,0.10)', wash: 'rgba(192,132,252,0.18)', text: '#d8b4fe' },
  violet:  { hex: '#a78bfa', tint: 'rgba(167,139,250,0.10)', wash: 'rgba(167,139,250,0.18)', text: '#c4b5fd' },
  indigo:  { hex: '#818cf8', tint: 'rgba(129,140,248,0.10)', wash: 'rgba(129,140,248,0.18)', text: '#a5b4fc' },
  blue:    { hex: '#60a5fa', tint: 'rgba(96,165,250,0.10)', wash: 'rgba(96,165,250,0.18)', text: '#93c5fd' },
  sky:     { hex: '#38bdf8', tint: 'rgba(56,189,248,0.10)', wash: 'rgba(56,189,248,0.18)', text: '#7dd3fc' },
  cyan:    { hex: '#22d3ee', tint: 'rgba(34,211,238,0.10)', wash: 'rgba(34,211,238,0.18)', text: '#67e8f9' },
  teal:    { hex: '#2dd4bf', tint: 'rgba(45,212,191,0.10)', wash: 'rgba(45,212,191,0.18)', text: '#5eead4' },
  emerald: { hex: '#34d399', tint: 'rgba(52,211,153,0.10)', wash: 'rgba(52,211,153,0.18)', text: '#6ee7b7' },
  lime:    { hex: '#a3e635', tint: 'rgba(163,230,53,0.10)', wash: 'rgba(163,230,53,0.18)', text: '#bef264' },
  amber:   { hex: '#fbbf24', tint: 'rgba(251,191,36,0.10)', wash: 'rgba(251,191,36,0.18)', text: '#fcd34d' },
  orange:  { hex: '#fb923c', tint: 'rgba(251,146,60,0.10)', wash: 'rgba(251,146,60,0.18)', text: '#fdba74' },

  // --- Second wave: deeper, more saturated tones -----------------------------
  // `hex` is the deep hinge colour, `swatch` the vivid picker chip. tint/wash are
  // mixed from the vivid tone so the card reads as coloured, not black.
  crimson: { hex: '#9f1239', swatch: '#e11d48', tint: 'rgba(225,29,72,0.12)',  wash: 'rgba(225,29,72,0.22)',  text: '#fecdd3' },
  maroon:  { hex: '#7f1d1d', swatch: '#dc2626', tint: 'rgba(220,38,38,0.12)',  wash: 'rgba(220,38,38,0.22)',  text: '#fecaca' },
  fuchsia: { hex: '#86198f', swatch: '#e879f9', tint: 'rgba(232,121,249,0.12)', wash: 'rgba(232,121,249,0.22)', text: '#fae8ff' },
  plum:    { hex: '#701a75', swatch: '#d946ef', tint: 'rgba(217,70,239,0.12)',  wash: 'rgba(217,70,239,0.22)',  text: '#f5d0fe' },
  grape:   { hex: '#6b21a8', swatch: '#a855f7', tint: 'rgba(168,85,247,0.12)',  wash: 'rgba(168,85,247,0.22)',  text: '#f3e8ff' },
  royal:   { hex: '#5b21b6', swatch: '#8b5cf6', tint: 'rgba(139,92,246,0.12)',  wash: 'rgba(139,92,246,0.22)',  text: '#ede9fe' },
  ink:     { hex: '#312e81', swatch: '#6366f1', tint: 'rgba(99,102,241,0.12)',  wash: 'rgba(99,102,241,0.22)',  text: '#e0e7ff' },
  cobalt:  { hex: '#1e40af', swatch: '#3b82f6', tint: 'rgba(59,130,246,0.12)',  wash: 'rgba(59,130,246,0.22)',  text: '#dbeafe' },
  azure:   { hex: '#075985', swatch: '#0284c7', tint: 'rgba(2,132,199,0.12)',   wash: 'rgba(2,132,199,0.22)',   text: '#e0f2fe' },
  lagoon:  { hex: '#0e7490', swatch: '#22d3ee', tint: 'rgba(34,211,238,0.12)',  wash: 'rgba(34,211,238,0.22)',  text: '#cffafe' },
  pine:    { hex: '#065f46', swatch: '#10b981', tint: 'rgba(16,185,129,0.12)',  wash: 'rgba(16,185,129,0.22)',  text: '#d1fae5' },
  forest:  { hex: '#14532d', swatch: '#22c55e', tint: 'rgba(34,197,94,0.12)',   wash: 'rgba(34,197,94,0.22)',   text: '#dcfce7' },
  olive:   { hex: '#3f6212', swatch: '#65a30d', tint: 'rgba(101,163,13,0.12)',  wash: 'rgba(101,163,13,0.22)',  text: '#ecfccb' },
  mustard: { hex: '#854d0e', swatch: '#ca8a04', tint: 'rgba(202,138,4,0.12)',   wash: 'rgba(202,138,4,0.22)',   text: '#fef9c3' },
  copper:  { hex: '#7c2d12', swatch: '#ea580c', tint: 'rgba(234,88,12,0.12)',   wash: 'rgba(234,88,12,0.22)',   text: '#ffedd5' }
});

const ROOM_COLOR_KEYS = Object.freeze(Object.keys(ROOM_COLORS));
const DEFAULT_ROOM_COLOR = 'slate';

// The 30 options offered in the picker, ordered light-to-deep around the wheel
// so neighbouring swatches are visibly different. "stone" is intentionally not
// offered - it sits between slate and amber with nothing to distinguish it - but
// it stays in ROOM_COLORS so a room already saved with it still validates.
const ROOM_COLOR_CHOICES = Object.freeze([
  // Original fifteen.
  'slate', 'blue', 'sky', 'cyan', 'teal', 'emerald', 'lime', 'amber',
  'orange', 'red', 'rose', 'pink', 'violet', 'indigo', 'purple',
  // New fifteen: deeper and more saturated.
  'crimson', 'maroon', 'copper', 'mustard', 'olive', 'forest', 'pine',
  'lagoon', 'azure', 'cobalt', 'ink', 'royal', 'grape', 'plum', 'fuchsia'
]);

const isValidRoomColor = (key) => ROOM_COLOR_KEYS.includes(key);

/** Coerce anything unrecognised to the default so a bad value can never render. */
const normaliseRoomColor = (key) => (isValidRoomColor(key) ? key : DEFAULT_ROOM_COLOR);

const getRoomColor = (key) => ROOM_COLORS[normaliseRoomColor(key)];

module.exports = {
  ROOM_COLORS,
  ROOM_COLOR_KEYS,
  ROOM_COLOR_CHOICES,
  DEFAULT_ROOM_COLOR,
  isValidRoomColor,
  normaliseRoomColor,
  getRoomColor
};
