import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';

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
        
        let obtained = '';
        let isAbsent = false;
        let fileObj = { url: '', public_id: '', fileType: '', fileName: '' };

        if (markDoc) {
          const list = markDoc[targetCategoryKey] || markDoc[category] || [];
          const item = list.find(e => 
            e._id?.toString() === itemId || 
            e.title?.toLowerCase() === activeTitle?.toLowerCase()
          );
          if (item) {
            obtained = item.isAbsent ? 'A' : (item.obtainedMarks ?? '');
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

    setMarkInputs(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        obtainedMarks: value,
        isAbsent: isAbs
      }
    }));
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

      const marksData = Object.entries(markInputs)
        .filter(([_key, data]) => data.obtainedMarks !== '' && data.obtainedMarks !== undefined && data.obtainedMarks !== null)
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
        const score = inputData.isAbsent ? 'Absent' : (inputData.obtainedMarks ?? '');
        const status = inputData.isAbsent ? 'Absent' : (inputData.obtainedMarks !== '' ? 'Graded' : 'Pending');

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
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-mono text-xs text-slate-400">Loading lab grading spreadsheet...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-4">
        <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-6 text-center max-w-sm w-full space-y-3 shadow-xl">
          <p className="text-red-300 font-bold text-sm">Error Loading Lab Sheet</p>
          <p className="text-xs text-slate-300">{error}</p>
          <Link to={`/labrooms/${labroomId}`} className="block py-3 bg-blue-500 text-black font-extrabold text-xs uppercase rounded-xl">Back to Lab Room</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#080507] px-3 sm:px-6 lg:px-8 py-5 selection:bg-blue-400 selection:text-black overflow-x-hidden">
      
      {toastMessage && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-4 w-full max-w-sm">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-blue-500/50 bg-[#130910]/95 text-blue-300 shadow-2xl backdrop-blur-xl">
            <span className="text-xs font-extrabold uppercase tracking-wide text-white">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#130910]/95 backdrop-blur-2xl border border-blue-500/30 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <Link to={`/labrooms/${labroomId}`} className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded-xl transition-all">
            ← Back
          </Link>
          <div>
            <h1 className="text-sm sm:text-base font-black text-white uppercase">{labroom?.labName || labroom?.name}</h1>
            <p className="text-[11px] text-blue-400 font-mono uppercase">🧪 Lab Component • {category} • {itemTitle || itemId}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-0 border-slate-800">
          <button
            type="button"
            onClick={handleExportToExcel}
            className="px-3.5 py-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-200 text-xs font-extrabold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            📊 Export Excel
          </button>
          <button
            type="button"
            onClick={() => setShowUnassignedOnly(!showUnassignedOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${showUnassignedOnly ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}
          >
            {showUnassignedOnly ? 'Showing Unassigned Only' : `Filter Unassigned (${unassignedStudentIds.size})`}
          </button>
        </div>
      </header>

      {/* Spreadsheet Main Area */}
      <main className="relative z-10 w-full max-w-6xl mx-auto my-6 space-y-6 flex-grow">
        <div className="space-y-4">
          <div className="bg-[#130910]/90 border border-blue-500/25 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5 backdrop-blur-2xl">
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="w-full sm:w-1/3">
                <label className="block text-xs font-bold uppercase text-blue-400 mb-1.5">Lab Activity Title</label>
                <input 
                  type="text" 
                  value={itemTitle} 
                  onChange={(e) => setItemTitle(e.target.value)} 
                  placeholder="e.g. Lab Task 1" 
                  className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div className="w-full sm:w-1/4">
                <label className="block text-xs font-bold uppercase text-blue-400 mb-1.5">Total Marks</label>
                <input 
                  type="number" 
                  min="1" 
                  required
                  value={totalMarks} 
                  onChange={(e) => setTotalMarks(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono"
                />
              </div>
              <div className="w-full sm:w-auto flex items-center gap-2 pt-2 sm:pt-0">
                <button 
                  type="button"
                  onClick={handleCancelEvaluation}
                  disabled={deleting}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {deleting ? 'Cancelling...' : 'Cancel Task ✕'}
                </button>
                <button 
                  type="button" 
                  onClick={handleSubmitBatch}
                  disabled={saving}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-500 hover:bg-blue-400 text-black font-extrabold text-xs uppercase rounded-xl shadow-lg transition-all cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save All Marks ✓'}
                </button>
              </div>
            </div>

            {/* Student Roster Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">Roll Number</th>
                    <th className="py-3 px-3">Student Name</th>
                    <th className="py-3 px-3">Marks (or 'A') / Out of {totalMarks}</th>
                    <th className="py-3 px-3">Lab Script Attachment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-8 text-slate-500 italic">No students found matching filter.</td>
                    </tr>
                  ) : (
                    displayedStudents.map((student, idx) => {
                      const studentId = student._id.toString();
                      const inputData = markInputs[studentId] || { obtainedMarks: '', isAbsent: false, file: {} };

                      return (
                        <tr key={studentId} className="hover:bg-slate-900/40 transition-all">
                          <td className="py-3.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-3.5 px-3 font-mono text-blue-400 font-bold">{student.rollNo || 'N/A'}</td>
                          <td className="py-3.5 px-3 text-white font-medium">{student.name}</td>
                          <td className="py-3.5 px-3">
                            <input 
                              type="text" 
                              value={inputData.obtainedMarks} 
                              onChange={(e) => handleInputChange(studentId, e.target.value)} 
                              placeholder="Score or A" 
                              className={`w-28 px-3 py-2 bg-[#080507] border rounded-xl text-white font-mono text-xs focus:ring-1 focus:ring-blue-400 ${inputData.isAbsent ? 'border-red-500 text-red-300 bg-red-950/20' : 'border-slate-700'}`}
                            />
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-2">
                              {inputData.file?.url ? (
                                <a href={inputData.file.url} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-400 underline font-mono">View File</a>
                              ) : (
                                <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase rounded-lg border border-slate-700">
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

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
              <button 
                type="button"
                onClick={handleCancelEvaluation}
                disabled={deleting}
                className="px-4 py-2.5 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Cancelling...' : 'Cancel Task ✕'}
              </button>
              <button 
                type="button" 
                onClick={handleSubmitBatch}
                disabled={saving}
                className="px-6 py-2.5 bg-blue-500 hover:bg-blue-400 text-black font-extrabold text-xs uppercase rounded-xl shadow-lg transition-all cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save All Marks ✓'}
              </button>
            </div>

          </div>
        </div>
      </main>

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Lab Portal • All Rights Reserved</p>
      </footer>

    </div>
  );
};

export default LabMarksSheet;