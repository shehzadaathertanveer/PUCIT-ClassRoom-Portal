const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  url: { type: String, default: '' },
  public_id: { type: String, default: '' },
  fileType: { type: String, default: '' },
  fileName: { type: String, default: '' },
  size: { type: Number, default: 0 },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  file: { type: fileSchema, default: () => ({}) },
  submittedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  marks: { type: Number, default: null },
  gradedAt: { type: Date, default: null },
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: true });

const assignmentSchema = new mongoose.Schema({
  roomType: { type: String, enum: ['CLASSROOM', 'LABROOM'], required: true, index: true },
  room: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  categoryKey: { type: String, required: true },
  evaluationItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  instructionsFile: { type: fileSchema, default: () => ({}) },
  totalMarks: { type: Number, required: true, min: 1 },
  dueAt: { type: Date, required: true, index: true },
  allowedTypes: { type: [String], default: ['pdf', 'zip'] },
  maxSize: { type: Number, required: true, min: 1, default: 10 },
  maxSizeUnit: { type: String, enum: ['B', 'KB', 'MB', 'GB'], default: 'KB' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reminderSentTo: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  submissions: { type: [submissionSchema], default: [] },
}, { timestamps: true });

assignmentSchema.index({ roomType: 1, room: 1, categoryKey: 1, title: 1 }, { unique: true });
assignmentSchema.index({ dueAt: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
