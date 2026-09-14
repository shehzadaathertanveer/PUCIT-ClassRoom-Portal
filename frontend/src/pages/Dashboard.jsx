import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';

const Dashboard = () => {
  const { user, logout, updateUser, maintenance, setMaintenance } = useAuth();
  const [classroomsList, setClassroomsList] = useState([]);
  const [pendingTeachers, setPendingTeachers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  
  // Detailed Analytics Modal & Drill-down states
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [selectedAnalyticsTab, setSelectedAnalyticsTab] = useState('users'); // 'users' | 'classrooms' | 'labrooms' | 'pending'
  const [userRoleFilter, setUserRoleFilter] = useState('ALL'); // 'ALL' | 'STUDENT' | 'TEACHER' | 'TA' | 'ADMIN'
  const [detailedAnalyticsData, setDetailedAnalyticsData] = useState({ users: [], teachers: [] });

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

  // Edit Profile / Password & Email Verification modal state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    password: '',
    personalNotificationEmail: user?.personalNotificationEmail || ''
  });
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

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
        API.get('/classrooms').catch(() => ({ data: { classrooms: [] } })),
        API.get('/labrooms').catch(() => ({ data: { labrooms: [] } }))
      ]);

      const classrooms = classRes.data?.data?.classrooms || classRes.data?.classrooms || [];
      const labrooms = labRes.data?.data?.labrooms || labRes.data?.labrooms || [];

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
      const [pendingRes, analyticsRes, usersRes] = await Promise.all([
        API.get('/auth/admin/pending-teachers').catch(() => null),
        API.get('/auth/admin/analytics').catch(() => null),
        API.get('/auth/admin/users').catch(() => ({ data: { data: { users: [] } } }))
      ]);

      if (pendingRes?.data?.data?.teachers) {
        setPendingTeachers(pendingRes.data.data.teachers);
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
        teachers: pendingTeachers
      });
    } catch (err) {
      console.warn('Failed to fetch admin backend data');
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

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
      gradingScheme: {
        sessionalWeight: sWeight,
        midsWeight: mWeight,
        finalsWeight: fWeight
      },
      sessionalActivities: sessionalActivities.map(act => ({
        category: act.category === 'Other' ? (act.customCategory.trim() || 'Custom Activity') : act.category,
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
      sessionalActivities: labActivities.map(act => ({
        category: act.category === 'Other' ? (act.customCategory.trim() || 'Custom Lab Activity') : act.category,
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
        payload.password = profileData.password.trim();
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
      const res = await API.post('/auth/attach-email/initiate', {
        universityEmail: pucitEmailInput.trim().toLowerCase()
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
      const res = await API.post('/auth/attach-email/verify-otp', {
        universityEmail: pucitEmailInput.trim().toLowerCase(),
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

  const filteredAnalyticsUsers = detailedAnalyticsData.users.filter(u => {
    if (userRoleFilter === 'ALL') return true;
    return u.role === userRoleFilter;
  });

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#080507] px-3 sm:px-6 lg:px-8 py-5 sm:py-8 overflow-hidden selection:bg-orange-400 selection:text-black">
      
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-orange-500/15 sm:bg-orange-500/20 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] sm:w-[40vw] h-[60vw] sm:h-[40vw] bg-rose-500/10 sm:bg-rose-500/15 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none"></div>

      {needsRollNo && (
        <div className="relative z-20 max-w-6xl mx-auto w-full mb-4 bg-rose-950/80 border border-rose-500/50 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <span className="text-xl">🎓</span>
            <div>
              <p className="text-xs font-bold text-rose-200 uppercase tracking-wide">Official Roll Number Required</p>
              <p className="text-[11px] text-slate-300">You currently have a temporary prefix assigned. Claim your official roll number (e.g. <span className="font-mono text-rose-300">BITF26A001</span>) to complete your profile.</p>
            </div>
          </div>
          <button
            onClick={() => setIsRollNoModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 bg-rose-500 hover:bg-rose-400 text-black font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-md text-center"
          >
            Claim Official Roll No →
          </button>
        </div>
      )}

      {!needsRollNo && needsEmailLink && (
        <div className="relative z-20 max-w-6xl mx-auto w-full mb-4 bg-amber-950/80 border border-amber-500/50 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-xs font-bold text-amber-200 uppercase tracking-wide">Official PUCIT Email Not Verified</p>
              <p className="text-[11px] text-slate-300">Link and verify your official <span className="font-mono text-orange-300">@pucit.edu.pk</span> email address to unlock complete portal features.</p>
            </div>
          </div>
          <button
            onClick={() => { setProfileData({ name: user?.name || '', password: '', personalNotificationEmail: user?.personalNotificationEmail || '' }); setIsProfileModalOpen(true); }}
            className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-md text-center"
          >
            Verify Email Now →
          </button>
        </div>
      )}

      {/* HEADER */}
      <header className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-4 bg-[#130910]/90 backdrop-blur-2xl border border-orange-500/30 rounded-3xl sm:rounded-2xl px-4 sm:px-6 py-5 shadow-[0_0_30px_rgba(249,115,22,0.08)]">
        <div className="text-center lg:text-left space-y-1 w-full lg:w-auto">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-rose-300 to-pink-400">
            PUCIT Classroom & Lab Portal
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-300 leading-snug">
            Welcome, <span className="text-orange-400 font-bold">{user?.name || 'User'}</span> <span className="block sm:inline">({user?.rollNo || user?.email})</span> • <span className="uppercase text-slate-200 font-mono font-semibold">{user?.role}</span>
          </p>
        </div>

        {!isAdmin && (
          <div className="flex flex-col items-center lg:items-start gap-1 w-full lg:w-auto my-1 lg:my-0">
            <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase px-1">Quick Overview</span>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 bg-[#080507]/90 border border-slate-700/85 p-2 rounded-2xl shadow-inner w-full sm:w-auto">
              {isStudent ? (
                <>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Enrolled Classrooms', items: enrolledClassrooms, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="px-3 py-2 bg-[#170c14] hover:bg-slate-800 border border-orange-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <span className="text-slate-300">📖 Classes:</span>
                    <span className="font-mono text-orange-400 font-black px-1.5 py-0.5 bg-orange-500/10 rounded-lg">{enrolledClassrooms.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Enrolled Labs', items: enrolledLabs, type: 'LAB' }); setIsNavDetailModalOpen(true); }}
                    className="px-3 py-2 bg-[#170c14] hover:bg-slate-800 border border-blue-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <span className="text-slate-300">🧪 Labs:</span>
                    <span className="font-mono text-blue-400 font-black px-1.5 py-0.5 bg-blue-500/10 rounded-lg">{enrolledLabs.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Assigned TA Courses', items: assignedTAsCourses, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="px-3 py-2 bg-[#170c14] hover:bg-slate-800 border border-purple-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <span className="text-slate-300">🛡️ TA:</span>
                    <span className="font-mono text-purple-400 font-black px-1.5 py-0.5 bg-purple-500/10 rounded-lg">{assignedTAsCourses.length}</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Created Classrooms', items: createdClassrooms, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="px-3 py-2 bg-[#170c14] hover:bg-slate-800 border border-orange-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <span className="text-slate-300">📖 Classes:</span>
                    <span className="font-mono text-orange-400 font-black px-1.5 py-0.5 bg-orange-500/10 rounded-lg">{createdClassrooms.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Created Labs', items: createdLabrooms, type: 'LAB' }); setIsNavDetailModalOpen(true); }}
                    className="px-3 py-2 bg-[#170c14] hover:bg-slate-800 border border-blue-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <span className="text-slate-300">🧪 Labs:</span>
                    <span className="font-mono text-blue-400 font-black px-1.5 py-0.5 bg-blue-500/10 rounded-lg">{createdLabrooms.length}</span>
                  </button>
                  <button
                    onClick={() => { setNavModalConfig({ title: 'Assigned/Instructed Courses', items: assignedTeacherCourses, type: 'CLASSROOM' }); setIsNavDetailModalOpen(true); }}
                    className="px-3 py-2 bg-[#170c14] hover:bg-slate-800 border border-emerald-500/40 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <span className="text-slate-300">👨‍🏫 Assigned:</span>
                    <span className="font-mono text-emerald-400 font-black px-1.5 py-0.5 bg-emerald-500/10 rounded-lg">{assignedTeacherCourses.length}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => { setProfileData({ name: user?.name || '', password: '', personalNotificationEmail: user?.personalNotificationEmail || '' }); setIsProfileModalOpen(true); }}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-extrabold uppercase tracking-wide rounded-xl transition-all cursor-pointer flex-grow sm:flex-grow-0 text-center shadow"
          >
            ⚙️ Profile
          </button>

          {user?.role === 'ADMIN' && (
            <>
              <button
                onClick={() => { setIsApproveModalOpen(true); fetchAdminData(); }}
                className="px-3.5 py-2.5 bg-purple-950/80 hover:bg-purple-900 border border-purple-500/40 text-purple-200 text-xs font-extrabold uppercase tracking-wide rounded-xl transition-all cursor-pointer flex-grow sm:flex-grow-0 text-center shadow"
              >
                🛡️ Teachers {pendingTeachers.length > 0 && `(${pendingTeachers.length})`}
              </button>
              <button
                onClick={() => setIsMaintenanceModalOpen(true)}
                className={`px-3.5 py-2.5 border text-xs font-extrabold uppercase tracking-wide rounded-xl transition-all cursor-pointer flex-grow sm:flex-grow-0 text-center shadow ${
                  maintenance?.isUnderMaintenance 
                    ? 'bg-red-950 border-red-500 text-red-300 animate-pulse' 
                    : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                }`}
              >
                Maint: {maintenance?.isUnderMaintenance ? 'ON' : 'OFF'}
              </button>
            </>
          )}

          {isTeacherOrAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2.5 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black text-xs font-extrabold uppercase tracking-wide rounded-xl transition-all shadow-md shadow-orange-500/20 cursor-pointer flex-grow sm:flex-grow-0 text-center"
            >
              + Create Course
            </button>
          )}

          <button 
            onClick={logout}
            className="px-3.5 py-2.5 bg-red-950/60 hover:bg-red-900/80 border border-red-500/30 text-red-200 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex-grow sm:flex-grow-0 text-center shadow"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="relative z-10 w-full max-w-6xl mx-auto my-6 space-y-6 flex-grow flex flex-col justify-center">
        
        {user?.role === 'ADMIN' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">System Analytics Overview</h2>
              <button 
                onClick={() => { fetchAdminData(); setIsAnalyticsModalOpen(true); }}
                className="text-[11px] font-bold text-orange-400 hover:text-orange-300 cursor-pointer uppercase tracking-wider underline"
              >
                Open Full Analytics Vault →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div 
                onClick={() => { setSelectedAnalyticsTab('users'); setUserRoleFilter('ALL'); fetchAdminData(); setIsAnalyticsModalOpen(true); }}
                className="bg-[#130910]/90 border border-purple-500/30 hover:border-purple-400 rounded-2xl p-3.5 sm:p-4 text-center space-y-1 shadow-md cursor-pointer transition-all"
              >
                <p className="text-[10px] font-mono uppercase text-slate-400">Total Users</p>
                <p className="text-xl sm:text-2xl font-black text-white">{analytics?.totalUsers || detailedAnalyticsData.users.length || 0}</p>
                <p className="text-[9px] text-purple-400 font-bold uppercase">View Records →</p>
              </div>

              <div 
                onClick={() => { setSelectedAnalyticsTab('classrooms'); setIsAnalyticsModalOpen(true); }}
                className="bg-[#130910]/90 border border-orange-500/30 hover:border-orange-400 rounded-2xl p-3.5 sm:p-4 text-center space-y-1 shadow-md cursor-pointer transition-all"
              >
                <p className="text-[10px] font-mono uppercase text-slate-400">Classrooms</p>
                <p className="text-xl sm:text-2xl font-black text-orange-400">{classroomsOnly.length}</p>
                <p className="text-[9px] text-orange-400 font-bold uppercase">View Classes →</p>
              </div>

              <div 
                onClick={() => { setSelectedAnalyticsTab('labrooms'); setIsAnalyticsModalOpen(true); }}
                className="bg-[#130910]/90 border border-blue-500/30 hover:border-blue-400 rounded-2xl p-3.5 sm:p-4 text-center space-y-1 shadow-md cursor-pointer transition-all"
              >
                <p className="text-[10px] font-mono uppercase text-slate-400">Lab Rooms</p>
                <p className="text-xl sm:text-2xl font-black text-blue-400">{labroomsOnly.length}</p>
                <p className="text-[9px] text-blue-400 font-bold uppercase">View Labs →</p>
              </div>

              <div 
                onClick={() => { setSelectedAnalyticsTab('pending'); fetchAdminData(); setIsAnalyticsModalOpen(true); }}
                className="bg-[#130910]/90 border border-emerald-500/30 hover:border-emerald-400 rounded-2xl p-3.5 sm:p-4 text-center space-y-1 shadow-md cursor-pointer transition-all"
              >
                <p className="text-[10px] font-mono uppercase text-slate-400">Pending Teachers</p>
                <p className="text-xl sm:text-2xl font-black text-emerald-300">{pendingTeachers.length}</p>
                <p className="text-[9px] text-emerald-400 font-bold uppercase">Review List →</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-xl font-extrabold text-white tracking-wide uppercase">
              {user?.role === 'ADMIN' ? 'All Active Classrooms & Labs' : 'Your Classrooms & Labs'}
            </h2>
            <span className="text-xs font-mono bg-orange-950/50 border border-orange-500/30 text-orange-300 px-3 py-1.5 rounded-xl">
              {classroomsList.length} {classroomsList.length === 1 ? 'Course' : 'Courses'}
            </span>
          </div>

          {loading ? (
            <div className="text-center py-20 text-slate-400 font-mono text-sm">
              Syncing academic portal...
            </div>
          ) : fetchError ? (
            <div className="bg-red-950/60 border border-red-500/40 rounded-3xl p-8 text-center space-y-3 max-w-md mx-auto">
              <p className="text-red-300 font-bold text-sm">Connection Error</p>
              <p className="text-xs text-slate-300">{fetchError}</p>
              <button 
                onClick={fetchDashboardData}
                className="px-4 py-2 bg-red-900 hover:bg-red-800 text-white font-bold text-xs uppercase rounded-xl cursor-pointer"
              >
                Retry Connection
              </button>
            </div>
          ) : classroomsList.length === 0 ? (
            <div className="bg-[#130910]/70 backdrop-blur-xl border border-orange-500/20 rounded-3xl p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto shadow-inner my-auto">
              <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/30 rounded-2xl flex items-center justify-center mx-auto text-orange-400 text-xl font-bold">
                📚
              </div>
              <h3 className="text-white font-bold text-base">No Courses Available</h3>
              
              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                {user?.role === 'STUDENT' 
                  ? 'You are not currently enrolled in any active classes or labs. Contact your TA or teacher to add you.' 
                  : 'You have not created or been assigned to any classrooms or labs yet. Click below to launch your first course!'}
              </p>

              {isTeacherOrAdmin && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-3 w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black font-extrabold text-xs uppercase rounded-xl tracking-wide transition-all shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  + Create Course / Lab Now
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
                    className={`backdrop-blur-2xl rounded-3xl p-4 sm:p-6 space-y-4 transition-all shadow-xl flex flex-col justify-between ${
                      isLab 
                        ? 'bg-gradient-to-b from-[#090d16]/95 to-[#05080e]/95 border border-blue-500/40 hover:border-blue-400 shadow-blue-950/30' 
                        : 'bg-gradient-to-b from-[#160b13]/95 to-[#0b0509]/95 border border-orange-500/40 hover:border-orange-400 shadow-orange-950/30'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono px-2.5 py-1 rounded-lg uppercase tracking-wider border font-bold ${
                            isLab 
                              ? 'bg-blue-500/15 border-blue-500/40 text-blue-300' 
                              : 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                          }`}>
                            {cls.sectionPrefix || 'Section'}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border uppercase tracking-wider ${isLab ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300' : 'bg-rose-500/15 border-rose-500/40 text-rose-300'}`}>
                            {isLab ? '🧪 Lab' : '📖 Class'} ({cls.creditHours || (isLab ? 1 : 3)} Cr)
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Active</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <h3 className="text-white font-bold text-base sm:text-lg tracking-tight">
                          {cls.className || cls.labName || cls.name || 'Untitled Course'}
                        </h3>
                        <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wider ${roleBadge.color}`}>
                          {roleBadge.label}
                        </span>
                      </div>
                      
                      <div className="space-y-1 text-xs text-slate-300 bg-[#080507]/60 p-3 rounded-xl border border-white/5">
                        <p className="text-slate-400">Created / Instructed By:</p>
                        <p className="text-white font-semibold flex items-center gap-1.5">
                          <span>👤</span> {creatorName}
                        </p>
                        {creatorEmail && (
                          <p className="text-[11px] font-mono text-slate-400 pl-4">{creatorEmail}</p>
                        )}
                        <p className="pt-1 border-t border-white/5 flex justify-between">
                          <span>Students Enrolled:</span>
                          <span className="text-white font-mono font-bold">{cls.students?.length || 0} / {cls.maxCapacity || 50}</span>
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-mono">
                        TAs: {cls.tas?.length || 0}
                      </span>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(detailRoute);
                        }}
                        className={`px-4 py-2 text-xs font-extrabold uppercase rounded-xl tracking-wide transition-all shadow-md cursor-pointer ${
                          isLab 
                            ? 'bg-gradient-to-r from-blue-400 to-indigo-500 hover:from-blue-300 hover:to-indigo-400 text-black shadow-blue-500/25' 
                            : 'bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black shadow-orange-500/25'
                        }`}
                      >
                        Open Course
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-3 sm:px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-5 sm:p-7 space-y-5 shadow-2xl my-auto max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-white uppercase tracking-wide">
                {navModalConfig.title} ({navModalConfig.items.length})
              </h3>
              <button 
                onClick={() => setIsNavDetailModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {navModalConfig.items.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-8 italic">No courses found in this category.</p>
            ) : (
              <div className="space-y-3">
                {navModalConfig.items.map((item, idx) => {
                  const isLab = item.courseType === 'LAB' || item.labName;
                  const courseId = item._id || item.id || item.labId;
                  const detailRoute = isLab ? `/labrooms/${courseId}` : `/classroom/${courseId}`;
                  const creatorName = item.teacher?.name || item.placeholderTeacherName || 'System Admin';

                  return (
                    <div key={idx} className="bg-[#080507] border border-slate-800 rounded-2xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/30 text-orange-300 font-bold">
                          {item.sectionPrefix || 'Section'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {isLab ? '🧪 Lab Room' : '📖 Classroom'}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-white font-bold text-sm sm:text-base">{item.className || item.labName || item.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Instructor: <span className="text-white font-semibold">{creatorName}</span></p>
                        <p className="text-xs text-slate-400">Enrolled Students: <span className="font-mono text-emerald-400 font-bold">{item.students?.length || 0} / {item.maxCapacity || 50}</span></p>
                      </div>
                      <div className="pt-2 border-t border-slate-800 flex justify-end">
                        <button
                          onClick={() => { setIsNavDetailModalOpen(false); navigate(detailRoute); }}
                          className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-400 text-black font-extrabold text-xs uppercase rounded-xl cursor-pointer shadow-sm"
                        >
                          View Course →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL ANALYTICS VAULT MODAL */}
      {isAnalyticsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-3 sm:px-4 overflow-y-auto py-6">
          <div className="w-full max-w-4xl bg-[#130910] border border-orange-500/40 rounded-3xl p-4 sm:p-8 space-y-6 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base sm:text-lg font-extrabold text-white uppercase tracking-wide flex items-center gap-2">
                📊 System Analytics Vault
              </h3>
              <button 
                onClick={() => setIsAnalyticsModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => setSelectedAnalyticsTab('users')}
                className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${selectedAnalyticsTab === 'users' ? 'bg-purple-600 text-black border-purple-400 shadow-md' : 'bg-[#080507] text-slate-300 border-slate-700'}`}
              >
                Users ({detailedAnalyticsData.users.length})
              </button>
              <button
                onClick={() => setSelectedAnalyticsTab('classrooms')}
                className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${selectedAnalyticsTab === 'classrooms' ? 'bg-orange-500 text-black border-orange-400 shadow-md' : 'bg-[#080507] text-slate-300 border-slate-700'}`}
              >
                Classrooms ({classroomsOnly.length})
              </button>
              <button
                onClick={() => setSelectedAnalyticsTab('labrooms')}
                className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${selectedAnalyticsTab === 'labrooms' ? 'bg-blue-500 text-black border-blue-400 shadow-md' : 'bg-[#080507] text-slate-300 border-slate-700'}`}
              >
                Lab Rooms ({labroomsOnly.length})
              </button>
              <button
                onClick={() => setSelectedAnalyticsTab('pending')}
                className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${selectedAnalyticsTab === 'pending' ? 'bg-emerald-500 text-black border-emerald-400 shadow-md' : 'bg-[#080507] text-slate-300 border-slate-700'}`}
              >
                Pending ({pendingTeachers.length})
              </button>
            </div>

            {selectedAnalyticsTab === 'users' && (
              <div className="flex flex-wrap items-center gap-1.5 bg-[#080507] p-2 rounded-2xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">Filter Role:</span>
                {['ALL', 'STUDENT', 'TEACHER', 'TA', 'ADMIN'].map(role => (
                  <button
                    key={role}
                    onClick={() => setUserRoleFilter(role)}
                    className={`px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                      userRoleFilter === role 
                        ? 'bg-purple-500 text-black shadow-sm' 
                        : 'bg-[#130910] text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {selectedAnalyticsTab === 'users' && (
                filteredAnalyticsUsers.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-6 italic">No user records found for filter: {userRoleFilter}</p>
                ) : (
                  filteredAnalyticsUsers.map((u, idx) => (
                    <div key={idx} className="bg-[#080507] border border-slate-800 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-white font-bold text-sm">{u.name}</h4>
                        <p className="text-xs text-slate-400">{u.email} • <span className="font-mono text-orange-400">{u.rollNo || 'No RollNo'}</span></p>
                      </div>
                      <div className="flex items-center gap-2.5 self-start sm:self-auto">
                        <span className="text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300">
                          {u.role}
                        </span>
                        {u._id !== user?._id && (
                          <button 
                            onClick={() => { setUserToDelete(u); setIsDeleteUserModalOpen(true); }}
                            className="p-2 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 rounded-xl text-xs cursor-pointer transition-all"
                            title="Delete User Account"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )
              )}

              {selectedAnalyticsTab === 'classrooms' && (
                classroomsOnly.length === 0 ? (
                  <p className="text-slate-400 text-xs text-center py-6 italic">No active classrooms created.</p>
                ) : (
                  classroomsOnly.map((cls, idx) => {
                    const creatorName = cls.teacher?.name || cls.placeholderTeacherName || 'System Admin / TBA';
                    const creatorEmail = cls.teacher?.email || '';
                    return (
                      <div key={idx} className="bg-[#080507] border border-orange-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="text-white font-bold text-sm">{cls.className}</h4>
                          <p className="text-xs text-slate-400">
                            Section: <span className="font-mono text-orange-300">{cls.sectionPrefix}</span> • Enrolled: <span className="font-mono">{cls.students?.length || 0}</span>
                          </p>
                          <p className="text-[11px] text-slate-300">
                            👤 Created By: <span className="text-white font-semibold">{creatorName}</span> {creatorEmail && <span className="font-mono text-slate-400">({creatorEmail})</span>}
                          </p>
                        </div>
                        <button 
                          onClick={() => navigate(`/classroom/${cls._id || cls.id}`)}
                          className="px-3 py-1.5 bg-orange-500 text-black font-extrabold text-xs uppercase rounded-xl text-center self-start sm:self-auto cursor-pointer"
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
                  <p className="text-slate-400 text-xs text-center py-6 italic">No active lab rooms created.</p>
                ) : (
                  labroomsOnly.map((lab, idx) => {
                    const creatorName = lab.teacher?.name || lab.placeholderTeacherName || 'System Admin / TBA';
                    const creatorEmail = lab.teacher?.email || '';
                    return (
                      <div key={idx} className="bg-[#080507] border border-blue-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="text-white font-bold text-sm">{lab.className}</h4>
                          <p className="text-xs text-slate-400">
                            Section: <span className="font-mono text-blue-300">{lab.sectionPrefix}</span> • Enrolled: <span className="font-mono">{lab.students?.length || 0}</span>
                          </p>
                          <p className="text-[11px] text-slate-300">
                            👤 Created By: <span className="text-white font-semibold">{creatorName}</span> {creatorEmail && <span className="font-mono text-slate-400">({creatorEmail})</span>}
                          </p>
                        </div>
                        <button 
                          onClick={() => navigate(`/labrooms/${lab._id || lab.id}`)}
                          className="px-3 py-1.5 bg-blue-500 text-black font-extrabold text-xs uppercase rounded-xl text-center self-start sm:self-auto cursor-pointer"
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
                  <p className="text-slate-400 text-xs text-center py-6 italic">No pending teacher approvals.</p>
                ) : (
                  pendingTeachers.map((t, idx) => (
                    <div key={idx} className="bg-[#080507] border border-emerald-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-white font-bold text-sm">{t.name}</h4>
                        <p className="text-xs text-slate-400">{t.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveTeacher(t._id)} className="px-3 py-1.5 bg-emerald-600 text-black font-bold text-xs uppercase rounded-xl cursor-pointer">Approve</button>
                        <button onClick={() => handleRejectTeacher(t._id)} className="px-3 py-1.5 bg-red-950 text-red-300 border border-red-500/40 font-bold text-xs uppercase rounded-xl cursor-pointer">Reject</button>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* DOUBLE CONFIRMATION DELETE USER MODAL */}
      {isDeleteUserModalOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md px-3 sm:px-4">
          <div className="w-full max-w-md bg-[#130910] border border-red-500/50 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-red-400 uppercase tracking-wide">
                ⚠️ Confirm User Deletion
              </h3>
              <button onClick={() => setIsDeleteUserModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1">✕</button>
            </div>
            
            <div className="space-y-2 text-xs text-slate-300">
              <p>Are you sure you want to permanently delete this user account?</p>
              <div className="bg-[#080507] p-3 rounded-xl border border-red-500/30 space-y-1 font-mono">
                <p className="text-white font-bold">{userToDelete.name}</p>
                <p className="text-slate-400 text-[11px]">{userToDelete.email}</p>
                <p className="text-orange-400 text-[10px] uppercase">Role: {userToDelete.role}</p>
              </div>
              <p className="text-red-300 text-[11px] italic">This action cannot be undone.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setIsDeleteUserModalOpen(false)}
                className="w-1/2 py-2.5 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={deletingUser}
                onClick={handleConfirmDeleteUser}
                className="w-1/2 py-2.5 bg-red-600 hover:bg-red-500 text-white font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50"
              >
                {deletingUser ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLAIM OFFICIAL ROLL NUMBER MODAL */}
      {isRollNoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-3 sm:px-4">
          <div className="w-full max-w-md bg-[#130910] border border-rose-500/40 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-rose-300 uppercase tracking-wide">
                Claim Official Roll Number
              </h3>
              <button onClick={() => setIsRollNoModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1">✕</button>
            </div>

            {rollNoMessage && (
              <div className="p-3 bg-slate-900 border border-slate-700 text-slate-200 rounded-xl text-xs font-mono">
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
                  className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm font-mono uppercase focus:ring-2 focus:ring-rose-400"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsRollNoModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={rollNoUpdating}
                  className="w-1/2 py-2.5 bg-rose-500 hover:bg-rose-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {rollNoUpdating ? 'Claiming...' : 'Claim Roll No'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PROFILE MODAL */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-3 sm:px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-5 sm:p-8 space-y-6 shadow-2xl my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base sm:text-lg font-extrabold text-white uppercase tracking-wide">
                Account Settings & Profile
              </h3>
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {profileError && (
              <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-3 rounded-xl text-xs font-medium">
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 p-3 rounded-xl text-xs font-medium">
                {profileSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">Personal Information</p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <input 
                  type="text" 
                  required
                  value={profileData.name}
                  onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
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
                    className="w-full px-4 py-3 bg-[#080507]/60 border border-slate-800 rounded-xl text-emerald-400 font-mono text-sm cursor-not-allowed select-none"
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
                    className="w-full px-4 py-3 bg-[#080507]/60 border border-slate-800 rounded-xl text-slate-400 font-mono text-sm cursor-not-allowed select-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  New Password (Optional)
                </label>
                <input 
                  type="password" 
                  value={profileData.password}
                  onChange={(e) => setProfileData({ ...profileData, password: e.target.value })}
                  placeholder="Leave blank to keep current password"
                  className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              <button
                type="submit"
                disabled={updatingProfile}
                className="w-full py-3 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black font-extrabold uppercase text-xs rounded-xl transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 cursor-pointer"
              >
                {updatingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>

            {isStudent && (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Official PUCIT Email Verification</p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${isPucitVerified ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                    {isPucitVerified ? '✓ Verified' : 'Unverified'}
                  </span>
                </div>

                {!isPucitVerified && (
                  <div className="space-y-3 bg-[#080507] p-4 rounded-2xl border border-slate-800">
                    {emailMessage && (
                      <div className="p-2.5 bg-slate-900 border border-slate-700 text-slate-200 rounded-xl text-xs font-mono">
                        {emailMessage}
                      </div>
                    )}

                    {emailStep === 'idle' ? (
                      <form onSubmit={handleInitiateEmailLink} className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Enter PUCIT Email</label>
                          <input 
                            type="email"
                            required
                            value={pucitEmailInput}
                            onChange={(e) => setPucitEmailInput(e.target.value)}
                            placeholder="e.g. bitf26a047@pucit.edu.pk"
                            className="w-full px-3.5 py-2.5 bg-[#130910] border border-slate-700 rounded-xl text-white text-xs font-mono focus:ring-1 focus:ring-cyan-400"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={emailLoading}
                          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50"
                        >
                          {emailLoading ? 'Sending OTP...' : 'Send Verification OTP'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyEmailOtp} className="space-y-3">
                        <p className="text-xs text-slate-300">Enter the 6-digit verification code sent to <span className="font-mono text-cyan-400">{pucitEmailInput}</span></p>
                        <div>
                          <input 
                            type="text"
                            required
                            value={emailOtpInput}
                            onChange={(e) => setEmailOtpInput(e.target.value)}
                            placeholder="Enter 6-digit OTP"
                            className="w-full px-3.5 py-2.5 bg-[#130910] border border-slate-700 rounded-xl text-white text-xs font-mono tracking-widest text-center focus:ring-1 focus:ring-cyan-400"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEmailStep('idle')}
                            className="w-1/2 py-2 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer"
                          >
                            Back
                          </button>
                          <button
                            type="submit"
                            disabled={emailLoading}
                            className="w-1/2 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold uppercase text-xs rounded-xl cursor-pointer disabled:opacity-50"
                          >
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
      )}

      {/* APPROVE TEACHERS MODAL */}
      {isApproveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-3 sm:px-4">
          <div className="w-full max-w-lg bg-[#130910] border border-purple-500/40 rounded-3xl p-5 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-extrabold text-purple-300 uppercase tracking-wide">
                Pending Teacher Requests
              </h3>
              <button 
                onClick={() => setIsApproveModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {loadingPending ? (
              <div className="text-center py-8 text-slate-400 font-mono text-xs">Loading requests...</div>
            ) : pendingTeachers.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-8 italic">No pending teacher registration requests.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {pendingTeachers.map((t) => (
                  <div key={t._id} className="bg-[#080507] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-white font-bold text-sm">{t.name}</h4>
                      <p className="text-xs text-slate-400">{t.email} • <span className="font-mono text-orange-400">{t.rollNo || 'N/A'}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleApproveTeacher(t._id)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold text-xs uppercase rounded-xl cursor-pointer"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleRejectTeacher(t._id)}
                        className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-500/40 text-red-300 font-bold text-xs uppercase rounded-xl cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAINTENANCE MODE TOGGLE MODAL */}
      {isMaintenanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-3 sm:px-4">
          <div className="w-full max-w-md bg-[#130910] border border-orange-500/40 rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-orange-400 uppercase tracking-wide">
                Global Maintenance Mode
              </h3>
              <button onClick={() => setIsMaintenanceModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1">✕</button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When enabled, all non-admin users will be blocked from accessing the portal and presented with a maintenance screen.
            </p>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Maintenance Banner Message</label>
              <textarea 
                rows="3"
                value={maintMessage}
                onChange={(e) => setMaintMessage(e.target.value)}
                className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setIsMaintenanceModalOpen(false)}
                className="w-1/2 py-2.5 bg-slate-800 text-slate-300 font-bold uppercase text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={togglingMaint}
                onClick={handleToggleMaintenance}
                className={`w-1/2 py-2.5 font-extrabold uppercase text-xs rounded-xl cursor-pointer text-black ${
                  maintenance?.isUnderMaintenance 
                    ? 'bg-emerald-400 hover:bg-emerald-300' 
                    : 'bg-red-500 hover:bg-red-400'
                }`}
              >
                {togglingMaint ? 'Updating...' : (maintenance?.isUnderMaintenance ? 'Turn OFF' : 'Turn ON')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE COURSE / LAB POPUP MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-3 sm:px-4 overflow-y-auto py-6">
          <div className="w-full max-w-lg bg-[#130910] border border-orange-500/40 rounded-3xl p-5 sm:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in duration-200 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-extrabold text-white uppercase tracking-wide">
                Create New Classroom or Lab
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-3 rounded-xl text-xs font-medium">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateClassroom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                  Course Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleCourseTypeChange('CLASSROOM')}
                    className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${newClassData.courseType === 'CLASSROOM' ? 'bg-orange-500 text-black border-orange-400 shadow-md shadow-orange-500/20' : 'bg-[#080507] text-slate-300 border-slate-700 hover:bg-slate-800'}`}
                  >
                    📖 Classroom (Theory)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCourseTypeChange('LAB')}
                    className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border cursor-pointer ${newClassData.courseType === 'LAB' ? 'bg-blue-500 text-black border-blue-400 shadow-md shadow-blue-500/20' : 'bg-[#080507] text-slate-300 border-slate-700 hover:bg-slate-800'}`}
                  >
                    🧪 Lab (Practical)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                  Course / Lab Name
                </label>
                <input 
                  type="text" 
                  required
                  value={newClassData.name}
                  onChange={(e) => setNewClassData({ ...newClassData, name: e.target.value })}
                  placeholder={newClassData.courseType === 'LAB' ? 'Data Structures Lab' : 'Data Structures & Algorithms'}
                  className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                    Section Prefix
                  </label>
                  <input 
                    type="text" 
                    required
                    value={newClassData.sectionPrefix}
                    onChange={(e) => setNewClassData({ ...newClassData, sectionPrefix: e.target.value })}
                    placeholder="BITF26A"
                    className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                    Credit Hours
                  </label>
                  <input 
                    type="number" 
                    min="1"
                    max="6"
                    required
                    value={newClassData.creditHours}
                    onChange={(e) => setNewClassData({ ...newClassData, creditHours: e.target.value })}
                    className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80 mb-2">
                  Max Capacity
                </label>
                <input 
                  type="number" 
                  min="10"
                  max="200"
                  required
                  value={newClassData.maxCapacity}
                  onChange={(e) => setNewClassData({ ...newClassData, maxCapacity: e.target.value })}
                  className="w-full px-4 py-3 bg-[#080507] border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              {newClassData.courseType === 'CLASSROOM' && (
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-orange-400/80">
                      Grading Weight Distribution (%)
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">Must total 100%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Sessionals</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={newClassData.sessionalWeight}
                        onChange={(e) => setNewClassData({ ...newClassData, sessionalWeight: e.target.value })}
                        className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Mids</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={newClassData.midsWeight}
                        onChange={(e) => setNewClassData({ ...newClassData, midsWeight: e.target.value })}
                        className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Finals</span>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        value={newClassData.finalsWeight}
                        onChange={(e) => setNewClassData({ ...newClassData, finalsWeight: e.target.value })}
                        className="w-full px-3 py-2 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 bg-[#080507] p-3.5 rounded-2xl border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-orange-400">Sessional Breakdown</span>
                      <button 
                        type="button" 
                        onClick={() => handleAddActivityRow('CLASSROOM')}
                        className="px-2.5 py-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                      >
                        + Add Activity
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Total allocated marks must not exceed your Sessional Weight ({newClassData.sessionalWeight}%).
                    </p>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {sessionalActivities.map((act, idx) => (
                        <div key={idx} className="space-y-1.5 bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                          <div className="flex items-center gap-2">
                            <select 
                              value={act.category}
                              onChange={(e) => handleActivityChange(idx, 'category', e.target.value, 'CLASSROOM')}
                              className="flex-grow px-3 py-1.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs uppercase font-mono"
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
                              <option value="Other">Other (Custom)</option>
                            </select>
                            <input 
                              type="number" 
                              required
                              min="1"
                              placeholder="Marks"
                              value={act.allocatedMarks}
                              onChange={(e) => handleActivityChange(idx, 'allocatedMarks', e.target.value, 'CLASSROOM')}
                              className="w-20 px-2.5 py-1.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono text-center"
                            />
                            {sessionalActivities.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => handleRemoveActivityRow(idx, 'CLASSROOM')}
                                className="text-red-400 hover:text-red-300 text-xs px-2 cursor-pointer font-bold"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                          {act.category === 'Other' && (
                            <input 
                              type="text" 
                              required
                              placeholder="Enter custom activity name"
                              value={act.customCategory}
                              onChange={(e) => handleActivityChange(idx, 'customCategory', e.target.value, 'CLASSROOM')}
                              className="w-full px-3 py-1.5 bg-[#080507] border border-orange-500/40 rounded-xl text-white text-xs"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {newClassData.courseType === 'LAB' && (
                <div className="space-y-3 bg-[#080507] p-3.5 rounded-2xl border border-blue-500/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-blue-400">Lab Component Activities</span>
                    <button 
                      type="button" 
                      onClick={() => handleAddActivityRow('LAB')}
                      className="px-2.5 py-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 rounded-lg text-[10px] font-bold uppercase cursor-pointer"
                    >
                      + Add Lab Activity
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Define lab evaluation categories and allocated marks.
                  </p>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {labActivities.map((act, idx) => (
                      <div key={idx} className="space-y-1.5 bg-[#130910] p-2.5 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2">
                          <select 
                            value={act.category}
                            onChange={(e) => handleActivityChange(idx, 'category', e.target.value, 'LAB')}
                            className="flex-grow px-3 py-1.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs uppercase font-mono"
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
                            <option value="Other">Other (Custom)</option>
                          </select>
                          <input 
                            type="number" 
                            required
                            min="1"
                            placeholder="Marks"
                            value={act.allocatedMarks}
                            onChange={(e) => handleActivityChange(idx, 'allocatedMarks', e.target.value, 'LAB')}
                            className="w-24 px-2.5 py-1.5 bg-[#080507] border border-slate-700 rounded-xl text-white text-xs font-mono text-center"
                          />
                          {labActivities.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveActivityRow(idx, 'LAB')}
                              className="text-red-400 hover:text-red-300 text-xs px-2 cursor-pointer font-bold"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        {act.category === 'Other' && (
                          <input 
                            type="text" 
                            required
                            placeholder="Enter custom lab activity name"
                            value={act.customCategory}
                            onChange={(e) => handleActivityChange(idx, 'customCategory', e.target.value, 'LAB')}
                            className="w-full px-3 py-1.5 bg-[#080507] border border-blue-500/40 rounded-xl text-white text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="w-1/2 py-3 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-300 hover:to-rose-400 text-black font-extrabold uppercase text-xs rounded-xl transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Launch Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="relative z-10 mt-8 text-center text-xs text-slate-500 space-y-1">
        <p>© 2026 PUCIT Classroom (Non-Official) • All Rights Reserved</p>
        <p className="text-slate-600">Designed & Administered by <span className="text-orange-400/80 font-semibold">Shehzada Ather</span></p>
      </footer>

    </div>
  );
};

export default Dashboard;