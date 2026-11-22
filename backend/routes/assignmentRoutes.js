const express = require('express');
const assignmentController = require('../controller/assignmentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', assignmentController.createAssignment);
router.get('/me', assignmentController.getMyAssignments);
router.get('/room/:roomType/:roomId', assignmentController.getRoomAssignments);
router.post('/reminders/run', assignmentController.runReminders);
router.get('/:id', assignmentController.getAssignment);
router.post('/:id/submit', assignmentController.submitAssignment);
router.patch('/:id/extend', assignmentController.extendDeadline);
router.patch('/:id/grade/:studentId', assignmentController.gradeSubmission);
router.delete('/:id', assignmentController.deleteAssignment);

module.exports = router;
