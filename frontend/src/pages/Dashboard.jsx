import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BeakerIcon,
  BookOpenIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CheckIcon,
  Cog6ToothIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserGroupIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import RoomColorPicker from '../components/RoomColorPicker';
import { DEFAULT_ROOM_COLOR, roomCardStyle, roomRowStyle } from '../utils/roomColors';

const Dashboard = () => {
  const { user, logout, updateUser, maintenance, setMaintenance } = useAuth();
  const [classroomsList, setClassroomsList] = useState([]);
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  // Detailed Analytics Modal & Drill-down states
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [selectedAnalyticsTab, setSelectedAnalyticsTab] = useState('users'); // 'users' | 'classrooms' | 'labrooms' | 'pending'
  const [userRoleFilter, setUserRoleFilter] = useState('ALL'); // 'ALL' | 'STUDENT' | 'TEACHER' | 'TA' | 'ADMIN'
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userAssignmentFilter, setUserAssignmentFilter] = useState('ALL'); // 'ALL' | 'UNASSIGNED_USERS' | 'UNASSIGNED_STUDENTS'
  const [detailedAnalyticsData, setDetailedAnalyticsData] = useState({ users: [], teachers: [] });
  const [viewingUser, setViewingUser] = useState(null);
  const [isViewUserModalOpen, setIsViewUserModalOpen] = useState(false);

  // Delete User Confirmation State
  const [userToDelete, setUserToDelete] = useState(null);
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  // Navbar Quick-Pills Detail Modal State
  const [isNavDetailModalOpen, setIsNavDetailModalOpen] = useState(false);
  const [navModalConfig, setNavModalConfig] = useState({ title: '', items: [], type: 'classroom' });

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  
  // Modal state for Create Classroom / Lab popup
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClassData, setNewClassData] = useState({
    name: '',
    courseType: 'CLASSROOM',
    creditHours: 3,
    sectionPrefix: '',
    maxCapacity: 50,
    colorKey: DEFAULT_ROOM_COLOR,
    sessionalWeight: 25,
    midsWeight: 35,
    finalsWeight: 40
  });

  // Dynamic Sessional Activities state for Classrooms
  const [sessionalActivities, setSessionalActivities] = useState([
    { category: 'Quiz', customCategory: '', allocatedMarks: 10 },
    { category: 'Assignment', customCategory: '', allocatedMarks: 15 }
  ]);

  // Dynamic Activities state for Labs
  const [labActivities, setLabActivities] = useState([
    { category: 'Lab Tasks', customCategory: '', allocatedMarks: 50 },
    { category: 'Vivas', customCategory: '', allocatedMarks: 30 },
    { category: 'Lab Tests', customCategory: '', allocatedMarks: 20 }
  ]);

  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  // Approve Teachers modal state (Admin only)
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);

  // Maintenance Toggle modal state (Admin only)
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintMessage, setMaintMessage] = useState(maintenance?.message || 'Portal is undergoing scheduled maintenance.');
  const [togglingMaint, setTogglingMaint] = useState(false);

  // Fresher registration mode + email quota (Admin only)
  const [fresherMode, setFresherMode] = useState(null);
  const [emailQuota, setEmailQuota] = useState(null);
  const [togglingFresherMode, setTogglingFresherMode] = useState(false);

  // Email quota editor (Admin only): daily hard cap + OTP-only reserve
  const [quotaDraft, setQuotaDraft] = useState({ dailyQuota: '', otpReserveThreshold: '' });
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaSaveMsg, setQuotaSaveMsg] = useState('');

  // Student email/roll integrity repair (Admin only)
  const [repairingStudents, setRepairingStudents] = useState(false);
  const [repairMessage, setRepairMessage] = useState('');

  // Edit Profile / Password & Email Verification modal state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    password: '',
    currentPassword: '',
    personalNotificationEmail: user?.personalNotificationEmail || ''
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  // Roll Number & Official Email Missing Check States
  const [isRollNoModalOpen, setIsRollNoModalOpen] = useState(false);
  const [missingRollNoInput, setMissingRollNoInput] = useState('');
  const [rollNoUpdating, setRollNoUpdating] = useState(false);
  const [rollNoMessage, setRollNoMessage] = useState('');

  // PUCIT Email Linking States (For Students)
  const [pucitEmailInput, setPucitEmailInput] = useState('');
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailStep, setEmailStep] = useState('idle'); // 'idle' | 'otp_sent'
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  const navigate = useNavigate();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setFetchError('');
      
      const [classRes, labRes] = await Promise.all([
        API.get('/classrooms').catch((e) => ({ __failed: true, error: e })),
        API.get('/labrooms').catch((e) => ({ __failed: true, error: e }))
      ]);

      const failedReq = classRes.__failed ? classRes.error : (labRes.__failed ? labRes.error : null);
      if (failedReq) {
        const resp = failedReq.response;
        const isMaint = resp?.status === 503 || resp?.data?.isUnderMaintenance;
        if (isMaint) {
          setMaintenance({
            isUnderMaintenance: true,
            message: resp?.data?.message || maintenance?.message || 'Portal is currently undergoing scheduled maintenance.',
            retryAfter: resp?.data?.retryAfter
          });
        } else {
          setFetchError('Could not load your courses from the server right now. Please try again.');
        }
      }

      const classrooms = classRes.__failed ? [] : (classRes.data?.data?.classrooms || classRes.data?.classrooms || []);
      const labrooms = labRes.__failed ? [] : (labRes.data?.data?.labrooms || labRes.data?.data?.labrooms || []);

      const formattedLabs = labrooms.map(lab => ({
        ...lab,
        _id: lab._id || lab.id || lab.labId,
        courseType: 'LAB',
        className: lab.labName || lab.name || 'Untitled Lab'
      }));

      const formattedClasses = classrooms.map(cls => ({
        ...cls,
        _id: cls._id || cls.id || cls.classId,
        courseType: 'CLASSROOM',
        className: cls.className || cls.name || 'Untitled Classroom'
      }));

      setClassroomsList([...formattedClasses, ...formattedLabs]);

      if (user?.role === 'ADMIN') {
        fetchAdminData();
      }
    } catch (err) {
      console.error('Failed to sync dashboard data:', err);
      setFetchError(err.response?.data?.message || 'Could not connect to server to fetch courses.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async () => {
    try {
      setLoadingPending(true);
      const [pendingRes, analyticsRes, usersRes, quotaRes, modeRes] = await Promise.all([
        API.get('/auth/admin/pending-teachers').catch(() => null),
        API.get('/auth/admin/analytics').catch(() => null),
        API.get('/auth/admin/users').catch(() => ({ data: { data: { users: [] } } })),
        API.get('/auth/admin/email-quota').catch(() => null),
        API.get('/auth/registration-mode').catch(() => null)
      ]);

      const fetchedQuota = quotaRes?.data?.data?.emailQuota;
      if (fetchedQuota) {
        setEmailQuota(fetchedQuota);
        setQuotaDraft({ dailyQuota: String(fetchedQuota.dailyQuota), otpReserveThreshold: String(fetchedQuota.otpReserveThreshold) });
      }
      const fetchedMode = modeRes?.data?.data?.fresherRegistrationEnabled;
      if (typeof fetchedMode === 'boolean') setFresherMode(fetchedMode);

      const teachers = pendingRes?.data?.data?.teachers || [];
      if (pendingRes?.data?.data?.teachers) {
        setPendingTeachers(teachers);
      }
      
      let fetchedUsers = usersRes?.data?.data?.users || usersRes?.data?.users || [];
      
      if (analyticsRes?.data?.data) {
        setAnalytics(analyticsRes.data.data);
      } else {
        setAnalytics({
          totalUsers: fetchedUsers.length || 1,
          totalClassrooms: classroomsList.filter(c => c.courseType !== 'LAB').length,
          totalLabrooms: classroomsList.filter(c => c.courseType === 'LAB').length
        });
      }

      setDetailedAnalyticsData({
        users: fetchedUsers,
        teachers: teachers
      });
    } catch {
      console.warn('Failed to fetch admin backend data');
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleToggleFresherMode = async () => {
    if (togglingFresherMode) return;
    setTogglingFresherMode(true);
    try {
      const res = await API.post('/auth/admin/registration-mode', { fresherRegistrationEnabled: !fresherMode });
      const updated = res.data?.data?.fresherRegistrationEnabled;
      if (typeof updated === 'boolean') setFresherMode(updated);
    } catch (err) {
      console.warn('Failed to toggle fresher registration mode:', err?.response?.data?.message || err.message);
    } finally {
      setTogglingFresherMode(false);
    }
  };

  // Admin: save the daily email hard cap + OTP-only reserve threshold
  const handleSaveQuota = async () => {
    if (savingQuota) return;
    setSavingQuota(true);
    setQuotaSaveMsg('');
    try {
      const daily = Number(quotaDraft.dailyQuota);
      const reserve = Number(quotaDraft.otpReserveThreshold);
      if (!Number.isFinite(daily) || daily < 1 || !Number.isFinite(reserve) || reserve < 1) {
        setQuotaSaveMsg('Both limits must be positive whole numbers.');
        return;
      }
      await API.patch('/auth/admin/email-quota', { dailyQuota: daily, otpReserveThreshold: reserve });
      setQuotaSaveMsg('Saved. Apply for the next email.');
      fetchAdminData();
    } catch (err) {
      setQuotaSaveMsg(err.response?.data?.message || 'Failed to save email quota settings.');
    } finally {
      setSavingQuota(false);
    }
  };

  // Admin: zero the daily email counter immediately
  const handleResetQuota = async () => {
    if (savingQuota) return;
    setSavingQuota(true);
    try {
      await API.post('/auth/admin/email-quota/reset');
      setQuotaSaveMsg('Daily counter reset. Emails can be sent again.');
      fetchAdminData();
    } catch (err) {
      setQuotaSaveMsg(err.response?.data?.message || 'Failed to reset daily counter.');
    } finally {
      setSavingQuota(false);
    }
  };

  // Admin one-click repair: dry-run preview first, then a confirmation to commit
  // (promotes verified roll@pucit emails, deletes flaw-group students, dedupes roll numbers).
  const handleRepairStudents = async () => {
    if (repairingStudents) return;
    setRepairingStudents(true);
    setRepairMessage('');
    try {
      const dryRunRes = await API.post('/auth/admin/fix-student-email-integrity', { dryRun: true });
      const dryReport = dryRunRes.data?.data?.report || {};
      const summary = `Preview: ${dryReport.promoted?.length || 0} to promote, ${dryReport.deletedFlawGroup?.length || 0} to delete (flaw group), ${dryReport.duplicateRolls?.length || 0} duplicate roll(s) to remove, ${dryReport.conflicts?.length || 0} conflicts.`;
      alert(`Student repair (DRY RUN):\n\n${summary}\n\nThis will NOT modify anything in this preview.`);
      if (!window.confirm('Commit the student email/roll integrity repair now? This promotes/fixes verified accounts and deletes flaw-group students.')) {
        setRepairingStudents(false);
        return;
      }
      const commitRes = await API.post('/auth/admin/fix-student-email-integrity', { dryRun: false });
      setRepairMessage(commitRes.data?.message || 'Student repair completed.');
    } catch (err) {
      setRepairMessage(err.response?.data?.message || 'Student repair failed.');
    } finally {
      setRepairingStudents(false);
      fetchDashboardData();
    }
  };

  const handleCourseTypeChange = (type) => {
    setNewClassData({
      ...newClassData,
      courseType: type,
      creditHours: type === 'LAB' ? 1 : 3
    });
  };

  const handleAddActivityRow = (type) => {
    if (type === 'CLASSROOM') {
      setSessionalActivities([...sessionalActivities, { category: 'Quiz', customCategory: '', allocatedMarks: 5 }]);
    } else {
      setLabActivities([...labActivities, { category: 'Lab Tasks', customCategory: '', allocatedMarks: 20 }]);
    }
  };

  const handleRemoveActivityRow = (index, type) => {
    if (type === 'CLASSROOM') {
      if (sessionalActivities.length === 1) return;
      setSessionalActivities(sessionalActivities.filter((_, i) => i !== index));
    } else {
      if (labActivities.length === 1) return;
      setLabActivities(labActivities.filter((_, i) => i !== index));
    }
  };

  const handleActivityChange = (index, field, value, type) => {
    if (type === 'CLASSROOM') {
      const updated = [...sessionalActivities];
      updated[index][field] = field === 'allocatedMarks' ? Number(value) : value;
      setSessionalActivities(updated);
    } else {
      const updated = [...labActivities];
      updated[index][field] = field === 'allocatedMarks' ? Number(value) : value;
      setLabActivities(updated);
    }
  };

  const handleCreateClassroomRequest = async () => {
    const sWeight = Number(newClassData.sessionalWeight) || 0;
    const mWeight = Number(newClassData.midsWeight) || 0;
    const fWeight = Number(newClassData.finalsWeight) || 0;

    if (sWeight + mWeight + fWeight !== 100) {
      throw new Error(`Main grading weights must total exactly 100% (Current sum: ${sWeight + mWeight + fWeight}%)`);
    }

    const totalSessionalAllocated = sessionalActivities.reduce((acc, curr) => acc + (Number(curr.allocatedMarks) || 0), 0);
    if (totalSessionalAllocated > sWeight) {
      throw new Error(`Total sessional activities marks (${totalSessionalAllocated}) cannot exceed your allocated Sessional Weight (${sWeight}%)!`);
    }

    const payload = {
      className: newClassData.name.trim(),
      creditHours: Number(newClassData.creditHours) || 3,
      sectionPrefix: newClassData.sectionPrefix.trim().toUpperCase(),
      maxCapacity: Number(newClassData.maxCapacity) || 50,
      colorKey: newClassData.colorKey,
      gradingScheme: {
        sessionalWeight: sWeight,
        midsWeight: mWeight,
        finalsWeight: fWeight
      },
      sessionalActivities: sessionalActivities.map(act => ({
        category: act.category,
        allocatedMarks: Number(act.allocatedMarks) || 0
      }))
    };

    return await API.post('/classrooms', payload);
  };

  const handleCreateLabRequest = async () => {
    const payload = {
      labName: newClassData.name.trim(),
      creditHours: Number(newClassData.creditHours) || 1,
      sectionPrefix: newClassData.sectionPrefix.trim().toUpperCase(),
      maxCapacity: Number(newClassData.maxCapacity) || 40,
      colorKey: newClassData.colorKey,
      sessionalActivities: labActivities.map(act => ({
        category: act.category,
        allocatedMarks: Number(act.allocatedMarks) || 0
      }))
    };

    return await API.post('/labrooms', payload);
  };

  const handleCreateClassroom = async (e) => {
    e.preventDefault();
    setCreating(true);
    setModalError('');

    try {
      const isLab = newClassData.courseType === 'LAB';
      if (isLab) {
        await handleCreateLabRequest();
      } else {
        await handleCreateClassroomRequest();
      }

      await fetchDashboardData();
      setIsModalOpen(false);
      
        setNewClassData({
          name: '',
          courseType: 'CLASSROOM',
          creditHours: 3,
          sectionPrefix: '',
          maxCapacity: 50,
          colorKey: DEFAULT_ROOM_COLOR,
          sessionalWeight: 25,
          midsWeight: 35,
          finalsWeight: 40
        });
      setSessionalActivities([
        { category: 'Quiz', customCategory: '', allocatedMarks: 10 },
        { category: 'Assignment', customCategory: '', allocatedMarks: 15 }
      ]);
      setLabActivities([
        { category: 'Lab Tasks', customCategory: '', allocatedMarks: 50 },
        { category: 'Vivas', customCategory: '', allocatedMarks: 30 },
        { category: 'Lab Tests', customCategory: '', allocatedMarks: 20 }
      ]);
    } catch (err) {
      setModalError(err.message || err.response?.data?.message || 'Failed to create classroom/lab.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleMaintenance = async () => {
    setTogglingMaint(true);
    try {
      const nextStatus = !maintenance.isUnderMaintenance;
      const res = await API.post('/auth/admin/maintenance', {
        isUnderMaintenance: nextStatus,
        message: maintMessage
      });
      if (res.data?.data) {
        setMaintenance(res.data.data);
      }
      setIsMaintenanceModalOpen(false);
      alert(`Maintenance mode successfully turned ${nextStatus ? 'ON' : 'OFF'}.`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update maintenance mode.');
    } finally {
      setTogglingMaint(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const payload = { name: profileData.name.trim() };
      
      if (!isPucitVerified) {
        payload.personalNotificationEmail = profileData.personalNotificationEmail.trim().toLowerCase();
      }

      if (profileData.password.trim().length > 0) {
        if (profileData.currentPassword.trim().length === 0) {
          setProfileError('Current password is required to set a new password.');
          setUpdatingProfile(false);
          return;
        }
        payload.password = profileData.password.trim();
        payload.currentPassword = profileData.currentPassword.trim();
      }

      const res = await API.patch('/auth/update-profile', payload);
      setProfileSuccess(res.data?.message || 'Profile updated successfully!');
      if (res.data?.data?.user) {
        updateUser(res.data.data.user);
      }
      setTimeout(() => {
        setIsProfileModalOpen(false);
      }, 1000);
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update profile details.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdateMissingRollNo = async (e) => {
    e.preventDefault();
    setRollNoUpdating(true);
    setRollNoMessage('');

    try {
      const res = await API.patch('/auth/update-rollno', {
        rollNo: missingRollNoInput.trim().toUpperCase()
      });
      setRollNoMessage('Official roll number claimed successfully!');
      if (res.data?.data?.user) {
        updateUser(res.data.data.user);
      }
      setTimeout(() => {
        setIsRollNoModalOpen(false);
        window.location.reload();
      }, 1000);
    } catch (err) {
      setRollNoMessage(err.response?.data?.message || 'Failed to update roll number.');
    } finally {
      setRollNoUpdating(false);
    }
  };

  const handleInitiateEmailLink = async (e) => {
    e.preventDefault();
    setEmailLoading(true);
    setEmailMessage('');

    try {
      // Official email is always derived from the roll number — not changeable.
      const officialEmail = user?.rollNo ? `${user.rollNo.toLowerCase()}@pucit.edu.pk` : pucitEmailInput.trim().toLowerCase();
      const res = await API.post('/auth/attach-email/initiate', {
        universityEmail: officialEmail
      });
      setEmailMessage(res.data?.message || 'OTP sent to your PUCIT email!');
      setEmailStep('otp_sent');
    } catch (err) {
      setEmailMessage(err.response?.data?.message || 'Failed to send verification code.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    setEmailLoading(true);
    setEmailMessage('');

    try {
      const officialEmail = user?.rollNo ? `${user.rollNo.toLowerCase()}@pucit.edu.pk` : pucitEmailInput.trim().toLowerCase();
      const res = await API.post('/auth/attach-email/verify-otp', {
        universityEmail: officialEmail,
        otp: emailOtpInput.trim()
      });
      setEmailMessage(res.data?.message || 'PUCIT email verified successfully!');
      
      if (res.data?.data?.user) {
        updateUser(res.data.data.user);
      }

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      setEmailMessage(err.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleApproveTeacher = async (teacherId) => {
    try {
      await API.patch(`/auth/admin/approve-teacher/${teacherId}`);
      setPendingTeachers((prev) => prev.filter((t) => t._id !== teacherId));
      alert('Teacher approved successfully! Role updated to TEACHER and welcome email dispatched.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve teacher.');
    }
  };

  const handleRejectTeacher = async (teacherId) => {
    try {
      await API.patch(`/auth/admin/reject-teacher/${teacherId}`).catch(() => {
        API.delete(`/admin/users/${teacherId}`);
      });
      setPendingTeachers((prev) => prev.filter((t) => t._id !== teacherId));
      alert('Teacher request rejected.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject teacher request.');
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setDeletingUser(true);
    try {
      await API.delete(`/auth/admin/users/${userToDelete._id}`).catch(() => {
        API.delete(`/admin/users/${userToDelete._id}`);
      });

      // Update local state
      setDetailedAnalyticsData(prev => ({
        ...prev,
        users: prev.users.filter(u => u._id !== userToDelete._id)
      }));
      setAnalytics(prev => prev ? ({ ...prev, totalUsers: Math.max(0, (prev.totalUsers || 1) - 1) }) : null);

      setIsDeleteUserModalOpen(false);
      setUserToDelete(null);
      alert('User account deleted successfully.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user account.');
    } finally {
      setDeletingUser(false);
    }
  };

  const getParticipantRole = (cls) => {
    if (user?.role === 'ADMIN') return { label: 'Administrator', color: 'bg-purple-500/10 border-purple-500/30 text-purple-400' };
    if (cls.teacher?._id === user?._id || cls.teacher === user?._id) return { label: 'Instructor', color: 'bg-orange-500/10 border-orange-500/30 text-orange-400' };
    if (cls.tas?.some(ta => ta._id === user?._id || ta === user?._id)) return { label: 'Teaching Assistant (TA)', color: 'bg-blue-500/10 border-blue-500/30 text-blue-400' };
    return { label: 'Student Enrolled', color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' };
  };

  const isStudent = user?.role === 'STUDENT';
  const isAdmin = user?.role === 'ADMIN';
  const isTeacherOrAdmin = ['TEACHER', 'ADMIN'].includes(user?.role);
  
  const rawRoll = (user?.rollNo || user?.rollNumber || '').trim().toUpperCase();
  const isTempOrFresherRoll = Boolean(
    !rawRoll ||
    rawRoll.startsWith('FRESHER_') ||
    /^[A-Z]{2,5}[FS]\d{2}[A-Z]?$/.test(rawRoll)
  );

  const isPucitVerified = Boolean(
    user?.isUniversityEmailVerified || 
    (user?.email && user.email.endsWith('@pucit.edu.pk')) ||
    !isStudent || 
    isAdmin
  );

  const needsRollNo = isStudent && isTempOrFresherRoll;
  const needsEmailLink = isStudent && !isPucitVerified;

  const classroomsOnly = classroomsList.filter(c => c.courseType !== 'LAB');
  const labroomsOnly = classroomsList.filter(c => c.courseType === 'LAB');

  const enrolledClassrooms = classroomsOnly.filter(c => c.students?.some(s => (s._id || s) === user?._id));
  const enrolledLabs = labroomsOnly.filter(l => l.students?.some(s => (s._id || s) === user?._id));
  const assignedTAsCourses = classroomsList.filter(c => c.tas?.some(ta => (ta._id || ta) === user?._id));

  const createdClassrooms = classroomsOnly.filter(c => (c.teacher?._id || c.teacher) === user?._id);
  const createdLabrooms = labroomsOnly.filter(l => (l.teacher?._id || l.teacher) === user?._id);
  const assignedTeacherCourses = classroomsList.filter(c => (c.teacher?._id || c.teacher) === user?._id || c.tas?.some(ta => (ta._id || ta) === user?._id));

  const assignedUserIds = new Set();
  const classEnrolledStudentIds = new Set();
  const labEnrolledStudentIds = new Set();
  classroomsList.forEach(c => {
    const isClass = c.courseType === 'CLASSROOM';
    const isLab = c.courseType === 'LAB';
    (c.students || []).forEach(s => {
      const id = s?._id || s;
      if (!id) return;
      assignedUserIds.add(String(id));
      if (isClass) classEnrolledStudentIds.add(String(id));
      if (isLab) labEnrolledStudentIds.add(String(id));
    });
    (c.tas || []).forEach(t => {
      const id = t?._id || t;
      if (id) assignedUserIds.add(String(id));
    });
    const tid = c.teacher?._id || c.teacher;
    if (tid) assignedUserIds.add(String(tid));
    const cid = c.createdBy?._id || c.createdBy;
    if (cid) assignedUserIds.add(String(cid));
  });

  const unassignedUsersCount = detailedAnalyticsData.users.filter(u => !assignedUserIds.has(String(u._id))).length;
  const unassignedStudentsCount = detailedAnalyticsData.users.filter(u => u.role === 'STUDENT' && !classEnrolledStudentIds.has(String(u._id)) && !labEnrolledStudentIds.has(String(u._id))).length;
  const assignmentFilterLabel = userAssignmentFilter === 'UNASSIGNED_USERS' ? 'Unassigned Users' : userAssignmentFilter === 'UNASSIGNED_STUDENTS' ? 'Unassigned Students' : 'ALL';

  const filteredAnalyticsUsers = detailedAnalyticsData.users.filter(u => {
    if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) return false;
    if (userAssignmentFilter === 'UNASSIGNED_USERS' && assignedUserIds.has(String(u._id))) return false;
    if (userAssignmentFilter === 'UNASSIGNED_STUDENTS' && (u.role !== 'STUDENT' || classEnrolledStudentIds.has(String(u._id)) || labEnrolledStudentIds.has(String(u._id)))) return false;
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.trim().toLowerCase();
      return (u.name || '').toLowerCase().includes(q)
        || (u.email || '').toLowerCase().includes(q)
        || (u.rollNo || '').toLowerCase().includes(q)
        || (u.registrationNo || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="lm-canvas relative min-h-dvh flex flex-col justify-between overflow-x-hidden px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      <div className="lm-ambient" />
      <div className="lm-topline" />

      {needsRollNo && (
        <div className="relative z-20 max-w-6xl mx-auto w-full mb-4 rounded-2xl border border-rose-500/45 bg-rose-950/55 backdrop-blur-xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-chrome">
          <div className="flex items-start sm:items-center gap-3 text-center sm:text-left min-w-0">
            <AcademicCapIcon className="w-6 h-6 text-rose-300 shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-rose-200 uppercase tracking-wide">Official Roll Number Required</p>
              <p className="text-[11px] text-slate-300">You currently have a temporary prefix assigned. Claim your official roll number (e.g. <span className="font-mono text-rose-300">BITF26A001</span>) to complete your profile.</p>
            </div>
          </div>
          <button
            onClick={() => setIsRollNoModalOpen(true)}
            className="lm-btn w-full sm:w-auto shrink-0"
          >
            Claim Official Roll No
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {!needsRollNo && needsEmailLink && (
        <div className="relative z-20 max-w-6xl mx-auto w-full mb-4 rounded-2xl border border-amber-500/45 bg-amber-950/55 backdrop-blur-xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-chrome">
          <div className="flex items-start sm:items-center gap-3 text-center sm:text-left min-w-0">
            <ExclamationTriangleIcon className="w-6 h-6 text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-200 uppercase tracking-wide">Official PUCIT Email Not Verified</p>
              <p className="text-[11px] text-slate-300">Link and verify your official <span className="font-mono text-orange-300">@pucit.edu.pk</span> email address to unlock complete portal features.</p>
            </div>
          </div>
          <button
            onClick={() => { setProfileData({ name: user?.name || '', password: '', currentPassword: '', personalNotificationEmail: user?.personalNotificationEmail || '' }); setIsProfileModalOpen(true); }}
            className="lm-btn w-full sm:w-auto shrink-0"
          >
            Verify Email Now
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER */}
      <header className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-5 lm-card px-4 sm:px-6 py-5">
        <div className="text-center lg:text-left space-y-1.5 w-full lg:w-auto min-w-0">
          <p className="lm-eyebrow">Portal Console</p>
          <h1 className="lm-title text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight break-words">
            PUCIT Classroom &amp; Lab Portal
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-300 leading-snug break-words">
            Welcome, <span className="text-orange-300 font-bold">{user?.name || 'User'}</span> <span className="block sm:inline">({user?.rollNo || user?.email})</span> • <span className="uppercase text-slate-200 font-mono font-semibold break-all">{user?.role}</span>
          </p>
        </div>

        {!isAdmin && (
          <div className="flex flex-col items-center lg:items-start gap-1.5 w-full lg:w-auto">
            <span className="lm-eyebrow px-1">Quick Overview</span>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 lm-inset p-2 w-full">
              {isStudent ? (
                <>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Enrolled Classrooms', items: enrolledClassrooms, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="lm-btn-ghost px-3 py-2 normal-case tracking-normal"
                  >
                    <BookOpenIcon className="lm-ico text-orange-300" />
                    <span className="text-slate-300">Classes:</span>
                    <span className="font-mono text-orange-300 font-black px-1.5 py-0.5 lm-badge">{enrolledClassrooms.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Enrolled Labs', items: enrolledLabs, type: 'LAB' }); setIsNavDetailModalOpen(true); }}
                    className="lm-btn-ghost px-3 py-2 normal-case tracking-normal"
                  >
                    <BeakerIcon className="lm-ico text-blue-300" />
                    <span className="text-slate-300">Labs:</span>
                    <span className="font-mono text-blue-300 font-black px-1.5 py-0.5 lm-badge">{enrolledLabs.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Assigned TA Courses', items: assignedTAsCourses, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="lm-btn-ghost px-3 py-2 normal-case tracking-normal"
                  >
                    <ShieldCheckIcon className="lm-ico text-purple-300" />
                    <span className="text-slate-300">TA:</span>
                    <span className="font-mono text-purple-300 font-black px-1.5 py-0.5 lm-badge">{assignedTAsCourses.length}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Created Classrooms', items: createdClassrooms, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="lm-btn-ghost px-3 py-2 normal-case tracking-normal"
                  >
                    <BookOpenIcon className="lm-ico text-orange-300" />
                    <span className="text-slate-300">Classes:</span>
                    <span className="font-mono text-orange-300 font-black px-1.5 py-0.5 lm-badge">{createdClassrooms.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Created Labs', items: createdLabrooms, type: 'LAB' }); setIsNavDetailModalOpen(true); }}
                    className="lm-btn-ghost px-3 py-2 normal-case tracking-normal"
                  >
                    <BeakerIcon className="lm-ico text-blue-300" />
                    <span className="text-slate-300">Labs:</span>
                    <span className="font-mono text-blue-300 font-black px-1.5 py-0.5 lm-badge">{createdLabrooms.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Assigned/Instructed Courses', items: assignedTeacherCourses, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="lm-btn-ghost px-3 py-2 normal-case tracking-normal"
                  >
                    <UserGroupIcon className="lm-ico text-emerald-300" />
                    <span className="text-slate-300">Assigned:</span>
                    <span className="font-mono text-emerald-300 font-black px-1.5 py-0.5 lm-badge">{assignedTeacherCourses.length}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => { setProfileData({ name: user?.name || '', password: '', currentPassword: '', personalNotificationEmail: user?.personalNotificationEmail || '' }); setIsProfileModalOpen(true); }}
            className="lm-btn-ghost flex-grow sm:flex-grow-0"
          >
            <Cog6ToothIcon className="w-4 h-4" />
            Profile
          </button>

          {user?.role === 'ADMIN' && (
            <>
              <button
                onClick={() => { setIsApproveModalOpen(true); fetchAdminData(); }}
                className="lm-btn-ghost flex-grow sm:flex-grow-0 text-purple-200 hover:text-purple-100"
              >
                <ShieldCheckIcon className="w-4 h-4" />
                Teachers {pendingTeachers.length > 0 && `(${pendingTeachers.length})`}
              </button>
              <button
                onClick={() => setIsMaintenanceModalOpen(true)}
                className={`lm-btn-ghost flex-grow sm:flex-grow-0 ${
                  maintenance?.isUnderMaintenance
                    ? 'border-red-500/40 bg-red-950/60 text-red-300 animate-pulse'
                    : 'border-emerald-500/30 bg-emerald-950/60 text-emerald-300'
                }`}
              >
                Maint: {maintenance?.isUnderMaintenance ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={handleToggleFresherMode}
                disabled={togglingFresherMode || fresherMode === null}
                className={`lm-btn-ghost flex-grow sm:flex-grow-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                  fresherMode
                    ? 'border-sky-500/30 bg-sky-950/60 text-sky-300'
                    : 'text-slate-400'
                }`}
              >
                Fresher Reg: {fresherMode === null ? '…' : fresherMode ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={handleRepairStudents}
                disabled={repairingStudents}
                title={repairMessage || 'Dry-run preview, then confirm to fix student emails/roll numbers'}
                className="lm-btn-ghost flex-grow sm:flex-grow-0 border-amber-500/30 bg-amber-950/50 text-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {repairingStudents ? 'Repairing…' : 'Fix Student Emails'}
              </button>
            </>
          )}

          {isTeacherOrAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="lm-btn flex-grow sm:flex-grow-0"
            >
              <PlusIcon className="w-4 h-4" />
              Create Course
            </button>
          )}

          <button 
            onClick={logout}
            className="lm-btn-ghost flex-grow sm:flex-grow-0 border-red-500/30 bg-red-950/50 text-red-200 hover:text-red-100"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto my-5 sm:my-6 space-y-6 flex-grow flex flex-col justify-center">
        
        {user?.role === 'ADMIN' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="lm-eyebrow flex items-center gap-2">
                <ChartBarIcon className="lm-ico" />
                System Analytics Overview
              </h2>
              <button 
                onClick={() => { fetchAdminData(); setIsAnalyticsModalOpen(true); }}
                className="lm-chip"
              >
                Open Full Analytics Vault
                <ArrowRightIcon className="lm-ico" />
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div 
                onClick={() => { setSelectedAnalyticsTab('users'); setUserRoleFilter('ALL'); fetchAdminData(); setIsAnalyticsModalOpen(true); }}
                className="lm-inset p-3.5 sm:p-4 text-center space-y-1 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:brightness-125"
              >
                <p className="text-[10px] sm:text-xs font-mono uppercase text-slate-400">Total Users</p>
                <p className="text-xl sm:text-2xl font-black text-slate-100 lm-num">{analytics?.totalUsers || detailedAnalyticsData.users.length || 0}</p>
                <p className="text-[9px] sm:text-[10px] text-purple-300 font-bold uppercase inline-flex items-center gap-1">View Records <ArrowRightIcon className="lm-ico" /></p>
              </div>

              <div 
                onClick={() => { setSelectedAnalyticsTab('classrooms'); setIsAnalyticsModalOpen(true); }}
                className="lm-inset p-3.5 sm:p-4 text-center space-y-1 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:brightness-125"
              >
                <p className="text-[10px] sm:text-xs font-mono uppercase text-slate-400">Classrooms</p>
                <p className="text-xl sm:text-2xl font-black text-orange-300 lm-num">{classroomsOnly.length}</p>
                <p className="text-[9px] sm:text-[10px] text-orange-300 font-bold uppercase inline-flex items-center gap-1">View Classes <ArrowRightIcon className="lm-ico" /></p>
              </div>

              <div 
                onClick={() => { setSelectedAnalyticsTab('labrooms'); setIsAnalyticsModalOpen(true); }}
                className="lm-inset p-3.5 sm:p-4 text-center space-y-1 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:brightness-125"
              >
                <p className="text-[10px] sm:text-xs font-mono uppercase text-slate-400">Lab Rooms</p>
                <p className="text-xl sm:text-2xl font-black text-blue-300 lm-num">{labroomsOnly.length}</p>
                <p className="text-[9px] sm:text-[10px] text-blue-300 font-bold uppercase inline-flex items-center gap-1">View Labs <ArrowRightIcon className="lm-ico" /></p>
              </div>

              <div 
                onClick={() => { setSelectedAnalyticsTab('pending'); fetchAdminData(); setIsAnalyticsModalOpen(true); }}
                className="lm-inset p-3.5 sm:p-4 text-center space-y-1 cursor-pointer transition-all duration-200 hover:-translate-y-px hover:brightness-125"
              >
                <p className="text-[10px] sm:text-xs font-mono uppercase text-slate-400">Pending Teachers</p>
                <p className="text-xl sm:text-2xl font-black text-emerald-300 lm-num">{pendingTeachers.length}</p>
                <p className="text-[9px] sm:text-[10px] text-emerald-300 font-bold uppercase inline-flex items-center gap-1">Review List <ArrowRightIcon className="lm-ico" /></p>
              </div>
            </div>

            {emailQuota && (
              <div className="lm-card p-3.5 sm:p-4 flex flex-col gap-3 border-teal-500/30">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full min-w-0">
                  <div className="flex items-start lg:items-center gap-3 text-center sm:text-left min-w-0 flex-1">
                    <EnvelopeIcon className="w-6 h-6 text-teal-300 shrink-0 mt-0.5 lg:mt-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-mono uppercase text-slate-400">Daily Email Quota</p>
                      <p className="text-xs text-slate-300 leading-snug">
                        <span className={`font-black ${emailQuota.sent >= emailQuota.dailyQuota ? 'text-red-300' : emailQuota.sent >= emailQuota.otpReserveThreshold ? 'text-orange-300' : emailQuota.sent >= emailQuota.importantThreshold ? 'text-amber-300' : 'text-teal-300'}`}>{emailQuota.sent}</span>
                        <span className="text-slate-500"> / {emailQuota.dailyQuota}</span> sent in last 24h
                        {emailQuota.sent >= emailQuota.dailyQuota
                          ? <span className="text-red-300 font-bold"> • Quota reached — all mail paused until reset</span>
                          : emailQuota.otpOnly
                          ? <span className="text-orange-300 font-bold"> • OTPs only (registrations / password recovery)</span>
                          : emailQuota.importantOnly
                          ? <span className="text-amber-300 font-bold"> • Important emails only (OTP / critical)</span>
                          : <span className="text-teal-300 font-bold"> • All mail allowed</span>}
                      </p>
                      <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                        Resets {emailQuota.resetAt ? new Date(emailQuota.resetAt).toLocaleTimeString() : 'in 24h'} • {Math.max(emailQuota.remaining, 0)} remaining
                      </p>
                    </div>
                  </div>
                  <div className="w-full sm:w-48 h-2 rounded-full bg-[#0a0f16] border border-white/10 overflow-hidden shrink-0">
                    <div
                      className={`h-full transition-all duration-500 ${emailQuota.sent >= emailQuota.dailyQuota ? 'bg-red-500' : emailQuota.sent >= emailQuota.otpReserveThreshold ? 'bg-orange-400' : emailQuota.sent >= emailQuota.importantThreshold ? 'bg-amber-400' : 'bg-teal-400'}`}
                      style={{ width: `${Math.min(100, Math.round((emailQuota.sent / emailQuota.dailyQuota) * 100))}%` }}
                    />
                  </div>
                </div>

                {user?.role === 'ADMIN' && (
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2.5 pt-3 border-t border-white/10 w-full min-w-0">
                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-400">Daily Limit (hard stop)</span>
                      <input
                        type="number"
                        min="1"
                        value={quotaDraft.dailyQuota}
                        onChange={(e) => setQuotaDraft({ ...quotaDraft, dailyQuota: e.target.value })}
                        className="lm-field text-teal-200 font-bold px-3 py-1.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase text-slate-400">OTP-only after</span>
                      <input
                        type="number"
                        min="1"
                        value={quotaDraft.otpReserveThreshold}
                        onChange={(e) => setQuotaDraft({ ...quotaDraft, otpReserveThreshold: e.target.value })}
                        className="lm-field text-orange-200 font-bold px-3 py-1.5"
                      />
                    </label>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={handleSaveQuota}
                        disabled={savingQuota}
                        className="lm-btn disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleResetQuota}
                        disabled={savingQuota}
                        className="lm-btn-ghost disabled:opacity-50"
                      >
                        Reset counter
                      </button>
                    </div>
                    {quotaSaveMsg && (
                      <p className={`w-full text-[10px] font-bold ${quotaSaveMsg.startsWith('Failed') ? 'text-red-300' : quotaSaveMsg.startsWith('Both') ? 'text-amber-300' : 'text-teal-300'}`}>{quotaSaveMsg}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base sm:text-xl font-extrabold text-slate-100 tracking-wide uppercase">
              {user?.role === 'ADMIN' ? 'All Active Classrooms & Labs' : 'Your Classrooms & Labs'}
            </h2>
            <span className="lm-badge font-mono text-orange-300 px-3 py-1.5">
              {classroomsList.length} {classroomsList.length === 1 ? 'Course' : 'Courses'}
            </span>
          </div>

          {loading ? (
            <div className="lm-inset rounded-3xl text-center py-16 sm:py-20 text-slate-400 font-mono text-sm space-y-4">
              <div className="flex justify-center gap-2">
                <span className="lm-bar" />
                <span className="lm-bar" />
                <span className="lm-bar" />
              </div>
              <p>Syncing academic portal...</p>
            </div>
          ) : fetchError ? (
            <div className="rounded-3xl border border-red-500/40 bg-red-950/55 backdrop-blur-xl p-6 sm:p-8 text-center space-y-3 max-w-md mx-auto shadow-chrome">
              <ExclamationTriangleIcon className="w-10 h-10 text-red-300 mx-auto" />
              <p className="text-red-300 font-bold text-sm">Connection Error</p>
              <p className="text-xs text-slate-300 break-words">{fetchError}</p>
              <button 
                onClick={fetchDashboardData}
                className="lm-btn"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Retry Connection
              </button>
            </div>
          ) : classroomsList.length === 0 ? (
            <div className="lm-card p-6 sm:p-12 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 lm-inset flex items-center justify-center mx-auto text-orange-300">
                <BookOpenIcon className="w-7 h-7" />
              </div>
              <h3 className="text-slate-100 font-bold text-base">No Courses Available</h3>
              
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                {user?.role === 'STUDENT' 
                  ? 'You are not currently enrolled in any active classes or labs. Contact your TA or teacher to add you.' 
                  : 'You have not created or been assigned to any classrooms or labs yet. Click below to launch your first course!'}
              </p>

              {isTeacherOrAdmin && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="lm-btn mt-3 w-full sm:w-auto"
                >
                  <PlusIcon className="w-4 h-4" />
                  Create Course / Lab Now
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {classroomsList.map((cls) => {
                const roleBadge = getParticipantRole(cls);
                const isLab = cls.courseType === 'LAB';
                const courseId = cls._id || cls.id || cls.labId;
                const detailRoute = isLab ? `/labrooms/${courseId}` : `/classroom/${courseId}`;
                const creatorName = cls.teacher?.name || cls.placeholderTeacherName || 'System Admin / TBA';
                const creatorEmail = cls.teacher?.email || '';

                return (
                  <div 
                    key={courseId}
                    className={`lm-card ${isLab ? 'lm-acc-lab' : 'lm-acc-classroom'} lm-room-card p-4 sm:p-6 space-y-4 transition-all duration-200 flex flex-col justify-between hover:-translate-y-px hover:brightness-110`}
                    style={roomCardStyle(cls.colorKey, isLab ? 'labroom' : 'classroom')}
                  >
                    <div
                      aria-hidden="true"
                      className={`absolute inset-x-6 top-0 h-px ${
                        isLab
                          ? 'bg-gradient-to-r from-transparent via-blue-300/60 to-transparent'
                          : 'bg-gradient-to-r from-transparent via-orange-300/60 to-transparent'
                      }`}
                    />
                    <div className="space-y-3 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className={`text-[10px] sm:text-[11px] font-mono px-2.5 py-1 rounded-lg uppercase tracking-wider border font-bold ${
                            isLab 
                              ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' 
                              : 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                          }`}>
                            {cls.sectionPrefix || 'Section'}
                          </span>
                          <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-1 rounded-lg border uppercase tracking-wider inline-flex items-center gap-1.5 ${isLab ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300' : 'bg-rose-500/15 border-rose-500/40 text-rose-300'}`}>
                            {isLab ? <BeakerIcon className="lm-ico" /> : <BookOpenIcon className="lm-ico" />}
                            {isLab ? 'Lab' : 'Class'} ({cls.creditHours || (isLab ? 1 : 3)} Cr)
                          </span>
                        </div>
                        
                        <span className="lm-badge border-emerald-500/30 bg-emerald-950/60 text-emerald-300">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider">Active</span>
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <h3 className="text-slate-100 font-bold text-base sm:text-lg tracking-tight break-words">
                          {cls.className || cls.labName || cls.name || 'Untitled Course'}
                        </h3>
                        <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider ${roleBadge.color}`}>
                          {roleBadge.label}
                        </span>
                      </div>
                      
                      <div className="space-y-1.5 text-xs text-slate-300 lm-inset p-3">
                        <p className="text-slate-400">Created / Instructed By:</p>
                        <p className="text-slate-100 font-semibold flex items-center gap-1.5 break-words">
                          <UserIcon className="lm-ico text-slate-400 shrink-0" /> {creatorName}
                        </p>
                        {creatorEmail && (
                          <p className="text-[11px] font-mono text-slate-400 pl-4 break-all">{creatorEmail}</p>
                        )}
                        <p className="pt-1.5 border-t border-white/5 flex justify-between gap-2">
                          <span>Students Enrolled:</span>
                          <span className="text-slate-100 font-mono font-bold">{cls.students?.length || 0} / {cls.maxCapacity || 50}</span>
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        TAs: {cls.tas?.length || 0}
                      </span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(detailRoute);
                        }}
                        className="lm-btn"
                      >
                        Open Course
                        <ArrowRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );

              })}
            </div>
          )}
        </div>

      </main>

      {/* NAVBAR QUICK-PILLS DETAIL MODAL */}
      {isNavDetailModalOpen && (
        <div className="lm-scrim">
          <div className="w-full max-w-lg flex justify-center">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <h3 className="text-base font-extrabold text-slate-100 uppercase tracking-wide">
                {navModalConfig.title} ({navModalConfig.items.length})
              </h3>
              <button 
                onClick={() => setIsNavDetailModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 transition-colors cursor-pointer p-1 -mt-1 shrink-0"
                aria-label="Close"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {navModalConfig.items.length === 0 ? (
              <div className="lm-inset text-center py-8 px-4">
                <p className="text-slate-400 text-xs italic">No courses found in this category.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {navModalConfig.items.map((item, idx) => {
                  const isLab = item.courseType === 'LAB' || item.labName;
                  const courseId = item._id || item.id || item.labId;
                  const detailRoute = isLab ? `/labrooms/${courseId}` : `/classroom/${courseId}`;
                  const creatorName = item.teacher?.name || item.placeholderTeacherName || 'System Admin';

                  return (
                    <div key={idx} className="lm-inset p-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] sm:text-[11px] font-mono uppercase px-2 py-0.5 rounded-lg lm-badge text-orange-300">
                          {item.sectionPrefix || 'Section'}
                        </span>
                        <span className="text-[10px] sm:text-[11px] font-mono text-slate-400 inline-flex items-center gap-1.5">
                          {isLab ? <BeakerIcon className="lm-ico" /> : <BookOpenIcon className="lm-ico" />}
                          {isLab ? 'Lab Room' : 'Classroom'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-slate-100 font-bold text-sm sm:text-base break-words">{item.className || item.labName || item.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5 break-words">Instructor: <span className="text-slate-100 font-semibold">{creatorName}</span></p>
                        <p className="text-xs text-slate-400">Enrolled Students: <span className="font-mono text-emerald-300 font-bold">{item.students?.length || 0} / {item.maxCapacity || 50}</span></p>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex justify-end">
                        <button
                          onClick={() => { setIsNavDetailModalOpen(false); navigate(detailRoute); }}
                          className="lm-btn"
                        >
                          View Course
                          <ArrowRightIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* FULL ANALYTICS VAULT MODAL */}
      {isAnalyticsModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal lm-modal-wide p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                <ChartBarIcon className="w-5 h-5 text-orange-300 shrink-0" />
                System Analytics Vault
              </h3>
              <button 
                onClick={() => setIsAnalyticsModalOpen(false)}
                className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer"
                aria-label="Close"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="lm-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-max">
                <button
                  onClick={() => setSelectedAnalyticsTab('users')}
                  className={`lm-chip ${selectedAnalyticsTab === 'users' ? 'lm-chip-active' : ''}`}
                >
                  Users ({detailedAnalyticsData.users.length})
                </button>
                <button
                  onClick={() => setSelectedAnalyticsTab('classrooms')}
                  className={`lm-chip ${selectedAnalyticsTab === 'classrooms' ? 'lm-chip-active' : ''}`}
                >
                  Classrooms ({classroomsOnly.length})
                </button>
                <button
                  onClick={() => setSelectedAnalyticsTab('labrooms')}
                  className={`lm-chip ${selectedAnalyticsTab === 'labrooms' ? 'lm-chip-active' : ''}`}
                >
                  Lab Rooms ({labroomsOnly.length})
                </button>
                <button
                  onClick={() => setSelectedAnalyticsTab('pending')}
                  className={`lm-chip ${selectedAnalyticsTab === 'pending' ? 'lm-chip-active' : ''}`}
                >
                  Pending ({pendingTeachers.length})
                </button>
              </div>
            </div>

{selectedAnalyticsTab === 'users' && (
              <div className="flex flex-wrap items-center gap-1.5 lm-inset p-2">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">Filter Role:</span>
                {['ALL', 'STUDENT', 'TEACHER', 'TA', 'ADMIN'].map(role => (
                  <button
                    key={role}
                    onClick={() => setUserRoleFilter(role)}
                    className={`lm-chip ${userRoleFilter === role ? 'lm-chip-active' : ''}`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}

            {selectedAnalyticsTab === 'users' && (
              <div className="flex flex-wrap items-center gap-1.5 lm-inset p-2">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">Assignment:</span>
                {[
                  { key: 'ALL', label: 'ALL', count: detailedAnalyticsData.users.length },
                  { key: 'UNASSIGNED_USERS', label: 'Unassigned Users', count: unassignedUsersCount },
                  { key: 'UNASSIGNED_STUDENTS', label: 'Unassigned Students', count: unassignedStudentsCount }
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setUserAssignmentFilter(opt.key)}
                    className={`lm-chip ${userAssignmentFilter === opt.key ? 'lm-chip-active' : ''}`}
                  >
                    {opt.label} ({opt.count})
                  </button>
                ))}
              </div>
            )}

            {selectedAnalyticsTab === 'users' && (
              <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input 
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search students by name, email, roll no or registration no..."
                  className="lm-field pl-10 pr-10"
                />
                {userSearchQuery && (
                  <button 
                    onClick={() => setUserSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-100 transition-colors p-1 cursor-pointer"
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {selectedAnalyticsTab === 'users' && (
                filteredAnalyticsUsers.length === 0 ? (
                  <div className="lm-inset text-center py-6 px-3">
                    <p className="text-slate-400 text-xs italic">No user records found for filter: {userRoleFilter}{userAssignmentFilter !== 'ALL' ? ` + ${assignmentFilterLabel}` : ''}</p>
                  </div>
                ) : (
                  filteredAnalyticsUsers.map((u, idx) => (
                    <div key={idx} className="lm-inset p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-slate-100 font-bold text-sm break-words">{u.name}</h4>
                        <p className="text-xs text-slate-400 break-words">{u.email} • <span className="font-mono text-orange-300">{u.rollNo || 'No RollNo'}</span></p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                        <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-lg lm-badge text-purple-300">
                          {u.role}
                        </span>
                        <button 
                          onClick={() => { setViewingUser(u); setIsViewUserModalOpen(true); }}
                          className="lm-btn-ghost"
                          title="View User Profile"
                        >
                          <EyeIcon className="w-4 h-4" />
                          Profile
                        </button>
                        {u._id && u._id !== user?._id && (
                          <button 
                            onClick={() => { setUserToDelete(u); setIsDeleteUserModalOpen(true); }}
                            className="lm-btn-ghost border-red-500/40 bg-red-950/60 text-red-300 hover:text-red-200"
                            title="Delete User Account"
                            aria-label="Delete User Account"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )
              )}

              {selectedAnalyticsTab === 'classrooms' && (
                classroomsOnly.length === 0 ? (
                  <div className="lm-inset text-center py-6 px-3">
                    <p className="text-slate-400 text-xs italic">No active classrooms created.</p>
                  </div>
                ) : (
                  classroomsOnly.map((cls, idx) => {
                    const creatorName = cls.teacher?.name || cls.placeholderTeacherName || 'System Admin / TBA';
                    const creatorEmail = cls.teacher?.email || '';
                    return (
                      <div
                        key={idx}
                        className="lm-inset lm-room-row p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={roomRowStyle(cls.colorKey, 'classroom')}
                      >
                        <div className="space-y-1 min-w-0">
                          <h4 className="text-slate-100 font-bold text-sm break-words">{cls.className}</h4>
                          <p className="text-xs text-slate-400">
                            Section: <span className="font-mono text-orange-300">{cls.sectionPrefix}</span> • Enrolled: <span className="font-mono">{cls.students?.length || 0}</span>
                          </p>
                          <p className="text-[11px] text-slate-300 flex items-start gap-1.5 break-words">
                            <UserIcon className="lm-ico text-slate-500 mt-0.5 shrink-0" />
                            <span>Created By: <span className="text-slate-100 font-semibold">{creatorName}</span> {creatorEmail && <span className="font-mono text-slate-400 break-all">({creatorEmail})</span>}</span>
                          </p>
                        </div>
                        <button 
                          onClick={() => navigate(`/classroom/${cls._id || cls.id}`)}
                          className="lm-btn self-start sm:self-auto shrink-0"
                        >
                          Open Class
                        </button>
                      </div>
                    );
                  })
                )
              )}

              {selectedAnalyticsTab === 'labrooms' && (
                labroomsOnly.length === 0 ? (
                  <div className="lm-inset text-center py-6 px-3">
                    <p className="text-slate-400 text-xs italic">No active lab rooms created.</p>
                  </div>
                ) : (
                  labroomsOnly.map((lab, idx) => {
                    const creatorName = lab.teacher?.name || lab.placeholderTeacherName || 'System Admin / TBA';
                    const creatorEmail = lab.teacher?.email || '';
                    return (
                      <div
                        key={idx}
                        className="lm-inset lm-room-row p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        style={roomRowStyle(lab.colorKey, 'labroom')}
                      >
                        <div className="space-y-1 min-w-0">
                          <h4 className="text-slate-100 font-bold text-sm break-words">{lab.className}</h4>
                          <p className="text-xs text-slate-400">
                            Section: <span className="font-mono text-blue-300">{lab.sectionPrefix}</span> • Enrolled: <span className="font-mono">{lab.students?.length || 0}</span>
                          </p>
                          <p className="text-[11px] text-slate-300 flex items-start gap-1.5 break-words">
                            <UserIcon className="lm-ico text-slate-500 mt-0.5 shrink-0" />
                            <span>Created By: <span className="text-slate-100 font-semibold">{creatorName}</span> {creatorEmail && <span className="font-mono text-slate-400 break-all">({creatorEmail})</span>}</span>
                          </p>
                        </div>
                        <button 
                          onClick={() => navigate(`/labrooms/${lab._id || lab.id}`)}
                          className="lm-btn self-start sm:self-auto shrink-0"
                        >
                          Open Lab
                        </button>
                      </div>
                    );
                  })
                )
              )}

              {selectedAnalyticsTab === 'pending' && (
                pendingTeachers.length === 0 ? (
                  <div className="lm-inset text-center py-6 px-3">
                    <p className="text-slate-400 text-xs italic">No pending teacher approvals.</p>
                  </div>
                ) : (
                  pendingTeachers.map((t, idx) => (
                    <div key={idx} className="lm-inset p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-slate-100 font-bold text-sm break-words">{t.name}</h4>
                        <p className="text-xs text-slate-400 break-words">{t.email}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleApproveTeacher(t._id)} className="lm-btn"><CheckIcon className="w-4 h-4" />Approve</button>
                        <button onClick={() => handleRejectTeacher(t._id)} className="lm-btn-ghost border-red-500/40 bg-red-950/60 text-red-300 hover:text-red-200"><XMarkIcon className="w-4 h-4" />Reject</button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}


      {/* VIEW USER PROFILE POPUP (ADMIN) */}
      {isViewUserModalOpen && viewingUser && (
        <div className="lm-scrim">
          <div className="w-full max-w-lg flex justify-center">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
              <h3 className="text-base font-extrabold text-slate-100 uppercase tracking-wide flex items-center gap-2 min-w-0">
                <EyeIcon className="w-5 h-5 text-purple-300 shrink-0" />
                User Profile
              </h3>
              <button onClick={() => setIsViewUserModalOpen(false)} className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer" aria-label="Close" title="Close"><XMarkIcon className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-14 w-14 shrink-0 rounded-2xl bg-gradient-to-br from-slate-300 to-slate-500 flex items-center justify-center text-2xl font-black text-slate-950 shadow-chrome">
                  {(viewingUser.name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="text-slate-100 font-bold text-lg truncate">{viewingUser.name}</h4>
                  <p className="text-slate-400 font-mono text-xs break-all">{viewingUser.email}</p>
                </div>
              </div>

              <div className="lm-inset p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">Role</span>
                  <span className="font-mono font-bold px-2.5 py-0.5 rounded-lg lm-badge text-purple-300 uppercase">{viewingUser.role}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">Roll No</span>
                  <span className="font-mono text-orange-300 break-all text-right">{viewingUser.rollNo || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">Registration No</span>
                  <span className="font-mono text-orange-300 break-all text-right">{viewingUser.registrationNo || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">University Email</span>
                  <span className={`inline-flex items-center gap-1 ${viewingUser.isUniversityEmailVerified ? 'text-emerald-300 font-semibold' : 'text-slate-500'}`}>
                    {viewingUser.isUniversityEmailVerified && <CheckIcon className="lm-ico" />}
                    {viewingUser.isUniversityEmailVerified ? 'Verified' : 'Not Linked'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">Email Verified</span>
                  <span className={`inline-flex items-center gap-1 ${viewingUser.isEmailVerified ? 'text-emerald-300 font-semibold' : 'text-amber-300 font-semibold'}`}>
                    {viewingUser.isEmailVerified && <CheckIcon className="lm-ico" />}
                    {viewingUser.isEmailVerified ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">Personal Email</span>
                  <span className="font-mono text-slate-300 truncate ml-3 text-right">{viewingUser.personalNotificationEmail || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400 uppercase tracking-wider font-bold">User Since</span>
                  <span className="font-mono text-slate-300">{viewingUser.createdAt ? new Date(viewingUser.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <BookOpenIcon className="lm-ico text-slate-400" />
                  Enrollments &amp; Assignments
                </h5>
                {(() => {
                  const uid = String(viewingUser._id || '');
                  const enrollments = classroomsList.filter(c => {
                    const isStudent = (c.students || []).some(s => String(s._id || s) === uid);
                    const isTeacher = String(c.teacher?._id || c.teacher || '') === uid;
                    const isTA = (c.tas || []).some(t => String(t._id || t) === uid);
                    return isStudent || isTeacher || isTA;
                  });
                  if (enrollments.length === 0) {
                    return <p className="text-slate-500 text-xs italic py-4 px-3 text-center lm-inset">No classroom or lab enrollments found.</p>;
                  }
                  return (
                    <div className="space-y-2 max-h-[24vh] overflow-y-auto pr-1">
                      {enrollments.map((c, i) => {
                        const uidStr = String(viewingUser._id || '');
                        const roleTag = String(c.teacher?._id || c.teacher || '') === uidStr
                          ? 'Teacher'
                          : (c.tas || []).some(t => String(t._id || t) === uidStr)
                            ? 'TA'
                            : 'Student';
                        return (
                          <div key={i} className="flex items-center justify-between gap-2 lm-inset px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-slate-100 text-xs font-bold truncate">{c.className}</p>
                              <p className="text-[10px] text-slate-400 font-mono">Section {c.sectionPrefix} • {c.courseType === 'LAB' ? 'Lab Room' : 'Classroom'}</p>
                            </div>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-lg shrink-0 lm-badge ${roleTag === 'Teacher' ? 'text-orange-300 border-orange-500/30' : roleTag === 'TA' ? 'text-sky-300 border-sky-500/30' : 'text-emerald-300 border-emerald-500/30'}`}>{roleTag}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* DOUBLE CONFIRMATION DELETE USER MODAL */}
      {isDeleteUserModalOpen && userToDelete && (
        <div className="lm-scrim">
          <div className="w-full max-w-md flex justify-center">
          <div className="lm-modal p-4 sm:p-5 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <h3 className="text-base font-extrabold text-red-300 uppercase tracking-wide flex items-center gap-2 min-w-0">
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                Confirm User Deletion
              </h3>
              <button onClick={() => setIsDeleteUserModalOpen(false)} className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer" aria-label="Close" title="Close"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            
            <div className="space-y-2 text-xs text-slate-300">
              <p>Are you sure you want to permanently delete this user account?</p>
              <div className="rounded-xl border border-red-500/30 bg-[#0a0f16] p-3 space-y-1 font-mono">
                <p className="text-slate-100 font-bold break-words">{userToDelete.name}</p>
                <p className="text-slate-400 text-[11px] break-all">{userToDelete.email}</p>
                <p className="text-orange-300 text-[10px] uppercase">Role: {userToDelete.role}</p>
              </div>
              <p className="text-red-300 text-[11px] italic">This action cannot be undone.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setIsDeleteUserModalOpen(false)}
                className="lm-btn-ghost sm:flex-1"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={deletingUser}
                onClick={handleConfirmDeleteUser}
                className="inline-flex items-center justify-center gap-2 sm:flex-1 rounded-xl border border-red-400/50 bg-gradient-to-b from-red-400 to-red-600 text-slate-950 font-extrabold uppercase tracking-wider text-xs px-4 py-2.5 cursor-pointer transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-[inset_0_1px_0_0_rgb(255_255_255/0.5),0_10px_24px_-12px_rgb(0_0_0/0.9)]"
              >
                <TrashIcon className="w-4 h-4" />
                {deletingUser ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* CLAIM OFFICIAL ROLL NUMBER MODAL */}
      {isRollNoModalOpen && (
        <div className="lm-scrim">
          <div className="w-full max-w-md flex justify-center">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <h3 className="text-base font-extrabold text-rose-300 uppercase tracking-wide min-w-0">
                Claim Official Roll Number
              </h3>
              <button onClick={() => setIsRollNoModalOpen(false)} className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer" aria-label="Close" title="Close"><XMarkIcon className="w-5 h-5" /></button>
            </div>

            {rollNoMessage && (
              <div className="p-3 lm-inset text-slate-200 rounded-xl text-xs font-mono">
                {rollNoMessage}
              </div>
            )}

            <form onSubmit={handleUpdateMissingRollNo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Official Roll Number</label>
                <input 
                  type="text"
                  required
                  value={missingRollNoInput}
                  onChange={(e) => setMissingRollNoInput(e.target.value)}
                  placeholder="e.g. BITF26A001"
                  className="lm-field font-mono uppercase"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsRollNoModalOpen(false)}
                  className="lm-btn-ghost sm:flex-1"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={rollNoUpdating}
                  className="inline-flex items-center justify-center gap-2 sm:flex-1 rounded-xl border border-rose-300/50 bg-gradient-to-b from-rose-200 to-rose-400 text-slate-950 font-extrabold uppercase tracking-wider text-xs px-4 py-2.5 cursor-pointer transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-[inset_0_1px_0_0_rgb(255_255_255/0.6),0_10px_24px_-12px_rgb(0_0_0/0.9)]"
                >
                  {rollNoUpdating ? 'Claiming...' : 'Claim Roll No'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* EDIT PROFILE MODAL */}
      {isProfileModalOpen && (
        <div className="lm-scrim">
          <div className="w-full max-w-lg flex justify-center">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-100 uppercase tracking-wide min-w-0">
                Account Settings &amp; Profile
              </h3>
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer"
                aria-label="Close"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {profileError && (
              <div className="bg-red-950/60 border border-red-500/40 text-red-200 p-3 rounded-xl text-xs font-medium flex items-start gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 p-3 rounded-xl text-xs font-medium flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <p className="lm-eyebrow text-orange-300">Personal Information</p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <input 
                  type="text" 
                  required
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  className="lm-field"
                />
              </div>

              {isPucitVerified ? (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Official PUCIT Email
                  </label>
                  <input 
                    type="text" 
                    disabled
                    value={user?.email || ''}
                    className="lm-field opacity-70 text-emerald-300 font-mono cursor-not-allowed select-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Personal Notification Email (Fallback - Locked)
                  </label>
                  <input 
                    type="email" 
                    disabled
                    value={profileData.personalNotificationEmail}
                    className="lm-field opacity-70 text-slate-400 font-mono cursor-not-allowed select-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  New Password (Optional)
                </label>
                <div className="relative">
                  <input 
                    type={showNewPassword ? 'text' : 'password'} 
                    value={profileData.password}
                    onChange={(e) => setProfileData({ ...profileData, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                    className="lm-field pr-20"
                  />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[3rem] h-9 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-orange-300 hover:bg-white/[0.06] transition-colors cursor-pointer">{showNewPassword ? 'Hide' : 'Show'}</button>
                </div>
              </div>

              {profileData.password.trim().length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                    Current Password (Required to change)
                  </label>
                  <div className="relative">
                    <input 
                      type={showCurrentPassword ? 'text' : 'password'} 
                      value={profileData.currentPassword}
                      onChange={(e) => setProfileData({ ...profileData, currentPassword: e.target.value })}
                      placeholder="Enter current password"
                      className="lm-field pr-20 border-amber-500/40"
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-[3rem] h-9 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider text-amber-300 hover:text-amber-200 hover:bg-white/[0.06] transition-colors cursor-pointer">{showCurrentPassword ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={updatingProfile}
                className="lm-btn w-full py-3 disabled:opacity-50"
              >
                {updatingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>

            {isStudent && (
              <div className="space-y-4 pt-4 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                    <EnvelopeIcon className="lm-ico" />
                    Official PUCIT Email Verification
                  </p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold lm-badge ${isPucitVerified ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>
                    {isPucitVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>

                {!isPucitVerified && (
                  <div className="space-y-3 lm-inset p-4">
                    {emailMessage && (
                      <div className="p-2.5 lm-card-flat text-slate-200 rounded-xl text-xs font-mono">
                        {emailMessage}
                      </div>
                    )}

                    {emailStep === 'idle' ? (
                      <form onSubmit={handleInitiateEmailLink} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Official PUCIT Email (Locked)</label>
                          <input 
                            type="email"
                            required
                            readOnly
                            value={user?.rollNo ? `${user.rollNo.toLowerCase()}@pucit.edu.pk` : pucitEmailInput}
                            onChange={(e) => setPucitEmailInput(e.target.value)}
                            placeholder="e.g. bitf26a047@pucit.edu.pk"
                            className="lm-field text-emerald-300 font-mono text-xs opacity-70 cursor-not-allowed select-none"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Your official inbox is tied to your roll number and cannot be changed.</p>
                        </div>
                        <button
                          type="submit"
                          disabled={emailLoading}
                          className="lm-btn w-full disabled:opacity-50"
                        >
                          <PaperAirplaneIcon className="w-4 h-4" />
                          {emailLoading ? 'Sending OTP...' : 'Send Verification OTP'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyEmailOtp} className="space-y-3">
                        <p className="text-xs text-slate-300 break-words">Enter the 6-digit verification code sent to <span className="font-mono text-cyan-300 break-all">{user?.rollNo ? `${user.rollNo.toLowerCase()}@pucit.edu.pk` : pucitEmailInput}</span></p>
                        <div>
                          <input 
                            type="text"
                            required
                            value={emailOtpInput}
                            onChange={(e) => setEmailOtpInput(e.target.value)}
                            placeholder="Enter 6-digit OTP"
                            className="lm-field text-xs font-mono tracking-widest text-center"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEmailStep('idle')}
                            className="lm-btn-ghost flex-1"
                          >
                            Back
                          </button>
                          <button
                            type="submit"
                            disabled={emailLoading}
                            className="lm-btn flex-1 disabled:opacity-50"
                          >
                            <CheckIcon className="w-4 h-4" />
                            {emailLoading ? 'Verifying...' : 'Verify Email'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* APPROVE TEACHERS MODAL */}
      {isApproveModalOpen && (
        <div className="lm-scrim">
          <div className="w-full max-w-lg flex justify-center">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <h3 className="text-base sm:text-lg font-extrabold text-purple-300 uppercase tracking-wide flex items-center gap-2 min-w-0">
                <ShieldCheckIcon className="w-5 h-5 shrink-0" />
                Pending Teacher Requests
              </h3>
              <button 
                onClick={() => setIsApproveModalOpen(false)}
                className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer"
                aria-label="Close"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {loadingPending ? (
              <div className="lm-inset text-center py-10 text-slate-400 font-mono text-xs space-y-4">
                <div className="flex justify-center gap-2">
                  <span className="lm-bar" />
                  <span className="lm-bar" />
                  <span className="lm-bar" />
                </div>
                <p>Loading requests...</p>
              </div>
            ) : pendingTeachers.length === 0 ? (
              <div className="lm-inset text-center py-10 px-4">
                <CheckCircleIcon className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                <p className="text-slate-400 text-xs italic">No pending teacher registration requests.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {pendingTeachers.map((t) => (
                  <div key={t._id} className="lm-inset p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-slate-100 font-bold text-sm break-words">{t.name}</h4>
                      <p className="text-xs text-slate-400 break-words">{t.email} • <span className="font-mono text-orange-300">{t.rollNo || 'N/A'}</span></p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => handleApproveTeacher(t._id)}
                        className="lm-btn"
                      >
                        <CheckIcon className="w-4 h-4" />
                        Approve
                      </button>
                      <button 
                        onClick={() => handleRejectTeacher(t._id)}
                        className="lm-btn-ghost border-red-500/40 bg-red-950/60 text-red-300 hover:text-red-200"
                      >
                        <XMarkIcon className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* MAINTENANCE MODE TOGGLE MODAL */}
      {isMaintenanceModalOpen && (
        <div className="lm-scrim">
          <div className="w-full max-w-md flex justify-center">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <h3 className="text-base font-extrabold text-orange-300 uppercase tracking-wide flex items-center gap-2 min-w-0">
                <Cog6ToothIcon className="w-5 h-5 shrink-0" />
                Global Maintenance Mode
              </h3>
              <button onClick={() => setIsMaintenanceModalOpen(false)} className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer" aria-label="Close" title="Close"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When enabled, all non-admin users will be blocked from accessing the portal and presented with a maintenance screen.
            </p>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Maintenance Banner Message</label>
              <textarea 
                rows="3"
                value={maintMessage}
                onChange={(e) => setMaintMessage(e.target.value)}
                className="lm-field text-xs resize-y"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setIsMaintenanceModalOpen(false)}
                className="lm-btn-ghost sm:flex-1"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={togglingMaint}
                onClick={handleToggleMaintenance}
                className={`inline-flex items-center justify-center gap-2 sm:flex-1 rounded-xl border text-slate-950 font-extrabold uppercase tracking-wider text-xs px-4 py-2.5 cursor-pointer transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed shadow-[inset_0_1px_0_0_rgb(255_255_255/0.55),0_10px_24px_-12px_rgb(0_0_0/0.9)] ${
                  maintenance?.isUnderMaintenance 
                    ? 'border-emerald-300/50 bg-gradient-to-b from-emerald-300 to-emerald-500' 
                    : 'border-red-400/50 bg-gradient-to-b from-red-400 to-red-600'
                }`}
              >
                {togglingMaint ? 'Updating...' : (maintenance?.isUnderMaintenance ? 'Turn OFF' : 'Turn ON')}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* CREATE COURSE / LAB POPUP MODAL */}
      {isModalOpen && (
        <div className="lm-scrim">
          <div className="lm-modal p-4 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/10">
              <h3 className="text-base sm:text-lg font-extrabold text-slate-100 uppercase tracking-wide min-w-0">
                Create New Classroom or Lab
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="inline-flex items-center justify-center w-10 h-10 shrink-0 -mr-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] transition-colors text-sm cursor-pointer"
                aria-label="Close"
                title="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="bg-red-950/60 border border-red-500/40 text-red-200 p-3 rounded-xl text-xs font-medium flex items-start gap-2">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateClassroom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-300 mb-2">
                  Course Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleCourseTypeChange('CLASSROOM')}
                    className={`lm-chip py-2.5 px-3 ${newClassData.courseType === 'CLASSROOM' ? 'lm-chip-active' : ''}`}
                  >
                    <BookOpenIcon className="lm-ico" />
                    Classroom (Theory)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCourseTypeChange('LAB')}
                    className={`lm-chip py-2.5 px-3 ${newClassData.courseType === 'LAB' ? 'lm-chip-active' : ''}`}
                  >
                    <BeakerIcon className="lm-ico" />
                    Lab (Practical)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-300 mb-2">
                  Course / Lab Name
                </label>
                <input 
                  type="text" 
                  required
                  value={newClassData.name}
                  onChange={(e) => setNewClassData({ ...newClassData, name: e.target.value })}
                  placeholder={newClassData.courseType === 'LAB' ? 'Data Structures Lab' : 'Data Structures & Algorithms'}
                  className="lm-field"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label className="block text-xs font-bold uppercase tracking-wider text-orange-300 mb-2">
                    Section Prefix
                  </label>
                  <input 
                    type="text" 
                    required
                    value={newClassData.sectionPrefix}
                    onChange={(e) => setNewClassData({ ...newClassData, sectionPrefix: e.target.value })}
                    placeholder="BITF26A"
                    className="lm-field font-mono uppercase"
                  />
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-bold uppercase tracking-wider text-orange-300 mb-2">
                    Credit Hours
                  </label>
                  <input 
                    type="number" 
                    min="1"
                    max="6"
                    required
                    value={newClassData.creditHours}
                    onChange={(e) => setNewClassData({ ...newClassData, creditHours: e.target.value })}
                    className="lm-field font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-300 mb-2">
                  Max Capacity
                </label>
                <input 
                  type="number" 
                  min="10"
                  max="200"
                  required
                  value={newClassData.maxCapacity}
                  onChange={(e) => setNewClassData({ ...newClassData, maxCapacity: e.target.value })}
                  className="lm-field font-mono"
                />
              </div>

              <div className="pt-3 border-t border-white/10">
                <RoomColorPicker
                  value={newClassData.colorKey}
                  onChange={(colorKey) => setNewClassData({ ...newClassData, colorKey })}
                  disabled={creating}
                />
              </div>

              {newClassData.courseType === 'CLASSROOM' && (
                <div className="space-y-4 pt-3 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-orange-300">
                      Grading Weight Distribution (%)
                    </label>
                    <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">Must total 100%</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] sm:text-[11px] text-slate-400 uppercase font-bold block mb-1">Sessionals</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={newClassData.sessionalWeight}
                        onChange={(e) => setNewClassData({ ...newClassData, sessionalWeight: e.target.value })}
                        className="lm-field text-xs font-mono px-3 py-2"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] sm:text-[11px] text-slate-400 uppercase font-bold block mb-1">Mids</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={newClassData.midsWeight}
                        onChange={(e) => setNewClassData({ ...newClassData, midsWeight: e.target.value })}
                        className="lm-field text-xs font-mono px-3 py-2"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] sm:text-[11px] text-slate-400 uppercase font-bold block mb-1">Finals</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={newClassData.finalsWeight}
                        onChange={(e) => setNewClassData({ ...newClassData, finalsWeight: e.target.value })}
                        className="lm-field text-xs font-mono px-3 py-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 lm-inset p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase text-orange-300 flex items-center gap-1.5">
                        <ChartBarIcon className="lm-ico" />
                        Sessional Breakdown
                      </span>
                      <button 
                        type="button" 
                        onClick={() => handleAddActivityRow('CLASSROOM')}
                        className="lm-chip"
                      >
                        <PlusIcon className="lm-ico" />
                        Add Activity
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Total allocated marks must not exceed your Sessional Weight ({newClassData.sessionalWeight}%).
                    </p>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {sessionalActivities.map((act, idx) => (
                        <div key={idx} className="space-y-1.5 lm-card-flat p-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <select 
                              value={act.category}
                              onChange={(e) => handleActivityChange(idx, 'category', e.target.value, 'CLASSROOM')}
                              className="lm-field flex-grow min-w-0 text-xs uppercase font-mono px-3 py-1.5"
                            >
                              <option value="Quiz">Quiz</option>
                              <option value="Assignment">Assignment</option>
                              <option value="Presentation">Presentation</option>
                              <option value="Project">Project</option>
                              <option value="Homework">Homework</option>
                              <option value="Class Activity">Class Activity</option>
                              <option value="Class Participation">Class Participation</option>
                              <option value="Viva">Viva</option>
                              <option value="Special Marks">Special Marks</option>
                            </select>
                            <input 
                              type="number" 
                              required
                              min="1"
                              placeholder="Marks"
                              value={act.allocatedMarks}
                              onChange={(e) => handleActivityChange(idx, 'allocatedMarks', e.target.value, 'CLASSROOM')}
                              className="lm-field w-16 sm:w-20 shrink-0 px-2 py-1.5 text-xs font-mono text-center"
                            />
                            {sessionalActivities.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => handleRemoveActivityRow(idx, 'CLASSROOM')}
                                className="text-red-300 hover:text-red-200 transition-colors p-1.5 shrink-0 cursor-pointer"
                                aria-label="Remove Activity"
                                title="Remove Activity"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {newClassData.courseType === 'LAB' && (
                <div className="space-y-3 lm-inset p-3.5 border-blue-500/25">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase text-blue-300 flex items-center gap-1.5">
                      <BeakerIcon className="lm-ico" />
                      Lab Component Activities
                    </span>
                    <button 
                      type="button" 
                      onClick={() => handleAddActivityRow('LAB')}
                      className="lm-chip"
                    >
                      <PlusIcon className="lm-ico" />
                      Add Lab Activity
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Define lab evaluation categories and allocated marks.
                  </p>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {labActivities.map((act, idx) => (
                      <div key={idx} className="space-y-1.5 lm-card-flat p-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <select 
                            value={act.category}
                            onChange={(e) => handleActivityChange(idx, 'category', e.target.value, 'LAB')}
                            className="lm-field flex-grow min-w-0 text-xs uppercase font-mono px-3 py-1.5"
                          >
                            <option value="Lab Tasks">Lab Tasks</option>
                            <option value="Lab Tests">Lab Tests</option>
                            <option value="Quizzes">Quizzes</option>
                            <option value="Assignments">Assignments</option>
                            <option value="Presentations">Presentations</option>
                            <option value="Vivas">Vivas</option>
                            <option value="Projects">Projects</option>
                            <option value="Homework">Homework</option>
                            <option value="Class Participation">Class Participation</option>
                            <option value="Special Marks">Special Marks</option>
                            <option value="Final Project">Final Project</option>
                            <option value="Lab Mids">Lab Mids</option>
                            <option value="Lab Finals">Lab Finals</option>
                            <option value="Lab Activities">Lab Activities</option>
                            <option value="Lab Behavior">Lab Behavior</option>
                            <option value="Lab Worksheets">Lab Worksheets</option>
                            <option value="Troubleshooting">Troubleshooting</option>
                          </select>
                          <input 
                            type="number" 
                            required
                            min="1"
                            placeholder="Marks"
                            value={act.allocatedMarks}
                            onChange={(e) => handleActivityChange(idx, 'allocatedMarks', e.target.value, 'LAB')}
                            className="lm-field w-20 sm:w-24 shrink-0 px-2 py-1.5 text-xs font-mono text-center"
                          />
                          {labActivities.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveActivityRow(idx, 'LAB')}
                              className="text-red-300 hover:text-red-200 transition-colors p-1.5 shrink-0 cursor-pointer"
                              aria-label="Remove Activity"
                              title="Remove Activity"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="lm-btn-ghost w-full sm:w-1/2 py-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="lm-btn w-full sm:w-1/2 py-3 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Launch Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="relative z-10 mt-8 mb-2 text-center text-xs text-slate-500 space-y-1.5">
        <hr className="lm-divider max-w-xs mx-auto mb-4" />
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed &amp; Administered by <span className="text-orange-300 font-semibold">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default Dashboard;