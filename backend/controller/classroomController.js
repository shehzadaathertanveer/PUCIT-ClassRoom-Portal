const Classroom = require('../models/classRoomSchema');
const User = require('../models/userSchema');
const Mark = require('../models/markSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService');

// Helper: Normalize Schema Target Keys Safely (Mapped to Fixed University Categories)
const getNormalizedTargetKey = (rawType = '') => {
  const clean = rawType.trim().toLowerCase();
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('present')) return 'presentations';
  if (clean.includes('final project') || clean.includes('finalproject')) return 'finalProject';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('homework')) return 'homework';
  if (clean.includes('class activ')) return 'classActivities';
  if (clean.includes('particip')) return 'classParticipation';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('special')) return 'specialMarks';
  if (clean === 'mids' || clean === 'midterm' || clean.includes('mid')) return 'mids';
  if (clean === 'finals' || clean === 'final' || clean.includes('final')) return 'finals';
  
  return 'quizzes';
};

// Helper: Contextual Staff Authorization
const verifyClassroomStaff = async (userId, userRole, classroomId) => {
  if (userRole === 'ADMIN') return true;
  
  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return false;

  if (classroom.teacher && classroom.teacher.toString() === userId.toString()) return true;
  if (classroom.createdBy && classroom.createdBy.toString() === userId.toString()) return true;
  if (classroom.tas && classroom.tas.some(id => id.toString() === userId.toString())) return true;
  if (userRole === 'TEACHER') return true;

  return false;
};

// =============================================================================
// 1. CREATE CLASSROOM
// =============================================================================
exports.createClassroom = catchAsync(async (req, res, next) => {
  const { 
    className, 
    creditHours, 
    sectionPrefix, 
    gradingScheme, 
    sessionalActivities, 
    teacherId, 
    placeholderTeacherName, 
    taRollNumbers, 
    maxCapacity 
  } = req.body;

  if (!className || !sectionPrefix) {
    return next(new AppError('Classroom name and Section Prefix (e.g., BITF26A) are required!', 400));
  }

  const cleanPrefix = sectionPrefix.trim().toUpperCase();
  const credits = creditHours ? Number(creditHours) : 3;

  let finalGradingScheme = { sessionalWeight: 25, midsWeight: 35, finalsWeight: 40 };
  if (gradingScheme) {
    const { sessionalWeight = 25, midsWeight = 35, finalsWeight = 40 } = gradingScheme;
    const totalWeight = Number(sessionalWeight) + Number(midsWeight) + Number(finalsWeight);
    if (totalWeight !== 100) {
      return next(new AppError('Main grading weights (Sessional + Mids + Finals) must equal exactly 100%.', 400));
    }
    finalGradingScheme = { sessionalWeight, midsWeight, finalsWeight };
  }

  let finalSessionalActivities = [];
  if (Array.isArray(sessionalActivities)) {
    finalSessionalActivities = sessionalActivities.map(act => ({
      category: act.category.trim(),
      allocatedMarks: Number(act.allocatedMarks)
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

  let assignedTeacherId = null;
  let finalPlaceholder = placeholderTeacherName || 'Faculty / TBD';

  if (teacherId) {
    const teacherUser = await User.findById(teacherId);
    if (!teacherUser || !['TEACHER', 'ADMIN'].includes(teacherUser.role)) {
      return next(new AppError('Invalid Teacher ID provided!', 400));
    }
    assignedTeacherId = teacherId;
  } else if (req.user.role === 'TEACHER') {
    assignedTeacherId = req.user._id;
  }

  const classroomData = {
    className: className.trim(),
    creditHours: credits,
    sectionPrefix: cleanPrefix,
    gradingScheme: finalGradingScheme,
    sessionalActivities: finalSessionalActivities,
    taRollNumbers: formattedTaRolls,
    tas: existingTaIds,
    maxCapacity: maxCapacity ? Number(maxCapacity) : 60,
    createdBy: req.user._id,
    teacher: assignedTeacherId,
    placeholderTeacherName: finalPlaceholder,
  };

  const newClassroom = await Classroom.create(classroomData);
  await newClassroom.populate('createdBy', 'name email role');
  if (assignedTeacherId) {
    await newClassroom.populate('teacher', 'name email');
  }

  await Promise.all(
    existingTas.map(async (ta) => {
      const taEmail = ta.personalNotificationEmail || ta.email;
      if (taEmail) {
        await sendStyledEmail({
          to: taEmail,
          subject: `Assigned as TA for ${newClassroom.className}`,
          title: `TA Assignment: ${newClassroom.className}`,
          bodyText: `You have been officially assigned as a Teaching Assistant for classroom <strong>${newClassroom.className} (${cleanPrefix})</strong>.`,
          details: [
            { label: 'Credit Hours', value: credits },
            { label: 'Instructor', value: newClassroom.teacher?.name || finalPlaceholder },
            { label: 'Assigned By', value: `${req.user.name} (${req.user.role})` }
          ]
        });
      }
    })
  );

  res.status(201).json({
    status: 'success',
    message: `Classroom created successfully! ${existingTaIds.length} TA(s) linked.`,
    data: { classroom: newClassroom },
  });
});

// =============================================================================
// 2. SET/UPDATE ROSTER & CAPACITY
// =============================================================================
exports.setClassroomRoster = catchAsync(async (req, res, next) => {
  const { classroomId, maxCapacity, regularDigits, addDropRollNos } = req.body;
  const targetClassId = classroomId || req.params.classroomId;

  const classroom = await Classroom.findOne({ _id: targetClassId, isActive: true }).populate('teacher', 'name email');
  if (!classroom) {
    return next(new AppError('Active classroom not found!', 404));
  }

  if (maxCapacity !== undefined) {
    const parsedCapacity = Number(maxCapacity);
    if (parsedCapacity < classroom.students.length) {
      return next(
        new AppError(
          `Cannot reduce max capacity to ${parsedCapacity} because ${classroom.students.length} students are already enrolled!`,
          400
        )
      );
    }
    classroom.maxCapacity = parsedCapacity;
  }

  let formattedRegular = [];
  if (Array.isArray(regularDigits) && regularDigits.length > 0) {
    formattedRegular = regularDigits.map((item) => {
      const str = item.toString().trim().toUpperCase();
      if (str.startsWith(classroom.sectionPrefix)) {
        return str;
      }
      const cleanNum = str.replace(/\D/g, '').padStart(3, '0');
      return `${classroom.sectionPrefix}${cleanNum}`;
    });
  }

  let formattedAddDrop = [];
  if (Array.isArray(addDropRollNos) && addDropRollNos.length > 0) {
    formattedAddDrop = addDropRollNos.map((roll) => roll.trim().toUpperCase());
  }

  const combinedApproved = Array.from(new Set([...formattedRegular, ...formattedAddDrop]));

  classroom.regularRollNumbers = formattedRegular;
  classroom.addDropRollNumbers = formattedAddDrop;
  classroom.approvedRollNumbers = combinedApproved;

  const matchingStudents = await User.find({
    role: 'STUDENT',
    rollNo: { $in: combinedApproved },
  });

  const enrolledStudentSet = new Set(classroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    const studentIdStr = student._id.toString();
    if (classroom.students.length >= classroom.maxCapacity) break;

    if (!enrolledStudentSet.has(studentIdStr)) {
      classroom.students.push(student._id);
      enrolledStudentSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await classroom.save();

  if (newStudents.length > 0) {
    const enrollPromises = newStudents.map(async (student) => {
      await Mark.findOneAndUpdate(
        { classroom: classroom._id, student: student._id },
        {
          $setOnInsert: {
            classroom: classroom._id,
            student: student._id,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

      const studentEmail = student.personalNotificationEmail || student.email;
      if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
        await sendStyledEmail({
          to: studentEmail,
          subject: `Enrolled in ${classroom.className}`,
          title: `Course Enrollment: ${classroom.className}`,
          bodyText: `You have been officially enrolled in <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
          details: [
            { label: 'Credit Hours', value: classroom.creditHours },
            { label: 'Instructor', value: classroom.teacher?.name || classroom.placeholderTeacherName },
            { label: 'Enrolled By', value: `${req.user.name} (${req.user.role})` }
          ]
        });
      }
    });
    await Promise.all(enrollPromises);
  }

  res.status(200).json({
    status: 'success',
    message: `Roster updated! Approved total: ${combinedApproved.length} students (Capacity: ${classroom.maxCapacity}).`,
    data: { classroom },
  });
});

// =============================================================================
// 3. GET ALL ACTIVE CLASSROOMS
// =============================================================================
exports.getAllClassrooms = catchAsync(async (req, res, next) => {
  let filter = { isActive: true };

  if (req.user.role === 'STUDENT') {
    filter = {
      isActive: true,
      $or: [{ students: req.user._id }, { tas: req.user._id }]
    };
  } else if (req.user.role === 'TA') {
    filter = {
      isActive: true,
      $or: [{ tas: req.user._id }, { students: req.user._id }],
    };
  } else if (req.user.role === 'TEACHER') {
    filter = {
      isActive: true,
      $or: [{ teacher: req.user._id }, { createdBy: req.user._id }, { tas: req.user._id }],
    };
  } else if (req.user.role === 'ADMIN') {
    filter = { isActive: true };
  }

  const classrooms = await Classroom.find(filter)
    .populate('teacher', 'name email personalNotificationEmail')
    .populate('tas', 'name rollNo email personalNotificationEmail')
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail')
    .populate('createdBy', 'name email role');

  res.status(200).json({
    status: 'success',
    results: classrooms.length,
    data: { classrooms },
  });
});

// =============================================================================
// 4. GET SINGLE CLASSROOM DETAILS
// =============================================================================
exports.getClassroomById = catchAsync(async (req, res, next) => {
  const classroom = await Classroom.findOne({ _id: req.params.classroomId, isActive: true })
    .populate('teacher', 'name email personalNotificationEmail')
    .populate('tas', 'name rollNo email personalNotificationEmail')
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail')
    .populate('createdBy', 'name email role');

  if (!classroom) {
    return next(new AppError('Active classroom not found!', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { classroom },
  });
});

// =============================================================================
// 5. ASSIGN TEACHER TO CLASSROOM
// =============================================================================
exports.assignTeacherToClassroom = catchAsync(async (req, res, next) => {
  const { classroomId, teacherId, instructorId, userId } = req.body;
  const targetClassId = classroomId || req.params.classroomId;
  const targetTeacherId = teacherId || instructorId || userId;

  if (!targetClassId || !targetTeacherId) {
    return next(new AppError('Classroom ID and Teacher ID are required!', 400));
  }

  const teacher = await User.findOne({ _id: targetTeacherId, role: { $in: ['TEACHER', 'ADMIN'] } });
  if (!teacher) {
    return next(new AppError('Selected user is not an approved Teacher or Admin!', 400));
  }

  const classroom = await Classroom.findOneAndUpdate(
    { _id: targetClassId, isActive: true },
    { teacher: targetTeacherId, $unset: { placeholderTeacherName: "" } },
    { returnDocument: 'after' }
  ).populate('createdBy', 'name email role').populate('teacher', 'name email personalNotificationEmail');

  if (!classroom) {
    return next(new AppError('Active classroom not found!', 404));
  }

  const teacherEmail = teacher.personalNotificationEmail || teacher.email;
  if (teacherEmail && !teacherEmail.includes('@temp.pucit.edu.pk')) {
    await sendStyledEmail({
      to: teacherEmail,
      subject: `Assigned as Instructor for ${classroom.className}`,
      title: `Instructor Assignment: ${classroom.className}`,
      bodyText: `You have been assigned as the primary instructor for <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
      details: [
        { label: 'Credit Hours', value: classroom.creditHours },
        { label: 'Assigned By', value: `${req.user.name} (${req.user.role})` }
      ]
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Teacher ${teacher.name} assigned successfully!`,
    data: { classroom },
  });
});

// =============================================================================
// 6. MANUALLY ADD SINGLE STUDENT
// =============================================================================
exports.addStudentToClassroom = catchAsync(async (req, res, next) => {
  const { classroomId, studentId } = req.body;
  const targetClassId = classroomId || req.params.classroomId;

  if (!targetClassId || !studentId) {
    return next(new AppError('Classroom ID and Student ID are required!', 400));
  }

  const [student, classroom] = await Promise.all([
    User.findOne({ _id: studentId, role: 'STUDENT' }),
    Classroom.findOne({ _id: targetClassId, isActive: true }).populate('teacher', 'name email personalNotificationEmail'),
  ]);

  if (!student) return next(new AppError('Target user is not a valid student!', 400));
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  if (classroom.students.length >= classroom.maxCapacity) {
    return next(new AppError(`Classroom has reached maximum capacity of ${classroom.maxCapacity}!`, 400));
  }

  if (classroom.students.some((id) => id.toString() === studentId.toString())) {
    return next(new AppError('Student is already enrolled in this classroom!', 400));
  }

  classroom.students.push(studentId);
  await classroom.save();

  const studentMark = await Mark.findOneAndUpdate(
    { classroom: targetClassId, student: studentId },
    { $setOnInsert: { classroom: targetClassId, student: studentId } },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
    await sendStyledEmail({
      to: studentEmail,
      subject: `Enrolled in ${classroom.className}`,
      title: `Course Enrollment: ${classroom.className}`,
      bodyText: `You have been enrolled in <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
      details: [
        { label: 'Credit Hours', value: classroom.creditHours },
        { label: 'Instructor', value: classroom.teacher?.name || classroom.placeholderTeacherName }
      ]
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Student ${student.name} (${student.rollNo || student.registrationNo}) enrolled successfully!`,
    data: { classroom, studentMark },
  });
});

// =============================================================================
// 7. REMOVE STUDENT FROM CLASSROOM
// =============================================================================
exports.removeStudentFromClassroom = catchAsync(async (req, res, next) => {
  const { classroomId, studentId } = req.params;

  const classroom = await Classroom.findOneAndUpdate(
    { _id: classroomId, isActive: true },
    { $pull: { students: studentId } },
    { returnDocument: 'after' }
  ).populate('teacher', 'name email personalNotificationEmail');

  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const targetStudent = await User.findById(studentId).select('name email personalNotificationEmail rollNo registrationNo');

  if (targetStudent) {
    const studentEmail = targetStudent.personalNotificationEmail || (targetStudent.email && !targetStudent.email.includes('@temp.pucit.edu.pk') ? targetStudent.email : null);

    if (studentEmail) {
      try {
        await sendStyledEmail({
          to: studentEmail,
          subject: `Enrollment Update: Removed from ${classroom.className}`,
          title: `Course Dropout / Removal Notice`,
          bodyText: `Hello <strong>${targetStudent.name}</strong>,<br><br>We are writing to inform you that you have been removed / dropped from the classroom <strong>${classroom.className} (${classroom.sectionPrefix})</strong> by <strong>${req.user.name}</strong> (${req.user.role}).`,
          details: [
            { label: 'Course Name', value: classroom.className },
            { label: 'Section Prefix', value: classroom.sectionPrefix },
            { label: 'Instructor', value: classroom.teacher?.name || classroom.placeholderTeacherName },
            { label: 'Action By', value: `${req.user.name} (${req.user.role})` }
          ],
        });
      } catch (mailErr) {
        console.warn('Failed to dispatch student dropout notification email:', mailErr.message);
      }
    }
  }

  await Mark.findOneAndDelete({ classroom: classroomId, student: studentId });

  res.status(200).json({
    status: 'success',
    message: 'Student removed from classroom successfully and notification email dispatched.',
    data: { classroom },
  });
});

// =============================================================================
// 8. UPDATE CLASSROOM TAS
// =============================================================================
exports.updateClassroomTAs = catchAsync(async (req, res, next) => {
  const { classroomId, taIds, taId, userId } = req.body;
  const targetClassId = classroomId || req.params.classroomId;
  
  let resolvedTaIds = taIds;
  if (!resolvedTaIds && (taId || userId)) {
    resolvedTaIds = [taId || userId];
  }

  if (!targetClassId || !Array.isArray(resolvedTaIds)) {
    return next(new AppError('Classroom ID and taIds array are required!', 400));
  }

  const cleanTaIds = Array.from(new Set(resolvedTaIds.map((id) => id.toString())));

  const classroom = await Classroom.findOne({ _id: targetClassId, isActive: true });
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const mergedTaIds = Array.from(new Set([...(classroom.tas || []).map(id => id.toString()), ...cleanTaIds]));
  classroom.tas = mergedTaIds;
  await classroom.save();

  await classroom.populate('tas', 'name rollNo email personalNotificationEmail');

  res.status(200).json({
    status: 'success',
    message: 'Classroom TAs updated successfully!',
    data: { classroom },
  });
});

// =============================================================================
// 9. HARD DELETE CLASSROOM
// =============================================================================
exports.hardDeleteClassroom = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const filter = { _id: classroomId };

  if (req.user.role === 'TEACHER') {
    filter.$or = [{ teacher: req.user._id }, { createdBy: req.user._id }];
  } else if (req.user.role !== 'ADMIN') {
    return next(new AppError('You do not have permission to delete this classroom.', 403));
  }

  const classroom = await Classroom.findOne(filter);
  if (!classroom) return next(new AppError('Classroom not found or unauthorized!', 404));

  await Classroom.findByIdAndDelete(classroomId);
  await Mark.deleteMany({ classroom: classroomId });

  res.status(200).json({
    status: 'success',
    message: 'Classroom and all associated records permanently purged from database.',
  });
});

// =============================================================================
// 10. LOOKUP STUDENT DETAILS
// =============================================================================
exports.lookupStudentForAddDrop = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { rollInput } = req.body;

  if (!rollInput) {
    return next(new AppError('Roll number or registration identifier is required!', 400));
  }

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true });
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const cleanInput = rollInput.trim().toUpperCase();
  let targetRollNo = cleanInput;

  if (!cleanInput.startsWith(classroom.sectionPrefix) && !cleanInput.includes('FRESHER_')) {
    const digitsOnly = cleanInput.replace(/\D/g, '');
    if (digitsOnly) {
      targetRollNo = `${classroom.sectionPrefix}${digitsOnly.padStart(3, '0')}`;
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

  const isPrefixMatch = student.rollNo && student.rollNo.toUpperCase().startsWith(classroom.sectionPrefix.toUpperCase());
  const isAlreadyEnrolled = classroom.students.some(id => id.toString() === student._id.toString());

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
  const { classroomId, rollInput } = req.body;
  const targetClassId = classroomId || req.params.classroomId;

  if (!targetClassId || !rollInput) {
    return next(new AppError('Classroom ID and Roll Number/Suffix are required!', 400));
  }

  const classroom = await Classroom.findOne({ _id: targetClassId, isActive: true }).populate('teacher', 'name email personalNotificationEmail');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const cleanInput = rollInput.trim().toUpperCase();
  let targetRollNo = cleanInput;

  if (!cleanInput.startsWith(classroom.sectionPrefix) && !cleanInput.includes('FRESHER_')) {
    const digitsOnly = cleanInput.replace(/\D/g, '');
    if (digitsOnly) {
      targetRollNo = `${classroom.sectionPrefix}${digitsOnly.padStart(3, '0')}`;
    }
  }

  const student = await User.findOne({ 
    role: 'STUDENT', 
    $or: [
      { rollNo: targetRollNo }, 
      { rollNo: cleanInput },
      { registrationNo: rollInput.trim() } 
    ] 
  });

  if (!student) {
    return next(new AppError(`No registered student found with identifier: ${rollInput}`, 404));
  }

  if (classroom.students.length >= classroom.maxCapacity) {
    return next(new AppError(`Classroom has reached maximum capacity of ${classroom.maxCapacity}!`, 400));
  }

  if (classroom.students.some((id) => id.toString() === student._id.toString())) {
    return next(new AppError('Student is already enrolled in this classroom!', 400));
  }

  classroom.students.push(student._id);
  await classroom.save();
  await classroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  await Mark.findOneAndUpdate(
    { classroom: targetClassId, student: student._id },
    { $setOnInsert: { classroom: targetClassId, student: student._id } },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
    await sendStyledEmail({
      to: studentEmail,
      subject: `Enrolled in ${classroom.className}`,
      title: `Course Enrollment: ${classroom.className}`,
      bodyText: `You have been enrolled in <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
      details: [
        { label: 'Credit Hours', value: classroom.creditHours },
        { label: 'Instructor', value: classroom.teacher?.name || classroom.placeholderTeacherName }
      ]
    });
  }

  res.status(200).json({
    status: 'success',
    message: `Student ${student.name} added successfully!`,
    data: { classroom },
  });
});

// =============================================================================
// 11. ANONYMOUS COMPLAINT SYSTEM
// =============================================================================
exports.submitComplaint = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return next(new AppError('Complaint message cannot be empty!', 400));
  }

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true });
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  classroom.complaints.push({ message: message.trim() });
  await classroom.save();

  res.status(201).json({
    status: 'success',
    message: 'Anonymous complaint submitted successfully.',
  });
});

exports.getClassroomComplaints = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const classroom = await Classroom.findById(classroomId);
  
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to view complaints for this classroom.', 403));

  res.status(200).json({
    status: 'success',
    data: { complaints: classroom.complaints || [] },
  });
});

// =============================================================================
// 12. CREATE & DELETE GRADED ITEM
// =============================================================================
exports.createGradedItem = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, type, title, totalMarks, rangeStart, rangeEnd } = req.body;

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to create grading items in this classroom.', 403));

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', 'name rollNo');
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const rawCat = category || type || '';
  const targetKey = getNormalizedTargetKey(rawCat);

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    if (classroom[targetKey] && classroom[targetKey].totalMarks > 0) {
      return next(new AppError(`Only one ${targetKey} entry is allowed per classroom.`, 400));
    }
  }

  if (!classroom[targetKey]) {
    classroom[targetKey] = ['mids', 'finals', 'finalProject'].includes(targetKey) ? {} : [];
  }

  const cleanTitle = title.trim();
  
  let targetStudents = classroom.students;
  const hasRange = rangeStart !== undefined && rangeStart !== null && rangeEnd !== undefined && rangeEnd !== null && rangeStart !== '' && rangeEnd !== '';

  if (hasRange && !['mids', 'finals', 'finalProject'].includes(targetKey)) {
    const startIdx = parseInt(rangeStart, 10) - 1;
    const endIdx = parseInt(rangeEnd, 10);
    
    if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 0 || startIdx >= endIdx) {
      return next(new AppError('Invalid student range specified for marksheet creation.', 400));
    }

    const sortedStudents = [...classroom.students].sort((a, b) => {
      const rollA = (a.rollNo || '').toLowerCase();
      const rollB = (b.rollNo || '').toLowerCase();
      return rollA.localeCompare(rollB, undefined, { numeric: true, sensitivity: 'base' });
    });

    targetStudents = sortedStudents.slice(startIdx, endIdx);
    if (targetStudents.length === 0) {
      return next(new AppError('No students found within the specified range.', 400));
    }
  }

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    classroom[targetKey] = { title: cleanTitle, totalMarks: Number(totalMarks) };
  } else {
    const existsGlobally = classroom[targetKey].some(
      (item) => item.title.trim().toLowerCase() === cleanTitle.toLowerCase()
    );
    if (!existsGlobally) {
      classroom[targetKey].push({ title: cleanTitle, totalMarks: Number(totalMarks) });
    }
  }
  await classroom.save();

  const studentIdsToInitialize = targetStudents.map(st => st._id);
  for (const studId of studentIdsToInitialize) {
    let markDoc = await Mark.findOne({ classroom: classroomId, student: studId });
    if (!markDoc) {
      markDoc = await Mark.create({ classroom: classroomId, student: studId });
    }

    if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
      markDoc[targetKey] = { title: cleanTitle, totalMarks: Number(totalMarks), obtainedMarks: 0, isAbsent: false };
    } else {
      if (!markDoc[targetKey]) markDoc[targetKey] = [];
      const itemIdx = markDoc[targetKey].findIndex(i => i.title.trim().toLowerCase() === cleanTitle.toLowerCase());
      if (itemIdx === -1) {
        markDoc[targetKey].push({ title: cleanTitle, totalMarks: Number(totalMarks), obtainedMarks: 0, isAbsent: false });
      }
    }
    await markDoc.save();
  }

  res.status(201).json({
    status: 'success',
    message: 'Graded category item created successfully!',
    data: { targetedCount: targetStudents.length },
  });
});

exports.deleteGradedItem = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, type, title } = req.body; 

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to delete grading items in this classroom.', 403));

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true });
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const targetKey = getNormalizedTargetKey(category || type || req.params.categoryKey);
  const cleanTitle = (title || '').trim();

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    classroom[targetKey] = { title: 'Exam', totalMarks: 0, obtainedMarks: 0, isAbsent: false };
    await classroom.save();
    await Mark.updateMany(
      { classroom: classroomId },
      { $set: { [targetKey]: { title: 'Exam', totalMarks: 0, obtainedMarks: 0, isAbsent: false } } }
    );
  } else {
    if (!classroom[targetKey]) {
      return next(new AppError('Invalid grading category type.', 400));
    }
    classroom[targetKey] = classroom[targetKey].filter(
      (item) => item.title.trim().toLowerCase() !== cleanTitle.toLowerCase()
    );
    await classroom.save();
    await Mark.updateMany(
      { classroom: classroomId },
      { $pull: { [targetKey]: { title: { $regex: new RegExp(`^${cleanTitle}$`, 'i') } } } }
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Grading item successfully deleted!',
    data: { classroom },
  });
});

// =============================================================================
// 13. TA & TEACHER LOOKUP HELPERS
// =============================================================================
exports.lookupTA = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Roll number is required!', 400));

  const user = await User.findOne({ $or: [{ rollNo: rollNo.trim().toUpperCase() }, { registrationNo: rollNo.trim() }] });
  if (!user) {
    return res.status(404).json({ status: 'fail', data: { status: 'not_found', message: 'User account not found.' } });
  }

  res.status(200).json({ status: 'success', data: { status: 'found', user } });
});

exports.addTA = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { userId, taIds, taId } = req.body;
  const targetTaId = userId || taId || (Array.isArray(taIds) ? taIds[0] : null);

  const [classroom, taUser] = await Promise.all([
    Classroom.findById(classroomId),
    User.findById(targetTaId)
  ]);

  if (!classroom) return next(new AppError('Classroom not found!', 404));
  if (!taUser) return next(new AppError('User not found!', 404));

  if (!classroom.tas.includes(targetTaId)) {
    classroom.tas.push(targetTaId);
    await classroom.save();

    const taEmail = taUser.personalNotificationEmail || taUser.email;
    if (taEmail && !taEmail.includes('@temp.pucit.edu.pk')) {
      await sendStyledEmail({
        to: taEmail,
        subject: `Assigned as TA for ${classroom.className}`,
        title: `TA Assignment: ${classroom.className}`,
        bodyText: `You have been assigned as a Teaching Assistant for <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
        details: [
          { label: 'Assigned By', value: `${req.user.name} (${req.user.role})` }
        ]
      });
    }
  }

  res.status(200).json({ status: 'success', message: 'TA assigned successfully with contextual powers!' });
});

exports.lookupTeacher = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Teacher email or ID is required!', 400));

  const cleanInput = rollNo.trim();
  const query = cleanInput.includes('@') 
    ? { email: cleanInput.toLowerCase(), role: { $in: ['TEACHER', 'ADMIN'] } }
    : { $or: [{ rollNo: cleanInput.toUpperCase() }, { registrationNo: cleanInput }], role: { $in: ['TEACHER', 'ADMIN'] } };

  const user = await User.findOne(query);
  if (!user) {
    return res.status(404).json({ status: 'fail', data: { status: 'not_found', message: 'Teacher account not found.' } });
  }

  res.status(200).json({ status: 'success', data: { status: 'found', user } });
});

// =============================================================================
// 14. POST NOTICE TO NOTICE BOARD
// =============================================================================
exports.postNotice = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { title, content, attachment } = req.body;

  if (!title || !content) {
    return next(new AppError('Notice title and content are required!', 400));
  }

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to post notices in this classroom.', 403));

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true }).populate('students', 'email personalNotificationEmail');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const newNotice = {
    title: title.trim(),
    content: content.trim(),
    author: req.user._id,
    authorName: req.user.name,
    authorRole: req.user.role,
    attachment: (attachment && attachment.url) ? {
      url: attachment.url,
      public_id: attachment.public_id || '',
      fileType: attachment.fileType || '',
      fileName: attachment.fileName || ''
    } : { url: '', public_id: '', fileType: '', fileName: '' },
    createdAt: new Date(),
  };

  classroom.notices.push(newNotice);
  await classroom.save();

  if (classroom.students && classroom.students.length > 0) {
    const noticePromises = classroom.students.map(async (student) => {
      const studentEmail = student.personalNotificationEmail || student.email;
      if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
        await sendStyledEmail({
          to: studentEmail,
          subject: `New Notice: ${classroom.className} - ${newNotice.title}`,
          title: `Announcement: ${newNotice.title}`,
          bodyText: `<strong>${req.user.name}</strong> (${req.user.role}) posted a new announcement in <strong>${classroom.className}</strong>.<br><br><em>"${newNotice.content}"</em>`,
          details: [
            { label: 'Course', value: classroom.className },
            { label: 'Notice Title', value: newNotice.title },
            { label: 'Posted By', value: `${req.user.name} (${req.user.role})` }
          ]
        });
      }
    });
    await Promise.all(noticePromises).catch(err => console.warn('Failed to dispatch notice emails:', err));
  }

  res.status(201).json({
    status: 'success',
    message: 'Notice published successfully!',
    data: { notice: newNotice },
  });
});

// =============================================================================
// 15. SETTINGS & ENROLLMENT HELPERS
// =============================================================================
exports.updateClassroomSettings = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { className, sectionPrefix, maxCapacity, placeholderTeacherName, gradingScheme, sessionalActivities } = req.body;

  const updateData = {};
  if (className) updateData.className = className.trim();
  if (sectionPrefix) updateData.sectionPrefix = sectionPrefix.trim().toUpperCase();
  if (maxCapacity) updateData.maxCapacity = Number(maxCapacity);
  if (placeholderTeacherName !== undefined) updateData.placeholderTeacherName = placeholderTeacherName.trim();
  if (gradingScheme) updateData.gradingScheme = gradingScheme;
  if (Array.isArray(sessionalActivities)) {
    updateData.sessionalActivities = sessionalActivities.map(a => ({
      category: a.category.trim(),
      allocatedMarks: Number(a.allocatedMarks) || 0
    }));
  }

  const classroom = await Classroom.findOneAndUpdate(
    { _id: classroomId, isActive: true },
    updateData,
    { returnDocument: 'after' }
  )
    .populate('teacher', 'name email personalNotificationEmail')
    .populate('tas', 'name rollNo email personalNotificationEmail')
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail')
    .populate('createdBy', 'name email role');

  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  res.status(200).json({
    status: 'success',
    message: 'Classroom settings updated successfully!',
    data: { classroom },
  });
});

exports.addStudentsBySuffixRolls = catchAsync(async (req, res, next) => {
  const { classroomId, rollSuffixes } = req.body;
  const targetClassId = classroomId || req.params.classroomId;

  if (!targetClassId || !Array.isArray(rollSuffixes) || rollSuffixes.length === 0) {
    return next(new AppError('Classroom ID and rollSuffixes array are required!', 400));
  }

  const classroom = await Classroom.findOne({ _id: targetClassId, isActive: true }).populate('teacher', 'name email personalNotificationEmail');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const targetRollNos = rollSuffixes.map(item => {
    const cleanStr = item.toString().trim().toUpperCase();
    if (cleanStr.startsWith(classroom.sectionPrefix)) return cleanStr;
    const digits = cleanStr.replace(/\D/g, '').padStart(3, '0');
    return `${classroom.sectionPrefix}${digits}`;
  });

  const matchingStudents = await User.find({ role: 'STUDENT', rollNo: { $in: targetRollNos } });
  const enrolledSet = new Set(classroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    if (classroom.students.length >= classroom.maxCapacity) break;
    const studentIdStr = student._id.toString();
    if (!enrolledSet.has(studentIdStr)) {
      classroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await classroom.save();
  await classroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return Mark.findOneAndUpdate(
        { classroom: targetClassId, student: student._id },
        { $setOnInsert: { classroom: targetClassId, student: student._id } },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully added ${newStudents.length} students via suffix list!`,
    data: { classroom, addedCount: newStudents.length },
  });
});

exports.addBulkStudentsByRange = catchAsync(async (req, res, next) => {
  const { classroomId, startRoll, endRoll } = req.body;
  const targetClassId = classroomId || req.params.classroomId;

  if (!targetClassId || startRoll === undefined || endRoll === undefined) {
    return next(new AppError('Classroom ID, startRoll, and endRoll are required!', 400));
  }

  const classroom = await Classroom.findOne({ _id: targetClassId, isActive: true }).populate('teacher', 'name email personalNotificationEmail');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const start = parseInt(startRoll, 10);
  const end = parseInt(endRoll, 10);

  if (isNaN(start) || isNaN(end) || start > end) {
    return next(new AppError('Invalid range provided. Start must be less than or equal to End.', 400));
  }

  const targetRollNos = [];
  for (let i = start; i <= end; i++) {
    const paddedNum = i.toString().padStart(3, '0');
    targetRollNos.push(`${classroom.sectionPrefix}${paddedNum}`);
  }

  const matchingStudents = await User.find({ role: 'STUDENT', rollNo: { $in: targetRollNos } });
  const enrolledSet = new Set(classroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    if (classroom.students.length >= classroom.maxCapacity) break;
    const studentIdStr = student._id.toString();
    if (!enrolledSet.has(studentIdStr)) {
      classroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await classroom.save();
  await classroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return Mark.findOneAndUpdate(
        { classroom: targetClassId, student: student._id },
        { $setOnInsert: { classroom: targetClassId, student: student._id } },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully enrolled ${newStudents.length} students in bulk range!`,
    data: { classroom, addedCount: newStudents.length },
  });
});

exports.addDropSeniorsList = catchAsync(async (req, res, next) => {
  const { classroomId, rollNumbers } = req.body;
  const targetClassId = classroomId || req.params.classroomId;

  if (!targetClassId || !Array.isArray(rollNumbers) || rollNumbers.length === 0) {
    return next(new AppError('Classroom ID and rollNumbers array are required!', 400));
  }

  const classroom = await Classroom.findOne({ _id: targetClassId, isActive: true }).populate('teacher', 'name email personalNotificationEmail');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const cleanRolls = rollNumbers.map((r) => r.trim().toUpperCase());
  const matchingStudents = await User.find({ role: 'STUDENT', $or: [{ rollNo: { $in: cleanRolls } }, { registrationNo: { $in: cleanRolls } }] });

  const enrolledSet = new Set(classroom.students.map((id) => id.toString()));
  const newStudents = [];

  for (const student of matchingStudents) {
    if (classroom.students.length >= classroom.maxCapacity) break;
    const studentIdStr = student._id.toString();
    if (!enrolledSet.has(studentIdStr)) {
      classroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      newStudents.push(student);
    }
  }

  await classroom.save();
  await classroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return Mark.findOneAndUpdate(
        { classroom: targetClassId, student: student._id },
        { $setOnInsert: { classroom: targetClassId, student: student._id } },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully added ${newStudents.length} add/drop senior students!`,
    data: { classroom, addedCount: newStudents.length },
  });
});

// =============================================================================
// 16. GET MARKS FOR A SPECIFIC CLASSROOM
// =============================================================================
exports.getClassroomMarks = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  let filter = { classroom: classroomId };

  if (req.user.role === 'STUDENT') {
    filter.student = req.user._id;
  } else {
    const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
    if (!isStaff) {
      return next(new AppError('Unauthorized to view marks for this classroom.', 403));
    }
  }

  const marks = await Mark.find(filter)
    .populate('student', 'name rollNo registrationNo email personalNotificationEmail');

  res.status(200).json({
    status: 'success',
    results: marks.length,
    data: { marks },
  });
});

// =============================================================================
// 17. UPDATE / UPSERT INDIVIDUAL STUDENT MARKS
// =============================================================================
exports.updateStudentMarks = catchAsync(async (req, res, next) => {
  const { classroomId, studentId } = req.params;
  const { category, type, title, obtainedMarks, totalMarks, isAbsent } = req.body;

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to update student marks.', 403));

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const student = await User.findOne({ _id: studentId, role: 'STUDENT' });
  if (!student) return next(new AppError('Student record not found!', 404));

  const targetKey = getNormalizedTargetKey(category || type);

  let markRecord = await Mark.findOne({ classroom: classroomId, student: studentId });
  if (!markRecord) {
    markRecord = await Mark.create({ classroom: classroomId, student: studentId });
  }

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    markRecord[targetKey] = {
      title: title || 'Exam',
      totalMarks: Number(totalMarks) || markRecord[targetKey]?.totalMarks || 0,
      obtainedMarks: isAbsent ? 0 : Number(obtainedMarks) || 0,
      isAbsent: Boolean(isAbsent),
    };
  } else {
    if (!title) return next(new AppError('Item title is required for evaluations.', 400));
    
    const cleanTitle = title.trim();
    if (!markRecord[targetKey]) markRecord[targetKey] = [];
    const itemIndex = markRecord[targetKey].findIndex(
      (item) => item.title.trim().toLowerCase() === cleanTitle.toLowerCase()
    );

    const itemData = {
      title: cleanTitle,
      totalMarks: Number(totalMarks),
      obtainedMarks: isAbsent ? 0 : Number(obtainedMarks),
      isAbsent: Boolean(isAbsent),
    };

    if (itemIndex > -1) {
      markRecord[targetKey][itemIndex] = { ...markRecord[targetKey][itemIndex], ...itemData };
    } else {
      markRecord[targetKey].push(itemData);
    }
  }

  await markRecord.save();

  res.status(200).json({
    status: 'success',
    message: `Marks updated successfully for ${student.name}!`,
    data: { markRecord },
  });
});

// =============================================================================
// 18. WHOLE-CLASS BATCH RESULTS UPLOAD
// =============================================================================
exports.updateWholeClassMarks = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, type, title, totalMarks, studentScores } = req.body; 

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to upload whole-class marks.', 403));

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  if (!Array.isArray(studentScores) || studentScores.length === 0) {
    return next(new AppError('studentScores array is required for whole-class updates!', 400));
  }

  const targetKey = getNormalizedTargetKey(category || type);
  const parsedTotal = Number(totalMarks);

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    for (const scoreEntry of studentScores) {
      const isAbsent = Boolean(scoreEntry.isAbsent);
      const obtained = isAbsent ? 0 : Number(scoreEntry.obtainedMarks || 0);

      await Mark.findOneAndUpdate(
        { classroom: classroomId, student: scoreEntry.studentId },
        {
          $set: {
            [targetKey]: {
              title: title || 'Exam',
              totalMarks: parsedTotal,
              obtainedMarks: obtained,
              isAbsent: isAbsent,
            }
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    }
  } else {
    if (!title) return next(new AppError('Title is required for evaluation mark entries.', 400));
    
    for (const scoreEntry of studentScores) {
      let markRec = await Mark.findOne({ classroom: classroomId, student: scoreEntry.studentId });
      if (!markRec) {
        markRec = await Mark.create({ classroom: classroomId, student: scoreEntry.studentId });
      }

      const isAbsent = Boolean(scoreEntry.isAbsent);
      const obtained = isAbsent ? 0 : Number(scoreEntry.obtainedMarks || 0);
      const cleanTitle = title.trim();

      if (!markRec[targetKey]) markRec[targetKey] = [];
      const idx = markRec[targetKey].findIndex(item => item.title.trim().toLowerCase() === cleanTitle.toLowerCase());
      const itemPayload = { title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: obtained, isAbsent };

      if (idx > -1) {
        markRec[targetKey][idx] = { ...markRec[targetKey][idx], ...itemPayload };
      } else {
        markRec[targetKey].push(itemPayload);
      }
      await markRec.save();
    }
  }

  res.status(200).json({
    status: 'success',
    message: `Whole-class marks successfully uploaded for ${studentScores.length} students!`,
  });
});

// =============================================================================
// 19. GET AUTO-DETECTABLE AVAILABLE STUDENTS
// =============================================================================
exports.getAvailableStudentsByPrefix = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true });
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const prefix = classroom.sectionPrefix.toUpperCase();

  const matchingStudents = await User.find({
    role: 'STUDENT',
    $or: [
      { rollNo: { $regex: `^${prefix}`, $options: 'i' } },
      { rollNo: { $regex: `^FRESHER_`, $options: 'i' } }
    ]
  }).select('name rollNo registrationNo email personalNotificationEmail');

  const enrolledStudentIds = new Set(classroom.students.map(id => id.toString()));

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
// 20. BULK APPROVE AVAILABLE STUDENTS
// =============================================================================
exports.bulkApproveAvailableStudents = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { studentIds } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return next(new AppError('An array of studentIds is required!', 400));
  }

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('teacher', 'name email personalNotificationEmail');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const studentsToAdd = await User.find({
    _id: { $in: studentIds },
    role: 'STUDENT'
  });

  const enrolledSet = new Set(classroom.students.map(id => id.toString()));
  const successfullyAdded = [];

  for (const student of studentsToAdd) {
    const studentIdStr = student._id.toString();
    if (classroom.students.length >= classroom.maxCapacity) break;

    if (!enrolledSet.has(studentIdStr)) {
      classroom.students.push(student._id);
      enrolledSet.add(studentIdStr);
      successfullyAdded.push(student);
    }
  }

  await classroom.save();
  await classroom.populate('students', 'name rollNo registrationNo email personalNotificationEmail');

  if (successfullyAdded.length > 0) {
    const markPromises = successfullyAdded.map((student) => {
      return Mark.findOneAndUpdate(
        { classroom: classroomId, student: student._id },
        { $setOnInsert: { classroom: classroomId, student: student._id } },
        { upsert: true, returnDocument: 'after' }
      );
    });
    await Promise.all(markPromises);
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully approved and added ${successfullyAdded.length} students!`,
    data: { classroom, addedCount: successfullyAdded.length }
  });
});

// =============================================================================
// 21. ADMIN USER DELETION CONTROL
// =============================================================================
exports.adminDeleteUser = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return next(new AppError('Only administrators can delete user accounts.', 403));
  }

  const { userId } = req.params;
  if (!userId) {
    return next(new AppError('Target User ID is required!', 400));
  }

  if (userId.toString() === req.user._id.toString()) {
    return next(new AppError('Security Restriction: You cannot delete your own admin account while logged in.', 400));
  }

  const targetUser = await User.findById(userId);
  if (!targetUser) {
    return next(new AppError('User account not found.', 404));
  }

  await User.findByIdAndDelete(userId);
  await Mark.deleteMany({ student: userId });

  res.status(200).json({
    status: 'success',
    message: `User account ${targetUser.name} (${targetUser.email}) successfully deleted by admin.`,
  });
});

// =============================================================================
// 22. MARKSHEET BULK SHEET & UNASSIGNED ENDPOINTS
// =============================================================================
exports.getBulkMarksSheet = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', 'name rollNo registrationNo email');
  
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const existingMarks = await Mark.find({ classroom: classroomId });

  res.status(200).json({
    status: 'success',
    data: {
      classroom,
      students: classroom.students || [],
      existingMarks
    }
  });
});

exports.getUnassignedStudentsForActivity = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, title } = req.query;

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', 'name rollNo registrationNo email');
  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  const existingMarks = await Mark.find({ classroom: classroomId });
  const targetKey = getNormalizedTargetKey(category);
  const cleanTitle = (title || '').trim().toLowerCase();

  const unassignedStudents = (classroom.students || []).filter(student => {
    const studentId = student._id.toString();
    const markDoc = existingMarks.find(m => m.student.toString() === studentId);
    if (!markDoc) return true;

    if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
      const examObj = markDoc[targetKey];
      return !examObj || (examObj.obtainedMarks === undefined && !examObj.isAbsent);
    }

    let list = markDoc[targetKey] && Array.isArray(markDoc[targetKey]) ? markDoc[targetKey] : [];
    const foundItem = list.find(e => e.title?.trim().toLowerCase() === cleanTitle);
    return !foundItem || (foundItem.obtainedMarks === undefined && !foundItem.isAbsent);
  });

  res.status(200).json({
    status: 'success',
    data: { unassignedStudents }
  });
});

exports.batchSubmitMarks = catchAsync(async (req, res, next) => {
  const { classroomId, category, title, totalMarks, marksData } = req.body;

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to batch submit marks.', 403));

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const targetKey = getNormalizedTargetKey(category);
  const cleanTitle = (title || 'Exam').trim();
  const parsedTotal = Number(totalMarks) || 10;

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    classroom[targetKey] = { title: cleanTitle, totalMarks: parsedTotal };
    await classroom.save();
  } else {
    if (!classroom[targetKey]) classroom[targetKey] = [];
    const existingItem = classroom[targetKey].find(i => i.title.trim().toLowerCase() === cleanTitle.toLowerCase());
    if (!existingItem) {
      classroom[targetKey].push({ title: cleanTitle, totalMarks: parsedTotal });
      await classroom.save();
    }
  }

  for (const entry of marksData) {
    let markRec = await Mark.findOne({ classroom: classroomId, student: entry.studentId });
    if (!markRec) {
      markRec = await Mark.create({ classroom: classroomId, student: entry.studentId });
    }

    const isAbsent = Boolean(entry.isAbsent);
    const obtained = isAbsent ? 0 : Number(entry.obtainedMarks || 0);

    if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
      markRec[targetKey] = {
        title: cleanTitle,
        totalMarks: parsedTotal,
        obtainedMarks: obtained,
        isAbsent,
        file: entry.file || null
      };
    } else {
      if (!markRec[targetKey]) markRec[targetKey] = [];
      const idx = markRec[targetKey].findIndex(i => i.title.trim().toLowerCase() === cleanTitle.toLowerCase());
      
      const payload = {
        title: cleanTitle,
        totalMarks: parsedTotal,
        obtainedMarks: obtained,
        isAbsent,
        file: entry.file || null
      };

      if (idx > -1) {
        markRec[targetKey][idx] = { ...markRec[targetKey][idx], ...payload };
      } else {
        markRec[targetKey].push(payload);
      }
    }
    await markRec.save();
  }

  res.status(200).json({
    status: 'success',
    message: 'Batch marks submitted successfully!'
  });
});

exports.deleteEvaluationItemRoute = catchAsync(async (req, res, next) => {
  const { classroomId, category, itemTitle } = req.body;

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to delete evaluation.', 403));

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const targetKey = getNormalizedTargetKey(category);
  const cleanTitle = (itemTitle || '').trim();

  if (['mids', 'finals', 'finalProject'].includes(targetKey)) {
    classroom[targetKey] = { title: 'Exam', totalMarks: 0, obtainedMarks: 0, isAbsent: false };
    await classroom.save();
    await Mark.updateMany(
      { classroom: classroomId },
      { $set: { [targetKey]: { title: 'Exam', totalMarks: 0, obtainedMarks: 0, isAbsent: false } } }
    );
  } else {
    if (classroom[targetKey]) {
      classroom[targetKey] = classroom[targetKey].filter(
        item => item.title.trim().toLowerCase() !== cleanTitle.toLowerCase()
      );
      await classroom.save();
    }
    await Mark.updateMany(
      { classroom: classroomId },
      { $pull: { [targetKey]: { title: { $regex: new RegExp(`^${cleanTitle}$`, 'i') } } } }
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Evaluation removed successfully!'
  });
});