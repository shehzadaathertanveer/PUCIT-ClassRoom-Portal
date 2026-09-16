const express = require('express');
const multer = require('multer');
const classroomController = require('../controller/classroomController');
const { protect, restrictTo, restrictToClassStaff } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = express.Router();

// =============================================================================
// GLOBAL PROTECTION (All routes require a valid JWT token)
// =============================================================================
router.use(protect);

// =============================================================================
// 1. GENERAL & CREATION ROUTES (Static paths first to prevent parameter collisions)
// =============================================================================

// Get all active classrooms based on user role (Student, TA, Teacher, Admin)
router.get('/', classroomController.getAllClassrooms);

// Create a new classroom (Restricted to Teachers and Admins)
router.post('/', restrictTo('TEACHER', 'ADMIN'), classroomController.createClassroom);
router.post('/create', restrictTo('TEACHER', 'ADMIN'), classroomController.createClassroom);

// Static body-based management & bulk enrollment routes (Restricted to Class Staff)
router.post('/add-student-by-roll', restrictToClassStaff, classroomController.addStudentByRollNo);
router.post('/add-students-by-suffix', restrictToClassStaff, classroomController.addStudentsBySuffixRolls); // Feature 1: Quick suffix entry
router.post('/add-bulk-range', restrictToClassStaff, classroomController.addBulkStudentsByRange); // Feature 2: Range enrollment
router.post('/add-drop-seniors', restrictToClassStaff, classroomController.addDropSeniorsList); // Feature 3: Add/Drop list
router.post('/set-roster', restrictToClassStaff, classroomController.setClassroomRoster);
router.post('/add-student', restrictToClassStaff, classroomController.addStudentToClassroom);
router.patch('/update-tas', restrictToClassStaff, classroomController.updateClassroomTAs);

// Instructor Assignment (Admin only)
router.patch('/assign-teacher', restrictTo('ADMIN'), classroomController.assignTeacherToClassroom);

// =============================================================================
// 2. SPECIFIC CLASSROOM SUB-ROUTES (Dynamic `/:classroomId` paths)
// =============================================================================

// Classroom Settings Update (Name, Prefix, Capacity, Placeholder Teacher Name, Weights)
router.patch('/:classroomId/settings', restrictToClassStaff, classroomController.updateClassroomSettings);

// Feature 3: Lookup Student Details for Frontend Double-Confirmation / Add-Drop
router.post('/:classroomId/lookup-student', restrictToClassStaff, classroomController.lookupStudentForAddDrop);

// Feature 1 & 4 Path-based alternatives for classroom context
router.post('/:classroomId/add-students-by-suffix', restrictToClassStaff, classroomController.addStudentsBySuffixRolls);

// Feature 4: Auto-Detect Available Students (Matching Section Prefix / Freshers)
router.get('/:classroomId/available-students', restrictToClassStaff, classroomController.getAvailableStudentsByPrefix);
router.post('/:classroomId/bulk-approve-students', restrictToClassStaff, classroomController.bulkApproveAvailableStudents);
router.patch('/:classroomId/smart-reject', restrictToClassStaff, classroomController.toggleSmartSearchRejection);

// Anonymous Complaints & Feedback Box
router.post('/:classroomId/complaints', classroomController.submitComplaint); 
router.get('/:classroomId/complaints', restrictToClassStaff, classroomController.getClassroomComplaints); 

// Graded Items & Result Sheets Creation & Deletion
router.post('/:classroomId/items', restrictToClassStaff, classroomController.createGradedItem);
router.delete('/:classroomId/items', restrictToClassStaff, classroomController.deleteGradedItem);
router.post('/:classroomId/sync-excel', restrictToClassStaff, upload.single('file'), classroomController.syncExcelClassroomMarks);

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

// Get single classroom details with populated references
router.get('/:classroomId', classroomController.getClassroomById);

// Hard delete classroom and wipe all associated marks records (Teacher/Admin)
router.delete('/:classroomId', restrictTo('TEACHER', 'ADMIN'), classroomController.hardDeleteClassroom);

module.exports = router;