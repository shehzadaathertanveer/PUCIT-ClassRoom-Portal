const Labroom = require('../models/labSchema');
const User = require('../models/userSchema');
const LabMark = require('../models/labMarkSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService');

// =============================================================================
// HELPER: Normalize Lab Target Keys Safely (Mapped to Expanded Lab Schema)
// =============================================================================
const getNormalizedLabTargetKey = (rawType = '') => {
  const clean = rawType.trim().toLowerCase();
  if (clean.includes('task')) return 'labTasks';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('test')) return 'labTests';
  if (clean.includes('final project') || clean.includes('finalproject')) return 'finalProject';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('present')) return 'presentations';
  if (clean === 'mids' || clean === 'midterm' || clean.includes('lab mid') || clean.includes('labmid')) return 'labMids';
  if (clean === 'finals' || clean === 'final' || clean.includes('lab final') || clean.includes('labfinal')) return 'labFinals';
  if (clean.includes('activ')) return 'labActivities';
  if (clean.includes('behavior') || clean.includes('behaviour')) return 'labBehavior';
  if (clean.includes('worksheet')) return 'labWorksheets';
  if (clean.includes('troubleshoot')) return 'troubleshooting';
  
  const standardKeys = [
    'labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments',
    'presentations', 'finalProject', 'labMids', 'labFinals',
    'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'
  ];
  
  const sanitizedCamel = clean
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  const potentialKey = sanitizedCamel.endsWith('s') ? sanitizedCamel : sanitizedCamel + 's';
  
  if (standardKeys.includes(potentialKey)) return potentialKey;
  
  // Default fallback
  return 'labTasks';
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
    $or: [{ rollNo: { $in: formattedTaRolls } }, { registrationNo: { $in: formattedTaRolls } }]
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
      if (taEmail && !taEmail.includes('@temp.pucit.edu.pk')) {
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
    $or: [{ rollNo: { $in: combinedApproved } }, { registrationNo: { $in: combinedApproved } }]
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
            quizzes: [],
            assignments: [],
            presentations: [],
            vivas: [],
            projects: [],
            finalProject: [],
            labMids: [],
            labFinals: [],
            labActivities: [],
            labBehavior: [],
            labWorksheets: [],
            troubleshooting: []
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      const studentEmail = student.personalNotificationEmail || student.email;
      if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail');

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
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail');

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
  if (teacherEmail && !teacherEmail.includes('@temp.pucit.edu.pk')) {
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
    { 
      $setOnInsert: { 
        labroom: targetLabId, 
        student: studentId, 
        labTasks: [], quizzes: [], assignments: [], presentations: [], 
        vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
      } 
    },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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
    message: `Student ${student.name} enrolled successfully!`,
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
  ).populate('teacher', 'name email personalNotificationEmail');

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const targetStudent = await User.findById(studentId).select('name email personalNotificationEmail rollNo registrationNo');

  if (targetStudent) {
    const studentEmail = targetStudent.personalNotificationEmail || (targetStudent.email && !targetStudent.email.includes('@temp.pucit.edu.pk') ? targetStudent.email : null);

    if (studentEmail) {
      try {
        await sendStyledEmail({
          to: studentEmail,
          subject: `Lab Enrollment Update: Removed from ${labroom.labName}`,
          title: `Lab Dropout / Removal Notice`,
          bodyText: `Hello <strong>${targetStudent.name}</strong>,<br><br>We are writing to inform you that you have been removed / dropped from the lab room <strong>${labroom.labName} (${labroom.sectionPrefix})</strong> by <strong>${req.user.name}</strong> (${req.user.role}).`,
          details: [
            { label: 'Lab Name', value: labroom.labName },
            { label: 'Section Prefix', value: labroom.sectionPrefix },
            { label: 'Instructor', value: labroom.teacher?.name || labroom.placeholderTeacherName },
            { label: 'Action By', value: `${req.user.name} (${req.user.role})` }
          ],
        });
      } catch (mailErr) {
        console.warn('Failed to dispatch student lab dropout notification email:', mailErr.message);
      }
    }
  }

  await LabMark.findOneAndDelete({ labroom: labroomId, student: studentId });

  res.status(200).json({
    status: 'success',
    message: 'Student removed from labroom successfully and notification email dispatched.',
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
// 10. LOOKUP STUDENT DETAILS FOR FRONTEND DOUBLE-CONFIRMATION & ADD-DROP
// =============================================================================
exports.lookupLabStudentForAddDrop = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { rollInput } = req.body;

  if (!rollInput) {
    return next(new AppError('Roll number or registration identifier is required!', 400));
  }

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanInput = rollInput.trim().toUpperCase();
  let targetRollNo = cleanInput;

  if (!cleanInput.startsWith(labroom.sectionPrefix) && !cleanInput.includes('FRESHER_')) {
    const digitsOnly = cleanInput.replace(/\D/g, '');
    if (digitsOnly) {
      targetRollNo = `${labroom.sectionPrefix}${digitsOnly.padStart(3, '0')}`;
    }
  }

  const student = await User.findOne({
    role: 'STUDENT',
    $or: [
      { rollNo: targetRollNo },
      { rollNo: cleanInput },
      { registrationNo: rollInput.trim() }
    ]
  }).select('name rollNo registrationNo email personalNotificationEmail');

  if (!student) {
    return res.status(404).json({
      status: 'fail',
      message: `No student record found matching identifier: ${rollInput}`
    });
  }

  const isPrefixMatch = student.rollNo && student.rollNo.toUpperCase().startsWith(labroom.sectionPrefix.toUpperCase());
  const isAlreadyEnrolled = labroom.students.some(id => id.toString() === student._id.toString());

  res.status(200).json({
    status: 'success',
    data: {
      student: {
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        registrationNo: student.registrationNo || 'N/A',
        email: student.email,
        personalNotificationEmail: student.personalNotificationEmail,
        isPrefixMatch,
        isAddDrop: !isPrefixMatch,
        isAlreadyEnrolled
      }
    }
  });
});

// =============================================================================
// 10 (Extended). ADD STUDENT BY FULL ROLL OR SUFFIX
// =============================================================================
exports.addStudentByRollNo = catchAsync(async (req, res, next) => {
  const { labroomId, rollInput } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || !rollInput) {
    return next(new AppError('Labroom ID and Roll Number/Registration No are required!', 400));
  }

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanInput = rollInput.trim().toUpperCase();
  let targetRollNo = cleanInput;

  if (!cleanInput.startsWith(labroom.sectionPrefix) && !cleanInput.match(/^\d{6,7}$/)) {
    const digitsOnly = cleanInput.replace(/\D/g, '');
    const paddedDigits = digitsOnly.padStart(3, '0');
    targetRollNo = `${labroom.sectionPrefix}${paddedDigits}`;
  }

  const student = await User.findOne({ 
    role: 'STUDENT', 
    $or: [{ rollNo: targetRollNo }, { rollNo: cleanInput }, { registrationNo: rollInput.trim() }] 
  });

  if (!student) {
    return next(new AppError(`No registered student found with identifier: ${rollInput}`, 404));
  }

  if (labroom.students.length >= labroom.maxCapacity) {
    return next(new AppError(`Labroom has reached maximum capacity of ${labroom.maxCapacity}!`, 400));
  }

  if (labroom.students.some((id) => id.toString() === student._id.toString())) {
    return next(new AppError('Student is already enrolled in this labroom!', 400));
  }

  labroom.students.push(student._id);
  await labroom.save();
  await labroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  await LabMark.findOneAndUpdate(
    { labroom: targetLabId, student: student._id },
    { 
      $setOnInsert: { 
        labroom: targetLabId, 
        student: student._id, 
        labTasks: [], quizzes: [], assignments: [], presentations: [], 
        vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
      } 
    },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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
    message: `Student ${student.name} added successfully!`,
    data: { labroom },
  });
});

// =============================================================================
// 11. AUTO-DETECTABLE AVAILABLE STUDENTS
// =============================================================================
exports.getAvailableLabStudentsByPrefix = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const prefix = (labroom.sectionPrefix || '').trim();

  const matchingStudents = await User.find({
    role: 'STUDENT',
    $or: [
      { rollNo: { $regex: new RegExp(`^${prefix}`, 'i') } },
      { registrationNo: { $regex: new RegExp(`^${prefix}`, 'i') } },
      { rollNo: { $regex: /^FRESHER_/i } }
    ]
  }).select('name rollNo registrationNo email personalNotificationEmail');

  const enrolledStudentIds = new Set(labroom.students.map(id => id.toString()));

  const availableStudents = matchingStudents.map(student => ({
    _id: student._id,
    name: student.name,
    rollNo: student.rollNo,
    registrationNo: student.registrationNo || 'N/A',
    email: student.email,
    personalNotificationEmail: student.personalNotificationEmail,
    isAlreadyEnrolled: enrolledStudentIds.has(student._id.toString())
  }));

  res.status(200).json({
    status: 'success',
    results: availableStudents.length,
    data: {
      sectionPrefix: prefix,
      students: availableStudents
    }
  });
});

// =============================================================================
// 12. BULK APPROVE / ADD AUTO-DETECTED LAB STUDENTS
// =============================================================================
exports.bulkApproveAvailableLabStudents = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { studentIds } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new AppError('An array of studentIds is required!', 400));
  }

  const labroom = await Labroom.findById(labroomId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const studentsToAdd = await User.find({
    _id: { $in: studentIds },
    role: 'STUDENT'
  });

  const enrolledSet = new Set(labroom.students.map(id => id.toString()));
  const successfullyAdded = [];

  for (const student of studentsToAdd) {
    const studentIdStr = student._id.toString();
    if (labroom.students.length >= labroom.maxCapacity) break;

    if (!enrolledSet.has(studentIdStr)) {
      labroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      successfullyAdded.push(student);
    }
  }

  await labroom.save();
  await labroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (successfullyAdded.length > 0) {
    const markPromises = successfullyAdded.map((student) => {
      return LabMark.findOneAndUpdate(
        { labroom: labroomId, student: student._id },
        { 
          $setOnInsert: { 
            labroom: labroomId, 
            student: student._id, 
            labTasks: [], quizzes: [], assignments: [], presentations: [], 
            vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
            labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
          } 
        },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);

    await Promise.all(
      successfullyAdded.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
          await sendStyledEmail({
            to: studentEmail,
            subject: `Enrolled in ${labroom.labName}`,
            title: `Lab Enrollment: ${labroom.labName}`,
            bodyText: `You have been officially approved and enrolled in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
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
    message: `Successfully approved and added ${successfullyAdded.length} students to lab!`,
    data: { labroom, addedCount: successfullyAdded.length }
  });
});

// =============================================================================
// 13. QUICK SUFFIX ROLL NUMBERS ENTRY
// =============================================================================
exports.addStudentsBySuffixRolls = catchAsync(async (req, res, next) => {
  const { labroomId, rollSuffixes } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || !Array.isArray(rollSuffixes) || rollSuffixes.length === 0) {
    return next(new AppError('Labroom ID and rollSuffixes array are required!', 400));
  }

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const targetRollNos = rollSuffixes.map(item => {
    const cleanStr = item.toString().trim().toUpperCase();
    if (cleanStr.startsWith(labroom.sectionPrefix)) return cleanStr;
    const digits = cleanStr.replace(/\D/g, '').padStart(3, '0');
    return `${labroom.sectionPrefix}${digits}`;
  });

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
  await labroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return LabMark.findOneAndUpdate(
        { labroom: targetLabId, student: student._id },
        { 
          $setOnInsert: { 
            labroom: targetLabId, 
            student: student._id, 
            labTasks: [], quizzes: [], assignments: [], presentations: [], 
            vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
            labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
          } 
        },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);

    await Promise.all(
      newStudents.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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
    message: `Successfully added ${newStudents.length} students via suffix list!`,
    data: { labroom, addedCount: newStudents.length },
  });
});

// =============================================================================
// 13 (Extended). BULK RANGE ENROLLMENT
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
    return next(new AppError('Invalid range provided. Start must be less than or equal to End.', 400));
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
  await labroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return LabMark.findOneAndUpdate(
        { labroom: targetLabId, student: student._id },
        { 
          $setOnInsert: { 
            labroom: targetLabId, 
            student: student._id, 
            labTasks: [], quizzes: [], assignments: [], presentations: [], 
            vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
            labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
          } 
        },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);

    await Promise.all(
      newStudents.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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

// =============================================================================
// 14. ADD DROP / SENIORS LIST ENROLLMENT
// =============================================================================
exports.addDropLabSeniorsList = catchAsync(async (req, res, next) => {
  const { labroomId, rollNumbers } = req.body;
  const targetLabId = labroomId || req.params.labroomId;

  if (!targetLabId || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
    return next(new AppError('Labroom ID and rollNumbers array are required!', 400));
  }

  const labroom = await Labroom.findById(targetLabId).populate('teacher', 'name email personalNotificationEmail');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanRolls = rollNumbers.map((r) => r.trim().toUpperCase());
  const matchingStudents = await User.find({ 
    role: 'STUDENT', 
    $or: [{ rollNo: { $in: cleanRolls } }, { registrationNo: { $in: cleanRolls } }] 
  });

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
  await labroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return LabMark.findOneAndUpdate(
        { labroom: targetLabId, student: student._id },
        { 
          $setOnInsert: { 
            labroom: targetLabId, 
            student: student._id, 
            labTasks: [], quizzes: [], assignments: [], presentations: [], 
            vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
            labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
          } 
        },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);

    await Promise.all(
      newStudents.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
          await sendStyledEmail({
            to: studentEmail,
            subject: `Enrolled in ${labroom.labName}`,
            title: `Lab Enrollment: ${labroom.labName}`,
            bodyText: `You have been officially added as an add/drop or senior student in lab <strong>${labroom.labName} (${labroom.sectionPrefix})</strong>.`,
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
    message: `Successfully added ${newStudents.length} add/drop senior students to lab!`,
    data: { labroom, addedCount: newStudents.length },
  });
});

// =============================================================================
// 15. GET LAB MARKSHEET
// =============================================================================
exports.getLabroomMarks = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  let filter = { labroom: labroomId };

  if (req.user.role === 'STUDENT') {
    filter.student = req.user._id;
  } else {
    const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
    if (!isStaff) {
      return next(new AppError('Unauthorized to view lab marksheet.', 403));
    }
  }

  const marks = await LabMark.find(filter)
    .populate('student', 'name rollNo registrationNo email personalNotificationEmail');

  res.status(200).json({
    status: 'success',
    results: marks.length,
    data: { marks },
  });
});

// =============================================================================
// 16. WHOLE-CLASS & RANGE LAB BATCH RESULTS UPLOAD
// =============================================================================
exports.updateWholeClassLabMarks = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title, totalMarks, studentScores } = req.body; 

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to upload lab marks.', 403));

  const labroom = await Labroom.findById(labroomId).populate('students', 'name email personalNotificationEmail rollNo');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  if (!Array.isArray(studentScores) || studentScores.length === 0) {
    return next(new AppError('studentScores array is required for lab updates!', 400));
  }

  const cleanCategory = (category || '').trim();
  const targetKey = getNormalizedLabTargetKey(cleanCategory);
  const parsedTotal = Number(totalMarks);
  const cleanTitle = title.trim();

  for (const scoreEntry of studentScores) {
    let markRec = await LabMark.findOne({ labroom: labroomId, student: scoreEntry.studentId });
    if (!markRec) {
      markRec = await LabMark.create({ 
        labroom: labroomId, 
        student: scoreEntry.studentId, 
        labTasks: [], quizzes: [], assignments: [], presentations: [], 
        vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: [] 
      });
    }

    const isAbsent = Boolean(scoreEntry.isAbsent);
    const obtained = isAbsent ? 0 : Number(scoreEntry.obtainedMarks || 0);
    const itemPayload = { title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: obtained, isAbsent };

    if (!markRec[targetKey]) markRec[targetKey] = [];
    const idx = markRec[targetKey].findIndex(item => item.title.trim().toLowerCase() === cleanTitle.toLowerCase());
    if (idx > -1) {
      markRec[targetKey][idx] = { ...markRec[targetKey][idx], ...itemPayload };
    } else {
      markRec[targetKey].push(itemPayload);
    }
    await markRec.save();

    const studentObj = labroom.students.find(s => s._id.toString() === scoreEntry.studentId.toString());
    if (studentObj) {
      const studentEmail = studentObj.personalNotificationEmail || studentObj.email;
      if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
        sendStyledEmail({
          to: studentEmail,
          subject: `Lab Marks Updated: ${labroom.labName} - ${cleanTitle}`,
          title: `Lab Evaluation: ${cleanTitle}`,
          bodyText: `Your marks for <strong>${cleanTitle}</strong> in lab <strong>${labroom.labName}</strong> have been updated.`,
          details: [
            { label: 'Lab Course', value: labroom.labName },
            { label: 'Activity', value: cleanTitle },
            { label: 'Obtained / Total', value: `${isAbsent ? 'Absent (0)' : obtained} / ${parsedTotal}` }
          ]
        }).catch(err => console.warn('Email send warning:', err.message));
      }
    }
  }

  res.status(200).json({
    status: 'success',
    message: `Lab marks successfully uploaded/updated for ${studentScores.length} students with targeted notifications!`,
  });
});

// =============================================================================
// 17. ANONYMOUS LAB COMPLAINT SYSTEM
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
// 18. CREATE & DELETE GRADED LAB ITEM
// =============================================================================
exports.createLabGradedItem = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title, totalMarks, rangeStart, rangeEnd } = req.body;

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to create lab items.', 403));

  const labroom = await Labroom.findById(labroomId).populate('students', 'name rollNo');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanCategory = category ? category.trim() : '';
  const trimmedTitle = title ? title.trim() : '';
  const tMarks = Number(totalMarks) || 10;
  const targetKey = getNormalizedLabTargetKey(cleanCategory);

  // Enforce single-entry constraint for unique lab exams if applicable
  if (['labMids', 'labFinals', 'finalProject'].includes(targetKey)) {
    if (labroom[targetKey] && labroom[targetKey].length > 0) {
      return next(new AppError(`Only one ${targetKey} entry is allowed per labroom.`, 400));
    }
  }

  let targetStudents = labroom.students;
  const hasRange = rangeStart !== undefined && rangeStart !== null && rangeEnd !== undefined && rangeEnd !== null && rangeStart !== '' && rangeEnd !== '';

  if (hasRange && !['labMids', 'labFinals', 'finalProject'].includes(targetKey)) {
    const startIdx = parseInt(rangeStart, 10) - 1;
    const endIdx = parseInt(rangeEnd, 10);
    
    if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 0 || startIdx >= endIdx) {
      return next(new AppError('Invalid student range specified for lab marksheet creation.', 400));
    }

    const sortedStudents = [...labroom.students].sort((a, b) => {
      const rollA = (a.rollNo || '').toLowerCase();
      const rollB = (b.rollNo || '').toLowerCase();
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    targetStudents = sortedStudents.slice(startIdx, endIdx);
    if (targetStudents.length === 0) {
      return next(new AppError('No students found within the specified range.', 400));
    }
  }

  if (!labroom[targetKey]) labroom[targetKey] = [];
  
  if (['labMids', 'labFinals', 'finalProject'].includes(targetKey)) {
    labroom[targetKey] = [{ title: trimmedTitle, totalMarks: tMarks }];
  } else {
    const exists = labroom[targetKey].some(i => i.title.toLowerCase() === trimmedTitle.toLowerCase());
    if (!exists) {
      labroom[targetKey].push({ title: trimmedTitle, totalMarks: tMarks });
    }
  }
  await labroom.save();

  const itemPayload = { title: trimmedTitle, totalMarks: tMarks, obtainedMarks: 0, isAbsent: false };
  const studentIdsToInit = targetStudents.map(st => st._id);

  for (const studId of studentIdsToInit) {
    let markDoc = await LabMark.findOne({ labroom: labroomId, student: studId });
    if (!markDoc) {
      markDoc = await LabMark.create({
        labroom: labroomId,
        student: studId,
        labTasks: [], quizzes: [], assignments: [], presentations: [], 
        vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [], 
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: []
      });
    }

    if (!markDoc[targetKey]) markDoc[targetKey] = [];
    
    if (['labMids', 'labFinals', 'finalProject'].includes(targetKey)) {
      markDoc[targetKey] = [itemPayload];
    } else {
      const itemIdx = markDoc[targetKey].findIndex(i => i.title.trim().toLowerCase() === trimmedTitle.toLowerCase());
      if (itemIdx === -1) {
        markDoc[targetKey].push(itemPayload);
      }
    }
    await markDoc.save();
  }

  res.status(201).json({
    status: 'success',
    message: hasRange ? `Lab marksheet created successfully for students range (${rangeStart} to ${rangeEnd})!` : 'Lab evaluation item created successfully for whole class!',
    data: { labroom, targetedCount: targetStudents.length },
  });
});

exports.deleteLabGradedItem = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title } = req.body;

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to delete lab items.', 403));

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const cleanTitle = (title || '').trim();
  const cleanCategory = (category || '').trim();
  const targetKey = getNormalizedLabTargetKey(cleanCategory);

  if (['labMids', 'labFinals', 'finalProject'].includes(targetKey)) {
    labroom[targetKey] = [];
    await labroom.save();
    await LabMark.updateMany(
      { labroom: labroomId },
      { $set: { [targetKey]: [] } }
    );
  } else {
    if (!labroom[targetKey]) {
      return next(new AppError('Invalid lab category type.', 400));
    }
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
  }

  res.status(200).json({
    status: 'success',
    message: `Lab item successfully deleted!`,
    data: { labroom },
  });
});

// =============================================================================
// 19. POST LAB NOTICE
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
      if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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
// 20. UPDATE LABROOM SETTINGS
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
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  res.status(200).json({
    status: 'success',
    message: 'Labroom settings updated successfully!',
    data: { labroom },
  });
});

// =============================================================================
// 21. LOOKUP HELPERS
// =============================================================================
exports.lookupLabTA = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Roll number or registration number is required!', 400));

  const cleanInput = rollNo.trim();
  const user = await User.findOne({ 
    $or: [{ rollNo: cleanInput.toUpperCase() }, { registrationNo: cleanInput }] 
  });

  if (!user) return res.status(404).json({ status: 'fail', data: { status: 'not_found', message: 'User account not found.' } });

  res.status(200).json({ status: 'success', data: { status: 'found', user } });
});

exports.lookupLabTeacher = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Teacher email, roll number, or ID is required!', 400));

  const cleanInput = rollNo.trim();
  const query = cleanInput.includes('@') 
    ? { email: cleanInput.toLowerCase(), role: { $in: ['TEACHER', 'ADMIN'] } }
    : { $or: [{ rollNo: cleanInput.toUpperCase() }, { registrationNo: cleanInput }], role: { $in: ['TEACHER', 'ADMIN'] } };

  const user = await User.findOne(query);
  if (!user) return res.status(404).json({ status: 'fail', data: { status: 'not_found', message: 'Teacher account not found.' } });

  res.status(200).json({ status: 'success', data: { status: 'found', user } });
});

// =============================================================================
// 22. GET BULK LAB MARK SHEET
// =============================================================================
exports.getBulkLabMarkSheet = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId)
    .populate('students', 'name rollNo email personalNotificationEmail')
    .lean();

  if (!labroom) {
    return next(new AppError('Labroom not found!', 404));
  }

  const existingMarks = await LabMark.find({ labroom: labroomId }).lean();

  res.status(200).json({
    status: 'success',
    data: {
      labroom: {
        _id: labroom._id,
        labName: labroom.labName,
        sectionPrefix: labroom.sectionPrefix,
        labTasks: labroom.labTasks || [],
        quizzes: labroom.quizzes || [],
        assignments: labroom.assignments || [],
        presentations: labroom.presentations || [],
        vivas: labroom.vivas || [],
        projects: labroom.projects || [],
        finalProject: labroom.finalProject || [],
        labMids: labroom.labMids || [],
        labFinals: labroom.labFinals || [],
        labActivities: labroom.labActivities || [],
        labBehavior: labroom.labBehavior || [],
        labWorksheets: labroom.labWorksheets || [],
        troubleshooting: labroom.troubleshooting || [],
        sessionalActivities: labroom.sessionalActivities || []
      },
      students: labroom.students || [],
      existingMarks,
    },
  });
});

// =============================================================================
// 23. GET UNASSIGNED STUDENTS FOR A LAB EVALUATION ITEM
// =============================================================================
exports.getUnassignedLabStudents = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title } = req.query;

  if (!category || !title) {
    return next(new AppError('Category and item title are required!', 400));
  }

  const labroom = await Labroom.findById(labroomId).populate('students', 'name rollNo').lean();
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const markDocs = await LabMark.find({ labroom: labroomId }).lean();
  const targetKey = getNormalizedLabTargetKey(category);
  const cleanTitle = title.trim().toLowerCase();

  const gradedStudentIds = new Set();
  markDocs.forEach(doc => {
    const itemsList = doc[targetKey] || [];
    if (Array.isArray(itemsList)) {
      if (itemsList.some(item => item.title?.trim().toLowerCase() === cleanTitle)) {
        gradedStudentIds.add(doc.student.toString());
      }
    } else if (itemsList && itemsList.title?.trim().toLowerCase() === cleanTitle) {
      gradedStudentIds.add(doc.student.toString());
    }
  });

  const unassignedStudents = (labroom.students || []).filter(s => !gradedStudentIds.has(s._id.toString()));

  res.status(200).json({
    status: 'success',
    data: { unassignedStudents }
  });
});

// =============================================================================
// 24. CSV / EXCEL LAB MARKS BATCH SYNC ENDPOINT
// =============================================================================
exports.syncExcelLabMarks = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title, totalMarks } = req.body;

  const isStaff = await verifyLabStaff(req.user._id, req.user.role, labroomId);
  if (!isStaff) return next(new AppError('Unauthorized to sync lab marks.', 403));

  const labroom = await Labroom.findById(labroomId).populate('students', 'name rollNo registrationNo');
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  if (!req.file || !req.file.buffer) {
    return next(new AppError('Please provide a valid CSV or Excel file to sync.', 400));
  }

  const standardKey = getNormalizedLabTargetKey(category || '');
  const cleanTitle = (title || 'Lab Evaluation').trim();
  const parsedTotal = Number(totalMarks) || 10;

  if (['labMids', 'labFinals', 'finalProject'].includes(standardKey)) {
    labroom[standardKey] = [{ title: cleanTitle, totalMarks: parsedTotal }];
  } else {
    if (!Array.isArray(labroom[standardKey])) labroom[standardKey] = [];
    const exists = labroom[standardKey].find(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
    if (exists) {
      exists.totalMarks = parsedTotal;
    } else {
      labroom[standardKey].push({ title: cleanTitle, totalMarks: parsedTotal });
    }
  }
  await labroom.save();

  const content = req.file.buffer.toString('utf-8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let totalProcessed = 0;
  let updatedCount = 0;
  const errors = [];

  const studentMap = new Map();
  (labroom.students || []).forEach(st => {
    if (st.rollNo) studentMap.set(st.rollNo.toUpperCase(), st._id);
    if (st.registrationNo) studentMap.set(st.registrationNo.toUpperCase(), st._id);
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && /(roll|student|name|marks|score|reg)/i.test(line)) {
      continue;
    }

    const delimiter = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
    const cols = line.split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
    if (cols.length < 2) continue;

    totalProcessed++;

    let rollCandidate = '';
    let marksCandidate = null;

    for (const col of cols) {
      if (!rollCandidate && (/^[A-Za-z]{2,5}[FSfs]\d{2}/.test(col) || /^\d{6,7}$/.test(col) || studentMap.has(col.toUpperCase()))) {
        rollCandidate = col.toUpperCase();
      } else if (marksCandidate === null && (/^\d+(\.\d+)?$/.test(col) || col.toUpperCase() === 'A')) {
        marksCandidate = col;
      }
    }

    if (!rollCandidate) {
      rollCandidate = cols[0].toUpperCase();
      marksCandidate = cols[cols.length - 1];
    }

    let studentId = studentMap.get(rollCandidate);
    if (!studentId) {
      const digits = rollCandidate.replace(/\D/g, '').padStart(3, '0');
      const targetPrefixed = `${labroom.sectionPrefix}${digits}`;
      studentId = studentMap.get(targetPrefixed);
    }

    if (!studentId) {
      errors.push(`Row ${i + 1}: Student "${rollCandidate}" not found in this labroom.`);
      continue;
    }

    const isAbsent = marksCandidate ? marksCandidate.toUpperCase() === 'A' : false;
    const obtained = isAbsent ? 0 : Math.max(0, Math.min(parsedTotal, Number(marksCandidate) || 0));

    let markDoc = await LabMark.findOne({ labroom: labroomId, student: studentId });
    if (!markDoc) {
      markDoc = new LabMark({
        labroom: labroomId,
        student: studentId,
        labTasks: [], quizzes: [], assignments: [], presentations: [],
        vivas: [], projects: [], finalProject: [], labMids: [], labFinals: [],
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: []
      });
    }

    const itemPayload = { title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: obtained, isAbsent, file: {} };

    if (['labMids', 'labFinals', 'finalProject'].includes(standardKey)) {
      markDoc[standardKey] = [itemPayload];
    } else {
      if (!Array.isArray(markDoc[standardKey])) markDoc[standardKey] = [];
      const idx = markDoc[standardKey].findIndex(e => e.title.toLowerCase() === cleanTitle.toLowerCase());
      if (idx > -1) {
        markDoc[standardKey][idx] = { ...markDoc[standardKey][idx], ...itemPayload };
      } else {
        markDoc[standardKey].push(itemPayload);
      }
    }

    await markDoc.save();
    updatedCount++;
  }

  res.status(200).json({
    status: 'success',
    message: `Processed ${totalProcessed} records, successfully updated ${updatedCount}.`,
    data: {
      totalProcessed,
      updatedCount,
      errors
    }
  });
});