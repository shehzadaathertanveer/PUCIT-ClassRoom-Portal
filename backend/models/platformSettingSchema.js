const mongoose = require("mongoose");

// Durable key/value store for platform-wide flags and counters (survives
// server restarts). Used for the admin fresher-registration toggle and the
// daily email quota counter.
const platformSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSetting", platformSettingSchema);