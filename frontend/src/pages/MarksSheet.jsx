import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';

const MarksSheet = () => {
  const { classroomId, category, itemId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classroom, setClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [existingMarks, setExistingMarks] = useState([]);
  
  // Spreadsheet input state
  const [markInputs, setMarkInputs] = useState({});
  
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

  // Saving & Deleting states
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const fetchSheetData = async () => {
    try {
      setLoading(true);
      setError('');

      // 1. Fetch bulk roster sheet
      const res = await API.get(`/marks/bulk-sheet/${classroomId}`);
      const data = res.data.data;
      setClassroom(data.classroom);
      setStudents(data.students || []);
      setExistingMarks(data.existingMarks || []);

      // 2. Resolve active title
      const activeTitle = itemTitle || (itemId && itemId !== 'new' ? decodeURIComponent(itemId) : '');
      
      // 3. Look up evaluation totalMarks if it already exists in classroom definition schemas
      if (data.classroom && data.classroom[category]) {
        const foundActivity = data.classroom[category].find(
          act => act.title?.toLowerCase() === activeTitle?.toLowerCase()
        );
        if (foundActivity && foundActivity.totalMarks) {
          setTotalMarks(foundActivity.totalMarks);
        }
      }

      if (activeTitle && activeTitle !== 'general') {
        const unassignedRes = await API.get(`/marks/unassigned/${classroomId}?category=${category}&title=${encodeURIComponent(activeTitle)}`);
        const unassignedList = unassignedRes.data?.data?.unassignedStudents || [];
        setUnassignedStudentIds(new Set(unassignedList.map(s => s._id.toString())));
      } else {
        const unassigned = (data.students || []).filter(student => {
          const studentId = student._id.toString();
          const markDoc = (data.existingMarks || []).find(m => m.student.toString() === studentId);
          if (!markDoc) return true;
          if (['mids', 'finals'].includes(category)) {
            return !markDoc[category] || (markDoc[category].obtainedMarks === undefined && !markDoc[category].isAbsent);
          } else {
            const list = markDoc[category] || [];
            return list.length === 0;
          }
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
          if (['mids', 'finals'].includes(category)) {
            if (markDoc[category]) {
              obtained = markDoc[category].isAbsent ? 'A' : (markDoc[category].obtainedMarks ?? '');
              isAbsent = !!markDoc[category].isAbsent;
              if (markDoc[category].file) fileObj = markDoc[category].file;
            }
          } else {
            const list = markDoc[category] || [];
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
        }

        initialMap[studentId] = {
          obtainedMarks: obtained,
          isAbsent,
          file: fileObj
        };
      });

      setMarkInputs(initialMap);
    } catch (err) {
      console.error('Failed to load marksheet:', err);
      setError(err.response?.data?.message || 'Failed to load grading spreadsheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (classroomId && category) {
      fetchSheetData();
    }
  }, [classroomId, category, itemId]);

  const handleInputChange = (studentId, value) => {
    const cleanVal = value;
    const isAbs = cleanVal.trim().toUpperCase() === 'A';

    setMarkInputs(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        obtainedMarks: cleanVal,
        isAbsent: isAbs
      }
    }));
  };

  const handleFileUpload = async (studentId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Uploading script to Cloudinary...');
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

      const marksData = Object.entries(markInputs)
        .filter(([_, data]) => data.obtainedMarks !== '' && data.obtainedMarks !== undefined && data.obtainedMarks !== null)
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

      await API.post('/marks/batch-submit', {
        classroomId,
        category,
        title: resolvedTitle,
        totalMarks: parsedTotalMarks,
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
      await API.delete('/marks/delete-evaluation', {
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
      csvContent += "Roll Number,Student Name,Marks Obtained,Total Marks,Status\r\n";

      students.forEach(student => {
        const studentId = student._id.toString();
        const inputData = markInputs[studentId] || { obtainedMarks: '', isAbsent: false };
        const roll = student.rollNo || 'N/A';
        const name = `"${(student.name || '').replace(/"/g, '""')}"`;
        const score = inputData.isAbsent ? 'Absent' : (inputData.obtainedMarks ?? '');
        const total = totalMarks;
        const status = inputData.isAbsent ? 'Absent' : (inputData.obtainedMarks !== '' ? 'Graded' : 'Pending');

        csvContent += `${roll},${name},${score},${total},${status}\r\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${classroom?.className || 'Class'}_${itemTitle || itemId}_Marks.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Excel/CSV sheet downloaded successfully!');
    } catch (err) {
      showToast('Failed to export spreadsheet.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-mono text-xs text-slate-400">Loading spreadsheet roster...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-4">
        <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-6 text-center max-w-sm w-full space-y-3">
          <p className="text-red-300 font-bold text-sm">Error Loading Sheet</p>
          <p className="text-xs text-slate-300">{error}</p>
          <Link to={`/classroom/${classroomId}`} className="block py-3 bg-orange-500 text-black font-extrabold text-xs uppercase rounded-xl">Back to Classroom</Link>
        </div>
      </div>
    );
  }

  const displayedStudents = students.filter(s => {
    if (!showUnassignedOnly) return true;
    return unassignedStudentIds.has(s._id.toString());
  });

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#080507] px-4 sm:px-6 lg:px-8 py-6 selection:bg-orange-400 selection:text-black">
      
      {toastMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 px-4 w-full max-w-sm">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-orange-500/50 bg-[#130910]/95 text-orange-300 shadow-2xl backdrop-blur-xl">
            <span className="text-xs font-extrabold uppercase tracking-wide text-white">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/30 rounded-3xl sm:rounded-2xl px-5 py-4 shadow-xl">
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <Link to={`/classroom/${classroomId}`} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded-xl transition-all">
            ← Back
          </Link>
          <div>
            <h1 className="text-sm sm:text-base font-black text-white uppercase">{classroom?.className}</h1>
            <p className="text-xs text-orange-400 font-mono uppercase">{category} • {itemTitle || itemId}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleExportToExcel}
            className="px-3.5 py-2 bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-200 text-xs font-extrabold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            📥 Export Excel
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
      <main className="relative z-10 w-full max-w-5xl mx-auto my-6 space-y-6 flex-grow">
        
        <div className="space-y-4">
          <div className="bg-[#130910]/90 border border-orange-500/20 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
            
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="w-full sm:w-1/3">
                <label className="block text-xs font-bold uppercase text-orange-400 mb-1">Evaluation Title</label>
                <input 
                  type="text" 
                  value={itemTitle} 
                  onChange={(e) => setItemTitle(e.target.value)} 
                  placeholder="e.g. Quiz 1" 
                  className="w-full px-4 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div className="w-full sm:w-1/4">
                <label className="block text-xs font-bold uppercase text-orange-400 mb-1">Total Marks</label>
                <input 
                  type="number" 
                  min="1" 
                  required
                  value={totalMarks} 
                  onChange={(e) => setTotalMarks(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono"
                />
              </div>
              <div className="w-full sm:w-auto flex items-center gap-2 self-end">
                {['quizzes', 'assignments', 'labMarks'].includes(category) && (
                  <button 
                    type="button"
                    onClick={handleCancelEvaluation}
                    disabled={deleting}
                    className="px-4 py-3 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    {deleting ? 'Cancelling...' : 'Cancel Evaluation ✕'}
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={handleSubmitBatch}
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 text-black font-extrabold text-xs uppercase rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  {saving ? 'Saving Sheet...' : 'Save All Marks ✓'}
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
                    <th className="py-3 px-3">Attachment Script</th>
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
                          <td className="py-3 px-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-3 px-3 font-mono text-orange-400 font-bold">{student.rollNo || 'N/A'}</td>
                          <td className="py-3 px-3 text-white font-medium">{student.name}</td>
                          <td className="py-3 px-3">
                            <input 
                              type="text" 
                              value={inputData.obtainedMarks} 
                              onChange={(e) => handleInputChange(studentId, e.target.value)} 
                              placeholder="Score or A" 
                              className={`w-28 px-3 py-2 bg-[#080507] border rounded-xl text-white font-mono text-xs focus:ring-1 focus:ring-orange-400 ${inputData.isAbsent ? 'border-red-500 text-red-300 bg-red-950/20' : 'border-slate-700'}`}
                            />
                          </td>
                          <td className="py-3 px-3">
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

            <div className="pt-4 flex items-center justify-end gap-3">
              {['quizzes', 'assignments', 'labMarks'].includes(category) && (
                <button 
                  type="button"
                  onClick={handleCancelEvaluation}
                  disabled={deleting}
                  className="px-6 py-3 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  {deleting ? 'Cancelling...' : 'Cancel Evaluation ✕'}
                </button>
              )}
              <button 
                type="button" 
                onClick={handleSubmitBatch}
                disabled={saving}
                className="px-8 py-3 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 text-black font-extrabold text-xs uppercase rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
              >
                {saving ? 'Saving Sheet...' : 'Save All Marks ✓'}
              </button>
            </div>

          </div>
        </div>

      </main>

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default MarksSheet;