const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/userSchema');
const Classroom = require('../models/classRoomSchema');
const Labroom = require('../models/labSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');

// =============================================================================
// 1. PROTECT ROUTES (Ensures user is logged in with a valid JWT)
// =============================================================================
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Check for Bearer token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token || token === 'null' || token === 'undefined') {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // Safely verify JWT Token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired! Please log in again.', 401));
    }
    return next(new AppError('Invalid authentication token! Please log in again.', 401));
  }

  // Check if user still exists in database
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError('The user belonging to this token no longer exists.', 401)
    );
  }

  // Check if password was changed after token was issued (if method exists on schema)
  if (typeof currentUser.changedPasswordAfter === 'function' && currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // Restrict unapproved PENDING_TEACHER accounts
  if (
    currentUser.role === 'PENDING_TEACHER' &&
    !currentUser.isApprovedByAdmin
  ) {
    return next(
      new AppError(
        'Your teacher account is pending Admin approval. Access restricted.',
        403
      )
    );
  }

  // Attach user object to req for downstream controllers
  req.user = currentUser;
  next();
});

// =============================================================================
// 2. RESTRICT TO GLOBAL ROLES (e.g. 'ADMIN', 'TEACHER')
// =============================================================================
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action!', 403)
      );
    }
    next();
  };
};

// =============================================================================
// 3. RESTRICT TO CLASS STAFF (Context-Aware TA & Teacher Authorization)
// =============================================================================
exports.restrictToClassStaff = catchAsync(async (req, res, next) => {
  const user = req.user;

  // Admins and Teachers pass automatically
  if (['ADMIN', 'TEACHER'].includes(user.role)) {
    return next();
  }

  // Safely extract classroom ID from params, body (if present), or query strings
  const classroomId = 
    req.params.classroomId || 
    (req.body && (req.body.classroomId || req.body.classId || req.body.courseId || req.body.classroom)) || 
    req.query.classroomId || 
    req.query.classId;

  if (!classroomId || !mongoose.Types.ObjectId.isValid(classroomId)) {
    return next(new AppError('A valid Classroom ID is required to verify privileges.', 400));
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    return next(new AppError('Classroom not found.', 404));
  }

  // Safely handle both populated and unpopulated teacher fields
  const teacherId = classroom.teacher?._id || classroom.teacher;
  const isClassTeacher = teacherId && teacherId.toString() === user._id.toString();

  // Safely handle both populated and unpopulated TA arrays
  const isAssignedTa = classroom.tas && classroom.tas.some((ta) => {
    const taId = ta?._id || ta;
    return taId && taId.toString() === user._id.toString();
  });

  if (!isClassTeacher && !isAssignedTa) {
    return next(new AppError('You do not have staff or TA privileges for this classroom.', 403));
  }

  // Ensure req.body exists before assignment (prevents crashes on GET requests)
  if (!req.body) {
    req.body = {};
  }
  
  // Standardize req.body for downstream controllers
  req.body.classroomId = classroomId;
  next();
});

// =============================================================================
// 4. RESTRICT TO LAB STAFF (Context-Aware TA & Teacher Authorization for Labs)
// =============================================================================
exports.restrictToLabStaff = catchAsync(async (req, res, next) => {
  const user = req.user;

  // Admins and Teachers pass automatically
  if (['ADMIN', 'TEACHER'].includes(user.role)) {
    return next();
  }

  // Safely extract labroom ID from params, body, or query strings
  const labroomId = 
    req.params.labroomId || 
    (req.body && (req.body.labroomId || req.body.labId || req.body.courseId || req.body.lab)) || 
    req.query.labroomId || 
    req.query.labId;

  if (!labroomId || !mongoose.Types.ObjectId.isValid(labroomId)) {
    return next(new AppError('A valid Labroom ID is required to verify privileges.', 400));
  }

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) {
    return next(new AppError('Labroom not found.', 404));
  }

  // Safely handle both populated and unpopulated lab teacher fields
  const labTeacherId = labroom.teacher?._id || labroom.teacher;
  const isLabTeacher = labTeacherId && labTeacherId.toString() === user._id.toString();

  // Safely handle both populated and unpopulated lab TA arrays
  const isAssignedTa = labroom.tas && labroom.tas.some((ta) => {
    const taId = ta?._id || ta;
    return taId && taId.toString() === user._id.toString();
  });

  if (!isLabTeacher && !isAssignedTa) {
    return next(new AppError('You do not have staff or TA privileges for this labroom.', 403));
  }

  // Ensure req.body exists before assignment
  if (!req.body) {
    req.body = {};
  }
  
  // Standardize req.body for downstream controllers
  req.body.labroomId = labroomId;
  next();
});