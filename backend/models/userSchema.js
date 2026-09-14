const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const FULL_ROLL_NO_REGEX = /^[A-Z]{2,5}[FS]\d{2}[A-Z]\d{3}$/i;
const TEMP_PREFIX_REGEX = /^[A-Z]{2,5}[FS]\d{2}[A-Z]?$/i; // Supports temporary fresher prefixes like BITF26A or BITF26

const isValidRollNo = (rollNo) => FULL_ROLL_NO_REGEX.test(rollNo) || TEMP_PREFIX_REGEX.test(rollNo);

const isValidPucitEmail = (email, role, rollNo) => {
  if (!email || role === 'ADMIN') return true;
  
  // Allow temporary placeholder emails for freshers before official inbox verification
  if (email.endsWith('@temp.pucit.edu.pk')) return true;

  if (!email.endsWith('@pucit.edu.pk')) return false;

  if (role === 'STUDENT' && rollNo && FULL_ROLL_NO_REGEX.test(rollNo)) {
    return email.toLowerCase() === `${rollNo.toLowerCase()}@pucit.edu.pk`;
  }
  return true;
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    // Unique 6-7 digit form/registration number for freshers before official roll number is issued
    registrationNo: {
      type: String,
      trim: true,
    },
    rollNo: {
      type: String,
      trim: true,
      uppercase: true,
      required: function () {
        return this.role === 'STUDENT' || this.role === 'TA';
      },
      validate: {
        validator: function (val) {
          const currentRole = this.role || this.get('role');
          if (['TEACHER', 'PENDING_TEACHER', 'ADMIN'].includes(currentRole)) return true;
          return isValidRollNo(val);
        },
        message: 'Invalid Roll Number format or Prefix! Example: BITF26A001 or temporary prefix BITF26A',
      },
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      required: function () {
        return this.role === 'ADMIN' || this.requiresEmail || (this.rollNo && FULL_ROLL_NO_REGEX.test(this.rollNo));
      },
      validate: {
        validator: function (val) {
          const currentRole = this.role || this.get('role');
          const currentRoll = this.rollNo || this.get('rollNo');
          return isValidPucitEmail(val, currentRole, currentRoll);
        },
        message: 'Email must be a valid @pucit.edu.pk address matching your Roll Number!',
      },
    },
    // Freshie personal fallback email for instant notifications before official inbox access
    personalNotificationEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      validate: {
        validator: function (val) {
          if (!val) return true;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        },
        message: 'Please provide a valid personal email address.',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    role: {
      type: String,
      enum: ['ADMIN', 'TEACHER', 'PENDING_TEACHER', 'TA', 'STUDENT'],
      default: 'STUDENT',
    },
    isApprovedByAdmin: {
      type: Boolean,
      default: true,
    },
    requiresEmail: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false, // True once initial account creation OTP is verified
    },
    isUniversityEmailVerified: {
      type: Boolean,
      default: false, // True ONLY once official @pucit.edu.pk inbox OTP is verified
    },
    otpCode: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Performance & Constraint Indexes
userSchema.index({ rollNo: 1 }, { unique: true, sparse: true });
userSchema.index({ registrationNo: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ personalNotificationEmail: 1 }, { sparse: true });

// Pre-Save Hook
userSchema.pre('save', async function () {
  if (this.email && this.email.endsWith('@pucit.edu.pk') && this.role !== 'ADMIN') {
    const emailPrefix = this.email.split('@')[0];
    const isStudent = FULL_ROLL_NO_REGEX.test(emailPrefix) || FULL_ROLL_NO_REGEX.test(this.rollNo);

    if (!isStudent && !['TEACHER', 'TA'].includes(this.role)) {
      this.role = 'PENDING_TEACHER';
      this.isApprovedByAdmin = false;
    }
  }

  // Automatically assign official PUCIT email format only if a full official roll number is present and not a temporary fresher email
  if (!this.email && this.rollNo && FULL_ROLL_NO_REGEX.test(this.rollNo)) {
    this.email = `${this.rollNo.toLowerCase()}@pucit.edu.pk`;
  }

  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare Password Instance Method
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model('User', userSchema);