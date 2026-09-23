const mongoose = require("mongoose");

// Temporary record that holds a registration attempt until the user proves the
// email they provided actually belongs to them. No User document is created
// until verifyRegistrationOTP succeeds, so abandoned attempts can never pile
// up as duplicate users that break login.
const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    rollNo: { type: String, trim: true, uppercase: true, default: "" },
    registrationNo: { type: String, trim: true, uppercase: true, default: "" },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["STUDENT", "PENDING_TEACHER", "TA"],
      default: "STUDENT",
    },
    personalNotificationEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    destinationEmail: { type: String, required: true, lowercase: true, trim: true },
    otpCode: { type: String, select: false },
    otpExpiresAt: { type: Date },
  },
  { timestamps: true }
);

pendingRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
pendingRegistrationSchema.index({ destinationEmail: 1 });
pendingRegistrationSchema.index({ email: 1 });

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema);