import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  PaperClipIcon,
  TableCellsIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import API from '../api/axios';
import { getAttachmentDownloadUrl, uploadToCloudinary } from '../utils/cloudinary';
import { invalidateAssignments, useTick } from '../components/AssignmentNoticeBar';

const pad = (n) => String(n).padStart(2, '0');
const datetimeLocal = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const humanizeKey = (key) => String(key || '')
  .replace(/([A-Z])/g, ' $1')
  .replace(/^./, (char) => char.toUpperCase());

const Stat = ({ label, value, sub, tone = 'text-slate-100' }) => (
  <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
    <p className={`mt-1 truncate font-mono text-sm font-bold ${tone}`}>{value}</p>
    {sub && <p className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</p>}
  </div>
);

const Countdown = ({ dueAt }) => {
  const now = useTick();
  const ms = new Date(dueAt).getTime() - now;
  const passed = ms <= 0;
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((ms % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((ms % 60000) / 1000));

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${passed ? 'border-rose-500/25 bg-rose-950/25' : 'border-emerald-400/20 bg-emerald-950/20'}`}>
      <div className={`absolute inset-x-0 top-0 h-px ${passed ? 'bg-gradient-to-r from-transparent via-rose-300/60 to-transparent' : 'bg-gradient-to-r from-transparent via-emerald-300/60 to-transparent'}`} />
      <div className="flex items-center justify-between gap-2">
        <p className="lm-eyebrow">{passed ? 'Deadline passed' : 'Time remaining'}</p>
        <CalendarDaysIcon className={`h-4 w-4 ${passed ? 'text-rose-300' : 'text-emerald-300'}`} />
      </div>
      <p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
        {passed ? '00d 00h 00m 00s' : `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`}
      </p>
      <p className="mt-1 text-xs text-slate-400">{new Date(dueAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
    </div>
  );
};

const AssignmentPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [pastDue, setPastDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [extension, setExtension] = useState('');
  const [gradeDrafts, setGradeDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/assignments/${id}`);
      const data = res.data?.data?.assignment;
      setAssignment(data);
      setPastDue(new Date(data.dueAt).getTime() <= Date.now());
      setExtension(datetimeLocal(new Date(new Date(data.dueAt).getTime() + 86400000)));
      if (data.submissions) {
        const drafts = {};
        data.submissions.forEach((sub) => { drafts[String(sub.student?._id || sub.student)] = sub.marks ?? ''; });
        setGradeDrafts(drafts);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not load assignment.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!assignment || pastDue) return undefined;
    const dueAt = new Date(assignment.dueAt).getTime();
    let timer;
    const schedule = () => {
      const delay = dueAt - Date.now();
      if (delay <= 0) {
        setPastDue(true);
        return;
      }
      timer = setTimeout(schedule, Math.min(delay, 2147483647));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [assignment, pastDue]);

  const mySubmission = assignment?.mySubmission;
  const canManage = Boolean(assignment?.canManage);
  const roomRoute = assignment
    ? (assignment.roomType === 'LABROOM' ? `/labrooms/${assignment.room}` : `/classroom/${assignment.room}`)
    : '/';
  const submissions = assignment?.submissions || [];
  const ungradedCount = submissions.filter((sub) => sub.marks === null || sub.marks === undefined).length;
  const gradedCount = submissions.length - ungradedCount;

  const openMarksheet = (ungradedOnly = false) => {
    if (!assignment) return;
    const base = assignment.roomType === 'LABROOM' ? 'labroom' : 'classroom';
    navigate(`/${base}/${assignment.room}/sheet/${assignment.categoryKey}/${encodeURIComponent(assignment.title)}`, {
      state: {
        totalMarks: assignment.totalMarks,
        category: assignment.categoryKey,
        filterUngraded: ungradedOnly,
        filterUnassigned: ungradedOnly,
      },
    });
  };

  const maxBytes = useMemo(() => {
    if (!assignment) return 0;
    const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };
    return Number(assignment.maxSize) * units[assignment.maxSizeUnit];
  }, [assignment]);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return setError('Choose a file first.');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!assignment.allowedTypes.includes(ext)) return setError(`Only ${assignment.allowedTypes.join(', ').toUpperCase()} files are accepted.`);
    if (file.size > maxBytes) return setError(`File must be ${assignment.maxSize} ${assignment.maxSizeUnit} or smaller.`);
    setBusy(true);
    setUploadProgress(0);
    setError('');
    try {
      const uploaded = await uploadToCloudinary(file, ({ loaded, total }) => {
        if (total > 0) setUploadProgress(Math.min(100, Math.round((loaded / total) * 100)));
      });
      await API.post(`/assignments/${id}/submit`, { file: { ...uploaded, size: file.size } });
      invalidateAssignments();
      await load();
      setFile(null);
      setUploadProgress(0);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not submit file.');
    } finally {
      setBusy(false);
    }
  };

  const grade = async (studentId) => {
    try {
      await API.patch(`/assignments/${id}/grade/${studentId}`, { marks: Number(gradeDrafts[studentId]) });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not save marks.');
    }
  };

  const extend = async (event) => {
    event.preventDefault();
    try {
      await API.patch(`/assignments/${id}/extend`, { dueAt: new Date(extension).toISOString() });
      invalidateAssignments();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not extend deadline.');
    }
  };

  const removeAssignment = async () => {
    if (!window.confirm('Delete this assignment? Submissions and instruction files will be deleted too.')) return;
    try {
      await API.delete(`/assignments/${id}`);
      invalidateAssignments();
      navigate(roomRoute, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete assignment.');
    }
  };

  if (loading) {
    return (
      <div className="lm-canvas flex min-h-[60vh] items-center justify-center">
        <div className="lm-card w-full max-w-md p-8 text-center">
          <div className="lm-bar mx-auto" />
          <p className="lm-eyebrow mt-4">Loading assignment...</p>
        </div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="lm-canvas flex min-h-[60vh] items-center justify-center">
        <div className="lm-card w-full max-w-md border-rose-500/30 p-8 text-center text-rose-200">{error || 'Assignment not found.'}</div>
      </div>
    );
  }

  return (
    <div className="lm-canvas space-y-5 overflow-x-hidden">
      <section className="lm-card min-w-0 overflow-hidden">
        <div className="h-px bg-gradient-to-r from-transparent via-amber-300/55 to-transparent" />
        <div className="p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <span className="inline-grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
                <ClipboardDocumentListIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="lm-eyebrow">{assignment.roomName}</p>
                  <span className="lm-badge border-white/10 bg-white/[0.04] text-slate-300">{humanizeKey(assignment.categoryKey)}</span>
                  {pastDue && <span className="lm-badge border-rose-400/30 bg-rose-400/10 text-rose-200">Closed</span>}
                </div>
                <h1 className="mt-2 max-w-4xl break-words text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">{assignment.title}</h1>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono">{assignment.totalMarks} marks</span>
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono uppercase">{assignment.allowedTypes.join(', ')}</span>
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono">max {assignment.maxSize} {assignment.maxSizeUnit}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              <button type="button" onClick={() => navigate(roomRoute)} className="lm-btn-ghost">
                <ArrowLeftIcon className="h-4 w-4" />
                Back
              </button>
              {canManage && (
                <>
                  <button type="button" onClick={() => openMarksheet(false)} className="lm-btn-ghost">
                    <TableCellsIcon className="h-4 w-4" />
                    Marksheet
                  </button>
                  <button type="button" onClick={() => openMarksheet(true)} className="lm-btn-ghost border-amber-300/30 text-amber-200">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    Ungraded ({ungradedCount})
                  </button>
                </>
              )}
            </div>
          </div>

          {error && <div className="mt-5 rounded-xl border border-rose-500/35 bg-rose-950/35 px-4 py-3 text-sm text-rose-200">{error}</div>}

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Due date" value={new Date(assignment.dueAt).toLocaleDateString()} sub={new Date(assignment.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
            <Stat label="Submissions" value={submissions.length} />
            <Stat label="Graded" value={gradedCount} tone="text-emerald-300" sub={`${ungradedCount} pending`} />
            <Stat label="Max upload" value={`${assignment.maxSize} ${assignment.maxSizeUnit}`} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="lm-card min-w-0 p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-start gap-3">
            <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300">
              <ClipboardDocumentListIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="lm-eyebrow">Instructions</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{assignment.description || 'No written instructions were added.'}</p>
              {assignment.instructionsFile?.url && (
                <a href={getAttachmentDownloadUrl(assignment.instructionsFile.url, assignment.instructionsFile.fileName)} className="lm-btn-ghost mt-4 w-full max-w-full sm:w-auto">
                  <DocumentArrowDownIcon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate" title={assignment.instructionsFile.fileName}>{assignment.instructionsFile.fileName || 'Instruction file'}</span>
                </a>
              )}
            </div>
          </div>
        </section>
        <Countdown dueAt={assignment.dueAt} />
      </div>

      {!canManage && (
        <section className="lm-card min-w-0 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300">
              <PaperClipIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="lm-eyebrow">Your Submission</p>
              <h2 className="mt-1 text-lg font-bold text-slate-100">Submit your work</h2>
            </div>
          </div>

          {mySubmission && (
            <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-3.5">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-300">Submitted</p>
                <p className="mt-0.5 break-all text-sm text-slate-100">{mySubmission.file?.fileName || 'File'}</p>
                <p className="mt-0.5 text-xs text-slate-400">{formatBytes(mySubmission.file?.size)} • {new Date(mySubmission.updatedAt || mySubmission.submittedAt).toLocaleString()}</p>
              </div>
              <a href={getAttachmentDownloadUrl(mySubmission.file?.url, mySubmission.file?.fileName)} className="lm-btn-ghost shrink-0">
                <DocumentArrowDownIcon className="h-4 w-4" />
                Download
              </a>
            </div>
          )}

          {!pastDue ? (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <label className="block rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 sm:p-5">
                <span className="mb-2 block text-sm font-medium text-slate-200">Choose a file</span>
                <input
                  type="file"
                  accept={assignment.allowedTypes.map((type) => `.${type}`).join(',')}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setUploadProgress(0);
                    setError('');
                  }}
                  className="lm-field cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-200"
                />
              </label>
              {file && (
                <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100" title={file.name}>{file.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatBytes(file.size)} • {busy ? `Uploading ${uploadProgress}%` : 'Ready to submit'}</p>
                    {busy && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${uploadProgress}%` }} /></div>}
                  </div>
                  {busy && <span className="lm-badge shrink-0 border-amber-300/30 bg-amber-300/10 font-mono text-amber-200">{uploadProgress}%</span>}
                </div>
              )}
              <button type="submit" disabled={busy || !file} className="lm-btn w-full sm:w-auto">
                {busy ? 'Submitting...' : mySubmission ? 'Replace File' : 'Submit Work'}
              </button>
            </form>
          ) : (
            <div className="mt-4 rounded-xl border border-rose-500/35 bg-rose-950/25 p-4 text-sm text-rose-200">The deadline has passed. Ask your teacher to extend it.</div>
          )}
        </section>
      )}

      {canManage && (
        <>
          <section className="lm-card min-w-0 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300">
                  <UserGroupIcon className="h-4 w-4" />
                </span>
                <div>
                  <p className="lm-eyebrow">Staff Review</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-100">Submissions &amp; Grading</h2>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openMarksheet(false)} className="lm-btn-ghost">
                  <TableCellsIcon className="h-4 w-4" />
                  Marksheet
                </button>
                <button type="button" onClick={() => openMarksheet(true)} className="lm-btn-ghost border-amber-300/30 text-amber-200">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  Ungraded ({ungradedCount})
                </button>
              </div>
            </div>

            {submissions.length ? (
              <div className="lm-table-scroll mt-4 overflow-x-auto">
                <table className="lm-table w-full">
                  <thead><tr><th>Student</th><th>File</th><th>Submitted</th><th>Marks</th><th>Action</th></tr></thead>
                  <tbody>
                    {submissions.map((sub) => {
                      const studentId = String(sub.student?._id || sub.student);
                      return (
                        <tr key={studentId}>
                          <td className="font-semibold">
                            {sub.student?.name || 'Student'}
                            <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{sub.student?.rollNo || sub.student?.registrationNo || ''}</span>
                          </td>
                          <td className="min-w-0">
                            {sub.file?.url ? (
                              <a
                                className="block max-w-[12rem] truncate text-sky-300 underline"
                                title={sub.file.fileName}
                                href={getAttachmentDownloadUrl(sub.file.url, sub.file.fileName)}
                              >
                                {sub.file.fileName || 'Open'}
                              </a>
                            ) : '—'}
                            {sub.file?.size ? <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{formatBytes(sub.file.size)}</span> : null}
                          </td>
                          <td className="text-xs">{new Date(sub.updatedAt || sub.submittedAt).toLocaleString()}</td>
                          <td>
                            <input type="number" min="0" max={assignment.totalMarks} value={gradeDrafts[studentId] ?? ''} onChange={(e) => setGradeDrafts((d) => ({ ...d, [studentId]: e.target.value }))} className="lm-field !py-1.5 w-24 font-mono" />
                          </td>
                          <td><button type="button" onClick={() => grade(studentId)} className="lm-btn-ghost !py-1.5">Save</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="lm-inset mt-4 px-4 py-10 text-center">
                <PaperClipIcon className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-2 text-sm text-slate-400">No submissions yet.</p>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <form onSubmit={extend} className="lm-card space-y-3 p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="h-4 w-4 text-amber-200" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-100">Extend Deadline</h2>
              </div>
              <input type="datetime-local" value={extension} onChange={(e) => setExtension(e.target.value)} className="lm-field font-mono" />
              <button type="submit" className="lm-btn w-full">Extend &amp; Notify Students</button>
            </form>

            <section className="lm-card space-y-3 p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <TrashIcon className="h-4 w-4 text-rose-200" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-100">Danger Zone</h2>
              </div>
              <p className="text-sm text-slate-400">Deleting removes all submissions and Cloudinary files for this assignment.</p>
              <button type="button" onClick={removeAssignment} className="lm-btn-ghost w-full border-rose-500/40 text-rose-200">Delete Assignment</button>
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default AssignmentPage;
