/**
 * Room colour palette - mirrors backend/utils/roomColors.js.
 *
 * Classroom and Labroom share the SAME options so a teacher can pair the theory
 * and practical halves of a course with matching colours. The two room types are
 * told apart by their hinge treatment (solid spine on Labroom, dashed spine on
 * Classroom) plus the existing destination icon, not by a different palette.
 *
 * Two-tone entries
 * ----------------
 * The original fifteen are pale-to-mid tones that read fine on a dark surface on
 * their own. The fifteen newer ones are deliberately deeper and more saturated,
 * which is what makes them distinguishable at a glance - but a deep tone painted
 * straight onto this UI turns muddy and the picker chip disappears into the
 * background. So a newer entry declares:
 *
 *   hex    - the DEEP tone, used for the hinge/edge
 *   swatch - the VIVID tone, used for the picker chip
 *
 * tint/wash are mixed from the vivid tone for those, so the card body still
 * reads as coloured rather than black. `pickTone` implements that fallback.
 */

export const ROOM_COLORS = {
  slate:   { hex: '#94a3b8', tint: 'rgba(148,163,184,0.10)', wash: 'rgba(148,163,184,0.18)', text: '#cbd5e1', label: 'Slate' },
  stone:   { hex: '#a8a29e', tint: 'rgba(168,162,158,0.10)', wash: 'rgba(168,162,158,0.18)', text: '#d6d3d1', label: 'Stone' },
  red:     { hex: '#f87171', tint: 'rgba(248,113,113,0.10)', wash: 'rgba(248,113,113,0.18)', text: '#fca5a5', label: 'Red' },
  rose:    { hex: '#fb7185', tint: 'rgba(251,113,133,0.10)', wash: 'rgba(251,113,133,0.18)', text: '#fda4af', label: 'Rose' },
  pink:    { hex: '#f472b6', tint: 'rgba(244,114,182,0.10)', wash: 'rgba(244,114,182,0.18)', text: '#f9a8d4', label: 'Pink' },
  purple:  { hex: '#c084fc', tint: 'rgba(192,132,252,0.10)', wash: 'rgba(192,132,252,0.18)', text: '#d8b4fe', label: 'Purple' },
  violet:  { hex: '#a78bfa', tint: 'rgba(167,139,250,0.10)', wash: 'rgba(167,139,250,0.18)', text: '#c4b5fd', label: 'Violet' },
  indigo:  { hex: '#818cf8', tint: 'rgba(129,140,248,0.10)', wash: 'rgba(129,140,248,0.18)', text: '#a5b4fc', label: 'Indigo' },
  blue:    { hex: '#60a5fa', tint: 'rgba(96,165,250,0.10)', wash: 'rgba(96,165,250,0.18)', text: '#93c5fd', label: 'Blue' },
  sky:     { hex: '#38bdf8', tint: 'rgba(56,189,248,0.10)', wash: 'rgba(56,189,248,0.18)', text: '#7dd3fc', label: 'Sky' },
  cyan:    { hex: '#22d3ee', tint: 'rgba(34,211,238,0.10)', wash: 'rgba(34,211,238,0.18)', text: '#67e8f9', label: 'Cyan' },
  teal:    { hex: '#2dd4bf', tint: 'rgba(45,212,191,0.10)', wash: 'rgba(45,212,191,0.18)', text: '#5eead4', label: 'Teal' },
  emerald: { hex: '#34d399', tint: 'rgba(52,211,153,0.10)', wash: 'rgba(52,211,153,0.18)', text: '#6ee7b7', label: 'Emerald' },
  lime:    { hex: '#a3e635', tint: 'rgba(163,230,53,0.10)', wash: 'rgba(163,230,53,0.18)', text: '#bef264', label: 'Lime' },
  amber:   { hex: '#fbbf24', tint: 'rgba(251,191,36,0.10)', wash: 'rgba(251,191,36,0.18)', text: '#fcd34d', label: 'Amber' },
  orange:  { hex: '#fb923c', tint: 'rgba(251,146,60,0.10)', wash: 'rgba(251,146,60,0.18)', text: '#fdba74', label: 'Orange' },

  // New fifteen: deep, saturated hinges with vivid picker chips.
  crimson: { hex: '#9f1239', swatch: '#e11d48', tint: 'rgba(225,29,72,0.12)',  wash: 'rgba(225,29,72,0.22)',  text: '#fecdd3', label: 'Crimson' },
  maroon:  { hex: '#7f1d1d', swatch: '#dc2626', tint: 'rgba(220,38,38,0.12)',  wash: 'rgba(220,38,38,0.22)',  text: '#fecaca', label: 'Maroon' },
  fuchsia: { hex: '#86198f', swatch: '#e879f9', tint: 'rgba(232,121,249,0.12)', wash: 'rgba(232,121,249,0.22)', text: '#fae8ff', label: 'Fuchsia' },
  plum:    { hex: '#701a75', swatch: '#d946ef', tint: 'rgba(217,70,239,0.12)',  wash: 'rgba(217,70,239,0.22)',  text: '#f5d0fe', label: 'Plum' },
  grape:   { hex: '#6b21a8', swatch: '#a855f7', tint: 'rgba(168,85,247,0.12)',  wash: 'rgba(168,85,247,0.22)',  text: '#f3e8ff', label: 'Grape' },
  royal:   { hex: '#5b21b6', swatch: '#8b5cf6', tint: 'rgba(139,92,246,0.12)',  wash: 'rgba(139,92,246,0.22)',  text: '#ede9fe', label: 'Royal' },
  ink:     { hex: '#312e81', swatch: '#6366f1', tint: 'rgba(99,102,241,0.12)',  wash: 'rgba(99,102,241,0.22)',  text: '#e0e7ff', label: 'Ink' },
  cobalt:  { hex: '#1e40af', swatch: '#3b82f6', tint: 'rgba(59,130,246,0.12)',  wash: 'rgba(59,130,246,0.22)',  text: '#dbeafe', label: 'Cobalt' },
  azure:   { hex: '#075985', swatch: '#0284c7', tint: 'rgba(2,132,199,0.12)',   wash: 'rgba(2,132,199,0.22)',   text: '#e0f2fe', label: 'Azure' },
  lagoon:  { hex: '#0e7490', swatch: '#22d3ee', tint: 'rgba(34,211,238,0.12)',  wash: 'rgba(34,211,238,0.22)',  text: '#cffafe', label: 'Lagoon' },
  pine:    { hex: '#065f46', swatch: '#10b981', tint: 'rgba(16,185,129,0.12)',  wash: 'rgba(16,185,129,0.22)',  text: '#d1fae5', label: 'Pine' },
  forest:  { hex: '#14532d', swatch: '#22c55e', tint: 'rgba(34,197,94,0.12)',   wash: 'rgba(34,197,94,0.22)',   text: '#dcfce7', label: 'Forest' },
  olive:   { hex: '#3f6212', swatch: '#65a30d', tint: 'rgba(101,163,13,0.12)',  wash: 'rgba(101,163,13,0.22)',  text: '#ecfccb', label: 'Olive' },
  mustard: { hex: '#854d0e', swatch: '#ca8a04', tint: 'rgba(202,138,4,0.12)',   wash: 'rgba(202,138,4,0.22)',   text: '#fef9c3', label: 'Mustard' },
  copper:  { hex: '#7c2d12', swatch: '#ea580c', tint: 'rgba(234,88,12,0.12)',   wash: 'rgba(234,88,12,0.22)',   text: '#ffedd5', label: 'Copper' }
};

export const ROOM_COLOR_CHOICES = [
  'slate', 'blue', 'sky', 'cyan', 'teal', 'emerald', 'lime', 'amber',
  'orange', 'red', 'rose', 'pink', 'violet', 'indigo', 'purple',
  'crimson', 'maroon', 'copper', 'mustard', 'olive', 'forest', 'pine',
  'lagoon', 'azure', 'cobalt', 'ink', 'royal', 'grape', 'plum', 'fuchsia'
];

export const DEFAULT_ROOM_COLOR = 'slate';

/** Unknown/missing keys fall back to the default so nothing can render undefined. */
export const getRoomColor = (key) => ROOM_COLORS[key] || ROOM_COLORS[DEFAULT_ROOM_COLOR];

/**
 * The tone to paint a small UI chip with. Deep hinge colours carry a separate
 * vivid `swatch`; single-tone colours fall back to their own hex.
 */
const pickTone = (c) => c.swatch || c.hex;

/**
 * Inline styles for a room card: a tinted body with a coloured hinge down the
 * leading edge. `variant` distinguishes the room types so a Classroom and a
 * Labroom can share a colour and still be told apart.
 */
export const roomCardStyle = (key, variant = 'classroom') => {
  const c = getRoomColor(key);
  const isLab = variant === 'labroom';
  return {
    backgroundColor: c.tint,
    borderColor: `${c.hex}33`,
    // Labroom gets a solid spine, Classroom a dashed one.
    borderLeftStyle: isLab ? 'solid' : 'dashed',
    borderLeftWidth: '4px',
    borderLeftColor: c.hex,
    '--room-hex': c.hex,
    '--room-wash': c.wash,
    '--room-text': c.text
  };
};

/**
 * Lighter-weight variant for compact room rows (admin analytics lists). Keeps the
 * same dashed/solid hinge distinction but tints less of the surface.
 */
export const roomRowStyle = (key, variant = 'classroom') => {
  const c = getRoomColor(key);
  const isLab = variant === 'labroom';
  return {
    backgroundColor: c.wash,
    borderColor: `${c.hex}2e`,
    borderLeftStyle: isLab ? 'solid' : 'dashed',
    borderLeftWidth: '3px',
    borderLeftColor: c.hex
  };
};

/** Coloured swatch button used by the picker. */
export const swatchStyle = (key, selected) => {
  const c = getRoomColor(key);
  const tone = pickTone(c);
  return {
    backgroundColor: selected ? tone : c.tint,
    borderColor: selected ? tone : `${c.hex}66`,
    boxShadow: selected ? `0 0 0 2px ${tone}55` : 'none'
  };
};
