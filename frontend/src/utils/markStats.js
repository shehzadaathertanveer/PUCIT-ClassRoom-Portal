/**
 * Generic class-wide score statistics for any graded entity - one activity item,
 * one exam, a whole category or a derived component percentage.
 *
 * The room pages already compute a class average by walking `rankings[].marksDoc`.
 * This module does the same walk once and returns the min, max and average in the
 * same pass, so every readout (sessional activities, mids, finals, lab tasks,
 * lab mids/finals, overall components) describes the same set of marks. All
 * figures use effectiveMarks, so a viva-gated score is reported after its viva
 * multiplier exactly like the stored grade and the existing class average.
 */

import { effectiveMarks } from './viva';

// batch-submit writes -99 for a row the teacher left blank. Such a row is not a
// real score and must not become the class minimum.
const UNGRADED = -99;

const round = (value) => Number((Number(value) || 0).toFixed(2));

const isGraded = (entry) => {
  if (!entry || entry.isBypassed) return false;
  if (entry.isAbsent === true) return true;
  if (entry.obtainedMarks === undefined || entry.obtainedMarks === null || entry.obtainedMarks === '') return false;
  const raw = Number(entry.obtainedMarks);
  return Number.isFinite(raw) && raw !== UNGRADED;
};

const scoreOf = (entry) => (entry && entry.isAbsent === true ? 0 : effectiveMarks(entry));

const entriesOf = (doc, key) => {
  const value = doc && doc[key];
  if (Array.isArray(value)) return value;
  return value && value.title ? [value] : [];
};

const docsOf = (rankings, fallbackDocs) =>
  rankings && rankings.length > 0 ? rankings : (fallbackDocs || []);

/** Min / max / average of any list of numbers. */
export const summarizeScores = (scores) => {
  const values = (scores || [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (values.length === 0) return { min: 0, max: 0, average: 0, count: 0 };
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    average: round(sum / values.length),
    count: values.length
  };
};

/** Marks and percentage views of one score list against a shared total. */
const buildStats = (scores, total) => {
  const totalMarks = Number(total) > 0 ? Number(total) : 0;
  const marks = summarizeScores(scores);
  const percentages = summarizeScores(
    scores.map((score) => (totalMarks > 0 ? (score / totalMarks) * 100 : 0))
  );
  return {
    count: marks.count,
    total: round(totalMarks),
    min: { marks: marks.min, pct: percentages.min },
    max: { marks: marks.max, pct: percentages.max },
    average: { marks: marks.average, pct: percentages.average }
  };
};

/** One titled item inside an array category (Quiz 1, Assignment 2, ...). */
export const getItemMarkStats = (rankings, key, title, fallbackDocs) => {
  const wanted = String(title || '').trim().toLowerCase();
  const scores = [];
  let total = 0;
  docsOf(rankings, fallbackDocs).forEach((row) => {
    const doc = (row && row.marksDoc) || row || {};
    const match = entriesOf(doc, key)
      .find((entry) => String(entry && entry.title || '').trim().toLowerCase() === wanted);
    if (!isGraded(match)) return;
    scores.push(scoreOf(match));
    if (Number(match.totalMarks) > 0) total = Number(match.totalMarks);
  });
  return buildStats(scores, total);
};

/** A single object category: classroom mids / finals / finalProject. */
export const getExamMarkStats = (rankings, key) => {
  const scores = [];
  let total = 0;
  docsOf(rankings).forEach((row) => {
    const doc = (row && row.marksDoc) || row || {};
    const exam = doc[key] || (row && row[key]);
    if (!isGraded(exam) || !(Number(exam.totalMarks) > 0)) return;
    scores.push(scoreOf(exam));
    total = Number(exam.totalMarks);
  });
  return buildStats(scores, total);
};

/** A whole category (array of items, or a single exam object). */
export const getCategoryMarkStats = (rankings, key) => {
  const scores = [];
  let total = 0;
  docsOf(rankings).forEach((row) => {
    const doc = (row && row.marksDoc) || row || {};
    const entries = entriesOf(doc, key);
    const graded = entries.filter(isGraded);
    if (graded.length === 0) return;
    scores.push(graded.reduce((sum, entry) => sum + scoreOf(entry), 0));
    const studentTotal = graded.reduce(
      (sum, entry) => sum + (Number(entry.totalMarks) || 0), 0
    );
    total = Math.max(total, studentTotal);
  });
  return buildStats(scores, total);
};

/** Min / max / average of a derived component column on the ranking rows. */
export const getComponentStats = (rankings, field) =>
  summarizeScores((rankings || []).map((row) => Number(row && row[field] || 0)));
