const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "User name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    rollNo: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
    },
    registrationNo: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER", "ADMIN", "PENDING_TEACHER", "TA"],
      default: "STUDENT",
    },
    personalNotificationEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    requiresEmail: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    isUniversityEmailVerified: {
      type: Boolean,
      default: false,
    },
    otpCode: {
      type: String,
      select: false,
    },
    otpExpiresAt: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model("User", userSchema);
