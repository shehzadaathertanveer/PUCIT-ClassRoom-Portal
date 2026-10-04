// Grade letter + grade point pill, shared by classrooms and labrooms so a
// student sees the exact same scale in their theory and practical subjects.
//
// The backend is the source of truth for grade and gradePoint (backend/utils/gradeScale.js).
// This component only formats what it is given; it deliberately does NOT re-derive
// the grade from the percentage, because that is how the UI and the stored
// transcript drift apart.
//
//   0-49 F 0.00 | 50-54 D 1.00 | 55-57 C- 1.70 | 58-60 C 2.00 | 61-64 C+ 2.30
//   65-69 B- 2.70 | 70-74 B 3.00 | 75-79 B+ 3.30 | 80-84 A- 3.70 | 85-100 A 4.00

const BAND_STYLES = {
  A: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200',
  'A-': 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  'B+': 'border-sky-400/30 bg-sky-500/10 text-sky-200',
  B: 'border-sky-400/30 bg-sky-500/10 text-sky-300',
  'B-': 'border-teal-400/30 bg-teal-500/10 text-teal-200',
  'C+': 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  C: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  'C-': 'border-orange-400/30 bg-orange-500/10 text-orange-200',
  D: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
  F: 'border-red-500/40 bg-red-500/15 text-red-200'
};

const DEFAULT_STYLE = 'border-slate-600/50 bg-slate-700/30 text-slate-300';

/**
 * @param {object} props
 * @param {string} props.grade           e.g. "B+" or "In Progress (Sessional)"
 * @param {number} props.gradePoint      0.00 - 4.00
 * @param {boolean} [props.showGpaLabel] render "GPA" before the number
 * @param {boolean} [props.compact]      tighter padding for table rows
 */
export default function GradeBadge({ grade, gradePoint, showGpaLabel = true, compact = false }) {
  if (!grade) return null;

  const isInProgress = grade.startsWith('In Progress');
  const gp = Number(gradePoint);
  const safeGp = Number.isFinite(gp) ? gp : 0;
  const style = isInProgress
    ? 'border-slate-600/50 bg-slate-700/30 text-slate-400'
    : (BAND_STYLES[grade] || DEFAULT_STYLE);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border font-bold whitespace-nowrap ${style} ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px] sm:text-xs'
      }`}
      title={isInProgress ? 'No exam has been graded yet' : `Grade ${grade} - Grade Point ${safeGp.toFixed(2)} of 4.00`}
    >
      <span className="uppercase tracking-wide">Grade</span>
      <span className="font-mono font-black">{grade}</span>
      {!isInProgress && (
        <span className="font-mono font-black text-slate-100/90">
          {showGpaLabel && <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 mr-0.5">GPA</span>}
          {safeGp.toFixed(2)}
        </span>
      )}
    </span>
  );
}