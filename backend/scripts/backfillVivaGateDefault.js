/**
 * One-off migration: stamp the viva gate as explicitly OFF on every activity and
 * mark row that predates the per-activity viva multiplier.
 *
 * Why this is needed
 * -----------------
 * `hasViva` defaults to false in the schemas, so Mongoose already reports a
 * missing field as false and every legacy row already behaves as "no viva".
 * This script exists to make that state EXPLICIT in MongoDB rather than implied,
 * for three reasons:
 *
 *  1. Queries. A document with no `hasViva` key and a document with
 *     `hasViva: false` are different to MongoDB - `{ hasViva: false }` does not
 *     match the first. Anything that later needs to ask "which activities have a
 *     viva on?" would silently skip every legacy activity.
 *  2. Reporting. Dumping a room's activities and showing a blank instead of "No"
 *     for an activity that genuinely has no viva is indistinguishable from a
 *     migration that half-ran.
 *  3. Defence in depth. The code path that matters (effectiveMarks) treats a
 *     missing gate as off regardless, so this is belt-and-braces, not the thing
 *     preventing data loss.
 *
 * What it does
 * ------------
 * Writes `hasViva: false` onto:
 *   - classroom activity definitions (quizzes ... specialMarks) and the
 *     mids / finals / finalProject subdocuments
 *   - labroom activity definitions (every lab category)
 *   - classroom mark rows (standard arrays, customActivities items, and the
 *     mids / finals / finalProject subdocuments)
 *   - labroom mark rows (every lab category)
 *
 * It never touches `obtainedMarks`, `totalMarks`, `vivaMarks` or any other field.
 * `vivaMarks` is deliberately left absent on legacy rows: null means "no viva
 * recorded", which is what effectiveMarks falls back from, and it is how a
 * freshly viva-gated activity looks before a teacher scores anything.
 *
 * Safe to re-run: every write targets rows where `hasViva` does NOT already
 * exist, so a second run matches nothing.
 *
 * Usage:
 *   node scripts/backfillVivaGateDefault.js            # report only
 *   node scripts/backfillVivaGateDefault.js --apply    # write changes
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', 'config', 'config.env'), override: false });

// Multiple-entry activity arrays.
const CLASSROOM_ARRAYS = [
  'quizzes', 'assignments', 'presentations', 'projects', 'homework',
  'classActivities', 'classParticipation', 'vivas', 'specialMarks'
];
const LAB_ARRAYS = [
  'labTasks', 'labTests', 'quizzes', 'assignments', 'presentations', 'vivas',
  'projects', 'homework', 'classParticipation', 'specialMarks', 'finalProject',
  'labMids', 'labFinals', 'labActivities', 'labBehavior', 'labWorksheets',
  'troubleshooting'
];
// Strictly single-entry exams, stored as a subdocument rather than an array.
const SINGLE_EXAMS = ['mids', 'finals', 'finalProject'];

// Only rows with no key at all are touched, which is what makes re-runs no-ops.
const MISSING = { $exists: false };

const arrayPlan = (collection, arrays) =>
  arrays.reduce((acc, field) => {
    acc[field] = {
      filter: { [field]: { $elemMatch: { hasViva: MISSING } } },
      update: { $set: { [`${field}.$[item].hasViva`]: false } },
      arrayFilters: [{ 'item.hasViva': MISSING }]
    };
    return acc;
  }, {});

// A single-entry subdoc is an object, so it needs its own dotted-path plan
// rather than the positional-operator one used for arrays.
const singleExamPlan = (field) => ({
  filter: { [`${field}.hasViva`]: MISSING, [field]: { $ne: null } },
  update: { $set: { [`${field}.hasViva`]: false } }
});

const runPlan = async (collectionName, label, plan, apply) => {
  const collection = mongoose.connection.collection(collectionName);
  let totalMatched = 0;

  for (const [field, { filter, update, arrayFilters }] of Object.entries(plan)) {
    const matched = await collection.countDocuments(filter);
    if (matched === 0) continue;
    totalMatched += matched;
    console.log(`  ${label}.${field}: ${matched} document(s)${apply ? ' -> hasViva: false' : ' (dry run)'}`);
    if (apply) {
      await collection.updateMany(filter, update, arrayFilters ? { arrayFilters } : undefined);
    }
  }

  return totalMatched;
};

const run = async () => {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set; cannot run the migration.');

  await mongoose.connect(uri);

  // customActivities is a nested array of category objects each holding their own
  // `items`, so it needs a two-level positional filter.
  const customFilter = {
    customActivities: { $elemMatch: { items: { $elemMatch: { hasViva: MISSING } } } }
  };
  const customUpdate = { $set: { 'customActivities.$[cat].items.$[item].hasViva': false } };
  const customArrayFilters = [{ 'cat.items.hasViva': MISSING }, { 'item.hasViva': MISSING }];

  let grandTotal = 0;

  const classroomDefs = { ...arrayPlan('classrooms', CLASSROOM_ARRAYS) };
  SINGLE_EXAMS.forEach((f) => { classroomDefs[f] = singleExamPlan(f); });
  grandTotal += await runPlan('classrooms', 'classroom activity', classroomDefs, apply);

  grandTotal += await runPlan('labrooms', 'labroom activity', arrayPlan('labrooms', LAB_ARRAYS), apply);

  const markRows = { ...arrayPlan('marks', CLASSROOM_ARRAYS) };
  SINGLE_EXAMS.forEach((f) => { markRows[f] = singleExamPlan(f); });
  grandTotal += await runPlan('marks', 'classroom mark row', markRows, apply);

  grandTotal += await runPlan('labmarks', 'lab mark row', arrayPlan('labmarks', LAB_ARRAYS), apply);

  const customCollection = mongoose.connection.collection('marks');
  const customMatched = await customCollection.countDocuments(customFilter);
  if (customMatched > 0) {
    grandTotal += customMatched;
    console.log(`  marks.customActivities items: ${customMatched} document(s)${apply ? ' -> hasViva: false' : ' (dry run)'}`);
    if (apply) {
      await customCollection.updateMany(customFilter, customUpdate, { arrayFilters: customArrayFilters });
    }
  }

  console.log(`\n${apply ? 'Stamped' : 'Would stamp'} ${grandTotal} document(s) with hasViva: false.`);
  if (!apply && grandTotal > 0) {
    console.log('This was a dry run. Re-run with --apply to write the changes.');
  }
  if (apply) {
    console.log('Grades are unchanged: every one of these activities already scored as no-viva.');
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Viva gate migration failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});