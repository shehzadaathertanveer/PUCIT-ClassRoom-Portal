import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  BeakerIcon,
  ChartBarIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';

const UNGRADED_MARK = '-99';

const LabMarksSheet = () => {
  const { labroomId, category, itemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [labroom, setLabroom] = useState(null);
  const [students, setStudents] = useState([]);
  
  // Spreadsheet input state
  const [markInputs, setMarkInputs] = useState({});
  const [errorStudentIds, setErrorStudentIds] = useState(new Set());
  const inputRefs = useRef({});
  
  // Safely extract totalMarks from router state if available, otherwise default to 10 for labs
  const passedTotalMarks = location.state?.totalMarks;
  const [totalMarks, setTotalMarks] = useState(passedTotalMarks || 10);
  
  // Cleanly decode the item title from URL parameters
  const initialDecodedTitle = itemId && itemId !== 'new' ? decodeURIComponent(itemId) : '';
  const [itemTitle, setItemTitle] = useState(initialDecodedTitle);
  
  // Unassigned filter toggle (defaults to true if passed via location state from "Grade Remaining")
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(
    !!location.state?.filterUngraded || !!location.state?.filterUnassigned
  );
  const [unassignedStudentIds, setUnassignedStudentIds] = useState(new Set());

  // Saving & Deleting states
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  }, []);

  // Strict backend-matching category key helper
  const getCategoryTargetKey = useCallback((catName = '') => {
    const clean = catName.trim().toLowerCase();
    if (clean.includes('task')) return 'labTasks';
    if (clean.includes('viva')) return 'vivas';
    if (clean.includes('test')) return 'labTests';
    if (clean.includes('final project') || clean.includes('finalproject')) return 'finalProject';
    if (clean.includes('project')) return 'projects';
    if (clean.includes('quiz')) return 'quizzes';
    if (clean.includes('assign')) return 'assignments';
    if (clean.includes('present')) return 'presentations';
    if (clean === 'mids' || clean === 'midterm' || clean.includes('lab mid') || clean.includes('labmid')) return 'labMids';
    if (clean === 'finals' || clean === 'final' || clean.includes('lab final') || clean.includes('labfinal')) return 'labFinals';
    if (clean.includes('activ')) return 'labActivities';
    if (clean.includes('behavior') || clean.includes('behaviour')) return 'labBehavior';
    if (clean.includes('worksheet')) return 'labWorksheets';
    if (clean.includes('troubleshoot')) return 'troubleshooting';
    return 'labTasks';
  }, []);

  const fetchSheetData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const targetCategoryKey = getCategoryTargetKey(category);

      // 1. Fetch bulk roster sheet from endpoint
      const res = await API.get(`/labmarks/bulk-sheet/${labroomId}`);
      const data = res.data.data;
      const activeLabroom = data.labroom || data.classroom;
      setLabroom(activeLabroom);
      setStudents(data.students || []);

      // 2. Resolve active title
      const activeTitle = itemTitle || (itemId && itemId !== 'new' ? decodeURIComponent(itemId) : '');
      
      // 3. Look up evaluation totalMarks if it already exists in labroom definitions
      if (activeLabroom) {
        const activitiesList = activeLabroom[targetCategoryKey] || activeLabroom[category] || [];
        const foundActivity = activitiesList.find(
          act => act.title?.toLowerCase() === activeTitle?.toLowerCase()
        );
        if (foundActivity && foundActivity.totalMarks) {
          setTotalMarks(foundActivity.totalMarks);
        }
      }

      if (activeTitle && activeTitle !== 'general') {
        const unassignedRes = await API.get(`/labmarks/unassigned/${labroomId}?category=${targetCategoryKey}&title=${encodeURIComponent(activeTitle)}`);
        const unassignedList = unassignedRes.data?.data?.unassignedStudents || unassignedRes.data?.unassignedStudents || [];
        setUnassignedStudentIds(new Set(unassignedList.map(s => s._id.toString())));
      } else {
        const unassigned = (data.students || []).filter(student => {
          const studentId = student._id.toString();
          const markDoc = (data.existingMarks || []).find(m => m.student.toString() === studentId);
          if (!markDoc) return true;
          const list = markDoc[targetCategoryKey] || markDoc[category] || [];
          return list.length === 0;
        });
        setUnassignedStudentIds(new Set(unassigned.map(s => s._id.toString())));
      }

      // 4. Populate spreadsheet inputs
      const initialMap = {};
      const marksMap = new Map((data.existingMarks || []).map(m => [m.student.toString(), m]));

      (data.students || []).forEach(student => {
        const studentId = student._id.toString();
        const markDoc = marksMap.get(studentId);
        
        let obtained = UNGRADED_MARK;
        let isAbsent = false;
        let fileObj = { url: '', public_id: '', fileType: '', fileName: '' };

        if (markDoc) {
          const list = markDoc[targetCategoryKey] || markDoc[category] || [];
          const item = list.find(e => 
            e._id?.toString() === itemId || 
            e.title?.toLowerCase() === activeTitle?.toLowerCase()
          );
          if (item) {
            const rawStored = item.obtainedMarks;
            const hasStored = rawStored !== undefined && rawStored !== null && String(rawStored).trim() !== '';
            obtained = item.isAbsent ? 'A' : (hasStored ? rawStored : UNGRADED_MARK);
            isAbsent = !!item.isAbsent;
            if (item.file) fileObj = item.file;
            if (item.title && !itemTitle) setItemTitle(item.title);
            if (item.totalMarks && !passedTotalMarks) setTotalMarks(item.totalMarks);
          }
        }

        initialMap[studentId] = {
          obtainedMarks: obtained,
          isAbsent,
          file: fileObj
        };
      });

      setMarkInputs(initialMap);
    } catch (err) {
      console.error('Failed to load lab marksheet:', err);
      setError(err.response?.data?.message || 'Failed to load lab grading spreadsheet.');
    } finally {
      setLoading(false);
    }
  }, [labroomId, category, itemId, itemTitle, passedTotalMarks, getCategoryTargetKey]);

  useEffect(() => {
    if (labroomId && category) {
      fetchSheetData();
    }
  }, [labroomId, category, itemId, fetchSheetData]);

  const handleInputChange = (studentId, value) => {
    const isAbs = value.trim().toUpperCase() === 'A';

    setErrorStudentIds(prev => {
      if (!prev.size || !prev.has(studentId)) return prev;
      const next = new Set(prev);
      next.delete(studentId);
      return next;
    });

    setMarkInputs(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        obtainedMarks: value,
        isAbsent: isAbs
      }
    }));
  };

  // Clicking the marks field clears the ungraded sentinel so a score can be typed.
  // -99 is the canonical "ungraded" value, but older sheets stored a bare 0 for
  // ungraded work - clearing only on -99 left a 0 sitting in the box that had to
  // be deleted by hand before typing anything.
  const handleMarkFocus = (studentId) => {
    setMarkInputs(prev => {
      const current = prev[studentId] || {};
      const val = String(current.obtainedMarks ?? '').trim();
      if (val === UNGRADED_MARK || val === '0') {
        return {
          ...prev,
          [studentId]: { ...current, obtainedMarks: '', isAbsent: false }
        };
      }
      return prev;
    });
  };

  // Leaving the field empty restores -99 so ungraded stays visually distinct from a real 0.
  const handleMarkBlur = (studentId) => {
    setMarkInputs(prev => {
      const current = prev[studentId] || {};
      const val = String(current.obtainedMarks ?? '').trim();
      if (val === '' || val === UNGRADED_MARK) {
        return {
          ...prev,
          [studentId]: { ...current, obtainedMarks: UNGRADED_MARK, isAbsent: false }
        };
      }
      return prev;
    });
  };

  const handleFileUpload = async (studentId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Uploading script attachment...');
    try {
      const uploadedData = await uploadToCloudinary(file);
      setMarkInputs(prev => ({
        ...prev,
        [studentId]: {
          ...prev[studentId],
          file: uploadedData
        }
      }));
      showToast('Lab script attached successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to upload file.');
    }
  };

  const handleSubmitBatch = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const resolvedTitle = (itemTitle || (itemId !== 'new' ? itemId : '')).trim();
      if (!resolvedTitle || resolvedTitle === 'general') {
        showToast('Please provide a valid lab activity title.');
        setSaving(false);
        return;
      }

      const parsedTotalMarks = Number(totalMarks);
      if (isNaN(parsedTotalMarks) || parsedTotalMarks <= 0) {
        showToast('Please specify valid total marks greater than 0.');
        setSaving(false);
        return;
      }

      // Per-box validation: highlight any invalid marks before saving so they can be fixed.
      const invalidIds = new Set();
      Object.entries(markInputs).forEach(([studentId, data]) => {
        const rawVal = String(data.obtainedMarks ?? '').trim();
        if (rawVal === '' || rawVal === UNGRADED_MARK) return; // ungraded is allowed
        if (rawVal.toUpperCase() === 'A') return; // absent is allowed
        const num = Number(rawVal);
        if (isNaN(num) || num < 0 || num > parsedTotalMarks) {
          invalidIds.add(studentId);
        }
      });
      if (invalidIds.size > 0) {
        setErrorStudentIds(invalidIds);
        showToast(`Invalid marks in ${invalidIds.size} highlighted box(es) — fix them and save again.`);
        const firstRef = inputRefs.current[[...invalidIds][0]];
        if (firstRef) firstRef.focus();
        setSaving(false);
        return;
      }

      const marksData = Object.entries(markInputs)
        .filter(([_key, data]) => {
          const v = String(data.obtainedMarks ?? '').trim();
          return v !== '' && v !== UNGRADED_MARK;
        })
        .map(([studentId, data]) => ({
          studentId,
          obtainedMarks: data.isAbsent ? 'A' : Number(data.obtainedMarks),
          isAbsent: data.isAbsent,
          file: data.file?.url ? data.file : null
        }));

      if (marksData.length === 0) {
        showToast('No marks entered to submit.');
        setSaving(false);
        return;
      }

      const targetCategoryKey = getCategoryTargetKey(category);

      await API.post('/labmarks/batch-submit', {
        labroomId,
        category: targetCategoryKey,
        title: resolvedTitle,
        totalMarks: parsedTotalMarks,
        marksData
      });

      showToast('Lab marks submitted successfully!');
      fetchSheetData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit lab marks.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEvaluation = async () => {
    const targetTitle = itemTitle || itemId;
    if (!window.confirm(`Are you sure you want to cancel and delete "${targetTitle}" across all lab students? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      const targetCategoryKey = getCategoryTargetKey(category);
      await API.delete('/labmarks/delete-evaluation', {
        data: {
          labroomId,
          category: targetCategoryKey,
          itemTitle: targetTitle
        }
      });

      showToast('Lab evaluation cancelled and removed successfully!');
      setTimeout(() => {
        navigate(`/labrooms/${labroomId}`);
      }, 1000);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to cancel lab evaluation.');
      setDeleting(false);
    }
  };

  const handleExportToExcel = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Roll Number,Student Name,Marks Obtained,Total Marks,Status\r\n";

      students.forEach(student => {
        const studentId = student._id.toString();
        const inputData = markInputs[studentId] || { obtainedMarks: '', isAbsent: false };
        const roll = student.rollNo || 'N/A';
        const name = `"${(student.name || '').replace(/"/g, '""')}"`;
        const rawMark = String(inputData.obtainedMarks ?? '').trim();
        const isUngraded = rawMark === '' || rawMark === UNGRADED_MARK;
        const score = inputData.isAbsent ? 'Absent' : (isUngraded ? 'Ungraded' : rawMark);
        const status = inputData.isAbsent ? 'Absent' : (isUngraded ? 'Ungraded' : 'Graded');

        csvContent += `${roll},${name},${score},${totalMarks},${status}\r\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${labroom?.labName || 'Lab'}_${itemTitle || itemId}_Marks.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Excel/CSV sheet downloaded successfully!');
    } catch {
      showToast('Failed to export spreadsheet.');
    }
  };

  const displayedStudents = useMemo(() => {
    return students.filter(s => {
      if (!showUnassignedOnly) return true;
      return unassignedStudentIds.has(s._id.toString());
    });
  }, [students, showUnassignedOnly, unassignedStudentIds]);

  if (loading) {
    return (
      <div className="lm-canvas min-h-dvh overflow-x-hidden flex flex-col items-center justify-center p-6">
        <div className="lm-ambient" />
        <div className="lm-topline" />
        <div
          role="status"
          aria-live="polite"
          className="lm-card relative z-10 w-full max-w-xs px-6 py-10 flex flex-col items-center gap-5 text-center"
        >
          <div className="lm-bar" />
          <p className="lm-eyebrow">Loading lab grading spreadsheet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lm-canvas min-h-dvh overflow-x-hidden flex flex-col items-center justify-center p-4">
        <div className="lm-ambient" />
        <div className="lm-topline" />
        <div
          role="alert"
          className="bg-red-950/60 border border-red-500/40 rounded-3xl p-5 sm:p-6 text-center max-w-sm w-full min-w-0 space-y-4 shadow-lift"
        >
          <ExclamationTriangleIcon className="w-8 h-8 mx-auto text-red-300" />
          <p className="text-red-300 font-bold text-sm">Error Loading Lab Sheet</p>
          <p className="text-xs text-slate-300 break-words min-w-0">{error}</p>
          <Link to={`/labrooms/${labroomId}`} className="lm-btn w-full" aria-label="Back to Lab Room" title="Back to Lab Room">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Lab Room
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="lm-canvas relative min-h-dvh flex flex-col justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-6 overflow-x-clip text-slate-100 selection:bg-orange-300 selection:text-slate-950">

      <div className="lm-ambient" />

      {toastMessage && (
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 px-4 w-full max-w-sm" aria-live="polite" role="status">
          <div className="lm-toast flex items-center gap-3 px-4 py-3 border-white/10">
            <CheckIcon className="w-5 h-5 shrink-0 text-orange-300" />
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-100 break-words min-w-0">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-2.5">
        <div className="lm-topline" />
        <div className="lm-card w-full max-w-6xl mx-auto px-4 sm:px-5 py-4 backdrop-blur-xl min-w-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <Link to={`/labrooms/${labroomId}`} className="lm-btn-ghost shrink-0" aria-label="Back" title="Back">
                <ArrowLeftIcon className="w-4 h-4" />
                Back
              </Link>
              <div className="min-w-0">
                <h1 className="lm-title text-sm sm:text-lg font-black uppercase break-words leading-tight">{labroom?.labName || labroom?.name}</h1>
                <p className="lm-eyebrow font-mono text-blue-300 break-words mt-1 flex items-center gap-1.5">
                  <BeakerIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="min-w-0">Lab Component • {category} • {itemTitle || itemId}</span>
                </p>
              </div>
            </div>

            <div className="lm-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 w-full sm:w-auto shrink-0">
              <div className="flex items-center gap-2 min-w-max pt-2 sm:pt-0 border-t sm:border-0 border-white/[0.06]">
                <button
                  type="button"
                  onClick={handleExportToExcel}
                  className="lm-btn-ghost shrink-0 text-cyan-300 hover:text-cyan-200"
                >
                  <ChartBarIcon className="w-4 h-4" />
                  Export Excel
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnassignedOnly(!showUnassignedOnly)}
                  className={`lm-chip shrink-0 ${showUnassignedOnly ? 'lm-chip-active' : ''}`}
                >
                  {showUnassignedOnly ? 'Showing Unassigned Only' : `Filter Unassigned (${unassignedStudentIds.size})`}
                </button>
              </div>
            </div>
          </div>
          <hr className="lm-divider -mx-4 sm:-mx-5 mt-4" />
        </div>
      </header>

      {/* Spreadsheet Main Area */}
      <main className="relative z-10 w-full max-w-6xl mx-auto my-5 sm:my-6 flex-grow min-w-0">
        <section className="lm-card p-4 sm:p-6 space-y-5 min-w-0">

            {/* Lab activity meta + top actions */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-4">
              <div className="w-full lg:w-1/3 min-w-0">
                <label className="block lm-eyebrow text-blue-300 mb-1.5">Lab Activity Title</label>
                <input
                  type="text"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="e.g. Lab Task 1"
                  className="lm-field w-full min-w-0 text-xs sm:text-sm"
                />
              </div>
              <div className="w-full lg:w-1/4 min-w-0">
                <label className="block lm-eyebrow text-blue-300 mb-1.5">Total Marks</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  className="lm-field lm-num w-full min-w-0 text-center text-xs sm:text-sm"
                />
              </div>
              <div className="w-full lg:w-auto min-w-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelEvaluation}
                  disabled={deleting}
                  className="lm-btn-ghost w-full sm:w-auto shrink-0 border-red-500/40 bg-red-950/60 text-red-200 hover:bg-red-900/70 hover:border-red-400/60 hover:text-red-100"
                >
                  <XMarkIcon className="w-4 h-4" />
                  {deleting ? 'Cancelling...' : 'Cancel Task'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitBatch}
                  disabled={saving}
                  className="lm-btn w-full sm:w-auto shrink-0 bg-emerald-600 hover:bg-emerald-500"
                >
                  <CheckIcon className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save All Marks'}
                </button>
              </div>
            </div>

            <hr className="lm-divider -mx-4 sm:-mx-6" />

            {/* Legend + validation hints */}
            <div className="lm-inset flex flex-wrap items-center gap-2 p-3 sm:p-3.5 text-[10px] font-mono text-slate-400">
              <span className="lm-badge border-dashed border-amber-500/40 text-amber-300">-99 = Ungraded</span>
              <span className="lm-badge border-red-500/40 text-red-300">A = Absent</span>
              <span className="lm-badge text-slate-500">0 = Scored zero</span>
              <span className="lm-badge border-red-500/60 text-red-300">Red glow = Fix this box</span>
            </div>

            {/* Student Roster Table */}
            <div className="lm-scroll-x rounded-2xl border border-white/[0.06] shadow-chrome">
                <table className="lm-table keep-col">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Roll Number</th>
                    <th>Student Name</th>
                    <th>Marks (or 'A') / Out of {totalMarks}</th>
                    <th>Lab Script Attachment</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-0">
                        <div className="m-2.5 sm:m-3 rounded-2xl border border-dashed border-white/[0.09] bg-slate-950/50 flex flex-col items-center justify-center gap-2.5 px-4 py-12 text-center">
                          <UserGroupIcon className="w-7 h-7 text-slate-500" />
                          <span className="text-slate-500 text-xs sm:text-sm italic">No students found matching filter.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map((student, idx) => {
                      const studentId = student._id.toString();
                      const inputData = markInputs[studentId] || { obtainedMarks: '', isAbsent: false, file: {} };

                      const isUngradedDisplay = String(inputData.obtainedMarks ?? '').trim() === UNGRADED_MARK;

                      return (
                        <tr key={studentId}>
                          <td className="font-mono text-slate-500">{idx + 1}</td>
                          <td className="font-mono text-blue-300 font-bold whitespace-nowrap">{student.rollNo || 'N/A'}</td>
                          <td className="text-slate-100 font-medium whitespace-nowrap">{student.name}</td>
                          <td>
                            <input
                              type="text"
                              inputMode="text"
                              value={inputData.obtainedMarks}
                              onFocus={() => handleMarkFocus(studentId)}
                              onBlur={() => handleMarkBlur(studentId)}
                              onChange={(e) => handleInputChange(studentId, e.target.value)}
                              placeholder={UNGRADED_MARK}
                              ref={(el) => { inputRefs.current[studentId] = el; }}
                              className={`lm-field lm-num w-full min-w-[4.5rem] text-center px-2 py-2 text-xs sm:text-sm ${inputData.isAbsent ? 'border-red-500/70 text-red-300 bg-red-950/40' : isUngradedDisplay ? 'border-amber-500/50 text-amber-300 bg-amber-950/20 italic' : errorStudentIds.has(studentId) ? 'border-red-500 text-red-300 bg-red-950/40 ring-2 ring-red-500/50 animate-pulse' : 'border-white/10 text-slate-100'}`}
                            />
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              {inputData.file?.url ? (
                                <a href={inputData.file.url} target="_blank" rel="noreferrer" className="lm-btn-ghost shrink-0 text-emerald-300 hover:text-emerald-200 whitespace-nowrap"><EyeIcon className="w-4 h-4" />View File</a>
                              ) : (
                                <label className="lm-btn-ghost cursor-pointer shrink-0 whitespace-nowrap">
                                  <ArrowUpTrayIcon className="w-4 h-4" />
                                  Upload
                                  <input type="file" onChange={(e) => handleFileUpload(studentId, e)} className="hidden" />
                                </label>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Sticky action bar */}
            <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <div className="lm-card-flat bg-slate-950/85 px-3 sm:px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={handleCancelEvaluation}
                  disabled={deleting}
                  className="lm-btn-ghost w-full sm:w-auto shrink-0 border-red-500/40 bg-red-950/60 text-red-200 hover:bg-red-900/70 hover:border-red-400/60 hover:text-red-100"
                >
                  <XMarkIcon className="w-4 h-4" />
                  {deleting ? 'Cancelling...' : 'Cancel Task'}
                </button>
                <button
                  type="button"
                  onClick={handleSubmitBatch}
                  disabled={saving}
                  className="lm-btn w-full sm:w-auto shrink-0 bg-emerald-600 hover:bg-emerald-500"
                >
                  <CheckIcon className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save All Marks'}
                </button>
              </div>
            </div>

        </section>
      </main>

      <footer className="relative z-10 mt-8 mb-1 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Lab Portal • All Rights Reserved</p>
      </footer>

    </div>
  );
};

export default LabMarksSheet;