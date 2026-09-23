const express = require('express');
const authController = require('../controller/authController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

const router = express.Router();

// =============================================================================
// PUBLIC AUTHENTICATION & MAINTENANCE STATUS (Unauthenticated Users)
// =============================================================================
router.post('/signup/initiate', authController.initiateRegistration);
router.post('/verify-otp', authController.verifyRegistrationOTP);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/verify-otp', authController.resetPasswordWithOTP);
router.post('/verify-recovery-otp', authController.verifyRecoveryOtp);

// Public maintenance status endpoint (so frontend login/banner can check if site is down)
router.get('/maintenance/status', authController.getMaintenanceStatus);

// Public registration mode endpoint (drives the registration form's live behavior)
router.get('/registration-mode', authController.getRegistrationMode);

// =============================================================================
// PROTECTED USER ROUTES (Requires Valid JWT Token)
// =============================================================================
router.use(protect);

router.get('/me', authController.getMe);
router.patch('/update-profile', authController.updateProfile);
router.patch('/update-my-password', authController.updatePasswordInProfile);

// PUCIT Email Linking for Freshers
router.post('/attach-email/initiate', authController.requestOfficialEmailActivation);
router.post('/attach-email/verify-otp', authController.verifyOfficialEmailActivation);
router.patch('/update-rollno', authController.updateFresherRollNo);

// =============================================================================
// ADMIN ANALYTICS & MAINTENANCE CONTROL ROUTES (Admin Only)
// =============================================================================
router.get('/admin/analytics', restrictTo('ADMIN'), authController.getAdminAnalytics);
router.get('/admin/users', restrictTo('ADMIN'), authController.getAllUsersAdmin); 

// Admin User Deletion Control Route
router.delete('/admin/users/:userId', restrictTo('ADMIN'), authController.adminDeleteUser);

// Admin: remove stale unverified registration attempts so stuck freshers can re-register
router.post('/admin/cleanup-registrations', restrictTo('ADMIN'), authController.cleanupUnverifiedRegistrations);

// Admin: repair student email/roll integrity (promote official email used as
// personal, delete flaw-group students, dedupe roll numbers). dryRun preview supported.
router.post('/admin/fix-student-email-integrity', restrictTo('ADMIN'), authController.runStudentEmailIntegrityFix);

router.post('/admin/maintenance', restrictTo('ADMIN'), authController.toggleMaintenanceMode);
router.patch('/admin/maintenance', restrictTo('ADMIN'), authController.toggleMaintenanceMode);

// Admin: fresher prefix registration toggle + daily email quota status
router.post('/admin/registration-mode', restrictTo('ADMIN'), authController.toggleRegistrationMode);
router.patch('/admin/registration-mode', restrictTo('ADMIN'), authController.toggleRegistrationMode);
router.get('/admin/email-quota', restrictTo('ADMIN'), authController.getEmailQuota);

// =============================================================================
// ADMIN TEACHER APPROVAL & REJECTION ROUTES (Admin Only)
// =============================================================================
router.get('/admin/pending-teachers', restrictTo('ADMIN'), authController.getPendingTeachers);
router.patch('/admin/approve-teacher/:id', restrictTo('ADMIN'), authController.approvePendingTeacher);
router.patch('/admin/approve-teacher', restrictTo('ADMIN'), authController.approvePendingTeacher);
router.patch('/admin/reject-teacher/:id', restrictTo('ADMIN'), authController.rejectTeacher);

// =============================================================================
// STAFF & ADMIN ACCESSIBLE ROUTES (TA, TEACHER, ADMIN)
// =============================================================================
router.patch(
  '/reset-student-password-staff',
  restrictTo('TA', 'TEACHER', 'ADMIN'),
  authController.resetStudentPasswordByStaff
);

module.exports = router;