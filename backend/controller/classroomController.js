const Classroom = require('../models/classRoomSchema');
const User = require('../models/userSchema');
const Mark = require('../models/markSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const nodemailer = require('nodemailer');

// Helper: Nodemailer transporter with safeguards
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  socketTimeout: 10000,
});

// Helper: Unified Modern Sleek Enterprise Email Wrapper
const sendStyledEmail = async ({ to, subject, title, bodyText, details = [] }) => {
  if (!to) return;
  const timestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const detailsHtml =
    details.length > 0
      ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 24px 0;">
      <tr>
        <td style="padding: 16px 20px;">
          ${details
            .map(
              (d) => `
            <div style="font-size: 13px; color: #475569; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <strong style="color: #0f172a; font-weight: 600;">${d.label}:</strong> <span style="color: #1e293b; font-weight: 500;">${d.value}</span>
            </div>
          `,
            )
            .join('')}
        </td>
      </tr>
    </table>
  `
      : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 0; color: #334155;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9;">
        <tr>
          <td align="center">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025);">
              
              <!-- Header Bar -->
              <tr>
                <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #f1f5f9;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #0f172a; background: #e2e8f0; padding: 6px 12px; border-radius: 6px; display: inline-block;">
                          PUCIT Classroom Portal
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 8px; font-size: 11px; color: #94a3b8; font-weight: 500;">
                        Academic Ecosystem
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Main Content Area -->
              <tr>
                <td style="padding: 32px;">
                  <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.025em;">
                    ${title}
                  </h2>
                  <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                    ${bodyText}
                  </p>

                  ${detailsHtml}

                  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                    Automated secure notification.<br>
                    <span>Timestamp: ${timestamp}</span>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                  <p style="margin: 0; font-size: 11px; color: #64748b;">
                    Independent Academic Tool • Administered by <strong style="color: #475569;">Shehzada Ather</strong>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: '"PUCIT Portal System" <no-reply@pucit.edu.pk>',
      to,
      subject: `[PUCIT Portal] ${subject || title}`,
      html: htmlContent,
    });
  } catch (err) {
    console.error('Failed to send styled email notification:', err.message);
  }
};

// Helper: Normalize Schema Target Keys Safely (Quizzes, Assignments, Mids, Finals)
const getNormalizedTargetKey = (rawType = '') => {
  const clean = rawType.trim().toLowerCase();
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('mid')) return 'mids';
  if (clean.includes('final')) return 'finals';
  return clean.endsWith('s') ? clean : clean + 's';
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
    .populate('students', 'name rollNo email personalNotificationEmail')
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
    .populate('students', 'name rollNo email personalNotificationEmail')
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
  if (teacherEmail) {
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
    { $setOnInsert: { classroom: targetClassId, student: studentId, quizzes: [], assignments: [] } },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail) {
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
    message: `Student ${student.name} (${student.rollNo}) enrolled successfully!`,
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
  );

  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  await Mark.findOneAndDelete({ classroom: classroomId, student: studentId });

  res.status(200).json({
    status: 'success',
    message: 'Student removed from classroom successfully.',
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
// 10. ADD STUDENT BY ROLL NUMBER
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

  if (!cleanInput.startsWith(classroom.sectionPrefix)) {
    const digitsOnly = cleanInput.replace(/\D/g, '');
    const paddedDigits = digitsOnly.padStart(3, '0');
    targetRollNo = `${classroom.sectionPrefix}${paddedDigits}`;
  }

  const student = await User.findOne({ role: 'STUDENT', rollNo: targetRollNo });
  if (!student) {
    return next(new AppError(`No registered student found with Roll Number: ${targetRollNo}`, 404));
  }

  if (classroom.students.length >= classroom.maxCapacity) {
    return next(new AppError(`Classroom has reached maximum capacity of ${classroom.maxCapacity}!`, 400));
  }

  if (classroom.students.some((id) => id.toString() === student._id.toString())) {
    return next(new AppError('Student is already enrolled in this classroom!', 400));
  }

  classroom.students.push(student._id);
  await classroom.save();
  await classroom.populate('students', 'name rollNo email personalNotificationEmail');

  await Mark.findOneAndUpdate(
    { classroom: targetClassId, student: student._id },
    { $setOnInsert: { classroom: targetClassId, student: student._id, quizzes: [], assignments: [] } },
    { upsert: true, returnDocument: 'after' }
  );

  const studentEmail = student.personalNotificationEmail || student.email;
  if (studentEmail) {
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
    message: `Student ${student.name} (${targetRollNo}) added successfully!`,
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
// 12. CREATE & DELETE GRADED ITEM (Quizzes & Assignments)
// =============================================================================
exports.createGradedItem = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, type, title, totalMarks } = req.body;

  const isStaff = await verifyClassroomStaff(req.user._id, req.user.role, classroomId);
  if (!isStaff) return next(new AppError('Unauthorized to create grading items in this classroom.', 403));

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true });
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const targetKey = getNormalizedTargetKey(category || type);

  if (!classroom[targetKey]) {
    classroom[targetKey] = [];
  }

  const exists = classroom[targetKey].some(
    (item) => item.title.trim().toLowerCase() === title.trim().toLowerCase()
  );
  if (exists) {
    return next(new AppError('An evaluation item with this title already exists in this category.', 400));
  }

  classroom[targetKey].push({ title: title.trim(), totalMarks: Number(totalMarks) });
  await classroom.save();

  const newItem = classroom[targetKey][classroom[targetKey].length - 1];

  res.status(201).json({
    status: 'success',
    message: 'Graded category item created successfully!',
    data: { item: newItem },
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
  const cleanTitle = title.trim();

  if (!classroom[targetKey]) {
    return next(new AppError('Invalid grading category type.', 400));
  }

  const beforeCount = classroom[targetKey].length;
  classroom[targetKey] = classroom[targetKey].filter(
    (item) => item.title.trim().toLowerCase() !== cleanTitle.toLowerCase()
  );

  if (classroom[targetKey].length === beforeCount) {
    return next(new AppError(`Grading item "${cleanTitle}" not found in ${targetKey}.`, 404));
  }

  await classroom.save();

  await Mark.updateMany(
    { classroom: classroomId },
    { $pull: { [targetKey]: { title: { $regex: new RegExp(`^${cleanTitle}$`, 'i') } } } }
  );

  res.status(200).json({
    status: 'success',
    message: `Grading item "${cleanTitle}" successfully deleted and removed from calculations!`,
    data: { classroom },
  });
});

// =============================================================================
// 13. TA & TEACHER LOOKUP / ASSIGNMENT HELPERS
// =============================================================================
exports.lookupTA = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  if (!rollNo) return next(new AppError('Roll number is required!', 400));

  const user = await User.findOne({ rollNo: rollNo.trim().toUpperCase() });
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
    if (taEmail) {
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
    : { rollNo: cleanInput.toUpperCase(), role: { $in: ['TEACHER', 'ADMIN'] } };

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
      if (studentEmail) {
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
// 15. SETTINGS & BULK STUDENT ENROLLMENT HELPERS
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
    .populate('students', 'name rollNo email personalNotificationEmail')
    .populate('createdBy', 'name email role');

  if (!classroom) return next(new AppError('Active classroom not found!', 404));

  res.status(200).json({
    status: 'success',
    message: 'Classroom settings updated successfully!',
    data: { classroom },
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
  await classroom.populate('students', 'name rollNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return Mark.findOneAndUpdate(
        { classroom: targetClassId, student: student._id },
        { $setOnInsert: { classroom: targetClassId, student: student._id, quizzes: [], assignments: [] } },
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
            subject: `Enrolled in ${classroom.className}`,
            title: `Course Enrollment: ${classroom.className}`,
            bodyText: `You have been officially enrolled in <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
            details: [
              { label: 'Credit Hours', value: classroom.creditHours },
              { label: 'Instructor', value: classroom.teacher?.name || classroom.placeholderTeacherName }
            ]
          });
        }
      })
    );
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
  const matchingStudents = await User.find({ role: 'STUDENT', rollNo: { $in: cleanRolls } });

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
  await classroom.populate('students', 'name rollNo email personalNotificationEmail');

  if (newStudents.length > 0) {
    const markPromises = newStudents.map((student) => {
      return Mark.findOneAndUpdate(
        { classroom: targetClassId, student: student._id },
        { $setOnInsert: { classroom: targetClassId, student: student._id, quizzes: [], assignments: [] } },
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
            subject: `Enrolled in ${classroom.className}`,
            title: `Course Enrollment: ${classroom.className}`,
            bodyText: `You have been officially enrolled in <strong>${classroom.className} (${classroom.sectionPrefix})</strong>.`,
            details: [
              { label: 'Credit Hours', value: classroom.creditHours },
              { label: 'Instructor', value: classroom.teacher?.name || classroom.placeholderTeacherName }
            ]
          });
        }
      })
    );
  }

  res.status(200).json({
    status: 'success',
    message: `Successfully added ${newStudents.length} add/drop senior students!`,
    data: { classroom, addedCount: newStudents.length },
  });
});