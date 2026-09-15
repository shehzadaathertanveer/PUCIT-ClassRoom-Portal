const mongoose = require("mongoose");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// REQUIRE THE MODEL DIRECTLY SO MONGOOSE REGISTERS IT IMMEDIATELY
require("../models/userSchema");
const User = mongoose.model("User");

const Classroom = require("../models/classRoomSchema");
const Labroom = require("../models/labSchema");
const Mark = require("../models/markSchema");
const LabMark = require("../models/labMarkSchema");
const catchAsync = require("../utils/catchAsyncError");
const AppError = require("../utils/appError");
const sendStyledEmail = require("../utils/emailService");

// In-memory maintenance flag object
let systemMaintenance = {
  isUnderMaintenance: false,
  message: "Portal is currently undergoing scheduled maintenance. Please try again later.",
  retryAfter: "15 minutes"
};

// RegEx to validate official PUCIT roll number structures or temporary fresher prefixes
const FULL_ROLL_NO_REGEX = /^[A-Z]{2,5}[FS]\d{2}[A-Z]\d{3}$/i;
const TEMP_PREFIX_REGEX = /^[A-Z]{2,5}[FS]\d{2}[A-Z]?$/i;
const REG_NO_REGEX = /^\d{6,7}$/;

// Helper: Generates signed JWT authentication token
const signToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Helper: SHA-256 OTP hashing for secure database storage
const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

// SECURE SYNC: Enrolls student if their exact roll number or temporary prefix matches approved lists
const syncStudentEnrollment = async (user) => {
  if (user.role !== "STUDENT") return;

  const userRoll = user.rollNo ? user.rollNo.toUpperCase() : "";
  const userReg = user.registrationNo ? user.registrationNo.toUpperCase() : "";

  if (!userRoll && !userReg) return;

  const queryConditions = [
    { isActive: true, approvedRollNumbers: { $in: [userRoll, userReg].filter(Boolean) } }
  ];

  if (TEMP_PREFIX_REGEX.test(userRoll)) {
    queryConditions.push({ isActive: true, sectionPrefix: userRoll });
  }

  const matchingClassrooms = await Classroom.find({ $or: queryConditions }).select('_id students maxCapacity');

  if (matchingClassrooms.length === 0) return;

  const syncPromises = matchingClassrooms.map(async (classroom) => {
    if (classroom.students.length >= classroom.maxCapacity) return;

    await Promise.all([
      Classroom.updateOne(
        { _id: classroom._id },
        { $addToSet: { students: user._id } }
      ),
      Mark.findOneAndUpdate(
        { classroom: classroom._id, student: user._id },
        {
          $setOnInsert: {
            classroom: classroom._id,
            student: user._id,
            quizzes: [],
            assignments: [],
          },
        },
        { upsert: true, returnDocument: "after" }
      )
    ]);
  });

  await Promise.all(syncPromises);
};

// =============================================================================
// SYSTEM MAINTENANCE MODE MIDDLEWARE & CONTROLLERS
// =============================================================================
exports.checkMaintenanceMode = (req, res, next) => {
  if (systemMaintenance.isUnderMaintenance) {
    if (
      req.path.includes('/maintenance') ||
      req.path.includes('/auth/login') ||
      req.path.includes('/auth/me') ||
      (req.user && req.user.role === 'ADMIN')
    ) {
      return next();
    }
    return res.status(503).json({
      status: "maintenance",
      message: systemMaintenance.message,
      retryAfter: systemMaintenance.retryAfter,
      isUnderMaintenance: true
    });
  }
  next();
};

exports.getMaintenanceStatus = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: "success",
    data: systemMaintenance
  });
});

exports.toggleMaintenanceMode = catchAsync(async (req, res, next) => {
  const { isUnderMaintenance, message, retryAfter } = req.body;
  
  if (isUnderMaintenance !== undefined) {
    systemMaintenance.isUnderMaintenance = Boolean(isUnderMaintenance);
  }
  if (message) systemMaintenance.message = message;
  if (retryAfter) systemMaintenance.retryAfter = retryAfter;

  res.status(200).json({
    status: "success",
    message: `Maintenance mode is now ${systemMaintenance.isUnderMaintenance ? 'ENABLED' : 'DISABLED'}.`,
    data: systemMaintenance
  });
});

// =============================================================================
// 1. GET ME PROFILE
// =============================================================================
exports.getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select("-password");
  if (!user) {
    return next(new AppError("User not found.", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        rollNo: user.rollNo,
        registrationNo: user.registrationNo,
        role: user.role,
        personalNotificationEmail: user.personalNotificationEmail,
        isUniversityEmailVerified: user.isUniversityEmailVerified,
        isEmailVerified: user.isEmailVerified,
      },
    },
  });
});

// =============================================================================
// 2. INITIATE REGISTRATION (Supports Freshers with Reg No & Temporary Prefix / Roll No)
// =============================================================================
exports.initiateRegistration = catchAsync(async (req, res, next) => {
  const { name, password, rollNo, registrationNo, personalNotificationEmail, email } = req.body;

  if (!password || !name) {
    return next(new AppError("Name and Password are required!", 400));
  }

  let formattedRollNo = rollNo ? rollNo.trim().toUpperCase() : "";
  let formattedRegNo = registrationNo ? registrationNo.trim().toUpperCase() : "";
  let cleanEmail = email ? email.trim().toLowerCase() : "";
  const cleanPersonalEmail = personalNotificationEmail ? personalNotificationEmail.trim().toLowerCase() : null;

  let assignedRole = "STUDENT";

  if (!formattedRollNo && cleanEmail && !cleanEmail.endsWith('@pucit.edu.pk')) {
    assignedRole = "PENDING_TEACHER";
    formattedRollNo = cleanEmail.split('@')[0].toUpperCase();
  } else if (!formattedRollNo && formattedRegNo) {
    formattedRollNo = `TEMP_${formattedRegNo}`;
  }

  const isValidStudentFormat = 
    FULL_ROLL_NO_REGEX.test(formattedRollNo) || 
    TEMP_PREFIX_REGEX.test(formattedRollNo) || 
    formattedRollNo.startsWith('TEMP_');

  if (assignedRole === "STUDENT" && !isValidStudentFormat) {
    return next(new AppError("A valid Roll Number or Temporary Prefix is required for student registration!", 400));
  }

  if (formattedRegNo && !REG_NO_REGEX.test(formattedRegNo)) {
    return next(new AppError("Registration number must be a valid 6 or 7 digit unique number!", 400));
  }

  const officialEmail = cleanEmail || (FULL_ROLL_NO_REGEX.test(formattedRollNo) ? `${formattedRollNo.toLowerCase()}@pucit.edu.pk` : `${formattedRegNo || Math.random().toString(36).substring(7)}@temp.pucit.edu.pk`);

  if (formattedRegNo) {
    const existingRegHolder = await User.findOne({ registrationNo: formattedRegNo, isEmailVerified: true }).select('_id');
    if (existingRegHolder) {
      return next(new AppError("This Registration / Form Number is already linked to an active account.", 400));
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = hashOtp(otp);
  const otpExpiry = Date.now() + 10 * 60 * 1000;

  const destinationEmail = cleanPersonalEmail || (cleanEmail && cleanEmail.endsWith('@pucit.edu.pk') ? cleanEmail : null) || cleanPersonalEmail;

  if (!destinationEmail) {
    return next(new AppError("A personal notification email is required for registration when using temporary roll/registration numbers!", 400));
  }

  await sendStyledEmail({
    to: destinationEmail,
    subject: "Account Registration OTP",
    title: "Complete Your Registration",
    bodyText: `Hello <strong>${name}</strong>, welcome to the PUCIT Classroom Portal. Use the secure verification code boxes below to activate your account.`,
    otpCode: otp,
    details: [
      { label: "Assigned Roll / Prefix", value: formattedRollNo },
      { label: "Registration / Form No", value: formattedRegNo || "N/A" },
      { label: "Notification Email", value: destinationEmail }
    ],
  });

  let user = await User.findOne({ 
    $or: [
      { email: officialEmail }, 
      ...(formattedRegNo ? [{ registrationNo: formattedRegNo }] : []), 
      ...(formattedRollNo ? [{ rollNo: formattedRollNo }] : [])
    ] 
  });

  if (user) {
    user.name = name;
    user.rollNo = formattedRollNo;
    if (formattedRegNo) user.registrationNo = formattedRegNo;
    user.password = password;
    user.role = assignedRole;
    user.personalNotificationEmail = cleanPersonalEmail;
    user.requiresEmail = true;
    user.isEmailVerified = false;
    user.isUniversityEmailVerified = false;
    user.otpCode = hashedOtp;
    user.otpExpiresAt = otpExpiry;
    await user.save();
  } else {
    user = await User.create({
      name,
      email: officialEmail,
      rollNo: formattedRollNo,
      registrationNo: formattedRegNo || undefined,
      password,
      role: assignedRole,
      personalNotificationEmail: cleanPersonalEmail,
      requiresEmail: true,
      isEmailVerified: false,
      isUniversityEmailVerified: false,
      otpCode: hashedOtp,
      otpExpiresAt: otpExpiry,
    });
  }

  res.status(200).json({
    status: "success",
    message: `Verification code sent to ${destinationEmail}. Please verify OTP to complete registration.`,
    email: officialEmail,
  });
});

// =============================================================================
// 3. VERIFY REGISTRATION OTP & ACTIVATE ACCOUNT (FRESHER TEMP-EMAIL SAFE)
// =============================================================================
exports.verifyRegistrationOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError("Email and OTP code are required!", 400));
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();
  const hashedInputOtp = hashOtp(cleanOtp);
  const prefixFromEmail = cleanEmail.split('@')[0].toUpperCase();

  const user = await User.findOne({
    $or: [
      { email: cleanEmail },
      { personalNotificationEmail: cleanEmail },
      { rollNo: prefixFromEmail }
    ]
  });

  if (!user) {
    return next(new AppError("No pending registration found for this account. Please re-initiate registration.", 400));
  }

  if (!user.otpCode || user.otpCode !== hashedInputOtp) {
    return next(new AppError("Invalid OTP code!", 400));
  }

  if (user.otpExpiresAt && user.otpExpiresAt < Date.now()) {
    return next(new AppError("OTP code has expired!", 400));
  }

  user.isEmailVerified = true;
  user.otpCode = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  const userRoll = user.rollNo ? user.rollNo.toUpperCase() : "";

  if (user.role === "TA" && userRoll) {
    const taClassrooms = await Classroom.find({ isActive: true, taRollNumbers: userRoll }).select('_id');
    await Promise.all(
      taClassrooms.map(classroom =>
        Classroom.updateOne({ _id: classroom._id }, { $addToSet: { tas: user._id } })
      )
    );
  }

  if (user.role === "STUDENT") {
    await syncStudentEnrollment(user);
  }

  user.password = undefined;
  const token = signToken(user._id, user.role);

  res.status(200).json({
    status: "success",
    message: "Email verified! Account activated successfully.",
    token,
    user,
  });
});

// =============================================================================
// 4. USER LOGIN & DASHBOARD DATA PRE-LOAD (Optimized with Parallel Execution)
// =============================================================================
exports.login = catchAsync(async (req, res, next) => {
  const { loginIdentifier, password } = req.body;

  if (!loginIdentifier || !password) {
    return next(new AppError("Please provide Roll Number/Email and Password!", 400));
  }

  const identifier = loginIdentifier.trim();
  const fresherBatchCode = (process.env.VITE_FRESHER_BATCH || 'f26').trim().toUpperCase();

  const user = await User.findOne({
    $or: [
      { rollNo: identifier.toUpperCase() },
      { email: identifier.toLowerCase() },
      { personalNotificationEmail: identifier.toLowerCase() }
    ],
  }).select("+password");

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError("Incorrect credentials provided!", 401));
  }

  const isEmailLogin = identifier.includes('@') || identifier.toLowerCase() === user.email || identifier.toLowerCase() === user.personalNotificationEmail;
  
  if (user.role === "STUDENT" && isEmailLogin) {
    const isFresher = (user.rollNo && user.rollNo.toUpperCase().includes(fresherBatchCode)) || user.personalNotificationEmail;
    
    if (!isFresher) {
      return next(new AppError("Senior students must log in using their Roll Number and Password.", 403));
    }
  }

  if (user.requiresEmail && !user.isEmailVerified) {
    return next(new AppError("Your email address is not verified! Please complete OTP verification.", 403));
  }

  if (user.role === "PENDING_TEACHER") {
    return next(new AppError("Your teacher account is pending Admin approval. Contact administrator.", 403));
  }

  if (user.role === "STUDENT") {
    await syncStudentEnrollment(user);
  }

  user.password = undefined;
  user.otpCode = undefined;
  user.otpExpiresAt = undefined;

  const token = signToken(user._id, user.role);
  let dashboardData = {};

  if (user.role === "STUDENT") {
    const classrooms = await Classroom.find({ students: user._id, isActive: true })
      .populate("teacher", "name email")
      .populate("tas", "name rollNo email");

    const classroomIds = classrooms.map((c) => c._id);
    const marks = await Mark.find({ student: user._id, classroom: { $in: classroomIds } });

    dashboardData = { classrooms, marks };
  } else if (["TA", "TEACHER"].includes(user.role)) {
    const roleKey = user.role === "TA" ? "tas" : "teacher";
    
    const [classrooms, labrooms] = await Promise.all([
      Classroom.find({ [roleKey]: user._id, isActive: true })
        .populate("teacher", "name email")
        .populate("tas", "name rollNo email")
        .populate("students", "name rollNo registrationNo email requiresEmail"),
      Labroom.find({ [roleKey]: user._id, isActive: true })
        .populate("teacher", "name email")
        .populate("tas", "name rollNo email")
        .populate("students", "name rollNo registrationNo email requiresEmail")
    ]);

    const classroomIds = classrooms.map((c) => c._id);
    const marks = await Mark.find({ classroom: { $in: classroomIds } });

    dashboardData = { classrooms, labrooms, marks };
  } else if (user.role === "ADMIN") {
    const [activeClassrooms, activeLabrooms, pendingTeachers, allUsers] = await Promise.all([
      Classroom.find({ isActive: true })
        .populate("teacher", "name email")
        .populate("tas", "name rollNo")
        .populate("students", "name rollNo registrationNo"),
      Labroom.find({ isActive: true })
        .populate("teacher", "name email")
        .populate("tas", "name rollNo")
        .populate("students", "name rollNo registrationNo"),
      User.find({ role: "PENDING_TEACHER" }).select("-password"),
      User.find().select("-password")
    ]);

    dashboardData = { activeClassrooms, activeLabrooms, pendingTeachers, allUsers };
  }

  res.status(200).json({
    status: "success",
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      rollNo: user.rollNo,
      registrationNo: user.registrationNo,
      role: user.role,
      personalNotificationEmail: user.personalNotificationEmail,
      isUniversityEmailVerified: user.isUniversityEmailVerified,
      isEmailVerified: user.isEmailVerified,
    },
    dashboardData,
  });
});

// =============================================================================
// 5. FORGOT PASSWORD
// =============================================================================
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError("Please enter your email, roll number, or registration number!", 400));
  }

  const identifier = email.trim().toLowerCase();

  const user = await User.findOne({
    $or: [
      { email: identifier },
      { rollNo: identifier.toUpperCase() },
      { registrationNo: email.trim() },
      { personalNotificationEmail: identifier }
    ],
    isEmailVerified: true,
  });

  if (!user) {
    return next(new AppError("No verified account found with this identifier.", 404));
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const targetEmail = user.personalNotificationEmail || user.email;

  await sendStyledEmail({
    to: targetEmail,
    subject: "Password Recovery OTP",
    title: "Password Reset Request",
    bodyText: `Hello <strong>${user.name}</strong>, we received a request to reset your password. Use the secure verification boxes below. This code will expire in 10 minutes.`,
    otpCode: otp,
    details: [{ label: "Account Target", value: user.rollNo || user.registrationNo || user.email }],
  });

  user.otpCode = hashOtp(otp);
  user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: "success",
    message: `Password reset OTP code sent successfully to ${targetEmail}`,
  });
});

// =============================================================================
// 6. RESET PASSWORD WITH OTP
// =============================================================================
exports.resetPasswordWithOTP = catchAsync(async (req, res, next) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return next(new AppError("Identifier, OTP code, and new password are required!", 400));
  }

  if (newPassword.length < 6) {
    return next(new AppError("New password must be at least 6 characters long!", 400));
  }

  const identifier = email.trim().toLowerCase();

  const user = await User.findOne({
    $or: [
      { email: identifier },
      { rollNo: identifier.toUpperCase() },
      { registrationNo: email.trim() },
      { personalNotificationEmail: identifier }
    ],
    isEmailVerified: true,
    otpCode: hashOtp(otp),
    otpExpiresAt: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired OTP code!", 400));
  }

  user.password = newPassword;
  user.otpCode = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password reset successful! You can now log in with your new password.",
  });
});

// =============================================================================
// 7. UPDATE PASSWORD IN PROFILE
// =============================================================================
exports.updatePasswordInProfile = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError("Please provide both current and new passwords!", 400));
  }

  if (newPassword.length < 6) {
    return next(new AppError("New password must be at least 6 characters long!", 400));
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.correctPassword(currentPassword, user.password))) {
    return next(new AppError("Your current password is incorrect!", 401));
  }

  user.password = newPassword;
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password updated successfully!",
  });
});

// =============================================================================
// 8. UPDATE USER PROFILE (Allows upgrading temporary roll number to official roll number)
// =============================================================================
exports.updateProfile = catchAsync(async (req, res, next) => {
  const { name, password, personalNotificationEmail, rollNo, registrationNo } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) return next(new AppError("User not found.", 404));

  if (name) user.name = name.trim();
  if (password && password.trim().length >= 6) {
    user.password = password.trim();
  }

  if (rollNo && (TEMP_PREFIX_REGEX.test(user.rollNo) || user.rollNo.startsWith('FRESHER_') || user.rollNo.startsWith('TEMP_'))) {
    const newRoll = rollNo.trim().toUpperCase();
    if (FULL_ROLL_NO_REGEX.test(newRoll)) {
      user.rollNo = newRoll;
      if (!user.isUniversityEmailVerified) {
        user.email = `${newRoll.toLowerCase()}@pucit.edu.pk`;
      }
    }
  }

  if (registrationNo && REG_NO_REGEX.test(registrationNo)) {
    user.registrationNo = registrationNo.trim();
  }
  
  if (personalNotificationEmail !== undefined && !user.isUniversityEmailVerified) {
    user.personalNotificationEmail = personalNotificationEmail ? personalNotificationEmail.trim().toLowerCase() : null;
  }

  await user.save();

  if (user.role === 'STUDENT') {
    await syncStudentEnrollment(user);
  }

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully!",
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        personalNotificationEmail: user.personalNotificationEmail,
        role: user.role,
        rollNo: user.rollNo,
        registrationNo: user.registrationNo,
        isUniversityEmailVerified: user.isUniversityEmailVerified,
      },
    },
  });
});

// =============================================================================
// 9. REQUEST OFFICIAL EMAIL ACTIVATION OTP
// =============================================================================
exports.requestOfficialEmailActivation = catchAsync(async (req, res, next) => {
  const { universityEmail } = req.body;
  const user = await User.findById(req.user._id);

  const targetEmail = (universityEmail || `${user.rollNo || ''}@pucit.edu.pk`).trim().toLowerCase();

  if (!targetEmail.endsWith('@pucit.edu.pk') || !FULL_ROLL_NO_REGEX.test(user.rollNo)) {
    return next(new AppError("A valid official roll number and @pucit.edu.pk email address are required.", 400));
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await sendStyledEmail({
    to: targetEmail,
    subject: "Official Inbox Activation OTP",
    title: "Activate Official University Inbox",
    bodyText: `Hello <strong>${user.name}</strong>, your official university inbox is now accessible. Use the secure verification code boxes below to link and lock your account permanently.`,
    otpCode: otp,
    details: [{ label: "Official Email", value: targetEmail }],
  });

  user.otpCode = hashOtp(otp);
  user.otpExpiresAt = Date.now() + 10 * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: "success",
    message: `Activation OTP sent successfully to your official inbox (${targetEmail}).`,
  });
});

// =============================================================================
// 10. VERIFY OFFICIAL EMAIL ACTIVATION OTP
// =============================================================================
exports.verifyOfficialEmailActivation = catchAsync(async (req, res, next) => {
  const { universityEmail, otp } = req.body;

  if (!otp) {
    return next(new AppError("OTP code is required!", 400));
  }

  const user = await User.findById(req.user._id);

  if (
    !user.otpCode ||
    user.otpCode !== hashOtp(otp.trim()) ||
    user.otpExpiresAt < Date.now()
  ) {
    return next(new AppError("Invalid or expired OTP code!", 400));
  }

  if (universityEmail) {
    user.email = universityEmail.trim().toLowerCase();
  }

  user.isUniversityEmailVerified = true;
  user.personalNotificationEmail = null;
  user.otpCode = undefined;
  user.otpExpiresAt = undefined;
  await user.save();

  user.password = undefined;

  res.status(200).json({
    status: "success",
    message: "Official university email successfully activated and verified!",
    data: { user },
  });
});

// =============================================================================
// 11. EMERGENCY STAFF PASSWORD RESET
// =============================================================================
exports.resetStudentPasswordByStaff = catchAsync(async (req, res, next) => {
  const targetId = req.body.studentId || req.body.userId;
  const { newPassword } = req.body;

  if (!targetId || !newPassword) {
    return next(new AppError("Student ID and new password are required!", 400));
  }

  if (newPassword.length < 6) {
    return next(new AppError("Password must be at least 6 characters long!", 400));
  }

  const student = await User.findById(targetId);
  if (!student || student.role !== "STUDENT") {
    return next(new AppError("Student record not found!", 404));
  }

  student.password = newPassword;
  await student.save();

  res.status(200).json({
    status: "success",
    message: `Password for ${student.name} (${student.rollNo || student.registrationNo}) updated successfully!`,
  });
});

// =============================================================================
// 12. ADMIN: GET PENDING TEACHERS
// =============================================================================
exports.getPendingTeachers = catchAsync(async (req, res, next) => {
  const pendingTeachers = await User.find({ role: "PENDING_TEACHER" }).select("-password");
  res.status(200).json({
    status: "success",
    results: pendingTeachers.length,
    data: { teachers: pendingTeachers, pendingTeachers },
  });
});

// =============================================================================
// 13. ADMIN: APPROVE PENDING TEACHER
// =============================================================================
exports.approvePendingTeacher = catchAsync(async (req, res, next) => {
  const userId = req.params.id || req.body.userId;
  const user = await User.findById(userId);

  if (!user) return next(new AppError("User account not found.", 404));
  if (user.role !== "PENDING_TEACHER") {
    return next(new AppError("User is not in a pending teacher state.", 400));
  }

  user.role = "TEACHER";
  await user.save();

  if (user.email && !user.email.includes('@temp.pucit.edu.pk')) {
    await sendStyledEmail({
      to: user.email,
      subject: "Teacher Account Approved",
      title: "Teacher Account Approved",
      bodyText: `Hello <strong>${user.name}</strong>, your teacher account registration has been <span style="color: #10b981; font-weight: 600;">approved</span> by the Administrator. You can now log in and manage your classrooms and labs.`,
      details: [
        { label: "Account Name", value: user.name },
        { label: "Assigned Role", value: "TEACHER" },
        { label: "Approved By", value: `${req.user.name} (Admin)` },
      ],
    });
  }

  res.status(200).json({
    status: "success",
    message: `Teacher ${user.name} has been approved successfully!`,
    data: { user },
  });
});

// =============================================================================
// 14. ADMIN: REJECT PENDING TEACHER
// =============================================================================
exports.rejectTeacher = catchAsync(async (req, res, next) => {
  const userId = req.params.id || req.body.userId;
  const user = await User.findById(userId);

  if (!user) {
    return next(new AppError("Teacher registration request not found.", 404));
  }

  const teacherEmail = user.email;
  const teacherName = user.name;

  if (teacherEmail && !teacherEmail.includes('@temp.pucit.edu.pk')) {
    try {
      await sendStyledEmail({
        to: teacherEmail,
        subject: "Teacher Account Request Status",
        title: "Registration Request Update",
        bodyText: `Hello <strong>${teacherName}</strong>,<br><br>We regret to inform you that your teacher account registration request for the PUCIT Portal has been <span style="color: #e11d48; font-weight: 600;">declined</span> at this time.<br><br>If you believe this is an error or need further assistance with your credentials, please feel free to contact the administrator, <strong>Shehzada Ather (IT F25 - Old Campus)</strong>.<br><br>Your registration profile has been reset. You may re-register on the portal with updated credentials whenever you are ready.`,
        details: [
          { label: "Status", value: '<span style="color: #e11d48; font-weight: 600;">Declined / Reset</span>' },
          { label: "Support Contact", value: "Shehzada Ather, IT F25 (Old Campus)" },
        ],
      });
    } catch (mailErr) {
      console.warn("Failed to send rejection email:", mailErr.message);
    }
  }

  await User.findByIdAndDelete(userId);

  res.status(200).json({
    status: "success",
    message: "Teacher registration request rejected, email notification sent, and database record cleared for re-registration.",
  });
});

// =============================================================================
// 15. ADMIN ANALYTICS & BREAKDOWNS (Optimized via Concurrent Promise.all)
// =============================================================================
exports.getAdminAnalytics = catchAsync(async (req, res, next) => {
  const [
    totalUsers,
    studentsCount,
    teachersCount,
    adminsCount,
    pendingTeachersCount,
    activeClassroomsCount,
    activeLabroomsCount
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "STUDENT" }),
    User.countDocuments({ role: "TEACHER" }),
    User.countDocuments({ role: "ADMIN" }),
    User.countDocuments({ role: "PENDING_TEACHER" }),
    Classroom.countDocuments({ isActive: true }),
    Labroom.countDocuments({ isActive: true })
  ]);

  res.status(200).json({
    status: "success",
    data: {
      totalUsers,
      totalClassrooms: activeClassroomsCount,
      totalLabrooms: activeLabroomsCount,
      userBreakdown: {
        totalUsers,
        students: studentsCount,
        teachers: teachersCount,
        admins: adminsCount,
        pendingTeachers: pendingTeachersCount
      },
      academicBreakdown: {
        activeClassrooms: activeClassroomsCount,
        activeLabrooms: activeLabroomsCount
      }
    }
  });
});

// =============================================================================
// 16. ADMIN: GET ALL USERS FOR ANALYTICS VAULT
// =============================================================================
exports.getAllUsersAdmin = catchAsync(async (req, res, next) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 }).lean();
  
  res.status(200).json({
    status: "success",
    count: users.length,
    data: {
      users
    }
  });
});

// =============================================================================
// 17. VERIFY PASSWORD RECOVERY OTP (Standalone step for 3-page flow)
// =============================================================================
exports.verifyRecoveryOtp = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError("Email and OTP code are required!", 400));
  }

  const identifier = email.trim().toLowerCase();
  const cleanOtp = otp.trim();

  const user = await User.findOne({
    $or: [
      { email: identifier },
      { rollNo: identifier.toUpperCase() },
      { registrationNo: email.trim() },
      { personalNotificationEmail: identifier }
    ],
    isEmailVerified: true,
    otpCode: hashOtp(cleanOtp),
    otpExpiresAt: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired OTP code!", 400));
  }

  res.status(200).json({
    status: "success",
    message: "OTP verified successfully. Please set your new password.",
  });
});

// =============================================================================
// 18. UPDATE FRESHER ROLL NUMBER (Upgrades temporary prefix to official roll no)
// =============================================================================
exports.updateFresherRollNo = catchAsync(async (req, res, next) => {
  const { rollNo } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError("User record not found.", 404));
  }

  const currentRoll = user.rollNo ? user.rollNo.toUpperCase() : "";
  const isTempOrFresher = TEMP_PREFIX_REGEX.test(currentRoll) || currentRoll.startsWith('FRESHER_') || currentRoll.startsWith('TEMP_');

  if (!isTempOrFresher && FULL_ROLL_NO_REGEX.test(currentRoll)) {
    return next(new AppError("You already have an official PUCIT Roll Number assigned.", 400));
  }

  const newRoll = rollNo ? rollNo.trim().toUpperCase() : "";

  if (!FULL_ROLL_NO_REGEX.test(newRoll)) {
    return next(new AppError("Please provide a valid official PUCIT Roll Number (e.g., BITF26A001).", 400));
  }

  const existingUserWithRoll = await User.findOne({ rollNo: newRoll, _id: { $ne: user._id } }).select('_id');
  if (existingUserWithRoll) {
    return next(new AppError("This Roll Number is already registered to another account.", 400));
  }

  user.rollNo = newRoll;
  if (!user.isUniversityEmailVerified) {
    user.email = `${newRoll.toLowerCase()}@temp.pucit.edu.pk`;
  }

  await user.save();

  if (user.role === 'STUDENT') {
    await syncStudentEnrollment(user);
  }

  res.status(200).json({
    status: "success",
    message: `Official Roll Number (${newRoll}) successfully claimed! You can now log in using this roll number. Next, you can link your official @pucit.edu.pk email when it becomes active.`,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        rollNo: user.rollNo,
        registrationNo: user.registrationNo,
        role: user.role,
        personalNotificationEmail: user.personalNotificationEmail,
        isUniversityEmailVerified: user.isUniversityEmailVerified,
      },
    },
  });
});

// =============================================================================
// 19. ADMIN USER DELETION CONTROL (Prevents self-deletion & notifies user via email)
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

  const recipientEmail = targetUser.personalNotificationEmail || (targetUser.email && !targetUser.email.includes('@temp.pucit.edu.pk') ? targetUser.email : null);

  if (recipientEmail) {
    try {
      await sendStyledEmail({
        to: recipientEmail,
        subject: "Account Termination Notice",
        title: "Account Removal Notification",
        bodyText: `Hello <strong>${targetUser.name}</strong>,<br><br>We are writing to inform you that your account on the PUCIT Classroom Portal has been <span style="color: #e11d48; font-weight: 600;">terminated / deleted</span> by the platform administrator.<br><br>If you believe this action was taken in error or require any assistance regarding your data or credentials, please reach out directly to the administrator, <strong>Shehzada Ather (IT F25 - Old Campus)</strong>.`,
        details: [
          { label: "Account Name", value: targetUser.name },
          { label: "Identifier / Roll No", value: targetUser.rollNo || targetUser.email },
          { label: "Support Contact", value: "Shehzada Ather, IT F25 (Old Campus)" },
        ],
      });
    } catch (mailErr) {
      console.warn("Failed to dispatch account deletion notice email:", mailErr.message);
    }
  }

  await User.findByIdAndDelete(userId);

  await Promise.all([
    Mark.deleteMany({ student: userId }),
    LabMark.deleteMany({ student: userId }),
    Classroom.updateMany(
      {},
      { $pull: { students: userId, tas: userId } }
    ),
    Labroom.updateMany(
      {},
      { $pull: { students: userId, tas: userId } }
    ),
    Classroom.updateMany(
      { teacher: userId },
      { $set: { teacher: null, placeholderTeacherName: 'Faculty / TBD' } }
    ),
    Labroom.updateMany(
      { teacher: userId },
      { $set: { teacher: null, placeholderTeacherName: 'Faculty / TBD' } }
    )
  ]);

  res.status(200).json({
    status: 'success',
    message: `User account ${targetUser.name} (${targetUser.email}) successfully deleted by admin and notification email sent.`,
  });
});