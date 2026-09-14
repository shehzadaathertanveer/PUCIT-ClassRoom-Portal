const express = require('express');
const markController = require('../controller/markController'); // Fixed typo from markContoller
const { protect, restrictToClassStaff } = require('../middleware/authMiddleware');

const router = express.Router();

// Protect all classroom marks routes (Requires valid JWT Token)
router.use(protect);

// =============================================================================
// STUDENT & GENERAL ACCESS ROUTES
// =============================================================================

// Get single student marks record (Accessible by Student for self, or Staff/Admin)
router.get('/student/:classroomId/:studentId', markController.getStudentMarks);

// Get class performance analytics, category percentages, & rankings summary (Accessible by Students & Staff)
router.get('/analytics/:classroomId', markController.getClassAnalytics);

// =============================================================================
// STAFF & CLASSROOM TA ACCESS ROUTES (Teacher, Admin, or Class-Specific TA)
// =============================================================================

// Get bulk marking sheet with students pre-sorted
router.get('/bulk-sheet/:classroomId', restrictToClassStaff, markController.getBulkMarkSheet);

// Get remaining/unassigned students for a specific classroom evaluation item
router.get('/unassigned/:classroomId', restrictToClassStaff, markController.getUnassignedStudents);

// Get pending grading activities breakdown
router.get('/pending-activities/:classroomId', restrictToClassStaff, markController.getPendingActivities);

// =============================================================================
// BATCH & INDIVIDUAL MANAGEMENT ROUTES
// =============================================================================

// Batch submit marks for entire class (Quizzes, Assignments, Mids, Finals)
router.post('/batch-submit', restrictToClassStaff, markController.batchSubmitMarks);

// Update single evaluation entry for a specific student
router.patch('/update-single-item', restrictToClassStaff, markController.updateSingleStudentMark);

// Delete / Cancel an evaluation entry across the entire classroom (CRITICAL FIX)
router.delete('/delete-evaluation', restrictToClassStaff, markController.deleteEvaluationEntry);

module.exports = router;