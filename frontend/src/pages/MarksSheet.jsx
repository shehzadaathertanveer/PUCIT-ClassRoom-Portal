import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
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

const CATEGORY_MAP = {
  quiz: 'quizzes',
  quizzes: 'quizzes',
  assignment: 'assignments',
  assignments: 'assignments',
  presentation: 'presentations',
  presentations: 'presentations',
  project: 'projects',
  projects: 'projects',
  'final project': 'finalProject',
  finalproject: 'finalProject',
  homework: 'homework',
  'class activity': 'classActivities',
  classactivity: 'classActivities',
  classactivities: 'classActivities',
  'class participation': 'classParticipation',
  classparticipation: 'classParticipation',
  viva: 'vivas',
  vivas: 'vivas',
  'special marks': 'specialMarks',
  specialmarks: 'specialMarks',
  mids: 'mids',
  midterm: 'mids',
  finals: 'finals',
  final: 'finals',
};

const getNormalizedCategory = (rawType = '') => {
  const clean = rawType.trim().toLowerCase();
  if (CATEGORY_MAP[clean]) return CATEGORY_MAP[clean];
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('present')) return 'presentations';
  if (clean.includes('final project')) return 'finalProject';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('homework')) return 'homework';
  if (clean.includes('class activ')) return 'classActivities';
  if (clean.includes('particip')) return 'classParticipation';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('special')) return 'specialMarks';
  if (clean === 'mids' || clean === 'midterm') return 'mids';
  if (clean === 'finals' || clean === 'final') return 'finals';
  return clean.endsWith('s') ? clean : clean + 's';
};

const MarksSheet = () => {
  const { classroomId, category: rawCategory, itemId } = useParams();
  const category = getNormalizedCategory(rawCategory);

  const navigate = useNavigate();
  const location = useLocation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classroom, setClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [existingMarks, setExistingMarks] = useState([]);
  
  // Spreadsheet input state
  const [markInputs, setMarkInputs] = useState({});
  const [errorStudentIds, setErrorStudentIds] = useState(new Set());
  const inputRefs = useRef({});
  
  // Safely extract totalMarks from router state if available, otherwise default to 10
  const passedTotalMarks = location.state?.totalMarks;
  const [totalMarks, setTotalMarks] = useState(passedTotalMarks || 10);
  
  // Cleanly decode the item title from URL parameters
  const initialDecodedTitle = itemId && itemId !== 'new' ? decodeURIComponent(itemId) : '';
  const [itemTitle, setItemTitle] = useState(initialDecodedTitle);
  
  // Unassigned filter toggle initialized directly from router state flag
  const initialFilterState = location.state?.filterUngraded || location.state?.filterUnassigned || false;
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(initialFilterState);
  const [unassignedStudentIds, setUnassignedStudentIds] = useState(new Set());

  // Viva gate for THIS activity. Seeded from the creation modal's router state so
  // the column appears on first paint, then reconciled with the stored activity
  // once the sheet loads - the stored definition is the real source of truth.
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

  const computeUnassignedLocally = useCallback((studs, marksList, activeTitle) => {
    const unassigned = studs.filter(student => {
      const studentId = student._id.toString();
      const markDoc = marksList.find(m => (m.student?.toString() || m.student?._id?.toString()) === studentId);
      if (!markDoc) return true;
      
      let list = [];
      if (markDoc[category] && Array.isArray(markDoc[category])) {
        list = markDoc[category];
      } else if (markDoc.customActivities && Array.isArray(markDoc.customActivities)) {
        const customCat = markDoc.customActivities.find(
          c => c.categoryName?.trim().toLowerCase() === category?.trim().toLowerCase()
        );
        list = customCat ? customCat.items || [] : [];
      }
      
      const foundMatch = list.find(e => e.title?.toLowerCase() === activeTitle?.toLowerCase());
      return !foundMatch || (foundMatch.obtainedMarks === undefined && !foundMatch.isAbsent);
    });
    setUnassignedStudentIds(new Set(unassigned.map(s => s._id.toString())));
  }, [category]);

  const fetchSheetData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const res = await API.get(`/classroommarks/bulk-sheet/${classroomId}`);
      const data = res.data.data;
      const currentClass = data.classroom || data.labroom;
      
      setClassroom(currentClass);
      setStudents(data.students || []);
      setExistingMarks(data.existingMarks || []);

      const activeTitle = itemTitle || (itemId && itemId !== 'new' ? decodeURIComponent(itemId) : '');
      
      // Look up evaluation totalMarks if it already exists in classroom definition schemas
      if (currentClass) {
        let foundActivity = null;
        if (currentClass[category] && Array.isArray(currentClass[category])) {
          foundActivity = currentClass[category].find(
            act => act.title?.toLowerCase() === activeTitle?.toLowerCase()
          );
        } else if (currentClass.customActivities && Array.isArray(currentClass.customActivities)) {
          const customCat = currentClass.customActivities.find(
            c => c.categoryName?.trim().toLowerCase() === category?.trim().toLowerCase()
          );
          if (customCat && customCat.items) {
            foundActivity = customCat.items.find(
              act => act.title?.toLowerCase() === activeTitle?.toLowerCase()
            );
          }
        }

        if (foundActivity?.totalMarks) {
          setTotalMarks(foundActivity.totalMarks);
        }
        if (foundActivity && foundActivity.hasViva !== undefined) {
          setHasViva(!!foundActivity.hasViva);
        }
      }

      if (activeTitle && activeTitle !== 'general') {
        try {
          const unassignedRes = await API.get(`/classroommarks/unassigned/${classroomId}?category=${category}&title=${encodeURIComponent(activeTitle)}`);
          const unassignedList = unassignedRes.data?.data?.unassignedStudents || unassignedRes.data?.unassignedStudents || [];
          setUnassignedStudentIds(new Set(unassignedList.map(s => s._id.toString())));
        } catch (err) {
          console.warn('Could not fetch specific unassigned endpoint, falling back to local computation:', err);
          computeUnassignedLocally(data.students || [], data.existingMarks || [], activeTitle);
        }
      } else {
        computeUnassignedLocally(data.students || [], data.existingMarks || [], activeTitle);
      }

      // Populate spreadsheet inputs
      const initialMap = {};
      const vivaMap = {};
      const marksMap = new Map((data.existingMarks || []).map(m => [m.student?.toString() || m.student?._id?.toString(), m]));

      (data.students || []).forEach(student => {
        const studentId = student._id.toString();
        const markDoc = marksMap.get(studentId);
        
        let obtained = UNGRADED_MARK;
        let isAbsent = false;
        let isBypassed = false;
        let vivaMarks = '';
        let fileObj = { url: '', public_id: '', fileType: '', fileName: '' };

        if (markDoc) {
          let list = [];
          if (markDoc[category] && Array.isArray(markDoc[category])) {
            list = markDoc[category];
          } else if (markDoc.customActivities && Array.isArray(markDoc.customActivities)) {
            const customCat = markDoc.customActivities.find(
              c => c.categoryName?.trim().toLowerCase() === category?.trim().toLowerCase()
            );
            list = customCat ? customCat.items || [] : [];
          }

          const item = list.find(e => 
            e._id?.toString() === itemId || 
            e.title?.toLowerCase() === activeTitle?.toLowerCase()
          );
          if (item) {
            const rawStored = item.obtainedMarks;
            const hasStored = rawStored !== undefined && rawStored !== null && String(rawStored).trim() !== '';
            isBypassed = !!item.isBypassed;
            obtained = isBypassed ? BYPASS_MARK : (item.isAbsent ? 'A' : (hasStored ? rawStored : UNGRADED_MARK));
            isAbsent = !!item.isAbsent;
            // Blank (rather than 0) when null/undefined, so a viva-gated row that
            // has never been viva-scored is visibly outstanding instead of
            // looking like the teacher deliberately scored zero.
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
      console.error('Failed to load marksheet:', err);
      setError(err.response?.data?.message || 'Failed to load grading spreadsheet.');
    } finally {
      setLoading(false);
    }
  }, [classroomId, category, itemId, itemTitle, passedTotalMarks, computeUnassignedLocally]);

  useEffect(() => {
    if (classroomId && category) {
      fetchSheetData();
    }
  }, [classroomId, category, itemId, fetchSheetData]);

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

  // Clicking the marks field clears the -99 ungraded placeholder so a score can be typed.
  // 'B' is cleared too, so clicking a bypassed box lets you type a real score over it.
  const handleMarkFocus = (studentId) => {
    setMarkInputs(prev => {
      const current = prev[studentId] || {};
      const val = String(current.obtainedMarks ?? '').trim();
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

  // Disabling the viva from this sheet (the edit/input stage) takes TWO confirms,
  // so a stray click can never silently change how every student's marks are
  // counted. Creating the activity keeps a single click - nothing exists yet.
  // The entered viva scores are never cleared, only hidden, so flipping the
  // switch back on restores the previous values.
  const handleVivaToggle = () => {
    if (hasViva) {
      const first = window.confirm(
        'Turn OFF the Viva Multiplier for this evaluation? Final marks will be counted exactly as entered, with no × viva ÷ 10 applied.'
      );
      if (!first) return;
      const second = window.confirm(
        'Second confirmation: are you sure you want to disable the Viva Multiplier? Once you save, every student\'s final marks will drop back to their raw marks. Already-entered viva scores are kept and will reappear if you switch it back on.'
      );
      if (!second) return;
    }
    setHasViva(prev => !prev);
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
      showToast('Script attached successfully!');
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
        showToast('Please provide a valid evaluation title (e.g. Quiz 1).');
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
      // A row counts as "graded" when it has a real score and is neither absent nor
      // bypassed - only those rows need a viva when the activity is viva gated.
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

      // A graded row with the viva gate on but no viva entered would silently fall
      // back to the raw marks server-side, so the teacher would never find out.
      // Catch it here instead, where it can still be fixed.
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
            // 'B' is sent as the literal sentinel - the server decides whether
            // the bypass is allowed and rejects it if the limit is already met.
            obtainedMarks: isAbs ? 0 : (isByp ? BYPASS_MARK : Number(rawVal)),
            isAbsent: isAbs,
            // Viva scores travel even while the multiplier is OFF, so the server
            // keeps them stored: switching the gate off hides the column but must
            // never erase the scores - flipping it back on restores them.
            // Absent/bypassed rows carry null: their viva is never consulted.
            vivaMarks: isAbs || isByp ? null : viva,
            file: data.file?.url ? data.file : null
          };
        });

      if (marksData.length === 0) {
        showToast('No marks entered to submit.');
        setSaving(false);
        return;
      }

      await API.post('/classroommarks/batch-submit', {
        classroomId,
        category,
        title: resolvedTitle,
        totalMarks: parsedTotalMarks,
        hasViva,
        marksData
      });

      showToast('Marks submitted successfully!');
      fetchSheetData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit marks.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEvaluation = async () => {
    const targetTitle = itemTitle || itemId;
    if (!window.confirm(`Are you sure you want to cancel and delete "${targetTitle}" across all students? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    try {
      await API.delete('/classroommarks/delete-evaluation', {
        data: {
          classroomId,
          category,
          itemTitle: targetTitle
        }
      });

      showToast('Evaluation cancelled and removed successfully!');
      setTimeout(() => {
        navigate(`/classroom/${classroomId}`);
      }, 1000);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to cancel evaluation.');
      setDeleting(false);
    }
  };

  const handleExportToExcel = () => {
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      // The viva and final columns only exist when the gate is on, so a plain
      // sheet exports exactly what it always did.
      if (hasViva) csvContent += "Viva (0-10 / A),Final Marks (after viva),";
      csvContent += "Roll Number,Student Name,Marks Obtained,Total Marks,Status\r\n";

      students.forEach(student => {
        const studentId = student._id.toString();
        const inputData = markInputs[studentId] || { obtainedMarks: '', isAbsent: false };
        const roll = student.rollNo || 'N/A';
        const name = `"${(student.name || '').replace(/"/g, '""')}"`;
        const rawMark = String(inputData.obtainedMarks ?? '').trim();
        const isUngraded = rawMark === '' || rawMark === UNGRADED_MARK;
        const isBypassed = !isUngraded && (inputData.isBypassed || rawMark.toUpperCase() === BYPASS_MARK);
        const score = inputData.isAbsent ? 'Absent' : (isBypassed ? 'Bypassed' : (isUngraded ? 'Ungraded' : rawMark));
        const status = inputData.isAbsent ? 'Absent' : (isBypassed ? 'Bypassed' : (isUngraded ? 'Ungraded' : 'Graded'));

        // Export the raw marks AND the viva-adjusted figure, so the spreadsheet
        // explains the grade instead of just restating it.
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
      link.setAttribute("download", `${classroom?.className || 'Class'}_${itemTitle || itemId}_Marks.csv`);
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
          <p className="lm-eyebrow">Loading classroom spreadsheet roster...</p>
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
          <p className="text-red-300 font-bold text-sm">Error Loading Sheet</p>
          <p className="text-xs text-slate-300 break-words min-w-0">{error}</p>
          <Link to={`/classroom/${classroomId}`} className="lm-btn w-full" aria-label="Back to Classroom" title="Back to Classroom">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Classroom
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
              <Link to={`/classroom/${classroomId}`} className="lm-btn-ghost shrink-0" aria-label="Back" title="Back">
                <ArrowLeftIcon className="w-4 h-4" />
                Back
              </Link>
              <div className="min-w-0">
                <h1 className="lm-title text-sm sm:text-lg font-black uppercase break-words leading-tight">{classroom?.className}</h1>
                <p className="lm-eyebrow font-mono text-orange-300 break-words mt-1">{category} • {itemTitle || itemId}</p>
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

            {/* Evaluation meta + top actions */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-4">
              <div className="w-full lg:w-1/3 min-w-0">
                <label className="block lm-eyebrow text-orange-300 mb-1.5">Evaluation Title</label>
                <input
                  type="text"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="e.g. Quiz 1"
                  className="lm-field w-full min-w-0 text-xs sm:text-sm"
                />
              </div>
              <div className="w-full lg:w-1/4 min-w-0">
                <label className="block lm-eyebrow text-orange-300 mb-1.5">Total Marks</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(e.target.value)}
                  className="lm-field lm-num w-full min-w-0 text-center text-xs sm:text-sm"
                />
              </div>
              {/* Toggle lives on the sheet too, so a teacher can turn the viva on
                  for an activity created before this feature existed without
                  having to delete and recreate it. */}
              <div className="w-full lg:w-1/4 min-w-0">
                <label className="block lm-eyebrow text-orange-300 mb-1.5">Viva Multiplier</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasViva}
                  onClick={handleVivaToggle}
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
                        <th>Viva (0-10 / A)</th>
                        <th>Final (after viva)</th>
                      </>
                    )}
                    <th>Attachment Script</th>
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

                      // Bypassed boxes glow brown so they are visually distinct from
                      // absent (red) and ungraded (amber) at a glance.
                      const markCellClass = isBypassDisplay
                        ? 'lm-mark-bypass border-stone-400/70 text-stone-100 bg-stone-800/60 font-semibold'
                        : inputData.isAbsent
                          ? 'border-red-500/70 text-red-300 bg-red-950/40'
                          : isUngradedDisplay
                            ? 'border-amber-500/50 text-amber-300 bg-amber-950/20 italic'
                            : errorStudentIds.has(studentId)
                              ? 'border-red-500 text-red-300 bg-red-950/40 ring-2 ring-red-500/50 animate-pulse'
                              : 'border-white/10 text-slate-100';

                      // Live preview of what this row will actually be worth, so the
                      // teacher never has to save first to discover what the viva did.
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
                          <td className="font-mono text-orange-300 font-bold whitespace-nowrap">{student.rollNo || 'N/A'}</td>
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
                                  type="text"
                                  inputMode="decimal"
                                  value={inputData.isAbsent ? '0' : (vivaInputs[studentId] ?? '')}
                                  onChange={(e) => handleVivaChange(studentId, e.target.value)}
                                  placeholder={isBypassDisplay || inputData.isAbsent || isUngradedDisplay ? '—' : `0-${VIVA_MAX} or A`}
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
        <p>© 2026 PUCIT Classroom Portal • All Rights Reserved</p>
      </footer>

    </div>
  );
};

export default MarksSheet;