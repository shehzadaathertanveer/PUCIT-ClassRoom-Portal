const Labroom = require('../models/labSchema');
const User = require('../models/userSchema');
const LabMark = require('../models/labMarkSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService'); // Centralized email utility with IPv4 Render fix & styling

// =============================================================================
// HELPER: Normalize Lab Target Keys Safely
// =============================================================================
const getNormalizedLabTargetKey = (rawType = '') => {
  const clean = rawType.trim().toLowerCase();
  if (clean.includes('task')) return 'labTasks';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('test')) return 'labTests';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  return clean.endsWith('s') ? clean : clean + 's';
};

// =============================================================================
// HELPER: Contextual Lab Staff Authorization
// =============================================================================
const verifyLabStaff = async (userId, userRole, labroomId) => {
  if (userRole === 'ADMIN') return true;
  
  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return false;

  if (labroom.teacher && labroom.teacher.toString() === userId.toString()) return true;
  if (labroom.tas && labroom.tas.some(id => id.toString() === userId.toString())) return true;
  if (userRole === 'TEACHER') return true;

  return false;
};

// =============================================================================
// 1. CREATE LABROOM
// =============================================================================
exports.createLabroom = catchAsync(async (req, res, next) => {
  const { 
    labName, 
    creditHours, 
    sectionPrefix, 
    sessionalActivities, 
    teacherId, 
    placeholderTeacherName, 
    taRollNumbers, 
    maxCapacity 
  } = req.body;

  if (!labName || !sectionPrefix) {
    return next(new AppError('Lab name and Section Prefix (e.g., BITF26A) are required!', 400));
  }

  const cleanPrefix = sectionPrefix.trim().toUpperCase();
  const credits = creditHours ? Number(creditHours) : 1;

  let finalSessionalActivities = [
    { category: 'Lab Tasks', allocatedMarks: 50 },
    { category: 'Vivas', allocatedMarks: 30 },
    { category: 'Lab Tests', allocatedMarks: 20 }
  ];

  if (Array.isArray(sessionalActivities) && sessionalActivities.length > 0) {
    finalSessionalActivities = sessionalActivities.map(act => ({
      category: act.category.trim(),
      allocatedMarks: Number(act.allocatedMarks) || 0
    }));
  }

  const formattedTaRolls = Array.isArray(taRollNumbers)
    ? Array.from(new Set(taRollNumbers.map((r) => r.trim().toUpperCase())))
    : [];

  const existingTas = await User.find({
    role: { $in: ['TA', 'STUDENT'] },
    rollNo: { $in: formattedTaRolls },
  });
  const existingTaIds = existingTas.map((ta) => ta._id);

  let teacherUser = null;
  let assignedTeacherId = null;
  let finalPlaceholder = placeholderTeacherName || 'Faculty / TBD';

  if (teacherId) {
    teacherUser = await User.findById(teacherId);
    if (!teacherUser || !['TEACHER', 'ADMIN'].includes(teacherUser.role)) {
      return next(new AppError('Invalid Lab Instructor ID provided!', 400));
    }
    assignedTeacherId = teacherId;
  } else if (req.user.role === 'TEACHER') {
    assignedTeacherId = req.user._id;
    teacherUser = req.user;
  }

  const labroomData = {
    labName: labName.trim(),
    creditHours: credits,
    sectionPrefix: cleanPrefix,
    sessionalActivities: finalSessionalActivities,
    taRollNumbers: formattedTaRolls,
    tas: existingTaIds,
    maxCapacity: maxCapacity ? Number(maxCapacity) : 40,
    teacher: assignedTeacherId,
    placeholderTeacherName: finalPlaceholder,
  };

  const newLabroom = await Labroom.create(labroomData);
  if (assignedTeacherId) {
    await newLabroom.populate('teacher', 'name email');
  }

  await Promise.all(
    existingTas.map(async (ta) => {
      const taEmail = ta.personalNotificationEmail || ta.email;
      if (taEmail) {
        await sendStyledEmail({
          to: taEmail,
          subject: `Assigned as Lab TA for ${newLabroom.labName}`,
          title: `Lab TA Assignment: ${newLabroom.labName}`,
          bodyText: `You have been officially assigned as a Teaching Assistant for Lab <strong>${newLabroom.labName} (${cleanPrefix})</strong>.`,
          details: [
            { label: 'Credit Hours', value: credits },
            { label: 'Instructor', value: newLabroom.teacher?.name || finalPlaceholder },
            { label: 'Assigned By', value: `${req.user.name} (${req.user.role})` }
          ]
        });
      }
    })
  );

  res.status(201).json({
    status: 'success',
    message: `Labroom created successfully! ${existingTaIds.length} TA(s) linked.`,
    data: { labroom: newLabroom },
  });
});

// =============================================================================
// 2. SET/UPDATE LAB ROSTER & CAPACITY
// =============================================================================
exports.setLabroomRoster = catchAsync(async (req, res, next) => {
  const { labroomId, maxCapacity, regularDigits, addDropRollNos } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email');
  if (!labroom) {
    return next(new AppError('Labroom not found!', 404));
  }

  if (maxCapacity !== undefined) {
    const parsedCapacity = Number(maxCapacity);
    if (parsedCapacity < labroom.students.length) {
      return next(
        new AppError(
          `Cannot reduce max capacity to ${parsedCapacity} because ${labroom.students.length} students are already enrolled!`,
          400
        )
      );
    }
    labroom.maxCapacity = parsedCapacity;
  }

  let formattedRegular = [];
  if (Array.isArray(regularDigits) && regularDigits.length > 0) {
    formattedRegular = regularDigits.map((item) => {
      const str = item.toString().trim().toUpperCase();
      if (str.startsWith(labroom.sectionPrefix)) {
        return str;
      }
      const cleanNum = str.replace(/\D/g, '').padStart(3, '0');
      return `${labroom.sectionPrefix}${cleanNum}`;
    });
  }

  let formattedAddDrop = [];
  if (Array.isArray(addDropRollNos) && addDropRollNos.length > 0) {
    formattedAddDrop = addDropRollNos.map((roll) => roll.trim().toUpperCase());
  }

  const combinedApproved = Array.from(new Set([...formattedRegular, ...formattedAddDrop]));

  labroom.regularRollNumbers = formattedRegular;
  labroom.addDropRollNumbers = formattedAddDrop;
  labroom.approvedRollNumbers = combinedApproved;

  const matchingStudents = await User.find({
    role: 'STUDENT',
    rollNo: { $in: combinedApproved },
  });

  const enrolledStudentSet = new Set(labroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    const studentIdStr = student._id.toString();
    if (labroom.students.length >= labroom.maxCapacity) break;

    if (!enrolledStudentSet.has(studentIdStr)) {
      labroom.students.push(student._id);
      enrolledStudentSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await labroom.save();

  if (newStudents.length > 0) {
    const enrollPromises = newStudents.map(async (student) => {
      await LabMark.findOneAndUpdate(
        { labroom: labroom._id, student: student._id },
        {
          $setOnInsert: {
            labroom: labroom._id,
            student: student._id,
            labTasks: [],
            vivas: [],
            labTests: [],
            projects: [],
            quizzes: [],
            assignments: [],
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      const studentEmail = student.personalNotificationEmail || student.email;
      if (studentEmail) {
        await sendStyledEmail({
          to: studentEmail,
          subject: `Enrolled in ${labroom.labName}`,
          title: `Lab Enrollment: ${labroom.labName}`,
          bodyText: `You have been officially enrolled in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
          details: [
            { label: 'Credit Hours', value: labroom.creditHours },
            { label: 'Instructor', value: labroom.teacher?.name || labroom.placeholderTeacherName },
            { label: 'Enrolled By', value: `${req.user.name} (${req.user.role})` }
          ]
        });
      }
    });
    await Promise.all(enrollPromises);
  }

  res.status(200).json({
    status: 'success',
    message: `Lab roster updated! Approved total: ${combinedApproved.length} students (Capacity: ${labroom.maxCapacity}).`,
    data: { labroom },
  });
});

// =============================================================================
// 3. GET ALL ACTIVE LABROOMS
// =============================================================================
exports.getAllLabrooms = catchAsync(async (req, res, next) => {
  let filter = {};

  if (req.user.role === 'STUDENT') {
    filter = { $or: [{ students: req.user._id }, { tas: req.user._id }] };
  } else if (req.user.role === 'TA') {
    filter = { $or: [{ tas: req.user._id }, { students: req.user._id }] };
  } else if (req.user.role === 'TEACHER') {
    filter = { $or: [{ teacher: req.user._id }, { tas: req.user._id }] };
  }

  const labrooms = await Labroom.find(filter)
    .populate('teacher', 'name email personalNotificationEmail')
    .populate('tas', 'name rollNo email personalNotificationEmail')
    .populate('students', 'name rollNo email personalNotificationEmail');

  res.status(200).json({
    status: 'success',
    results: labrooms.length,
    data: { labrooms },
  });
});

// =============================================================================
// 4. GET SINGLE LABROOM DETAILS
// =============================================================================
exports.getLabroomById = catchAsync(async (req, res, next) => {
  const labroom = await Labroom.findOne({ _id: req.params.labroomId })
    .populate('teacher', 'name email personalNotificationEmail')
    .populate('tas', 'name rollNo email personalNotificationEmail')
    .populate('students', 'name rollNo email personalNotificationEmail');

  if (!labroom) {
    return next(new AppError('Labroom not found!', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { labroom },
  });
});

// =============================================================================
// 5. ASSIGN TEACHER TO LABROOM
// =============================================================================
exports.assignTeacherToLabroom = catchAsync(async (req, res, next) => {
  const { labroomId, teacherId, instructorId, userId } = req.body;
  const targetLabId = labroomId || req.params.labroomId;
  const targetTeacherId = teacherId || instructorId || userId;

  if (!targetLabId || !targetTeacherId) {
    return next(new AppError('Labroom ID and Teacher ID are required!', 400));
  }

  const teacher = await User.findOne({ _id: targetTeacherId, role: { $in: ['TEACHER', 'ADMIN'] } });
  if (!teacher) {
    return next(new AppError('Selected user is not an approved Teacher or Admin!', 400));
  }

  const labroom = await Labroom.findByIdAndUpdate(
    targetLabId,
    { teacher: targetTeacherId, $unset: { placeholderTeacherName: "" } },
    { returnDocument: 'after' }
  ).populate('teacher', 'name email personalNotificationEmail');

  if (!labroom) {
    return next(new AppError('Labroom not found!', 404));
  }

  const teacherEmail = teacher.personalNotificationEmail || teacher.email;
  if (teacherEmail) {
    await sendStyledEmail({
      to: teacherEmail,
      subject: `Assigned as Instructor for ${labroom.labName}`,
      title: `Lab Instructor Assignment: ${labroom.labName}`,
      bodyText: `You have been assigned as the primary instructor for lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
      details: [
        { label: 'Credit Hours', value: labroom.creditHours },
        { label: 'Assigned By', value: `${req.user.name} (${req.user.role})` }
      ]
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Instructor ${teacher.name} assigned successfully!`,
    data: { labroom },
  });
});

// =============================================================================
// 6. MANUALLY ADD SINGLE STUDENT TO LAB
// =============================================================================
exports.addStudentToLabroom = catchAsync(async (req, res, next) => {
  const { labroomId, studentId } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || !studentId) {
    return next(new AppError('Labroom ID and Student ID are required!', 400));
  }

  const [student, labroom] = await Promise.all([
    User.findOne({ _id: studentId, role: 'STUDENT' }),
    Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail'),
  ]);

  if (!student) return next(new AppError('Target user is not a valid student!', 400));
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  if (labroom.students.length >= labroom.maxCapacity) {
    return next(new AppError(`Labroom has reached maximum capacity of ${labroom.maxCapacity}!`, 400));
  }

  if (labroom.students.some((id) => id.toString() === studentId.toString())) {
    return next(new AppError('Student is already enrolled in this labroom!', 400));
  }

  labroom.students.push(studentId);
  await labroom.save();

  const studentMark = await LabMark.findOneAndUpdate(
    { labroom: targetLabId, student: studentId },
    { $setOnInsert: { labroom: targetLabId, student: studentId, labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [] } },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail) {
    await sendStyledEmail({
      to: studentEmail,
      subject: `Enrolled in ${labroom.labName}`,
      title: `Lab Enrollment: ${labroom.labName}`,
      bodyText: `You have been enrolled in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
      details: [
        { label: 'Credit Hours', value: labroom.creditHours },
        { label: 'Instructor', value: labroom.teacher?.name || labroom.placeholderTeacherName }
      ]
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Student ${student.name} (${student.rollNo}) enrolled successfully!`,
    data: { labroom, studentMark },
  });
});

// =============================================================================
// 7. REMOVE STUDENT FROM LABROOM
// =============================================================================
exports.removeStudentFromLabroom = catchAsync(async (req, res, next) => {
  const { labroomId, studentId } = req.params;

  const labroom = await Labroom.findByIdAndUpdate(
    labroomId,
    { $pull: { students: studentId } },
    { returnDocument: 'after' }
  );

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  await LabMark.findOneAndDelete({ labroom: labroomId, student: studentId });

  res.status(200).json({
    status: 'success',
    message: 'Student removed from labroom successfully.',
    data: { labroom },
  });
});

// =============================================================================
// 8. UPDATE LAB TAS
// =============================================================================
exports.updateLabroomTAs = catchAsync(async (req, res, next) => {
  const { labroomId, taIds, taId, userId } = req.body;
  const targetLabId = labroomId || req.params.labroomId;
  
  let resolvedTaIds = taIds;
  if (!resolvedTaIds && (taId || userId)) {
    resolvedTaIds = [taId || userId];
  }

  if (!targetLabId || !Array.isArray(resolvedTaIds)) {
    return next(new AppError('Labroom ID and taIds array are required!', 400));
  }

  const cleanTaIds = Array.from(new Set(resolvedTaIds.map((id) => id.toString())));

  const labroom = await Labroom.findById(targetLabId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const mergedTaIds = Array.from(new Set([...(labroom.tas || []).map(id => id.toString()), ...cleanTaIds]));
  labroom.tas = mergedTaIds;
  await labroom.save();

  await labroom.populate('tas', 'name rollNo email personalNotificationEmail');

  res.status(200).json({
    status: 'success',
    message: 'Lab TAs updated successfully!',
    data: { labroom },
  });
});

// =============================================================================
// 9. HARD DELETE LABROOM
// =============================================================================
exports.hardDeleteLabroom = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const filter = { _id: labroomId };

  if (req.user.role === 'TEACHER') {
    filter.$or = [{ teacher: req.user._id }];
  } else if (req.user.role !== 'ADMIN') {
    return next(new AppError('You do not have permission to delete this labroom.', 403));
  }

  const labroom = await Labroom.findOne(filter);
  if (!labroom) return next(new AppError('Labroom not found or unauthorized!', 404));

  await Labroom.findByIdAndDelete(labroomId);
  await LabMark.deleteMany({ labroom: labroomId });

  res.status(200).json({
    status: 'success',
    message: 'Labroom and all associated mark records permanently purged.',
  });
});

// =============================================================================
// 10. ADD STUDENT BY ROLL NUMBER
// =============================================================================
exports.addStudentByRollNo = catchAsync(async (req, res, next) => {
  const { labroomId, rollInput } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || !rollInput) {
    return next(new AppError('Labroom ID and Roll Number/Suffix are required!', 400));
  }

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanInput = rollInput.trim().toUpperCase();
  let targetRollNo = cleanInput;

  if (!cleanInput.startsWith(labroom.sectionPrefix)) {
    const digitsOnly = cleanInput.replace(/\D/g, '');
    const paddedDigits = digitsOnly.padStart(3, '0');
    targetRollNo = `${labroom.sectionPrefix}${paddedDigits}`;
  }

  const student = await User.findOne({ role: 'STUDENT', rollNo: targetRollNo });
  if (!student) {
    return next(new AppError(`No registered student found with Roll Number: ${targetRollNo}`, 404));
  }

  if (labroom.students.length >= labroom.maxCapacity) {
    return next(new AppError(`Labroom has reached maximum capacity of ${labroom.maxCapacity}!`, 400));
  }

  if (labroom.students.some((id) => id.toString() === student._id.toString())) {
    return next(new AppError('Student is already enrolled in this labroom!', 400));
  }

  labroom.students.push(student._id);
  await labroom.save();
  await labroom.populate('students', 'name rollNo email personalNotificationEmail');

  await LabMark.findOneAndUpdate(
    { labroom: targetLabId, student: student._id },
    { $setOnInsert: { labroom: targetLabId, student: student._id, labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [] } },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail) {
    await sendStyledEmail({
      to: studentEmail,
      subject: `Enrolled in ${labroom.labName}`,
      title: `Lab Enrollment: ${labroom.labName}`,
      bodyText: `You have been enrolled in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
      details: [
        { label: 'Credit Hours', value: labroom.creditHours },
        { label: 'Instructor', value: labroom.teacher?.name || labroom.placeholderTeacherName }
      ]
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Student ${student.name} (${targetRollNo}) added successfully!`,
    data: { labroom },
  });
});

// =============================================================================
// 11. ANONYMOUS LAB COMPLAINT SYSTEM
// =============================================================================
exports.submitLabComplaint = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return next(new AppError('Feedback message cannot be empty!', 400));
  }

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  labroom.complaints.push({ message: message.trim() });
  await labroom.save();

  res.status(201).json({
    status: 'success',
    message: 'Anonymous lab feedback submitted successfully.',
  });
});

exports.getLabComplaints = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const labroom = await Labroom.findById(labroomId);
  
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to view lab feedback.', 403));

  res.status(200).json({
    status: 'success',
    data: { complaints: labroom.complaints || [] },
  });
});

// =============================================================================
// 12. CREATE & DELETE GRADED LAB ITEM
// =============================================================================
exports.createLabGradedItem = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title, totalMarks } = req.body;

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to create lab items.', 403));

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanCategory = category.trim();
  const trimmedTitle = title.trim();
  const tMarks = Number(totalMarks) || 10;
  const targetKey = getNormalizedLabTargetKey(cleanCategory);

  const standardKeys = ['labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments'];

  if (standardKeys.includes(targetKey)) {
    const exists = labroom[targetKey].some(i => i.title.toLowerCase() === trimmedTitle.toLowerCase());
    if (exists) return next(new AppError('A lab evaluation item with this title already exists in this category.', 400));
    labroom[targetKey].push({ title: trimmedTitle, totalMarks: tMarks });
  } else {
    let customCat = labroom.customActivities.find(c => c.categoryName.toLowerCase() === cleanCategory.toLowerCase());
    if (!customCat) {
      labroom.customActivities.push({
        categoryName: cleanCategory,
        items: [{ title: trimmedTitle, totalMarks: tMarks }]
      });
    } else {
      const exists = customCat.items.some(i => i.title.toLowerCase() === trimmedTitle.toLowerCase());
      if (exists) return next(new AppError('An item with this title already exists in this custom category.', 400));
      customCat.items.push({ title: trimmedTitle, totalMarks: tMarks });
    }
  }

  await labroom.save();

  res.status(201).json({
    status: 'success',
    message: 'Lab evaluation item created successfully!',
    data: { labroom },
  });
});

exports.deleteLabGradedItem = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title } = req.body;

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to delete lab items.', 403));

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanTitle = title.trim();
  const targetKey = getNormalizedLabTargetKey(category);
  const standardKeys = ['labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments'];

  if (standardKeys.includes(targetKey)) {
    const beforeCount = labroom[targetKey].length;
    labroom[targetKey] = labroom[targetKey].filter(i => i.title.toLowerCase() !== cleanTitle.toLowerCase());
    if (labroom[targetKey].length === beforeCount) {
      return next(new AppError(`Lab item "${cleanTitle}" not found.`, 404));
    }
    await labroom.save();

    await LabMark.updateMany(
      { labroom: labroomId },
      { $pull: { [targetKey]: { title: { $regex: new RegExp(`^${cleanTitle}$`, 'i') } } } }
    );
  } else {
    let found = false;
    labroom.customActivities.forEach(cat => {
      const initLen = cat.items.length;
      cat.items = cat.items.filter(i => i.title.toLowerCase() !== cleanTitle.toLowerCase());
      if (cat.items.length < initLen) found = true;
    });
    if (!found) return next(new AppError(`Custom lab item "${cleanTitle}" not found.`, 404));
    await labroom.save();
  }

  res.status(200).json({
    status: 'success',
    message: `Lab item "${cleanTitle}" successfully deleted!`,
    data: { labroom },
  });
});

// =============================================================================
// 13. POST LAB NOTICE
// =============================================================================
exports.postLabNotice = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { title, content, attachment } = req.body;

  if (!title || !content) {
    return next(new AppError('Notice title and content are required!', 400));
  }

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to post lab notices.', 403));

  const labroom = await Labroom.findById(labroomId).populate('students', 'email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const newNotice = {
    title: title.trim(),
    content: content.trim(),
    author: req.user._id,
    authorName: req.user.name,
    attachment: (attachment && attachment.url) ? {
      url: attachment.url,
      public_id: attachment.public_id || '',
      fileType: attachment.fileType || '',
      fileName: attachment.fileName || ''
    } : { url: '', public_id: '', fileType: '', fileName: '' },
    createdAt: new Date(),
  };

  labroom.notices.push(newNotice);
  await labroom.save();

  if (labroom.students && labroom.students.length > 0) {
    const noticePromises = labroom.students.map(async (student) => {
      const studentEmail = student.personalNotificationEmail || student.email;
      if (studentEmail) {
        await sendStyledEmail({
          to: studentEmail,
          subject: `Lab Notice: ${labroom.labName} - ${newNotice.title}`,
          title: `Lab Announcement: ${newNotice.title}`,
          bodyText: `<strong>${req.user.name}</strong> posted a new notice in lab <strong>${labroom.labName}</strong>.<br><br><em>"${newNotice.content}"</em>`,
          details: [
            { label: 'Lab Course', value: labroom.labName },
            { label: 'Notice Title', value: newNotice.title },
            { label: 'Posted By', value: `${req.user.name} (${req.user.role})` }
          ]
        });
      }
    });
    await Promise.all(noticePromises).catch(err => console.warn('Failed to dispatch lab notice emails:', err));
  }

  res.status(201).json({
    status: 'success',
    message: 'Lab notice published successfully!',
    data: { notice: newNotice },
  });
});

// =============================================================================
// 14. UPDATE LABROOM SETTINGS & SESSIONAL ACTIVITIES
// =============================================================================
exports.updateLabroomSettings = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { labName, sectionPrefix, maxCapacity, placeholderTeacherName, sessionalActivities } = req.body;

  const updateData = {};
  if (labName) updateData.labName = labName.trim();
  if (sectionPrefix) updateData.sectionPrefix = sectionPrefix.trim().toUpperCase();
  if (maxCapacity) updateData.maxCapacity = Number(maxCapacity);
  if (placeholderTeacherName !== undefined) updateData.placeholderTeacherName = placeholderTeacherName.trim();
  if (Array.isArray(sessionalActivities)) {
    updateData.sessionalActivities = sessionalActivities.map(a => ({
      category: a.category.trim(),
      allocatedMarks: Number(a.allocatedMarks) || 0
    }));
  }

  const labroom = await Labroom.findByIdAndUpdate(
    labroomId,
    updateData,
    { returnDocument: 'after' }
  )
    .populate('teacher', 'name email personalNotificationEmail')
    .populate('tas', 'name rollNo email personalNotificationEmail')
    .populate('students', 'name rollNo email personalNotificationEmail');

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  res.status(200).json({
    status: 'success',
    message: 'Labroom settings updated successfully!',
    data: { labroom },
  });
});

// =============================================================================
// 15. BULK RANGE & ADD/DROP STUDENT ENROLLMENT
// =============================================================================
exports.addBulkLabStudentsByRange = catchAsync(async (req, res, next) => {
  const { labroomId, startRoll, endRoll } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || startRoll === undefined || endRoll === undefined) {
    return next(new AppError('Labroom ID, startRoll, and endRoll are required!', 400));
  }

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const start = parseInt(startRoll, 10);
  const end = parseInt(endRoll, 10);

  if (isNaN(start) || isNaN(end) || start > end) {
    return next(new AppError('Invalid range provided.', 400));
  }

  const targetRollNos = [];
  for (let i = start; i <= end; i++) {
    const paddedNum = i.toString().padStart(3, '0');
    targetRollNos.push(`${labroom.sectionPrefix}${paddedNum}`);
  }

  const matchingStudents = await User.find({ role: 'STUDENT', rollNo: { $in: targetRollNos } });
  const enrolledSet = new Set(labroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    if (labroom.students.length >= labroom.maxCapacity) break;
    const studentIdStr = student._id.toString();
    if (!enrolledSet.has(studentIdStr)) {
      labroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await labroom.save();
  await labroom.populate('students', 'name rollNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return LabMark.findOneAndUpdate(
        { labroom: targetLabId, student: student._id },
        { $setOnInsert: { labroom: targetLabId, student: student._id, labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [] } },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);

    await Promise.all(
      newStudents.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail) {
          await sendStyledEmail({
            to: studentEmail,
            subject: `Enrolled in ${labroom.labName}`,
            title: `Lab Enrollment: ${labroom.labName}`,
            bodyText: `You have been officially enrolled in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
            details: [
              { label: 'Credit Hours', value: labroom.creditHours },
              { label: 'Instructor', value: labroom.teacher?.name || labroom.placeholderTeacherName }
            ]
          });
        }
      })
    );
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully enrolled ${newStudents.length} students in bulk range!`,
    data: { labroom, addedCount: newStudents.length },
  });
});

exports.addDropLabSeniorsList = catchAsync(async (req, res, next) => {
  const { labroomId, rollNumbers } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
    return next(new AppError('Labroom ID and rollNumbers array are required!', 400));
  }

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanRolls = rollNumbers.map((r) => r.trim().toUpperCase());
  const matchingStudents = await User.find({ role: 'STUDENT', rollNo: { $in: cleanRolls } });

  const enrolledSet = new Set(labroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    if (labroom.students.length >= labroom.maxCapacity) break;
    const studentIdStr = student._id.toString();
    if (!enrolledSet.has(studentIdStr)) {
      labroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await labroom.save();
  await labroom.populate('students', 'name rollNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return LabMark.findOneAndUpdate(
        { labroom: targetLabId, student: student._id },
        { $setOnInsert: { labroom: targetLabId, student: student._id, labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [] } },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);

    await Promise.all(
      newStudents.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail) {
          await sendStyledEmail({
            to: studentEmail,
            subject: `Enrolled in ${labroom.labName}`,
            title: `Lab Enrollment: ${labroom.labName}`,
            bodyText: `You have been officially enrolled in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
            details: [
              { label: 'Credit Hours', value: labroom.creditHours },
              { label: 'Instructor', value: labroom.teacher?.name || labroom.placeholderTeacherName }
            ]
          });
        }
      })
    );
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully added ${newStudents.length} add/drop senior students!`,
    data: { labroom, addedCount: newStudents.length },
  });
});

// =============================================================================
// 16. LOOKUP & ASSIGN HELPERS (TA & Teacher)
// =============================================================================
exports.lookupLabTA = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Roll number is required!', 400));

  const user = await User.findOne({ rollNo: rollNo.trim().toUpperCase() });
  if (!user) return res.status(404).json({ status: 'fail', data: { status: 'not_found', message: 'User account not found.' } });

  res.status(200).json({ status: 'success', data: { status: 'found', user } });
});

exports.lookupLabTeacher = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Teacher email or ID is required!', 400));

  const cleanInput = rollNo.trim();
  const query = cleanInput.includes('@') 
    ? { email: cleanInput.toLowerCase(), role: { $in: ['TEACHER', 'ADMIN'] } }
    : { rollNo: cleanInput.toUpperCase(), role: { $in: ['TEACHER', 'ADMIN'] } };

  const user = await User.findOne(query);
  if (!user) return res.status(404).json({ status: 'fail', data: { status: 'not_found', message: 'Teacher account not found.' } });

  res.status(200).json({ status: 'success', data: { status: 'found', user } });
});