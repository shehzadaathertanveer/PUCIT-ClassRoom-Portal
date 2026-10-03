/**
 * Shared room colour palette.
 *
 * Rooms are tinted so a student can tell their Classroom and Labroom apart at a
 * glance on the dashboard. Colours are deliberately moderate rather than neon,
 * because they sit on a dark surface and a saturated fill would out-shout the
 * marks and notices below them.
 *
 * The SAME keys are valid for Classroom and Labroom so a teacher can pair the
 * theory and practical halves of a course with matching colours. The two room
 * types are told apart by their hinge treatment (a solid spine on Labroom, a
 * dashed spine on Classroom) rather than by a different palette - see
 * ROOM_COLOR_GLYPH in the frontend.
 *
 * Each entry provides:
 *   hex   - the spine / edge colour
 *   tint  - very low-alpha wash for the card body
 *   wash  - slightly stronger wash for headers and hover states
 *   text  - an accessible tint of the hue for labels on the dark surface
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
  orange:  { hex: '#fb923c', tint: 'rgba(251,146,60,0.10)', wash: 'rgba(251,146,60,0.18)', text: '#fdba74' }
});

const ROOM_COLOR_KEYS = Object.freeze(Object.keys(ROOM_COLORS));
const DEFAULT_ROOM_COLOR = 'slate';

// Subset offered in the picker - keeps the row scannable and the hues evenly
// spread rather than listing three pinks in a row.
const ROOM_COLOR_CHOICES = Object.freeze([
  'slate', 'blue', 'sky', 'teal', 'emerald', 'lime',
  'amber', 'orange', 'red', 'rose', 'pink', 'violet',
  'purple', 'indigo', 'cyan'
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
