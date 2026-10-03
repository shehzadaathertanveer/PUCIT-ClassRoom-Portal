/**
 * Room colour palette - mirrors backend/utils/roomColors.js.
 *
 * Classroom and Labroom share the SAME options so a teacher can pair the theory
 * and practical halves of a course with matching colours. The two room types are
 * told apart by their hinge treatment (solid spine on Labroom, dashed spine on
 * Classroom) plus the existing destination icon, not by a different palette.
 *
 * Colours are moderate rather than neon: they sit on a dark surface where a
 * saturated fill would out-shout the marks and notices underneath them.
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
  orange:  { hex: '#fb923c', tint: 'rgba(251,146,60,0.10)', wash: 'rgba(251,146,60,0.18)', text: '#fdba74', label: 'Orange' }
};

export const ROOM_COLOR_CHOICES = [
  'slate', 'blue', 'sky', 'teal', 'emerald', 'lime',
  'amber', 'orange', 'red', 'rose', 'pink', 'violet',
  'purple', 'indigo', 'cyan'
];

export const DEFAULT_ROOM_COLOR = 'slate';

/** Unknown/missing keys fall back to the default so nothing can render undefined. */
export const getRoomColor = (key) => ROOM_COLORS[key] || ROOM_COLORS[DEFAULT_ROOM_COLOR];

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
  return {
    backgroundColor: selected ? c.hex : c.tint,
    borderColor: selected ? c.hex : `${c.hex}66`,
    boxShadow: selected ? `0 0 0 2px ${c.hex}55` : 'none'
  };
};
