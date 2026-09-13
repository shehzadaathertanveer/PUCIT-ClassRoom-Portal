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

// Public maintenance status endpoint (so frontend login/banner can check if site is down)
router.get('/maintenance/status', authController.getMaintenanceStatus);

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

// =============================================================================
// ADMIN ANALYTICS & MAINTENANCE CONTROL ROUTES (Admin Only)
// =============================================================================
router.get('/admin/analytics', restrictTo('ADMIN'), authController.getAdminAnalytics);
router.get('/admin/users', restrictTo('ADMIN'), authController.getAllUsersAdmin); // <-- Added route for Analytics Vault users list
// Add both variations to your backend authRoutes.js under Admin Routes:
// Add or change the route to accept POST requests to match your frontend API call
router.post('/admin/maintenance', restrictTo('ADMIN'), authController.toggleMaintenanceMode);
router.patch('/admin/maintenance', restrictTo('ADMIN'), authController.toggleMaintenanceMode); // Keep patch as fallback
router.patch('/admin/maintenance', restrictTo('ADMIN'), authController.toggleMaintenanceMode); // Fallback alias

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