const express = require('express');
const labController = require('../controller/labcontroller'); 
const labMarkController = require('../controller/labMarkController'); // <-- Added import
const authController = require('../controller/authController'); 
const { protect, restrictTo, restrictToLabStaff } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes require authentication
router.use(protect);

// =============================================================================
// LABROOM COLLECTION ROUTES
// =============================================================================
router
  .route('/')
  .get(labController.getAllLabrooms)
  .post(
    restrictTo('ADMIN', 'TEACHER'),
    labController.createLabroom
  );

// =============================================================================
// ROSTER & ENROLLMENT MANAGEMENT ROUTES 
// =============================================================================
router.post('/add-student-by-roll', restrictToLabStaff, labController.addStudentByRollNo);
router.post('/add-bulk-range', restrictToLabStaff, labController.addBulkLabStudentsByRange);
router.post('/add-drop-seniors', restrictToLabStaff, labController.addDropLabSeniorsList);

router
  .route('/:labroomId/roster')
  .post(
    restrictToLabStaff,
    labController.setLabroomRoster
  );

router
  .route('/:labroomId/add-student-by-roll')
  .post(
    restrictToLabStaff,
    labController.addStudentByRollNo
  );

router
  .route('/:labroomId/add-bulk-range')
  .post(
    restrictToLabStaff,
    labController.addBulkLabStudentsByRange
  );

router
  .route('/:labroomId/add-drop-seniors')
  .post(
    restrictToLabStaff,
    labController.addDropLabSeniorsList
  );

// =============================================================================
// EXCEL EXPORT ROUTE
// =============================================================================
router
  .route('/:labroomId/export-excel')
  .get(
    restrictToLabStaff,
    labMarkController.downloadLabExcelExport // <-- Uses labMarkController correctly
  );

// =============================================================================
// INSTRUCTOR & TA LOOKUP / ASSIGNMENT ROUTES
// =============================================================================
router
  .route('/assign-teacher')
  .patch(
    restrictTo('ADMIN'),
    labController.assignTeacherToLabroom
  );

router
  .route('/:labroomId/lookup-ta')
  .post(
    restrictToLabStaff,
    labController.lookupLabTA
  );

router
  .route('/:labroomId/lookup-teacher')
  .post(
    restrictTo('ADMIN'),
    labController.lookupLabTeacher
  );

router
  .route('/:labroomId/add-ta')
  .post(
    restrictToLabStaff,
    labController.updateLabroomTAs
  );

// =============================================================================
// INDIVIDUAL LABROOM DETAILS, SETTINGS & DELETION
// =============================================================================
router
  .route('/:labroomId')
  .get(labController.getLabroomById)
  .patch(
    restrictToLabStaff,
    labController.updateLabroomSettings
  )
  .delete(
    restrictTo('ADMIN', 'TEACHER'),
    labController.hardDeleteLabroom
  );

router
  .route('/:labroomId/students/:studentId')
  .delete(
    restrictToLabStaff,
    labController.removeStudentFromLabroom
  );

// =============================================================================
// LAB EVALUATION ITEMS (Tasks, Vivas, Tests, Custom Activities)
// =============================================================================
router
  .route('/:labroomId/items')
  .post(
    restrictToLabStaff,
    labController.createLabGradedItem
  )
  .delete(
    restrictToLabStaff,
    labController.deleteLabGradedItem
  );

// =============================================================================
// NOTICE BOARD & ANONYMOUS FEEDBACK / COMPLAINTS
// =============================================================================
router
  .route('/:labroomId/notices')
  .post(
    restrictToLabStaff,
    labController.postLabNotice
  );

router
  .route('/:labroomId/complaints')
  .get(
    restrictToLabStaff,
    labController.getLabComplaints
  )
  .post(
    restrictTo('STUDENT'),
    labController.submitLabComplaint
  );

module.exports = router;