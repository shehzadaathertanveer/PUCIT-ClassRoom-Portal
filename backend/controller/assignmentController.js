const mongoose = require('mongoose');

const Assignment = require('../models/assignmentSchema');
const Classroom = require('../models/classRoomSchema');
const Labroom = require('../models/labSchema');
const Mark = require('../models/markSchema');
const LabMark = require('../models/labMarkSchema');
const User = require('../models/userSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService');
const { normaliseNoticeAttachment } = require('../utils/noticeAttachment');
const {
  cloudinaryConfigured,
  publicIdsFromAttachment,
  resourceTypeFromUrl,
  fetchResourceBytes,
  safeDestroyPublicIds,
} = require('../utils/cloudinaryCleanup');

const CLASS_KEYS = ['quizzes', 'assignments', 'presentations', 'projects', 'homework', 'classActivities', 'classParticipation', 'vivas', 'specialMarks'];
const LAB_KEYS = ['labTasks', 'labTests', 'quizzes', 'assignments', 'presentations', 'vivas', 'projects', 'finalProject', 'labMids', 'labFinals', 'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'];
const UNIT_MULTIPLIERS = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
const ALLOWED_TYPES = ['pdf', 'zip', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg'];
const INSTRUCTION_FILE_LIMIT = 10 * 1024 * 1024;

const roomModel = (roomType) => roomType === 'LABROOM' ? Labroom : Classroom;
const allowedKeys = (roomType) => roomType === 'LABROOM' ? LAB_KEYS : CLASS_KEYS;
const roomLabel = (roomType, room) => roomType === 'LABROOM' ? (room.labName || 'Lab') : (room.className || 'Classroom');

const formatSize = (value, unit) => `${value} ${unit}`;
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const attachmentForStorage = (raw, label) => {
  const check = normaliseNoticeAttachment(raw);
  if (!check.ok) return { error: `${label}: ${check.message}` };
  if (!check.attachment.url) return { error: `${label} is required.` };
  return { attachment: check.attachment };
};

const validateFilePayload = async (raw, assignment) => {
  if (!raw || typeof raw !== 'object') return { error: 'A file is required.' };
  if (raw.size !== undefined && (!Number.isFinite(Number(raw.size)) || Number(raw.size) <= 0)) {
    return { error: 'Invalid file size.' };
  }
  const fileName = String(raw.fileName || '').trim();
  const ext = fileName.split('.').pop().toLowerCase();
  if (!assignment.allowedTypes.includes(ext)) {
    return { error: `Only ${assignment.allowedTypes.join(', ').toUpperCase()} files are accepted.` };
  }
  const limit = Number(assignment.maxSize) * UNIT_MULTIPLIERS[assignment.maxSizeUnit];
  const check = normaliseNoticeAttachment(raw);
  if (!check.ok) return { error: check.message };
  if (!check.attachment.url) return { error: 'A valid Cloudinary file is required.' };

  let verifiedSize = Number(raw.size) || 0;
  if (cloudinaryConfigured) {
    const actualSize = await fetchResourceBytes(
      check.attachment.public_id,
      resourceTypeFromUrl(check.attachment.url)
    );
    if (actualSize === null) return { error: 'Could not verify the uploaded file. Please try again.' };
    verifiedSize = actualSize;
  }
  if (verifiedSize > limit) {
    return { error: `File must be ${formatSize(assignment.maxSize, assignment.maxSizeUnit)} or smaller.` };
  }

  return {
    file: {
      ...check.attachment,
      size: verifiedSize,
    },
  };
};

const getRoom = async (roomType, roomId) => {
  if (!['CLASSROOM', 'LABROOM'].includes(roomType)) throw new AppError('Invalid room type.', 400);
  if (!mongoose.Types.ObjectId.isValid(roomId)) throw new AppError('Invalid room id.', 400);
  const room = await roomModel(roomType).findById(roomId);
  if (!room) throw new AppError('Room not found.', 404);
  return room;
};

const isStaff = (user, room) => {
  if (['ADMIN', 'TEACHER'].includes(user.role)) return true;
  const teacherId = room.teacher?._id || room.teacher;
  if (teacherId && teacherId.toString() === user._id.toString()) return true;
  return (room.tas || []).some((ta) => (ta?._id || ta)?.toString() === user._id.toString());
};

const isMember = (user, room) => {
  if (isStaff(user, room)) return true;
  return (room.students || []).some((student) => (student?._id || student)?.toString() === user._id.toString());
};

const isEnrolledStudent = (user, room) => {
  if (user.role !== 'STUDENT') return false;
  return (room.students || []).some((student) => (student?._id || student)?.toString() === user._id.toString());
};

const assertStaff = (user, room) => {
  if (!isStaff(user, room)) throw new AppError('You are not allowed to manage assignments in this room.', 403);
};

const assignmentUrl = (id) => `${process.env.CLIENT_URL || ''}/assignments/${id}`;

const notifyStudents = async (assignment, room, subject, bodyText, importance = 'important') => {
  const studentIds = (room.students || []).map((student) => student?._id || student);
  if (!studentIds.length) return;
  const students = await User.find({ _id: { $in: studentIds } }).select('name email personalNotificationEmail').lean();
  await Promise.all(students.map((student) => {
    const email = student.personalNotificationEmail || student.email;
    if (!email || email.includes('@temp.pucit.edu.pk')) return Promise.resolve();
    return sendStyledEmail({
      to: email,
      subject,
      title: subject,
      bodyText,
      details: [
        { label: 'Task', value: assignment.title },
        { label: 'Course', value: roomLabel(assignment.roomType, room) },
        { label: 'Deadline', value: new Date(assignment.dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
        { label: 'Open Task', value: `<a href="${assignmentUrl(assignment._id)}">View & Submit</a>` },
      ],
      importance,
    }).catch((err) => console.warn('Assignment email failed:', err?.message || err));
  }));
};

const summary = (assignment) => ({
  ...assignment.toObject({ depopulate: true }),
  isPastDue: new Date(assignment.dueAt).getTime() < Date.now(),
  submissionCount: (assignment.submissions || []).length,
});

const updateMarkRecord = async (assignment, studentId, marks) => {
  const isLab = assignment.roomType === 'LABROOM';
  const Model = isLab ? LabMark : Mark;
  const roomField = isLab ? 'labroom' : 'classroom';
  const key = assignment.categoryKey;
  if (!allowedKeys(assignment.roomType).includes(key)) return;

  let doc = await Model.findOne({ [roomField]: assignment.room, student: studentId });
  if (!doc) doc = new Model({ [roomField]: assignment.room, student: studentId });
  if (!Array.isArray(doc[key])) doc[key] = [];

  const existing = doc[key].find((item) => String(item.assignmentId || '') === String(assignment._id));
  const row = {
    title: assignment.title,
    totalMarks: assignment.totalMarks,
    obtainedMarks: marks,
    isAbsent: false,
    assignmentId: assignment._id,
    file: existing?.file || { url: '', public_id: '', fileType: '', fileName: '' },
  };
  if (isLab) row.isGraded = true;
  if (existing) Object.assign(existing, row);
  else doc[key].push(row);
  await doc.save();
};

const syncMarkFile = async (assignment, studentId, file) => {
  const isLab = assignment.roomType === 'LABROOM';
  const Model = isLab ? LabMark : Mark;
  const roomField = isLab ? 'labroom' : 'classroom';
  const doc = await Model.findOne({ [roomField]: assignment.room, student: studentId });
  if (!doc || !Array.isArray(doc[assignment.categoryKey])) return;
  let changed = false;
  for (const item of doc[assignment.categoryKey]) {
    if (String(item.assignmentId || '') === String(assignment._id)) {
      item.file = { ...file };
      changed = true;
    }
  }
  if (changed) await doc.save();
};

const removeAssignmentRecord = async (assignment) => {
  const publicIds = [
    ...publicIdsFromAttachment(assignment.instructionsFile),
    ...(assignment.submissions || []).flatMap((sub) => publicIdsFromAttachment(sub.file)),
  ];
  const Model = assignment.roomType === 'LABROOM' ? LabMark : Mark;
  const roomField = assignment.roomType === 'LABROOM' ? 'labroom' : 'classroom';
  const pull = {};
  for (const key of allowedKeys(assignment.roomType)) {
    pull[key] = { assignmentId: assignment._id };
  }
  await Model.updateMany({ [roomField]: assignment.room }, { $pull: pull });
  await Assignment.findByIdAndDelete(assignment._id);
  if (publicIds.length) await safeDestroyPublicIds(publicIds);
};

exports.deleteAssignmentById = async (assignmentId) => {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) return null;
  await removeAssignmentRecord(assignment);
  return assignment;
};

exports.deleteAssignmentsForRoom = async (roomType, roomId) => {
  const assignments = await Assignment.find({ roomType, room: roomId });
  for (const assignment of assignments) {
    await removeAssignmentRecord(assignment);
  }
  return assignments.length;
};

exports.createAssignment = catchAsync(async (req, res, next) => {
  const {
    roomType, roomId, categoryKey, title, description, totalMarks, dueAt,
    allowedTypes, maxSize, maxSizeUnit, instructionsFile,
  } = req.body;

  const room = await getRoom(roomType, roomId);
  assertStaff(req.user, room, roomType);

  const key = String(categoryKey || '').trim();
  if (!allowedKeys(roomType).includes(key)) return next(new AppError('Invalid sessional category.', 400));
  if (!title || !title.trim()) return next(new AppError('Task title is required.', 400));
  const duplicate = await Assignment.findOne({
    roomType,
    room: room._id,
    categoryKey: key,
    title: { $regex: `^${escapeRegex(title.trim())}$`, $options: 'i' },
  }).select('_id');
  if (duplicate) return next(new AppError('A task with this title already exists in this category.', 409));
  if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) return next(new AppError('A valid deadline is required.', 400));
  if (new Date(dueAt).getTime() <= Date.now()) return next(new AppError('Deadline must be in the future.', 400));

  const marks = Number(totalMarks);
  if (!Number.isFinite(marks) || marks <= 0) return next(new AppError('Valid total marks are required.', 400));

  const types = Array.isArray(allowedTypes) && allowedTypes.length
    ? [...new Set(allowedTypes.map((t) => String(t).toLowerCase().replace(/^\./, '')))]
    : ['pdf', 'zip'];
  const badType = types.find((type) => !ALLOWED_TYPES.includes(type));
  if (badType) return next(new AppError(`Unsupported file type: ${badType}`, 400));

  const size = Number(maxSize || 10);
  const unit = String(maxSizeUnit || 'KB').toUpperCase();
  if (!Number.isFinite(size) || size <= 0 || !UNIT_MULTIPLIERS[unit]) {
    return next(new AppError('Invalid maximum file size.', 400));
  }

  let instructionAttachment = {};
  if (instructionsFile && instructionsFile.url) {
    const result = attachmentForStorage(instructionsFile, 'Instructions file');
    if (result.error) return next(new AppError(result.error, 400));
    let instructionSize = Number(instructionsFile.size) || 0;
    if (cloudinaryConfigured) {
      const actualSize = await fetchResourceBytes(
        result.attachment.public_id,
        resourceTypeFromUrl(result.attachment.url)
      );
      if (actualSize === null) return next(new AppError('Could not verify the instruction file. Please try again.', 400));
      instructionSize = actualSize;
    }
    if (instructionSize > INSTRUCTION_FILE_LIMIT) return next(new AppError('Instruction file must be 10 MB or smaller.', 400));
    instructionAttachment = { ...result.attachment, size: instructionSize };
  }

  const roomItem = {
    title: title.trim(),
    totalMarks: marks,
    hasViva: false,
    createdAt: new Date(),
  };

  const assignment = await Assignment.create({
    roomType,
    room: room._id,
    categoryKey: key,
    title: title.trim(),
    description: String(description || '').trim(),
    instructionsFile: instructionAttachment,
    totalMarks: marks,
    dueAt: new Date(dueAt),
    allowedTypes: types,
    maxSize: size,
    maxSizeUnit: unit,
    createdBy: req.user._id,
  });

  room[key] = room[key] || [];
  room[key].push({ ...roomItem, assignmentId: assignment._id });
  await room.save();
  assignment.evaluationItemId = room[key][room[key].length - 1]._id;
  await assignment.save();

  await notifyStudents(
    assignment,
    room,
    `New Assignment: ${assignment.title}`,
    `You have been assigned <strong>${assignment.title}</strong>.<br><br>${assignment.description || 'Open the task to view instructions.'}<br><br>Deadline: <strong>${new Date(assignment.dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong>.`
  );

  res.status(201).json({ status: 'success', message: 'Assignment created and students notified.', data: { assignment: summary(assignment) } });
});

exports.getMyAssignments = catchAsync(async (req, res, next) => {
  const assignments = await Assignment.find({
    $or: [
      { submissions: { $elemMatch: { student: req.user._id } } },
      { roomType: 'CLASSROOM', room: { $in: await Classroom.find({ students: req.user._id }).distinct('_id') } },
      { roomType: 'LABROOM', room: { $in: await Labroom.find({ students: req.user._id }).distinct('_id') } },
    ],
  }).sort({ dueAt: 1 });

  const roomInfo = new Map();
  for (const assignment of assignments) {
    const room = await roomModel(assignment.roomType).findById(assignment.room).select('className labName');
    roomInfo.set(String(assignment._id), roomLabel(assignment.roomType, room || {}));
  }

  const data = assignments.map((assignment) => {
    const own = (assignment.submissions || []).find((sub) => sub.student.toString() === req.user._id.toString());
    return {
      ...summary(assignment),
      roomName: roomInfo.get(String(assignment._id)),
      mySubmission: own || null,
    };
  });

  res.status(200).json({ status: 'success', results: data.length, data: { assignments: data } });
});

exports.getRoomAssignments = catchAsync(async (req, res, next) => {
  const { roomType, roomId } = req.params;
  const room = await getRoom(roomType, roomId);
  if (!isMember(req.user, room)) return next(new AppError('You are not a member of this room.', 403));

  const assignments = await Assignment.find({ roomType, room: room._id }).sort({ dueAt: 1 });
  const data = assignments.map((assignment) => {
    const own = (assignment.submissions || []).find((sub) => sub.student.toString() === req.user._id.toString());
    return {
      ...summary(assignment),
      mySubmission: own || null,
      submissions: isStaff(req.user, room) ? assignment.submissions : undefined,
    };
  });

  res.status(200).json({ status: 'success', results: data.length, data: { assignments: data } });
});

exports.getAssignment = catchAsync(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.id).populate('submissions.student', 'name email rollNo registrationNo');
  if (!assignment) return next(new AppError('Assignment not found.', 404));
  const room = await roomModel(assignment.roomType).findById(assignment.room);
  if (!room) return next(new AppError('Room not found.', 404));
  if (!isMember(req.user, room)) return next(new AppError('You are not a member of this room.', 403));

  const data = { ...summary(assignment), submissions: assignment.submissions };
  if (!isStaff(req.user, room)) {
    data.submissions = undefined;
    data.mySubmission = (assignment.submissions || []).find((sub) => sub.student._id?.toString() === req.user._id.toString() || sub.student.toString() === req.user._id.toString()) || null;
  }
  data.roomName = roomLabel(assignment.roomType, room);
  data.canManage = isStaff(req.user, room);

  res.status(200).json({ status: 'success', data: { assignment: data } });
});

exports.submitAssignment = catchAsync(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return next(new AppError('Assignment not found.', 404));
  const room = await roomModel(assignment.roomType).findById(assignment.room);
  if (!room) return next(new AppError('Room not found.', 404));
  if (!isEnrolledStudent(req.user, room)) return next(new AppError('Only enrolled students can submit assignments.', 403));
  if (new Date(assignment.dueAt).getTime() < Date.now()) return next(new AppError('The deadline has passed. Ask your teacher to extend it.', 403));

  const checked = await validateFilePayload(req.body.file, assignment);
  if (checked.error) return next(new AppError(checked.error, 400));

  const existing = assignment.submissions.find((sub) => sub.student.toString() === req.user._id.toString());
  const oldIds = existing ? publicIdsFromAttachment(existing.file) : [];
  if (existing) {
    existing.file = checked.file;
    existing.submittedAt = new Date();
    existing.updatedAt = new Date();
  } else {
    assignment.submissions.push({ student: req.user._id, file: checked.file });
  }
  await assignment.save();
  await syncMarkFile(assignment, req.user._id, checked.file);
  if (oldIds.length) await safeDestroyPublicIds(oldIds, publicIdsFromAttachment(checked.file));

  res.status(200).json({ status: 'success', message: 'Submission saved successfully.', data: { submission: existing || assignment.submissions[assignment.submissions.length - 1] } });
});

exports.extendDeadline = catchAsync(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return next(new AppError('Assignment not found.', 404));
  const room = await roomModel(assignment.roomType).findById(assignment.room);
  if (!room) return next(new AppError('Room not found.', 404));
  assertStaff(req.user, room, assignment.roomType);

  const dueAt = new Date(req.body.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) return next(new AppError('A future deadline is required.', 400));
  assignment.dueAt = dueAt;
  assignment.reminderSentTo = [];
  await assignment.save();

  await notifyStudents(assignment, room, `Deadline Extended: ${assignment.title}`, `The deadline for <strong>${assignment.title}</strong> has been extended to <strong>${dueAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong>.`);
  res.status(200).json({ status: 'success', message: 'Deadline extended and students notified.', data: { assignment: summary(assignment) } });
});

exports.gradeSubmission = catchAsync(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return next(new AppError('Assignment not found.', 404));
  const room = await roomModel(assignment.roomType).findById(assignment.room);
  if (!room) return next(new AppError('Room not found.', 404));
  assertStaff(req.user, room, assignment.roomType);

  const submission = assignment.submissions.find((sub) => sub.student.toString() === req.params.studentId);
  if (!submission) return next(new AppError('No submission found for this student.', 404));
  const marks = Number(req.body.marks);
  if (!Number.isFinite(marks) || marks < 0 || marks > assignment.totalMarks) {
    return next(new AppError(`Marks must be between 0 and ${assignment.totalMarks}.`, 400));
  }

  submission.marks = marks;
  submission.gradedAt = new Date();
  submission.gradedBy = req.user._id;
  await assignment.save();
  await updateMarkRecord(assignment, submission.student, marks);

  res.status(200).json({ status: 'success', message: 'Marks saved.', data: { submission } });
});

exports.deleteAssignment = catchAsync(async (req, res, next) => {
  const assignment = await Assignment.findById(req.params.id);
  if (!assignment) return next(new AppError('Assignment not found.', 404));
  const room = await roomModel(assignment.roomType).findById(assignment.room);
  if (!room) return next(new AppError('Room not found.', 404));
  assertStaff(req.user, room, assignment.roomType);

  if (assignment.evaluationItemId && Array.isArray(room[assignment.categoryKey])) {
    room[assignment.categoryKey] = room[assignment.categoryKey].filter(
      (item) => item._id.toString() !== assignment.evaluationItemId.toString()
    );
    await room.save();
  }
  await removeAssignmentRecord(assignment);

  res.status(200).json({ status: 'success', message: 'Assignment deleted.' });
});

exports.runReminders = catchAsync(async (req, res, next) => {
  if (req.user && req.user.role !== 'ADMIN') return next(new AppError('Only admins can run reminders manually.', 403));
  const result = await exports.runRemindersInternal();
  res.status(200).json({ status: 'success', ...result });
});

exports.runRemindersInternal = async () => {
  const now = Date.now();
  const due = await Assignment.find({
    dueAt: { $gt: new Date(now), $lte: new Date(now + 24 * 60 * 60 * 1000) },
  });
  let emailed = 0;

  for (const assignment of due) {
    const room = await roomModel(assignment.roomType).findById(assignment.room).populate('students', 'name email personalNotificationEmail');
    if (!room) continue;
    const submittedIds = new Set((assignment.submissions || []).map((sub) => sub.student.toString()));
    const pending = (room.students || []).filter((student) => {
      const id = (student._id || student).toString();
      return !submittedIds.has(id) && !assignment.reminderSentTo.some((sent) => sent.toString() === id);
    });
    if (!pending.length) continue;

    for (const student of pending) {
      const email = student.personalNotificationEmail || student.email;
      if (!email || email.includes('@temp.pucit.edu.pk')) continue;
      try {
        await sendStyledEmail({
          to: email,
          subject: `Due Soon: ${assignment.title}`,
          title: `Due Soon: ${assignment.title}`,
          bodyText: `This is a reminder that <strong>${assignment.title}</strong> is due within 24 hours.<br><br>${assignment.description || ''}`,
          details: [
            { label: 'Task', value: assignment.title },
            { label: 'Deadline', value: new Date(assignment.dueAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) },
            { label: 'Open Task', value: `<a href="${assignmentUrl(assignment._id)}">View & Submit</a>` },
          ],
          importance: 'important',
        });
        assignment.reminderSentTo.push((student._id || student).toString());
        emailed += 1;
      } catch (err) {
        console.warn('Assignment reminder failed:', err?.message || err);
      }
    }
    await assignment.save();
  }

  return { assignmentsChecked: due.length, reminderEmailsSent: emailed };
};
