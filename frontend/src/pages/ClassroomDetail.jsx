import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';

const ClassroomDetail = () => {
  const { classroomId } = useParams();
  const { user } = useAuth();
  const [classroom, setClassroom] = useState(null);
  const [studentMark, setStudentMark] = useState(null);
  const [classAnalytics, setClassAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('overview');
  
  // Leaderboard Category Filter State for Staff
  const [leaderboardFilter, setLeaderboardFilter] = useState('overall');

  // Popup / Activity detail state for Tablets / Mobile & Student file inspection
  const [selectedActivityItem, setSelectedActivityItem] = useState(null);

  // Sleek Auto-closing Notification Toast State
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const showToast = (msg, type = 'success') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage('');
    }, 2000); 
  };

  // Notice board state with optional attachment support
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeFile, setNoticeFile] = useState(null);
  const [postingNotice, setPostingNotice] = useState(false);
  const [showAllNotices, setShowAllNotices] = useState(false);

  // Anonymous Complaint states
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [sendingComplaint, setSendingComplaint] = useState(false);
  const [isViewComplaintsModalOpen, setIsViewComplaintsModalOpen] = useState(false);
  const [complaintsList, setComplaintsList] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);

  // Create student result / graded item sheet modal state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemCategory, setItemCategory] = useState('Quizzes');
  const [itemTitle, setItemTitle] = useState('');
  const [itemTotalMarks, setItemTotalMarks] = useState(10);
  const [creatingItem, setCreatingItem] = useState(false);

  // Excel / CSV Sync states for Staff
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelCategory, setExcelCategory] = useState('Quizzes');
  const [excelTitle, setExcelTitle] = useState('');
  const [excelTotalMarks, setExcelTotalMarks] = useState(10);
  const [excelFile, setExcelFile] = useState(null);
  const [syncingExcel, setSyncingExcel] = useState(false);
  const [syncReport, setSyncReport] = useState(null);

  // Add TA modal state
  const [isTaModalOpen, setIsTaModalOpen] = useState(false);
  const [taRollNo, setTaRollNo] = useState('');
  const [taLookupResult, setTaLookupResult] = useState(null);
  const [taSearching, setTaSearching] = useState(false);

  // Assign Teacher modal state (Admin only)
  const [isAssignTeacherModalOpen, setIsAssignTeacherModalOpen] = useState(false);
  const [teacherRollNo, setTeacherRollNo] = useState('');
  const [teacherLookupResult, setTeacherLookupResult] = useState(null);
  const [teacherSearching, setTeacherSearching] = useState(false);

  // Advanced Add Student Modal (4 Enrollment Pathways)
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [addModeType, setAddModeType] = useState('suffix'); // 'suffix', 'range', 'addDrop', 'autoDetect'
  
  // Pathway 1: Quick Suffix Roll Numbers
  const [suffixInput, setSuffixInput] = useState('');
  
  // Pathway 2: Range-based Auto Enrollment
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnd, setBulkEnd] = useState('');
  
  // Pathway 3: Add/Drop Seniors List with Double-Confirmation Lookup
  const [addDropInput, setAddDropInput] = useState('');
  const [lookupTargetStudent, setLookupTargetStudent] = useState(null);
  const [lookingUpStudent, setLookingUpStudent] = useState(false);

  // Pathway 4: Smart Auto-Detect Available Students (Prefix Match)
  const [availableAutoStudents, setAvailableAutoStudents] = useState([]);
  const [loadingAutoStudents, setLoadingAutoStudents] = useState(false);
  const [selectedAutoStudentIds, setSelectedAutoStudentIds] = useState([]);

  const [addingStudent, setAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState('');

  // Class Roster / Members Overview Modal
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // Class Settings & Weights modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editSectionPrefix, setEditSectionPrefix] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState(50);
  const [editPlaceholderTeacher, setEditPlaceholderTeacher] = useState('');

  // Grading Weights editing state
  const [editSessionalWeight, setEditSessionalWeight] = useState(25);
  const [editMidsWeight, setEditMidsWeight] = useState(35);
  const [editFinalsWeight, setEditFinalsWeight] = useState(40);
  const [editSessionalActivities, setEditSessionalActivities] = useState([]);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  // Delete Classroom confirmation state
  const [deleteInputName, setDeleteInputName] = useState('');
  const [deletingClass, setDeletingClass] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const navigate = useNavigate();

  const getCategoryTargetKey = (catName = '') => {
    const clean = catName.trim().toLowerCase();
    if (clean.includes('quiz')) return 'quizzes';
    if (clean.includes('assign')) return 'assignments';
    if (clean.includes('mid')) return 'mids';
    if (clean.includes('final')) return 'finals';
    return clean.endsWith('s') ? clean : clean + 's';
  };

  const fetchClassroomData = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await API.get(`/classrooms/${classroomId}`);
      const fetchedClass = res.data?.data?.classroom || res.data?.data;
      if (!fetchedClass) throw new Error('Classroom not found.');
      setClassroom(fetchedClass);

      setEditClassName(fetchedClass.className || '');
      setEditSectionPrefix(fetchedClass.sectionPrefix || '');
      setEditMaxCapacity(fetchedClass.maxCapacity || 50);
      setEditPlaceholderTeacher(fetchedClass.placeholderTeacherName || '');

      if (fetchedClass.gradingScheme) {
        setEditSessionalWeight(fetchedClass.gradingScheme.sessionalWeight || 25);
        setEditMidsWeight(fetchedClass.gradingScheme.midsWeight || 35);
        setEditFinalsWeight(fetchedClass.gradingScheme.finalsWeight || 40);
      }

      const defaultActs = [{ category: 'Quizzes', allocatedMarks: 10 }, { category: 'Assignments', allocatedMarks: 15 }];
      const activities = (fetchedClass.sessionalActivities && fetchedClass.sessionalActivities.length > 0)
        ? fetchedClass.sessionalActivities
        : defaultActs;

      setEditSessionalActivities(activities.map(a => ({ ...a })));
      if (activities.length > 0 && !itemCategory) {
        setItemCategory(activities[0].category);
      }

      try {
        const analyticsRes = await API.get(`/marks/analytics/${classroomId}`);
        if (analyticsRes?.data?.data) {
          setClassAnalytics(analyticsRes.data.data);
        }
      } catch (err) {
        console.warn('Could not fetch analytics data:', err);
      }

      if (user?._id) {
        try {
          const markRes = await API.get(`/marks/student/${classroomId}/${user._id}`);
          const fetchedMarkDoc = markRes?.data?.data?.markDoc || markRes?.data?.markDoc;
          if (fetchedMarkDoc) {
            setStudentMark(fetchedMarkDoc);
          }
        } catch (err) {
          console.warn('Could not fetch student marks:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load classroom:', err);
      setError(err.response?.data?.message || 'Failed to load classroom environment.');
    } finally {
      setLoading(false);
    }
  };

  const fetchComplaints = async () => {
    try {
      setLoadingComplaints(true);
      const res = await API.get(`/classrooms/${classroomId}/complaints`);
      setComplaintsList(res.data?.data?.complaints || res.data?.complaints || []);
    } catch (err) {
      console.warn('Failed to fetch complaints');
    } finally {
      setLoadingComplaints(false);
    }
  };

  // Fetch Pathway 4 Auto-Detect Available Students
  const fetchAvailableAutoStudents = async () => {
    try {
      setLoadingAutoStudents(true);
      const res = await API.get(`/classrooms/${classroomId}/available-students`);
      const students = res.data?.data?.students || [];
      setAvailableAutoStudents(students);
    } catch (err) {
      console.warn('Failed to fetch auto-detect students:', err);
    } finally {
      setLoadingAutoStudents(false);
    }
  };

  useEffect(() => {
    if (classroomId && user?._id) fetchClassroomData();
  }, [classroomId, user?._id]);

  useEffect(() => {
    if (isAddStudentModalOpen && addModeType === 'autoDetect') {
      fetchAvailableAutoStudents();
    }
  }, [isAddStudentModalOpen, addModeType]);

  const isClassTeacher = (classroom?.teacher?._id || classroom?.teacher)?.toString() === user?._id?.toString();
  const isAssignedTa = (classroom?.tas || []).some(
    (ta) => (ta?._id || ta)?.toString() === user?._id?.toString()
  );
  const isAdmin = user?.role === 'ADMIN';
  const isGlobalTeacher = user?.role === 'TEACHER';

  const isStaffOrAdmin = isAdmin || isGlobalTeacher || isClassTeacher || isAssignedTa;
  const isTeacherOrAdmin = isAdmin || isGlobalTeacher || isClassTeacher;

  const handleTabletClick = async (item, targetKey, category, filterUngraded = false) => {
    if (isStaffOrAdmin) {
      navigate(`/classroom/${classroomId}/sheet/${targetKey}/${encodeURIComponent(item.title)}`, {
        state: { 
          totalMarks: item.totalMarks, 
          filterUngraded: filterUngraded, 
          filterUnassigned: filterUngraded 
        }
      });
      return;
    }
    setSelectedActivityItem({ item, targetKey, category });
  };

  const handlePostNotice = async (e) => {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeContent.trim()) return;

    setPostingNotice(true);
    try {
      let attachmentData = null;
      if (noticeFile) {
        attachmentData = await uploadToCloudinary(noticeFile);
      }

      await API.post(`/classrooms/${classroomId}/notices`, {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        attachment: attachmentData
      });
      setNoticeTitle('');
      setNoticeContent('');
      setNoticeFile(null);
      fetchClassroomData();
      showToast('Notice published successfully!');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to post notice.', 'error');
    } finally {
      setPostingNotice(false);
    }
  };

  const handleSendComplaint = async (e) => {
    e.preventDefault();
    if (!complaintText.trim()) return;

    setSendingComplaint(true);
    try {
      await API.post(`/classrooms/${classroomId}/complaints`, { message: complaintText.trim() });
      showToast('Anonymous complaint submitted successfully!');
      setComplaintText('');
      setIsComplaintModalOpen(false);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send complaint.', 'error');
    } finally {
      setSendingComplaint(false);
    }
  };

  const handleCreateAndOpenSheet = async (e) => {
    e.preventDefault();
    setCreatingItem(true);
    try {
      const trimmedTitle = itemTitle.trim();
      if (!trimmedTitle) {
        showToast('Please enter an evaluation title.', 'error');
        setCreatingItem(false);
        return;
      }

      const tMarks = Number(itemTotalMarks) || 10;
      const catKey = getCategoryTargetKey(itemCategory);

      await API.post(`/classrooms/${classroomId}/items`, {
        category: catKey,
        title: trimmedTitle,
        totalMarks: tMarks
      });

      setIsItemModalOpen(false);
      setItemTitle('');
      setItemTotalMarks(10);
      showToast('Opening grading sheet...');

      navigate(`/classroom/${classroomId}/sheet/${catKey}/${encodeURIComponent(trimmedTitle)}`, {
        state: { totalMarks: tMarks }
      });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to open student result sheet.', 'error');
    } finally {
      setCreatingItem(false);
    }
  };

  const handleExcelSyncSubmit = async (e) => {
    e.preventDefault();
    if (!excelFile) {
      showToast('Please select a CSV or Excel file.', 'error');
      return;
    }
    const trimmedTitle = excelTitle.trim();
    if (!trimmedTitle) {
      showToast('Please provide an evaluation title.', 'error');
      return;
    }

    setSyncingExcel(true);
    setSyncReport(null);

    try {
      const formData = new FormData();
      formData.append('file', excelFile);
      formData.append('category', getCategoryTargetKey(excelCategory));
      formData.append('title', trimmedTitle);
      formData.append('totalMarks', excelTotalMarks);

      const res = await API.post(`/classrooms/${classroomId}/sync-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSyncReport(res.data?.data || res.data);
      showToast('Excel/CSV synced successfully!');
      fetchClassroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to parse and sync Excel file.', 'error');
    } finally {
      setSyncingExcel(false);
    }
  };

  const getPucitGrade = (percentage) => {
    const p = Number(percentage) || 0;
    if (p >= 85) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 75) return 'B+';
    if (p >= 70) return 'B';
    if (p >= 65) return 'C+';
    if (p >= 60) return 'C';
    if (p >= 50) return 'D';
    return 'F';
  };

  const handleDownloadExcelReport = () => {
    try {
      const rankings = classAnalytics?.rankings || [];
      if (rankings.length === 0) {
        showToast('No student ranking data available to export.', 'error');
        return;
      }

      const quizItems = classroom?.quizzes || [];
      const assignmentItems = classroom?.assignments || [];

      let headers = ['Roll Number', 'Student Name'];
      quizItems.forEach(q => headers.push(`${q.title} (${q.totalMarks})`));
      assignmentItems.forEach(a => headers.push(`${a.title} (${a.totalMarks})`));
      headers.push('Mids', 'Finals', 'Sessional %', 'Overall %', 'Grade');

      let csvRows = [headers.join(',')];

      const sortedRankings = [...rankings].sort((a, b) => {
        const rollA = (a.student?.rollNo || '').toString().toLowerCase();
        const rollB = (b.student?.rollNo || '').toString().toLowerCase();
        return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
      });

      sortedRankings.forEach((r) => {
        const student = r.student || {};
        const marksDoc = r.marksDoc || r;
        const row = [
          `"${student.rollNo || 'N/A'}"`,
          `"${student.name || 'Unknown'}"`
        ];

        quizItems.forEach(q => {
          const match = (marksDoc.quizzes || []).find(item => item.title?.trim().toLowerCase() === q.title?.trim().toLowerCase());
          row.push(match?.isAbsent ? 'Absent' : (match?.obtainedMarks ?? ''));
        });

        assignmentItems.forEach(a => {
          const match = (marksDoc.assignments || []).find(item => item.title?.trim().toLowerCase() === a.title?.trim().toLowerCase());
          row.push(match?.isAbsent ? 'Absent' : (match?.obtainedMarks ?? ''));
        });

        const midsMatch = marksDoc.mids || r.mids;
        row.push(midsMatch?.isAbsent ? 'Absent' : (midsMatch?.obtainedMarks ?? ''));

        const finalsMatch = marksDoc.finals || r.finals;
        row.push(finalsMatch?.isAbsent ? 'Absent' : (finalsMatch?.obtainedMarks ?? ''));

        const overallPct = Number(r.overallPercentage || 0);
        row.push(`${Number(r.sessionalPercentage || 0).toFixed(2)}%`);
        row.push(`${overallPct.toFixed(2)}%`);
        row.push(`"${getPucitGrade(overallPct)}"`);

        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${classroom.className}_Marks_Report.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Excel/CSV report downloaded successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate export report.', 'error');
    }
  };

  const handleUpdateClassSettings = async (e) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      const sW = Number(editSessionalWeight) || 0;
      const mW = Number(editMidsWeight) || 0;
      const fW = Number(editFinalsWeight) || 0;

      if (sW + mW + fW !== 100) {
        throw new Error(`Grading weights must total exactly 100% (Current: ${sW + mW + fW}%)`);
      }

      const totalSessionalAllocated = editSessionalActivities.reduce((acc, curr) => acc + (Number(curr.allocatedMarks) || 0), 0);
      if (totalSessionalAllocated > sW) {
        throw new Error(`Total sessional activities marks (${totalSessionalAllocated}) cannot exceed Sessional Weight (${sW}%)!`);
      }

      await API.patch(`/classrooms/${classroomId}/settings`, {
        className: editClassName.trim(),
        sectionPrefix: editSectionPrefix.trim().toUpperCase(),
        maxCapacity: Number(editMaxCapacity),
        placeholderTeacherName: editPlaceholderTeacher.trim(),
        gradingScheme: {
          sessionalWeight: sW,
          midsWeight: mW,
          finalsWeight: fW
        },
        sessionalActivities: editSessionalActivities.map(a => ({
          category: a.category.trim(),
          allocatedMarks: Number(a.allocatedMarks) || 0
        }))
      });
      showToast('Classroom settings & weights updated successfully!');
      setIsSettingsModalOpen(false);
      fetchClassroomData();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to update classroom settings.', 'error');
    } finally {
      setUpdatingSettings(false);
    }
  };

  // Handler for Feature 3: Lookup Student for Double-Confirmation before Add/Drop
  const handleLookupStudentForAddDrop = async (e) => {
    e.preventDefault();
    if (!addDropInput.trim()) return;

    setLookingUpStudent(true);
    setLookupTargetStudent(null);
    setAddStudentError('');

    try {
      const res = await API.post(`/classrooms/${classroomId}/lookup-student`, { rollInput: addDropInput.trim() });
      setLookupTargetStudent(res.data?.data?.student || res.data?.student);
    } catch (err) {
      setAddStudentError(err.response?.data?.message || 'Student record not found.');
    } finally {
      setLookingUpStudent(false);
    }
  };

  // Enroller handler supporting all 4 pathways
  const handleAddStudentSubmit = async (e) => {
    e.preventDefault();
    setAddingStudent(true);
    setAddStudentError('');

    try {
      if (addModeType === 'suffix') {
        // Pathway 1: Quick Suffix Roll Numbers Entry (e.g. 3, 53, 23)
        const suffixes = suffixInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        if (suffixes.length === 0) throw new Error('Please enter at least one roll number suffix.');
        await API.post(`/classrooms/${classroomId}/add-students-by-suffix`, { rollSuffixes: suffixes });
        showToast(`Successfully enrolled ${suffixes.length} students via suffix list!`);
      } else if (addModeType === 'range') {
        // Pathway 2: Range-based Auto Enrollment (1 to classLimit)
        const start = parseInt(bulkStart, 10);
        const end = parseInt(bulkEnd, 10);
        if (isNaN(start) || isNaN(end) || start > end) throw new Error('Please specify a valid numeric range.');
        await API.post(`/classrooms/add-bulk-range`, { classroomId, startRoll: start, endRoll: end });
        showToast(`Bulk range from ${start} to ${end} enrolled!`);
      } else if (addModeType === 'addDrop') {
        // Pathway 3: Add/Drop Seniors List with Double-Confirmation
        if (!lookupTargetStudent) throw new Error('Please lookup and verify the student first.');
        await API.post(`/classrooms/add-student-by-roll`, { classroomId, rollInput: lookupTargetStudent.rollNo || addDropInput.trim() });
        showToast(`Student ${lookupTargetStudent.name} enrolled successfully!`);
      } else if (addModeType === 'autoDetect') {
        // Pathway 4: Smart Prefix Auto-Detect & Bulk Approve
        if (selectedAutoStudentIds.length === 0) throw new Error('Please select at least one student to approve.');
        await API.post(`/classrooms/${classroomId}/bulk-approve-students`, { studentIds: selectedAutoStudentIds });
        showToast(`Successfully approved and added ${selectedAutoStudentIds.length} students!`);
      }

      setIsAddStudentModalOpen(false);
      setSuffixInput('');
      setBulkStart('');
      setBulkEnd('');
      setAddDropInput('');
      setLookupTargetStudent(null);
      setSelectedAutoStudentIds([]);
      fetchClassroomData();
    } catch (err) {
      setAddStudentError(err.response?.data?.message || err.message || 'Failed to process enrollment.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to remove ${studentName || 'this student'}?`)) return;
    try {
      await API.delete(`/classrooms/${classroomId}/students/${studentId}`);
      showToast('Student removed successfully!');
      fetchClassroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to remove student.', 'error');
    }
  };

  const handleStaffResetStudentPassword = async (studentUserId, studentName) => {
    const newPassword = prompt(`Enter new temporary password for ${studentName}:`);
    if (!newPassword || newPassword.trim().length < 6) {
      if (newPassword !== null) alert('Password must be at least 6 characters long.');
      return;
    }

    try {
      await API.patch('/auth/reset-student-password-staff', { userId: studentUserId, newPassword: newPassword.trim() });
      showToast(`Password successfully updated for ${studentName}!`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reset password.', 'error');
    }
  };

  const handleDeleteClassroomSubmit = async (e) => {
    e.preventDefault();
    if (deleteInputName.trim() !== classroom.className.trim()) return;

    setDeletingClass(true);
    setDeleteError('');

    try {
      await API.delete(`/classrooms/${classroomId}`);
      navigate('/');
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete classroom.');
      setDeletingClass(false);
    }
  };

  const handleLookupTa = async (e) => {
    e.preventDefault();
    setTaSearching(true);
    setTaLookupResult(null);
    try {
      const res = await API.post(`/classrooms/${classroomId}/lookup-ta`, { rollNo: taRollNo.trim().toUpperCase() });
      setTaLookupResult(res.data.data);
    } catch (err) {
      setTaLookupResult({ status: 'not_found', message: err.response?.data?.message || 'User account not found.' });
    } finally {
      setTaSearching(false);
    }
  };

  const handleConfirmAddTa = async (userId) => {
    try {
      await API.post(`/classrooms/${classroomId}/add-ta`, { userId });
      showToast('TA assigned successfully!');
      setIsTaModalOpen(false);
      setTaRollNo('');
      setTaLookupResult(null);
      fetchClassroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign TA.', 'error');
    }
  };

  const handleLookupTeacher = async (e) => {
    e.preventDefault();
    setTeacherSearching(true);
    setTeacherLookupResult(null);
    try {
      const res = await API.post(`/classrooms/${classroomId}/lookup-teacher`, { rollNo: teacherRollNo.trim() });
      setTeacherLookupResult(res.data.data);
    } catch (err) {
      setTeacherLookupResult({ status: 'not_found', message: err.response?.data?.message || 'Teacher account not found.' });
    } finally {
      setTeacherSearching(false);
    }
  };

  const handleConfirmAssignTeacher = async (teacherId) => {
    try {
      await API.patch(`/classrooms/assign-teacher`, { classroomId, teacherId });
      showToast('Teacher assigned successfully!');
      setIsAssignTeacherModalOpen(false);
      setTeacherRollNo('');
      setTeacherLookupResult(null);
      fetchClassroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign teacher.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin border-orange-500"></div>
        <p className="font-mono text-xs text-slate-400 tracking-wider">Syncing classroom portal...</p>
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-4">
        <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-6 text-center max-w-sm w-full space-y-4 shadow-xl">
          <h2 className="font-extrabold text-sm text-white">Connection Error</h2>
          <p className="text-xs text-slate-300">{error || 'Classroom does not exist.'}</p>
          <Link to="/" className="block py-3 bg-orange-500 text-black font-extrabold text-xs uppercase rounded-xl">Dashboard</Link>
        </div>
      </div>
    );
  }

  const activeStudents = (classroom.students || []).filter(s => s && (s._id || s.name));
  const totalStudentsCount = activeStudents.length;
  const reversedNotices = [...(classroom.notices || [])].reverse();
  const latestNotice = reversedNotices[0];

  const sessionalActivitiesList = (classroom.sessionalActivities && classroom.sessionalActivities.length > 0)
    ? classroom.sessionalActivities
    : [{ category: 'Quizzes', allocatedMarks: 10 }, { category: 'Assignments', allocatedMarks: 15 }];

  const getItemClassAverage = (targetKey, itemTitle) => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return '0.00';
    
    let totalObtained = 0;
    let totalPossible = 0;
    let count = 0;

    const categoryItems = classroom[targetKey] || [];
    const targetItem = categoryItems.find(i => i.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
    const maxMarks = targetItem ? Number(targetItem.totalMarks || 10) : 10;

    rankings.forEach(r => {
      const doc = r.marksDoc || r;
      const scores = doc[targetKey] || r[targetKey] || [];
      const match = scores.find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      
      if (match && !match.isAbsent && match.obtainedMarks !== undefined && match.obtainedMarks !== null && !isNaN(match.obtainedMarks)) {
        totalObtained += Number(match.obtainedMarks);
        totalPossible += Number(match.totalMarks || maxMarks);
        count++;
      }
    });

    if (count === 0 || totalPossible === 0) return '0.00';
    return ((totalObtained / totalPossible) * 100).toFixed(2);
  };

  const getItemClassAverageRaw = (targetKey, itemTitle) => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return '0.00';
    
    let totalObtained = 0;
    let count = 0;

    rankings.forEach(r => {
      const doc = r.marksDoc || r;
      const scores = doc[targetKey] || r[targetKey] || [];
      const match = scores.find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      
      if (match && !match.isAbsent && match.obtainedMarks !== undefined && match.obtainedMarks !== null && !isNaN(match.obtainedMarks)) {
        totalObtained += Number(match.obtainedMarks);
        count++;
      }
    });

    if (count === 0) return '0.00';
    return (totalObtained / count).toFixed(2);
  };

  const getItemGradedCount = (targetKey, itemTitle) => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return 0;
    let graded = 0;

    rankings.forEach(r => {
      const doc = r.marksDoc || r;
      const scores = doc[targetKey] || r[targetKey] || [];
      const match = scores.find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      
      if (match && ((match.obtainedMarks !== undefined && match.obtainedMarks !== null && !isNaN(match.obtainedMarks)) || match.isAbsent === true)) {
        graded++;
      }
    });
    
    return graded;
  };

  const getStudentRankInfo = () => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0 || !user?._id) return { rank: 'N/A', total: activeStudents.length };
    
    const sorted = [...rankings].sort((a, b) => (b.overallPercentage || 0) - (a.overallPercentage || 0));
    const index = sorted.findIndex(r => {
      const studentId = r.student?._id || r.student;
      return studentId?.toString() === user._id?.toString();
    });

    if (index === -1) return { rank: 'Pending', total: activeStudents.length };
    return { rank: `#${index + 1}`, total: rankings.length };
  };

  const calculateCategoryMarksSummary = (targetKey) => {
    if (!studentMark) return { obtained: 0, total: 0 };
    let obtained = 0;
    let total = 0;

    if (targetKey === 'mids' || targetKey === 'finals') {
      const item = studentMark[targetKey];
      if (item && !item.isAbsent) {
        obtained += Number(item.obtainedMarks || 0);
        total += Number(item.totalMarks || 0);
      }
    } else {
      const itemsList = studentMark[targetKey] || [];
      itemsList.forEach(item => {
        if (!item.isAbsent) {
          obtained += Number(item.obtainedMarks || 0);
          total += Number(item.totalMarks || 0);
        }
      });
    }
    return { obtained, total };
  };

  const getStudentAnalyticsData = () => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0 || !user?._id) {
      return {
        overall: '0.00',
        sessional: '0.00',
        quizzes: '0.00',
        assignments: '0.00',
        mids: '0.00',
        finals: '0.00'
      };
    }
    
    const found = rankings.find(r => {
      const studentId = r.student?._id || r.student;
      return studentId?.toString() === user._id?.toString();
    });

    if (!found) {
      return {
        overall: '0.00',
        sessional: '0.00',
        quizzes: '0.00',
        assignments: '0.00',
        mids: '0.00',
        finals: '0.00'
      };
    }

    return {
      overall: Number(found.overallPercentage || 0).toFixed(2),
      sessional: Number(found.sessionalPercentage || 0).toFixed(2),
      quizzes: Number(found.quizPercentage || 0).toFixed(2),
      assignments: Number(found.assignmentPercentage || 0).toFixed(2),
      mids: Number(found.midsPercentage || 0).toFixed(2),
      finals: Number(found.finalsPercentage || 0).toFixed(2)
    };
  };

  const getSortedLeaderboard = () => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return [];

    return [...rankings].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      if (leaderboardFilter === 'overall') {
        scoreA = a.overallPercentage || 0;
        scoreB = b.overallPercentage || 0;
      } else if (leaderboardFilter === 'sessionals') {
        scoreA = a.sessionalPercentage || 0;
        scoreB = b.sessionalPercentage || 0;
      } else if (leaderboardFilter === 'quizzes') {
        scoreA = a.quizPercentage || 0;
        scoreB = b.quizPercentage || 0;
      } else if (leaderboardFilter === 'assignments') {
        scoreA = a.assignmentPercentage || 0;
        scoreB = b.assignmentPercentage || 0;
      } else if (leaderboardFilter === 'mids') {
        scoreA = a.midsPercentage || 0;
        scoreB = b.midsPercentage || 0;
      } else if (leaderboardFilter === 'finals') {
        scoreA = a.finalsPercentage || 0;
        scoreB = b.finalsPercentage || 0;
      }

      return scoreB - scoreA;
    });
  };

  const getTotalPendingGradingCount = () => {
    let totalItemsCount = 0;
    let totalExpectedGrades = 0;
    let totalGradedSoFar = 0;

    sessionalActivitiesList.forEach(act => {
      const targetKey = getCategoryTargetKey(act.category);
      const items = classroom[targetKey] || [];
      totalItemsCount += items.length;
      items.forEach(item => {
        totalGradedSoFar += getItemGradedCount(targetKey, item.title);
      });
    });

    totalExpectedGrades = totalItemsCount * totalStudentsCount;
    return Math.max(0, totalExpectedGrades - totalGradedSoFar);
  };

  const studentRankInfo = getStudentRankInfo();
  const studentAnalyticsData = getStudentAnalyticsData();
  const totalPendingCount = getTotalPendingGradingCount();
  const themeColorClass = 'border-orange-500/30';
  const badgeColorClass = 'bg-orange-500/10 border-orange-500/30 text-orange-400';

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#080507] px-3 sm:px-6 lg:px-8 py-5 selection:bg-orange-400 selection:text-black">

      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-orange-500/15 rounded-full blur-[100px] pointer-events-none"></div>

      {toastMessage && (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 px-4 w-full max-w-sm">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl ${
            toastType === 'success' ? 'bg-[#130910]/95 border-emerald-500/50 text-emerald-300' : 'bg-[#130910]/95 border-red-500/50 text-red-300'
          }`}>
            <span className="text-base font-bold">{toastType === 'success' ? '✓' : '⚠️'}</span>
            <p className="text-xs font-extrabold uppercase tracking-wide text-white">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* TOP CONTROLLER BAR */}
      <header className={`relative z-10 w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#130910]/95 backdrop-blur-2xl border ${themeColorClass} rounded-2xl p-4 shadow-xl`}>
        <div className="flex items-center justify-between sm:justify-start gap-2.5">
          <div className="flex items-center gap-2">
            <Link to="/" className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded-xl transition-all">← Back</Link>
            <div>
              <h1 className="text-sm sm:text-base font-black text-white leading-tight">{classroom.className}</h1>
              <p className="text-[11px] font-mono font-semibold text-orange-400">{classroom.sectionPrefix}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase ${badgeColorClass} whitespace-nowrap`}>
            📖 Class
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0 border-t sm:border-0 border-slate-800">
          {user?.role === 'STUDENT' && !isAssignedTa && (
            <button onClick={() => setIsComplaintModalOpen(true)} className="px-3 py-2 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all">⚠️ Complaints</button>
          )}
          {isStaffOrAdmin && (
            <button onClick={() => { setIsViewComplaintsModalOpen(true); fetchComplaints(); }} className="px-3 py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-500/50 text-[10px] font-extrabold uppercase rounded-xl transition-all">📥 Feedback</button>
          )}
          <button onClick={() => setIsMembersModalOpen(true)} className="px-3 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all">👥 Roster</button>
          {isAdmin && <button onClick={() => setIsAssignTeacherModalOpen(true)} className="px-3 py-2 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all">+ Teacher</button>}
          {isTeacherOrAdmin && <button onClick={() => setIsTaModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 text-[10px] font-extrabold uppercase rounded-xl transition-all">+ TA</button>}
          {isStaffOrAdmin && (
            <>
              <button onClick={() => setIsAddStudentModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 text-[10px] font-extrabold uppercase rounded-xl transition-all">+ Student</button>
              <button onClick={handleDownloadExcelReport} className="px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all shadow-md">📥 Download Excel</button>
              <button onClick={() => setIsExcelModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 text-[10px] font-extrabold uppercase rounded-xl transition-all">📊 Upload Sync</button>
              <button onClick={() => setIsItemModalOpen(true)} className="px-3.5 py-2 bg-gradient-to-r from-orange-400 to-rose-500 text-black text-[10px] font-extrabold uppercase rounded-xl shadow-md transition-all">+ Result</button>
            </>
          )}
          {isTeacherOrAdmin && <button onClick={() => setIsSettingsModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[10px] font-extrabold uppercase rounded-xl transition-all">⚙️ Settings</button>}
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto my-6 space-y-6 flex-grow">
        
        {/* NOTICE BOARD SECTION */}
        <section className={`bg-[#130910]/90 backdrop-blur-2xl border ${themeColorClass} rounded-3xl p-5 sm:p-7 space-y-4 shadow-xl`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span>📢</span>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-wider">Notice Board</h2>
            </div>
            {classroom.notices?.length > 0 && (
              <button onClick={() => setShowAllNotices(!showAllNotices)} className="text-xs font-bold underline cursor-pointer text-orange-400">
                {showAllNotices ? 'Show Latest Only' : `View All (${classroom.notices.length})`}
              </button>
            )}
          </div>

          {isStaffOrAdmin && (
            <form onSubmit={handlePostNotice} className="bg-[#080507]/80 border border-slate-800 rounded-2xl p-4 space-y-3">
              <input type="text" placeholder="Notice Title" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} required className="w-full px-3.5 py-2.5 bg-[#130910] border border-slate-700 rounded-xl text-white text-xs" />
              <textarea placeholder="Write announcement details..." value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} required rows="2" className="w-full px-3.5 py-2.5 bg-[#130910] border border-slate-700 rounded-xl text-white text-xs resize-none" />
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <label className="cursor-pointer text-xs text-slate-300 hover:text-white transition-colors truncate">
                  📎 {noticeFile ? `Attached: ${noticeFile.name}` : 'Attach Image, PDF, or ZIP'}
                  <input type="file" onChange={(e) => setNoticeFile(e.target.files[0])} className="hidden" accept="image/*,.pdf,.zip" />
                </label>
                <button type="submit" disabled={postingNotice} className="px-4 py-2 text-black font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer bg-orange-500 hover:bg-orange-400">
                  {postingNotice ? 'Publishing...' : 'Publish Notice'}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {!latestNotice ? (
              <p className="text-slate-500 text-xs italic text-center py-4">No announcements posted yet.</p>
            ) : showAllNotices ? (
              reversedNotices.map((n, idx) => (
                <div key={idx} className="bg-[#080507]/60 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <h4 className="text-white font-bold text-xs sm:text-sm">{n.title}</h4>
                  <p className="text-slate-300 text-xs leading-relaxed">{n.content}</p>
                  {n.attachment && n.attachment.url && (
                    <div className="pt-2">
                      {n.attachment.fileType === 'image' ? (
                        <a href={n.attachment.url} target="_blank" rel="noopener noreferrer">
                          <img src={n.attachment.url} alt="Attachment" className="max-h-40 rounded-xl border border-slate-800 object-cover" />
                        </a>
                      ) : (
                        <a href={n.attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono underline text-orange-300">
                          📄 Download {n.attachment.fileName || 'Attachment'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="bg-[#080507]/60 border border-slate-800 rounded-2xl p-4 space-y-2">
                <h4 className="text-white font-bold text-sm sm:text-base">{latestNotice.title}</h4>
                <p className="text-slate-300 text-xs leading-relaxed">{latestNotice.content}</p>
                {latestNotice.attachment && latestNotice.attachment.url && (
                  <div className="pt-2">
                    {latestNotice.attachment.fileType === 'image' ? (
                      <a href={latestNotice.attachment.url} target="_blank" rel="noopener noreferrer">
                        <img src={latestNotice.attachment.url} alt="Attachment" className="max-h-40 rounded-xl border border-slate-800 object-cover" />
                      </a>
                    ) : (
                      <a href={latestNotice.attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono underline text-orange-300">
                        📄 Download {latestNotice.attachment.fileName || 'Attachment'}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* NAVIGATION TABS */}
        <div className="flex items-center bg-[#130910]/80 border border-orange-500/20 rounded-2xl p-2 gap-1 overflow-x-auto">
          <button onClick={() => setActiveTab('overview')} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${activeTab === 'overview' ? 'bg-orange-400 text-black' : 'text-slate-400'}`}>📊 Overview</button>
          
          {isStaffOrAdmin && (
            <button onClick={() => setActiveTab('leaderboard')} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'leaderboard' ? 'bg-orange-400 text-black' : 'text-slate-400 bg-slate-900/60'}`}>
              <span>🏆 Class Leaderboard</span>
            </button>
          )}

          {sessionalActivitiesList.map((act) => {
            const targetKey = getCategoryTargetKey(act.category);
            const count = (classroom[targetKey] || []).length;
            return (
              <button key={act.category} onClick={() => setActiveTab(act.category.toLowerCase())} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${activeTab === act.category.toLowerCase() ? 'bg-orange-400 text-black' : 'text-slate-400 bg-slate-900/60'}`}>
                <span>📁 {act.category}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${activeTab === act.category.toLowerCase() ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-300'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/20 rounded-3xl p-6 space-y-5 shadow-xl">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                {user?.role === 'STUDENT' && !isAssignedTa ? 'Your Academic Progress & Breakdown' : 'Class Performance Summary & Deep Metrics'}
              </h3>
              {user?.role === 'STUDENT' && !isAssignedTa ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#080507] border border-amber-500/30 p-4 rounded-2xl space-y-1 shadow-lg">
                      <p className="text-[10px] text-amber-400 uppercase font-extrabold tracking-wider">Sessional Activity %</p>
                      <p className="text-2xl sm:text-3xl font-black font-mono text-amber-300">{studentAnalyticsData.sessional}%</p>
                    </div>
                    <div className="bg-[#080507] border border-orange-500/30 p-4 rounded-2xl space-y-1 shadow-lg">
                      <p className="text-[10px] text-orange-400 uppercase font-extrabold tracking-wider">Overall Percentage</p>
                      <p className="text-2xl sm:text-3xl font-black font-mono text-orange-400">{studentAnalyticsData.overall}%</p>
                    </div>
                    <div className="bg-[#080507] border border-rose-500/30 p-4 rounded-2xl space-y-1 shadow-lg">
                      <p className="text-[10px] text-rose-400 uppercase font-extrabold tracking-wider">Class Standing</p>
                      <p className="text-2xl sm:text-3xl font-black font-mono text-rose-300">{studentRankInfo.rank} <span className="text-xs text-slate-400 font-normal">/ {studentRankInfo.total}</span></p>
                    </div>
                  </div>

                  <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                    <p className="text-xs font-bold uppercase text-slate-300">Your Breakdown Across All Categories</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="bg-[#130910] p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Quizzes</span>
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono font-black text-orange-400 text-sm">{studentAnalyticsData.quizzes}%</span>
                          <span className="text-[10px] text-slate-400 font-mono">({calculateCategoryMarksSummary('quizzes').obtained}/{calculateCategoryMarksSummary('quizzes').total})</span>
                        </div>
                      </div>
                      <div className="bg-[#130910] p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Assignments</span>
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono font-black text-amber-400 text-sm">{studentAnalyticsData.assignments}%</span>
                          <span className="text-[10px] text-slate-400 font-mono">({calculateCategoryMarksSummary('assignments').obtained}/{calculateCategoryMarksSummary('assignments').total})</span>
                        </div>
                      </div>
                      <div className="bg-[#130910] p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Mids</span>
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono font-black text-rose-400 text-sm">{studentAnalyticsData.mids}%</span>
                          <span className="text-[10px] text-slate-400 font-mono">({calculateCategoryMarksSummary('mids').obtained}/{calculateCategoryMarksSummary('mids').total})</span>
                        </div>
                      </div>
                      <div className="bg-[#130910] p-3 rounded-xl border border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 block uppercase font-bold">Finals</span>
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono font-black text-emerald-400 text-sm">{studentAnalyticsData.finals}%</span>
                          <span className="text-[10px] text-slate-400 font-mono">({calculateCategoryMarksSummary('finals').obtained}/{calculateCategoryMarksSummary('finals').total})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#080507] border border-amber-500/30 p-4 rounded-2xl space-y-1 shadow-lg">
                      <p className="text-[10px] text-amber-400 uppercase font-extrabold tracking-wider">Sessional Average %</p>
                      <p className="text-2xl sm:text-3xl font-black font-mono text-amber-300">{classAnalytics?.classAverages?.sessionalPercentage ?? '0.00'}%</p>
                    </div>
                    <div className="bg-[#080507] border border-orange-500/30 p-4 rounded-2xl space-y-1">
                      <p className="text-[10px] text-orange-400 uppercase font-bold">Evaluated Students</p>
                      <p className="text-2xl sm:text-3xl font-black text-orange-400 font-mono">{classAnalytics?.rankings?.length || 0} / {totalStudentsCount}</p>
                    </div>
                    <div className="bg-[#080507] border border-rose-500/30 p-4 rounded-2xl space-y-1">
                      <p className="text-[10px] text-rose-400 uppercase font-bold">Pending Grades</p>
                      <p className="text-2xl sm:text-3xl font-black text-rose-400 font-mono">{totalPendingCount}</p>
                    </div>
                  </div>
                  <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                    <p className="text-xs font-bold uppercase text-slate-300">Deep Category Breakdown (Class Averages)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase">Overall Avg</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">{classAnalytics?.classAverages?.overallPercentage ?? 0}%</span>
                      </div>
                      <div className="bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase">Quizzes Avg</span>
                        <span className="font-mono font-bold text-orange-400 text-sm">{classAnalytics?.classAverages?.quizPercentage ?? 0}%</span>
                      </div>
                      <div className="bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase">Assignments Avg</span>
                        <span className="font-mono font-bold text-rose-400 text-sm">{classAnalytics?.classAverages?.assignmentPercentage ?? 0}%</span>
                      </div>
                      <div className="bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block uppercase">Mids Avg</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">{classAnalytics?.classAverages?.midsPercentage ?? 0}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* COURSE PROFILE BOX */}
            <div className="relative bg-gradient-to-br from-[#130910] via-[#120a14] to-[#0d0710] backdrop-blur-2xl border border-orange-500/30 rounded-3xl p-6 shadow-2xl flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between border-b border-orange-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400 text-xs">🏛️</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Course Profile</h3>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-orange-500/15 text-orange-300 border border-orange-500/40 uppercase font-extrabold tracking-widest">
                    {classroom.sectionPrefix}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Instructor</span>
                    <strong className="text-white font-bold truncate max-w-[160px]">{classroom.teacher?.name || classroom.placeholderTeacherName || 'TBA'}</strong>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Enrollment</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-orange-400 font-black">{totalStudentsCount}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-300">{classroom.maxCapacity || 50} Max</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Grading Breakdown</span>
                    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-orange-300">
                      <span className="bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20" title="Sessionals">S: {classroom.gradingScheme?.sessionalWeight || 25}%</span>
                      <span className="bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20" title="Mids">M: {classroom.gradingScheme?.midsWeight || 35}%</span>
                      <span className="bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20" title="Finals">F: {classroom.gradingScheme?.finalsWeight || 40}%</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">TAs Assigned</span>
                    <strong className="text-rose-400 font-mono font-bold">{(classroom.tas || []).length} Active TAs</strong>
                  </div>
                </div>
              </div>

              <div className="pt-4 relative z-10">
                <button onClick={() => setIsMembersModalOpen(true)} className="w-full py-3 bg-gradient-to-r from-orange-500/20 hover:from-orange-500/30 to-rose-500/20 hover:to-rose-500/30 border border-orange-500/40 text-orange-300 hover:text-orange-200 text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer shadow-lg shadow-orange-500/10 flex items-center justify-center gap-2">
                  <span>👥 View Full Class Roster</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAFF CLASS LEADERBOARD TAB VIEW */}
        {activeTab === 'leaderboard' && isStaffOrAdmin && (
          <div className="bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/20 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider">🏆 Class Leaderboard & Standings</h3>
                <p className="text-xs text-slate-400">Rankings across all students evaluated in this class.</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'overall', label: 'Overall' },
                  { key: 'sessionals', label: 'Sessionals' },
                  { key: 'quizzes', label: 'Quizzes' },
                  { key: 'assignments', label: 'Assignments' },
                  { key: 'mids', label: 'Mids' },
                  { key: 'finals', label: 'Finals' },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setLeaderboardFilter(filter.key)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      leaderboardFilter === filter.key
                        ? 'bg-orange-400 text-black shadow-lg shadow-orange-500/20'
                        : 'bg-[#080507] text-slate-300 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400">
                    <th className="py-3 px-3">Rank</th>
                    <th className="py-3 px-3">Roll Number</th>
                    <th className="py-3 px-3">Student Name</th>
                    <th className="py-3 px-3 text-right">Score Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {getSortedLeaderboard().length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-10 text-slate-500 italic">No evaluation rankings generated yet. Start grading students to populate leaderboard.</td>
                    </tr>
                  ) : (
                    getSortedLeaderboard().map((entry, idx) => {
                      const studentObj = entry.student || {};
                      const studentName = studentObj.name || 'Unknown Student';
                      const studentRoll = studentObj.rollNo || 'N/A';

                      let currentScore = entry.overallPercentage || 0;
                      if (leaderboardFilter === 'sessionals') currentScore = entry.sessionalPercentage || 0;
                      if (leaderboardFilter === 'quizzes') currentScore = entry.quizPercentage || 0;
                      if (leaderboardFilter === 'assignments') currentScore = entry.assignmentPercentage || 0;
                      if (leaderboardFilter === 'mids') currentScore = entry.midsPercentage || 0;
                      if (leaderboardFilter === 'finals') currentScore = entry.finalsPercentage || 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-900/40 transition-all">
                          <td className="py-3.5 px-3 font-mono font-bold text-amber-400">
                            {idx === 0 ? '👑 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                          </td>
                          <td className="py-3.5 px-3 font-mono text-orange-400 font-bold">{studentRoll}</td>
                          <td className="py-3.5 px-3 text-white font-medium">{studentName}</td>
                          <td className="py-3.5 px-3 font-mono font-extrabold text-emerald-400 text-right">
                            {Number(currentScore || 0).toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SESSIONAL ACTIVITY TABS LISTING */}
        {sessionalActivitiesList.map((act) => {
          const cat = act.category;
          if (activeTab !== cat.toLowerCase()) return null;
          const targetKey = getCategoryTargetKey(cat);
          const itemsList = [...(classroom[targetKey] || [])].reverse();

          return (
            <div key={cat} className="bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/20 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">{cat} Activity Portal</h3>
                <span className="text-xs font-mono text-slate-400">Allocated Weight: <strong className="text-orange-400">{act.allocatedMarks} Marks</strong></span>
              </div>
              {itemsList.length === 0 ? (
                <p className="text-slate-500 text-xs italic text-center py-8">No {cat.toLowerCase()} created yet.</p>
              ) : (
                <div className="space-y-4">
                  {itemsList.map((item, idx) => {
                    const studentItemScore = (studentMark?.[targetKey] || []).find(e => e.title?.trim().toLowerCase() === item.title?.trim().toLowerCase());
                    const itemAvgPct = getItemClassAverage(targetKey, item.title);
                    const itemAvgRaw = getItemClassAverageRaw(targetKey, item.title);
                    const gradedCount = getItemGradedCount(targetKey, item.title);
                    const ungradedCount = Math.max(0, totalStudentsCount - gradedCount);

                    const obtained = studentItemScore?.obtainedMarks ?? 0;
                    const total = Number(item.totalMarks || 10);
                    const studentPercentage = total > 0 ? ((obtained / total) * 100).toFixed(2) : '0.00';
                    const hasPhoto = studentItemScore?.file && studentItemScore.file.url;

                    return (
                      <div 
                        key={idx} 
                        className="bg-gradient-to-br from-[#0c070e] to-[#080507] border border-slate-800 hover:border-orange-500/40 rounded-2xl p-5 space-y-4 transition-all shadow-lg flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.8)]"></span>
                              <h4 className="text-white font-black text-sm sm:text-base tracking-wide">{item.title}</h4>
                            </div>
                            <span className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 uppercase">
                              {total} Marks
                            </span>
                          </div>

                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="grid grid-cols-2 gap-3 bg-[#130910]/80 p-3.5 rounded-xl border border-slate-800/80">
                              <div className="space-y-1">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase block font-extrabold tracking-wider">Your Score</span>
                                  <span className="font-mono text-emerald-400 font-black text-sm">
                                    {studentItemScore ? (studentItemScore.isAbsent ? 'Marked Absent' : `${obtained} / ${total}`) : 'Pending'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-slate-800/60">
                                  <span className="text-[10px] text-slate-400 uppercase block font-extrabold tracking-wider">Class Avg Score</span>
                                  <span className="font-mono text-orange-400 font-bold text-xs">
                                    {itemAvgRaw} / {total}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right space-y-1">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase block font-extrabold tracking-wider">Your %</span>
                                  <span className="font-mono text-orange-400 font-black text-sm">
                                    {studentItemScore && !studentItemScore.isAbsent ? `${studentPercentage}%` : 'N/A'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-slate-800/60">
                                  <span className="text-[10px] text-slate-400 uppercase block font-extrabold tracking-wider">Class Avg %</span>
                                  <span className="font-mono text-orange-400 font-bold text-xs">
                                    {itemAvgPct}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-[#130910]/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-bold uppercase">Class Average:</span>
                                <strong className="text-orange-400 font-mono">{itemAvgPct}% ({itemAvgRaw} / {total})</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-bold uppercase">Grading Progress:</span>
                                <span className="font-mono text-emerald-400 font-bold">{gradedCount} / {totalStudentsCount} Evaluated</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="w-full flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 italic">Submission Status Active</span>
                              {hasPhoto && (
                                <button 
                                  onClick={() => setSelectedActivityItem({ item, targetKey, category: cat, scoreData: studentItemScore })}
                                  className="px-3 py-1.5 bg-orange-500/25 hover:bg-orange-500/35 text-orange-300 border border-orange-500/40 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                                >
                                  <span>📷</span> View Photo
                                </button>
                              )}
                            </div>
                          ) : (
                            isStaffOrAdmin && (
                              <div className="flex items-center gap-2 w-full">
                                {ungradedCount > 0 ? (
                                  <button 
                                    onClick={() => handleTabletClick(item, targetKey, cat, true)}
                                    className="flex-1 py-2 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-300 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer text-center"
                                  >
                                    ⚠️ Grade Remaining ({ungradedCount})
                                  </button>
                                ) : (
                                  <span className="flex-1 py-2 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded-xl text-[10px] font-mono font-bold text-center">
                                    ✓ All Graded
                                  </span>
                                )}
                                <button 
                                  onClick={() => handleTabletClick(item, targetKey, cat, false)}
                                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer border border-slate-700 text-center"
                                >
                                  Full Sheet →
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* MODALS */}

      {/* 1. Roster Modal */}
      {isMembersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-300 uppercase">Class Roster & Hierarchy</h3>
              <button onClick={() => setIsMembersModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              <div className="space-y-1.5">
                <p className="text-[10px] text-orange-400 uppercase font-extrabold tracking-wider">Instructor</p>
                <div className="bg-[#080507] border border-orange-500/30 p-3.5 rounded-2xl flex items-center justify-between text-xs">
                  <div className="truncate">
                    <p className="text-white font-bold truncate">{classroom.teacher?.name || classroom.placeholderTeacherName || 'TBA'}</p>
                    <p className="font-mono text-orange-300">{classroom.teacher?.email || 'Primary Instructor'}</p>
                  </div>
                  <span className="px-2 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg text-[9px] font-bold uppercase">Teacher</span>
                </div>
              </div>

              {(classroom.tas || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-rose-400 uppercase font-extrabold tracking-wider">Teaching Assistants (TAs)</p>
                  {(classroom.tas || []).map((ta, i) => (
                    <div key={i} className="bg-[#080507] border border-rose-500/30 p-3.5 rounded-2xl flex items-center justify-between text-xs">
                      <div className="truncate">
                        <p className="text-white font-bold truncate">{ta.name || 'TA Member'}</p>
                        <p className="font-mono text-rose-400">{ta.rollNo || ta.email || 'N/A'}</p>
                      </div>
                      <span className="px-2 py-1 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-lg text-[9px] font-bold uppercase">TA</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">Enrolled Students ({activeStudents.length})</p>
                {activeStudents.map((st, i) => (
                  <div key={i} className="bg-[#080507] border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between text-xs gap-3">
                    <div className="truncate">
                      <p className="text-white font-bold truncate">{st.name}</p>
                      <p className="font-mono text-orange-400">{st.rollNo}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isStaffOrAdmin && (
                        <>
                          <button onClick={() => handleStaffResetStudentPassword(st._id, st.name)} title="Reset Password" className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase cursor-pointer">🔑 Reset</button>
                          <button onClick={() => handleRemoveStudent(st._id, st.name)} title="Remove Student" className="px-2.5 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 rounded-lg text-[10px] font-bold uppercase cursor-pointer">✕</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setIsMembersModalOpen(false)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase cursor-pointer">Close Roster</button>
          </div>
        </div>
      )}

      {/* 2. Create Result Sheet Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-400 uppercase">Create Evaluation Item</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleCreateAndOpenSheet} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Category</label>
                <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs uppercase font-mono">
                  {sessionalActivitiesList.map(act => (
                    <option key={act.category} value={act.category}>{act.category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Item Title</label>
                <input type="text" required placeholder="e.g. Quiz 1" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Total Marks</label>
                <input type="number" required min="1" value={itemTotalMarks} onChange={(e) => setItemTotalMarks(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsItemModalOpen(false)} className="w-1/2 py-3 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={creatingItem} className="w-1/2 py-3 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                  {creatingItem ? 'Opening...' : 'Open Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Excel Upload Sync Modal */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-300 uppercase">📊 Sync Marks via Excel/CSV</h3>
              <button onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            
            {syncReport ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl space-y-2">
                  <p className="text-emerald-300 font-bold text-xs">Sync Complete Successfully!</p>
                  <p className="text-xs text-slate-300">Total Rows Processed: <strong className="font-mono text-white">{syncReport.totalProcessed || 0}</strong></p>
                  <p className="text-xs text-slate-300">Successfully Updated: <strong className="font-mono text-emerald-400">{syncReport.updatedCount || 0}</strong></p>
                  {syncReport.errors?.length > 0 && (
                    <p className="text-xs text-amber-300">Warnings/Skipped: {syncReport.errors.length}</p>
                  )}
                </div>
                <button onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer">Done</button>
              </div>
            ) : (
              <form onSubmit={handleExcelSyncSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Category</label>
                  <select value={excelCategory} onChange={(e) => setExcelCategory(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs uppercase font-mono">
                    {sessionalActivitiesList.map(act => (
                      <option key={act.category} value={act.category}>{act.category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Evaluation Title</label>
                  <input type="text" required placeholder="e.g. Quiz 1 or Assignment 2" value={excelTitle} onChange={(e) => setExcelTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Total Marks</label>
                  <input type="number" required min="1" value={excelTotalMarks} onChange={(e) => setExcelTotalMarks(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Upload CSV / Excel File</label>
                  <input type="file" required accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => setExcelFile(e.target.files[0])} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-500 file:text-black hover:file:bg-orange-400 cursor-pointer" />
                  <p className="text-[10px] text-slate-500 mt-1">File must include columns for Roll Number / Reg ID and Marks Obtained.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsExcelModalOpen(false)} className="w-1/2 py-3 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                  <button type="submit" disabled={syncingExcel} className="w-1/2 py-3 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                    {syncingExcel ? 'Syncing...' : 'Upload & Sync'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. Advanced Add Student Modal (Supports all 4 Enrollment Pathways) */}
      {isAddStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-white uppercase">Enroll Students (4 Pathways)</h3>
              <button onClick={() => { setIsAddStudentModalOpen(false); setLookupTargetStudent(null); }} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>

            {addStudentError && <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 rounded-xl text-xs">{addStudentError}</div>}
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button type="button" onClick={() => setAddModeType('suffix')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer ${addModeType === 'suffix' ? 'bg-orange-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>1. Suffix List</button>
              <button type="button" onClick={() => setAddModeType('range')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer ${addModeType === 'range' ? 'bg-orange-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>2. Range</button>
              <button type="button" onClick={() => setAddModeType('addDrop')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer ${addModeType === 'addDrop' ? 'bg-orange-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>3. Add/Drop</button>
              <button type="button" onClick={() => setAddModeType('autoDetect')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer ${addModeType === 'autoDetect' ? 'bg-orange-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>4. Smart Detect</button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-4">
              {/* Pathway 1: Quick Suffix Roll Numbers Entry */}
              {addModeType === 'suffix' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-slate-400">Roll Number Suffixes (Comma or Newline Separated)</label>
                  <textarea 
                    rows="3" 
                    required 
                    placeholder="3, 53, 23, 104" 
                    value={suffixInput} 
                    onChange={(e) => setSuffixInput(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono resize-none focus:ring-1 focus:ring-orange-400" 
                  />
                  <p className="text-[10px] text-slate-500">
                    Automatically prepends course prefix (<span className="font-mono text-orange-400">{classroom?.sectionPrefix}</span>) to short numbers.
                  </p>
                </div>
              )}

              {/* Pathway 2: Range-based Auto Enrollment */}
              {addModeType === 'range' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Start Suffix #</label>
                      <input type="number" required placeholder="1" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">End Suffix #</label>
                      <input type="number" required placeholder="50" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Range iterates from start to end with prefix <span className="font-mono text-orange-400">{classroom?.sectionPrefix}</span>.
                  </p>
                </div>
              )}

              {/* Pathway 3: Add/Drop Seniors List with Double-Confirmation */}
              {addModeType === 'addDrop' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-slate-400">Full Roll Number or Registration No</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="e.g. BSITF23M025 or 2023123" 
                        value={addDropInput} 
                        onChange={(e) => { setAddDropInput(e.target.value); setLookupTargetStudent(null); }} 
                        className="flex-1 px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono uppercase" 
                      />
                      <button 
                        type="button" 
                        onClick={handleLookupStudentForAddDrop} 
                        disabled={lookingUpStudent || !addDropInput.trim()}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/40 rounded-xl text-xs font-bold uppercase cursor-pointer disabled:opacity-50"
                      >
                        {lookingUpStudent ? 'Searching...' : 'Lookup'}
                      </button>
                    </div>
                  </div>

                  {lookupTargetStudent && (
                    <div className="bg-[#080507] border border-emerald-500/40 p-4 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 uppercase">Student Name:</span>
                        <strong className="text-white">{lookupTargetStudent.name}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 uppercase">Roll / Reg No:</span>
                        <strong className="font-mono text-orange-400">{lookupTargetStudent.rollNo}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 uppercase">Status:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${lookupTargetStudent.isAlreadyEnrolled ? 'bg-amber-950 text-amber-300' : 'bg-emerald-950 text-emerald-300'}`}>
                          {lookupTargetStudent.isAlreadyEnrolled ? 'Already Enrolled' : lookupTargetStudent.isAddDrop ? 'Add/Drop Senior' : 'Regular Prefix Match'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pathway 4: Smart Auto-Detect & Bulk Select */}
              {addModeType === 'autoDetect' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-400">Matching Prefix Students ({availableAutoStudents.length})</label>
                    <button 
                      type="button" 
                      onClick={() => setSelectedAutoStudentIds(availableAutoStudents.filter(s => !s.isAlreadyEnrolled).map(s => s._id))}
                      className="text-[10px] text-orange-400 underline font-bold cursor-pointer"
                    >
                      Select All Unenrolled
                    </button>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto space-y-2 bg-[#080507] p-2 rounded-2xl border border-slate-800">
                    {loadingAutoStudents ? (
                      <p className="text-center text-xs text-slate-500 py-4">Scanning database for matching students...</p>
                    ) : availableAutoStudents.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 py-4 italic">No matching students found for prefix {classroom?.sectionPrefix}.</p>
                    ) : (
                      availableAutoStudents.map(student => (
                        <label key={student._id} className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          student.isAlreadyEnrolled ? 'bg-slate-900/40 border-slate-800 opacity-60' : 'bg-[#130910] border-slate-800 hover:border-orange-500/40'
                        }`}>
                          <div className="flex items-center gap-2.5 truncate">
                            <input 
                              type="checkbox" 
                              disabled={student.isAlreadyEnrolled}
                              checked={selectedAutoStudentIds.includes(student._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAutoStudentIds([...selectedAutoStudentIds, student._id]);
                                } else {
                                  setSelectedAutoStudentIds(selectedAutoStudentIds.filter(id => id !== student._id));
                                }
                              }}
                              className="rounded accent-orange-500"
                            />
                            <div className="truncate">
                              <p className="text-white font-bold truncate">{student.name}</p>
                              <p className="font-mono text-[10px] text-orange-400">{student.rollNo}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${student.isAlreadyEnrolled ? 'bg-slate-800 text-slate-400' : 'bg-emerald-950 text-emerald-300'}`}>
                            {student.isAlreadyEnrolled ? 'Enrolled' : 'Available'}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsAddStudentModalOpen(false)} className="w-1/2 py-3 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                <button 
                  type="submit" 
                  disabled={addingStudent || (addModeType === 'addDrop' && !lookupTargetStudent)} 
                  className="w-1/2 py-3 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {addingStudent ? 'Processing...' : 'Confirm Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add TA Modal */}
      {isTaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-400 uppercase">Assign Teaching Assistant</h3>
              <button onClick={() => setIsTaModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleLookupTa} className="space-y-3">
              <input type="text" required placeholder="Enter student roll number" value={taRollNo} onChange={(e) => setTaRollNo(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono uppercase" />
              <button type="submit" disabled={taSearching} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-orange-300 border border-orange-500/30 font-bold uppercase text-xs rounded-xl cursor-pointer">
                {taSearching ? 'Searching...' : 'Lookup Student'}
              </button>
            </form>
            {taLookupResult && (
              <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                {taLookupResult.status === 'not_found' ? (
                  <p className="text-red-400 text-xs">{taLookupResult.message}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-white">Found: <strong className="text-orange-400">{taLookupResult.user.name}</strong> ({taLookupResult.user.rollNo})</p>
                    <button type="button" onClick={() => handleConfirmAddTa(taLookupResult.user._id)} className="w-full py-2 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer">Assign as TA</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Assign Teacher Modal */}
      {isAssignTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-300 uppercase">Assign Instructor</h3>
              <button onClick={() => setIsAssignTeacherModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleLookupTeacher} className="space-y-3">
              <input type="text" required placeholder="Enter teacher email or ID" value={teacherRollNo} onChange={(e) => setTeacherRollNo(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
              <button type="submit" disabled={teacherSearching} className="w-full py-2.5 bg-slate-800 text-orange-300 border border-orange-500/40 font-bold uppercase text-xs rounded-xl cursor-pointer">
                {teacherSearching ? 'Searching...' : 'Lookup Teacher'}
              </button>
            </form>
            {teacherLookupResult && (
              <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                {teacherLookupResult.status === 'not_found' ? (
                  <p className="text-red-400 text-xs">{teacherLookupResult.message}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-white">Found: <strong className="text-orange-400">{teacherLookupResult.user.name}</strong> ({teacherLookupResult.user.email})</p>
                    <button type="button" onClick={() => handleConfirmAssignTeacher(teacherLookupResult.user._id)} className="w-full py-2 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer">Confirm Assignment</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white uppercase">Classroom Settings & Weights</h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleUpdateClassSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Class Name</label>
                <input type="text" required value={editClassName} onChange={(e) => setEditClassName(e.target.value)} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Section Prefix</label>
                  <input type="text" required value={editSectionPrefix} onChange={(e) => setEditSectionPrefix(e.target.value)} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs uppercase font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Max Capacity</label>
                  <input type="number" required value={editMaxCapacity} onChange={(e) => setEditMaxCapacity(e.target.value)} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Placeholder Teacher Name</label>
                <input type="text" value={editPlaceholderTeacher} onChange={(e) => setEditPlaceholderTeacher(e.target.value)} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-3">
                <p className="text-xs font-bold text-orange-400 uppercase">Grading Weights Distribution (%)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Sessionals</span>
                    <input type="number" value={editSessionalWeight} onChange={(e) => setEditSessionalWeight(e.target.value)} className="w-full px-2 py-1.5 bg-[#080507] border border-slate-700 rounded-lg text-white text-xs font-mono" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Mids</span>
                    <input type="number" value={editMidsWeight} onChange={(e) => setEditMidsWeight(e.target.value)} className="w-full px-2 py-1.5 bg-[#080507] border border-slate-700 rounded-lg text-white text-xs font-mono" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Finals</span>
                    <input type="number" value={editFinalsWeight} onChange={(e) => setEditFinalsWeight(e.target.value)} className="w-full px-2 py-1.5 bg-[#080507] border border-slate-700 rounded-lg text-white text-xs font-mono" />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-3">
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="w-1/2 py-2.5 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={updatingSettings} className="w-1/2 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                  {updatingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-red-950/60 space-y-3">
              <p className="text-xs font-bold text-red-400 uppercase">Danger Zone</p>
              <form onSubmit={handleDeleteClassroomSubmit} className="space-y-3">
                {deleteError && <p className="text-red-300 text-xs">{deleteError}</p>}
                <p className="text-xs text-slate-300">Type <strong className="text-white">{classroom.className}</strong> to confirm deletion:</p>
                <input type="text" value={deleteInputName} onChange={(e) => setDeleteInputName(e.target.value)} placeholder="Enter exact class name" className="w-full px-3 py-2 bg-[#080507] border border-red-500/40 rounded-xl text-white text-xs" />
                <button type="submit" disabled={deletingClass || deleteInputName.trim() !== classroom.className.trim()} className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs uppercase font-extrabold rounded-xl cursor-pointer disabled:opacity-50">
                  {deletingClass ? 'Deleting...' : 'Permanently Delete Class'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 8. Anonymous Feedback / Complaints Modal */}
      {isComplaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-300 uppercase">Anonymous Complaint Box</h3>
              <button onClick={() => setIsComplaintModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSendComplaint} className="space-y-3">
              <textarea rows="4" required placeholder="Write your anonymous query or complaint..." value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs resize-none" />
              <button type="submit" disabled={sendingComplaint} className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                {sendingComplaint ? 'Submitting...' : 'Send Anonymously'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 9. View Complaints Modal (Staff/Admin) */}
      {isViewComplaintsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-300 uppercase">Anonymous Submissions</h3>
              <button onClick={() => setIsViewComplaintsModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            {loadingComplaints ? (
              <p className="text-center text-xs text-slate-400 py-6">Loading submissions...</p>
            ) : complaintsList.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6 italic">No feedback submissions received yet.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                {complaintsList.map((c, i) => (
                  <div key={i} className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-1">
                    <p className="text-xs text-white leading-relaxed">{c.message}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{new Date(c.createdAt || Date.now()).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setIsViewComplaintsModalOpen(false)} className="w-full py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold uppercase cursor-pointer">Close</button>
          </div>
        </div>
      )}

      {/* 10. Focused Photo-Only Modal */}
      {selectedActivityItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/50 rounded-3xl p-5 space-y-4 shadow-2xl my-auto text-center">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-orange-400 uppercase font-mono">{selectedActivityItem.item.title} — Uploaded Photo</h3>
              <button onClick={() => setSelectedActivityItem(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>

            {selectedActivityItem.scoreData?.file?.url && (
              <div className="bg-[#080507] border border-slate-800 rounded-2xl p-2 overflow-hidden">
                <img 
                  src={selectedActivityItem.scoreData.file.url} 
                  alt="Activity File" 
                  className="max-h-[60vh] mx-auto rounded-xl border border-slate-700 object-contain" 
                />
              </div>
            )}

            <button 
              onClick={() => setSelectedActivityItem(null)} 
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs rounded-xl cursor-pointer transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500">
        <p>© 2026 PUCIT Classroom Portal • All Rights Reserved</p>
      </footer>
    </div>
  );
};

export default ClassroomDetail;