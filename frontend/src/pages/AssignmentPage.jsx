import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

const Countdown = ({ dueAt }) => {
  const now = useTick();
  const ms = new Date(dueAt).getTime() - now;
  const passed = ms <= 0;
  const days = Math.max(0, Math.floor(ms / 86400000));
  const hours = Math.max(0, Math.floor((ms % 86400000) / 3600000));
  const minutes = Math.max(0, Math.floor((ms % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((ms % 60000) / 1000));
  return (
    <div className={`lm-inset p-3 ${passed ? 'border-rose-500/40 bg-rose-950/30' : 'border-emerald-500/35 bg-emerald-950/25'}`}>
      <p className="lm-eyebrow mb-1">{passed ? 'Deadline passed' : 'Time remaining'}</p>
      <p className="font-mono font-extrabold text-lg text-slate-100">
        {passed ? '00d 00h 00m 00s' : `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`}
      </p>
      <p className="text-[11px] text-slate-400 mt-1">{new Date(dueAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
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

  if (loading) return <div className="lm-canvas"><div className="lm-card p-6 text-slate-300">Loading assignment...</div></div>;
  if (!assignment) return <div className="lm-canvas"><div className="lm-card p-6 text-rose-200">{error || 'Assignment not found.'}</div></div>;

  return (
    <div className="lm-canvas space-y-5 overflow-x-hidden">
      <div className="lm-card min-w-0 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="lm-eyebrow">{assignment.roomName} • {assignment.categoryKey}</p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 break-words">{assignment.title}</h1>
            <p className="text-xs text-slate-400 mt-1">{assignment.totalMarks} marks • {assignment.allowedTypes.join(', ').toUpperCase()} • max {assignment.maxSize} {assignment.maxSizeUnit}</p>
          </div>
          <button type="button" onClick={() => navigate(roomRoute)} className="lm-btn-ghost">Back</button>
        </div>

        {error && <div className="lm-inset border-rose-500/40 bg-rose-950/40 text-rose-200 text-xs p-3">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 lm-inset min-w-0 p-4 space-y-3">
            <p className="lm-eyebrow">Instructions</p>
            <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{assignment.description || 'No written instructions were added.'}</p>
            {assignment.instructionsFile?.url && (
              <a href={getAttachmentDownloadUrl(assignment.instructionsFile.url, assignment.instructionsFile.fileName)} className="lm-btn-ghost inline-flex max-w-full">
                Open instruction file (<span className="min-w-0 break-all">{assignment.instructionsFile.fileName || 'file'}</span>)
              </a>
            )}
          </div>
          <Countdown dueAt={assignment.dueAt} />
        </div>
      </div>

      {!canManage && (
        <div className="lm-card min-w-0 p-4 sm:p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-100 uppercase">Your Submission</h2>
          {mySubmission && (
            <div className="lm-inset p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-300">Submitted</p>
                <p className="text-xs text-slate-300 break-all">{mySubmission.file?.fileName || 'File'}</p>
                <p className="text-[10px] text-slate-500">{formatBytes(mySubmission.file?.size)} • {new Date(mySubmission.updatedAt || mySubmission.submittedAt).toLocaleString()}</p>
              </div>
              <a href={getAttachmentDownloadUrl(mySubmission.file?.url, mySubmission.file?.fileName)} className="lm-btn-ghost">Download File</a>
            </div>
          )}
          {!pastDue ? (
            <form onSubmit={submit} className="space-y-3">
              <input
                type="file"
                accept={assignment.allowedTypes.map((t) => `.${t}`).join(',')}
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setUploadProgress(0);
                  setError('');
                }}
                className="lm-field cursor-pointer"
              />
              {file && (
                <div className="lm-inset flex min-w-0 items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100" title={file.name}>{file.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {formatBytes(file.size)} • {busy ? `Uploading ${uploadProgress}%` : 'Ready to submit'}
                    </p>
                    {busy && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-amber-300 transition-all" style={{ width: `${uploadProgress}%` }} /></div>}
                  </div>
                  {busy && <span className="lm-badge shrink-0 border-amber-300/30 bg-amber-300/10 font-mono text-amber-200">{uploadProgress}%</span>}
                </div>
              )}
              <button type="submit" disabled={busy || !file} className="lm-btn w-full sm:w-auto">{busy ? 'Submitting...' : mySubmission ? 'Replace File' : 'Submit Work'}</button>
            </form>
          ) : (
            <div className="lm-inset border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">The deadline has passed. Ask your teacher to extend it.</div>
          )}
        </div>
      )}

      {canManage && (
        <>
          <div className="lm-card p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-100 uppercase">Submissions & Grading</h2>
              <p className="text-xs text-slate-400">{assignment.submissions?.length || 0} submitted</p>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="lm-table w-full">
                <thead><tr><th>Student</th><th>File</th><th>Submitted</th><th>Marks</th><th>Action</th></tr></thead>
                <tbody>
                  {(assignment.submissions || []).map((sub) => {
                    const studentId = String(sub.student?._id || sub.student);
                    return (
                      <tr key={studentId}>
                        <td className="font-semibold">{sub.student?.name || 'Student'}<span className="block text-[10px] text-slate-500 font-mono">{sub.student?.rollNo || sub.student?.registrationNo || ''}</span></td>
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
                        </td>
                        <td className="text-xs">{new Date(sub.updatedAt || sub.submittedAt).toLocaleString()}</td>
                        <td>
                          <input type="number" min="0" max={assignment.totalMarks} value={gradeDrafts[studentId] ?? ''} onChange={(e) => setGradeDrafts((d) => ({ ...d, [studentId]: e.target.value }))} className="lm-field !py-1.5 w-24 font-mono" />
                        </td>
                        <td><button type="button" onClick={() => grade(studentId)} className="lm-btn-ghost !py-1.5">Save</button></td>
                      </tr>
                    );
                  })}
                  {!assignment.submissions?.length && <tr><td colSpan="5" className="text-center text-slate-500 py-6">No submissions yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lm-card p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <form onSubmit={extend} className="space-y-3">
              <h2 className="text-sm font-bold text-slate-100 uppercase">Extend Deadline</h2>
              <input type="datetime-local" value={extension} onChange={(e) => setExtension(e.target.value)} className="lm-field font-mono" />
              <button type="submit" className="lm-btn w-full">Extend & Notify Students</button>
            </form>
            <div className="lm-inset p-3 space-y-2">
              <h2 className="text-sm font-bold text-slate-100 uppercase">Danger Zone</h2>
              <p className="text-xs text-slate-400">Deleting removes all submissions and Cloudinary files for this assignment.</p>
              <button type="button" onClick={removeAssignment} className="lm-btn-ghost border-rose-500/40 text-rose-200 w-full">Delete Assignment</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AssignmentPage;
