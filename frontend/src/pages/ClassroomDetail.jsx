import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
  CameraIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CheckIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  FolderIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  MegaphoneIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PlusIcon,
  RectangleStackIcon,
  StarIcon,
  TrophyIcon,
  TrashIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { uploadToCloudinary } from '../utils/cloudinary';
import NoticeCard from '../components/NoticeCard';
import BypassLimitsPanel from '../components/BypassLimitsPanel';
import RoomColorPicker from '../components/RoomColorPicker';
import { DEFAULT_ROOM_COLOR } from '../utils/roomColors';

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
  const [busyNoticeId, setBusyNoticeId] = useState('');
  const [showAllNotices, setShowAllNotices] = useState(false);

  // Anonymous Complaint states
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const [sendingComplaint, setSendingComplaint] = useState(false);
  const [isViewComplaintsModalOpen, setIsViewComplaintsModalOpen] = useState(false);
  const [complaintsList, setComplaintsList] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [complaintUnreadCount, setComplaintUnreadCount] = useState(0);
  const [deletingComplaintId, setDeletingComplaintId] = useState('');

  // Create student result / graded item sheet modal state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemCreationMode, setItemCreationMode] = useState('all'); // 'all' or 'range'
  const [itemCategory, setItemCategory] = useState('Quizzes');
  const [itemTitle, setItemTitle] = useState('');
  const [itemTotalMarks, setItemTotalMarks] = useState(10);
  const [itemStartRoll, setItemStartRoll] = useState('');
  const [itemEndRoll, setItemEndRoll] = useState('');
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
  const [rejectedRolls, setRejectedRolls] = useState([]);
  const [rejectingRoll, setRejectingRoll] = useState('');

  const [addingStudent, setAddingStudent] = useState(false);
  const [addStudentError, setAddStudentError] = useState('');

  // Class Roster / Members Overview Modal
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // Student Profile Popup State
  const [profileStudent, setProfileStudent] = useState(null);
  const [isStudentProfileModalOpen, setIsStudentProfileModalOpen] = useState(false);

  // Class Settings & Weights modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  // Which settings tab is showing: 'general' (details, colour, weights, danger
  // zone) or 'bypass' (per-category bypass caps).
  const [settingsTab, setSettingsTab] = useState('general');
  // TAs cannot open Classroom Settings, but they still need to see the bypass
  // caps that constrain what they can mark. Read-only, teacher/admin only to edit.
  const [isBypassModalOpen, setIsBypassModalOpen] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editSectionPrefix, setEditSectionPrefix] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState(50);
  const [editPlaceholderTeacher, setEditPlaceholderTeacher] = useState('');
  const [editColorKey, setEditColorKey] = useState(DEFAULT_ROOM_COLOR);

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
    if (clean.includes('viva')) return 'vivas';
    if (clean.includes('project')) return 'projects';
    if (clean.includes('present')) return 'presentations';
    if (clean.includes('homework') || clean.includes('home')) return 'homework';
    if (clean.includes('class activity') || clean.includes('classactiv')) return 'classActivities';
    if (clean.includes('participation')) return 'classParticipation';
    if (clean.includes('special') || clean.includes('specialmarks')) return 'specialMarks';

    // Classroom schema keys: only these arrays exist on a classroom document.
    // Never fall back to lab keys (labTasks/labTests/labs) or unrecognized ones,
    // otherwise items get silently dropped or lumped under "quizzes".
    const standardKeys = ['quizzes', 'assignments', 'mids', 'finals', 'vivas', 'projects', 'presentations', 'homework', 'classactivities', 'classparticipation', 'specialmarks'];
    const potentialKey = clean.endsWith('s') ? clean : clean + 's';
    if (standardKeys.includes(potentialKey)) return potentialKey;

    return 'quizzes';
  };

  // The set of category keys that live directly on the marks document. Anything
  // outside this set is a teacher-defined (custom) activity, which is stored
  // under customActivities[].items instead.
  const STANDARD_MARK_KEYS = [
    'quizzes', 'assignments', 'presentations', 'projects', 'homework',
    'classActivities', 'classParticipation', 'vivas', 'specialMarks',
    'mids', 'finals', 'finalProject'
  ];

  // Resolves a configured activity label to where its marks actually live.
  //
  // getCategoryTargetKey cannot be reused here: it ends in `return 'quizzes'`
  // for anything it does not recognise, which is correct for item CREATION
  // (an unknown label must land somewhere) but catastrophic for the leaderboard
  // - a custom "Attendance" activity would resolve to quizzes, overwrite the real
  // quizzes percentage in the per-category map, and render a second "Quizzes"
  // chip. Custom categories are keyed by their lowercased name, matching the key
  // markSchema uses in categoryPercentages.
  const resolveMarkCategory = (catName = '') => {
    const clean = catName.trim().toLowerCase();
    if (!clean) return { key: '', isCustom: false };
    if (STANDARD_MARK_KEYS.includes(clean)) return { key: clean, isCustom: false };
    const resolved = getCategoryTargetKey(catName);
    if (STANDARD_MARK_KEYS.includes(resolved)) return { key: resolved, isCustom: false };
    return { key: clean, isCustom: true };
  };

  const getItemsForCategory = (catName = '') => {
    if (!classroom) return [];
    const targetKey = getCategoryTargetKey(catName);
    if (classroom[targetKey] && Array.isArray(classroom[targetKey])) {
      return classroom[targetKey];
    }
    return [];
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
      setEditColorKey(fetchedClass.colorKey || DEFAULT_ROOM_COLOR);

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
      // The backend returns this viewer's own unread count, so the badge is
      // per-staff-member rather than one shared flag for the whole room.
      setComplaintUnreadCount(res.data?.data?.unreadCount || 0);
    } catch {
      console.warn('Failed to fetch complaints');
    } finally {
      setLoadingComplaints(false);
    }
  };

  const markComplaintsRead = async (complaintIds) => {
    try {
      await API.patch(`/classrooms/${classroomId}/complaints/read`, { complaintIds });
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
      await API.delete(`/classrooms/${classroomId}/complaints/${complaint._id}`);
      setComplaintsList((prev) => prev.filter((c) => c._id !== complaint._id));
      showToast('Submission deleted.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete submission.', 'error');
    } finally {
      setDeletingComplaintId('');
    }
  };

  const fetchAvailableAutoStudents = async () => {
    try {
      setLoadingAutoStudents(true);
      const res = await API.get(`/classrooms/${classroomId}/available-students`);
      const students = res.data?.data?.students || [];
      setAvailableAutoStudents(students);
      setRejectedRolls(res.data?.data?.rejectedRolls || []);
    } catch (err) {
      console.warn('Could not fetch auto-detect students:', err);
    } finally {
      setLoadingAutoStudents(false);
    }
  };

  const handleToggleRejectStudent = async (student) => {
    try {
      setRejectingRoll(student.rollNo);
      await API.patch(`/classrooms/${classroomId}/smart-reject`, { rollNo: student.rollNo });
      const res = await API.get(`/classrooms/${classroomId}/available-students`);
      setAvailableAutoStudents(res.data?.data?.students || []);
      setRejectedRolls(res.data?.data?.rejectedRolls || []);
      setSelectedAutoStudentIds(prev => prev.filter(id => id !== student._id));
      showToast(student.rollNo + ' updated in Smart Detect.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update Smart Detect.', 'error');
    } finally {
      setRejectingRoll('');
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
          category: category,
          filterUngraded: filterUngraded, 
          filterUnassigned: filterUngraded 
        }
      });
      return;
    }
    setSelectedActivityItem({ item, targetKey, category });
  };

  // Editing/removing an existing announcement is narrower than posting one:
  // only the author, this classroom's assigned teacher, or an admin may do it.
  const canManageNotice = (notice) => {
    if (isAdmin) return true;
    if (classroom?.teacher && String(classroom.teacher._id || classroom.teacher) === String(user?._id)) return true;
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

      const payload = {
        category: itemCategory,
        title: trimmedTitle,
        totalMarks: tMarks,
        mode: itemCreationMode
      };

      if (itemCreationMode === 'range') {
        const start = parseInt(itemStartRoll, 10);
        const end = parseInt(itemEndRoll, 10);
        if (isNaN(start) || isNaN(end) || start > end) {
          throw new Error('Please specify a valid numeric roll suffix range.');
        }
        payload.rangeStart = start;
        payload.rangeEnd = end;
      }

      await API.post(`/classrooms/${classroomId}/items`, payload);

      setIsItemModalOpen(false);
      setItemTitle('');
      setItemTotalMarks(10);
      setItemStartRoll('');
      setItemEndRoll('');
      showToast('Opening grading sheet...');

      navigate(`/classroom/${classroomId}/sheet/${catKey}/${encodeURIComponent(trimmedTitle)}`, {
        state: { totalMarks: tMarks, category: itemCategory }
      });
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to open student result sheet.', 'error');
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
      formData.append('category', excelCategory);
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
        colorKey: editColorKey,
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

  const handleAddStudentSubmit = async (e) => {
    e.preventDefault();
    setAddingStudent(true);
    setAddStudentError('');

    try {
      if (addModeType === 'suffix') {
        const suffixes = suffixInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        if (suffixes.length === 0) throw new Error('Please enter at least one roll number suffix.');
        await API.post(`/classrooms/${classroomId}/add-students-by-suffix`, { rollSuffixes: suffixes });
        showToast(`Successfully enrolled ${suffixes.length} students via suffix list!`);
      } else if (addModeType === 'range') {
        const start = parseInt(bulkStart, 10);
        const end = parseInt(bulkEnd, 10);
        if (isNaN(start) || isNaN(end) || start > end) throw new Error('Please specify a valid numeric range.');
        await API.post(`/classrooms/add-bulk-range`, { classroomId, startRoll: start, endRoll: end });
        showToast(`Bulk range from ${start} to ${end} enrolled!`);
      } else if (addModeType === 'addDrop') {
        if (!lookupTargetStudent) throw new Error('Please lookup and verify the student first.');
        await API.post(`/classrooms/add-student-by-roll`, { classroomId, rollInput: lookupTargetStudent.rollNo || addDropInput.trim() });
        showToast(`Student ${lookupTargetStudent.name} enrolled successfully!`);
      } else if (addModeType === 'autoDetect') {
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
      <div className="lm-canvas lm-acc-classroom min-h-dvh overflow-x-hidden flex flex-col items-center justify-center p-6 space-y-5">
        <div className="lm-ambient" />
        <div className="lm-topline" />
        <div className="lm-bar"></div>
        <p className="lm-eyebrow">Syncing classroom portal...</p>
      </div>
    );
  }

  if (error || !classroom) {
    return (
      <div className="lm-canvas lm-acc-classroom min-h-dvh overflow-x-hidden flex flex-col items-center justify-center p-4">
        <div className="lm-ambient" />
        <div className="lm-topline" />
        <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-5 sm:p-6 text-center max-w-sm w-full space-y-4 shadow-lift">
          <ExclamationTriangleIcon className="w-8 h-8 mx-auto text-red-300" />
          <h2 className="font-extrabold text-sm sm:text-base text-slate-100">Connection Error</h2>
          <p className="text-xs text-slate-300 break-words">{error || 'Classroom does not exist.'}</p>
          <Link to="/" className="lm-btn w-full">Dashboard</Link>
        </div>
      </div>
    );
  }

  const activeStudents = (classroom.students || [])
    .filter(s => s && (s._id || s.name))
    .sort((a, b) => {
      const prefix = (classroom.sectionPrefix || '').toUpperCase();
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
  const reversedNotices = [...(classroom.notices || [])].reverse();
  const latestNotice = reversedNotices[0];

  const sessionalActivitiesList = (classroom.sessionalActivities && classroom.sessionalActivities.length > 0)
    ? classroom.sessionalActivities
    : [{ category: 'Quizzes', allocatedMarks: 10 }, { category: 'Assignments', allocatedMarks: 15 }];

  const getItemClassAverage = (targetKey, itemTitle, categoryName) => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return '0.00';
    
    let totalObtained = 0;
    let totalPossible = 0;
    let count = 0;

    const categoryItems = getItemsForCategory(categoryName || targetKey);
    const targetItem = categoryItems.find(i => i.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
    const maxMarks = targetItem ? Number(targetItem.totalMarks || 10) : 10;

    rankings.forEach(r => {
      const doc = r.marksDoc || r;
      let match = null;
      const scores = doc[targetKey] || r[targetKey] || [];
      match = scores.find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      
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

  const getItemClassAverageRaw = (targetKey, itemTitle, _categoryName) => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return '0.00';
    
    let totalObtained = 0;
    let count = 0;

    rankings.forEach(r => {
      const doc = r.marksDoc || r;
      let match = null;
      const scores = doc[targetKey] || r[targetKey] || [];
      match = scores.find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      
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

  const getItemGradedCount = (targetKey, itemTitle, _categoryName) => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return 0;
    let graded = 0;

    rankings.forEach(r => {
      const doc = r.marksDoc || r;
      let match = null;
      const scores = doc[targetKey] || r[targetKey] || [];
      match = scores.find(s => s.title?.trim().toLowerCase() === itemTitle?.trim().toLowerCase());
      
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

  const calculateCategoryMarksSummary = (catName) => {
    if (!studentMark) return { obtained: 0, total: 0 };
    let obtained = 0;
    let total = 0;

    const targetKey = getCategoryTargetKey(catName);

    // Bypassed entries are excluded from both sides, and an absent entry still
    // contributes its possible marks - so this summary always agrees with
    // computeCategoryPercentage and with the backend totals.
    const collect = (item) => {
      if (!item || item.isBypassed) return;
      if (!item.isAbsent) obtained += Number(item.obtainedMarks || 0);
      total += Number(item.totalMarks || 0);
    };

    const entries = studentMark[targetKey];
    if (Array.isArray(entries)) {
      entries.forEach(collect);
    } else if (entries && typeof entries === 'object') {
      collect(entries);
    }
    return { obtained, total };
  };

  // Percentage for ONE category only, out of 100 - this is what a leaderboard
  // filtered to that category ranks by, and it must agree with the backend.
  //
  //  - Bypassed ("B") entries are excluded from BOTH sides. They count for
  //    nothing, not as a zero, matching getArrayTotals in markSchema.
  //  - Absent entries still contribute their possible marks. Dropping the
  //    possible side too would silently rescale the category for that student.
  //  - Custom (teacher-defined) activities are not top-level keys on the marks
  //    document; they live in customActivities[].items under the lowercased
  //    category name, so they need their own lookup.
  const computeCategoryPercentage = (marksDoc, catKey) => {
    if (!marksDoc) return 0;
    let obt = 0;
    let tot = 0;
    const collect = (item) => {
      if (!item || item.isBypassed) return;
      if (!item.isAbsent) obt += Number(item.obtainedMarks || 0);
      tot += Number(item.totalMarks || 0);
    };

    if (STANDARD_MARK_KEYS.includes(catKey)) {
      const items = marksDoc[catKey];
      if (Array.isArray(items)) {
        items.forEach(collect);
      } else if (items && typeof items === 'object' && items.totalMarks > 0) {
        collect(items);
      }
      return tot > 0 ? (obt / tot) * 100 : 0;
    }

    const customCat = (marksDoc.customActivities || []).find(
      c => c?.categoryName?.trim().toLowerCase() === catKey
    );
    if (customCat && Array.isArray(customCat.items)) {
      customCat.items.forEach(collect);
    }
    return tot > 0 ? (obt / tot) * 100 : 0;
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

    const marksDoc = found.marksDoc || found;

    return {
      overall: Number(found.overallPercentage || 0).toFixed(2),
      sessional: Number(found.sessionalPercentage || 0).toFixed(2),
      quizzes: Number(computeCategoryPercentage(marksDoc, 'quizzes')).toFixed(2),
      assignments: Number(computeCategoryPercentage(marksDoc, 'assignments')).toFixed(2),
      mids: Number(computeCategoryPercentage(marksDoc, 'mids')).toFixed(2),
      finals: Number(computeCategoryPercentage(marksDoc, 'finals')).toFixed(2)
    };
  };

  const openStudentProfile = (student) => {
    const rankings = classAnalytics?.rankings || [];
    const studentId = student?._id;
    const foundIdx = [...rankings]
      .slice()
      .sort((a, b) => (b.overallPercentage || 0) - (a.overallPercentage || 0))
      .findIndex(r => {
        const rid = r.student?._id || r.student;
        return rid?.toString() === studentId?.toString();
      });

    const found = foundIdx >= 0 ? rankings[foundIdx] : null;
    const marksDoc = found?.marksDoc || found || {};

    const studentsInClass = activeStudents.find(s => (s._id || s)?.toString() === studentId?.toString());
    const profileStudentData = {
      _id: student?._id || studentId,
      name: student?.name || studentsInClass?.name || 'Unknown Student',
      rollNo: student?.rollNo || studentsInClass?.rollNo || 'N/A',
      email: student?.email || studentsInClass?.email || '',
      rank: foundIdx >= 0 ? `#${foundIdx + 1}` : 'Pending',
      overall: Number(found?.overallPercentage || 0).toFixed(2),
      sessional: Number(found?.sessionalPercentage || 0).toFixed(2),
      mids: Number(found?.midsPercentage || 0).toFixed(2),
      finals: Number(found?.finalsPercentage || 0).toFixed(2),
      marksDoc
    };
    setProfileStudent(profileStudentData);
    setIsStudentProfileModalOpen(true);
  };

  // Single source of truth for the leaderboard score, so the table and the sort
  // can never disagree about which number a filter is ranking by.
  const scoreForFilter = (entry, filter) => {
    if (filter === 'overall') return Number(entry.overallPercentage || 0);
    if (filter === 'sessionals') return Number(entry.sessionalPercentage || 0);
    if (filter === 'mids') return Number(entry.midsPercentage || 0);
    if (filter === 'finals') return Number(entry.finalsPercentage || 0);
    return Number(entry.perCategory?.[filter] ?? 0);
  };

  const getSortedLeaderboard = () => {
    const rankings = classAnalytics?.rankings || [];
    if (rankings.length === 0) return [];

    return [...rankings].map(r => {
      const marksDoc = r.marksDoc || r;
      const perCategory = {};
      // The leaderboard filter is a category label ("Quizzes") or a custom
      // activity name, so it must be resolved to where its marks are actually
      // stored before the lookup.
      sessionalActivitiesList.forEach(act => {
        const { key } = resolveMarkCategory(act.category);
        if (key) perCategory[key] = computeCategoryPercentage(marksDoc, key);
      });
      return {
        ...r,
        perCategory,
        computedQuizPct: perCategory.quizzes ?? 0,
        computedAssignmentPct: perCategory.assignments ?? 0
      };
    }).sort((a, b) => scoreForFilter(a, leaderboardFilter) - scoreForFilter(b, leaderboardFilter));
  };

  const getTotalPendingGradingCount = () => {
    let totalItemsCount = 0;
    let totalExpectedGrades = 0;
    let totalGradedSoFar = 0;

    sessionalActivitiesList.forEach(act => {
      const targetKey = getCategoryTargetKey(act.category);
      const items = getItemsForCategory(act.category);
      totalItemsCount += items.length;
      items.forEach(item => {
        totalGradedSoFar += getItemGradedCount(targetKey, item.title, act.category);
      });
    });

    totalExpectedGrades = totalItemsCount * totalStudentsCount;
    return Math.max(0, totalExpectedGrades - totalGradedSoFar);
  };

  const studentRankInfo = getStudentRankInfo();
  const studentAnalyticsData = getStudentAnalyticsData();
  const totalPendingCount = getTotalPendingGradingCount();

  // Deep Class Metrics helpers (staff overview: per-category averages + progress)
  const getCategoryMetric = (catKey) => {
    const list = classAnalytics?.categoryMetrics || [];
    return list.find(m => (m.category || '').toLowerCase() === String(catKey).toLowerCase()) || null;
  };

  const getMetricAverage = (metric) => {
    if (!metric) return '0.00';
    return Number(metric.averagePercentage || 0).toFixed(2);
  };

  const getMetricProgress = (metric) => {
    if (!metric) return { graded: 0, total: totalStudentsCount, pct: '0.0' };
    return {
      graded: metric.gradedCount || 0,
      total: metric.totalCount || totalStudentsCount,
      pct: Number(metric.progressPercentage || 0).toFixed(1),
    };
  };

  const getAvgColor = (pct) => {
    const v = Number(pct) || 0;
    if (v >= 70) return 'text-emerald-400';
    if (v >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  const themeColorClass = 'border-white/[0.06]';
  const badgeColorClass = 'lm-badge border-orange-400/30 bg-orange-400/10 text-orange-200';

  return (
    <div className="lm-canvas lm-acc-classroom relative min-h-dvh overflow-x-hidden flex flex-col px-4 sm:px-6 lg:px-8 py-4 sm:py-5 selection:bg-orange-300 selection:text-slate-950">

      <div className="lm-ambient" />

      {toastMessage && (
        <div className="fixed top-4 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className={`lm-toast flex items-center gap-3 px-4 py-3 rounded-2xl border ${
            toastType === 'success' ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'
          }`}>
            {toastType === 'success'
              ? <CheckIcon className="w-5 h-5 shrink-0" />
              : <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />}
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-100 min-w-0 break-words">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* TOP CONTROLLER BAR */}
      <header className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-2.5 bg-[#05070b]/85 backdrop-blur-xl">
        <div className="lm-topline" />
        <div className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Link to="/" className="lm-btn-ghost shrink-0" aria-label="Back" title="Back">
                <ArrowLeftIcon className="w-4 h-4" />
                Back
              </Link>
              <div className="min-w-0">
                <h1 className="lm-title text-sm sm:text-lg font-black leading-tight truncate">{classroom.className}</h1>
                <p className="lm-eyebrow font-mono">{classroom.sectionPrefix}</p>
              </div>
            </div>
            <span className={`${badgeColorClass} shrink-0 font-mono`}>
              <BookOpenIcon className="lm-ico" />
              Class
            </span>
          </div>

          <div className="lm-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-1.5 pt-2 sm:pt-0 border-t sm:border-0 border-white/5">
            {user?.role === 'STUDENT' && !isAssignedTa && (
              <button type="button" onClick={() => setIsComplaintModalOpen(true)} className="lm-btn-ghost shrink-0 border-amber-500/40 text-amber-300 hover:text-amber-200">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Complaints
              </button>
            )}
            {isStaffOrAdmin && (
              <button
                type="button"
                onClick={() => {
                  setIsViewComplaintsModalOpen(true);
                  fetchComplaints().then(() => markComplaintsRead());
                }}
                className="lm-btn-ghost shrink-0 border-amber-500/40 text-amber-200 hover:text-amber-100 relative"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Feedback
                {complaintUnreadCount > 0 && (
                  <span className="lm-badge border-amber-400/40 bg-amber-500/20 text-amber-200 font-mono">
                    {complaintUnreadCount}
                  </span>
                )}
              </button>
            )}
            <button type="button" onClick={() => setIsMembersModalOpen(true)} className="lm-btn-ghost shrink-0 border-cyan-500/40 text-cyan-300 hover:text-cyan-200">
              <UserGroupIcon className="w-4 h-4" />
              Roster
            </button>
            {isAdmin && <button type="button" onClick={() => setIsAssignTeacherModalOpen(true)} className="lm-btn-ghost shrink-0 border-purple-500/40 text-purple-300 hover:text-purple-200"><PlusIcon className="w-4 h-4" />Teacher</button>}
            {isTeacherOrAdmin && <button type="button" onClick={() => setIsTaModalOpen(true)} className="lm-btn-ghost shrink-0 text-orange-200 hover:text-orange-100"><PlusIcon className="w-4 h-4" />TA</button>}
            {isStaffOrAdmin && (
              <>
                <button type="button" onClick={() => setIsAddStudentModalOpen(true)} className="lm-btn-ghost shrink-0 text-orange-200 hover:text-orange-100"><PlusIcon className="w-4 h-4" />Student</button>
                <button type="button" onClick={handleDownloadExcelReport} className="lm-btn-ghost shrink-0 border-emerald-500/40 text-emerald-300 hover:text-emerald-200">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Download Excel
                </button>
                <button type="button" onClick={() => setIsExcelModalOpen(true)} className="lm-btn-ghost shrink-0 text-orange-200 hover:text-orange-100">
                  <ChartBarIcon className="w-4 h-4" />
                  Upload Sync
                </button>
                <button type="button" onClick={() => setIsItemModalOpen(true)} className="lm-btn shrink-0"><PlusIcon className="w-4 h-4" />Result</button>
              </>
            )}
            {isTeacherOrAdmin && <button type="button" onClick={() => { setSettingsTab('general'); setIsSettingsModalOpen(true); }} className="lm-btn-ghost shrink-0"><Cog6ToothIcon className="w-4 h-4" />Settings</button>}
            {isAssignedTa && !isTeacherOrAdmin && <button type="button" onClick={() => setIsBypassModalOpen(true)} className="lm-btn-ghost shrink-0"><ShieldCheckIcon className="w-4 h-4" />Bypass Limits</button>}
          </div>
        </div>
        <hr className="lm-divider mt-1" />
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto my-5 sm:my-6 space-y-5 sm:space-y-6 flex-grow min-w-0">
        
        {/* NOTICE BOARD SECTION */}
        <section className="lm-card p-4 sm:p-6 space-y-4">
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${themeColorClass} pb-3`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl lm-inset text-orange-300">
                <MegaphoneIcon className="w-4 h-4" />
              </span>
              <h2 className="text-sm sm:text-base font-black text-slate-100 uppercase tracking-wider">Notice Board</h2>
            </div>
            {classroom.notices?.length > 0 && (
              <button type="button" onClick={() => setShowAllNotices(!showAllNotices)} className="lm-chip shrink-0">
                {showAllNotices ? 'Show Latest Only' : `View All (${classroom.notices.length})`}
              </button>
            )}
          </div>

          {isStaffOrAdmin && (
            <form onSubmit={handlePostNotice} className="lm-inset p-3 sm:p-4 space-y-3">
              <input type="text" placeholder="Notice Title" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} required className="lm-field" />
              <textarea placeholder="Write announcement details..." value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} required rows="2" className="lm-field resize-none" />
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <label className="cursor-pointer text-xs text-slate-300 hover:text-slate-100 transition-colors min-w-0 break-words flex items-center gap-1.5">
                  <PaperClipIcon className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="min-w-0">{noticeFile ? `Attached: ${noticeFile.name}` : 'Attach Image, PDF, or ZIP'}</span>
                  <input type="file" onChange={(e) => setNoticeFile(e.target.files[0])} className="hidden" accept="image/*,.pdf,.zip" />
                </label>
                <button type="submit" disabled={postingNotice} className="lm-btn shrink-0">
                  {postingNotice ? 'Publishing...' : 'Publish Notice'}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {!latestNotice ? (
              <div className="lm-inset p-6 text-center">
                <MegaphoneIcon className="w-7 h-7 mx-auto text-slate-600" />
                <p className="text-slate-400 text-xs italic mt-2">No announcements posted yet.</p>
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
                      await API.patch(`/classrooms/${classroomId}/notices/${n._id}`, { title, content });
                      await fetchClassroomData();
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
                      await API.delete(`/classrooms/${classroomId}/notices/${n._id}`);
                      await fetchClassroomData();
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
                busy={busyNoticeId === (latestNotice._id || '')}
                onEdit={async ({ title, content }) => {
                  setBusyNoticeId(latestNotice._id || '');
                  try {
                    await API.patch(`/classrooms/${classroomId}/notices/${latestNotice._id}`, { title, content });
                    await fetchClassroomData();
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
                  setBusyNoticeId(latestNotice._id || '');
                  try {
                    await API.delete(`/classrooms/${classroomId}/notices/${latestNotice._id}`);
                    await fetchClassroomData();
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

        {/* NAVIGATION TABS */}
        <div className="lm-card-flat p-2">
          <div className="lm-scroll-x -mx-2 px-2">
            <div className="flex items-center gap-1.5 min-w-max">
              <button type="button" onClick={() => setActiveTab('overview')} className={`lm-chip ${activeTab === 'overview' ? 'lm-chip-active' : ''}`}>
                <ChartBarIcon className="lm-ico" />
                Overview
              </button>
              
              {isStaffOrAdmin && (
                <button type="button" onClick={() => setActiveTab('leaderboard')} className={`lm-chip ${activeTab === 'leaderboard' ? 'lm-chip-active' : ''}`}>
                  <TrophyIcon className="lm-ico" />
                  Class Leaderboard
                </button>
              )}

              {sessionalActivitiesList.map((act) => {
                const count = getItemsForCategory(act.category).length;
                return (
                  <button type="button" key={act.category} onClick={() => setActiveTab(act.category.toLowerCase())} className={`lm-chip ${activeTab === act.category.toLowerCase() ? 'lm-chip-active' : ''}`}>
                    <FolderIcon className="lm-ico" />
                    {act.category}
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${activeTab === act.category.toLowerCase() ? 'bg-black/20 text-black' : 'bg-slate-800 text-slate-300'}`}>
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
            <div className="lg:col-span-2 lm-card p-4 sm:p-6 space-y-5 min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-wider">
                {user?.role === 'STUDENT' && !isAssignedTa ? 'Your Academic Progress & Breakdown' : 'Class Performance Summary & Deep Metrics'}
              </h3>
              {user?.role === 'STUDENT' && !isAssignedTa ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="lm-inset p-4 space-y-1 border-amber-500/25 transition-all duration-200 hover:-translate-y-px">
                      <p className="text-[10px] sm:text-xs text-amber-300 uppercase font-bold tracking-wider">Sessional Activity %</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-amber-200">{studentAnalyticsData.sessional}%</p>
                    </div>
                    <div className="lm-inset p-4 space-y-1 border-orange-400/25 transition-all duration-200 hover:-translate-y-px">
                      <p className="text-[10px] sm:text-xs text-orange-300 uppercase font-bold tracking-wider">Overall Percentage</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-orange-200">{studentAnalyticsData.overall}%</p>
                    </div>
                    <div className="lm-inset p-4 space-y-1 border-rose-400/25 transition-all duration-200 hover:-translate-y-px">
                      <p className="text-[10px] sm:text-xs text-rose-300 uppercase font-bold tracking-wider">Class Standing</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-slate-100">{studentRankInfo.rank} <span className="text-xs sm:text-sm text-slate-400 font-normal">/ {studentRankInfo.total}</span></p>
                    </div>
                  </div>

                  <div className="lm-inset p-4 space-y-3">
                    <p className="lm-eyebrow">Your Breakdown Across All Categories</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                      {sessionalActivitiesList.map(act => {
                        const summary = calculateCategoryMarksSummary(act.category);
                        return (
                          <div key={act.category} className="lm-card-flat p-3 space-y-1 min-w-0">
                            <span className="text-[10px] sm:text-xs text-slate-400 block uppercase font-bold break-words">{act.category}</span>
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <span className="font-mono font-black text-orange-200 text-sm sm:text-base">
                                {summary.total > 0 ? ((summary.obtained / summary.total) * 100).toFixed(2) : '0.00'}%
                              </span>
                              <span className="text-[10px] sm:text-xs text-slate-400 font-mono">({summary.obtained}/{summary.total})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="lm-inset p-4 space-y-1 border-amber-500/25 transition-all duration-200 hover:-translate-y-px">
                      <p className="text-[10px] sm:text-xs text-amber-300 uppercase font-bold tracking-wider">Sessional Average %</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-amber-200">{classAnalytics?.classAverages?.sessionalPercentage ?? '0.00'}%</p>
                    </div>
                    <div className="lm-inset p-4 space-y-1 border-orange-400/25 transition-all duration-200 hover:-translate-y-px">
                      <p className="text-[10px] sm:text-xs text-orange-300 uppercase font-bold">Evaluated Students</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black text-orange-200 font-mono">{classAnalytics?.rankings?.length || 0} / {totalStudentsCount}</p>
                    </div>
                    <div className="lm-inset p-4 space-y-1 border-rose-400/25 transition-all duration-200 hover:-translate-y-px">
                      <p className="text-[10px] sm:text-xs text-rose-300 uppercase font-bold">Pending Grades</p>
                      <p className="text-xl sm:text-2xl lg:text-3xl font-black text-rose-300 font-mono">{totalPendingCount}</p>
                    </div>
                  </div>
                  <div className="lm-inset p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="lm-eyebrow">Deep Class Metrics Overview</p>
                      <span className="font-mono font-black text-amber-200 text-base sm:text-lg">Ø {classAnalytics?.classAverages?.overallPercentage ?? 0}%</span>
                    </div>

                    {/* Per-component class averages */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { key: 'Sessional', value: classAnalytics?.classAverages?.sessionalPercentage, color: 'text-amber-200' },
                        { key: 'Mids', value: classAnalytics?.classAverages?.midsPercentage, color: 'text-orange-200' },
                        { key: 'Finals', value: classAnalytics?.classAverages?.finalsPercentage, color: 'text-rose-200' },
                      ].map(c => (
                        <div key={c.key} className="lm-card-flat p-3 text-center">
                          <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider">{c.key}</p>
                          <p className={`font-mono font-black text-base sm:text-lg ${c.color}`}>{Number(c.value || 0).toFixed(2)}%</p>
                        </div>
                      ))}
                    </div>

                    {/* Sessional activity breakdown */}
                    <div>
                      <p className="lm-eyebrow mb-2">Sessional Activities</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {sessionalActivitiesList.map(act => {
                          const catKey = getCategoryTargetKey(act.category);
                          const metric = getCategoryMetric(catKey);
                          const avg = getMetricAverage(metric);
                          const prog = getMetricProgress(metric);
                          return (
                            <div key={act.category} className="lm-card-flat p-3 space-y-1.5 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold break-words min-w-0">{act.category}</span>
                                <span className={`font-mono font-black text-sm sm:text-base shrink-0 ${getAvgColor(avg)}`}>{avg}%</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs font-mono text-slate-500">
                                <span>{prog.graded}/{prog.total} graded</span>
                                <span>{prog.pct}% progress</span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-orange-200 to-orange-400 rounded-full transition-all" style={{ width: `${prog.pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Examinations breakdown (Mids / Finals / Final Project) */}
                    {['mids', 'finals', 'finalProject'].some(k => getCategoryMetric(k)) && (
                      <div>
                        <p className="lm-eyebrow mb-2">Examinations</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          {['mids', 'finals', 'finalProject'].map(catKey => {
                            const metric = getCategoryMetric(catKey);
                            if (!metric) return null;
                            const avg = getMetricAverage(metric);
                            const prog = getMetricProgress(metric);
                            return (
                              <div key={catKey} className="lm-card-flat p-3 space-y-1.5 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] sm:text-xs text-orange-200 uppercase font-bold break-words min-w-0">{metric.label}</span>
                                  <span className={`font-mono font-black text-sm sm:text-base shrink-0 ${getAvgColor(avg)}`}>{avg}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-[10px] sm:text-xs font-mono text-slate-500">
                                  <span>{prog.graded}/{prog.total} graded</span>
                                  <span>{prog.pct}% progress</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-orange-200 to-rose-300 rounded-full transition-all" style={{ width: `${prog.pct}%` }}></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* COURSE PROFILE BOX */}
            <div className="lm-card p-4 sm:p-6 flex flex-col justify-between overflow-hidden min-w-0">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent pointer-events-none"></div>
              
              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl lm-inset text-orange-200">
                      <BuildingOffice2Icon className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider truncate">Course Profile</h3>
                  </div>
                  <span className="lm-badge font-mono border-orange-400/30 bg-orange-400/10 text-orange-200 shrink-0">
                    {classroom.sectionPrefix}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="lm-eyebrow shrink-0">Instructor</span>
                    <strong className="text-slate-100 font-bold truncate min-w-0">{classroom.teacher?.name || classroom.placeholderTeacherName || 'TBA'}</strong>
                  </div>

                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="lm-eyebrow shrink-0">Enrollment</span>
                    <div className="flex items-center gap-1.5 font-mono min-w-0">
                      <span className="text-orange-200 font-black">{totalStudentsCount}</span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-300">{classroom.maxCapacity || 50} Max</span>
                    </div>
                  </div>

                  <div className="lm-inset flex flex-wrap items-center justify-between gap-3 p-3">
                    <span className="lm-eyebrow shrink-0">Grading Breakdown</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-orange-200">
                      <span className="lm-badge border-orange-400/25 bg-orange-400/10" title="Sessionals">S: {classroom.gradingScheme?.sessionalWeight || 25}%</span>
                      <span className="lm-badge border-orange-400/25 bg-orange-400/10" title="Mids">M: {classroom.gradingScheme?.midsWeight || 35}%</span>
                      <span className="lm-badge border-orange-400/25 bg-orange-400/10" title="Finals">F: {classroom.gradingScheme?.finalsWeight || 40}%</span>
                    </div>
                  </div>

                  <div className="lm-inset flex items-center justify-between gap-3 p-3">
                    <span className="lm-eyebrow shrink-0">TAs Assigned</span>
                    <strong className="text-rose-200 font-mono font-bold">{(classroom.tas || []).length} Active TAs</strong>
                  </div>
                </div>
              </div>

              <div className="pt-4 relative z-10">
                <button type="button" onClick={() => setIsMembersModalOpen(true)} className="lm-btn w-full">
                  <UserGroupIcon className="w-4 h-4" />
                  View Full Class Roster
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STAFF CLASS LEADERBOARD TAB VIEW */}
        {activeTab === 'leaderboard' && isStaffOrAdmin && (
          <div className="lm-card p-4 sm:p-6 space-y-5 min-w-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-b border-white/[0.06] pb-4">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <TrophyIcon className="w-5 h-5 shrink-0 text-orange-200" />
                  <span className="break-words">Class Leaderboard &amp; Standings</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">Rankings across all students evaluated in this class.</p>
              </div>

              <div className="lm-scroll-x -mx-4 sm:mx-0 px-4 sm:px-0 w-full sm:w-auto shrink-0">
                <div className="flex items-center gap-1.5 min-w-max">
                  {(() => {
                  // Two configured activities can normalise to the same storage key
                  // ("Quizzes" and "Quiz"), which would render duplicate chips that
                  // rank identically. Keep the first label for each key.
                  const seen = new Set();
                  return [
                    { key: 'overall', label: 'Overall' },
                    { key: 'sessionals', label: 'Sessionals' },
                    ...sessionalActivitiesList.map(act => ({
                      key: resolveMarkCategory(act.category).key,
                      label: act.category
                    })),
                    ...((classroom.mids?.totalMarks > 0) ? [{ key: 'mids', label: 'Mids' }] : []),
                    ...((classroom.finals?.totalMarks > 0) ? [{ key: 'finals', label: 'Finals' }] : []),
                  ].filter(f => f.key && (f.key === 'overall' || f.key === 'sessionals' || !seen.has(f.key) && seen.add(f.key)));
                })().map((filter) => (
                    <button
                      type="button"
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

            <div className="lm-scroll-x">
              <table className="lm-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Roll Number</th>
                    <th>Student Name</th>
                    <th className="text-right">Score Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {getSortedLeaderboard().length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-10 px-4 text-slate-500 italic">No evaluation rankings generated yet. Start grading students to populate leaderboard.</td>
                    </tr>
                  ) : (
                    getSortedLeaderboard().map((entry, idx) => {
                      const studentObj = entry.student || {};
                      const studentName = studentObj.name || 'Unknown Student';
                      const studentRoll = studentObj.rollNo || 'N/A';

                      const currentScore = scoreForFilter(entry, leaderboardFilter);

                      return (
                        <tr key={idx}>
                          <td className="font-mono font-bold text-amber-200 whitespace-nowrap">
                            {idx === 0 ? (
                              <span className="inline-flex items-center gap-1.5"><StarIcon className="w-4 h-4" />#1</span>
                            ) : idx === 1 ? (
                              <span className="inline-flex items-center gap-1.5"><RectangleStackIcon className="w-4 h-4" />#2</span>
                            ) : idx === 2 ? (
                              <span className="inline-flex items-center gap-1.5"><RectangleStackIcon className="w-4 h-4" />#3</span>
                            ) : (
                              <span>#{idx + 1}</span>
                            )}
                          </td>
                          <td className="font-mono text-orange-200 font-bold break-words">{studentRoll}</td>
                          <td className="text-slate-100 font-medium min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate min-w-0">{studentName}</span>
                              {isStaffOrAdmin && (
                                <button type="button" onClick={() => openStudentProfile(studentObj)} className="lm-btn-ghost px-2 py-1 text-[10px] shrink-0"><EyeIcon className="lm-ico" />Profile</button>
                              )}
                            </div>
                          </td>
                          <td className="font-mono font-extrabold text-emerald-300 text-right">
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
          const itemsList = [...getItemsForCategory(cat)].reverse();

          return (
            <div key={cat} className="lm-card p-4 sm:p-6 space-y-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider break-words min-w-0">{cat} Activity Portal</h3>
                <span className="text-xs font-mono text-slate-400 shrink-0">Allocated Weight: <strong className="text-orange-200">{act.allocatedMarks} Marks</strong></span>
              </div>
              {itemsList.length === 0 ? (
                <div className="lm-inset p-6 text-center">
                  <FolderIcon className="w-7 h-7 mx-auto text-slate-600" />
                  <p className="text-slate-400 text-xs italic mt-2">No {cat.toLowerCase()} created yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {itemsList.map((item, idx) => {
                    let studentItemScore = null;
                    if (studentMark) {
                      if (studentMark[targetKey]) {
                        studentItemScore = studentMark[targetKey].find(e => e.title?.trim().toLowerCase() === item.title?.trim().toLowerCase());
                      }
                    }

                    const itemAvgPct = getItemClassAverage(targetKey, item.title, cat);
                    const itemAvgRaw = getItemClassAverageRaw(targetKey, item.title, cat);
                    const gradedCount = getItemGradedCount(targetKey, item.title, cat);
                    const ungradedCount = Math.max(0, totalStudentsCount - gradedCount);

                    const obtained = studentItemScore?.obtainedMarks ?? 0;
                    const total = Number(item.totalMarks || 10);
                    const studentPercentage = total > 0 ? ((obtained / total) * 100).toFixed(2) : '0.00';
                    const hasPhoto = studentItemScore?.file && studentItemScore.file.url;

                    return (
                      <div 
                        key={idx} 
                        className="lm-inset p-4 sm:p-5 space-y-4 transition-all duration-200 hover:-translate-y-px flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-orange-200 ring-1 ring-inset ring-white/50"></span>
                              <h4 className="text-slate-100 font-black text-sm sm:text-base tracking-wide break-words min-w-0">{item.title}</h4>
                            </div>
                            <span className="lm-badge font-mono shrink-0">
                              {total} Marks
                            </span>
                          </div>

                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="lm-inset rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5">
                              <div className="space-y-1 min-w-0">
                                <div>
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-bold tracking-wider">Your Score</span>
                                  <span className="font-mono text-emerald-300 font-black text-sm sm:text-base break-words">
                                    {studentItemScore ? (studentItemScore.isAbsent ? 'Marked Absent' : `${obtained} / ${total}`) : 'Pending'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-white/[0.06]">
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-bold tracking-wider">Class Avg Score</span>
                                  <span className="font-mono text-orange-200 font-bold text-xs sm:text-sm break-words">
                                    {itemAvgRaw} / {total}
                                  </span>
                                </div>
                              </div>
                              <div className="text-left sm:text-right space-y-1 min-w-0">
                                <div>
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-bold tracking-wider">Your %</span>
                                  <span className="font-mono text-orange-200 font-black text-sm sm:text-base break-words">
                                    {/* Absent is a real 0%, not missing data - showing "N/A" hid a genuine zero. */}
                                    {studentItemScore
                                       ? studentItemScore.isBypassed
                                         ? 'Bypassed'
                                         : `${studentPercentage}%`
                                       : 'Pending'}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-white/[0.06]">
                                  <span className="text-[10px] sm:text-xs text-slate-400 uppercase block font-bold tracking-wider">Class Avg %</span>
                                  <span className="font-mono text-orange-200 font-bold text-xs sm:text-sm break-words">
                                    {itemAvgPct}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="lm-inset rounded-xl p-3.5 space-y-2 text-xs">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-400 font-bold uppercase shrink-0">Class Average:</span>
                                <strong className="text-orange-200 font-mono text-right break-words">{itemAvgPct}% ({itemAvgRaw} / {total})</strong>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-400 font-bold uppercase shrink-0">Grading Progress:</span>
                                <span className="font-mono text-emerald-300 font-bold text-right break-words">{gradedCount} / {totalStudentsCount} Evaluated</span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
                          {user?.role === 'STUDENT' && !isAssignedTa ? (
                            <div className="w-full flex items-center justify-between gap-3">
                              <span className="text-[10px] sm:text-xs text-slate-500 italic">Submission Status Active</span>
                              {hasPhoto && (
                                <button 
                                  type="button"
                                  onClick={() => setSelectedActivityItem({ item, targetKey, category: cat, scoreData: studentItemScore })}
                                  className="lm-btn-ghost shrink-0 text-orange-200 hover:text-orange-100"
                                >
                                  <CameraIcon className="w-4 h-4" />
                                  View Photo
                                </button>
                              )}
                            </div>
                          ) : (
                            isStaffOrAdmin && (
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                                {ungradedCount > 0 ? (
                                  <button 
                                    type="button"
                                    onClick={() => handleTabletClick(item, targetKey, cat, true)}
                                    className="lm-btn-ghost flex-1 border-amber-500/40 text-amber-300 hover:text-amber-200"
                                  >
                                    <ExclamationTriangleIcon className="w-4 h-4" />
                                    Grade Remaining ({ungradedCount})
                                  </button>
                                ) : (
                                  <span className="lm-badge flex-1 justify-center py-2 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-mono font-bold">
                                    <CheckIcon className="w-4 h-4" />
                                    All Graded
                                  </span>
                                )}
                                <button 
                                  type="button"
                                  onClick={() => handleTabletClick(item, targetKey, cat, false)}
                                  className="lm-btn flex-1"
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
          <div className="lm-modal lm-modal-wide max-w-3xl p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase break-words">Class Roster &amp; Hierarchy</h3>
              <button type="button" onClick={() => setIsMembersModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            <div className="max-h-[55vh] sm:max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              <div className="space-y-1.5">
                <p className="lm-eyebrow text-orange-300">Instructor</p>
                <div className="lm-inset border-orange-400/25 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-slate-100 font-bold break-words">{classroom.teacher?.name || classroom.placeholderTeacherName || 'TBA'}</p>
                    <p className="font-mono text-orange-200 break-all">{classroom.teacher?.email || 'Primary Instructor'}</p>
                  </div>
                  <span className="lm-badge shrink-0 border-orange-400/25 bg-orange-400/10 text-orange-200">Teacher</span>
                </div>
              </div>

              {(classroom.tas || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="lm-eyebrow text-rose-300">Teaching Assistants (TAs)</p>
                  {(classroom.tas || []).map((ta, i) => (
                    <div key={i} className="lm-inset border-rose-400/25 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-slate-100 font-bold break-words">{ta.name || 'TA Member'}</p>
                        <p className="font-mono text-rose-200 break-all">{ta.rollNo || ta.email || 'N/A'}</p>
                      </div>
                      <span className="lm-badge shrink-0 border-rose-400/25 bg-rose-400/10 text-rose-200">TA</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="lm-eyebrow">Enrolled Students ({activeStudents.length})</p>
                {activeStudents.map((st, i) => (
                  <div key={i} className="lm-inset p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="text-slate-100 font-bold break-words">{st.name}</p>
                      <p className="font-mono text-orange-200 break-all">{st.rollNo}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                      {isStaffOrAdmin && (
                        <>
                          <button type="button" onClick={() => openStudentProfile(st)} title="View Profile" aria-label="View Profile" className="lm-btn-ghost px-2 py-1.5 text-[10px]"><EyeIcon className="lm-ico" />Profile</button>
                          <button type="button" onClick={() => handleStaffResetStudentPassword(st._id, st.name)} title="Reset Password" aria-label="Reset Password" className="lm-btn-ghost px-2 py-1.5 text-[10px]"><KeyIcon className="lm-ico" />Reset</button>
                          <button type="button" onClick={() => handleRemoveStudent(st._id, st.name)} title="Remove Student" aria-label="Remove Student" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-500/40 transition-all cursor-pointer shrink-0">
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button type="button" onClick={() => setIsMembersModalOpen(false)} className="lm-btn-ghost w-full py-3">Close Roster</button>
          </div>
        </div>
      )}

      {/* STUDENT PROFILE POPUP */}
      {isStudentProfileModalOpen && profileStudent && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-lg p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-4">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase flex items-center gap-2">
                <EyeIcon className="w-5 h-5 shrink-0" />
                <span className="break-words">Student Profile</span>
              </h3>
              <button type="button" onClick={() => setIsStudentProfileModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-orange-100 via-orange-200 to-orange-400 flex items-center justify-center text-xl font-black text-slate-950 shadow-lift">
                {(profileStudent.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h4 className="text-slate-100 font-bold text-base sm:text-lg break-words">{profileStudent.name}</h4>
                <p className="text-slate-400 font-mono text-xs break-words">Roll: <span className="text-orange-200">{profileStudent.rollNo}</span></p>
                {profileStudent.email && <p className="text-slate-500 font-mono text-[10px] break-all">{profileStudent.email}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="lm-inset rounded-2xl p-3 text-center">
                <p className="text-[10px] sm:text-xs text-amber-300 uppercase font-bold tracking-wider">Class Rank</p>
                <p className="text-slate-100 font-black text-xl sm:text-2xl font-mono">{profileStudent.rank}</p>
              </div>
              <div className="lm-inset rounded-2xl p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider">Overall</p>
                <p className="text-emerald-300 font-black text-xl sm:text-2xl font-mono">{profileStudent.overall}%</p>
              </div>
              <div className="lm-inset rounded-2xl p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider">Sessional</p>
                <p className="text-orange-200 font-black text-xl sm:text-2xl font-mono">{profileStudent.sessional}%</p>
              </div>
              <div className="lm-inset rounded-2xl p-3 text-center">
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider">Mids</p>
                <p className="text-sky-300 font-black text-xl sm:text-2xl font-mono">{profileStudent.mids}%</p>
              </div>
            </div>

            <div>
              <h5 className="lm-eyebrow mb-2 flex items-center gap-1.5">
                <PencilSquareIcon className="lm-ico" />
                Marks in All Activities
              </h5>
              <div className="space-y-3 max-h-[32vh] overflow-y-auto pr-1">
                {sessionalActivitiesList.map((act) => {
                  const targetKey = getCategoryTargetKey(act.category);
                  const itemsList = getItemsForCategory(act.category);
                  if (itemsList.length === 0) return null;
                  const mdoc = profileStudent.marksDoc || {};
                  const catScores = mdoc[targetKey] || [];
                  return (
                    <div key={act.category} className="lm-inset rounded-2xl p-3.5 space-y-1.5">
                      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-orange-200">{act.category}</p>
                      {itemsList.map((item, idx) => {
                        const score = (Array.isArray(catScores) ? catScores : []).find(s => s.title?.trim().toLowerCase() === item.title?.trim().toLowerCase());
                        const obtained = score && !score.isAbsent ? score.obtainedMarks : null;
                        const total = Number(item.totalMarks || 0);
                        return (
                          <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-slate-300 min-w-0 break-words">{item.title}</span>
                            <span className={`font-mono font-bold shrink-0 ${obtained === null ? 'text-slate-600' : score.isAbsent ? 'text-amber-300' : 'text-emerald-300'}`}>
                              {score && score.isAbsent ? 'ABSENT' : obtained === null ? 'Ungraded' : `${obtained} / ${total}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {profileStudent.finals !== undefined && studentMark && (
                  <div className="lm-inset rounded-2xl p-3.5 space-y-1.5">
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-300">Finals</p>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-300">Final Exam</span>
                      <span className="font-mono font-bold text-emerald-300 shrink-0">{profileStudent.finals}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Create Result Sheet Modal */}
      {isItemModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase break-words">Create Evaluation Item</h3>
              <button type="button" onClick={() => setIsItemModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setItemCreationMode('all')} className={`lm-chip justify-center whitespace-normal text-center leading-tight py-2.5 ${itemCreationMode === 'all' ? 'lm-chip-active' : ''}`}>Whole Class</button>
              <button type="button" onClick={() => setItemCreationMode('range')} className={`lm-chip justify-center whitespace-normal text-center leading-tight py-2.5 ${itemCreationMode === 'range' ? 'lm-chip-active' : ''}`}>Roll Number Range</button>
            </div>

            <form onSubmit={handleCreateAndOpenSheet} className="space-y-4">
              <div>
                <label className="block lm-eyebrow mb-1.5">Category</label>
                <select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className="lm-field uppercase font-mono">
                  {sessionalActivitiesList.map(act => (
                    <option key={act.category} value={act.category}>{act.category}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block lm-eyebrow mb-1.5">Item Title</label>
                <input type="text" required placeholder="e.g. Lab Task 1" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} className="lm-field" />
              </div>
              <div>
                <label className="block lm-eyebrow mb-1.5">Total Marks</label>
                <input type="number" required min="1" value={itemTotalMarks} onChange={(e) => setItemTotalMarks(e.target.value)} className="lm-field font-mono" />
              </div>

              {itemCreationMode === 'range' && (
                <div className="lm-inset p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] sm:text-xs font-bold uppercase text-slate-400 mb-1">Start Suffix</label>
                    <input type="number" required placeholder="1" value={itemStartRoll} onChange={(e) => setItemStartRoll(e.target.value)} className="lm-field px-2.5 py-2 text-xs font-mono" />
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-bold uppercase text-slate-400 mb-1">End Suffix</label>
                    <input type="number" required placeholder="25" value={itemEndRoll} onChange={(e) => setItemEndRoll(e.target.value)} className="lm-field px-2.5 py-2 text-xs font-mono" />
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => setIsItemModalOpen(false)} className="lm-btn-ghost w-full sm:w-1/2 py-3">Cancel</button>
                <button type="submit" disabled={creatingItem} className="lm-btn w-full sm:w-1/2">
                  {creatingItem ? 'Opening...' : 'Open Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Excel Upload Sync Modal */}
      {isExcelModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase flex items-center gap-2 min-w-0">
                <ChartBarIcon className="w-5 h-5 shrink-0" />
                <span className="break-words">Sync Marks via Excel/CSV</span>
              </h3>
              <button type="button" onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            {syncReport ? (
              <div className="space-y-4">
                <div className="lm-inset border-emerald-500/40 bg-emerald-950/30 p-4 rounded-2xl space-y-2">
                  <p className="text-emerald-300 font-bold text-xs flex items-center gap-1.5">
                    <CheckCircleIcon className="w-4 h-4 shrink-0" />
                    Sync Complete Successfully!
                  </p>
                  <p className="text-xs text-slate-300">Total Rows Processed: <strong className="font-mono text-slate-100">{syncReport.totalProcessed || 0}</strong></p>
                  <p className="text-xs text-slate-300">Successfully Updated: <strong className="font-mono text-emerald-300">{syncReport.updatedCount || 0}</strong></p>
                  {syncReport.errors?.length > 0 && (
                    <p className="text-xs text-amber-300">Warnings/Skipped: {syncReport.errors.length}</p>
                  )}
                </div>
                <button type="button" onClick={() => { setIsExcelModalOpen(false); setSyncReport(null); setExcelFile(null); }} className="lm-btn w-full py-3">Done</button>
              </div>
            ) : (
              <form onSubmit={handleExcelSyncSubmit} className="space-y-4">
                <div>
                  <label className="block lm-eyebrow mb-1.5">Category</label>
                  <select value={excelCategory} onChange={(e) => setExcelCategory(e.target.value)} className="lm-field uppercase font-mono">
                    {sessionalActivitiesList.map(act => (
                      <option key={act.category} value={act.category}>{act.category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block lm-eyebrow mb-1.5">Evaluation Title</label>
                  <input type="text" required placeholder="e.g. Lab Task 1" value={excelTitle} onChange={(e) => setExcelTitle(e.target.value)} className="lm-field" />
                </div>
                <div>
                  <label className="block lm-eyebrow mb-1.5">Total Marks</label>
                  <input type="number" required min="1" value={excelTotalMarks} onChange={(e) => setExcelTotalMarks(e.target.value)} className="lm-field font-mono" />
                </div>
                <div>
                  <label className="block lm-eyebrow mb-1.5">Upload CSV / Excel File</label>
                  <input type="file" required accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => setExcelFile(e.target.files[0])} className="lm-field cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-orange-300 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-slate-950 hover:file:bg-orange-200" />
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-1.5 break-words">File must include columns for Roll Number / Reg ID and Marks Obtained.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button type="button" onClick={() => setIsExcelModalOpen(false)} className="lm-btn-ghost w-full sm:w-1/2 py-3">Cancel</button>
                  <button type="submit" disabled={syncingExcel} className="lm-btn w-full sm:w-1/2">
                    {syncingExcel ? 'Syncing...' : 'Upload &amp; Sync'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. Advanced Add Student Modal */}
      {isAddStudentModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-lg p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-100 uppercase break-words">Enroll Students (4 Pathways)</h3>
              <button type="button" onClick={() => { setIsAddStudentModalOpen(false); setLookupTargetStudent(null); }} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {addStudentError && <div className="p-3 bg-red-950/70 border border-red-500/60 text-red-200 rounded-xl text-xs break-words">{addStudentError}</div>}
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button type="button" onClick={() => setAddModeType('suffix')} className={`lm-chip justify-center whitespace-normal text-center leading-tight py-2.5 ${addModeType === 'suffix' ? 'lm-chip-active' : ''}`}>1. Suffix List</button>
              <button type="button" onClick={() => setAddModeType('range')} className={`lm-chip justify-center whitespace-normal text-center leading-tight py-2.5 ${addModeType === 'range' ? 'lm-chip-active' : ''}`}>2. Range</button>
              <button type="button" onClick={() => setAddModeType('addDrop')} className={`lm-chip justify-center whitespace-normal text-center leading-tight py-2.5 ${addModeType === 'addDrop' ? 'lm-chip-active' : ''}`}>3. Add/Drop</button>
              <button type="button" onClick={() => setAddModeType('autoDetect')} className={`lm-chip justify-center whitespace-normal text-center leading-tight py-2.5 ${addModeType === 'autoDetect' ? 'lm-chip-active' : ''}`}>4. Smart Detect<span className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono ${addModeType === 'autoDetect' ? 'bg-black/25 text-black' : 'bg-slate-700 text-emerald-300'}`}>{availableAutoStudents.filter(s => s.isAlreadyEnrolled).length}</span></button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-4">
              {addModeType === 'suffix' && (
                <div className="space-y-2">
                  <label className="block lm-eyebrow">Roll Number Suffixes (Comma or Newline Separated)</label>
                  <textarea 
                    rows="3" 
                    required 
                    placeholder="3, 53, 23, 104" 
                    value={suffixInput} 
                    onChange={(e) => setSuffixInput(e.target.value)} 
                    className="lm-field font-mono resize-none" 
                  />
                  <p className="text-[10px] sm:text-xs text-slate-500 break-words">
                    Automatically prepends course prefix (<span className="font-mono text-orange-200">{classroom?.sectionPrefix}</span>) to short numbers.
                  </p>
                </div>
              )}

              {addModeType === 'range' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block lm-eyebrow mb-1">Start Suffix #</label>
                      <input type="number" required placeholder="1" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} className="lm-field font-mono" />
                    </div>
                    <div>
                      <label className="block lm-eyebrow mb-1">End Suffix #</label>
                      <input type="number" required placeholder="50" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} className="lm-field font-mono" />
                    </div>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 break-words">
                    Range iterates from start to end with prefix <span className="font-mono text-orange-200">{classroom?.sectionPrefix}</span>.
                  </p>
                </div>
              )}

              {addModeType === 'addDrop' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block lm-eyebrow">Full Roll Number or Registration No</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="text" 
                        placeholder="e.g. BSITF23M025 or 2023123" 
                        value={addDropInput} 
                        onChange={(e) => { setAddDropInput(e.target.value); setLookupTargetStudent(null); }} 
                        className="lm-field flex-1 min-w-0 font-mono uppercase" 
                      />
                      <button 
                        type="button" 
                        onClick={handleLookupStudentForAddDrop} 
                        disabled={lookingUpStudent || !addDropInput.trim()}
                        className="lm-btn-ghost shrink-0 border-orange-400/30 text-orange-200 hover:text-orange-100"
                      >
                        <MagnifyingGlassIcon className="w-4 h-4" />
                        {lookingUpStudent ? 'Searching...' : 'Lookup'}
                      </button>
                    </div>
                  </div>

                  {lookupTargetStudent && (
                    <div className="lm-inset border-emerald-500/40 p-4 rounded-2xl space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 uppercase shrink-0">Student Name:</span>
                        <strong className="text-slate-100 text-right break-words min-w-0">{lookupTargetStudent.name}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-400 uppercase shrink-0">Roll / Reg No:</span>
                        <strong className="font-mono text-orange-200 break-all min-w-0">{lookupTargetStudent.rollNo}</strong>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-400 uppercase">Status:</span>
                        <span className={`lm-badge ${lookupTargetStudent.isAlreadyEnrolled ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
                          {lookupTargetStudent.isAlreadyEnrolled ? 'Already Enrolled' : lookupTargetStudent.isAddDrop ? 'Add/Drop Senior' : 'Regular Prefix Match'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {addModeType === 'autoDetect' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="lm-eyebrow">Matching Prefix Students ({availableAutoStudents.length})</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="lm-badge border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                        <CheckCircleIcon className="lm-ico" />
                        Enrolled <b className="font-mono">{availableAutoStudents.filter(s => s.isAlreadyEnrolled).length}</b>
                      </span>
                      <span className="lm-badge border-orange-400/40 bg-orange-400/10 text-orange-200">
                        <CheckCircleIcon className="lm-ico" />
                        Available <b className="font-mono">{availableAutoStudents.filter(s => !s.isAlreadyEnrolled).length}</b>
                      </span>
                      <button 
                        type="button"
                        onClick={() => setSelectedAutoStudentIds(availableAutoStudents.filter(s => !s.isAlreadyEnrolled).map(s => s._id))}
                        className="lm-btn-ghost text-[10px]"
                      >
                        Select All Unenrolled
                      </button>
                    </div>
                  </div>
                   
                  <div className="lm-inset max-h-56 overflow-y-auto space-y-2 p-2">
                    {loadingAutoStudents ? (
                      <div className="py-4 text-center space-y-2">
                        <div className="lm-bar mx-auto"></div>
                        <p className="text-xs text-slate-500">Scanning database for matching students...</p>
                      </div>
                    ) : availableAutoStudents.length === 0 ? (
                      <p className="text-center text-xs text-slate-500 py-4 italic break-words">No matching students found for prefix {classroom?.sectionPrefix}.</p>
                    ) : (
                      [...availableAutoStudents]
                        .sort((a, b) => Number(a.isAlreadyEnrolled) - Number(b.isAlreadyEnrolled))
                        .map(student => (
                        <div key={student._id} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs transition-all ${
                          student.isAlreadyEnrolled ? 'bg-slate-900/40 border-white/5 opacity-60 cursor-not-allowed select-none' : 'lm-card-flat hover:border-orange-300/40'
                        }`}>
                          <div className="flex items-center gap-2.5 truncate min-w-0">
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
                              className="rounded accent-orange-300 shrink-0"
                            />
                            <div className="truncate min-w-0">
                              <p className="text-slate-100 font-bold truncate">{student.name}</p>
                              <p className="font-mono text-[10px] text-orange-200">{student.rollNo}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`lm-badge ${student.isAlreadyEnrolled ? 'text-slate-400' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}>
                              {student.isAlreadyEnrolled ? 'Enrolled' : 'Available'}
                            </span>
                            {!student.isAlreadyEnrolled && (
                              <button 
                                type="button"
                                disabled={rejectingRoll === student.rollNo}
                                onClick={() => handleToggleRejectStudent(student)}
                                title="Hide from Smart Detect (manual enrollment still available)"
                                aria-label="Hide from Smart Detect (manual enrollment still available)"
                                className="lm-btn-ghost px-2 py-1 text-[10px] border-red-500/40 text-red-300 hover:text-red-200"
                              >
                                {rejectingRoll === student.rollNo ? '…' : <><XMarkIcon className="lm-ico" />Reject</>}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {rejectedRolls.length > 0 && (
                    <div className="lm-inset border-red-500/30 p-2.5 rounded-xl space-y-1.5">
                      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-red-300 flex items-start gap-1.5">
                        <ExclamationTriangleIcon className="lm-ico mt-0.5 shrink-0" />
                        <span>Hidden from Smart Detect ({rejectedRolls.length}) — add these manually if needed</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {rejectedRolls.map((roll, i) => (
                          <button 
                            key={i} 
                            type="button" 
                            disabled={rejectingRoll === roll}
                            onClick={() => handleToggleRejectStudent({ _id: 'restore', rollNo: roll })}
                            title="Restore into Smart Detect"
                            className="lm-btn-ghost px-2 py-1 font-mono border-red-500/30 text-red-300 hover:text-red-200"
                          >
                            {rejectingRoll === roll ? '…' : <><ArrowPathIcon className="lm-ico" />{roll}</>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button type="button" onClick={() => setIsAddStudentModalOpen(false)} className="lm-btn-ghost w-full sm:w-1/2 py-3">Cancel</button>
                <button 
                  type="submit" 
                  disabled={addingStudent || (addModeType === 'addDrop' && !lookupTargetStudent)} 
                  className="lm-btn w-full sm:w-1/2"
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
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase break-words">Assign Teaching Assistant</h3>
              <button type="button" onClick={() => setIsTaModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleLookupTa} className="space-y-3">
              <input type="text" required placeholder="Enter student roll number" value={taRollNo} onChange={(e) => setTaRollNo(e.target.value)} className="lm-field font-mono uppercase" />
              <button type="submit" disabled={taSearching} className="lm-btn-ghost w-full py-2.5 border-orange-400/30 text-orange-200 hover:text-orange-100">
                <MagnifyingGlassIcon className="w-4 h-4" />
                {taSearching ? 'Searching...' : 'Lookup Student'}
              </button>
            </form>
            {taLookupResult && (
              <div className="lm-inset p-4 rounded-2xl space-y-3">
                {taLookupResult.status === 'not_found' ? (
                  <p className="text-red-300 text-xs flex items-start gap-1.5 break-words">
                    <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{taLookupResult.message}</span>
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-100 break-words">Found: <strong className="text-orange-200">{taLookupResult.user.name}</strong> ({taLookupResult.user.rollNo})</p>
                    <button type="button" onClick={() => handleConfirmAddTa(taLookupResult.user._id)} className="lm-btn w-full py-2.5">Assign as TA</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. Assign Teacher Modal */}
      {isAssignTeacherModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase break-words">Assign Instructor</h3>
              <button type="button" onClick={() => setIsAssignTeacherModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleLookupTeacher} className="space-y-3">
              <input type="text" required placeholder="Enter teacher email or ID" value={teacherRollNo} onChange={(e) => setTeacherRollNo(e.target.value)} className="lm-field font-mono" />
              <button type="submit" disabled={teacherSearching} className="lm-btn-ghost w-full py-2.5 border-orange-400/30 text-orange-200 hover:text-orange-100">
                <MagnifyingGlassIcon className="w-4 h-4" />
                {teacherSearching ? 'Searching...' : 'Lookup Teacher'}
              </button>
            </form>
            {teacherLookupResult && (
              <div className="lm-inset p-4 rounded-2xl space-y-3">
                {teacherLookupResult.status === 'not_found' ? (
                  <p className="text-red-300 text-xs flex items-start gap-1.5 break-words">
                    <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{teacherLookupResult.message}</span>
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-100 break-words">Found: <strong className="text-orange-200">{teacherLookupResult.user.name}</strong> ({teacherLookupResult.user.email})</p>
                    <button type="button" onClick={() => handleConfirmAssignTeacher(teacherLookupResult.user._id)} className="lm-btn w-full py-2.5">Confirm Assignment</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. Settings Modal */}
      {/* Read-only bypass limits for TAs, who cannot open Classroom Settings but
          still need to see the caps that constrain the grades they can enter. */}
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
              apiBase="/classroommarks"
              roomId={classroomId}
              roomType="classroom"
              customCategories={editSessionalActivities}
              canEdit={false}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      {isSettingsModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-lg p-4 sm:p-6 lg:p-8 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-3">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-100 uppercase break-words">Classroom Settings &amp; Weights</h3>
              <button type="button" onClick={() => setIsSettingsModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            {/* Bypass limits have their own tab. They save through their own
                endpoint and their own button, so they must not sit inside the
                settings <form> - a submit there would fire the wrong save. */}
            <div className="flex gap-1 rounded-lg bg-black/30 p-1 border border-white/[0.06]" role="tablist" aria-label="Classroom settings sections">
              <button
                type="button"
                role="tab"
                aria-selected={settingsTab === 'general'}
                onClick={() => setSettingsTab('general')}
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  settingsTab === 'general'
                    ? 'bg-orange-500/15 text-orange-200 border border-orange-400/30'
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
                className={`flex-1 rounded-md px-3 py-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  settingsTab === 'bypass'
                    ? 'bg-orange-500/15 text-orange-200 border border-orange-400/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Bypass Limits
              </button>
            </div>

            {settingsTab === 'general' && (
            <>
            <form onSubmit={handleUpdateClassSettings} className="space-y-4">
              <div>
                <label className="block lm-eyebrow mb-1">Class Name</label>
                <input type="text" required value={editClassName} onChange={(e) => setEditClassName(e.target.value)} className="lm-field" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block lm-eyebrow mb-1">Section Prefix</label>
                  <input type="text" required value={editSectionPrefix} onChange={(e) => setEditSectionPrefix(e.target.value)} className="lm-field uppercase font-mono" />
                </div>
                <div>
                  <label className="block lm-eyebrow mb-1">Max Capacity</label>
                  <input type="number" required value={editMaxCapacity} onChange={(e) => setEditMaxCapacity(e.target.value)} className="lm-field font-mono" />
                </div>
              </div>
              <div>
                <label className="block lm-eyebrow mb-1">Placeholder Teacher Name</label>
                <input type="text" value={editPlaceholderTeacher} onChange={(e) => setEditPlaceholderTeacher(e.target.value)} className="lm-field" />
              </div>

              <div className="pt-3 border-t border-white/[0.06] space-y-3">
                <p className="lm-eyebrow text-orange-300">Grading Weights Distribution (%)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-400 block mb-1">Sessionals</span>
                    <input type="number" value={editSessionalWeight} onChange={(e) => setEditSessionalWeight(e.target.value)} className="lm-field px-2 py-1.5 rounded-lg text-xs font-mono" />
                  </div>
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-400 block mb-1">Mids</span>
                    <input type="number" value={editMidsWeight} onChange={(e) => setEditMidsWeight(e.target.value)} className="lm-field px-2 py-1.5 rounded-lg text-xs font-mono" />
                  </div>
                  <div>
                    <span className="text-[10px] sm:text-xs text-slate-400 block mb-1">Finals</span>
                    <input type="number" value={editFinalsWeight} onChange={(e) => setEditFinalsWeight(e.target.value)} className="lm-field px-2 py-1.5 rounded-lg text-xs font-mono" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.06]">
                <RoomColorPicker
                  value={editColorKey}
                  onChange={setEditColorKey}
                  disabled={updatingSettings}
                />
              </div>

              {/* Strict Preset Sessional Activities Manager */}
              <div className="pt-3 border-t border-white/[0.06] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="lm-eyebrow text-orange-300">Sessional Activities &amp; Mark Allocations</p>
                  <button 
                    type="button" 
                    onClick={() => setEditSessionalActivities([...editSessionalActivities, { category: 'Quizzes', allocatedMarks: 10 }])}
                    className="lm-btn-ghost border-orange-400/30 text-orange-200 hover:text-orange-100"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add Activity
                  </button>
                </div>
                
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {editSessionalActivities.map((act, index) => {
                    const presetOptions = ['Quizzes', 'Assignments', 'Presentations', 'Projects', 'Homework', 'Class Activity', 'Class Participation', 'Vivas', 'Special Marks'];

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
                          className="lm-field flex-1 min-w-0 px-2 py-1.5 rounded-lg text-xs uppercase font-mono"
                        >
                          {(act.category && !presetOptions.includes(act.category)) && (
                            <option value={act.category}>{act.category}</option>
                          )}
                          {presetOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>

                        <input 
                          type="number" 
                          placeholder="Marks" 
                          value={act.allocatedMarks} 
                          onChange={(e) => {
                            const updated = [...editSessionalActivities];
                            updated[index].allocatedMarks = Number(e.target.value);
                            setEditSessionalActivities(updated);
                          }}
                          className="lm-field w-20 shrink-0 px-2 py-1.5 rounded-lg text-xs font-mono" 
                          min="1"
                          required
                        />
                        <button 
                          type="button"
                          aria-label="Remove Activity"
                          title="Remove Activity"
                          onClick={() => {
                            const updated = editSessionalActivities.filter((_, i) => i !== index);
                            setEditSessionalActivities(updated);
                          }}
                          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-950/70 hover:bg-red-900 border border-red-500/40 text-red-300 transition-all cursor-pointer"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="lm-btn-ghost w-full sm:w-1/2 py-2.5">Cancel</button>
                <button type="submit" disabled={updatingSettings} className="lm-btn w-full sm:w-1/2 py-2.5">
                  {updatingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>

            <div className="pt-4 border-t border-red-500/20 space-y-3">
              <p className="lm-eyebrow text-red-300 flex items-center gap-1.5">
                <ExclamationTriangleIcon className="lm-ico" />
                Danger Zone
              </p>
              <form onSubmit={handleDeleteClassroomSubmit} className="space-y-3">
                {deleteError && <p className="text-red-300 text-xs break-words">{deleteError}</p>}
                <p className="text-xs text-slate-300 break-words">Type <strong className="text-slate-100">{classroom.className}</strong> to confirm deletion:</p>
                <input type="text" value={deleteInputName} onChange={(e) => setDeleteInputName(e.target.value)} placeholder="Enter exact class name" className="lm-field" />
                <button type="submit" disabled={deletingClass || deleteInputName.trim() !== classroom.className.trim()} className="lm-btn bg-red-600 w-full py-2.5">
                  {deletingClass ? 'Deleting...' : 'Permanently Delete Class'}
                </button>
              </form>
            </div>
            </>
            )}

            {settingsTab === 'bypass' && (
              <BypassLimitsPanel
                apiBase="/classroommarks"
                roomId={classroomId}
                roomType="classroom"
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
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase break-words">Anonymous Complaint Box</h3>
              <button type="button" onClick={() => setIsComplaintModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSendComplaint} className="space-y-3">
              <textarea rows="4" required placeholder="Write your anonymous query or complaint..." value={complaintText} onChange={(e) => setComplaintText(e.target.value)} className="lm-field resize-none" />
              <button type="submit" disabled={sendingComplaint} className="lm-btn w-full py-3">
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
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm sm:text-base font-extrabold text-orange-200 uppercase break-words">Anonymous Submissions</h3>
              <button type="button" onClick={() => setIsViewComplaintsModalOpen(false)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            {loadingComplaints ? (
              <div className="py-6 space-y-2 text-center">
                <div className="lm-bar mx-auto"></div>
                <p className="text-xs text-slate-400">Loading submissions...</p>
              </div>
            ) : complaintsList.length === 0 ? (
              <div className="lm-inset p-6 text-center">
                <MegaphoneIcon className="w-7 h-7 mx-auto text-slate-600" />
                <p className="text-center text-xs text-slate-500 italic mt-2">No feedback submissions received yet.</p>
              </div>
            ) : (
              <div className="max-h-[55vh] sm:max-h-[60vh] overflow-y-auto space-y-3 pr-1">
                {complaintsList.map((c) => (
                  <div key={c._id || `${c.createdAt}-${c.message}`} className="lm-inset p-4 rounded-2xl space-y-1">
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
            <button type="button" onClick={() => setIsViewComplaintsModalOpen(false)} className="lm-btn-ghost w-full py-2.5">Close</button>
          </div>
        </div>
      )}

      {/* 10. Focused Photo-Only Modal */}
      {selectedActivityItem && (
        <div className="lm-scrim">
          <div className="lm-modal max-w-md p-4 sm:p-5 space-y-4 text-center">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-2">
              <h3 className="text-xs font-bold text-orange-200 uppercase font-mono text-left break-words min-w-0">{selectedActivityItem.item.title} — Uploaded Photo</h3>
              <button type="button" onClick={() => setSelectedActivityItem(null)} aria-label="Close" title="Close" className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors cursor-pointer">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            {selectedActivityItem.scoreData?.file?.url && (
              <div className="lm-inset rounded-2xl p-2 overflow-hidden">
                <img 
                  src={selectedActivityItem.scoreData.file.url} 
                  alt="Activity File" 
                  className="max-h-[55vh] mx-auto rounded-xl border border-white/10 object-contain" 
                />
              </div>
            )}

            <button 
              type="button"
              onClick={() => setSelectedActivityItem(null)} 
              className="lm-btn-ghost w-full py-2.5"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 mt-8 pt-6 border-t border-white/[0.04] text-center text-xs text-slate-600">
        <p className="break-words">© 2026 PUCIT Classroom Portal • All Rights Reserved</p>
      </footer>
    </div>
  );
};


export default ClassroomDetail;