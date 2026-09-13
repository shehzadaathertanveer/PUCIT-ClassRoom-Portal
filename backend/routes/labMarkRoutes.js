const express = require('express');
const labMarkController = require('../controller/labMarkController');
const { protect, restrictToLabStaff } = require('../middleware/authMiddleware');
const Labroom = require('../models/labSchema');

const router = express.Router();

// All routes require login authentication
router.use(protect);

// =============================================================================
// LAB MARKS & ANALYTICS ROUTES (Supports both URL patterns)
// =============================================================================

// Analytics Routes (Updated to support students safely via custom helper middleware)
router.route('/analytics/:labroomId').get(authAnalyticsAccess, labMarkController.getLabroomAnalytics);
router.route('/:labroomId/analytics').get(authAnalyticsAccess, labMarkController.getLabroomAnalytics);

// Excel Export Routes
router.route('/export-excel/:labroomId').get(restrictToLabStaff, labMarkController.downloadLabExcelExport);
router.route('/:labroomId/export-excel').get(restrictToLabStaff, labMarkController.downloadLabExcelExport);

// Bulk Sheet Routes
router.route('/bulk-sheet/:labroomId').get(authMarkStaffOrStudent, labMarkController.getBulkLabMarkSheet);
router.route('/:labroomId/bulksheet').get(authMarkStaffOrStudent, labMarkController.getBulkLabMarkSheet);

// Pending Activities Routes
router.route('/pending-activities/:labroomId').get(restrictToLabStaff, labMarkController.getPendingLabActivities);
router.route('/:labroomId/pending').get(restrictToLabStaff, labMarkController.getPendingLabActivities);

// Unassigned Students Routes
router.route('/unassigned/:labroomId').get(restrictToLabStaff, labMarkController.getUnassignedLabStudents);
router.route('/:labroomId/unassigned').get(restrictToLabStaff, labMarkController.getUnassignedLabStudents);

// Batch Submit / Save Marks Routes
router.route('/batch-submit').post(restrictToLabStaff, labMarkController.batchSubmitLabMarks);
router.route('/:labroomId/batch').post(restrictToLabStaff, labMarkController.batchSubmitLabMarks);

// Delete / Cancel Evaluation Routes
router.route('/delete-evaluation').delete(restrictToLabStaff, labMarkController.deleteEvaluationEntry);
router.route('/:labroomId/delete-evaluation').delete(restrictToLabStaff, labMarkController.deleteEvaluationEntry);

// Update Single Student Item Mark
router.route('/update-single-item').patch(restrictToLabStaff, labMarkController.updateSingleStudentLabMark);
router.route('/:labroomId/single').patch(restrictToLabStaff, labMarkController.updateSingleStudentLabMark);

// Student Marksheet Routes
router.route('/student/:labroomId/:studentId').get(authMarkStaffOrStudent, labMarkController.getStudentLabMarks);
router.route('/:labroomId/student/:studentId').get(authMarkStaffOrStudent, labMarkController.getStudentLabMarks);

// =============================================================================
// HELPER MIDDLEWARES
// =============================================================================

async function authAnalyticsAccess(req, res, next) {
  try {
    if (['ADMIN', 'TEACHER'].includes(req.user.role)) {
      return next();
    }

    const labroomId = req.params.labroomId;
    const labroom = await Labroom.findById(labroomId);
    if (!labroom) {
      return res.status(404).json({ status: 'fail', message: 'Labroom not found.' });
    }

    const isInstructor = labroom.teacher?.toString() === req.user._id.toString();
    const isTa = (labroom.tas || []).some(ta => ta.toString() === req.user._id.toString());

    if (isInstructor || isTa) {
      return next();
    }

    // If student is enrolled, attach flag so controller can return safe non-ranking metrics
    const isEnrolledStudent = (labroom.students || []).some(st => st.toString() === req.user._id.toString());
    if (isEnrolledStudent) {
      req.isStudentAnalytics = true;
      return next();
    }

    return res.status(403).json({ status: 'fail', message: 'You do not have access to this lab analytics.' });
  } catch (err) {
    return res.status(500).json({ status: 'fail', message: err.message });
  }
}

async function authMarkStaffOrStudent(req, res, next) {
  if (['ADMIN', 'TEACHER'].includes(req.user.role)) {
    return next();
  }
  
  if (req.params.studentId && req.params.studentId === req.user._id.toString()) {
    return next();
  }

  return restrictToLabStaff(req, res, next);
}

module.exports = router;