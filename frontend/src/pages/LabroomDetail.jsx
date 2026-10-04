import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BeakerIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CheckIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FolderIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PaperAirplaneIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  TrophyIcon,
  UserGroupIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';
import NoticeCard from '../components/NoticeCard';
import BypassLimitsPanel from '../components/BypassLimitsPanel';
import GradeBadge from '../components/GradeBadge';
import RoomColorPicker from '../components/RoomColorPicker';
import ExportMenu from '../components/ExportMenu';
import { DEFAULT_ROOM_COLOR } from '../utils/roomColors';

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
  const [busyNoticeId, setBusyNoticeId] = useState('');
  const [showAllNotices, setShowAllNotices] = useState(false);

  // Anonymous Complaint states
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [sendingComplaint, setSendingComplaint] = useState(false);
  const [isViewComplaintsModalOpen, setIsViewComplaintsModalOpen] = useState(false);
  const [complaintsList, setComplaintsList] = useState([]);
  const [complaintUnreadCount, setComplaintUnreadCount] = useState(0);
  const [deletingComplaintId, setDeletingComplaintId] = useState('');
  const [loadingComplaints, setLoadingComplaints] = useState(false);

  // Create student result / graded item sheet modal state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [evaluationMode, setEvaluationMode] = useState(null); // 'full' or 'range'
  const [itemCategory, setItemCategory] = useState('Lab Tasks');
  const [itemTitle, setItemTitle] = useState('');
  const [itemTotalMarks, setItemTotalMarks] = useState(10);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
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

  // Advanced Add Student Modal
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [addModeType, setAddModeType] = useState('shorthand');
  const [studentRollInput, setStudentRollInput] = useState('');
  const [bulkStart, setBulkStart] = useState('');
  const [bulkEnd, setBulkEnd] = useState('');
  const [addDropInput, setAddDropInput] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState('');

  // Add/Drop single-student lookup preview (mirrors ClassroomDetail addDrop flow)
  const [lookupTargetStudent, setLookupTargetStudent] = useState(null);
  const [lookingUpStudent, setLookingUpStudent] = useState(false);

  // Smart Detect / Class Roster lookup state
  const [classDirectoryStudents, setClassDirectoryStudents] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [selectedDirectoryRolls, setSelectedDirectoryRolls] = useState([]);
  const [rejectedRolls, setRejectedRolls] = useState([]);
  const [rejectingRoll, setRejectingRoll] = useState('');

  // Lab Roster / Members Overview Modal
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // Student Profile Popup State
  const [profileStudent, setProfileStudent] = useState(null);
  const [isStudentProfileModalOpen, setIsStudentProfileModalOpen] = useState(false);

  // Lab Settings & Weights modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  // Settings tab: 'general' (details, colour, weights, danger zone) or
  // 'bypass' (per-category bypass caps).
  const [settingsTab, setSettingsTab] = useState('general');
  // TAs cannot open Labroom Settings, but still need to see the bypass caps.
  const [isBypassModalOpen, setIsBypassModalOpen] = useState(false);
  const [editLabName, setEditLabName] = useState('');
  const [editSectionPrefix, setEditSectionPrefix] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState(40);
  // Total solid marks this lab is worth. Activity weights below are percentages
  // OF this number, so it only rescales the marks awarded, never the percentage.
  const [editTotalMarks, setEditTotalMarks] = useState(100);
  const [editPlaceholderTeacher, setEditPlaceholderTeacher] = useState('');
  const [editColorKey, setEditColorKey] = useState(DEFAULT_ROOM_COLOR);
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
      setEditTotalMarks(fetchedLab.totalMarks || 100);
      setEditPlaceholderTeacher(fetchedLab.placeholderTeacherName || '');
    setEditColorKey(fetchedLab.colorKey || DEFAULT_ROOM_COLOR);

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
      setRejectedRolls(res.data?.data?.rejectedRolls || []);
    } catch (err) {
      console.warn('Could not load class prefix directory:', err);
      setClassDirectoryStudents([]);
    } finally {
      setLoadingDirectory(false);
    }
  };

  const handleToggleRejectStudent = async (rollNo) => {
    try {
      setRejectingRoll(rollNo);
      await API.patch(`/labrooms/${labroomId}/smart-reject`, { rollNo });
      const res = await API.get(`/labrooms/${labroomId}/available-students`);
      setClassDirectoryStudents(res.data?.data?.students || []);
      setRejectedRolls(res.data?.data?.rejectedRolls || []);
      setSelectedDirectoryRolls(prev => prev.filter(r => r !== rollNo));
      showToast(rollNo + ' updated in Smart Detect.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update Smart Detect.', 'error');
    } finally {
      setRejectingRoll('');
    }
  };

  const fetchComplaints = async () => {
    try {
      setLoadingComplaints(true);
      const res = await API.get(`/labrooms/${labroomId}/complaints`);
      setComplaintsList(res.data?.data?.complaints || res.data?.complaints || []);
      // The backend returns this viewer's own unread count, so the badge is
      // per-staff-member rather than one shared flag for the whole labroom.
      setComplaintUnreadCount(res.data?.data?.unreadCount || 0);
    } catch {
      console.warn('Failed to fetch complaints');
    } finally {
      setLoadingComplaints(false);
    }
  };

  const markComplaintsRead = async (complaintIds) => {
    try {
      await API.patch(`/labrooms/${labroomId}/complaints/read`, { complaintIds });
      setComplaintUnreadCount(0);
      setComplaintsList((prev) => prev.map((c) => ({ ...c, read: true })));
    } catch {
      // A failed badge clear is cosmetic; do not interrupt the teacher.
    }
  };

  const handleDeleteComplaint = async (complaint) => {
    if (!window.confirm('Delete this anonymous submission? The record is kept only for audit.')) return;
    try {
      setDeletingComplaintId(complaint._id);
      await API.delete(`/labrooms/${labroomId}/complaints/${complaint._id}`);
      setComplaintsList((prev) => prev.filter((c) => c._id !== complaint._id));
      showToast('Submission deleted.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete submission.', 'error');
    } finally {
      setDeletingComplaintId('');
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

  // Editing/removing an existing announcement is narrower than posting one:
  // only the author, this labroom's assigned teacher, or an admin may do it.
  const canManageNotice = (notice) => {
    if (isAdmin) return true;
    if (labroom?.teacher && String(labroom.teacher._id || labroom.teacher) === String(user?._id)) return true;
    if (notice?.author && String(notice.author) === String(user?._id)) return true;
    return false;
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
      await fetchLabroomData();
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
      setEvaluationMode(null);
      setItemTitle('');
      setItemTotalMarks(10);
      setRangeStart('');
      setRangeEnd('');
      showToast('Opening lab result sheet...');

      const sheetState = { totalMarks: tMarks };
      if (evaluationMode === 'range') {
        sheetState.filterRange = { start: Number(rangeStart), end: Number(rangeEnd) };
      }

      navigate(`/labrooms/${labroomId}/sheet/${catKey}/${encodeURIComponent(trimmedTitle)}`, {
        state: sheetState
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
      await API.patch(`/labrooms/${labroomId}/settings`, {
        labName: editLabName.trim(),
        sectionPrefix: editSectionPrefix.trim().toUpperCase(),
        maxCapacity: Number(editMaxCapacity),
        totalMarks: Number(editTotalMarks) || 100,
        placeholderTeacherName: editPlaceholderTeacher.trim(),
        colorKey: editColorKey,
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

  const handleLookupStudentForAddDrop = async (e) => {
    e.preventDefault();
    if (!addDropInput.trim()) return;

    setLookingUpStudent(true);
    setLookupTargetStudent(null);
    setAddStudentError('');

    try {
      const res = await API.post(`/labrooms/${labroomId}/lookup-student`, { rollInput: addDropInput.trim() });
      setLookupTargetStudent(res.data?.data?.student || res.data?.student);
    } catch (err) {
      setAddStudentError(err.response?.data?.message || 'Student record not found.');
    } finally {
      setLookingUpStudent(false);
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
        if (!lookupTargetStudent) throw new Error('Please lookup and verify the student first.');
        await API.post(`/labrooms/add-student-by-roll`, { labroomId, rollInput: lookupTargetStudent.rollNo || addDropInput.trim() });
        showToast(`Student ${lookupTargetStudent.name} enrolled successfully!`);
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
      setLookupTargetStudent(null);
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
      await API.patch('/auth/reset-student-password-staff', { 
        studentId: studentUserId, 
        userId: studentUserId, 
        newPassword: newPassword.trim() 
      });
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

  const [isExportingSheet, setIsExportingSheet] = useState(false);

  // Fetches the result sheet from the server rather than rebuilding it in the
  // browser. The client-side version only emitted the activity columns and the
  // overall percentage, so total obtained marks, grade and grade point were missing
  // even though the backend already computed them correctly. One source of truth.
  //
  // mode: roster = names/ids only, current = activities with marks entered,
  // final = full weighted breakdown.
  const handleExportExcelSheet = async (mode = 'final') => {
    if (isExportingSheet) return;
    setIsExportingSheet(true);
    try {
      const res = await API.get(`/labmarks/export-excel/${labroomId}`, {
        params: { mode },
        responseType: 'blob'
      });

      // Prefer the filename the server chose so it stays in step with the room.
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fileName = match
        ? match[1]
        : `${labroom?.labName || 'Lab'}_${labroom?.sectionPrefix || ''}_Result_Sheet.csv`;

      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast('Result sheet exported successfully!');
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to export lab results file.', 'error');
    } finally {
      setIsExportingSheet(false);
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-dvh overflow-x-hidden lm-canvas lm-acc-lab flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="lm-topline" />
        <div className="lm-ambient" />
        <div className="lm-card rounded-2xl p-8 w-full max-w-xs flex flex-col items-center gap-4 text-center">
          <div className="lm-bar mx-auto"></div>
          <p className="lm-eyebrow font-mono">Syncing lab environment...</p>
        </div>
      </div>
    );
  }

  if (error || !labroom) {
    return (
      <div className="relative min-h-dvh overflow-x-hidden lm-canvas lm-acc-lab flex flex-col items-center justify-center p-4 text-slate-100">
        <div className="lm-topline" />
        <div className="lm-ambient" />
        <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-6 sm:p-8 text-center max-w-sm w-full space-y-4 shadow-xl">
          <ExclamationTriangleIcon className="w-8 h-8 mx-auto text-red-300" />
          <h2 className="font-extrabold text-sm text-slate-100">Lab Connection Error</h2>
          <p className="text-xs text-slate-300 break-words">{error || 'Labroom does not exist.'}</p>
          <Link to="/" className="lm-btn w-full">Dashboard</Link>
        </div>
      </div>
    );
  }

  const activeStudents = (labroom.students || [])
    .filter(s => s && (s._id || s.name))
    .sort((a, b) => {
      const prefix = (labroom.sectionPrefix || '').toUpperCase();
      const ra = String(a.rollNo || '').toUpperCase();
      const rb = String(b.rollNo || '').toUpperCase();
      const pa = ra.startsWith(prefix);
      const pb = rb.startsWith(prefix);
      if (pa !== pb) return pb ? 0 : -1;
      if (pa && pb) {
        const da = parseInt((ra.replace(/\D/g, '') || '').slice(-3), 10) || 99999;
        const db = parseInt((rb.replace(/\D/g, '') || '').slice(-3), 10) || 99999;
        return da - db;
      }
      return ra.localeCompare(rb);
    });
  const totalStudentsCount = activeStudents.length;
  const reversedNotices = [...(labroom?.notices || [])].reverse();
  const latestNotice = reversedNotices[0];

  const sessionalActivitiesList = (labroom.sessionalActivities && labroom.sessionalActivities.length > 0)
    ? labroom.sessionalActivities
    : [{ category: 'Lab Tasks', allocatedMarks: 50 }, { category: 'Vivas', allocatedMarks: 30 }, { category: 'Lab Tests', allocatedMarks: 20 }];

  // Mirrors the weighted model in getLabroomAnalytics: each configured activity
  // contributes its CATEGORY percentage (all that category's marks combined)
//  weighted by allocatedMarks, normalised by the weights actually in play.
//
//  Three things this must get right, because the leaderboard falls back to it
//  whenever the analytics payload has no value for a category:
//   1. Bypassed ("B") entries drop out of BOTH sides - keeping their possible
//      marks would drag the percentage down for a student who was never asked.
//   2. Absent entries still count toward the possible total. Only skipping the
//      earned marks is correct; skipping the possible marks as well inflated
//      everyone else's percentage for that category.
//   3. A category with no marks for this student contributes nothing to either
//      side of the ratio. Folding its weight into the denominator while adding a
//      0% numerator made early-term students look like they had failed.
  const calculateStudentPercentages = (markDoc) => {
    if (!markDoc) return { overall: '0.00', letterGrade: '', gradePoint: 0, categories: {} };

    let totalActiveWeight = 0;
    let weightedEarnedSum = 0;
    const catPercentages = {};

    sessionalActivitiesList.forEach(act => {
      const targetKey = getCategoryTargetKey(act.category);
      const entries = markDoc[targetKey];
      const allocatedWeight = Number(act.allocatedMarks || 0);

      let catObtained = 0;
      let catTotal = 0;
      const items = Array.isArray(entries) ? entries : (entries && entries.title ? [entries] : []);
      items.forEach(item => {
        if (!item || item.isBypassed) return;
        if (!item.isAbsent) catObtained += Number(item.obtainedMarks || 0);
        catTotal += Number(item.totalMarks || 0);
      });

      if (catTotal <= 0) {
        catPercentages[act.category] = '0.00';
        return;
      }

      const catPct = (catObtained / catTotal) * 100;
      catPercentages[act.category] = catPct.toFixed(2);
      if (allocatedWeight > 0) {
        weightedEarnedSum += catPct * allocatedWeight;
        totalActiveWeight += allocatedWeight;
      }
    });

    const overallPct = totalActiveWeight > 0 ? (weightedEarnedSum / totalActiveWeight) : 0;
    return {
      overall: overallPct.toFixed(2),
      // Best-effort local fallback only, for the rare case where the analytics row
      // is missing (e.g. offline). The server value wins whenever it is present,
      // so the two can never disagree about a graded student.
      letterGrade: markDoc.letterGrade || '',
      gradePoint: Number(markDoc.gradePoint ?? 0) || 0,
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
      
      if (match && (match.isAbsent || (match.obtainedMarks !== undefined && match.obtainedMarks !== null && !isNaN(match.obtainedMarks)))) {
        // An absent student counts as 0 earned but STILL occupies their share of
        // the possible total. Skipping them entirely (both sides) let absences
        // inflate the class average, which is the opposite of absent = 0.
        totalObtained += match.isAbsent ? 0 : Number(match.obtainedMarks);
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
      
      if (match && (match.isAbsent || (match.obtainedMarks !== undefined && match.obtainedMarks !== null && !isNaN(match.obtainedMarks)))) {
        // Absent = 0 for the raw mark average too, otherwise the average silently
        // skips every absent student and reads far higher than the class earned.
        totalObtained += match.isAbsent ? 0 : Number(match.obtainedMarks);
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

  // The lab's allocated total solid marks, and the sum of the configured activity
  // percentages. Teachers are not forced to make the percentages add up to
  // exactly 100, so every contribution below is expressed relative to whatever
  // they actually entered - that keeps the displayed marks reconciling with the
  // overall percentage instead of quietly disagreeing with it.
  const labTotalMarks = Number(labroom?.totalMarks) || 100;
  const labWeightTotal = (() => {
    const sum = (Array.isArray(labroom?.sessionalActivities) ? labroom.sessionalActivities : [])
      .reduce((acc, a) => acc + (Number(a.allocatedMarks) || 0), 0);
    return sum > 0 ? sum : 100;
  })();

  // A student's final marks out of the lab total. The analytics row carries them
  // already; derive from the row's percentage if an older payload is missing the
  // field. Reads only from `rankings` so it stays safe to evaluate here, before
  // studentAnalyticsData is declared further down the component body.
  const studentLabMarks = (() => {
    const rankings = labAnalytics?.rankings || [];
    const me = rankings.find(r => (r.student?._id || r.student)?.toString() === user?._id?.toString());
    if (!me) return (0).toFixed(2);
    const rowTotal = Number(me.totalMarks) || labTotalMarks;
    if (me.finalMarks !== undefined && me.finalMarks !== null) return Number(me.finalMarks).toFixed(2);
    const pct = Number(me.overallPercentage ?? me.percentage ?? 0);
    return ((pct / 100) * rowTotal).toFixed(2);
  })();

  const getCategoryClassAverage = (targetKey, act) => {
    const ca = labAnalytics?.classAverages || {};
    const directKey = targetKey + 'Percentage';
    if (ca[directKey] !== undefined && ca[directKey] !== null) return Number(ca[directKey]);

    const normKey = (act?.category || '').toLowerCase().replace(/\s+/g, '') + 'Percentage';
    if (ca[normKey] !== undefined && ca[normKey] !== null) return Number(ca[normKey]);

    const rankings = labAnalytics?.rankings || [];
    if (rankings.length === 0) return 0;
    let sum = 0;
    let count = 0;
    rankings.forEach(r => {
      const v = r[directKey] ?? r[normKey];
      if (v !== undefined && v !== null && !isNaN(Number(v))) {
        sum += Number(v);
        count++;
      }
    });
    return count > 0 ? Number((sum / count).toFixed(2)) : 0;
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
      const val = found[targetKey + 'Percentage'] || found[act.category.toLowerCase() + 'Percentage'] || found[act.category.toLowerCase()] || found[act.category];
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
      // Server-authoritative, with the stored doc as a fallback for records saved
      // before lab grades were cached.
      letterGrade: found.letterGrade || doc.letterGrade || '',
      gradePoint: Number(found.gradePoint ?? doc.gradePoint ?? 0) || 0,
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
        const calcA2 = calculateStudentPercentages(docA);
        const calcB2 = calculateStudentPercentages(docB);
        const catMatchA = Object.keys(calcA2.categories).find(k => k.toLowerCase() === leaderboardFilter.toLowerCase());
        const catMatchB = Object.keys(calcB2.categories).find(k => k.toLowerCase() === leaderboardFilter.toLowerCase());
        scoreA = Number(a[targetKey + 'Percentage'] || a[leaderboardFilter.toLowerCase() + 'Percentage'] || a[leaderboardFilter + 'Percentage'] || calcA2.categories[leaderboardFilter] || (catMatchA ? calcA2.categories[catMatchA] : 0)) || 0;
        scoreB = Number(b[targetKey + 'Percentage'] || b[leaderboardFilter.toLowerCase() + 'Percentage'] || b[leaderboardFilter + 'Percentage'] || calcB2.categories[leaderboardFilter] || (catMatchB ? calcB2.categories[catMatchB] : 0)) || 0;
      }

      return scoreB - scoreA;
    });
  };

  const openStudentProfile = (student) => {
    const rankings = labAnalytics?.rankings || [];
    const studentId = student?._id;

    const sortedRankings = [...rankings].sort((a, b) => {
      const docA = a.marksDoc || a;
      const docB = b.marksDoc || b;
      const calcA = Number(a.overallPercentage || a.percentage || calculateStudentPercentages(docA).overall || 0);
      const calcB = Number(b.overallPercentage || b.percentage || calculateStudentPercentages(docB).overall || 0);
      return calcB - calcA;
    });

    const foundIdx = sortedRankings.findIndex(r => {
      const rid = r.student?._id || r.student || r.studentId;
      return rid?.toString() === studentId?.toString();
    });

    const found = foundIdx >= 0 ? sortedRankings[foundIdx] : null;
    const marksDoc = found?.marksDoc || found || {};

    const studentsInLab = activeStudents.find(s => (s._id || s)?.toString() === studentId?.toString());

    const categPcts = calculateStudentPercentages(marksDoc);
    setProfileStudent({
      _id: student?._id || studentId,
      name: student?.name || studentsInLab?.name || 'Unknown Student',
      rollNo: student?.rollNo || studentsInLab?.rollNo || 'N/A',
      email: student?.email || studentsInLab?.email || '',
      rank: foundIdx >= 0 ? `#${foundIdx + 1}` : 'Pending',
      overall: Number(found?.overallPercentage || found?.percentage || categPcts.overall || 0).toFixed(2),
      // Server-authoritative grade point, with the stored doc as a fallback for
      // records saved before lab grades were cached.
      letterGrade: found?.letterGrade || marksDoc.letterGrade || '',
      gradePoint: Number(found?.gradePoint ?? marksDoc.gradePoint ?? 0) || 0,
      categories: categPcts.categories,
      marksDoc
    });
    setIsStudentProfileModalOpen(true);
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
    <div className="relative min-h-dvh overflow-x-hidden lm-canvas lm-acc-lab flex flex-col justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-5 text-slate-100 selection:bg-orange-300 selection:text-slate-950">

      <div className="lm-topline" />
      <div className="lm-ambient" />

      {toastMessage && (
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 px-4 w-full max-w-sm">
          <div className={`lm-toast flex items-center gap-3 px-4 py-3 ${
            toastType === 'success' ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'
          }`}>
            {toastType === 'success'
              ? <CheckIcon className="w-4 h-4 shrink-0" />
              : <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />}
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-100 break-words min-w-0">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* TOP CONTROLLER BAR */}
      <header className={`lm-card sticky top-2 z-30 w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-4 ${themeColorClass}`}>
        <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link to="/" className="lm-btn-ghost shrink-0">
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Back</span>
            </Link>
            <div className="min-w-0">
              <h1 className="lm-title text-lg sm:text-2xl font-black leading-tight break-words">{labroom.labName}</h1>
              <p className="lm-eyebrow font-mono text-blue-300 mt-0.5 break-words">{labroom.sectionPrefix}</p>
            </div>
          </div>
          <span className={`lm-badge ${badgeColorClass} shrink-0 uppercase`}>
            <BeakerIcon className="w-3.5 h-3.5" />
            Lab
          </span>
        </div>

        <div className="lm-scroll-x -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="flex items-center gap-1.5 min-w-max w-max">
            {user?.role === 'STUDENT' && !isAssignedTa && (
              <button onClick={() => setIsComplaintModalOpen(true)} className="lm-btn-ghost uppercase text-blue-300 border border-blue-500/30">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Complaints
              </button>
            )}
            {isStaffOrAdmin && (
              <>
                <button
                onClick={() => {
                  setIsViewComplaintsModalOpen(true);
                  fetchComplaints().then(() => markComplaintsRead());
                }}
                className="lm-btn-ghost uppercase text-cyan-300 border border-cyan-500/30 relative"
              >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Feedback
                  {complaintUnreadCount > 0 && (
                    <span className="lm-badge border-cyan-400/40 bg-cyan-500/20 text-cyan-200 font-mono">
                      {complaintUnreadCount}
                    </span>
                  )}
                </button>
                <ExportMenu
                  icon={ChartBarIcon}
                  busy={isExportingSheet}
                  buttonClassName="lm-btn-ghost uppercase text-emerald-300 border border-emerald-500/30"
                  items={[
                    { key: 'roster', label: 'Blank Roster', hint: 'Names and roll numbers only, no marks', onClick: () => handleExportExcelSheet('roster') },
                    { key: 'current', label: 'Current Result', hint: 'Only activities that have marks entered', onClick: () => handleExportExcelSheet('current') },
                    { key: 'final', label: 'Final Result', hint: 'Every activity and weighted breakdown', onClick: () => handleExportExcelSheet('final') }
                  ]}
                />
              </>
            )}
            <button onClick={() => setIsMembersModalOpen(true)} className="lm-btn-ghost uppercase text-cyan-300 border border-cyan-500/30">
              <UserGroupIcon className="w-4 h-4" />
              Roster
            </button>
            {isAdmin && <button onClick={() => setIsAssignTeacherModalOpen(true)} className="lm-btn-ghost uppercase text-purple-300 border border-purple-500/30"><PlusIcon className="w-4 h-4" />Instructor</button>}
            {isTeacherOrAdmin && <button onClick={() => setIsTaModalOpen(true)} className="lm-btn-ghost uppercase text-blue-300"><PlusIcon className="w-4 h-4" />TA</button>}
            {isStaffOrAdmin && (
              <>
                <button onClick={() => setIsAddStudentModalOpen(true)} className="lm-btn-ghost uppercase text-blue-300"><PlusIcon className="w-4 h-4" />Student</button>
                <button onClick={() => setIsExcelModalOpen(true)} className="lm-btn-ghost uppercase text-blue-300"><ChartBarIcon className="w-4 h-4" />Upload Sync</button>
                <button onClick={() => setIsItemModalOpen(true)} className="lm-btn uppercase"><PlusIcon className="w-4 h-4" />Evaluation</button>
              </>
            )}
            {isTeacherOrAdmin && <button onClick={() => { setSettingsTab('general'); setIsSettingsModalOpen(true); }} className="lm-btn-ghost uppercase text-slate-200"><Cog6ToothIcon className="w-4 h-4" />Settings</button>}
          {isAssignedTa && !isTeacherOrAdmin && <button type="button" onClick={() => setIsBypassModalOpen(true)} className="lm-btn-ghost uppercase text-slate-200"><ShieldCheckIcon className="w-4 h-4" />Bypass Limits</button>}
          </div>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto my-5 sm:my-6 space-y-4 sm:space-y-6 flex-grow min-w-0">
        
        {/* NOTICE BOARD SECTION */}
        <section className={`lm-card p-4 sm:p-6 space-y-4 ${themeColorClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <MegaphoneIcon className="w-4 h-4 text-orange-300 shrink-0" />
              <h2 className="text-sm sm:text-base font-black text-slate-100 uppercase tracking-wider">Notice Board</h2>
            </div>
            {labroom?.notices?.length > 0 && (
              <button onClick={() => setShowAllNotices(!showAllNotices)} className="lm-chip">
                {showAllNotices ? 'Show Latest Only' : `View All (${labroom.notices.length})`}
              </button>
            )}
          </div>

          {isStaffOrAdmin && (
            <form onSubmit={handlePostNotice} className="lm-inset p-4 space-y-3">
              <input type="text" placeholder="Notice Title" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} required className="lm-field text-sm" />
              <textarea placeholder="Write announcement details..." value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} required rows="2" className="lm-field resize-none text-sm" />
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <label className="cursor-pointer flex items-center gap-2 text-xs text-slate-300 hover:text-slate-100 transition-colors min-w-0">
                  <PaperClipIcon className="w-4 h-4 shrink-0 text-orange-300" />
                  <span className="truncate">{noticeFile ? `Attached: ${noticeFile.name}` : 'Attach Image, PDF, or ZIP'}</span>
                  <input type="file" onChange={(e) => setNoticeFile(e.target.files[0])} className="hidden" accept="image/*,.pdf,.zip" />
                </label>
                <button type="submit" disabled={postingNotice} className="lm-btn shrink-0 w-full sm:w-auto">
                  {postingNotice ? 'Publishing...' : 'Publish Notice'}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {!latestNotice ? (
              <div className="lm-inset p-6 text-center">
                <p className="text-slate-500 text-xs italic">No announcements posted yet.</p>
              </div>
            ) : showAllNotices ? (
              reversedNotices.map((n) => (
                <NoticeCard
                  key={n._id || `${n.createdAt}-${n.title}`}
                  notice={n}
                  canManage={canManageNotice(n)}
                  busy={busyNoticeId === (n._id || '')}
                  onEdit={async ({ title, content }) => {
                    setBusyNoticeId(n._id || '');
                    try {
                      await API.patch(`/labrooms/${labroomId}/notices/${n._id}`, { title, content });
                      await fetchLabroomData();
                      showToast('Notice updated.');
                    } catch (err) {
                      showToast(err.response?.data?.message || 'Failed to update notice.', 'error');
                      throw err;
                    } finally {
                      setBusyNoticeId('');
                    }
                  }}
                  onDelete={async () => {
                    if (!window.confirm('Delete this notice? This cannot be undone.')) return;
                    setBusyNoticeId(n._id || '');
                    try {
                      await API.delete(`/labrooms/${labroomId}/notices/${n._id}`);
                      await fetchLabroomData();
                      showToast('Notice deleted.');
                    } catch (err) {
                      showToast(err.response?.data?.message || 'Failed to delete notice.', 'error');
                    } finally {
                      setBusyNoticeId('');
                    }
                  }}
                />
              ))
            ) : (
              <NoticeCard
                notice={latestNotice}
                compact
                canManage={canManageNotice(latestNotice)}
                busy={busyNoticeId === (latestNotice?._id || '')}
                onEdit={async ({ title, content }) => {
                  setBusyNoticeId(latestNotice?._id || '');
                  try {
                    await API.patch(`/labrooms/${labroomId}/notices/${latestNotice?._id}`, { title, content });
                    await fetchLabroomData();
                    showToast('Notice updated.');
                  } catch (err) {
                    showToast(err.response?.data?.message || 'Failed to update notice.', 'error');
                    throw err;
                  } finally {
                    setBusyNoticeId('');
                  }
                }}
                onDelete={async () => {
                  if (!window.confirm('Delete this notice? This cannot be undone.')) return;
                  setBusyNoticeId(latestNotice?._id || '');
                  try {
                    await API.delete(`/labrooms/${labroomId}/notices/${latestNotice?._id}`);
                    await fetchLabroomData();
                    showToast('Notice deleted.');
                  } catch (err) {
                    showToast(err.response?.data?.message || 'Failed to delete notice.', 'error');
                  } finally {
                    setBusyNoticeId('');
                  }
                }}
              />
            )}
          </div>
        </section>

        {/* NAVIGATION TABS WITH ACTIVITY COUNTS */}
        <div className="lm-card-flat p-2">
          <div className="lm-scroll-x -mx-1 px-1">
            <div className="flex items-center gap-1.5 min-w-max w-max py-0.5">
              <button onClick={() => setActiveTab('overview')} className={`lm-chip ${activeTab === 'overview' ? 'lm-chip-active' : ''}`}>
                <ChartBarIcon className="w-3.5 h-3.5" />
                Overview
              </button>

              {isStaffOrAdmin && (
                <button onClick={() => setActiveTab('leaderboard')} className={`lm-chip ${activeTab === 'leaderboard' ? 'lm-chip-active' : ''}`}>
                  <TrophyIcon className="w-3.5 h-3.5" />
                  Lab Leaderboard
                </button>
              )}

              {sessionalActivitiesList.map((act) => {
                const targetKey = getCategoryTargetKey(act.category);
                const count = (labroom[targetKey] || []).length;
                return (
                  <button key={act.category} onClick={() => setActiveTab(act.category.toLowerCase())} className={`lm-chip ${activeTab === act.category.toLowerCase() ? 'lm-chip-active' : ''}`}>
                    <FolderIcon className="w-3.5 h-3.5" />
                    <span>{act.category}</span>
                    <span className={`lm-badge ${activeTab === act.category.toLowerCase() ? 'bg-slate-900/15 text-slate-950 border-slate-950/30' : 'text-slate-300'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 lm-card p-4 sm:p-6 space-y-5">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-100 uppercase tracking-wider">
                {user?.role === 'STUDENT' && !isAssignedTa ? 'Your Lab Progress & Detailed Breakdown' : 'Lab Performance Summary & Deep Metrics'}
              </h3>
              {user?.role === 'STUDENT' && !isAssignedTa ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="lm-card p-4 sm:p-5 space-y-2 rounded-2xl border-blue-500/30">
                      <p className="text-xs text-blue-400 uppercase font-extrabold tracking-widest">Overall Lab Percentage</p>
                      <p className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-blue-300 tracking-tight">{studentAnalyticsData.overall}%</p>
                      <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
                        Final marks: {studentLabMarks}/{labTotalMarks}
                      </p>
                      <div className="pt-1">
                        <GradeBadge grade={studentAnalyticsData.letterGrade} gradePoint={studentAnalyticsData.gradePoint} />
                      </div>
                    </div>
                    <div className="lm-card p-4 sm:p-5 space-y-2 rounded-2xl border-cyan-500/30">
                      <p className="text-xs text-cyan-400 uppercase font-extrabold tracking-widest">Lab Standing & Rank</p>
                      <p className="text-3xl sm:text-4xl lg:text-5xl font-black font-mono text-cyan-300 tracking-tight">{studentRankInfo.rank} <span className="text-sm text-slate-400 font-normal">/ {studentRankInfo.total}</span></p>
                    </div>
                  </div>

                  <div className="lm-inset p-4 space-y-3">
                    <p className="text-xs font-bold uppercase text-slate-300">Activity Category Breakdown</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {sessionalActivitiesList.map((act, i) => {
                        const catPct = Number(studentAnalyticsData.categories?.[act.category] || 0);
                        const weight = Number(act.allocatedMarks) || 0;
                        // The activity's own percentage resolved against its share
                        // of the lab total, i.e. how many of the lab's marks it
                        // actually contributed.
                        const contrib = (labTotalMarks * (catPct / 100) * (weight / labWeightTotal));
                        return (
                          <div key={i} className="lm-card-flat p-3.5 flex flex-col justify-between space-y-2">
                            <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold truncate">{act.category}</span>
                            <span className="font-mono font-black text-emerald-400 text-xl sm:text-2xl">{catPct.toFixed(2)}%</span>
                            <span className="text-[9px] sm:text-[10px] text-slate-500 font-mono">
                              weight {weight}% of {labTotalMarks} marks
                            </span>
                            <span className="text-[9px] sm:text-[10px] text-slate-300 font-mono">
                              contributes {contrib.toFixed(2)}/{(labTotalMarks * weight / labWeightTotal).toFixed(2)} marks
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
<div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="lm-inset p-4 space-y-1">
                      <p className="text-[10px] sm:text-xs text-blue-400 uppercase font-extrabold tracking-wider">Overall Lab Average %</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-blue-300 break-words">{labAnalytics?.classAverages?.overallLabPercentage ?? labAnalytics?.classAverages?.overallPercentage ?? labAnalytics?.averageOverallPercentage ?? '0.00'}%</p>
                      <p className="text-[10px] sm:text-xs text-slate-400 font-mono">
                        Class average marks: {Number(labAnalytics?.classAverages?.overallMarks ?? 0).toFixed(2)}/{Number(labroom?.totalMarks) || 100}
                      </p>
                    </div>
                    {/* Cohort GPA on the same 4.00 scale as the classroom, so a
                        student's practical and theory grade points can be compared
                        or averaged directly. */}
                    <div className="lm-inset p-4 space-y-1">
                      <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Class Average GPA</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-slate-100">
                        {Number(labAnalytics?.classAverages?.averageGradePoint ?? 0).toFixed(2)}
                        <span className="text-[10px] sm:text-xs text-slate-500 font-bold"> / 4.00</span>
                      </p>
                      <p className="text-[10px] sm:text-xs text-slate-500 font-mono">Mean of student grade points</p>
                    </div>
                    <div className="lm-inset p-4 space-y-1">
                      <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Evaluated Students</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black text-emerald-400 font-mono">{labAnalytics?.rankings?.length || 0} / {totalStudentsCount}</p>
                    </div>
                    <div className="lm-inset p-4 space-y-1">
                      <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold">Pending Grades</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-400 font-mono">{totalPendingCount}</p>
                    </div>
                  </div>
                  <div className="lm-inset p-4 space-y-3">
                    <p className="text-xs font-bold uppercase text-slate-300">Deep Category Breakdown (Lab Averages)</p>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                      {sessionalActivitiesList.map((act, i) => {
                        const targetKey = getCategoryTargetKey(act.category);
                        const avgVal = Number(getCategoryClassAverage(targetKey, act)) || 0;
                        const weight = Number(act.allocatedMarks) || 0;
                        const contrib = (labTotalMarks * (avgVal / 100) * (weight / labWeightTotal));
                        return (
                          <div key={i} className="lm-card-flat p-2.5 min-w-0 space-y-0.5">
                            <span className="text-[10px] sm:text-xs text-slate-400 block uppercase truncate">{act.category} Avg</span>
                            <span className="font-mono font-bold text-blue-400 text-sm">{avgVal.toFixed(2)}%</span>
                            <span className="block text-[9px] sm:text-[10px] text-slate-500 font-mono">
                              weight {weight}% of {labTotalMarks}
                            </span>
                            <span className="block text-[9px] sm:text-[10px] text-slate-300 font-mono">
                              class avg {contrib.toFixed(2)}/{(labTotalMarks * weight / labWeightTotal).toFixed(2)} marks
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* LAB PROFILE BOX */}
            <div className="relative lm-card p-4 sm:p-6 flex flex-col justify-between overflow-hidden">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="p-2 lm-card-flat text-blue-300 flex items-center justify-center shrink-0">
                      <BeakerIcon className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Lab Profile</h3>
                  </div>
                  <span className="lm-badge text-[10px] font-mono text-blue-300 bg-blue-500/10 border-blue-500/30 uppercase break-all">
                    {labroom.sectionPrefix}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider shrink-0">Lab Code</span>
                    <strong className="text-cyan-400 font-mono font-bold min-w-0 text-right break-all">{labroom.sectionPrefix}-{labroomId.slice(-4).toUpperCase()}</strong>
                  </div>

                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider shrink-0">Instructor</span>
                    <strong className="text-slate-100 font-bold min-w-0 text-right break-words">{labroom.teacher?.name || labroom.placeholderTeacherName || 'TBA'}</strong>
                  </div>

                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider shrink-0">Section</span>
                    <strong className="text-blue-300 font-mono font-bold min-w-0 text-right break-all">{labroom.sectionPrefix}</strong>
                  </div>

                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider shrink-0">Enrollment</span>
                    <div className="flex items-center gap-1.5 font-mono min-w-0 justify-end">
                      <span className="text-emerald-400 font-black">{totalStudentsCount}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-300">{labroom.maxCapacity || 40} Max</span>
                    </div>
                  </div>

                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="text-slate-400 uppercase font-extrabold text-[10px] tracking-wider shrink-0">TAs Assigned</span>
                    <strong className="text-cyan-400 font-mono font-bold min-w-0 text-right break-words">{(labroom.tas || []).length} Active TAs</strong>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button onClick={() => setIsMembersModalOpen(true)} className="lm-btn w-full">
                  <UserGroupIcon className="w-4 h-4" />
                  <span>View Full Lab Roster</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB VIEW */}
        {activeTab === 'leaderboard' && isStaffOrAdmin && (
          <div className="lm-card p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <TrophyIcon className="w-4 h-4 text-orange-300 shrink-0" />
                  Lab Leaderboard & Standings
                </h3>
                <p className="text-xs text-slate-400 mt-1">Rankings across all students evaluated in this lab.</p>
              </div>

              <div className="lm-scroll-x -mx-1 px-1 w-full sm:w-auto sm:mx-0 sm:px-0">
                <div className="flex items-center gap-1.5 min-w-max w-max">
                  {[
                    { key: 'overall', label: 'Overall' },
                    ...sessionalActivitiesList.map(a => ({ key: a.category.toLowerCase(), label: a.category }))
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setLeaderboardFilter(filter.key)}
                      className={`lm-chip ${leaderboardFilter === filter.key ? 'lm-chip-active' : ''}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lm-scroll-x rounded-xl">
              <table className="lm-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Roll Number</th>
                    <th>Student Name</th>
                    <th>Grade / GPA</th>
                    <th className="text-right">Score Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedLeaderboard().length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-10 text-slate-500 italic">No lab evaluation rankings generated yet. Start grading students to populate leaderboard.</td>
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
                        const calcEntry = calculateStudentPercentages(doc);
                        const catMatch = Object.keys(calcEntry.categories).find(k => k.toLowerCase() === leaderboardFilter.toLowerCase());
                        currentScore = entry[targetKey + 'Percentage'] || entry[leaderboardFilter.toLowerCase() + 'Percentage'] || entry[leaderboardFilter + 'Percentage'] || calcEntry.categories[leaderboardFilter] || (catMatch ? calcEntry.categories[catMatch] : 0) || 0;
                      }

                      return (
                        <tr key={idx}>
                          <td className="font-mono font-bold text-blue-400 whitespace-nowrap">
                            {idx === 0 ? <span className="inline-flex items-center gap-1"><StarIcon className="w-3.5 h-3.5 text-orange-300" />#1</span> : idx === 1 ? <span className="inline-flex items-center gap-1"><StarIcon className="w-3.5 h-3.5 text-orange-200" />#2</span> : idx === 2 ? <span className="inline-flex items-center gap-1"><StarIcon className="w-3.5 h-3.5 text-slate-400" />#3</span> : `#${idx + 1}`}
                          </td>
                          <td className="font-mono text-cyan-400 font-bold break-all">{studentRoll}</td>
                          <td className="text-slate-100 font-medium">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="truncate min-w-0">{studentName}</span>
                              {isStaffOrAdmin && (
                                <button type="button" onClick={() => openStudentProfile(studentObj)} className="lm-btn-ghost shrink-0 text-[9px] px-2 py-1">
                                  <EyeIcon className="w-3.5 h-3.5" />
                                  Profile
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <GradeBadge grade={entry.letterGrade || doc.letterGrade} gradePoint={entry.gradePoint ?? doc.gradePoint ?? 0} compact />
                          </td>
                          <td className="font-mono font-extrabold text-emerald-400 text-right whitespace-nowrap">
                            {Number(currentScore || 0).toFixed(2)}%
                            {leaderboardFilter === 'overall' && (
                              <span className="block text-[9px] sm:text-[10px] text-slate-400 font-normal">
                                {Number(entry.finalMarks ?? (Number(currentScore || 0) / 100) * (Number(labroom?.totalMarks) || 100)).toFixed(2)}/{Number(entry.totalMarks) || Number(labroom?.totalMarks) || 100} marks
                              </span>
                            )}
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
            <div key={cat} className="lm-card p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-3">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-100 uppercase tracking-wider min-w-0 break-words">{cat} Activity Portal</h3>
                <span className="text-xs font-mono text-slate-400">Allocated Weight: <strong className="text-blue-400">{Number(act.allocatedMarks) || 0}%</strong> of {labTotalMarks} marks</span>
              </div>
              {itemsList.length === 0 ? (
                <div className="lm-inset p-6 text-center">
                  <p className="text-slate-500 text-xs italic">No {cat.toLowerCase()} created yet.</p>
                </div>
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
                    const hasFile = studentItemScore?.file && studentItemScore.file.url;

                    return (
                      <div
                        key={idx}
                        className="lm-card-flat hover:border-white/20 hover:-translate-y-px p-4 sm:p-5 space-y-4 transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full bg-orange-300 shrink-0"></span>
                              <h4 className="text-slate-100 font-black text-sm sm:text-base tracking-wide min-w-0 break-words">{item.title}</h4>
                            </div>
                            <span className="lm-badge font-mono shrink-0">
                              {total} Marks
                            </span>
                          </div>

                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="grid grid-cols-2 gap-3 lm-inset p-3.5">
                              <div className="space-y-1 min-w-0">
                                <div>
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-extrabold tracking-wider">Your Score</span>
                                  <span className="font-mono text-emerald-400 font-black text-sm break-words">
                                    {studentItemScore ? (studentItemScore.isAbsent ? 'Marked Absent' : `${obtained} / ${total}`) : 'Pending'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-white/5">
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-extrabold tracking-wider">Class Avg Score</span>
                                  <span className="font-mono text-cyan-400 font-bold text-xs">
                                    {itemAvgRaw} / {total}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right space-y-1 min-w-0">
                                <div>
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-extrabold tracking-wider">Your %</span>
                                  <span className="font-mono text-blue-400 font-black text-sm break-words">
                                    {/* Absent is a real 0%, not missing data - showing "N/A" hid a genuine zero. */}
                                     {studentItemScore
                                        ? studentItemScore.isBypassed
                                          ? 'Bypassed'
                                          : `${studentPercentage}%`
                                        : 'Pending'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-white/5">
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-extrabold tracking-wider">Class Avg %</span>
                                  <span className="font-mono text-cyan-400 font-bold text-xs">
                                    {itemAvgPct}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="lm-inset p-3.5 space-y-2 text-xs">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-400 font-bold uppercase shrink-0">Class Average:</span>
                                <strong className="text-cyan-400 font-mono text-right min-w-0 break-words">{itemAvgPct}% ({itemAvgRaw} / {total})</strong>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-400 font-bold uppercase shrink-0">Grading Progress:</span>
                                <span className="font-mono text-emerald-400 font-bold text-right min-w-0">{gradedCount} / {totalStudentsCount} Evaluated</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Action Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/5">
                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="w-full flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] text-slate-500 italic">Submission Status Active</span>
                              {hasFile && (
                                <button
                                  onClick={() => setSelectedActivityItem({ item, targetKey, category: cat, scoreData: studentItemScore })}
                                  className="lm-btn-ghost text-blue-300 border border-blue-500/30"
                                >
                                  <PaperClipIcon className="w-4 h-4" />
                                  View Your Attempt
                                </button>
                              )}
                            </div>
                          ) : (
                            isStaffOrAdmin && (
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full min-w-0">
                                {ungradedCount > 0 ? (
                                  <button
                                    onClick={() => handleTabletClick(item, targetKey, cat, true)}
                                    className="lm-btn-ghost flex-1 text-amber-300 border border-amber-500/30"
                                  >
                                    <ExclamationTriangleIcon className="w-4 h-4" />
                                    Grade Remaining ({ungradedCount})
                                  </button>
                                ) : (
                                  <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-[10px] sm:text-xs font-mono font-bold uppercase text-emerald-300">
                                    <CheckIcon className="w-4 h-4" />
                                    All Graded
                                  </span>
                                )}
                                <button
                                  onClick={() => handleTabletClick(item, targetKey, cat, false)}
                                  className="lm-btn-ghost flex-1 text-slate-100"
                                >
                                  Full Sheet
                                  <ArrowRightIcon className="w-4 h-4" />
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
        <div className="lm-scrim">
          <div className="lm-modal lm-modal-wide p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-cyan-300 uppercase min-w-0 break-words">Lab Roster & Hierarchy</h3>
              <button onClick={() => setIsMembersModalOpen(false)} aria-label="Close" title="Close" className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            <div className="max-h-[55vh] sm:max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              <div className="space-y-1.5">
                <p className="text-[10px] sm:text-xs text-blue-400 uppercase font-extrabold tracking-wider">Instructor</p>
                <div className="lm-card-flat p-3.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-slate-100 font-bold truncate">{labroom.teacher?.name || labroom.placeholderTeacherName || 'TBA'}</p>
                    <p className="font-mono text-blue-300 break-all">{labroom.teacher?.email || 'Primary Instructor'}</p>
                  </div>
                  <span className="lm-badge text-blue-400 bg-blue-500/10 border-blue-500/30 shrink-0">Instructor</span>
                </div>
              </div>

              {(labroom.tas || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] sm:text-xs text-cyan-400 uppercase font-extrabold tracking-wider">Teaching Assistants (TAs)</p>
                  {(labroom.tas || []).map((ta, i) => (
                    <div key={i} className="lm-card-flat p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-slate-100 font-bold truncate">{ta.name || 'TA Member'}</p>
                        <p className="font-mono text-cyan-400 break-all">{ta.rollNo || ta.email || 'N/A'}</p>
                      </div>
                      <span className="lm-badge text-cyan-300 bg-cyan-500/10 border-cyan-500/30 shrink-0">TA</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-extrabold tracking-wider">Enrolled Students ({activeStudents.length})</p>
                {activeStudents.map((st, i) => (
                  <div key={i} className="lm-card-flat p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-slate-100 font-bold break-words">{st.name}</p>
                      <p className="font-mono text-cyan-400 break-all">{st.rollNo}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                      {isStaffOrAdmin && (
                        <>
                          <button onClick={() => openStudentProfile(st)} title="View Profile" aria-label="View Profile" className="lm-btn-ghost px-2 py-1.5 text-[10px]">
                            <EyeIcon className="w-3.5 h-3.5" />
                            Profile
                          </button>
                          <button onClick={() => handleStaffResetStudentPassword(st._id, st.name)} title="Reset Password" aria-label="Reset Password" className="lm-btn-ghost px-2 py-1.5 text-[10px]">
                            <KeyIcon className="w-3.5 h-3.5" />
                            Reset
                          </button>
                          <button onClick={() => handleRemoveStudent(st._id, st.name)} title="Remove Student" aria-label="Remove Student" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-500/40 transition-all cursor-pointer shrink-0">
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => setIsMembersModalOpen(false)} className="lm-btn-ghost w-full uppercase">Close Roster</button>
          </div>
        </div>
      )}

      {/* STUDENT PROFILE POPUP (LAB) */}
      {isStudentProfileModalOpen && profileStudent && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-lg p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
              <h3 className="text-base font-extrabold text-blue-300 uppercase flex items-center gap-2 min-w-0 break-words">
                <EyeIcon className="w-4 h-4 shrink-0" />
                Student Profile
              </h3>
              <button type="button" onClick={() => setIsStudentProfileModalOpen(false)} aria-label="Close" title="Close" className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-14 w-14 shrink-0 rounded-2xl lm-badge !px-0 bg-gradient-to-br from-orange-200 to-orange-400 text-xl font-black text-slate-950 flex items-center justify-center">
                {(profileStudent.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="text-slate-100 font-bold text-lg truncate">{profileStudent.name}</h4>
                <p className="text-slate-400 font-mono text-xs">Roll: <span className="text-cyan-300 break-all">{profileStudent.rollNo}</span></p>
                {profileStudent.email && <p className="text-slate-500 font-mono text-[10px] truncate">{profileStudent.email}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="lm-inset p-3 text-center">
                <p className="text-[10px] sm:text-xs text-blue-400 uppercase font-extrabold tracking-wider">Lab Rank</p>
                <p className="text-slate-100 font-black text-xl sm:text-2xl font-mono">{profileStudent.rank}</p>
              </div>
              <div className="lm-inset p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-extrabold tracking-wider">Overall</p>
                <p className="text-emerald-400 font-black text-xl sm:text-2xl font-mono">{profileStudent.overall}%</p>
              </div>
            </div>

            <div>
              <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <PencilSquareIcon className="w-4 h-4 text-orange-300 shrink-0" />
                Marks in All Activities
              </h5>
              <div className="space-y-3 max-h-[32vh] overflow-y-auto pr-1">
                {sessionalActivitiesList.map((act) => {
                  const targetKey = getCategoryTargetKey(act.category);
                  const itemsList = labroom[targetKey] || [];
                  if (itemsList.length === 0) return null;
                  const mdoc = profileStudent.marksDoc || {};
                  const catScores = mdoc[targetKey] || [];
                  const catPct = profileStudent.categories?.[act.category];
                  return (
                    <div key={act.category} className="lm-card-flat p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-blue-400 min-w-0 truncate">{act.category}</p>
                        {catPct !== undefined && (
                          <span className="text-[10px] sm:text-xs font-mono font-bold text-cyan-300 shrink-0">{catPct}%</span>
                        )}
                      </div>
                      {itemsList.map((item, idx) => {
                        const score = (Array.isArray(catScores) ? catScores : []).find(s => s.title?.trim().toLowerCase() === item.title?.trim().toLowerCase());
                        const obtained = score && !score.isAbsent ? score.obtainedMarks : null;
                        const total = Number(item.totalMarks || 0);
                        return (
                          <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-300 truncate min-w-0">{item.title}</span>
                            <span className={`font-mono font-bold shrink-0 ml-2 ${obtained === null ? 'text-slate-600' : score.isAbsent ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {score && score.isAbsent ? 'ABSENT' : obtained === null ? 'Ungraded' : `${obtained} / ${total}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Create Result Sheet Modal */}
      {isItemModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-blue-400 uppercase min-w-0 break-words">Create Evaluation Item</h3>
              <button onClick={() => { setIsItemModalOpen(false); setEvaluationMode(null); }} aria-label="Close" title="Close" className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {!evaluationMode ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">Select evaluation spread configuration:</p>
                <button 
                  onClick={() => setEvaluationMode('full')} 
                  className="lm-inset hover:border-blue-500/40 hover:-translate-y-px p-4 text-left transition-all cursor-pointer space-y-1 w-full"
                >
                  <p className="text-xs font-bold text-slate-100 uppercase">1. Full Class Spreadsheet</p>
                  <p className="text-[10px] sm:text-xs text-slate-400">Generates or opens the grading sheet for all enrolled students in the lab.</p>
                </button>
                <button 
                  onClick={() => setEvaluationMode('range')} 
                  className="lm-inset hover:border-blue-500/40 hover:-translate-y-px p-4 text-left transition-all cursor-pointer space-y-1 w-full"
                >
                  <p className="text-xs font-bold text-slate-100 uppercase">2. Select From a Range</p>
                  <p className="text-[10px] sm:text-xs text-slate-400">Filters sheet rows to a specific numeric suffix or ID range (e.g., 1 to 25).</p>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateAndOpenSheet} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Category</label>
                  <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className="lm-field uppercase font-mono">
                    {sessionalActivitiesList.map(act => (
                      <option key={act.category} value={act.category}>{act.category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Item Title</label>
                  <input type="text" required placeholder="e.g. Lab Task 1" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} className="lm-field" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Total Marks</label>
                  <input type="number" required min="1" value={itemTotalMarks} onChange={(e) => setItemTotalMarks(e.target.value)} className="lm-field font-mono" />
                </div>

                {evaluationMode === 'range' && (
                  <div className="grid grid-cols-2 gap-3 lm-inset p-3">
                    <div className="min-w-0">
                      <label className="block text-[10px] sm:text-xs font-bold uppercase text-slate-400 mb-1">Start #</label>
                      <input type="number" required placeholder="1" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="lm-field font-mono" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[10px] sm:text-xs font-bold uppercase text-slate-400 mb-1">End #</label>
                      <input type="number" required placeholder="25" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="lm-field font-mono" />
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={() => setEvaluationMode(null)} className="lm-btn-ghost w-full sm:w-1/2 uppercase">
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back
                  </button>
                  <button type="submit" disabled={creatingItem} className="lm-btn w-full sm:w-1/2">
                    {creatingItem ? 'Opening...' : 'Open Sheet'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 3. Excel Upload Sync Modal */}
      {isExcelModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-blue-300 uppercase flex items-center gap-2 min-w-0 break-words">
                <ChartBarIcon className="w-4 h-4 shrink-0" />
                Sync Lab Marks via Excel/CSV
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            {syncReport ? (
              <div className="space-y-4">
                <div className="lm-inset p-4 bg-emerald-950/60 border border-emerald-500/40 space-y-2">
                  <p className="text-emerald-300 font-bold text-xs flex items-center gap-2">
                    <CheckIcon className="w-4 h-4 shrink-0" />
                    Sync Complete Successfully!
                  </p>
                  <p className="text-xs text-slate-300">Total Rows Processed: <strong className="font-mono text-white">{syncReport.totalProcessed || 0}</strong></p>
                  <p className="text-xs text-slate-300">Successfully Updated: <strong className="font-mono text-emerald-400">{syncReport.updatedCount || 0}</strong></p>
                  {syncReport.errors?.length > 0 && (
                    <p className="text-xs text-amber-300">Warnings/Skipped: {syncReport.errors.length}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} className="lm-btn w-full">Done</button>
              </div>
            ) : (
              <form onSubmit={handleExcelSyncSubmit} className="space-y-4">
                <div>
                  <label className="lm-eyebrow block mb-1.5">Category</label>
                  <select value={excelCategory} onChange={(e) => setExcelCategory(e.target.value)} className="lm-field uppercase font-mono">
                    {sessionalActivitiesList.map(act => (
                      <option key={act.category} value={act.category}>{act.category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lm-eyebrow block mb-1.5">Evaluation Title</label>
                  <input type="text" required placeholder="e.g. Lab Task 1 or Viva 1" value={excelTitle} onChange={(e) => setExcelTitle(e.target.value)} className="lm-field" />
                </div>
                <div>
                  <label className="lm-eyebrow block mb-1.5">Total Marks</label>
                  <input type="number" required min="1" value={excelTotalMarks} onChange={(e) => setExcelTotalMarks(e.target.value)} className="lm-field font-mono" />
                </div>
                <div>
                  <label className="lm-eyebrow block mb-1.5">Upload CSV / Excel File</label>
                  <input type="file" required accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => setExcelFile(e.target.files[0])} className="lm-field file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-700 file:text-slate-100 hover:file:bg-slate-600 cursor-pointer" />
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 leading-relaxed">File must include columns for Roll Number / Reg ID and Marks Obtained.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
                  <button type="button" onClick={() => setIsExcelModalOpen(false)} className="lm-btn-ghost w-full sm:w-1/2 uppercase">Cancel</button>
                  <button type="submit" disabled={syncingExcel} className="lm-btn w-full sm:w-1/2">
                    {syncingExcel ? 'Syncing...' : 'Upload & Sync'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. Supercharged Add Student Modal */}
      {isAddStudentModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-lg p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-100 uppercase">Enroll Students</h3>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-1 break-words">Choose your preferred quick-entry method for section <strong className="text-blue-400 font-mono break-all">{labroom?.sectionPrefix}</strong></p>
              </div>
              <button type="button" aria-label="Close" title="Close" onClick={() => { setIsAddStudentModalOpen(false); setLookupTargetStudent(null); setAddDropInput(''); }} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            {addStudentError && <div className="lm-inset p-3 bg-red-950/60 border border-red-500/40 text-red-300 text-xs">{addStudentError}</div>}
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button type="button" onClick={() => setAddModeType('shorthand')} className={`lm-chip justify-center ${addModeType === 'shorthand' ? 'lm-chip-active' : ''}`}>1. Shorthand</button>
              <button type="button" onClick={() => setAddModeType('range')} className={`lm-chip justify-center ${addModeType === 'range' ? 'lm-chip-active' : ''}`}>2. Range</button>
              <button type="button" onClick={() => setAddModeType('batch')} className={`lm-chip justify-center ${addModeType === 'batch' ? 'lm-chip-active' : ''}`}>3. Add/Drop</button>
              <button type="button" onClick={() => setAddModeType('smartDetect')} className={`lm-chip justify-center ${addModeType === 'smartDetect' ? 'lm-chip-active' : ''}`}>
                <span className="whitespace-nowrap">4. Smart Add</span>
                <span className={`lm-badge text-[9px] font-mono ${addModeType === 'smartDetect' ? 'bg-slate-900/15 text-slate-950 border-slate-950/30' : 'text-emerald-300'}`}>{classDirectoryStudents.filter(st => activeStudents.some(as => as._id?.toString() === st._id?.toString())).length}</span>
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-4">
              {addModeType === 'shorthand' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase text-slate-400">Quick Suffix Entry (e.g. 3, 4, 56)</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. 3, 4, 56, 23" 
                    value={studentRollInput} 
                    onChange={(e) => setStudentRollInput(e.target.value)} 
                    className="lm-field font-mono uppercase" 
                  />
                  <p className="text-[10px] sm:text-xs text-slate-500 leading-tight">
                    Quickly maps digits into full roll numbers using <span className="font-mono text-blue-400">{labroom?.sectionPrefix}</span> prefix (e.g., <span className="font-mono text-cyan-400">3</span> becomes <span className="font-mono text-blue-400">{labroom?.sectionPrefix}003</span>).
                  </p>
                </div>
              )}

              {addModeType === 'range' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Start Suffix / #</label>
                      <input type="number" required placeholder="1" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} className="lm-field font-mono" />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">End Suffix / #</label>
                      <input type="number" required placeholder="40" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} className="lm-field font-mono" />
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500">
                    Bulk enrolls a continuous numeric sequence under <span className="font-mono text-blue-400">{labroom?.sectionPrefix}</span>.
                  </p>
                </div>
              )}

              {addModeType === 'batch' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase text-slate-400">Full Roll Number or Registration No</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="e.g. BITF26A047 or 2023123" 
                        value={addDropInput} 
                        onChange={(e) => { setAddDropInput(e.target.value); setLookupTargetStudent(null); }} 
                        className="lm-field flex-1 min-w-0 font-mono uppercase" 
                      />
                      <button 
                        type="button" 
                        onClick={handleLookupStudentForAddDrop} 
                        disabled={lookingUpStudent || !addDropInput.trim()}
                        className="lm-btn-ghost shrink-0 text-blue-300 border border-blue-500/30"
                      >
                        <MagnifyingGlassIcon className="w-4 h-4" />
                        {lookingUpStudent ? 'Searching...' : 'Lookup'}
                      </button>
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-500 leading-relaxed">Enter the student's full roll number or registration number, then Lookup. Verify their info and status before confirming enrollment.</p>
                  </div>

                  {lookupTargetStudent && (
                    <div className="lm-inset p-4 space-y-2 text-xs border-emerald-500/40 bg-emerald-950/25">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 uppercase shrink-0">Student Name:</span>
                        <strong className="text-slate-100 min-w-0 text-right break-words">{lookupTargetStudent.name}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 uppercase shrink-0">Email:</span>
                        <strong className="text-blue-300 min-w-0 text-right break-all">{lookupTargetStudent.personalNotificationEmail || lookupTargetStudent.email || 'N/A'}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 uppercase shrink-0">Roll / Reg No:</span>
                        <strong className="font-mono text-cyan-400 min-w-0 text-right break-all">{lookupTargetStudent.rollNo}{lookupTargetStudent.registrationNo && lookupTargetStudent.registrationNo !== 'N/A' ? ` / ${lookupTargetStudent.registrationNo}` : ''}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 uppercase shrink-0">Status:</span>
                        <span className={`lm-badge ${lookupTargetStudent.isAlreadyEnrolled ? 'bg-amber-950/70 text-amber-300 border-amber-500/40' : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'}`}>
                          {lookupTargetStudent.isAlreadyEnrolled ? 'Already Enrolled' : lookupTargetStudent.isAddDrop ? 'Add/Drop Senior' : 'Regular Prefix Match'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {addModeType === 'smartDetect' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <span>Matching Prefix: <strong className="text-blue-400 font-mono">{labroom?.sectionPrefix}</strong></span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="lm-badge bg-emerald-950/70 border-emerald-500/40 text-emerald-300"><CheckIcon className="w-3.5 h-3.5" />Enrolled <b className="font-mono">{classDirectoryStudents.filter(st => activeStudents.some(as => as._id?.toString() === st._id?.toString())).length}</b></span>
                      <span className="lm-badge bg-blue-950/70 border-blue-500/40 text-blue-300"><CheckCircleIcon className="w-3.5 h-3.5" />Available <b className="font-mono">{classDirectoryStudents.filter(st => !activeStudents.some(as => as._id?.toString() === st._id?.toString())).length}</b></span>
                      <button 
                        type="button" 
                        onClick={() => {
                          const unenrolled = classDirectoryStudents
                            .filter(st => !activeStudents.some(as => as._id?.toString() === st._id?.toString()))
                            .map(st => st.rollNo);
                          setSelectedDirectoryRolls(unenrolled);
                        }} 
                        className="lm-btn-ghost text-blue-300 border border-blue-500/30"
                      >
                        Select All Unenrolled
                      </button>
                    </div>
                  </div>

                  <div className="lm-inset max-h-56 overflow-y-auto space-y-2 p-3">
                    {loadingDirectory ? (
                      <div className="flex flex-col items-center gap-3 py-6 text-center">
                        <div className="lm-bar"></div>
                        <p className="text-xs text-slate-500">Scanning class directory...</p>
                      </div>
                    ) : classDirectoryStudents.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 py-6 italic">No registered user accounts found matching prefix {labroom?.sectionPrefix}. Try shorthand or range mode.</p>
                    ) : (
                      [...classDirectoryStudents]
                        .sort((a, b) => {
                          const aEnr = activeStudents.some(as => as._id?.toString() === a._id?.toString());
                          const bEnr = activeStudents.some(as => as._id?.toString() === b._id?.toString());
                          return Number(aEnr) - Number(bEnr);
                        })
                        .map((st, i) => {
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
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                              alreadyEnrolled 
                                ? 'bg-slate-950/40 border-slate-900/60 opacity-40 cursor-not-allowed select-none' 
                                : isSelected 
                                  ? 'bg-blue-950/60 border-blue-500/50 text-slate-100 cursor-pointer' 
                                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 truncate">
                              <input 
                                type="checkbox" 
                                checked={isSelected || alreadyEnrolled} 
                                disabled={alreadyEnrolled}
                                onChange={() => {}} 
                                className={`rounded accent-blue-500 shrink-0 ${alreadyEnrolled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`} 
                              />
                              <div className="truncate min-w-0">
                                <p className={`font-bold truncate ${alreadyEnrolled ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{st.name}</p>
                                <p className="font-mono text-cyan-400 text-[10px] sm:text-[11px] break-all">{st.rollNo}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`lm-badge ${alreadyEnrolled ? 'text-slate-500' : 'text-slate-400'}`}>
                                {alreadyEnrolled ? 'Enrolled' : 'Available'}
                              </span>
                              {!alreadyEnrolled && (
                                <button 
                                  type="button"
                                  disabled={rejectingRoll === st.rollNo}
                                  onClick={(e) => { e.stopPropagation(); handleToggleRejectStudent(st.rollNo); }}
                                  aria-label="âœ• Reject"
                                  title="Hide from Smart Add (manual enrollment still available)"
                                  className="lm-btn-ghost !px-2 !py-0.5 text-red-300 border border-red-500/40"
                                >
                                  <XMarkIcon className="w-3.5 h-3.5" />
                                  {rejectingRoll === st.rollNo ? 'â€¦' : 'Reject'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {rejectedRolls.length > 0 && (
                    <div className="lm-inset p-3 space-y-2 border-red-500/40 bg-red-950/40">
                      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-300 flex items-start gap-1.5">
                        <ExclamationTriangleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Hidden from Smart Add ({rejectedRolls.length}) â€” add these manually if needed</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {rejectedRolls.map((roll, i) => (
                          <button 
                            key={i} 
                            type="button" 
                            disabled={rejectingRoll === roll}
                            onClick={() => handleToggleRejectStudent(roll)}
                            aria-label={`â†º ${roll}`}
                            title="Restore into Smart Add"
                            className="lm-btn-ghost !px-2 !py-0.5 text-red-300 border border-red-500/30 font-mono !text-[10px]"
                          >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                            {rejectingRoll === roll ? 'â€¦' : roll}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] sm:text-xs text-slate-500">Selected: <strong className="text-emerald-400 font-mono">{selectedDirectoryRolls.length}</strong> new students ready to enroll.</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
                <button type="button" onClick={() => { setIsAddStudentModalOpen(false); setLookupTargetStudent(null); setAddDropInput(''); }} className="lm-btn-ghost w-full sm:w-1/2 uppercase">Cancel</button>
                <button type="submit" disabled={addingStudent || (addModeType === 'batch' && !lookupTargetStudent)} className="lm-btn w-full sm:w-1/2">
                  {addingStudent ? 'Processing...' : (addModeType === 'batch' ? 'Confirm Enrollment' : 'Enroll Students')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add TA Modal */}
      {isTaModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-blue-300 uppercase flex items-center gap-2 min-w-0 break-words">
                <UserGroupIcon className="w-4 h-4 shrink-0" />
                Assign Teaching Assistant
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => setIsTaModalOpen(false)} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleLookupTa} className="space-y-3">
              <input type="text" required placeholder="Enter student roll number" value={taRollNo} onChange={(e) => setTaRollNo(e.target.value)} className="lm-field font-mono uppercase" />
              <button type="submit" disabled={taSearching} className="lm-btn-ghost w-full text-blue-300 border border-blue-500/30">
                <MagnifyingGlassIcon className="w-4 h-4" />
                {taSearching ? 'Searching...' : 'Lookup Student'}
              </button>
            </form>
            {taLookupResult && (
              <div className="lm-inset p-4 space-y-3">
                {taLookupResult.status === 'not_found' ? (
                  <p className="text-red-300 text-xs flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
                    <span>{taLookupResult.message}</span>
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-100 break-words">Found: <strong className="text-blue-400">{taLookupResult.user.name}</strong> ({taLookupResult.user.rollNo})</p>
                    <button type="button" onClick={() => handleConfirmAddTa(taLookupResult.user._id)} className="lm-btn w-full uppercase">Assign as TA</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Assign Instructor Modal */}
      {isAssignTeacherModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-purple-300 uppercase flex items-center gap-2 min-w-0 break-words">
                <AcademicCapIcon className="w-4 h-4 shrink-0" />
                Assign Instructor
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => setIsAssignTeacherModalOpen(false)} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleLookupTeacher} className="space-y-3">
              <input type="text" required placeholder="Enter teacher email or ID" value={teacherRollNo} onChange={(e) => setTeacherRollNo(e.target.value)} className="lm-field font-mono" />
              <button type="submit" disabled={teacherSearching} className="lm-btn-ghost w-full text-purple-300 border border-purple-500/40">
                <MagnifyingGlassIcon className="w-4 h-4" />
                {teacherSearching ? 'Searching...' : 'Lookup Teacher'}
              </button>
            </form>
            {teacherLookupResult && (
              <div className="lm-inset p-4 space-y-3">
                {teacherLookupResult.status === 'not_found' ? (
                  <p className="text-red-300 text-xs flex items-start gap-2">
                    <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-px" />
                    <span>{teacherLookupResult.message}</span>
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-100 break-all">Found: <strong className="text-purple-300">{teacherLookupResult.user.name}</strong> ({teacherLookupResult.user.email})</p>
                    <button type="button" onClick={() => handleConfirmAssignTeacher(teacherLookupResult.user._id)} className="lm-btn w-full uppercase">Confirm Assignment</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Settings Modal with Strict Backend Options */}
      {/* Read-only bypass limits for TAs, who cannot open Labroom Settings. */}
      {isBypassModalOpen && (
        <div className="lm-scrim" onClick={() => setIsBypassModalOpen(false)}>
          <div className="lm-modal max-w-lg p-4 sm:p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-100 uppercase break-words">Bypass Limits</h3>
                <p className="text-[11px] text-slate-400 mt-1">Read-only &mdash; a teacher or admin sets these caps.</p>
              </div>
              <button type="button" onClick={() => setIsBypassModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <BypassLimitsPanel
              apiBase="/labmarks"
              roomId={labroomId}
              roomType="labroom"
              customCategories={editSessionalActivities}
              canEdit={false}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-2xl p-4 sm:p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-slate-100 uppercase flex items-center gap-2 min-w-0 break-words">
                <Cog6ToothIcon className="w-4 h-4 shrink-0" />
                Lab Settings &amp; Activities
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => setIsSettingsModalOpen(false)} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            {/* Bypass limits save through their own endpoint and button, so they get
                their own tab instead of living inside the settings form where a
                submit would fire the wrong save. */}
            <div className="flex gap-1 rounded-lg bg-black/30 p-1 border border-white/[0.06]" role="tablist" aria-label="Labroom settings sections">
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'general'}
                onClick={() => setSettingsTab('general')}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase transition-colors cursor-pointer ${
                  settingsTab === 'general'
                    ? 'bg-blue-500/15 text-blue-200 border border-blue-400/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                General
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'bypass'}
                onClick={() => setSettingsTab('bypass')}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase transition-colors cursor-pointer ${
                  settingsTab === 'bypass'
                    ? 'bg-blue-500/15 text-blue-200 border border-blue-400/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Bypass Limits
              </button>
            </div>

            {settingsTab === 'general' && (
            <>
            <form onSubmit={handleUpdateLabSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Lab Name</label>
                <input type="text" required value={editLabName} onChange={(e) => setEditLabName(e.target.value)} className="lm-field" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Section Prefix</label>
                  <input type="text" required value={editSectionPrefix} onChange={(e) => setEditSectionPrefix(e.target.value)} className="lm-field uppercase font-mono" />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Max Capacity</label>
                  <input type="number" required value={editMaxCapacity} onChange={(e) => setEditMaxCapacity(e.target.value)} className="lm-field font-mono" />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Total Lab Marks</label>
                  <input type="number" required min="1" value={editTotalMarks} onChange={(e) => setEditTotalMarks(e.target.value)} className="lm-field font-mono" />
                  <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                    Activity percentages below are percentages of this total. Changing it rescales the marks awarded, not the percentage.
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Placeholder Teacher Name</label>
                <input type="text" value={editPlaceholderTeacher} onChange={(e) => setEditPlaceholderTeacher(e.target.value)} className="lm-field" />
              </div>

              <div className="pt-3 border-t border-white/[0.06]">
                <RoomColorPicker
                  value={editColorKey}
                  onChange={setEditColorKey}
                  disabled={updatingSettings}
                />
              </div>

              {/* Dynamic Sessional Activities Manager with Backend Options Only */}
              <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-blue-400 uppercase min-w-0 break-words">Lab Activities &amp; Mark Weights</p>
                  <button 
                    type="button" 
                    onClick={() => setEditSessionalActivities([...editSessionalActivities, { category: 'Lab Tasks', allocatedMarks: 20 }])}
                    className="lm-chip"
                  >
                    + Add Activity
                  </button>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {editSessionalActivities.map((act, index) => {
                    const presetCategories = ['Lab Tasks', 'Vivas', 'Lab Tests', 'Projects', 'Quizzes', 'Assignments'];

                    return (
                      <div key={index} className="lm-inset flex items-center gap-2 p-2">
                        <select
                          value={act.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            const updated = [...editSessionalActivities];
                            updated[index].category = val;
                            setEditSessionalActivities(updated);
                          }}
                          className="lm-field flex-1 min-w-0 !rounded-lg !py-1.5 !px-2.5 font-mono uppercase !text-xs"
                        >
                          {!presetCategories.includes(act.category) && (
                            <option value={act.category} key={`current-${act.category}`}>{act.category}</option>
                          )}
                          {presetCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>

                        <input 
                          type="number" 
                          placeholder="Weight" 
                          value={act.allocatedMarks} 
                          onChange={(e) => {
                            const updated = [...editSessionalActivities];
                            updated[index].allocatedMarks = Number(e.target.value);
                            setEditSessionalActivities(updated);
                          }}
                          className="lm-field !rounded-lg !py-1.5 !px-2 font-mono !text-xs w-20 shrink-0" 
                          min="0"
                          step="0.5"
                          title="Percentage of the lab's total marks"
                        />
                        <button 
                          type="button"
                          aria-label="Remove Activity"
                          title="Remove Activity"
                          onClick={() => {
                            const updated = editSessionalActivities.filter((_, i) => i !== index);
                            setEditSessionalActivities(updated);
                          }}
                          className="lm-btn-ghost !px-2 !py-1.5 text-red-300 border border-red-500/40 shrink-0"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Running total. The percentages are meant to add up to 100, so
                    showing the sum lets the teacher see when they have not. */}
                {(() => {
                  const sum = editSessionalActivities.reduce((acc, a) => acc + (Number(a.allocatedMarks) || 0), 0);
                  const exact = Math.abs(sum - 100) < 0.01;
                  return (
                    <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs font-mono">
                      <span className="text-slate-500">Total allocated</span>
                      <span className={exact ? 'text-emerald-400' : 'text-amber-400'}>
                        {sum.toFixed(2)}%{exact ? '' : ' (target 100%)'}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-3 flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="lm-btn-ghost w-full sm:w-1/2 uppercase">Cancel</button>
                <button type="submit" disabled={updatingSettings} className="lm-btn w-full sm:w-1/2">
                  {updatingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-white/5 space-y-3">
              <p className="text-xs font-bold text-red-300 uppercase flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                Danger Zone
              </p>
              <form onSubmit={handleDeleteLabroomSubmit} className="space-y-3">
                {error && <p className="text-red-300 text-xs">{error}</p>}
                <p className="text-xs text-slate-300 break-words">Type <strong className="text-slate-100">{labroom.labName}</strong> to confirm deletion:</p>
                <input type="text" value={deleteInputName} onChange={(e) => setDeleteInputName(e.target.value)} placeholder="Enter exact lab name" className="lm-field" />
                <button type="submit" disabled={deletingLab || deleteInputName.trim() !== labroom.labName.trim()} className="lm-btn w-full bg-red-600 hover:bg-red-500 text-white">
                  <TrashIcon className="w-4 h-4" />
                  {deletingLab ? 'Deleting...' : 'Permanently Delete Lab'}
                </button>
              </form>
            </div>
            </>
            )}

            {settingsTab === 'bypass' && (
              <BypassLimitsPanel
                apiBase="/labmarks"
                roomId={labroomId}
                roomType="labroom"
                customCategories={editSessionalActivities}
                canEdit={isTeacherOrAdmin}
                showToast={showToast}
              />
            )}
          </div>
        </div>
      )}

      {/* 8. Anonymous Feedback / Complaints Modal */}
      {isComplaintModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-blue-300 uppercase flex items-center gap-2 min-w-0 break-words">
                <EnvelopeIcon className="w-4 h-4 shrink-0" />
                Anonymous Complaint Box
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => setIsComplaintModalOpen(false)} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSendComplaint} className="space-y-3">
              <textarea rows="4" required placeholder="Write your anonymous query or complaint..." value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className="lm-field resize-none" />
              <button type="submit" disabled={sendingComplaint} className="lm-btn w-full">
                <PaperAirplaneIcon className="w-4 h-4" />
                {sendingComplaint ? 'Submitting...' : 'Send Anonymously'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 9. View Complaints Modal (Staff/Admin) */}
      {isViewComplaintsModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-lg p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-blue-300 uppercase flex items-center gap-2 min-w-0 break-words">
                <MegaphoneIcon className="w-4 h-4 shrink-0" />
                Anonymous Submissions
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => setIsViewComplaintsModalOpen(false)} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            {loadingComplaints ? (
              <div className="lm-inset flex flex-col items-center gap-3 p-6 text-center">
                <div className="lm-bar"></div>
                <p className="text-xs text-slate-400">Loading submissions...</p>
              </div>
            ) : complaintsList.length === 0 ? (
              <div className="lm-inset p-6 text-center">
                <p className="text-xs text-slate-500 italic">No feedback submissions received yet.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                {complaintsList.map((c) => (
                  <div key={c._id || `${c.createdAt}-${c.message}`} className="lm-card-flat p-4 space-y-1.5">
                    <p className="text-xs text-slate-100 leading-relaxed break-words">{c.message}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] sm:text-xs text-slate-500 font-mono">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'}</p>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComplaint(c)}
                          disabled={deletingComplaintId === c._id}
                          className="lm-btn-icon hover:!border-rose-400/50 hover:!text-rose-200"
                          aria-label="Delete submission"
                          title="Delete submission (admin only)"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setIsViewComplaintsModalOpen(false)} className="lm-btn-ghost w-full uppercase">Close</button>
          </div>
        </div>
      )}

      {/* 10. Focused Attachment / Photo Inspection Modal */}
      {selectedActivityItem && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-5 space-y-4 text-center">
            <div className="flex items-start justify-between gap-3 text-left">
              <h3 className="text-xs font-bold text-blue-400 uppercase font-mono min-w-0 break-words">
                {selectedActivityItem.item.title} â€” Attachment Inspection
              </h3>
              <button type="button" aria-label="Close" title="Close" onClick={() => setSelectedActivityItem(null)} className="lm-btn-ghost shrink-0 !px-2.5 !py-2">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const sScore = (studentMark?.[selectedActivityItem.targetKey] || []).find(
                e => e.title?.trim().toLowerCase() === selectedActivityItem.item.title?.trim().toLowerCase()
              );
              const fileObj = sScore?.file || selectedActivityItem.scoreData?.file;

              return fileObj?.url ? (
                <div className="lm-inset p-3 space-y-2">
                  {fileObj.fileType === 'image' || fileObj.url.match(/\.(jpeg|jpg|png|gif)$/i) ? (
                    <img src={fileObj.url} alt="Activity Script" className="max-h-[60vh] mx-auto rounded-xl border border-white/10 object-contain" />
                  ) : (
                    <a href={fileObj.url} target="_blank" rel="noreferrer" className="lm-btn-ghost w-full py-6 text-emerald-300 underline break-words">
<DocumentTextIcon className="w-4 h-4" />
                      Download Attached Script ({fileObj.fileName || 'File'})
                    </a>
                  )}
                </div>
              ) : (
                <div className="lm-inset p-6 space-y-1.5">
                  <p className="text-[10px] sm:text-xs text-slate-400 uppercase">Your Obtained Score</p>
                  <p className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 break-words">
                    {sScore ? (sScore.isAbsent ? 'Marked Absent' : `${sScore.obtainedMarks} / ${selectedActivityItem.item.totalMarks}`) : 'Pending Evaluation'}
                  </p>
                </div>
              );
            })()}

            <button 
              type="button"
              onClick={() => setSelectedActivityItem(null)} 
              className="lm-btn-ghost w-full uppercase"
            >
              <XMarkIcon className="w-4 h-4" />
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500">
        <p>Â© 2026 PUCIT Lab Portal â€¢ All Rights Reserved</p>
      </footer>
    </div>
  );
};

export default LabroomDetail;