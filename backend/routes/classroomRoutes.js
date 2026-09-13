const express = require('express');
const classroomController = require('../controller/classroomController');
const { protect, restrictTo, restrictToClassStaff } = require('../middleware/authMiddleware');

const router = express.Router();

// =============================================================================
// GLOBAL PROTECTION (All routes require a valid JWT token)
// =============================================================================
router.use(protect);

// =============================================================================
// 1. GENERAL & CREATION ROUTES (Static paths first to prevent parameter collisions)
// =============================================================================
router.get('/', classroomController.getAllClassrooms);

router.post('/', restrictTo('TEACHER', 'ADMIN'), classroomController.createClassroom);
router.post('/create', restrictTo('TEACHER', 'ADMIN'), classroomController.createClassroom);

// Static body-based management & bulk enrollment routes
router.post('/add-student-by-roll', restrictToClassStaff, classroomController.addStudentByRollNo);
router.post('/add-bulk-range', restrictToClassStaff, classroomController.addBulkStudentsByRange);
router.post('/add-drop-seniors', restrictToClassStaff, classroomController.addDropSeniorsList);
router.post('/set-roster', restrictToClassStaff, classroomController.setClassroomRoster);
router.post('/add-student', restrictToClassStaff, classroomController.addStudentToClassroom);
router.patch('/update-tas', restrictToClassStaff, classroomController.updateClassroomTAs);
router.patch('/assign-teacher', restrictTo('ADMIN'), classroomController.assignTeacherToClassroom);

// =============================================================================
// 2. SPECIFIC CLASSROOM SUB-ROUTES (Dynamic `/:classroomId` paths)
// =============================================================================

// Classroom Settings Update (Name, Prefix, Capacity, Placeholder Teacher Name, Weights)
router.patch('/:classroomId/settings', restrictToClassStaff, classroomController.updateClassroomSettings);

// Anonymous Complaints & Feedback Box
router.post('/:classroomId/complaints', classroomController.submitComplaint); 
router.get('/:classroomId/complaints', restrictToClassStaff, classroomController.getClassroomComplaints); 

// Graded Items & Result Sheets Creation & Deletion
router.post('/:classroomId/items', restrictToClassStaff, classroomController.createGradedItem);
router.delete('/:classroomId/items', restrictToClassStaff, classroomController.deleteGradedItem);

// TA Lookup & Assignment
router.post('/:classroomId/lookup-ta', restrictToClassStaff, classroomController.lookupTA);
router.post('/:classroomId/add-ta', restrictTo('TEACHER', 'ADMIN'), classroomController.addTA);

// Teacher Lookup for Admin
router.post('/:classroomId/lookup-teacher', restrictTo('ADMIN'), classroomController.lookupTeacher);

// Student Removal from Specific Classroom
router.delete('/:classroomId/students/:studentId', restrictToClassStaff, classroomController.removeStudentFromClassroom);

// Notice Board Announcements
router.post('/:classroomId/notices', restrictToClassStaff, classroomController.postNotice);

// =============================================================================
// 3. SINGLE CLASSROOM DETAILS & DELETION ROUTES
// =============================================================================
router.get('/:classroomId', classroomController.getClassroomById);
router.delete('/:classroomId', restrictTo('TEACHER', 'ADMIN'), classroomController.hardDeleteClassroom);

module.exports = router;