import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';

const LabroomDetail = () => {
  const { labroomId } = useParams();
  const { user } = useAuth();
  const [labroom, setLabroom] = useState(null);
  const [studentMark, setStudentMark] = useState(null);
  const [labAnalytics, setLabAnalytics] = useState(null);
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
  const [itemCategory, setItemCategory] = useState('Lab Tasks');
  const [itemTitle, setItemTitle] = useState('');
  const [itemTotalMarks, setItemTotalMarks] = useState(10);
  const [creatingItem, setCreatingItem] = useState(false);

  // Excel / CSV Sync states for Staff
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelCategory, setExcelCategory] = useState('Lab Tasks');
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

  // Assign Instructor modal state (Admin only)
  const [isAssignTeacherModalOpen, setIsAssignTeacherModalOpen] = useState(false);
  const [teacherRollNo, setTeacherRollNo] = useState('');
  const [teacherLookupResult, setTeacherLookupResult] = useState(null);
  const [teacherSearching, setTeacherSearching] = useState(false);

  // Advanced Add Student Modal (Supercharged Multi-Mode State with Smart Class Picker)
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [addModeType, setAddModeType] = useState('shorthand'); // 'shorthand', 'range', 'batch', 'smartDetect'
  const [studentRollInput, setStudentRollInput] = useState('');
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnd, setBulkEnd] = useState('');
  const [addDropInput, setAddDropInput] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState('');

  // Smart Detect / Class Roster lookup state
  const [classDirectoryStudents, setClassDirectoryStudents] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [selectedDirectoryRolls, setSelectedDirectoryRolls] = useState([]);

  // Lab Roster / Members Overview Modal
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // Lab Settings & Weights modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editLabName, setEditLabName] = useState('');
  const [editSectionPrefix, setEditSectionPrefix] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState(40);
  const [editPlaceholderTeacher, setEditPlaceholderTeacher] = useState('');
  const [editSessionalActivities, setEditSessionalActivities] = useState([]);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  // Delete Labroom confirmation state
  const [deleteInputName, setDeleteInputName] = useState('');
  const [deletingLab, setDeletingLab] = useState(false);

  const navigate = useNavigate();

  const getCategoryTargetKey = (catName = '') => {
    const clean = catName.trim().toLowerCase();
    if (clean.includes('task')) return 'labTasks';
    if (clean.includes('viva')) return 'vivas';
    if (clean.includes('test')) return 'labTests';
    if (clean.includes('project')) return 'projects';
    if (clean.includes('quiz')) return 'quizzes';
    if (clean.includes('assign')) return 'assignments';
    return clean.endsWith('s') ? clean : clean + 's';
  };

  const fetchLabroomData = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await API.get(`/labrooms/${labroomId}`);
      const fetchedLab = res.data?.data?.labroom || res.data?.data;
      if (!fetchedLab) throw new Error('Labroom not found.');
      setLabroom(fetchedLab);

      setEditLabName(fetchedLab.labName || '');
      setEditSectionPrefix(fetchedLab.sectionPrefix || '');
      setEditMaxCapacity(fetchedLab.maxCapacity || 40);
      setEditPlaceholderTeacher(fetchedLab.placeholderTeacherName || '');

      const defaultActs = [
        { category: 'Lab Tasks', allocatedMarks: 50 },
        { category: 'Vivas', allocatedMarks: 30 },
        { category: 'Lab Tests', allocatedMarks: 20 }
      ];

      const activities = (fetchedLab.sessionalActivities && fetchedLab.sessionalActivities.length > 0)
        ? fetchedLab.sessionalActivities
        : defaultActs;

      setEditSessionalActivities(activities.map(a => ({ ...a })));
      if (activities.length > 0 && !itemCategory) {
        setItemCategory(activities[0].category);
      }

      try {
        const analyticsRes = await API.get(`/labmarks/analytics/${labroomId}`);
        const analyticsData = analyticsRes?.data?.data || analyticsRes?.data;
        
        if (analyticsData) {
          setLabAnalytics(analyticsData);
          if (analyticsData.studentMark) {
            setStudentMark(analyticsData.studentMark);
          }
        }
      } catch (err) {
        console.warn('Could not fetch analytics data:', err);
      }

      if (user?._id && !studentMark) {
        try {
          const markRes = await API.get(`/labmarks/student/${labroomId}/${user._id}`);
          const fetchedMarkDoc = markRes?.data?.data?.markDoc || markRes?.data?.markDoc || markRes?.data;
          if (fetchedMarkDoc) {
            setStudentMark(fetchedMarkDoc);
          }
        } catch (err) {
          console.warn('Could not fetch student lab marks:', err);
        }
      }
    } catch (err) {
      console.error('Failed to load labroom:', err);
      setError(err.response?.data?.message || 'Failed to load labroom environment.');
    } finally {
      setLoading(false);
    }
  };

  const fetchClassDirectory = async (prefix) => {
    if (!prefix) return;
    try {
      setLoadingDirectory(true);
      const res = await API.get(`/labrooms/${labroomId}/available-students`);
      setClassDirectoryStudents(res.data?.data?.students || res.data?.students || []);
    } catch (err) {
      console.warn('Could not load class prefix directory:', err);
      setClassDirectoryStudents([]);
    } finally {
      setLoadingDirectory(false);
    }
  };

  const fetchComplaints = async () => {
    try {
      setLoadingComplaints(true);
      const res = await API.get(`/labrooms/${labroomId}/complaints`);
      setComplaintsList(res.data?.data?.complaints || res.data?.complaints || []);
    } catch (err) {
      console.warn('Failed to fetch complaints');
    } finally {
      setLoadingComplaints(false);
    }
  };

  useEffect(() => {
    if (labroomId && user?._id) fetchLabroomData();
  }, [labroomId, user?._id]);

  useEffect(() => {
    if (isAddStudentModalOpen && addModeType === 'smartDetect' && labroom?.sectionPrefix) {
      fetchClassDirectory(labroom.sectionPrefix);
    }
  }, [isAddStudentModalOpen, addModeType, labroom?.sectionPrefix]);

  const isLabInstructor = (labroom?.teacher?._id || labroom?.teacher)?.toString() === user?._id?.toString();
  const isAssignedTa = (labroom?.tas || []).some(
    (ta) => (ta?._id || ta)?.toString() === user?._id?.toString()
  );
  const isAdmin = user?.role === 'ADMIN';
  const isGlobalTeacher = user?.role === 'TEACHER';

  const isStaffOrAdmin = isAdmin || isGlobalTeacher || isLabInstructor || isAssignedTa;
  const isTeacherOrAdmin = isAdmin || isGlobalTeacher || isLabInstructor;

  const handleTabletClick = async (item, targetKey, category, filterUngraded = false) => {
    if (isStaffOrAdmin) {
      navigate(`/labrooms/${labroomId}/sheet/${targetKey}/${encodeURIComponent(item.title)}`, {
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

      await API.post(`/labrooms/${labroomId}/notices`, {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        attachment: attachmentData
      });
      setNoticeTitle('');
      setNoticeContent('');
      setNoticeFile(null);
      fetchLabroomData();
      showToast('Lab notice published successfully!');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to post lab notice.', 'error');
    } finally {
      setPostingNotice(false);
    }
  };

  const handleSendComplaint = async (e) => {
    e.preventDefault();
    if (!complaintText.trim()) return;

    setSendingComplaint(true);
    try {
      await API.post(`/labrooms/${labroomId}/complaints`, { message: complaintText.trim() });
      showToast('Anonymous lab feedback submitted successfully!');
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

      await API.post(`/labrooms/${labroomId}/items`, {
        category: catKey,
        title: trimmedTitle,
        totalMarks: tMarks
      });

      setIsItemModalOpen(false);
      setItemTitle('');
      setItemTotalMarks(10);
      showToast('Opening lab result sheet...');

      navigate(`/labrooms/${labroomId}/sheet/${catKey}/${encodeURIComponent(trimmedTitle)}`, {
        state: { totalMarks: tMarks }
      });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to open lab result sheet.', 'error');
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

      const res = await API.post(`/labrooms/${labroomId}/sync-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setSyncReport(res.data?.data || res.data);
      showToast('Excel/CSV synced successfully!');
      fetchLabroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to parse and sync Excel file.', 'error');
    } finally {
      setSyncingExcel(false);
    }
  };

  const handleUpdateLabSettings = async (e) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      const totalAllocated = editSessionalActivities.reduce((acc, curr) => acc + (Number(curr.allocatedMarks) || 0), 0);

      await API.patch(`/labrooms/${labroomId}/settings`, {
        labName: editLabName.trim(),
        sectionPrefix: editSectionPrefix.trim().toUpperCase(),
        maxCapacity: Number(editMaxCapacity),
        placeholderTeacherName: editPlaceholderTeacher.trim(),
        sessionalActivities: editSessionalActivities.map(a => ({
          category: a.category.trim(),
          allocatedMarks: Number(a.allocatedMarks) || 0
        }))
      });
      showToast('Labroom settings & activities updated successfully!');
      setIsSettingsModalOpen(false);
      fetchLabroomData();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to update lab settings.', 'error');
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleAddStudentSubmit = async (e) => {
    e.preventDefault();
    setAddingStudent(true);
    setAddStudentError('');

    try {
      if (addModeType === 'shorthand') {
        const nums = studentRollInput.split(/[\s,]+/).filter(Boolean);
        if (nums.length === 0) throw new Error('Enter at least one roll number.');
        
        const prefix = (labroom?.sectionPrefix || '').trim().toUpperCase();
        const formattedRolls = nums.map(n => {
          if (/^\d+$/.test(n)) {
            return prefix + n.padStart(3, '0');
          }
          return n.toUpperCase();
        });

        await API.post(`/labrooms/add-drop-seniors`, { labroomId, rollNumbers: formattedRolls });
        showToast(`Successfully enrolled ${formattedRolls.length} students via shorthand!`);
      } else if (addModeType === 'range') {
        const start = parseInt(bulkStart, 10);
        const end = parseInt(bulkEnd, 10);
        if (isNaN(start) || isNaN(end) || start > end) throw new Error('Specify a valid numeric range.');
        await API.post(`/labrooms/add-bulk-range`, { labroomId, startRoll: start, endRoll: end });
        showToast(`Bulk range from ${start} to ${end} enrolled!`);
      } else if (addModeType === 'batch') {
        const rolls = addDropInput.split(/[\n,]+/).map(r => r.trim()).filter(Boolean);
        if (rolls.length === 0) throw new Error('Enter at least one roll number.');
        await API.post(`/labrooms/add-drop-seniors`, { labroomId, rollNumbers: rolls });
        showToast(`Successfully enrolled ${rolls.length} students!`);
      } else if (addModeType === 'smartDetect') {
        if (selectedDirectoryRolls.length === 0) throw new Error('Please select at least one student from the directory.');
        const selectedIds = classDirectoryStudents
          .filter(st => selectedDirectoryRolls.includes(st.rollNo))
          .map(st => st._id);
        await API.post(`/labrooms/${labroomId}/bulk-approve`, { studentIds: selectedIds });
        showToast(`Successfully enrolled ${selectedDirectoryRolls.length} students!`);
      }

      setIsAddStudentModalOpen(false);
      setStudentRollInput('');
      setBulkStart('');
      setBulkEnd('');
      setAddDropInput('');
      setSelectedDirectoryRolls([]);
      fetchLabroomData();
    } catch (err) {
      setAddStudentError(err.response?.data?.message || err.message || 'Failed lab enrollment.');
    } finally {
      setAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to remove ${studentName || 'this student'} from the lab?`)) return;
    try {
      await API.delete(`/labrooms/${labroomId}/students/${studentId}`);
      showToast('Student removed from labroom!');
      fetchLabroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to remove student.', 'error');
    }
  };

  const handleStaffResetStudentPassword = async (studentUserId, studentName) => {
    const newPassword = prompt(`Enter new temporary password for ${studentName}:`);
    if (!newPassword || newPassword.trim().length < 6) {
      if (newPassword !== null) alert('Password must be at least 6 characters.');
      return;
    }

    try {
      await API.patch('/auth/reset-student-password-staff', { userId: studentUserId, newPassword: newPassword.trim() });
      showToast(`Password successfully updated for ${studentName}!`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reset password.', 'error');
    }
  };

  const handleDeleteLabroomSubmit = async (e) => {
    e.preventDefault();
    if (deleteInputName.trim() !== labroom.labName.trim()) return;

    setDeletingLab(true);
    setError('');

    try {
      await API.delete(`/labrooms/${labroomId}`);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete labroom.');
      setDeletingLab(false);
    }
  };

  const handleLookupTa = async (e) => {
    e.preventDefault();
    setTaSearching(true);
    setTaLookupResult(null);
    try {
      const res = await API.post(`/labrooms/${labroomId}/lookup-ta`, { rollNo: taRollNo.trim().toUpperCase() });
      setTaLookupResult(res.data.data);
    } catch (err) {
      setTaLookupResult({ status: 'not_found', message: err.response?.data?.message || 'User account not found.' });
    } finally {
      setTaSearching(false);
    }
  };

  const handleConfirmAddTa = async (userId) => {
    try {
      await API.post(`/labrooms/${labroomId}/add-ta`, { userId });
      showToast('Lab TA assigned successfully!');
      setIsTaModalOpen(false);
      setTaRollNo('');
      setTaLookupResult(null);
      fetchLabroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign lab TA.', 'error');
    }
  };

  const handleLookupTeacher = async (e) => {
    e.preventDefault();
    setTeacherSearching(true);
    setTeacherLookupResult(null);
    try {
      const res = await API.post(`/labrooms/${labroomId}/lookup-teacher`, { rollNo: teacherRollNo.trim() });
      setTeacherLookupResult(res.data.data);
    } catch (err) {
      setTeacherLookupResult({ status: 'not_found', message: err.response?.data?.message || 'Instructor account not found.' });
    } finally {
      setTeacherSearching(false);
    }
  };

  const handleConfirmAssignTeacher = async (teacherId) => {
    try {
      await API.patch(`/labrooms/assign-teacher`, { labroomId, teacherId });
      showToast('Lab Instructor assigned successfully!');
      setIsAssignTeacherModalOpen(false);
      setTeacherRollNo('');
      setTeacherLookupResult(null);
      fetchLabroomData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign lab instructor.', 'error');
    }
  };

  const handleExportExcelSheet = () => {
    try {
      const rankings = labAnalytics?.rankings || [];
      if (rankings.length === 0) {
        showToast('No student ranking data available to export.', 'error');
        return;
      }

      let allEvaluationItems = [];
      sessionalActivitiesList.forEach(act => {
        const targetKey = getCategoryTargetKey(act.category);
        const items = labroom[targetKey] || [];
        items.forEach(item => {
          allEvaluationItems.push({
            targetKey,
            title: item.title,
            totalMarks: item.totalMarks || 10
          });
        });
      });

      let headers = ['Roll Number', 'Student Name'];
      allEvaluationItems.forEach(ev => {
        headers.push(`${ev.title} (${ev.totalMarks})`);
      });
      headers.push('Overall Percentage');

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

        allEvaluationItems.forEach(ev => {
          const scoresList = marksDoc[ev.targetKey] || r[ev.targetKey] || [];
          const match = scoresList.find(s => s.title?.trim().toLowerCase() === ev.title?.trim().toLowerCase());
          row.push(match?.isAbsent ? 'Absent' : (match?.obtainedMarks ?? ''));
        });

        const calcObj = getStudentAnalyticsData();
        const overallPct = r.overallPercentage || r.percentage || calcObj.overall || 0;
        row.push(`${Number(overallPct).toFixed(2)}%`);

        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${labroom.labName}_${labroom.sectionPrefix}_Result_Sheet.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Excel/CSV sheet exported successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to export lab results file.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-mono text-xs text-slate-400 tracking-wider">Syncing lab environment...</p>
      </div>
    );
  }

  if (error || !labroom) {
    return (
      <div className="min-h-screen bg-[#080507] text-white flex flex-col items-center justify-center p-4">
        <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-6 text-center max-w-sm w-full space-y-4 shadow-xl">
          <h2 className="font-extrabold text-sm text-white">Lab Connection Error</h2>
          <p className="text-xs text-slate-300">{error || 'Labroom does not exist.'}</p>
          <Link to="/" className="block py-3 bg-blue-500 text-black font-extrabold text-xs uppercase rounded-xl">Dashboard</Link>
        </div>
      </div>
    );
  }

  const activeStudents = (labroom.students || []).filter(s => s && (s._id || s.name));
  const totalStudentsCount = activeStudents.length;
  const reversedNotices = [...(labroom.notices || [])].reverse();
  const latestNotice = reversedNotices[0];

  const sessionalActivitiesList = (labroom.sessionalActivities && labroom.sessionalActivities.length > 0)
    ? labroom.sessionalActivities
    : [{ category: 'Lab Tasks', allocatedMarks: 50 }, { category: 'Vivas', allocatedMarks: 30 }, { category: 'Lab Tests', allocatedMarks: 20 }];

  const calculateStudentPercentages = (markDoc) => {
    if (!markDoc) return { overall: '0.00', categories: {} };

    let totalAllocatedWeight = 0;
    let weightedEarnedSum = 0;
    let catPercentages = {};

    sessionalActivitiesList.forEach(act => {
      const targetKey = getCategoryTargetKey(act.category);
      const itemsList = markDoc[targetKey] || [];
      const allocatedWeight = Number(act.allocatedMarks || 0);
      totalAllocatedWeight += allocatedWeight;

      if (itemsList.length > 0) {
        let catObtained = 0;
        let catTotal = 0;
        itemsList.forEach(item => {
          if (!item.isAbsent && item.obtainedMarks !== undefined && item.obtainedMarks !== null) {
            catObtained += Number(item.obtainedMarks || 0);
            catTotal += Number(item.totalMarks || 10);
          }
        });

        const catPct = catTotal > 0 ? (catObtained / catTotal) * 100 : 0;
        catPercentages[act.category] = catPct.toFixed(2);
        weightedEarnedSum += (catPct * allocatedWeight);
      } else {
        catPercentages[act.category] = '0.00';
      }
    });

    const overallPct = totalAllocatedWeight > 0 ? (weightedEarnedSum / totalAllocatedWeight) : 0;
    return {
      overall: overallPct.toFixed(2),
      categories: catPercentages
    };
  };

  const getItemClassAverage = (targetKey, itemTitle) => {
    const rankings = labAnalytics?.rankings || [];
    if (rankings.length === 0) {
      const sScore = (studentMark?.[targetKey] || []).find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      if (sScore && sScore.obtainedMarks !== undefined && sScore.obtainedMarks !== null) {
        const total = Number(sScore.totalMarks || 10);
        return ((Number(sScore.obtainedMarks) / total) * 100).toFixed(2);
      }
      return '0.00';
    }
    
    let totalObtained = 0;
    let totalPossible = 0;
    let count = 0;

    const categoryItems = labroom[targetKey] || [];
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
    const rankings = labAnalytics?.rankings || [];
    if (rankings.length === 0) {
      const sScore = (studentMark?.[targetKey] || []).find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      if (sScore && sScore.obtainedMarks !== undefined && sScore.obtainedMarks !== null) {
        return Number(sScore.obtainedMarks).toFixed(2);
      }
      return '0.00';
    }
    
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
    const rankings = labAnalytics?.rankings || [];
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
    const rankings = labAnalytics?.rankings || [];
    if (rankings.length === 0 || !user?._id) {
      return { rank: '#1', total: activeStudents.length };
    }
    
    const sorted = [...rankings].sort((a, b) => {
      const docA = a.marksDoc || a;
      const docB = b.marksDoc || b;
      const calcA = Number(a.overallPercentage || a.percentage || calculateStudentPercentages(docA).overall || 0);
      const calcB = Number(b.overallPercentage || b.percentage || calculateStudentPercentages(docB).overall || 0);
      return calcB - calcA;
    });

    const currentUserIdStr = user._id.toString();
    const index = sorted.findIndex(r => {
      const studentIdObj = r.student?._id || r.student || r.studentId;
      if (!studentIdObj) return false;
      return studentIdObj.toString() === currentUserIdStr;
    });

    if (index === -1) return { rank: 'Pending', total: activeStudents.length };
    return { rank: `#${index + 1}`, total: rankings.length };
  };

  const getStudentAnalyticsData = () => {
    const rankings = labAnalytics?.rankings || [];
    const currentUserIdStr = user?._id?.toString();

    let found = null;
    if (rankings.length > 0 && currentUserIdStr) {
      found = rankings.find(r => {
        const studentIdObj = r.student?._id || r.student || r.studentId;
        if (!studentIdObj) return false;
        return studentIdObj.toString() === currentUserIdStr;
      });
    }

    if (!found) {
      return calculateStudentPercentages(studentMark);
    }

    const doc = found.marksDoc || found;
    let overallVal = found.overallPercentage || found.percentage || found.totalPercentage;
    let catPercentages = {};

    sessionalActivitiesList.forEach(act => {
      const targetKey = getCategoryTargetKey(act.category);
      const val = found[targetKey + 'Percentage'] || found[act.category.toLowerCase() + 'Percentage'] || found[act.category];
      if (val !== undefined && val !== null && !isNaN(val)) {
        catPercentages[act.category] = Number(val).toFixed(2);
      }
    });

    if (overallVal === undefined || overallVal === null || isNaN(overallVal)) {
      const calculated = calculateStudentPercentages(doc);
      overallVal = calculated.overall;
      if (Object.keys(catPercentages).length === 0) {
        catPercentages = calculated.categories;
      }
    }

    return {
      overall: Number(overallVal).toFixed(2),
      categories: catPercentages
    };
  };

  const getSortedLeaderboard = () => {
    const rankings = labAnalytics?.rankings || [];
    if (rankings.length === 0) return [];

    return [...rankings].sort((a, b) => {
      const docA = a.marksDoc || a;
      const docB = b.marksDoc || b;
      let scoreA = Number(a.overallPercentage || a.percentage || calculateStudentPercentages(docA).overall || 0);
      let scoreB = Number(b.overallPercentage || b.percentage || calculateStudentPercentages(docB).overall || 0);

      if (leaderboardFilter !== 'overall') {
        const targetKey = getCategoryTargetKey(leaderboardFilter);
        scoreA = Number(a[targetKey + 'Percentage'] || a[leaderboardFilter + 'Percentage'] || calculateStudentPercentages(docA).categories[leaderboardFilter] || 0);
        scoreB = Number(b[targetKey + 'Percentage'] || b[leaderboardFilter + 'Percentage'] || calculateStudentPercentages(docB).categories[leaderboardFilter] || 0);
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
      const items = labroom[targetKey] || [];
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
  const themeColorClass = 'border-blue-500/30';
  const badgeColorClass = 'bg-blue-500/10 border-blue-500/30 text-blue-400';

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#080507] px-3 sm:px-6 lg:px-8 py-5 selection:bg-blue-400 selection:text-black overflow-x-hidden">

      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-500/15 rounded-full blur-[100px] pointer-events-none"></div>

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
              <h1 className="text-sm sm:text-base font-black text-white leading-tight">{labroom.labName}</h1>
              <p className="text-[11px] font-mono font-semibold text-blue-400">{labroom.sectionPrefix}</p>
            </div>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border uppercase ${badgeColorClass} whitespace-nowrap`}>
            🔬 Lab
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0 border-t sm:border-0 border-slate-800">
          {user?.role === 'STUDENT' && !isAssignedTa && (
            <button onClick={() => setIsComplaintModalOpen(true)} className="px-3 py-2 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all">⚠️ Complaints</button>
          )}
          {isStaffOrAdmin && (
            <>
              <button onClick={() => { setIsViewComplaintsModalOpen(true); fetchComplaints(); }} className="px-3 py-2 bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-500/50 text-[10px] font-extrabold uppercase rounded-xl transition-all">📥 Feedback</button>
              <button onClick={handleExportExcelSheet} className="px-3 py-2 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 text-[10px] font-extrabold uppercase rounded-xl transition-all shadow-md">📊 Export Excel</button>
            </>
          )}
          <button onClick={() => setIsMembersModalOpen(true)} className="px-3 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all">👥 Roster</button>
          {isAdmin && <button onClick={() => setIsAssignTeacherModalOpen(true)} className="px-3 py-2 bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-500/40 text-[10px] font-extrabold uppercase rounded-xl transition-all">+ Instructor</button>}
          {isTeacherOrAdmin && <button onClick={() => setIsTaModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 text-[10px] font-extrabold uppercase rounded-xl transition-all">+ TA</button>}
          {isStaffOrAdmin && (
            <>
              <button onClick={() => setIsAddStudentModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 text-[10px] font-extrabold uppercase rounded-xl transition-all">+ Student</button>
              <button onClick={() => setIsExcelModalOpen(true)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 text-[10px] font-extrabold uppercase rounded-xl transition-all">📊 Upload Sync</button>
              <button onClick={() => setIsItemModalOpen(true)} className="px-3.5 py-2 bg-gradient-to-r from-blue-400 to-cyan-500 text-black text-[10px] font-extrabold uppercase rounded-xl shadow-md transition-all">+ Evaluation</button>
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
            {labroom.notices?.length > 0 && (
              <button onClick={() => setShowAllNotices(!showAllNotices)} className="text-xs font-bold underline cursor-pointer text-blue-400">
                {showAllNotices ? 'Show Latest Only' : `View All (${labroom.notices.length})`}
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
                <button type="submit" disabled={postingNotice} className="px-4 py-2 text-black font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer bg-blue-500 hover:bg-blue-400">
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
                        <a href={n.attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono underline text-blue-300">
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
                      <a href={latestNotice.attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs font-mono underline text-blue-300">
                        📄 Download {latestNotice.attachment.fileName || 'Attachment'}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* NAVIGATION TABS WITH ACTIVITY COUNTS & LEADERBOARD ICON FOR STAFF */}
        <div className="flex items-center bg-[#130910]/80 border border-blue-500/20 rounded-2xl p-2 gap-1 overflow-x-auto">
          <button onClick={() => setActiveTab('overview')} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer ${activeTab === 'overview' ? 'bg-blue-400 text-black' : 'text-slate-400'}`}>📊 Overview</button>
          
          {isStaffOrAdmin && (
            <button onClick={() => setActiveTab('leaderboard')} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'leaderboard' ? 'bg-blue-400 text-black' : 'text-slate-400 bg-slate-900/60'}`}>
              <span>🏆 Lab Leaderboard</span>
            </button>
          )}

          {sessionalActivitiesList.map((act) => {
            const targetKey = getCategoryTargetKey(act.category);
            const count = (labroom[targetKey] || []).length;
            return (
              <button key={act.category} onClick={() => setActiveTab(act.category.toLowerCase())} className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${activeTab === act.category.toLowerCase() ? 'bg-blue-400 text-black' : 'text-slate-400 bg-slate-900/60'}`}>
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
            <div className="lg:col-span-2 bg-[#130910]/90 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-6 space-y-5 shadow-xl">
              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                {user?.role === 'STUDENT' && !isAssignedTa ? 'Your Lab Progress & Detailed Breakdown' : 'Lab Performance Summary & Deep Metrics'}
              </h3>
              {user?.role === 'STUDENT' && !isAssignedTa ? (
                <div className="space-y-4">
                  {/* Overall Lab Percentage & Rank Cards Side by Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-950/60 to-[#080507] border border-blue-500/40 p-5 rounded-3xl space-y-2 shadow-2xl">
                      <p className="text-xs text-blue-400 uppercase font-extrabold tracking-widest">Overall Lab Percentage</p>
                      <p className="text-4xl sm:text-5xl font-black font-mono text-blue-300 tracking-tight">{studentAnalyticsData.overall}%</p>
                    </div>
                    <div className="bg-gradient-to-br from-cyan-950/60 to-[#080507] border border-cyan-500/40 p-5 rounded-3xl space-y-2 shadow-2xl">
                      <p className="text-xs text-cyan-400 uppercase font-extrabold tracking-widest">Lab Standing & Rank</p>
                      <p className="text-4xl sm:text-5xl font-black font-mono text-cyan-300 tracking-tight">{studentRankInfo.rank} <span className="text-sm text-slate-400 font-normal">/ {studentRankInfo.total}</span></p>
                    </div>
                  </div>

                  {/* Activity Category Breakdown */}
                  <div className="bg-[#080507] border border-slate-800 p-4 rounded-3xl space-y-3 shadow-lg">
                    <p className="text-xs font-bold uppercase text-slate-300">Activity Category Breakdown</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {sessionalActivitiesList.map((act, i) => {
                        const catPct = studentAnalyticsData.categories?.[act.category] || '0.00';
                        return (
                          <div key={i} className="bg-[#130910] p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-2">
                            <span className="text-[10px] text-slate-400 uppercase font-bold truncate">{act.category}</span>
                            <span className="font-mono font-black text-emerald-400 text-xl">{catPct}%</span>
                            <span className="text-[9px] text-slate-500 font-mono">Weight: {act.allocatedMarks} Marks</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#080507] border border-blue-500/30 p-4 rounded-2xl space-y-1 shadow-lg">
                      <p className="text-[10px] text-blue-400 uppercase font-extrabold tracking-wider">Overall Lab Average %</p>
                      <p className="text-2xl sm:text-3xl font-black font-mono text-blue-300">{labAnalytics?.classAverages?.overallLabPercentage ?? labAnalytics?.classAverages?.overallPercentage ?? labAnalytics?.averageOverallPercentage ?? '0.00'}%</p>
                    </div>
                    <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-1">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Evaluated Students</p>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">{labAnalytics?.rankings?.length || 0} / {totalStudentsCount}</p>
                    </div>
                    <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-1">
                      <p className="text-[10px] text-slate-400 uppercase font-bold">Pending Grades</p>
                      <p className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">{totalPendingCount}</p>
                    </div>
                  </div>
                  <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                    <p className="text-xs font-bold uppercase text-slate-300">Deep Category Breakdown (Lab Averages)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      {sessionalActivitiesList.map((act, i) => {
                        const targetKey = getCategoryTargetKey(act.category);
                        const avgVal = labAnalytics?.classAverages?.[targetKey + 'Percentage'] || labAnalytics?.classAverages?.[act.category.toLowerCase().replace(/\s+/g, '') + 'Percentage'] || labAnalytics?.[targetKey + 'Average'] || 0;
                        return (
                          <div key={i} className="bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block uppercase">{act.category} Avg</span>
                            <span className="font-mono font-bold text-blue-400 text-sm">{Number(avgVal).toFixed(2)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* LAB PROFILE BOX */}
            <div className="relative bg-gradient-to-br from-[#130910] via-[#0b1016] to-[#070b10] backdrop-blur-2xl border border-blue-500/30 rounded-3xl p-6 shadow-2xl flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between border-b border-blue-500/20 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400 text-xs">🔬</span>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Lab Profile</h3>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/40 uppercase font-extrabold tracking-widest">
                    {labroom.sectionPrefix}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Lab Code</span>
                    <strong className="text-cyan-400 font-mono font-bold">{labroom.sectionPrefix}-{labroomId.slice(-4).toUpperCase()}</strong>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Instructor</span>
                    <strong className="text-white font-bold truncate max-w-[160px]">{labroom.teacher?.name || labroom.placeholderTeacherName || 'TBA'}</strong>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Section</span>
                    <strong className="text-blue-300 font-mono font-bold">{labroom.sectionPrefix}</strong>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">Enrollment</span>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-emerald-400 font-black">{totalStudentsCount}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-300">{labroom.maxCapacity || 40} Max</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-[#080507]/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 shadow-inner">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider">TAs Assigned</span>
                    <strong className="text-cyan-400 font-mono font-bold">{(labroom.tas || []).length} Active TAs</strong>
                  </div>
                </div>
              </div>

              <div className="pt-4 relative z-10">
                <button onClick={() => setIsMembersModalOpen(true)} className="w-full py-3 bg-gradient-to-r from-blue-500/25 hover:from-blue-500/35 to-cyan-500/25 hover:to-cyan-500/35 border border-blue-500/40 text-blue-300 hover:text-blue-200 text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2">
                  <span>👥 View Full Lab Roster</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB VIEW */}
        {activeTab === 'leaderboard' && isStaffOrAdmin && (
          <div className="bg-[#130910]/90 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-black text-white uppercase tracking-wider">🏆 Lab Leaderboard & Standings</h3>
                <p className="text-xs text-slate-400">Rankings across all students evaluated in this lab.</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'overall', label: 'Overall' },
                  ...sessionalActivitiesList.map(a => ({ key: a.category.toLowerCase(), label: a.category }))
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setLeaderboardFilter(filter.key)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all cursor-pointer ${
                      leaderboardFilter === filter.key
                        ? 'bg-blue-400 text-black shadow-lg shadow-blue-500/20'
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
                      <td colSpan="4" className="text-center py-10 text-slate-500 italic">No lab evaluation rankings generated yet. Start grading students to populate leaderboard.</td>
                    </tr>
                  ) : (
                    getSortedLeaderboard().map((entry, idx) => {
                      const studentObj = entry.student || {};
                      const studentName = studentObj.name || 'Unknown Student';
                      const studentRoll = studentObj.rollNo || 'N/A';
                      const doc = entry.marksDoc || entry;

                      let currentScore = entry.overallPercentage || entry.percentage || calculateStudentPercentages(doc).overall;
                      if (leaderboardFilter !== 'overall') {
                        const targetKey = getCategoryTargetKey(leaderboardFilter);
                        currentScore = entry[targetKey + 'Percentage'] || entry[leaderboardFilter + 'Percentage'] || calculateStudentPercentages(doc).categories[leaderboardFilter] || 0;
                      }

                      return (
                        <tr key={idx} className="hover:bg-slate-900/40 transition-all">
                          <td className="py-3.5 px-3 font-mono font-bold text-blue-400">
                            {idx === 0 ? '👑 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                          </td>
                          <td className="py-3.5 px-3 font-mono text-cyan-400 font-bold">{studentRoll}</td>
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
          const itemsList = [...(labroom[targetKey] || [])].reverse();

          return (
            <div key={cat} className="bg-[#130910]/90 backdrop-blur-2xl border border-blue-500/20 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">{cat} Activity Portal</h3>
                <span className="text-xs font-mono text-slate-400">Allocated Weight: <strong className="text-blue-400">{act.allocatedMarks} Marks</strong></span>
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
                        className="bg-gradient-to-br from-[#090b10] to-[#080507] border border-slate-800 hover:border-blue-500/40 rounded-2xl p-5 space-y-4 transition-all shadow-lg flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]"></span>
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
                                  <span className="font-mono text-cyan-400 font-bold text-xs">
                                    {itemAvgRaw} / {total}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right space-y-1">
                                <div>
                                  <span className="text-[10px] text-slate-400 uppercase block font-extrabold tracking-wider">Your %</span>
                                  <span className="font-mono text-blue-400 font-black text-sm">
                                    {studentItemScore && !studentItemScore.isAbsent ? `${studentPercentage}%` : 'N/A'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-slate-800/60">
                                  <span className="text-[10px] text-slate-400 uppercase block font-extrabold tracking-wider">Class Avg %</span>
                                  <span className="font-mono text-cyan-400 font-bold text-xs">
                                    {itemAvgPct}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-[#130910]/80 p-3.5 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-bold uppercase">Class Average:</span>
                                <strong className="text-cyan-400 font-mono">{itemAvgPct}% ({itemAvgRaw} / {total})</strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400 font-bold uppercase">Grading Progress:</span>
                                <span className="font-mono text-emerald-400 font-bold">{gradedCount} / {totalStudentsCount} Evaluated</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Action Controls */}
                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="w-full flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 italic">Submission Status Active</span>
                              {hasPhoto && (
                                <button 
                                  onClick={() => setSelectedActivityItem({ item, targetKey, category: cat, scoreData: studentItemScore })}
                                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
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
          <div className="w-full max-w-lg bg-[#130910] border border-cyan-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-cyan-300 uppercase">Lab Roster & Hierarchy</h3>
              <button onClick={() => setIsMembersModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              <div className="space-y-1.5">
                <p className="text-[10px] text-blue-400 uppercase font-extrabold tracking-wider">Instructor</p>
                <div className="bg-[#080507] border border-blue-500/30 p-3.5 rounded-2xl flex items-center justify-between text-xs">
                  <div className="truncate">
                    <p className="text-white font-bold truncate">{labroom.teacher?.name || labroom.placeholderTeacherName || 'TBA'}</p>
                    <p className="font-mono text-blue-300">{labroom.teacher?.email || 'Primary Instructor'}</p>
                  </div>
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-[9px] font-bold uppercase">Instructor</span>
                </div>
              </div>

              {(labroom.tas || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-cyan-400 uppercase font-extrabold tracking-wider">Teaching Assistants (TAs)</p>
                  {(labroom.tas || []).map((ta, i) => (
                    <div key={i} className="bg-[#080507] border border-cyan-500/30 p-3.5 rounded-2xl flex items-center justify-between text-xs">
                      <div className="truncate">
                        <p className="text-white font-bold truncate">{ta.name || 'TA Member'}</p>
                        <p className="font-mono text-cyan-400">{ta.rollNo || ta.email || 'N/A'}</p>
                      </div>
                      <span className="px-2 py-1 bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-lg text-[9px] font-bold uppercase">TA</span>
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
                      <p className="font-mono text-cyan-400">{st.rollNo}</p>
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
          <div className="w-full max-w-md bg-[#130910] border border-blue-500/40 rounded-3xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-blue-400 uppercase">Create Evaluation Item</h3>
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
                <input type="text" required placeholder="e.g. Lab Task 1" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Total Marks</label>
                <input type="number" required min="1" value={itemTotalMarks} onChange={(e) => setItemTotalMarks(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsItemModalOpen(false)} className="w-1/2 py-3 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={creatingItem} className="w-1/2 py-3 bg-blue-500 hover:bg-blue-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
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
          <div className="w-full max-w-md bg-[#130910] border border-blue-500/40 rounded-3xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-blue-300 uppercase">📊 Sync Lab Marks via Excel/CSV</h3>
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
                <button onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer">Done</button>
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
                  <input type="text" required placeholder="e.g. Lab Task 1 or Viva 1" value={excelTitle} onChange={(e) => setExcelTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Total Marks</label>
                  <input type="number" required min="1" value={excelTotalMarks} onChange={(e) => setExcelTotalMarks(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Upload CSV / Excel File</label>
                  <input type="file" required accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => setExcelFile(e.target.files[0])} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-500 file:text-black hover:file:bg-blue-400 cursor-pointer" />
                  <p className="text-[10px] text-slate-500 mt-1">File must include columns for Roll Number / Reg ID and Marks Obtained.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsExcelModalOpen(false)} className="w-1/2 py-3 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                  <button type="submit" disabled={syncingExcel} className="w-1/2 py-3 bg-blue-500 hover:bg-blue-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                    {syncingExcel ? 'Syncing...' : 'Upload & Sync'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. Supercharged Add Student Modal (Reordered & Darkened Enrolled State) */}
      {isAddStudentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-blue-500/40 rounded-3xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white uppercase">Enroll Students</h3>
                <p className="text-[11px] text-slate-400">Choose your preferred quick-entry method for section <strong className="text-blue-400 font-mono">{labroom?.sectionPrefix}</strong></p>
              </div>
              <button onClick={() => setIsAddStudentModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            
            {addStudentError && <div className="p-3 bg-red-950/80 border border-red-500 text-red-200 rounded-xl text-xs">{addStudentError}</div>}
            
            {/* Reordered Mode Toggle Buttons: 1. Shorthand, 2. Range, 3. Full Roll, 4. Smart Add */}
            <div className="grid grid-cols-4 gap-1.5">
              <button type="button" onClick={() => setAddModeType('shorthand')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-all ${addModeType === 'shorthand' ? 'bg-blue-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>1. Shorthand</button>
              <button type="button" onClick={() => setAddModeType('range')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-all ${addModeType === 'range' ? 'bg-blue-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>2. Range</button>
              <button type="button" onClick={() => setAddModeType('batch')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-all ${addModeType === 'batch' ? 'bg-blue-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>3. Full Roll</button>
              <button type="button" onClick={() => setAddModeType('smartDetect')} className={`py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-all ${addModeType === 'smartDetect' ? 'bg-blue-500 text-black shadow-sm' : 'bg-slate-800 text-slate-300'}`}>4. Smart Add</button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-4">
              
              {/* MODE 1: SHORTHAND (e.g. 3, 4, 56) */}
              {addModeType === 'shorthand' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-slate-400">Quick Suffix Entry (e.g. 3, 4, 56)</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. 3, 4, 56, 23" 
                    value={studentRollInput} 
                    onChange={(e) => setStudentRollInput(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono uppercase focus:ring-1 focus:ring-blue-400" 
                  />
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Quickly maps digits into full roll numbers using <span className="font-mono text-blue-400">{labroom?.sectionPrefix}</span> prefix (e.g., <span className="font-mono text-cyan-400">3</span> becomes <span className="font-mono text-blue-400">{labroom?.sectionPrefix}003</span>).
                  </p>
                </div>
              )}

              {/* MODE 2: RANGE (Start to End) */}
              {addModeType === 'range' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Start Suffix / #</label>
                      <input type="number" required placeholder="1" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">End Suffix / #</label>
                      <input type="number" required placeholder="40" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Bulk enrolls a continuous numeric sequence under <span className="font-mono text-blue-400">{labroom?.sectionPrefix}</span>.
                  </p>
                </div>
              )}

              {/* MODE 3: FULL ROLL (Batch CSV / List) */}
              {addModeType === 'batch' && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Full Roll Numbers / Add-Drop List</label>
                  <textarea 
                    rows="4" 
                    required 
                    placeholder="BITF26A001, BITF26A002, BITF26A047" 
                    value={addDropInput} 
                    onChange={(e) => setAddDropInput(e.target.value)} 
                    className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono resize-none focus:ring-1 focus:ring-blue-400" 
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Accepts full roll numbers or registration numbers separated by commas or newlines.</p>
                </div>
              )}

              {/* MODE 4: SMART ADD / SMART DETECT */}
              {addModeType === 'smartDetect' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Matching Prefix: <strong className="text-blue-400 font-mono">{labroom?.sectionPrefix}</strong></span>
                    <button 
                      type="button" 
                      onClick={() => {
                        const unenrolled = classDirectoryStudents
                          .filter(st => !activeStudents.some(as => as._id?.toString() === st._id?.toString()))
                          .map(st => st.rollNo);
                        setSelectedDirectoryRolls(unenrolled);
                      }} 
                      className="text-blue-400 underline font-bold cursor-pointer hover:text-blue-300"
                    >
                      Select All Unenrolled
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-2 bg-[#080507] border border-slate-800 p-3 rounded-2xl">
                    {loadingDirectory ? (
                      <p className="text-center text-xs text-slate-500 py-6">Scanning class directory...</p>
                    ) : classDirectoryStudents.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 py-6 italic">No registered user accounts found matching prefix {labroom?.sectionPrefix}. Try shorthand or range mode.</p>
                    ) : (
                      classDirectoryStudents.map((st, i) => {
                        const alreadyEnrolled = activeStudents.some(as => as._id?.toString() === st._id?.toString());
                        const isSelected = selectedDirectoryRolls.includes(st.rollNo);

                        return (
                          <div 
                            key={i} 
                            onClick={() => {
                              if (alreadyEnrolled) return;
                              if (isSelected) {
                                setSelectedDirectoryRolls(selectedDirectoryRolls.filter(r => r !== st.rollNo));
                              } else {
                                setSelectedDirectoryRolls([...selectedDirectoryRolls, st.rollNo]);
                              }
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                              alreadyEnrolled 
                                ? 'bg-slate-950/40 border-slate-900/60 opacity-40 cursor-not-allowed select-none' 
                                : isSelected 
                                  ? 'bg-blue-950/60 border-blue-500/50 text-white cursor-pointer' 
                                  : 'bg-[#130910] border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <input 
                                type="checkbox" 
                                checked={isSelected || alreadyEnrolled} 
                                disabled={alreadyEnrolled}
                                onChange={() => {}} 
                                className={`rounded accent-blue-500 ${alreadyEnrolled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} 
                              />
                              <div className="truncate">
                                <p className={`font-bold truncate ${alreadyEnrolled ? 'text-slate-500 line-through' : 'text-white'}`}>{st.name}</p>
                                <p className="font-mono text-cyan-400 text-[11px]">{st.rollNo}</p>
                              </div>
                            </div>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                              alreadyEnrolled 
                                ? 'bg-slate-900 text-slate-500 border border-slate-800' 
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {alreadyEnrolled ? 'Enrolled' : 'Available'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">Selected: <strong className="text-emerald-400 font-mono">{selectedDirectoryRolls.length}</strong> new students ready to enroll.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsAddStudentModalOpen(false)} className="w-1/2 py-3 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={addingStudent} className="w-1/2 py-3 bg-blue-500 hover:bg-blue-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                  {addingStudent ? 'Processing...' : 'Enroll Students'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add TA Modal */}
      {isTaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-blue-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-blue-300 uppercase">Assign Teaching Assistant</h3>
              <button onClick={() => setIsTaModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleLookupTa} className="space-y-3">
              <input type="text" required placeholder="Enter student roll number" value={taRollNo} onChange={(e) => setTaRollNo(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono uppercase" />
              <button type="submit" disabled={taSearching} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 font-bold uppercase text-xs rounded-xl cursor-pointer">
                {taSearching ? 'Searching...' : 'Lookup Student'}
              </button>
            </form>
            {taLookupResult && (
              <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                {taLookupResult.status === 'not_found' ? (
                  <p className="text-red-400 text-xs">{taLookupResult.message}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-white">Found: <strong className="text-blue-400">{taLookupResult.user.name}</strong> ({taLookupResult.user.rollNo})</p>
                    <button type="button" onClick={() => handleConfirmAddTa(taLookupResult.user._id)} className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer">Assign as TA</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Assign Instructor Modal */}
      {isAssignTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-md bg-[#130910] border border-purple-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-purple-300 uppercase">Assign Instructor</h3>
              <button onClick={() => setIsAssignTeacherModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleLookupTeacher} className="space-y-3">
              <input type="text" required placeholder="Enter teacher email or ID" value={teacherRollNo} onChange={(e) => setTeacherRollNo(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono" />
              <button type="submit" disabled={teacherSearching} className="w-full py-2.5 bg-purple-950 text-purple-200 border border-purple-500/40 font-bold uppercase text-xs rounded-xl cursor-pointer">
                {teacherSearching ? 'Searching...' : 'Lookup Teacher'}
              </button>
            </form>
            {teacherLookupResult && (
              <div className="bg-[#080507] border border-slate-800 p-4 rounded-2xl space-y-3">
                {teacherLookupResult.status === 'not_found' ? (
                  <p className="text-red-400 text-xs">{teacherLookupResult.message}</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-white">Found: <strong className="text-purple-400">{teacherLookupResult.user.name}</strong> ({teacherLookupResult.user.email})</p>
                    <button type="button" onClick={() => handleConfirmAssignTeacher(teacherLookupResult.user._id)} className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer">Confirm Assignment</button>
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
          <div className="w-full max-w-lg bg-[#130910] border border-blue-500/40 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white uppercase">Lab Settings & Activities</h3>
              <button onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleUpdateLabSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Lab Name</label>
                <input type="text" required value={editLabName} onChange={(e) => setEditLabName(e.target.value)} className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs" />
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

              {/* Dynamic Sessional Activities Manager */}
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-blue-400 uppercase">Lab Activities & Mark Weights</p>
                  <button 
                    type="button" 
                    onClick={() => setEditSessionalActivities([...editSessionalActivities, { category: '', allocatedMarks: 20 }])}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                  >
                    + Add Activity
                  </button>
                </div>
                
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {editSessionalActivities.map((act, index) => (
                    <div key={index} className="flex items-center gap-2 bg-[#080507] p-2 rounded-xl border border-slate-800">
                      <input 
                        type="text" 
                        placeholder="Category Name (e.g. Lab Tasks)" 
                        value={act.category} 
                        onChange={(e) => {
                          const updated = [...editSessionalActivities];
                          updated[index].category = e.target.value;
                          setEditSessionalActivities(updated);
                        }}
                        className="flex-1 px-2.5 py-1.5 bg-[#130910] border border-slate-700 rounded-lg text-white text-xs" 
                        required
                      />
                      <input 
                        type="number" 
                        placeholder="Weight" 
                        value={act.allocatedMarks} 
                        onChange={(e) => {
                          const updated = [...editSessionalActivities];
                          updated[index].allocatedMarks = Number(e.target.value);
                          setEditSessionalActivities(updated);
                        }}
                        className="w-20 px-2 py-1.5 bg-[#130910] border border-slate-700 rounded-lg text-white text-xs font-mono" 
                        min="1"
                        required
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          const updated = editSessionalActivities.filter((_, i) => i !== index);
                          setEditSessionalActivities(updated);
                        }}
                        className="px-2 py-1.5 bg-red-950/80 hover:bg-red-900 text-red-300 rounded-lg text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex gap-3">
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="w-1/2 py-2.5 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer">Cancel</button>
                <button type="submit" disabled={updatingSettings} className="w-1/2 py-2.5 bg-blue-500 hover:bg-blue-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                  {updatingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-red-950/60 space-y-3">
              <p className="text-xs font-bold text-red-400 uppercase">Danger Zone</p>
              <form onSubmit={handleDeleteLabroomSubmit} className="space-y-3">
                {error && <p className="text-red-300 text-xs">{error}</p>}
                <p className="text-xs text-slate-300">Type <strong className="text-white">{labroom.labName}</strong> to confirm deletion:</p>
                <input type="text" value={deleteInputName} onChange={(e) => setDeleteInputName(e.target.value)} placeholder="Enter exact lab name" className="w-full px-3 py-2 bg-[#080507] border border-red-500/40 rounded-xl text-white text-xs" />
                <button type="submit" disabled={deletingLab || deleteInputName.trim() !== labroom.labName.trim()} className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs uppercase font-extrabold rounded-xl cursor-pointer disabled:opacity-50">
                  {deletingLab ? 'Deleting...' : 'Permanently Delete Lab'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 8. Anonymous Feedback / Complaints Modal */}
      {isComplaintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4">
          <div className="w-full max-w-md bg-[#130910] border border-blue-500/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-blue-300 uppercase">Anonymous Complaint Box</h3>
              <button onClick={() => setIsComplaintModalOpen(false)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSendComplaint} className="space-y-3">
              <textarea rows="4" required placeholder="Write your anonymous query or complaint..." value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className="w-full px-3.5 py-2.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs resize-none" />
              <button type="submit" disabled={sendingComplaint} className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50">
                {sendingComplaint ? 'Submitting...' : 'Send Anonymously'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 9. View Complaints Modal (Staff/Admin) */}
      {isViewComplaintsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-blue-500/40 rounded-3xl p-6 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-blue-300 uppercase">Anonymous Submissions</h3>
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
          <div className="w-full max-w-md bg-[#130910] border border-blue-500/55 rounded-3xl p-5 space-y-4 shadow-2xl my-auto text-center">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-blue-400 uppercase font-mono">{selectedActivityItem.item.title} — Uploaded Photo</h3>
              <button onClick={() => setSelectedActivityItem(null)} className="text-slate-400 hover:text-white font-bold cursor-pointer">✕</button>
            </div>

            {selectedActivityItem.scoreData?.file?.url ? (
              <div className="bg-[#080507] border border-slate-800 rounded-2xl p-2 overflow-hidden">
                <img 
                  src={selectedActivityItem.scoreData.file.url} 
                  alt="Activity File" 
                  className="max-h-[60vh] mx-auto rounded-xl border border-slate-700 object-contain" 
                />
              </div>
            ) : (
              <div className="bg-[#080507] border border-slate-800 p-6 rounded-2xl space-y-1">
                <p className="text-[10px] text-slate-400 uppercase">Your Obtained Score</p>
                <p className="text-2xl font-black font-mono text-emerald-400">
                  {(() => {
                    const sScore = (studentMark?.[selectedActivityItem.targetKey] || []).find(e => e.title?.trim().toLowerCase() === selectedActivityItem.item.title?.trim().toLowerCase());
                    if (!sScore) return 'Pending Evaluation';
                    if (sScore.isAbsent) return 'Marked Absent';
                    return `${sScore.obtainedMarks} / ${selectedActivityItem.item.totalMarks}`;
                  })()}
                </p>
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
        <p>© 2026 PUCIT Lab Portal • All Rights Reserved</p>
      </footer>
    </div>
  );
};

export default LabroomDetail;