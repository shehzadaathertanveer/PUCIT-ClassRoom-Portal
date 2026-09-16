const express = require("express");
const multer = require("multer");
const labController = require("../controller/labController");
const labMarkController = require("../controller/labMarkController");
const authController = require("../controller/authController");
const {
  protect,
  restrictTo,
  restrictToLabStaff,
} = require("../middleware/authMiddleware");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = express.Router();

// All routes require authentication
router.use(protect);

// =============================================================================
// LABROOM COLLECTION ROUTES
// =============================================================================
router
  .route("/")
  .get(labController.getAllLabrooms)
  .post(restrictTo("ADMIN", "TEACHER"), labController.createLabroom);

// =============================================================================
// ROSTER & ENROLLMENT MANAGEMENT ROUTES (Static Global & Specific Paths)
// =============================================================================
router.post(
  "/add-student-by-roll",
  restrictToLabStaff,
  labController.addStudentByRollNo,
);
router.post(
  "/add-students-by-suffix",
  restrictToLabStaff,
  labController.addStudentsBySuffixRolls,
); // Feature 1
router.post(
  "/add-bulk-range",
  restrictToLabStaff,
  labController.addBulkLabStudentsByRange,
); // Feature 2
router.post(
  "/add-drop-seniors",
  restrictToLabStaff,
  labController.addDropLabSeniorsList,
); // Feature 3

router
  .route("/:labroomId/roster")
  .post(restrictToLabStaff, labController.setLabroomRoster);

router
  .route("/:labroomId/add-student-by-roll")
  .post(restrictToLabStaff, labController.addStudentByRollNo);

router
  .route("/:labroomId/add-students-by-suffix")
  .post(restrictToLabStaff, labController.addStudentsBySuffixRolls);

router
  .route("/:labroomId/lookup-student")
  .post(restrictToLabStaff, labController.lookupLabStudentForAddDrop); // Feature 3: Double confirmation lookup

router
  .route("/:labroomId/add-bulk-range")
  .post(restrictToLabStaff, labController.addBulkLabStudentsByRange);

router
  .route("/:labroomId/add-drop-seniors")
  .post(restrictToLabStaff, labController.addDropLabSeniorsList);

// =============================================================================
// AUTO-DETECT & BULK APPROVE AVAILABLE FRESHERS/STUDENTS (Feature 4)
// =============================================================================
router
  .route("/:labroomId/available-students")
  .get(restrictToLabStaff, labController.getAvailableLabStudentsByPrefix);

router
  .route("/:labroomId/bulk-approve-students")
  .post(restrictToLabStaff, labController.bulkApproveAvailableLabStudents);

// Added alias route for frontend backward compatibility
router
  .route("/:labroomId/bulk-approve")
  .post(restrictToLabStaff, labController.bulkApproveAvailableLabStudents);

router
  .route("/:labroomId/smart-reject")
  .patch(restrictToLabStaff, labController.toggleSmartSearchRejection);

// =============================================================================
// EXCEL EXPORT & SYNC ROUTES
// =============================================================================
router
  .route("/:labroomId/export-excel")
  .get(restrictToLabStaff, labMarkController.downloadLabExcelExport);

router
  .route("/:labroomId/sync-excel")
  .post(restrictToLabStaff, upload.single("file"), labController.syncExcelLabMarks);

// =============================================================================
// INSTRUCTOR & TA LOOKUP / ASSIGNMENT ROUTES
// =============================================================================
router
  .route("/assign-teacher")
  .patch(restrictTo("ADMIN"), labController.assignTeacherToLabroom);

router
  .route("/:labroomId/lookup-ta")
  .post(restrictToLabStaff, labController.lookupLabTA);

router
  .route("/:labroomId/lookup-teacher")
  .post(restrictTo("ADMIN"), labController.lookupLabTeacher);

router
  .route("/:labroomId/add-ta")
  .post(restrictToLabStaff, labController.updateLabroomTAs);

// =============================================================================
// INDIVIDUAL LABROOM DETAILS, SETTINGS & DELETION
// =============================================================================

// Labroom Settings Update (Name, Section Prefix, Capacity, Placeholder Teacher, Activities)
router.patch(
  "/:labroomId/settings",
  restrictToLabStaff,
  labController.updateLabroomSettings,
);

router
  .route("/:labroomId")
  .get(labController.getLabroomById)
  .delete(restrictTo("ADMIN", "TEACHER"), labController.hardDeleteLabroom);

router
  .route("/:labroomId/students/:studentId")
  .delete(restrictToLabStaff, labController.removeStudentFromLabroom);

// =============================================================================
// LAB EVALUATION ITEMS (Tasks, Vivas, Tests, Custom Activities)
// =============================================================================
router
  .route("/:labroomId/items")
  .post(restrictToLabStaff, labController.createLabGradedItem)
  .delete(restrictToLabStaff, labController.deleteLabGradedItem);

// =============================================================================
// NOTICE BOARD & ANONYMOUS FEEDBACK / COMPLAINTS
// =============================================================================
router
  .route("/:labroomId/notices")
  .post(restrictToLabStaff, labController.postLabNotice);

router
  .route("/:labroomId/complaints")
  .get(restrictToLabStaff, labController.getLabComplaints)
  .post(restrictTo("STUDENT"), labController.submitLabComplaint);

module.exports = router;