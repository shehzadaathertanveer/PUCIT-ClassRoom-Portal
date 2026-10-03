import { useCallback, useEffect, useMemo, useState } from 'react';
import ShieldCheckIcon from '@heroicons/react/24/solid/ShieldCheckIcon';
import ExclamationTriangleIcon from '@heroicons/react/24/solid/ExclamationTriangleIcon';
import CheckCircleIcon from '@heroicons/react/24/solid/CheckCircleIcon';
import API from '../api/axios';

// Standard categories per room type. The `key` values must match the keys marks
// are stored under, because the server resolves limits with the same resolver.
const CLASSROOM_CATEGORIES = [
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'presentations', label: 'Presentations' },
  { key: 'projects', label: 'Projects' },
  { key: 'homework', label: 'Homework' },
  { key: 'classActivities', label: 'Class Activities' },
  { key: 'classParticipation', label: 'Class Participation' },
  { key: 'vivas', label: 'Vivas' },
  { key: 'specialMarks', label: 'Special Marks' },
  { key: 'mids', label: 'Mids' },
  { key: 'finals', label: 'Finals' },
  { key: 'finalProject', label: 'Final Project' }
];

const LAB_CATEGORIES = [
  { key: 'labTasks', label: 'Lab Tasks' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'presentations', label: 'Presentations' },
  { key: 'vivas', label: 'Vivas' },
  { key: 'labTests', label: 'Lab Tests' },
  { key: 'projects', label: 'Projects' },
  { key: 'troubleshooting', label: 'Troubleshooting' },
  { key: 'labWorksheets', label: 'Lab Worksheets' },
  { key: 'labBehavior', label: 'Lab Behaviour' },
  { key: 'labActivities', label: 'Lab Activities' },
  { key: 'labMids', label: 'Lab Mids' },
  { key: 'labFinals', label: 'Lab Finals' },
  { key: 'finalProject', label: 'Final Project' }
];

/**
 * Bypass ("B") limits per activity category.
 *
 * A bypassed activity is excluded from BOTH the earned and the possible total,
 * so a bypass counts for nothing rather than counting as a zero. These limits
 * cap how many activities per category a single student may bypass. The server
 * enforces them on every save, so TAs cannot exceed a cap even by calling the
 * API directly - which is why the inputs are read-only for them.
 *
 * Only categories this room actually has are listed. The server sends
 * `activityCounts` for the room on every load, so adding or removing an activity
 * adds or removes its row here without any extra wiring, and a category the
 * teacher never uses no longer buries the real ones under an empty input.
 *
 * Limits for categories that are currently absent are PRESERVED on save rather
 * than dropped: emptying a category for a term should not silently forget the
 * cap the teacher set, and it must come back intact if the activity returns.
 */
export default function BypassLimitsPanel({
  apiBase,
  roomId,
  roomType = 'classroom',
  customCategories = [],
  canEdit = true,
  showToast = () => {}
}) {
  const [limits, setLimits] = useState({});
  const [activityCounts, setActivityCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const baseCategories = useMemo(
    () => (roomType === 'labroom' ? LAB_CATEGORIES : CLASSROOM_CATEGORIES),
    [roomType]
  );

  // Teacher-defined (custom) categories get their own row so they can be capped
  // too. They are keyed the same way the server keys them.
  const categories = useMemo(() => {
    const custom = (customCategories || [])
      .map((c) => (typeof c === 'string' ? c : c?.category || c?.categoryName || ''))
      .filter(Boolean)
      .map((name) => {
        const label = String(name);
        return {
          // MUST match the server's dynamic fallback in getNormalizedTargetKey:
          // camelCase the label, then pluralise unless it already ends in "s".
          // Without the pluralisation step a custom "Attendance" category would
          // be keyed "attendance" here but "attendances" on the server, so the
          // saved limit would never be read back.
          key: (() => {
            // Both passes must allow A-Z. Stripping only a-z0-9 in the second
            // pass would delete the capitals the first pass just inserted, so
            // "Lab Report" collapsed to "labeport" instead of "labReport".
            const camel = label
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
              .replace(/[^a-zA-Z0-9]/g, '');
            return camel.endsWith('s') ? camel : camel + 's';
          })(),
          label,
          isCustom: true
        };
      });
    return [...baseCategories, ...custom];
  }, [baseCategories, customCategories]);

  const load = useCallback(async () => {
    if (!roomId || !apiBase) return;
    setLoading(true);
    try {
      const res = await API.get(`${apiBase}/bypass-limits/${roomId}`);
      setLimits(res.data?.data?.limits || {});
      // null means "the server did not report counts" (older backend). We fall
      // back to showing every category in that case rather than showing none.
      setActivityCounts(res.data?.data?.activityCounts ?? null);
      setLoaded(true);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load bypass limits.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiBase, roomId, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key, value) => {
    const clean = String(value).replace(/[^0-9]/g, '');
    setLimits(prev => ({ ...prev, [key]: clean === '' ? 0 : Number(clean) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Send every known limit, not just the visible ones, so caps for
      // currently-empty categories survive a save.
      const res = await API.put(`${apiBase}/bypass-limits/${roomId}`, { limits });
      setLimits(res.data?.data?.limits || limits);
      showToast(res.data?.message || 'Bypass limits updated.');
    } catch (err) {
      // The server rejects a cap that would let every activity in a category be
      // bypassed, and explains the ceiling - surface that verbatim.
      showToast(err.response?.data?.message || 'Failed to update bypass limits.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Only the categories this room actually has. activityCounts === null means an
  // older backend that cannot report them, so fall back to the full list.
  const visibleCategories = useMemo(() => {
    if (!activityCounts) return categories;
    return categories.filter((cat) => Number(activityCounts[cat.key] || 0) > 0);
  }, [categories, activityCounts]);

  const visibleKeys = useMemo(
    () => new Set(visibleCategories.map((c) => c.key)),
    [visibleCategories]
  );

  // Caps set on a category that is not currently in the room. These are kept in
  // the payload but not rendered, so the teacher is not confused by an empty row.
  const dormantCount = useMemo(
    () => Object.keys(limits).filter((k) => Number(limits[k]) > 0 && !visibleKeys.has(k)).length,
    [limits, visibleKeys]
  );

  const enabledCount = visibleCategories.filter((c) => Number(limits[c.key] || 0) > 0).length;
  const totalCap = visibleCategories.reduce((a, c) => a + (Number(limits[c.key]) || 0), 0);

  if (loading && !loaded) {
    return <p className="text-xs text-slate-400 py-2">Loading bypass limits…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="lm-eyebrow text-stone-300 flex items-center gap-1.5">
          <ShieldCheckIcon className="w-4 h-4" />
          Bypass Limits (B)
        </p>
        {enabledCount > 0 && (
          <span className="text-[10px] sm:text-xs font-mono text-stone-400">
            {enabledCount} categor{enabledCount === 1 ? 'y' : 'ies'} on · {totalCap} max/student
          </span>
        )}
      </div>

      <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
        Typing <span className="font-mono font-bold text-stone-300">B</span> in a marks box excludes
        that activity from both the earned and the possible total, so it counts for nothing
        instead of counting as a zero. Set the cap per category below; every student must keep at
        least one real grade in each category.
      </p>

      {visibleCategories.length === 0 ? (
        <p className="text-[11px] sm:text-xs text-amber-300/90 leading-relaxed rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2.5">
          This {roomType === 'labroom' ? 'labroom' : 'classroom'} has no activities yet, so there is
          nothing to cap. Add a quiz, assignment, or other activity and its category will appear
          here automatically.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleCategories.map((cat) => {
            const value = Number(limits[cat.key] || 0);
            const disabled = !canEdit;
            const slots = activityCounts ? Number(activityCounts[cat.key] || 0) : null;
            // The server will not accept a cap equal to the activity count, since
            // that would let a student bypass every one of them. Show the ceiling
            // instead of letting the teacher hit a validation error.
            const maxAllowed = slots !== null ? Math.max(0, slots - 1) : null;
            return (
              <div key={cat.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                <span className={`text-[11px] sm:text-xs truncate ${cat.isCustom ? 'text-purple-300' : 'text-slate-300'}`} title={cat.label}>
                  {cat.label}
                  {slots !== null && (
                    <span className="ml-1.5 font-mono text-[10px] text-slate-500">
                      {slots} activit{slots === 1 ? 'y' : 'ies'}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {value > 0 ? (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  ) : (
                    <ExclamationTriangleIcon className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" />
                  )}
                  <input
                    type="number"
                    min="0"
                    step="1"
                    max={maxAllowed ?? undefined}
                    disabled={disabled}
                    value={value}
                    onChange={(e) => handleChange(cat.key, e.target.value)}
                    aria-label={`Bypass limit for ${cat.label}`}
                    className={`lm-field px-2 py-1 rounded-lg text-xs font-mono w-16 text-center ${
                      disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dormantCount > 0 && (
        <p className="text-[11px] text-slate-400">
          {dormantCount} categor{dormantCount === 1 ? 'y' : 'ies'} with a saved cap{' '}
          {dormantCount === 1 ? 'is' : 'are'} not used in this room yet. {dormantCount === 1 ? 'It is' : 'They are'} kept and
          will reappear if the activity comes back.
        </p>
      )}

      {!canEdit && (
        <p className="text-[11px] text-amber-300/90">
          Only the course teacher or an admin can change these limits.
        </p>
      )}

      {canEdit && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={load} disabled={saving} className="lm-btn-ghost">
            Reset
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="lm-btn">
            {saving ? 'Saving…' : 'Save Bypass Limits'}
          </button>
        </div>
      )}
    </div>
  );
}
