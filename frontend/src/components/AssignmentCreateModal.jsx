import { useState } from 'react';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';
import { invalidateAssignments } from './AssignmentNoticeBar';

const CLASS_KEYS = ['quizzes', 'assignments', 'presentations', 'projects', 'homework', 'classActivities', 'classParticipation', 'vivas', 'specialMarks'];
const LAB_KEYS = ['labTasks', 'labTests', 'quizzes', 'assignments', 'presentations', 'vivas', 'projects', 'finalProject', 'labMids', 'labFinals', 'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'];
const ALIASES = {
  quiz: 'quizzes', assignment: 'assignments', presentation: 'presentations', project: 'projects',
  classactivity: 'classActivities', classparticipation: 'classParticipation', viva: 'vivas', specialmark: 'specialMarks',
  labtask: 'labTasks', labtest: 'labTests', finalproject: 'finalProject', labmid: 'labMids', labfinal: 'labFinals',
  labactivity: 'labActivities', labbehavior: 'labBehavior', labworksheet: 'labWorksheets',
};

const resolveKey = (roomType, label) => {
  const keys = roomType === 'LABROOM' ? LAB_KEYS : CLASS_KEYS;
  const raw = String(label || '').trim();
  if (keys.includes(raw)) return raw;
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const resolved = ALIASES[compact] || keys.find((key) => key.toLowerCase() === compact) || '';
  return keys.includes(resolved) ? resolved : '';
};

const datetimeLocal = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const AssignmentCreateModal = ({ roomType, roomId, categories, onClose, onCreated }) => {
  const supportedCategories = (categories || []).filter((item) => resolveKey(roomType, item));
  const fallbackCategory = roomType === 'LABROOM' ? 'Lab Tasks' : 'Assignments';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(supportedCategories[0] || fallbackCategory);
  const [totalMarks, setTotalMarks] = useState(10);
  const [dueAt, setDueAt] = useState(() => datetimeLocal(new Date(Date.now() + 7 * 86400000)));
  const [allowedTypes, setAllowedTypes] = useState(['pdf', 'zip']);
  const [maxSize, setMaxSize] = useState(10);
  const [maxSizeUnit, setMaxSizeUnit] = useState('KB');
  const [instructionFile, setInstructionFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleType = (type) => {
    setAllowedTypes((current) => current.includes(type) ? current.filter((t) => t !== type) : [...current, type]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!allowedTypes.length) return setError('Select at least one allowed file type.');
    const categoryKey = resolveKey(roomType, category);
    if (!categoryKey) return setError('Choose a supported sessional category.');
    setSubmitting(true);
    let instructionsFile = null;
    try {
      if (instructionFile) {
        setUploading(true);
        const uploaded = await uploadToCloudinary(instructionFile);
        instructionsFile = { ...uploaded, size: instructionFile.size };
        setUploading(false);
      }
      const res = await API.post('/assignments', {
        roomType,
        roomId,
        categoryKey,
        title,
        description,
        totalMarks: Number(totalMarks),
        dueAt: new Date(dueAt).toISOString(),
        allowedTypes,
        maxSize: Number(maxSize),
        maxSizeUnit,
        instructionsFile,
      });
      invalidateAssignments();
      onCreated?.(res.data?.data?.assignment);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not create assignment.');
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="lm-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lm-modal max-w-3xl p-0 overflow-hidden">
        <div className="border-b border-white/[0.07] bg-gradient-to-r from-amber-500/[0.08] via-transparent to-transparent px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="lm-eyebrow text-amber-200/80">New Assignment</p>
              <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-100 sm:text-xl">Assign Work</h3>
              <p className="mt-1 text-sm text-slate-400">Create a task, set a deadline, and notify enrolled students.</p>
            </div>
            <button type="button" onClick={onClose} className="lm-btn-ghost shrink-0 !px-3 !py-2">Close</button>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          {error && <div className="rounded-xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-sm text-rose-200">{error}</div>}

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-slate-300">1</span>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Task Details</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-slate-200">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="lm-field">
                  {supportedCategories.length
                    ? supportedCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)
                    : <option>{fallbackCategory}</option>}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-slate-200">Total Marks</span>
                <input type="number" min="1" required value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} className="lm-field font-mono" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-200">Title</span>
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="lm-field" placeholder="e.g. OOP Lab 09 Submission" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-200">Instructions</span>
              <textarea rows="4" value={description} onChange={(e) => setDescription(e.target.value)} className="lm-field min-h-28 resize-y leading-relaxed" placeholder="Explain what students must submit, format, and any important notes." />
            </label>
          </section>

          <section className="space-y-4 border-t border-white/[0.07] pt-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-slate-300">2</span>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Deadline & Submission</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-slate-200">Deadline</span>
                <input type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="lm-field font-mono" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-slate-200">Max File Size</span>
                <div className="flex gap-2">
                  <input type="number" min="1" required value={maxSize} onChange={(e) => setMaxSize(e.target.value)} className="lm-field font-mono" />
                  <select value={maxSizeUnit} onChange={(e) => setMaxSizeUnit(e.target.value)} className="lm-field font-mono !w-24 shrink-0">
                    <option value="B">B</option>
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                    <option value="GB">GB</option>
                  </select>
                </div>
              </label>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-slate-200">Allowed File Types</span>
              <div className="flex flex-wrap gap-2">
                {['pdf', 'zip', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg'].map((type) => (
                  <button key={type} type="button" onClick={() => toggleType(type)} className={`lm-chip !px-3 !py-2 uppercase ${allowedTypes.includes(type) ? 'lm-chip-active' : ''}`}>{type}</button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-200">Instruction File <span className="font-normal text-slate-500">(optional)</span></span>
              <input type="file" accept=".pdf,.zip,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setInstructionFile(e.target.files?.[0] || null)} className="lm-field cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-200" />
              {instructionFile && <p className="mt-2 text-xs text-slate-400">{instructionFile.name}</p>}
            </label>
          </section>

          <div className="flex flex-col-reverse gap-3 border-t border-white/[0.07] pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="lm-btn-ghost w-full sm:w-auto">Cancel</button>
            <button type="submit" disabled={submitting || uploading} className="lm-btn w-full sm:w-auto sm:min-w-56">
              {uploading ? 'Uploading instructions...' : submitting ? 'Creating...' : 'Create & Notify Students'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignmentCreateModal;
