/**
 * Shared rules for the "B" (bypass) grading sentinel.
 *
 * A bypassed activity is dropped from BOTH the earned and the possible total so
 * it can neither inflate nor deflate a student's percentage. If every activity
 * a student has is bypassed the earned total collapses to 0, which fails them -
 * that is intentional, and teachers are expected to also cap bypasses so a
 * student always keeps at least one real grade per category.
 *
 * Limits live on the room document (classroom.bypassLimits / labroom.bypassLimits)
 * and are enforced here, server side, so a Teaching Assistant cannot exceed a
 * cap by calling the API directly rather than going through the UI.
 */

const BYPASS_SENTINEL = 'B';
const UNGRADED_SENTINEL = '-99';

/**
 * @param {Object} opts
 * @param {(category: string) => string} opts.resolveKey
 *   Maps a teacher-facing category label onto the key marks are stored under, so
 *   limits are keyed identically no matter which spelling the UI sends.
 * @param {(doc: Object, category: string) => any[]} opts.getItems
 *   Returns the student's existing entries for a category. Handles standard
 *   arrays, single-object categories, and custom (teacher-defined) categories.
 */
const createBypassRules = ({ resolveKey, getItems, getSlotCount }) => {
  const readLimitValue = (room, category) => {
    const limits = room && room.bypassLimits;
    if (!limits) return 0;
    const key = resolveKey(category);

    // Mongoose Maps expose .get(); plain objects (from .lean(), or once the doc
    // has been serialised) need plain property access.
    let raw = null;
    if (typeof limits.get === 'function') raw = limits.get(key);
    if (raw === undefined || raw === null) raw = limits[key];

    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  /**
   * A missing key or 0 means that category cannot be bypassed at all.
   *
   * The stored limit is also clamped against the number of activities that
   * category actually has. Limits are validated when they are saved, but
   * activities can be added afterwards; without this clamp a limit that was
   * legal when the room had one quiz would let a student bypass every quiz once
   * three more were created, leaving them with no real grade at all.
   */
  const getBypassLimit = (room, category) => {
    const stored = readLimitValue(room, category);
    if (stored <= 0) return 0;

    if (typeof getSlotCount !== 'function') return stored;
    const slots = getSlotCount(room, resolveKey(category));
    // A room with no activities in this category cannot meaningfully allow a
    // bypass, so nothing is capped and the stored value stands.
    if (!Number.isFinite(slots) || slots <= 0) return stored;

    return Math.min(stored, slots - 1);
  };

  /**
   * How many entries the student already has bypassed in this category.
   * `excludeTitle` omits the entry currently being edited so re-saving an
   * already-bypassed activity as "B" stays idempotent instead of tripping the cap.
   */
  const countBypassed = (markDoc, category, excludeTitle) => {
    if (!markDoc) return 0;
    const items = getItems(markDoc, category);
    if (!Array.isArray(items)) return 0;
    const skip = typeof excludeTitle === 'string' ? excludeTitle.trim().toLowerCase() : null;
    return items.filter((i) => {
      if (!i || !i.isBypassed) return false;
      if (skip && String(i.title || '').trim().toLowerCase() === skip) return false;
      return true;
    }).length;
  };

  /** Decide whether a bypass is allowed, and explain why not when it isn't. */
  const canBypass = (room, markDoc, category, excludeTitle) => {
    const label = resolveKey(category);
    const limit = getBypassLimit(room, category);
    const used = countBypassed(markDoc, category, excludeTitle);

    if (limit <= 0) {
      return {
        allowed: false,
        limit,
        used,
        message: `Bypassing is disabled for "${label}". A teacher or admin must enable it in Bypass Limit settings first.`
      };
    }
    if (used >= limit) {
      return {
        allowed: false,
        limit,
        used,
        message: `Bypass limit reached for "${label}" (${used}/${limit}). Raise the limit in Bypass Limit settings if more are needed.`
      };
    }
    return { allowed: true, limit, used };
  };

  return { getBypassLimit, readLimitValue, countBypassed, canBypass };
};

module.exports = { createBypassRules, BYPASS_SENTINEL, UNGRADED_SENTINEL };
