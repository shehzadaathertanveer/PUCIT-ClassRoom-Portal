/**
 * One-off migration: stamp `isGraded` onto Labroom mark rows written before that
 * field existed.
 *
 * Why this is needed
 * -----------------
 * `obtainedMarks` defaults to 0, so "never graded" and "graded zero" used to be
 * indistinguishable. The UI therefore guessed from the value and rewrote every
 * legitimate 0 as -99 (ungraded) on reload. LabItemScoreSchema now carries an
 * explicit `isGraded` flag, but rows already in MongoDB have no such field and
 * Mongoose reports them as undefined - which the UI reads as "ungraded". Without
 * this backfill, every pre-existing Labroom grade would appear blank until a
 * teacher happened to re-save it.
 *
 * What it does
 * ------------
 * Sets isGraded: true on rows that hold unambiguous evidence of grading:
 *   - a non-zero obtainedMarks
 *   - isAbsent
 *   - isBypassed
 *
 * A legacy row sitting at exactly 0 is deliberately left untouched. The
 * single-student save path clamps -99 through Math.max(0, ...), so an old
 * "ungraded" row and an old "genuine zero" are indistinguishable. Guessing
 * "graded" there would count a mark the teacher never assigned and could fail
 * the student; leaving it unset keeps the UI on the safer ungraded reading.
 *
 * Safe to re-run: it only adds a field to rows that do not already have it, and
 * never modifies marks, totals, or any other field.
 *
 * Usage:
 *   node scripts/backfillLabMarkGradedState.js            # report only
 *   node scripts/backfillLabMarkGradedState.js --apply    # write changes
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', 'config', 'config.env'), override: false });

const CATEGORIES = [
  'labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments',
  'presentations', 'finalProject', 'labMids', 'labFinals',
  'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'
];

// Rows that already carry the flag are left alone, so re-running is harmless.
const NEEDS_BACKFILL = { $exists: false };
const HAS_EVIDENCE = {
  $or: [
    { obtainedMarks: { $gt: 0 } },
    { isAbsent: true },
    { isBypassed: true }
  ]
};

const perCategoryUpdates = () =>
  CATEGORIES.reduce((acc, category) => {
    const filter = { [category]: { $elemMatch: { isGraded: NEEDS_BACKFILL, ...HAS_EVIDENCE } } };
    const update = {
      $set: { [`${category}.$[item].isGraded`]: true }
    };
    acc[category] = { filter, update };
    return acc;
  }, {});

const run = async () => {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set; cannot run the backfill.');

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('labmarks');

  const plans = perCategoryUpdates();
  let totalMatched = 0;

  for (const [category, { filter, update }] of Object.entries(plans)) {
    const matched = await collection.countDocuments(filter);
    totalMatched += matched;
    if (matched === 0) continue;

    console.log(`  ${category}: ${matched} row(s)${apply ? ' -> setting isGraded: true' : ' (dry run)'}`);
    if (apply) {
      await collection.updateMany(filter, update, { arrayFilters: [{ 'item.isGraded': NEEDS_BACKFILL }] });
    }
  }

  console.log(`\n${apply ? 'Backfilled' : 'Would backfill'} ${totalMatched} lab mark row(s).`);
  if (!apply && totalMatched > 0) {
    console.log('This was a dry run. Re-run with --apply to write the changes.');
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Lab mark graded-state backfill failed:', err.message);
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});