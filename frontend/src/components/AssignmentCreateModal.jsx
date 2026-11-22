import { useState } from 'react';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';

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
      onCreated?.(res.data?.data?.assignment);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not create assignment.');
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="lm-scrim">
      <div className="lm-modal max-w-2xl p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-100 uppercase">Assign Work</h3>
            <p className="text-[11px] text-slate-400">Students get an email, an in-app notice, and a submission page.</p>
          </div>
          <button type="button" onClick={onClose} className="lm-btn-ghost !px-2.5 !py-2">Close</button>
        </div>

        {error && <div className="lm-inset border-rose-500/40 bg-rose-950/40 text-rose-200 text-xs p-3">{error}</div>}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block lm-eyebrow mb-1.5">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="lm-field">
                {supportedCategories.length
                  ? supportedCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)
                  : <option>{fallbackCategory}</option>}
              </select>
            </div>
            <div>
              <label className="block lm-eyebrow mb-1.5">Total Marks</label>
              <input type="number" min="1" required value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} className="lm-field font-mono" />
            </div>
          </div>

          <div>
            <label className="block lm-eyebrow mb-1.5">Topic / Title</label>
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="lm-field" placeholder="e.g. OOP Lab 09 Submission" />
          </div>

          <div>
            <label className="block lm-eyebrow mb-1.5">Instructions / Description</label>
            <textarea rows="4" value={description} onChange={(e) => setDescription(e.target.value)} className="lm-field" placeholder="Explain what students must submit..." />
          </div>

          <div>
            <label className="block lm-eyebrow mb-1.5">Instruction File (optional)</label>
            <input type="file" accept=".pdf,.zip,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => setInstructionFile(e.target.files?.[0] || null)} className="lm-field cursor-pointer" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block lm-eyebrow mb-1.5">Deadline</label>
              <input type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="lm-field font-mono" />
            </div>
            <div>
              <label className="block lm-eyebrow mb-1.5">Max File Size</label>
              <div className="flex gap-2">
                <input type="number" min="1" required value={maxSize} onChange={(e) => setMaxSize(e.target.value)} className="lm-field font-mono" />
                <select value={maxSizeUnit} onChange={(e) => setMaxSizeUnit(e.target.value)} className="lm-field font-mono w-24">
                  <option value="B">B</option>
                  <option value="KB">KB</option>
                  <option value="MB">MB</option>
                  <option value="GB">GB</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block lm-eyebrow mb-2">Allowed File Types</label>
            <div className="flex flex-wrap gap-2">
              {['pdf', 'zip', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg'].map((type) => (
                <button key={type} type="button" onClick={() => toggleType(type)} className={`lm-chip uppercase ${allowedTypes.includes(type) ? 'lm-chip-active' : ''}`}>{type}</button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={submitting || uploading} className="lm-btn w-full py-3">
            {uploading ? 'Uploading instructions...' : submitting ? 'Creating...' : 'Create Assignment & Notify Students'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AssignmentCreateModal;
