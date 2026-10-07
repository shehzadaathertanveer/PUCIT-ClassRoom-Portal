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
import { normalizeVivaScore, VIVA_MAX, rowFinalMarks } from '../utils/viva';

const UNGRADED_MARK = '-99';
// "B" bypasses this activity: the backend drops it from BOTH the earned and the
// possible total, so it counts for nothing rather than counting as zero.
const BYPASS_MARK = 'B';

/**
 * Decide whether a stored lab mark row represents real grading.
 *
 * `isGraded` was added to the schema after the fact, so rows written by older
 * builds have no such field. A naive `item.isGraded === true` check would make
 * every pre-existing grade look ungraded and blank out real scores, so legacy
 * rows fall back to evidence:
 *
 *   isGraded === true   -> graded (explicit)
 *   isGraded === false  -> ungraded (explicit)
 *   isGraded undefined  -> legacy row: graded if it holds any real evidence
 *
 * A legacy row sitting at 0 stays ungraded on purpose. The single-student save
 * path clamps -99 through Math.max(0, ...), so an old "ungraded" row and an old
 * "genuine zero" are indistinguishable. Counting an ungraded row as a real 0
 * would silently fail the student, whereas excluding it only omits a value -
 * so ungraded is the safer default for the ambiguous case.
 */
const isRowGraded = (item = {}) => {
  if (item.isGraded === true) return true;
  if (item.isGraded === false) return false;
  if (item.isAbsent === true || item.isBypassed === true) return true;
  return Number(item.obtainedMarks) > 0;
};

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

  // Viva gate for THIS evaluation. Seeded from the creation modal's router state
  // so the column shows on first paint, then reconciled against the stored
  // labroom activity definition, which is the real source of truth.
  const [hasViva, setHasViva] = useState(!!location.state?.hasViva);
  const [vivaInputs, setVivaInputs] = useState({});

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
        if (foundActivity && foundActivity.hasViva !== undefined) {
          setHasViva(!!foundActivity.hasViva);
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
      const vivaMap = {};
      const marksMap = new Map((data.existingMarks || []).map(m => [m.student.toString(), m]));

      (data.students || []).forEach(student => {
        const studentId = student._id.toString();
        const markDoc = marksMap.get(studentId);
        
        let obtained = UNGRADED_MARK;
        let isAbsent = false;
        let isBypassed = false;
        let vivaMarks = '';
        let fileObj = { url: '', public_id: '', fileType: '', fileName: '' };

        if (markDoc) {
          const list = markDoc[targetCategoryKey] || markDoc[category] || [];
          const item = list.find(e => 
            e._id?.toString() === itemId || 
            e.title?.toLowerCase() === activeTitle?.toLowerCase()
          );
          if (item) {
            const rawStored = item.obtainedMarks;
            // Use the explicit graded flag, with an evidence-based fallback for
            // rows written before that flag existed. Guessing from the value
            // alone (treating 0 as "ungraded") erased legitimate zero scores.
            const hasScore = isRowGraded(item);
            isBypassed = !!item.isBypassed;
            obtained = isBypassed ? BYPASS_MARK : (item.isAbsent ? 'A' : (hasScore ? rawStored : UNGRADED_MARK));
            isAbsent = !!item.isAbsent;
            // Blank (not 0) for a never-viva-scored row, so an outstanding viva is
            // visibly outstanding rather than looking like a deliberate zero.
            if (item.vivaMarks !== null && item.vivaMarks !== undefined) {
              vivaMarks = String(item.vivaMarks);
            }
            if (item.file) fileObj = item.file;
            if (item.title && !itemTitle) setItemTitle(item.title);
            if (item.totalMarks && !passedTotalMarks) setTotalMarks(item.totalMarks);
          }
        }

        initialMap[studentId] = {
          obtainedMarks: obtained,
          isAbsent,
          isBypassed,
          file: fileObj
        };
        vivaMap[studentId] = vivaMarks;
      });

      setMarkInputs(initialMap);
      setVivaInputs(vivaMap);
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
    const upper = value.trim().toUpperCase();
    const isAbs = upper === 'A';
    const isByp = upper === BYPASS_MARK;

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
        // A and B are mutually exclusive states.
        isAbsent: isAbs,
        isBypassed: isByp
      }
    }));
  };

  // Clicking the marks field clears the ungraded sentinel so a score can be typed.
  // -99 is the canonical "ungraded" value, but older sheets stored a bare 0 for
  // ungraded work - clearing only on -99 left a 0 sitting in the box that had to
  // be deleted by hand before typing anything. 'B' is cleared too so a bypassed
  // box can be overwritten with a real score.
  const handleMarkFocus = (studentId) => {
    setMarkInputs(prev => {
      const current = prev[studentId] || {};
      const val = String(current.obtainedMarks ?? '').trim();
      // '0' is deliberately NOT cleared: it is a legitimate score, and wiping
      // it on focus silently turned real zeros back into ungraded on save.
      if (val === UNGRADED_MARK || val.toUpperCase() === BYPASS_MARK) {
        return {
          ...prev,
          [studentId]: { ...current, obtainedMarks: '', isAbsent: false, isBypassed: false }
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
          [studentId]: { ...current, obtainedMarks: UNGRADED_MARK, isAbsent: false, isBypassed: false }
        };
      }
      return prev;
    });
  };

  const handleVivaChange = (studentId, value) => {
    setErrorStudentIds(prev => {
      if (!prev.size || !prev.has(studentId)) return prev;
      const next = new Set(prev);
      next.delete(studentId);
      return next;
    });
    setVivaInputs(prev => ({ ...prev, [studentId]: value }));
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
      // "Graded" means a real score that is neither absent nor bypassed - only
      // those rows need a viva once the gate is on.
      const isGradedRow = (data) => {
        const rawVal = String(data.obtainedMarks ?? '').trim();
        if (rawVal === '' || rawVal === UNGRADED_MARK) return false;
        if (rawVal.toUpperCase() === 'A') return false;
        if (rawVal.toUpperCase() === BYPASS_MARK) return false;
        return true;
      };

      const invalidIds = new Set();
      Object.entries(markInputs).forEach(([studentId, data]) => {
        const rawVal = String(data.obtainedMarks ?? '').trim();
        if (rawVal === '' || rawVal === UNGRADED_MARK) return; // ungraded is allowed
        if (rawVal.toUpperCase() === 'A') return; // absent is allowed
        if (rawVal.toUpperCase() === BYPASS_MARK) return; // bypassed is allowed
        const num = Number(rawVal);
        if (isNaN(num) || num < 0 || num > parsedTotalMarks) {
          invalidIds.add(studentId);
        }
      });

      // A graded row with the gate on but no viva entered falls back to the raw
      // marks server-side, so the teacher would never learn their viva was
      // ignored. Reject here instead, where it can still be fixed.
      if (hasViva) {
        Object.entries(markInputs).forEach(([studentId, data]) => {
          if (!isGradedRow(data)) return;
          if (normalizeVivaScore(vivaInputs[studentId]) === null) {
            invalidIds.add(studentId);
          }
        });
      }
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
        .map(([studentId, data]) => {
          const rawVal = String(data.obtainedMarks).trim();
          const upper = rawVal.toUpperCase();
          const isAbs = data.isAbsent || upper === 'A';
          const isByp = !isAbs && (data.isBypassed || upper === BYPASS_MARK);
          const viva = normalizeVivaScore(vivaInputs[studentId]);
          return {
            studentId,
            // 'B' is sent as the literal sentinel - the server decides whether the
            // bypass is allowed and rejects it when the limit is already met.
            obtainedMarks: isAbs ? 'A' : (isByp ? BYPASS_MARK : Number(rawVal)),
            isAbsent: isAbs,
            // null for absent/bypassed rows: their viva is never consulted, and
            // the lab total scales from the adjusted marks of graded rows only.
            vivaMarks: hasViva ? viva : null,
            file: data.file?.url ? data.file : null
          };
        });

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
        hasViva,
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
      // Viva columns only exist when the gate is on, so a plain sheet exports
      // exactly the same columns it always has.
      if (hasViva) csvContent += "Viva (0-10),Final Marks (after viva),";
      csvContent += "Roll Number,Student Name,Marks Obtained,Total Marks,Status\r\n";

      students.forEach(student => {
        const studentId = student._id.toString();
        const inputData = markInputs[studentId] || { obtainedMarks: UNGRADED_MARK, isAbsent: false };
        const roll = student.rollNo || 'N/A';
        const name = `"${(student.name || '').replace(/"/g, '""')}"`;
        const rawMark = String(inputData.obtainedMarks ?? '').trim();
        const isUngraded = rawMark === '' || rawMark === UNGRADED_MARK;
        const isBypassed = !isUngraded && (inputData.isBypassed || rawMark.toUpperCase() === BYPASS_MARK);
        const score = inputData.isAbsent ? 'Absent' : (isBypassed ? 'Bypassed' : (isUngraded ? 'Ungraded' : rawMark));
        const status = inputData.isAbsent ? 'Absent' : (isBypassed ? 'Bypassed' : (isUngraded ? 'Ungraded' : 'Graded'));

        // Carry the viva and the adjusted figure so the exported sheet explains
        // the grade rather than just restating it.
        const vivaValue = normalizeVivaScore(vivaInputs[studentId]);
        const finalValue = rowFinalMarks({
          obtainedMarks: rawMark,
          isAbsent: inputData.isAbsent,
          isBypassed,
          isUngraded,
          vivaEnabled: hasViva,
          vivaMarks: vivaValue
        });
        const vivaCols = hasViva
          ? `${vivaValue === null ? '' : vivaValue},${finalValue === null ? '' : finalValue},`
          : '';

        csvContent += `${vivaCols}${roll},${name},${score},${totalMarks},${status}\r\n`;
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
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-[100] px-4 w-full max-w-sm" aria-live="polite" role="status">
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
              {/* Also toggleable here so an evaluation created before this feature
                  can be viva gated without being deleted and recreated. */}
              <div className="w-full lg:w-1/4 min-w-0">
                <label className="block lm-eyebrow text-blue-300 mb-1.5">Viva Multiplier</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasViva}
                  onClick={() => setHasViva(!hasViva)}
                  className={`w-full flex items-center justify-between gap-2 lm-field cursor-pointer ${hasViva ? 'lm-chip-active' : ''}`}
                >
                  <span className="text-[10px] sm:text-xs font-bold uppercase">{hasViva ? 'On' : 'Off'}</span>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">
                    {hasViva ? '× viva ÷ 10' : 'marks as entered'}
                  </span>
                </button>
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
      <span className="lm-badge border-stone-500/50 text-stone-300">B = Bypassed (excluded from grade)</span>
              <span className="lm-badge text-slate-500">0 = Scored zero</span>
              {hasViva && (
                <span className="lm-badge border-emerald-500/40 text-emerald-300">Final = marks × viva ÷ 10, rounded up</span>
              )}
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
                    {hasViva && (
                      <>
                        <th>Viva (0-10)</th>
                        <th>Final (after viva)</th>
                      </>
                    )}
                    <th>Lab Script Attachment</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={hasViva ? 7 : 5} className="p-0">
                        <div className="m-2.5 sm:m-3 rounded-2xl border border-dashed border-white/[0.09] bg-slate-950/50 flex flex-col items-center justify-center gap-2.5 px-4 py-12 text-center">
                          <UserGroupIcon className="w-7 h-7 text-slate-500" />
                          <span className="text-slate-500 text-xs sm:text-sm italic">No students found matching filter.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map((student, idx) => {
                      const studentId = student._id.toString();
                      const inputData = markInputs[studentId] || { obtainedMarks: UNGRADED_MARK, isAbsent: false, isBypassed: false, file: {} };

                      const rawMarkValue = String(inputData.obtainedMarks ?? '').trim();
                      const isUngradedDisplay = rawMarkValue === UNGRADED_MARK;
                      const isBypassDisplay = !inputData.isAbsent && !isUngradedDisplay &&
                        (inputData.isBypassed || rawMarkValue.toUpperCase() === BYPASS_MARK);

                      // Bypassed boxes glow brown so they read as "excluded from the
                      // grade" rather than "scored zero", and stay distinct from
                      // absent (red) and ungraded (amber).
                      const markCellClass = isBypassDisplay
                        ? 'lm-mark-bypass border-stone-400/70 text-stone-100 bg-stone-800/60 font-semibold'
                        : inputData.isAbsent
                          ? 'border-red-500/70 text-red-300 bg-red-950/40'
                          : isUngradedDisplay
                            ? 'border-amber-500/50 text-amber-300 bg-amber-950/20 italic'
                            : errorStudentIds.has(studentId)
                              ? 'border-red-500 text-red-300 bg-red-950/40 ring-2 ring-red-500/50 animate-pulse'
                              : 'border-white/10 text-slate-100';

                      // Live preview of what the row is actually worth. The lab
                      // total is computed from these adjusted percentages, so showing
                      // them here means the teacher sees the consequence of a viva
                      // before saving, not after.
                      const vivaValue = normalizeVivaScore(vivaInputs[studentId]);
                      const rowHasError = errorStudentIds.has(studentId);
                      const finalValue = rowFinalMarks({
                        obtainedMarks: rawMarkValue,
                        isAbsent: inputData.isAbsent,
                        isBypassed: isBypassDisplay,
                        isUngraded: isUngradedDisplay,
                        vivaEnabled: hasViva,
                        vivaMarks: vivaValue
                      });
                      const vivaMissingButRequired =
                        hasViva && !isBypassDisplay && !inputData.isAbsent && !isUngradedDisplay && vivaValue === null;

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
                              className={`lm-field lm-num w-full min-w-[4.5rem] text-center px-2 py-2 text-xs sm:text-sm ${markCellClass}`}
                            />
                          </td>
                          {hasViva && (
                            <>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max={VIVA_MAX}
                                  step="1"
                                  value={vivaInputs[studentId] ?? ''}
                                  onChange={(e) => handleVivaChange(studentId, e.target.value)}
                                  placeholder={isBypassDisplay || inputData.isAbsent || isUngradedDisplay ? '—' : `0-${VIVA_MAX}`}
                                  disabled={isBypassDisplay || inputData.isAbsent || isUngradedDisplay}
                                  className={`lm-field lm-num w-full min-w-[3.5rem] text-center px-2 py-2 text-xs sm:text-sm ${
                                    vivaMissingButRequired || (rowHasError && vivaValue === null)
                                      ? 'border-red-500 text-red-300 bg-red-950/40 ring-2 ring-red-500/50 animate-pulse'
                                      : 'border-white/10 text-slate-100'
                                  }`}
                                />
                              </td>
                              <td className="text-center font-mono">
                                {finalValue === null ? (
                                  <span className="text-slate-600">—</span>
                                ) : (
                                  <span className="text-emerald-300 font-bold whitespace-nowrap">{finalValue}</span>
                                )}
                              </td>
                            </>
                          )}
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