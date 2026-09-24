const mongoose = require("mongoose");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const User = require("../models/userSchema");
const PendingRegistration = require("../models/pendingRegistrationSchema");
const PlatformSetting = require("../models/platformSettingSchema");

const Classroom = require("../models/classRoomSchema");
const Labroom = require("../models/labSchema");
const Mark = require("../models/markSchema");
const LabMark = require("../models/labMarkSchema");
const catchAsync = require("../utils/catchAsyncError");
const AppError = require("../utils/appError");
const sendStyledEmail = require("../utils/emailService");
const { getEmailQuotaStatus, updateEmailQuotaConfig, resetEmailQuotaCounter } = require("../utils/emailService");

// In-memory maintenance flag object
let systemMaintenance = {
  isUnderMaintenance: false,
  message: "Portal is currently undergoing scheduled maintenance. Please try again later.",
  retryAfter: "15 minutes"
};

// RegEx to validate official PUCIT roll number structures or temporary fresher prefixes.
// Flexible to support all format variants: BSEF23M030, BITF26A001, BSFS23M030,
// BSSEF23S020, BSES23M030, BCSF26M030, etc. (B + dept letters + F/S + batch + sec + digits).
const FULL_ROLL_NO_REGEX = /^[A-Z]{1,8}[FS]\d{2,4}[A-Z]{1,4}\d{2,4}$/i;
const TEMP_PREFIX_REGEX = /^[A-Z]{1,8}[FS]\d{2,4}[A-Z]{0,4}$/i;
const REG_NO_REGEX = /^[a-zA-Z0-9-]{6,15}$/;

// Current fresher batch segment (e.g. "F26" in BITF26A004). Personal email
// registration is ONLY allowed for students who belong to this batch.
const FRESHER_BATCH_CODE = (process.env.VITE_FRESHER_BATCH || 'f26').trim().toUpperCase();

// Official inbox suffix of PUCIT. Used to prevent the official email from ever
// being registered as a "personal notification email".
const PUCIT_EMAIL_RE = /@pucit\.edu\.pk$/i;

// Helper: Generates signed JWT authentication token
const signToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Helper: SHA-256 OTP hashing for secure database storage
const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

// Helper: Admin-controlled fresher prefix registration mode (persisted, default ON)
const getFresherRegistrationMode = async () => {
  const doc = await PlatformSetting.findOne({ key: "fresherRegistrationEnabled" }).lean();
  return doc && doc.value !== undefined ? Boolean(doc.value) : true;
};

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
exports.checkMaintenanceMode = catchAsync(async (req, res, next) => {
  if (!systemMaintenance.isUnderMaintenance) {
    return next();
  }

  if (
    req.path.includes('/maintenance') ||
    req.path.includes('/auth/login') ||
    req.path.includes('/auth/me')
  ) {
    return next();
  }

  // Allow ADMINS through during maintenance. The request's own JWT is verified
  // here because the global protect() middleware hasn't run yet at this point.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer')
    ? authHeader.split(' ')[1]
    : null;

  if (token && token !== 'null' && token !== 'undefined') {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user && user.role === 'ADMIN') {
        req.user = user;
        return next();
      }
    } catch (err) {
      // Invalid, expired, or tampered token: fall through and keep blocking.
    }
  }

  return res.status(503).json({
    status: "maintenance",
    message: systemMaintenance.message,
    retryAfter: systemMaintenance.retryAfter,
    isUnderMaintenance: true
  });
});

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
// SYSTEM FRESHER REGISTRATION MODE (Public read / Admin toggle)
// =============================================================================
exports.getRegistrationMode = catchAsync(async (req, res, next) => {
  const fresherRegistrationEnabled = await getFresherRegistrationMode();

  res.status(200).json({
    status: "success",
    data: { fresherRegistrationEnabled }
  });
});

exports.toggleRegistrationMode = catchAsync(async (req, res, next) => {
  const { fresherRegistrationEnabled } = req.body;

  if (typeof fresherRegistrationEnabled !== "boolean") {
    return next(new AppError("fresherRegistrationEnabled must be a boolean!", 400));
  }

  await PlatformSetting.findOneAndUpdate(
    { key: "fresherRegistrationEnabled" },
    { value: fresherRegistrationEnabled, updatedBy: req.user._id },
    { upsert: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    status: "success",
    message: `Fresher prefix registration is now ${fresherRegistrationEnabled ? 'ENABLED' : 'DISABLED'}.`,
    data: { fresherRegistrationEnabled }
  });
});

// =============================================================================
// EMAIL QUOTA STATUS (Admin dashboard box)
// =============================================================================
exports.getEmailQuota = catchAsync(async (req, res, next) => {
  const emailQuota = await getEmailQuotaStatus();

  res.status(200).json({
    status: "success",
    data: { emailQuota }
  });
});

// =============================================================================
// EMAIL QUOTA CONFIG (Admin — set the daily hard cap and OTP-only reserve live)
// =============================================================================
exports.updateEmailQuota = catchAsync(async (req, res, next) => {
  const { dailyQuota, otpReserveThreshold, importantThreshold } = req.body;

  let emailQuota;
  try {
    emailQuota = await updateEmailQuotaConfig({ dailyQuota, otpReserveThreshold, importantThreshold });
  } catch (err) {
    return next(new AppError(err.message, 400));
  }

  res.status(200).json({
    status: "success",
    data: { emailQuota }
  });
});

// =============================================================================
// EMAIL QUOTA RESET (Admin — zero the daily counter immediately, e.g. when OTPs
// are needed before 05:11; count still resumes for the rest of the day)
// =============================================================================
exports.resetEmailQuota = catchAsync(async (req, res, next) => {
  const emailQuota = await resetEmailQuotaCounter();

  res.status(200).json({
    status: "success",
    data: { emailQuota }
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

  const emailPrefix = cleanEmail ? cleanEmail.split('@')[0].toUpperCase() : "";
  const isPucitEmail = Boolean(cleanEmail && cleanEmail.endsWith('@pucit.edu.pk'));
  const looksLikeStudentRoll =
    FULL_ROLL_NO_REGEX.test(formattedRollNo) ||
    TEMP_PREFIX_REGEX.test(formattedRollNo) ||
    formattedRollNo.startsWith('TEMP_');

  // TEACHER DETECTION
  // (a) Email-driven registration whose prefix is NOT a student roll/prefix AND
  //     uses an official @pucit.edu.pk email → Teacher.
  //     Personal / non-university emails (gmail, outlook, etc.) can NEVER create
  //     teacher accounts — students were able to bypass this by typing any email.
  // (b) Students who type a real roll number/section-prefix are never misrouted,
  //     even if their @pucit.edu.pk email prefix matches a student format (e.g. BITF26A001).
  if (cleanEmail && !looksLikeStudentRoll && isPucitEmail) {
    const emailPrefixLooksLikeStudent =
      FULL_ROLL_NO_REGEX.test(emailPrefix) || TEMP_PREFIX_REGEX.test(emailPrefix);

    if (!emailPrefixLooksLikeStudent) {
      assignedRole = "PENDING_TEACHER";
      formattedRollNo = formattedRollNo || emailPrefix;
    }
  } else if (!formattedRollNo && formattedRegNo) {
    formattedRollNo = `TEMP_${formattedRegNo}`;
  }

  // Explicitly block non-university emails from creating teacher accounts.
  if (cleanEmail && !isPucitEmail && !formattedRollNo && !formattedRegNo) {
    return next(new AppError("Teacher registration requires an official @pucit.edu.pk email address (e.g., name@pucit.edu.pk). Students must register using their Roll Number or Section Prefix.", 400));
  }

  // (c) Derive the roll number from the official university email prefix when no
  //     field was typed (e.g. bsef23m030@pucit.edu.pk -> BSEF23M030).
  if (assignedRole === "STUDENT" && !formattedRollNo && FULL_ROLL_NO_REGEX.test(emailPrefix)) {
    formattedRollNo = emailPrefix;
  }

  const isValidStudentFormat = 
    FULL_ROLL_NO_REGEX.test(formattedRollNo) || 
    TEMP_PREFIX_REGEX.test(formattedRollNo) || 
    formattedRollNo.startsWith('TEMP_');

  if (assignedRole === "STUDENT" && !isValidStudentFormat) {
    return next(new AppError("A valid Roll Number or Temporary Prefix is required for student registration!", 400));
  }

  if (formattedRegNo && !REG_NO_REGEX.test(formattedRegNo)) {
    return next(new AppError("Registration number must be a valid unique number!", 400));
  }

  // Admin fresher-registration toggle + fresher identity flags.
  const fresherRegistrationEnabled = await getFresherRegistrationMode();

  const isPrefixOnly =
    TEMP_PREFIX_REGEX.test(formattedRollNo) && !FULL_ROLL_NO_REGEX.test(formattedRollNo);

  const isFresherRoll =
    isPrefixOnly ||
    (FULL_ROLL_NO_REGEX.test(formattedRollNo) &&
      formattedRollNo.includes(FRESHER_BATCH_CODE));

  // When the admin DISABLED fresher mode, prefix-only entries are rejected and
  // every student must register with a full roll number (senior-style). The
  // form must never let a bare prefix through while the toggle is OFF.
  if (assignedRole === "STUDENT" && !fresherRegistrationEnabled && isPrefixOnly) {
    return next(new AppError("Fresher prefix-only registration is currently disabled by the administrator. Please register using your full Roll Number (e.g., BITF26A004).", 400));
  }

  // Personal notification emails are a FRESHER-ONLY bypass and can only be used
  // while the admin has fresher mode ENABLED:
  //   1. Personal email submitted but mode OFF                  -> reject
  //   2. Personal email submitted by a NON-fresher (senior)     -> reject
  //   3. Official @pucit.edu.pk inbox used as the personal email -> reject
  if (assignedRole === "STUDENT" && cleanPersonalEmail) {
    if (!fresherRegistrationEnabled) {
      return next(new AppError("Personal email registration is currently disabled by the administrator. You must register with your full Roll Number and verify your official @pucit.edu.pk inbox.", 400));
    }
    if (!isFresherRoll) {
      return next(new AppError("Personal email registration is only available to freshers. Senior students must verify their official @pucit.edu.pk email using their full Roll Number.", 400));
    }
    if (PUCIT_EMAIL_RE.test(cleanPersonalEmail)) {
      return next(new AppError("You cannot use your official @pucit.edu.pk email as the personal notification email. Please provide a personal (non-university) email address.", 400));
    }
  }

  // Freshers with the personal-email route ENABLED always need a personal inbox.
  if (
    assignedRole === "STUDENT" &&
    isFresherRoll &&
    fresherRegistrationEnabled &&
    !cleanPersonalEmail
  ) {
    return next(new AppError("A personal notification email is required for fresher registration. Please provide your personal (non-university) email address.", 400));
  }

  // A student's OFFICIAL email is derived from their roll number and can never
  // be changed by the client. Only prefix-only freshers keep a temporary inbox
  // until they upgrade their roll number / link their real email later.
  const officialEmail =
    assignedRole === "STUDENT"
      ? FULL_ROLL_NO_REGEX.test(formattedRollNo)
        ? `${formattedRollNo.toLowerCase()}@pucit.edu.pk`
        : `${formattedRegNo || Math.random().toString(36).substring(7)}@temp.pucit.edu.pk`
      : cleanEmail;

  if (formattedRegNo) {
    const existingRegHolder = await User.findOne({ registrationNo: formattedRegNo, isEmailVerified: true }).select('_id');
    if (existingRegHolder) {
      return next(new AppError("This Registration / Form Number is already linked to an active account.", 400));
    }
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = hashOtp(otp);
  const otpExpiry = Date.now() + 10 * 60 * 1000;

  // The verification OTP is sent to the personal inbox ONLY for enabled-mode
  // freshers. Everyone else verifies through their official email, so senior
  // students can never bypass official-email verification with a side inbox.
  const destinationEmail =
    assignedRole === "STUDENT" && isFresherRoll && fresherRegistrationEnabled
      ? cleanPersonalEmail
      : officialEmail;

  if (!destinationEmail) {
    return next(new AppError("A personal notification email is required for registration when using temporary roll/registration numbers!", 400));
  }

  // An @temp.pucit.edu.pk address has NO real inbox — Gmail would silently
  // accept the message and it would never arrive, leaving the student waiting
  // forever. Block it with an actionable message instead of a phantom "sent".
  if (/@temp\.pucit\.edu\.pk$/i.test(destinationEmail)) {
    return next(new AppError("A temporary @temp.pucit.edu.pk address has no inbox, so no verification code can be delivered there. Enter your full Roll Number (e.g. BITF26A004) or provide a personal email address instead.", 400));
  }

  // DAILY EMAIL QUOTA GATE: when the daily sending limit is exhausted, block
  // new registrations instead of silently failing at the mail provider.
  const quota = await getEmailQuotaStatus();
  if (quota.remaining <= 0) {
    return next(new AppError("The daily email limit has been reached, so new registrations are paused. Please try again tomorrow.", 429));
  }

  const emailSent = await sendStyledEmail({
    to: destinationEmail,
    subject: "Account Registration OTP",
    title: "Complete Your Registration",
    bodyText: `Hello <strong>${name}</strong>, welcome to the PUCIT Classroom Portal. Use the secure verification code boxes below to activate your account.`,
    otpCode: otp,
    importance: "important",
    critical: true,
    details: [
      { label: "Assigned Roll / Prefix", value: formattedRollNo },
      { label: "Registration / Form No", value: formattedRegNo || "N/A" },
      { label: "Notification Email", value: destinationEmail }
    ],
  });

  if (!emailSent) {
    return next(new AppError("We could not send the verification code to your email right now. Please double-check your email address and try again in a moment.", 500));
  }

  // BLOCK if an already-VERIFIED account claims the same primary identity
  // (exact roll number or the same official email). Shared identifiers like a
  // personal notification email or registration number are NOT enough to block
  // a genuinely new student — matching ONLY those falls through to a fresh
  // pending record below.
  const verifiedConflict = await User.findOne({
    $or: [
      { email: officialEmail, isEmailVerified: true },
      ...(formattedRollNo && FULL_ROLL_NO_REGEX.test(formattedRollNo) ? [{ rollNo: formattedRollNo, isEmailVerified: true }] : [])
    ]
  }).select('_id role').lean();

  if (verifiedConflict) {
    if (verifiedConflict.role === "PENDING_TEACHER") {
      return next(new AppError("Your teacher account is pending Admin approval. Contact the administrator.", 400));
    }
    const linkedRole = verifiedConflict.role === "STUDENT"
      ? "a student"
      : verifiedConflict.role === "ADMIN"
      ? "an administrator"
      : verifiedConflict.role === "TEACHER"
      ? "a teacher"
      : verifiedConflict.role === "TA"
      ? "a teaching assistant"
      : "an active";
    return next(new AppError(`This email or roll number is already linked to ${linkedRole} account. Please log in, or use Forgot Password if you cannot remember your credentials.`, 400));
  }

  // Store the pending registration. Re-initiating overwrites the last attempt
  // (new OTP) so a stale record never blocks a fresh verification.
  let pending = await PendingRegistration.findOne({ destinationEmail }).select("+otpCode +otpExpiresAt");
  if (pending) {
    pending.name = name;
    pending.email = officialEmail;
    pending.rollNo = formattedRollNo;
    if (formattedRegNo) pending.registrationNo = formattedRegNo;
    pending.personalNotificationEmail = cleanPersonalEmail;
    pending.role = assignedRole;
    pending.password = password;
    pending.otpCode = hashedOtp;
    pending.otpExpiresAt = otpExpiry;
    await pending.save();
  } else {
    pending = await PendingRegistration.create({
      name,
      email: officialEmail,
      rollNo: formattedRollNo,
      registrationNo: formattedRegNo || undefined,
      password,
      role: assignedRole,
      personalNotificationEmail: cleanPersonalEmail,
      destinationEmail,
      otpCode: hashedOtp,
      otpExpiresAt: otpExpiry,
    });
  }

  // ONE attempt per identity: purge stale PendingRegistration records left over
  // from earlier attempts that share the same official email, full roll number,
  // registration number or delivery inbox. This guarantees the priority-ordered
  // OTP verification can never resolve to an outdated record carrying an old
  // code. (Prefix entries share a non-unique roll prefix, so only FULL roll
  // numbers are cleaned, never bare prefixes.)
  if (pending && pending._id) {
    await PendingRegistration.deleteMany({
      _id: { $ne: pending._id },
      $or: [
        { email: officialEmail },
        ...(formattedRollNo && FULL_ROLL_NO_REGEX.test(formattedRollNo) ? [{ rollNo: formattedRollNo }] : []),
        ...(formattedRegNo ? [{ registrationNo: formattedRegNo }] : []),
        { destinationEmail },
      ],
    });
  }

  res.status(200).json({
    status: "success",
    message: `Verification code sent to ${destinationEmail}. Please verify OTP to complete registration.`,
    email: officialEmail,
    verificationEmail: destinationEmail,
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

  // Priority-order lookup, NOT a single $or: when stale duplicate pending
  // records survive from earlier attempts (same roll/reg number, older OTP),
  // the $or version could resolve to an OUTDATED record and reject a perfectly
  // correct code. Look up the exact delivery address first, then the official
  // email, then the remaining aliases — the newest record for that address wins.
  let pending = await PendingRegistration.findOne({ destinationEmail: cleanEmail }).select("+otpCode +otpExpiresAt");
  if (!pending) {
    pending = await PendingRegistration.findOne({ email: cleanEmail }).select("+otpCode +otpExpiresAt");
  }
  if (!pending) {
    pending = await PendingRegistration.findOne({ personalNotificationEmail: cleanEmail }).select("+otpCode +otpExpiresAt");
  }
  if (!pending && FULL_ROLL_NO_REGEX.test(prefixFromEmail)) {
    pending = await PendingRegistration.findOne({ rollNo: prefixFromEmail }).select("+otpCode +otpExpiresAt");
  }
  if (!pending && REG_NO_REGEX.test(prefixFromEmail)) {
    pending = await PendingRegistration.findOne({ registrationNo: prefixFromEmail }).select("+otpCode +otpExpiresAt");
  }

  if (!pending) {
    console.warn(`[verifyRegistrationOTP] No pending registration found. Searched email="${cleanEmail}" prefix="${prefixFromEmail}"`);
    return next(new AppError("No pending registration found for this account. Please re-initiate registration.", 400));
  }

  if (!pending.otpCode || pending.otpCode !== hashedInputOtp) {
    console.warn(`[verifyRegistrationOTP] OTP mismatch. lookedUp="${cleanEmail}" pendingId="${pending._id}" pendingEmail="${pending.email}" pendingDest="${pending.destinationEmail}" pendingRoll="${pending.rollNo}"`);
    return next(new AppError("Invalid OTP code!", 400));
  }

  if (pending.otpExpiresAt && pending.otpExpiresAt < Date.now()) {
    return next(new AppError("OTP code has expired!", 400));
  }

  // CRITICAL SECURITY: whether the official inbox was proven is decided by the
  // address the OTP was actually DELIVERED to (pending.destinationEmail), NOT by
  // the identifier string used to look up the pending record. The frontend reuses
  // the account email as the lookup key, so checking `cleanEmail` here would
  // falsely mark a fresher as official-verified when they only verified a Gmail.
  const verifiedViaUniversityEmail =
    Boolean(pending.destinationEmail) && /@pucit\.edu\.pk$/i.test(pending.destinationEmail);

  // Final conflict re-check (a verified account may have appeared while the
  // user sat on the OTP screen).
  const finalConflict = await User.findOne({
    $or: [
      { email: pending.email, isEmailVerified: true },
      ...(pending.rollNo && FULL_ROLL_NO_REGEX.test(pending.rollNo) ? [{ rollNo: pending.rollNo, isEmailVerified: true }] : []),
      ...(pending.registrationNo ? [{ registrationNo: pending.registrationNo, isEmailVerified: true }] : [])
    ]
  }).select('_id role').lean();

  if (finalConflict) {
    return next(new AppError("This email or roll number is already registered. Please log in, or use Forgot Password if you cannot remember your credentials.", 400));
  }

  let finalRollNo = pending.rollNo || "";
  if (!finalRollNo && verifiedViaUniversityEmail && FULL_ROLL_NO_REGEX.test(prefixFromEmail)) {
    finalRollNo = prefixFromEmail;
  }

  // Create the real account ONLY after successful verification.
  const user = await User.create({
    name: pending.name,
    email: pending.email,
    rollNo: finalRollNo || undefined,
    registrationNo: pending.registrationNo || undefined,
    password: pending.password,
    role: pending.role,
    personalNotificationEmail: pending.personalNotificationEmail,
    requiresEmail: true,
    isEmailVerified: true,
    isUniversityEmailVerified: verifiedViaUniversityEmail,
  });

  // Remove any legacy unverified duplicates that carry the exact same identity
  // so stale admission attempts can never resurface as login failures.
  await User.deleteMany({
    role: { $in: ["STUDENT", "PENDING_TEACHER"] },
    isEmailVerified: false,
    _id: { $ne: user._id },
    $or: [
      { email: user.email },
      ...(user.rollNo ? [{ rollNo: user.rollNo }] : []),
      ...(user.registrationNo ? [{ registrationNo: user.registrationNo }] : [])
    ]
  });

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

  // The pending attempt has served its purpose.
  await PendingRegistration.deleteMany({ $or: [{ email: pending.email }, { destinationEmail: pending.destinationEmail }] });

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
      { registrationNo: identifier.toUpperCase() },
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
    const [activeClassrooms, activeLabrooms, pendingTeachers, allUsers, pendingRegistrations, emailQuota] = await Promise.all([
      Classroom.find({ isActive: true })
        .populate("teacher", "name email")
        .populate("tas", "name rollNo")
        .populate("students", "name rollNo registrationNo"),
      Labroom.find({ isActive: true })
        .populate("teacher", "name email")
        .populate("tas", "name rollNo")
        .populate("students", "name rollNo registrationNo"),
      User.find({ role: "PENDING_TEACHER" }).select("-password"),
      User.find().select("-password"),
      PendingRegistration.countDocuments(),
      getEmailQuotaStatus()
    ]);

    dashboardData = { activeClassrooms, activeLabrooms, pendingTeachers, pendingRegistrations, emailQuota, allUsers };
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
      { registrationNo: email.trim().toUpperCase() },
      { personalNotificationEmail: identifier }
    ],
  });

  if (!user) {
    console.warn(`[forgotPassword] No account found. Searched email/rollNo/regNo/personalNotificationEmail="${identifier}"`);
    return next(new AppError("No account found with this identifier.", 404));
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const targetEmail = user.personalNotificationEmail || user.email;

  // DAILY EMAIL QUOTA GATE: block password-recovery emails when the daily limit
  // is exhausted so users get a clear message instead of a silent mail failure.
  const quota = await getEmailQuotaStatus();
  if (quota.remaining <= 0) {
    return next(new AppError("The daily email limit has been reached, so password recovery is paused. Please try again tomorrow.", 429));
  }

  const emailSent = await sendStyledEmail({
    to: targetEmail,
    subject: "Password Recovery OTP",
    title: "Password Reset Request",
    bodyText: `Hello <strong>${user.name}</strong>, we received a request to reset your password. Use the secure verification boxes below. This code will expire in 10 minutes.`,
    otpCode: otp,
    importance: "important",
    critical: true,
    details: [{ label: "Account Target", value: user.rollNo || user.registrationNo || user.email }],
  });

  if (!emailSent) {
    return next(new AppError("We could not send the recovery code to your email right now. Please try again in a moment.", 500));
  }

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
      { registrationNo: email.trim().toUpperCase() },
      { personalNotificationEmail: identifier }
    ],
    otpCode: hashOtp(otp),
    otpExpiresAt: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError("Invalid or expired OTP code!", 400));
  }

  user.password = newPassword;
  user.isEmailVerified = true;
  user.requiresEmail = false;
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
  const { name, password, currentPassword, personalNotificationEmail, rollNo, registrationNo } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!user) return next(new AppError("User not found.", 404));

  if (name) user.name = name.trim();
  if (password && password.trim().length >= 6) {
    if (!currentPassword || !(await user.correctPassword(currentPassword, user.password))) {
      return next(new AppError("Current password is incorrect!", 401));
    }
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
    if (personalNotificationEmail && PUCIT_EMAIL_RE.test(personalNotificationEmail.trim().toLowerCase())) {
      return next(new AppError("You cannot use your official @pucit.edu.pk email as the personal notification email. Please provide a personal (non-university) email address.", 400));
    }
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

  if (!FULL_ROLL_NO_REGEX.test(user.rollNo)) {
    return next(new AppError("A valid official roll number is required.", 400));
  }

  // The official inbox is derived from the roll number and can NEVER be chosen
  // or changed by the user (security: keeps the official email unchangeable).
  const officialEmail = `${user.rollNo.toLowerCase()}@pucit.edu.pk`;

  if (universityEmail && universityEmail.trim().toLowerCase() !== officialEmail) {
    return next(new AppError("Your official university email is tied to your roll number and cannot be changed.", 400));
  }

  const targetEmail = officialEmail;

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const emailSent = await sendStyledEmail({
    to: targetEmail,
    subject: "Official Inbox Activation OTP",
    title: "Activate Official University Inbox",
    bodyText: `Hello <strong>${user.name}</strong>, your official university inbox is now accessible. Use the secure verification code boxes below to link and lock your account permanently.`,
    otpCode: otp,
    importance: "important",
    critical: true,
    details: [{ label: "Official Email", value: targetEmail }],
  });

  if (!emailSent) {
    return next(new AppError("We could not send the activation code to the specified email right now. Please try again in a moment.", 500));
  }

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
  const { otp } = req.body;

  if (!otp) {
    return next(new AppError("OTP code is required!", 400));
  }

  const user = await User.findById(req.user._id).select("+otpCode +otpExpiresAt");

  if (
    !user.otpCode ||
    user.otpCode !== hashOtp(otp.trim()) ||
    user.otpExpiresAt < Date.now()
  ) {
    return next(new AppError("Invalid or expired OTP code!", 400));
  }

  // Official email is always derived from the roll number (never client-editable).
  if (FULL_ROLL_NO_REGEX.test(user.rollNo)) {
    user.email = `${user.rollNo.toLowerCase()}@pucit.edu.pk`;
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
      importance: "important",
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

  if (user.role !== "PENDING_TEACHER") {
    return next(new AppError("Can only reject pending teacher registrations.", 400));
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
        importance: "important",
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
    activeLabroomsCount,
    pendingRegistrationsCount,
    emailQuota
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: "STUDENT" }),
    User.countDocuments({ role: "TEACHER" }),
    User.countDocuments({ role: "ADMIN" }),
    User.countDocuments({ role: "PENDING_TEACHER" }),
    Classroom.countDocuments({ isActive: true }),
    Labroom.countDocuments({ isActive: true }),
    PendingRegistration.countDocuments(),
    getEmailQuotaStatus()
  ]);

  res.status(200).json({
    status: "success",
    data: {
      totalUsers,
      totalClassrooms: activeClassroomsCount,
      totalLabrooms: activeLabroomsCount,
      pendingRegistrations: pendingRegistrationsCount,
      emailQuota,
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
      { registrationNo: email.trim().toUpperCase() },
      { personalNotificationEmail: identifier }
    ],
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
        importance: "important",
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
    ),
    Classroom.updateMany(
      { taRollNumbers: targetUser.rollNo },
      { $pull: { taRollNumbers: targetUser.rollNo, approvedRollNumbers: targetUser.rollNo } }
    ),
    Labroom.updateMany(
      { taRollNumbers: targetUser.rollNo },
      { $pull: { taRollNumbers: targetUser.rollNo, approvedRollNumbers: targetUser.rollNo } }
    )
  ]);

  res.status(200).json({
    status: 'success',
    message: `User account ${targetUser.name} (${targetUser.email}) successfully deleted by admin and notification email sent.`,
  });
});

// =============================================================================
// 20. ADMIN: CLEAN UP STALE UNVERIFIED REGISTRATION ATTEMPTS
// SAFE VERSION: Only removes STUDENT / PENDING_TEACHER registrations that were
// created more than 24 hours ago, never completed OTP verification, AND still
// carry temporary temp emails. Admin, teacher, verified, and recent accounts
// are ALWAYS protected from this cleanup.
// =============================================================================
exports.cleanupUnverifiedRegistrations = catchAsync(async (req, res, next) => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const staleFilter = {
    role: { $in: ["STUDENT", "PENDING_TEACHER"] },
    requiresEmail: true,
    isEmailVerified: false,
    createdAt: { $lt: cutoff },
    $or: [
      { email: /@temp\.pucit\.edu\.pk$/ },
      { rollNo: /^(TEMP_|FRESHER_)/ },
    ],
  };

  const staleRecords = await User.find(staleFilter)
    .select("name email rollNo registrationNo role createdAt")
    .lean();

  const deleted = staleRecords.length
    ? await User.deleteMany({ _id: { $in: staleRecords.map((r) => r._id) } })
    : { deletedCount: 0 };

  // Also drop expired/stale pending registration attempts (older than 24h).
  const stalePending = await PendingRegistration.deleteMany({ createdAt: { $lt: cutoff } });

  res.status(200).json({
    status: "success",
    message: `Cleaned up ${deleted.deletedCount} stale unverified registration record(s) and ${stalePending.deletedCount} pending registration attempt(s) older than 24 hours. Admins, teachers, verified and recent accounts were NOT touched.`,
    data: { deletedCount: deleted.deletedCount, deletedRecords: staleRecords, pendingRemoved: stalePending.deletedCount },
  });
});

// =============================================================================
// 21. STUDENT EMAIL / ROLL NUMBER INTEGRITY REPAIR
//
// The former registration flaw let students set their own official
// @pucit.edu.pk inbox as their "personal notification email" and verify it with
// OTP, which bypassed official-email verification. This repairs the database:
//
//   SCOPE: STUDENTS ONLY (admin / teacher / TA accounts are never touched).
//
//   A) FLAW-GROUP STUDENTS (personalNotificationEmail ends in @pucit.edu.pk)
//      - If the personal email exactly equals their roll-derived official email
//        (rollno@pucit.edu.pk) AND the account completed OTP verification, it is
//        promoted to the main email, the personal email is cleared, and the
//        university email is marked verified.
//      - Otherwise (different official inbox / unverified / email owned by
//        another account) -> registered through the flaw -> student is deleted.
//
//   B) DUPLICATE ROLL NUMBERS (the same full roll number held by several
//      students): keep the verified holder and delete unverified duplicates.
//      If two VERIFIED students claim the same roll number, never auto-delete;
//      list them for the admin instead.
//
// Pass { dryRun: true } to preview every action without touching the database.
// =============================================================================
const purgeStudent = async (user) => {
  await Promise.all([
    Mark.deleteMany({ student: user._id }),
    LabMark.deleteMany({ student: user._id }),
    Classroom.updateMany({}, { $pull: { students: user._id, tas: user._id } }),
    Labroom.updateMany({}, { $pull: { students: user._id, tas: user._id } }),
    Classroom.updateMany(
      { taRollNumbers: user.rollNo },
      { $pull: { taRollNumbers: user.rollNo, approvedRollNumbers: user.rollNo } }
    ),
    Labroom.updateMany(
      { taRollNumbers: user.rollNo },
      { $pull: { taRollNumbers: user.rollNo, approvedRollNumbers: user.rollNo } }
    ),
  ]);
  await User.findByIdAndDelete(user._id);
};

const deriveOfficialEmail = (rollNo) =>
  rollNo && FULL_ROLL_NO_REGEX.test(rollNo)
    ? `${String(rollNo).toLowerCase()}@pucit.edu.pk`
    : null;

const fixStudentEmailIntegrity = async ({ dryRun = false } = {}) => {
  const report = {
    scannedStudents: 0,
    promoted: [],
    deletedFlawGroup: [],
    duplicateRolls: [],
    conflicts: [],
  };

  // ---- Phase A: flaw-group students whose personal email is @pucit.edu.pk ----
  const flawGroup = await User.find({
    role: "STUDENT",
    personalNotificationEmail: PUCIT_EMAIL_RE,
  })
    .select("-password")
    .lean();

  report.scannedStudents += flawGroup.length;

  for (const student of flawGroup) {
    const personal = student.personalNotificationEmail.toLowerCase();
    const rollOfficial = deriveOfficialEmail(student.rollNo);

    const emailConflict = await User.findOne({
      _id: { $ne: student._id },
      email: personal,
      isEmailVerified: true,
    })
      .select("_id")
      .lean();

    const identityMatch =
      !emailConflict &&
      Boolean(rollOfficial) &&
      rollOfficial === personal &&
      student.isEmailVerified;

    if (identityMatch) {
      if (!dryRun) {
        const setFields = {
          email: personal,
          personalNotificationEmail: null,
          isUniversityEmailVerified: true,
        };
        if (!student.rollNo) {
          const prefix = personal.split("@")[0].toUpperCase();
          if (FULL_ROLL_NO_REGEX.test(prefix)) setFields.rollNo = prefix;
        }
        await User.updateOne({ _id: student._id }, { $set: setFields });
      }
      report.promoted.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: personal,
      });
      continue;
    }

    // Personal email was an official inbox that is NOT their own roll inbox, or
    // OTP verification never completed. They registered through the flaw.
    if (dryRun) {
      report.deletedFlawGroup.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: personal,
      });
    } else {
      await purgeStudent(student);
      report.deletedFlawGroup.push({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: personal,
        action: "deleted",
      });
    }
  }

  // ---- Phase B: duplicate full roll numbers among students ----
  const fullRollStudents = await User.find({
    role: "STUDENT",
    rollNo: { $exists: true, $ne: "" },
  })
    .select("-password")
    .lean();

  const byRoll = {};
  for (const s of fullRollStudents) {
    if (!s.rollNo || !FULL_ROLL_NO_REGEX.test(s.rollNo)) continue;
    const key = s.rollNo.toUpperCase();
    (byRoll[key] = byRoll[key] || []).push(s);
  }

  for (const [roll, holders] of Object.entries(byRoll)) {
    if (holders.length < 2) continue;

    const verified = holders.filter((h) => h.isEmailVerified || h.isUniversityEmailVerified);
    const unverified = holders.filter((h) => !h.isEmailVerified && !h.isUniversityEmailVerified);

    if (verified.length >= 2) {
      report.conflicts.push({
        rollNo: roll,
        holders: verified.map((h) => ({ _id: h._id, name: h.name, email: h.email })),
      });
      continue;
    }

    const keep =
      verified[0] ||
      holders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

    const duplicates = holders.filter((h) => h._id.toString() !== keep._id.toString());

    for (const dup of duplicates) {
      const entry = {
        rollNo: roll,
        deleted: { _id: dup._id, name: dup.name, email: dup.email },
        kept: { _id: keep._id },
      };
      if (!dryRun) {
        await purgeStudent(dup);
        entry.deleted.action = "deleted";
      }
      report.duplicateRolls.push(entry);
    }
  }

  return report;
};

exports.fixStudentEmailIntegrity = fixStudentEmailIntegrity;

// =============================================================================
// 22. ADMIN: TRIGGER THE STUDENT EMAIL / ROLL INTEGRITY REPAIR
// Accepts an optional { dryRun } flag to preview without committing changes.
// =============================================================================
exports.runStudentEmailIntegrityFix = catchAsync(async (req, res, next) => {
  const dryRun = Boolean(req.body?.dryRun);
  const report = await fixStudentEmailIntegrity({ dryRun });

  res.status(200).json({
    status: "success",
    message: dryRun
      ? "DRY RUN complete — no records were modified. Review the report, then re-run without dryRun to commit."
      : `Student email/roll integrity repaired: ${report.promoted.length} promoted, ${report.deletedFlawGroup.length} flaw-group removed, ${report.duplicateRolls.length} duplicate roll(s) removed, ${report.conflicts.length} verified roll conflict(s) flagged.`,
    data: { dryRun, report },
  });
});