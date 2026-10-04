const Mark = require('../models/markSchema');
const Classroom = require('../models/classRoomSchema');
const User = require('../models/userSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService'); // Centralized email utility with IPv4 Render fix & dark theme layout
const { createBypassRules, BYPASS_SENTINEL, UNGRADED_SENTINEL } = require('../utils/bypassRules');
const { computeSessionalBreakdown } = require('../utils/sessionalWeights');
const { getGradeAndGpa } = require('../utils/gradeScale');

const STANDARD_CATEGORIES = [
  'quizzes', 
  'assignments', 
  'presentations', 
  'projects', 
  'homework', 
  'classActivities', 
  'classParticipation', 
  'vivas', 
  'specialMarks', 
  'mids', 
  'finals', 
  'finalProject'
];

// Helper: Normalize Schema Target Keys Safely (Mapped to Fixed University Categories)
const getNormalizedTargetKey = (rawType = '') => {
  const raw = String(rawType || '').trim();

  // Already a canonical schema key (e.g. "classActivities", "mids"). Return it
  // untouched so this resolver is idempotent. Bypass limits are WRITTEN with
  // this function and READ back with it, so a lossy round trip would silently
  // drop the teacher's setting and leave bypassing permanently disabled.
  if (STANDARD_CATEGORIES.includes(raw)) return raw;

  const clean = raw.toLowerCase();
  if (STANDARD_CATEGORIES.includes(clean)) return clean;

  // Idempotency guard for already-normalised keys that are NOT in
  // STANDARD_CATEGORIES. Without this, "labReports" falls through to the
  // dynamic fallback below and becomes "labreports", so a cap the UI saved was
  // read back under a different key and silently appeared unset. The UI always
  // sends the key it received, so every resolver output must survive a second
  // pass unchanged.
  const dynamicFallback = (input) => {
    const camel = input
      .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, '');
    return camel.endsWith('s') ? camel : camel + 's';
  };
  // Checked against the ORIGINAL string, not the lowercased one: lowercasing
  // first would flatten "labReports" to "labreports", which no longer compares
  // equal and would re-enter the fallback below as a different key.
  if (dynamicFallback(raw) === raw) return raw;

  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('present')) return 'presentations';
  if (clean.includes('final project')) return 'finalProject';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('homework')) return 'homework';
  if (clean.includes('class activ')) return 'classActivities';
  if (clean.includes('particip')) return 'classParticipation';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('special')) return 'specialMarks';
  if (clean === 'mids' || clean === 'midterm') return 'mids';
  if (clean === 'finals' || clean === 'final') return 'finals';
  
  // Dynamic normalization fallback for safety
  return dynamicFallback(clean);
};

// Helper: Normalizes singular/plural category inputs from frontend UI variants
const CATEGORY_MAP = {
  quiz: 'quizzes',
  quizzes: 'quizzes',
  assignment: 'assignments',
  assignments: 'assignments',
  presentation: 'presentations',
  presentations: 'presentations',
  project: 'projects',
  projects: 'projects',
  'final project': 'finalProject',
  finalproject: 'finalProject',
  homework: 'homework',
  'class activity': 'classActivities',
  classactivity: 'classActivities',
  classactivities: 'classActivities',
  'class participation': 'classParticipation',
  classparticipation: 'classParticipation',
  viva: 'vivas',
  vivas: 'vivas',
  'special marks': 'specialMarks',
  specialmarks: 'specialMarks',
  mids: 'mids',
  midterm: 'mids',
  finals: 'finals',
  final: 'finals',
};

// Helper: Extract numbers safely for sorting (e.g., BITF25A012 -> 12)
const getRollDigits = (rollNo = '') => {
  const digits = rollNo.replace(/\D/g, '');
  if (!digits) return 99999;
  return parseInt(digits.slice(-3), 10);
};

// Helper: Safely normalize Cloudinary file payload
const parseCloudinaryFile = (item = {}) => {
  const fileSource = item.file || item;
  if (fileSource && typeof fileSource === 'object' && (fileSource.url || fileSource.secure_url || fileSource.fileUrl)) {
    return {
      url: fileSource.url || fileSource.secure_url || fileSource.fileUrl || '',
      public_id: fileSource.public_id || '',
      fileType: fileSource.fileType || fileSource.format || '',
      fileName: fileSource.fileName || fileSource.original_filename || '',
    };
  }
  if (typeof item.fileUrl === 'string' && item.fileUrl.trim() !== '') {
    return { url: item.fileUrl, public_id: '', fileType: '', fileName: '' };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Bypass ("B") support
// ---------------------------------------------------------------------------
// Limits are enforced server side (see utils/bypassRules) so a TA cannot exceed
// a cap by calling the API directly.
const SINGLE_ENTRY_KEYS = ['mids', 'finals', 'finalProject'];

// getItems knows where each category actually lives on a Mark doc. Custom
// (teacher-defined) activities are nested under customActivities[].items rather
// than being a top-level array, so they need matching on categoryName - without
// this their bypasses were never counted and the limit never applied.
const getClassroomCategoryItems = (markDoc, targetCategory) => {
  if (SINGLE_ENTRY_KEYS.includes(targetCategory)) {
    return markDoc[targetCategory] ? [markDoc[targetCategory]] : [];
  }
  if (Array.isArray(markDoc[targetCategory])) return markDoc[targetCategory];

  const wanted = String(targetCategory || '').trim().toLowerCase();
  const customCat = (markDoc.customActivities || []).find((c) => {
    const name = String(c && c.categoryName ? c.categoryName : '').trim().toLowerCase();
    return name === wanted || getNormalizedTargetKey(name) === targetCategory;
  });
  return customCat && Array.isArray(customCat.items) ? customCat.items : [];
};

// How many graded activities a category holds. mids/finals/finalProject are single
// objects; everything else is an array. Used to clamp bypass limits so a student
// can never bypass every activity in a category.
const countCategorySlots = (room, categoryKey) => {
  if (!room) return 0;
  const SINGLE = ['mids', 'finals', 'finalProject'];
  if (SINGLE.includes(categoryKey)) {
    return room[categoryKey] && room[categoryKey].title ? 1 : 0;
  }
  return Array.isArray(room[categoryKey]) ? room[categoryKey].length : 0;
};

const { canBypass } = createBypassRules({
  resolveKey: (catName = '') => getNormalizedTargetKey(String(catName || '')),
  getItems: getClassroomCategoryItems,
  getSlotCount: countCategorySlots
});

/**
 * How many activities this classroom actually holds in each category.
 *
 * The bypass panel used to render a box for every category the schema supports,
 * which buried the real ones under a wall of empty inputs for categories the
 * teacher never uses. Reporting the live counts lets the UI show exactly the
 * categories present in THIS room, and it is recomputed on every fetch so the list
 * follows the room's activities as they are added or removed.
 *
 * Standard keys are counted from the room document. Classroom is also the room
 * type that can hold teacher-defined categories (stored under customActivities
 * in the mark docs), so a sessional entry that resolves to a non-standard key is
 * counted too. Labroom is deliberately excluded: its mark schema has no custom
 * bucket, and its resolver folds unknown names into labTasks, so counting them
 * here would double-count lab tasks and expose that collision in the UI.
 */
const buildClassroomActivityCounts = (classroom) => {
  const counts = {};
  for (const key of STANDARD_CATEGORIES) {
    counts[key] = countCategorySlots(classroom, key);
  }

  for (const act of classroom?.sessionalActivities || []) {
    const label = typeof act === 'string' ? act : act?.category || act?.categoryName || '';
    if (!label) continue;
    // A sessional entry is a weight allocation, so it only counts when marks are
    // actually allocated to it.
    const allocated = Number(typeof act === 'object' ? act.allocatedMarks : 0) || 0;
    if (allocated <= 0) continue;

    const key = getNormalizedTargetKey(String(label));
    if (STANDARD_CATEGORIES.includes(key)) continue; // already counted above
    counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
};

// =============================================================================
// 1. GET BULK SHEET FOR ADDING MARKS (FIXED TO INCLUDE CUSTOM ACTIVITIES)
// =============================================================================
exports.getBulkMarkSheet = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', 'name rollNo email personalNotificationEmail')
    .lean();

  if (!classroom) {
    return next(new AppError('Active classroom not found!', 404));
  }

  const prefix = classroom.sectionPrefix.toUpperCase();
  const regular = [];
  const addDrop = [];

  (classroom.students || []).forEach((student) => {
    const roll = student.rollNo ? student.rollNo.toUpperCase() : '';
    if (roll.startsWith(prefix)) {
      regular.push(student);
    } else {
      addDrop.push(student);
    }
  });

  regular.sort((a, b) => getRollDigits(a.rollNo) - getRollDigits(b.rollNo));
  addDrop.sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || ''));

  const sortedStudents = [...regular, ...addDrop];
  const studentIds = sortedStudents.map((s) => s._id);

  const existingMarks = await Mark.find({
    classroom: classroomId,
    student: { $in: studentIds },
  }).lean();

  res.status(200).json({
    status: 'success',
    data: {
      classroom: {
        _id: classroom._id,
        className: classroom.className,
        sectionPrefix: classroom.sectionPrefix,
        quizzes: classroom.quizzes,
        assignments: classroom.assignments,
        presentations: classroom.presentations,
        projects: classroom.projects,
        homework: classroom.homework,
        classActivities: classroom.classActivities,
        classParticipation: classroom.classParticipation,
        vivas: classroom.vivas,
        specialMarks: classroom.specialMarks,
        mids: classroom.mids,
        finals: classroom.finals,
        finalProject: classroom.finalProject,
        sessionalActivities: classroom.sessionalActivities,
        customActivities: classroom.customActivities || [] // <--- CRITICAL FIX INCLUDED
      },
      students: sortedStudents,
      existingMarks,
    },
  });
});

// =============================================================================
// 1.1 GET UNASSIGNED STUDENTS FOR A SPECIFIC EVALUATION ITEM
// =============================================================================
exports.getUnassignedStudents = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, title } = req.query;

  if (!category || !title) {
    return next(new AppError('Valid category and item title are required!', 400));
  }

  const cleanCategory = category.trim().toLowerCase();
  const resolvedCategory = CATEGORY_MAP[cleanCategory] || getNormalizedTargetKey(cleanCategory);
  const isStandard = STANDARD_CATEGORIES.includes(resolvedCategory);

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', 'name rollNo email personalNotificationEmail')
    .lean();

  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const allStudents = classroom.students || [];
  const studentIds = allStudents.map(s => s._id);

  const markDocs = await Mark.find({
    classroom: classroomId,
    student: { $in: studentIds }
  }).lean();

  const gradedStudentIds = new Set();
  const cleanTitle = title.trim().toLowerCase();

  markDocs.forEach(doc => {
    if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
      if (doc[resolvedCategory] && doc[resolvedCategory].totalMarks > 0) {
        gradedStudentIds.add(doc.student.toString());
      }
    } else if (isStandard) {
      const itemsList = doc[resolvedCategory] || [];
      const found = itemsList.find(item => item.title && item.title.trim().toLowerCase() === cleanTitle);
      if (found) {
        gradedStudentIds.add(doc.student.toString());
      }
    } else if (Array.isArray(doc.customActivities)) {
      doc.customActivities.forEach(cat => {
        if (cat.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
            cat.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()) {
          const found = (cat.items || []).find(i => i.title?.trim().toLowerCase() === cleanTitle);
          if (found) gradedStudentIds.add(doc.student.toString());
        }
      });
    }
  });

  const unassignedStudents = allStudents.filter(s => !gradedStudentIds.has(s._id.toString()));

  res.status(200).json({
    status: 'success',
    results: unassignedStudents.length,
    data: { unassignedStudents }
  });
});

// =============================================================================
// 1.2 GET PENDING GRADING ACTIVITIES
// =============================================================================
exports.getPendingGradingActivities = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', '_id')
    .lean();

  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const totalStudentsCount = (classroom.students || []).length;
  if (totalStudentsCount === 0) {
    return res.status(200).json({ status: 'success', data: { pendingActivities: [] } });
  }

  const markDocs = await Mark.find({ classroom: classroomId }).lean();
  const gradedCountMap = {};

  const trackingCategories = [
    'quizzes', 'assignments', 'presentations', 'projects', 
    'homework', 'classActivities', 'classParticipation', 'vivas', 'specialMarks'
  ];

  markDocs.forEach(doc => {
    const studentId = doc.student.toString();
    trackingCategories.forEach(cat => {
      if (Array.isArray(doc[cat])) {
        doc[cat].forEach(item => {
          if (item.title && item.totalMarks > 0) {
            const key = `${cat}:${item.title.trim().toLowerCase()}`;
            if (!gradedCountMap[key]) gradedCountMap[key] = new Set();
            gradedCountMap[key].add(studentId);
          }
        });
      }
    });

    if (Array.isArray(doc.customActivities)) {
      doc.customActivities.forEach(cat => {
        if (Array.isArray(cat.items)) {
          cat.items.forEach(item => {
            if (item.title && item.totalMarks > 0) {
              const key = `${cat.categoryName.trim().toLowerCase()}:${item.title.trim().toLowerCase()}`;
              if (!gradedCountMap[key]) gradedCountMap[key] = new Set();
              gradedCountMap[key].add(studentId);
            }
          });
        }
      });
    }
  });

  const pendingActivities = [];
  const checkListCategories = [
    { key: 'quizzes', items: classroom.quizzes || [] },
    { key: 'assignments', items: classroom.assignments || [] },
    { key: 'presentations', items: classroom.presentations || [] },
    { key: 'projects', items: classroom.projects || [] },
    { key: 'homework', items: classroom.homework || [] },
    { key: 'classActivities', items: classroom.classActivities || [] },
    { key: 'classParticipation', items: classroom.classParticipation || [] },
    { key: 'vivas', items: classroom.vivas || [] },
    { key: 'specialMarks', items: classroom.specialMarks || [] }
  ];

  checkListCategories.forEach(catGroup => {
    catGroup.items.forEach(item => {
      const title = item.title;
      const key = `${catGroup.key}:${title.trim().toLowerCase()}`;
      const gradedSet = gradedCountMap[key] || new Set();
      const remainingCount = totalStudentsCount - gradedSet.size;

      if (remainingCount > 0) {
        pendingActivities.push({
          category: catGroup.key,
          title,
          totalStudents: totalStudentsCount,
          gradedCount: gradedSet.size,
          remainingCount
        });
      }
    });
  });

  if (Array.isArray(classroom.customActivities)) {
    classroom.customActivities.forEach(customCat => {
      const catName = customCat.categoryName;
      if (Array.isArray(customCat.items)) {
        customCat.items.forEach(item => {
          const title = item.title;
          const key = `${catName.trim().toLowerCase()}:${title.trim().toLowerCase()}`;
          const gradedSet = gradedCountMap[key] || new Set();
          const remainingCount = totalStudentsCount - gradedSet.size;

          if (remainingCount > 0) {
            pendingActivities.push({
              category: catName,
              title,
              totalStudents: totalStudentsCount,
              gradedCount: gradedSet.size,
              remainingCount
            });
          }
        });
      }
    });
  }

  res.status(200).json({
    status: 'success',
    data: { pendingActivities }
  });
});

exports.getPendingActivities = exports.getPendingGradingActivities;

// =============================================================================
// 1.3 GET CLASSROOM ANALYTICS, CLASS AVERAGES & PERFORMANCE TIERS
// =============================================================================
exports.getClassAnalytics = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;

  const classroom = await Classroom.findOne({ _id: classroomId, isActive: true })
    .populate('students', '_id rollNo name')
    .lean();

  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const markDocs = await Mark.find({ classroom: classroomId }).lean();
  const activeStudents = classroom.students || [];
  const activeStudentIds = new Set(activeStudents.map(s => s._id.toString()));

  const markMap = new Map();
  markDocs.forEach(doc => {
    if (doc.student && activeStudentIds.has(doc.student.toString())) {
      markMap.set(doc.student.toString(), doc);
    }
  });

  let sumSessional = 0, sumMids = 0, sumFinals = 0, sumOverall = 0;
  let sessionalCount = 0, midsCount = 0, finalsCount = 0, overallCount = 0;
let sumGradePoints = 0, gradePointCount = 0;

  const tiers = { excellent: 0, good: 0, average: 0, needsImprovement: 0 };
  const gradingScheme = classroom.gradingScheme || { sessionalWeight: 25, midsWeight: 35, finalsWeight: 40 };

  const rankings = activeStudents.map(st => {
    const studentIdStr = st._id.toString();
    const doc = markMap.get(studentIdStr) || { 
      quizzes: [], 
      assignments: [], 
      presentations: [],
      projects: [],
      homework: [],
      classActivities: [],
      classParticipation: [],
      vivas: [],
      specialMarks: [],
      customActivities: [],
      mids: { totalMarks: 0, obtainedMarks: 0 }, 
      finals: { totalMarks: 0, obtainedMarks: 0 },
      finalProject: { totalMarks: 0, obtainedMarks: 0 } 
    };

    // The sessional percentage comes from the SAME helper the pre-save hook uses to
    // store studentClassPercentage. This endpoint used to compute it as a pooled
    // ratio (total obtained / total possible across every activity), which is a
    // different number from the weighted blend the stored grade uses whenever
    // activity weights are not proportional to raw marks. The result was a
    // student's leaderboard percentage disagreeing with their own letter grade.
    const sessionalBreakdown = computeSessionalBreakdown(doc, classroom);
    const sessionalPercentage = sessionalBreakdown.sessionalPercentage;
    if (sessionalBreakdown.hasSessionals) {
      sumSessional += sessionalPercentage;
      sessionalCount++;
    }

    let midsPercentage = 0;
    // `midsEntered` tracks whether the exam has actually been keyed in. It is kept
    // separate from the weighting decision below because the class average for a
    // component should only average students who were assessed on it, while the
    // overall percentage must still charge an ungraded exam as 0.
    const midsEntered = !!(doc.mids && doc.mids.totalMarks > 0);
    const hasMids = midsEntered && !doc.mids.isBypassed;
    if (hasMids) {
      midsPercentage = doc.mids.isAbsent ? 0 : ((Number(doc.mids.obtainedMarks) || 0) / doc.mids.totalMarks) * 100;
    }
    // Averaged over every non-bypassed student, with an ungraded exam contributing
    // 0 - matching how the overall percentage now treats it. Averaging only the
    // students who were assessed made the component average disagree with the class
    // overall average.
    if (!doc.mids?.isBypassed) { sumMids += midsPercentage; midsCount++; }

    let finalsPercentage = 0;
    const finalsEntered = !!(doc.finals && doc.finals.totalMarks > 0);
    const hasFinals = finalsEntered && !doc.finals.isBypassed;
    if (hasFinals) {
      finalsPercentage = doc.finals.isAbsent ? 0 : ((Number(doc.finals.obtainedMarks) || 0) / doc.finals.totalMarks) * 100;
    }
    if (!doc.finals?.isBypassed) { sumFinals += finalsPercentage; finalsCount++; }

    const sW = Number(gradingScheme.sessionalWeight) || 25;
    const mW = Number(gradingScheme.midsWeight) || 35;
    const fW = Number(gradingScheme.finalsWeight) || 40;

    // The grading scheme is the fixed 100-mark split the teacher set up, so all
    // three categories always stay in the denominator and an exam that has not
    // been entered yet scores 0%. Normalising by "whatever this student happens
    // to have entered" inflated anyone part-way through grading: perfect
    // sessionals with no finals entered reported 100% overall instead of
    // 25 (25 sessional marks out of 100). It also made a score DROP as more
    // marks were added. The weights add up to 100 by construction, so dividing
    // by activeWeightSum is just a guard against a malformed scheme.
    //
    // Bypassing is the one exception: a bypassed exam is dropped from BOTH sides so
    // it neither helps nor hurts. Mids and finals are otherwise charged at 0% while
    // ungraded, matching how configured sessional activities already behave. Gating
    // them on hasMids/hasFinals made an ungraded exam vanish from the denominator,
    // so a student with perfect sessionals and no finals entered showed 100% overall
    // and then dropped the moment finals were keyed in.
    let weightedSum = 0;
    let activeWeightSum = 0;
    if (sW > 0) { weightedSum += sessionalPercentage * sW; activeWeightSum += sW; }
    if (mW > 0 && !doc.mids?.isBypassed) { weightedSum += midsPercentage * mW; activeWeightSum += mW; }
    if (fW > 0 && !doc.finals?.isBypassed) { weightedSum += finalsPercentage * fW; activeWeightSum += fW; }

    const overallPercentage = activeWeightSum > 0 ? weightedSum / activeWeightSum : 0;
    sumOverall += overallPercentage; overallCount++;

    // A classroom is worth a fixed 100 solid marks, so the final marks achieved
    // is the overall percentage resolved against 100. Carried explicitly so the
    // UI and any export can show "72.25/100" rather than leaving the reader to
    // work it out from the percentage.
    const overallMarks = Number(overallPercentage.toFixed(2));

    // Grade letter and grade point for this student, from the shared scale. Same
    // rule the schema's pre-save hook applied, so the live leaderboard and the
    // stored transcript always show the same grade.
    const hasFinalsOrMids = (doc.finals?.totalMarks > 0) || (doc.mids?.totalMarks > 0);
    const graded = getGradeAndGpa(overallPercentage, hasFinalsOrMids);
    sumGradePoints += graded.gradePoint;
    gradePointCount++;

    // Tier boundaries aligned with the grade scale so a student's tier always
    // agrees with the grade shown to them.
    if (overallPercentage >= 80) tiers.excellent++;
    else if (overallPercentage >= 65) tiers.good++;
    else if (overallPercentage >= 50) tiers.average++;
    else tiers.needsImprovement++;

    return {
      student: { _id: st._id, name: st.name, rollNo: st.rollNo },
      sessionalPercentage: Number(sessionalPercentage.toFixed(2)),
      midsPercentage: Number(midsPercentage.toFixed(2)),
      finalsPercentage: Number(finalsPercentage.toFixed(2)),
      overallPercentage: Number(overallPercentage.toFixed(2)),
      overallMarks,
      letterGrade: graded.grade,
      gradePoint: graded.gradePoint,
      isFailing: graded.isFailing,
      marksDoc: doc
    };
  });

  rankings.sort((a, b) => b.overallPercentage - a.overallPercentage);

  const classAverages = {
    sessionalPercentage: sessionalCount > 0 ? Number((sumSessional / sessionalCount).toFixed(2)) : 0,
    midsPercentage: midsCount > 0 ? Number((sumMids / midsCount).toFixed(2)) : 0,
    finalsPercentage: finalsCount > 0 ? Number((sumFinals / finalsCount).toFixed(2)) : 0,
    overallPercentage: overallCount > 0 ? Number((sumOverall / overallCount).toFixed(2)) : 0,
    // Class average expressed as marks out of the 100 solid marks the course is
    // worth, so staff can read "72.25/100" rather than only a percentage.
    overallMarks: overallCount > 0 ? Number((sumOverall / overallCount).toFixed(2)) : 0,
    // Class average grade point, so staff see the cohort's GPA alongside the
    // average percentage rather than having to average letters by hand.
    averageGradePoint: gradePointCount > 0 ? Number((sumGradePoints / gradePointCount).toFixed(2)) : 0,
    gradePointScale: '4.00',
    totalCourseMarks: 100,
  };

  // ===========================================================================
  // DEEP CLASS METRICS: per-category class averages & grading progress so staff
  // can see how the whole class is performing on every sessional activity and
  // exam (Quizzes, Assignments, Mids, Finals, etc.) at a glance.
  // ===========================================================================
  const CATEGORY_LABELS = {
    quizzes: 'Quizzes',
    assignments: 'Assignments',
    presentations: 'Presentations',
    projects: 'Projects',
    homework: 'Homework',
    classActivities: 'Class Activities',
    classParticipation: 'Class Participation',
    vivas: 'Vivas',
    specialMarks: 'Special Marks',
    mids: 'Mids',
    finals: 'Finals',
    finalProject: 'Final Project',
  };

  const SESSIONAL_CATEGORY_KEYS = [
    'quizzes', 'assignments', 'presentations', 'projects',
    'homework', 'classActivities', 'classParticipation', 'vivas', 'specialMarks',
  ];
  const EXAM_CATEGORY_KEYS = ['mids', 'finals', 'finalProject'];

  const buildCategoryMetric = (catKey, labelOverride) => {
    const isExam = EXAM_CATEGORY_KEYS.includes(catKey);
    const classroomItems = isExam
      ? (classroom[catKey] && classroom[catKey].totalMarks > 0 ? [classroom[catKey]] : [])
      : (Array.isArray(classroom[catKey]) ? classroom[catKey] : []);

    let sumObtained = 0;
    let sumTotal = 0;
    let gradedStudents = 0;
    const gradedStudentIds = new Set();

    activeStudents.forEach(st => {
      const doc = markMap.get(st._id.toString());
      if (!doc) return;

      let catObtained = 0;
      let catTotal = 0;
      let catGraded = false;

      if (isExam) {
        const exam = doc[catKey];
        if (exam && exam.totalMarks > 0 && !exam.isBypassed) {
          catObtained = exam.isAbsent ? 0 : (Number(exam.obtainedMarks) || 0);
          catTotal = Number(exam.totalMarks) || 0;
          catGraded = true;
        }
      } else if (Array.isArray(doc[catKey])) {
        doc[catKey].forEach(item => {
          if (!item || !item.title) return;
          // Bypassed entries are excluded from both sides here, matching
          // getArrayTotals in markSchema. Counting their possible marks without
          // their earned marks made the class average for a category look lower
          // the more students a teacher bypassed.
          if (item.isBypassed) return;
          catTotal += Number(item.totalMarks) || 0;
          if (!item.isAbsent && item.obtainedMarks !== undefined && item.obtainedMarks !== null && !isNaN(item.obtainedMarks)) {
            catObtained += Number(item.obtainedMarks) || 0;
            catGraded = true;
          } else if (item.isAbsent) {
            catGraded = true;
          }
        });
      }

      if (catGraded) {
        gradedStudents++;
        gradedStudentIds.add(st._id.toString());
        sumObtained += catObtained;
        sumTotal += catTotal;
      }
    });

    return {
      category: catKey,
      label: labelOverride || CATEGORY_LABELS[catKey] || (catKey.charAt(0).toUpperCase() + catKey.slice(1)),
      averagePercentage: sumTotal > 0 ? Number(((sumObtained / sumTotal) * 100).toFixed(2)) : 0,
      totalObtained: Number(sumObtained.toFixed(2)),
      totalPossible: Number(sumTotal.toFixed(2)),
      gradedCount: gradedStudents,
      totalCount: activeStudents.length,
      progressPercentage: activeStudents.length > 0 ? Number(((gradedStudents / activeStudents.length) * 100).toFixed(2)) : 0,
      totalItems: classroomItems.length,
    };
  };

  const categoryMetrics = [];

  SESSIONAL_CATEGORY_KEYS.forEach(catKey => {
    const totalItems = Array.isArray(classroom[catKey]) ? classroom[catKey].length : 0;
    const hasScores = markDocs.some(doc => Array.isArray(doc[catKey]) && doc[catKey].length > 0);
    if (totalItems > 0 || hasScores) {
      categoryMetrics.push(buildCategoryMetric(catKey));
    }
  });

  EXAM_CATEGORY_KEYS.forEach(catKey => {
    const examDefined = classroom[catKey] && classroom[catKey].totalMarks > 0;
    const hasScores = markDocs.some(doc => doc[catKey] && doc[catKey].totalMarks > 0);
    if (examDefined || hasScores) {
      categoryMetrics.push(buildCategoryMetric(catKey));
    }
  });

  // Custom / teacher-defined activity categories
  const customCategoryKeys = [];
  markDocs.forEach(doc => {
    (doc.customActivities || []).forEach(ca => {
      if (ca && ca.categoryName) {
        const key = ca.categoryName.trim().toLowerCase();
        if (!customCategoryKeys.includes(key)) customCategoryKeys.push(key);
      }
    });
  });
  (classroom.customActivities || []).forEach(ca => {
    if (ca && ca.categoryName) {
      const key = ca.categoryName.trim().toLowerCase();
      if (!customCategoryKeys.includes(key)) customCategoryKeys.push(key);
    }
  });

  customCategoryKeys.forEach(key => {
    let sumObtained = 0;
    let sumTotal = 0;
    let gradedStudents = 0;

    activeStudents.forEach(st => {
      const doc = markMap.get(st._id.toString());
      if (!doc) return;

      let catObtained = 0;
      let catTotal = 0;
      let catGraded = false;

      (doc.customActivities || []).forEach(ca => {
        if (!ca || !ca.categoryName || ca.categoryName.trim().toLowerCase() !== key) return;
        (ca.items || []).forEach(item => {
          if (!item || !item.title) return;
          if (item.isBypassed) return;
          catTotal += Number(item.totalMarks) || 0;
          if (!item.isAbsent && item.obtainedMarks !== undefined && item.obtainedMarks !== null && !isNaN(item.obtainedMarks)) {
            catObtained += Number(item.obtainedMarks) || 0;
            catGraded = true;
          } else if (item.isAbsent) {
            catGraded = true;
          }
        });
      });

      if (catGraded) {
        gradedStudents++;
        sumObtained += catObtained;
        sumTotal += catTotal;
      }
    });

    const definedCat = (classroom.customActivities || []).find(ca => ca && ca.categoryName && ca.categoryName.trim().toLowerCase() === key);

    categoryMetrics.push({
      category: key,
      label: definedCat ? definedCat.categoryName : (key.charAt(0).toUpperCase() + key.slice(1)),
      averagePercentage: sumTotal > 0 ? Number(((sumObtained / sumTotal) * 100).toFixed(2)) : 0,
      totalObtained: Number(sumObtained.toFixed(2)),
      totalPossible: Number(sumTotal.toFixed(2)),
      gradedCount: gradedStudents,
      totalCount: activeStudents.length,
      progressPercentage: activeStudents.length > 0 ? Number(((gradedStudents / activeStudents.length) * 100).toFixed(2)) : 0,
      totalItems: definedCat && Array.isArray(definedCat.items) ? definedCat.items.length : 0,
    });
  });

  res.status(200).json({
    status: 'success',
    data: { classAverages, rankings, performanceTiers: tiers, categoryMetrics }
  });
});

exports.getClassroomAnalytics = exports.getClassAnalytics;

// =============================================================================
// GET SINGLE EVALUATION SHEET FOR POPUP EDITOR
// =============================================================================
exports.getSingleEvaluationSheet = catchAsync(async (req, res, next) => {
  const { classroomId, category, title } = req.params;

  const classroom = await Classroom.findById(classroomId).populate('students', 'name rollNo');
  if (!classroom) {
    return next(new AppError('Classroom not found.', 404));
  }

  const cleanCategory = category.trim().toLowerCase();
  const targetCategory = CATEGORY_MAP[cleanCategory] || getNormalizedTargetKey(cleanCategory);
  const isStandard = STANDARD_CATEGORIES.includes(targetCategory);

  const studentMarksDocs = await Mark.find({ classroom: classroomId });
  const markMap = {};
  studentMarksDocs.forEach(doc => {
    markMap[doc.student.toString()] = doc;
  });

  const decodedTitle = decodeURIComponent(title).trim().toLowerCase();

  const studentSheet = (classroom.students || []).map(st => {
    const studentId = st._id.toString();
    const markDoc = markMap[studentId];
    let obtainedMarks = undefined;
    let isAbsent = false;
    let file = null;

    if (markDoc) {
      if (['mids', 'finals', 'finalProject'].includes(targetCategory)) {
        const examObj = markDoc[targetCategory];
        if (examObj) {
          obtainedMarks = examObj.obtainedMarks;
          isAbsent = Boolean(examObj.isAbsent);
          file = examObj.file || null;
        }
      } else if (isStandard) {
        if (Array.isArray(markDoc[targetCategory])) {
          const entry = markDoc[targetCategory].find(e => e.title?.toLowerCase() === decodedTitle);
          if (entry) {
            obtainedMarks = entry.obtainedMarks;
            isAbsent = Boolean(entry.isAbsent);
            file = entry.file || null;
          }
        }
      } else if (Array.isArray(markDoc.customActivities)) {
        const customCat = markDoc.customActivities.find(
          c => c.categoryName?.trim().toLowerCase() === targetCategory.toLowerCase() ||
               c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
        );
        if (customCat && Array.isArray(customCat.items)) {
          const entry = customCat.items.find(e => e.title?.toLowerCase() === decodedTitle);
          if (entry) {
            obtainedMarks = entry.obtainedMarks;
            isAbsent = Boolean(entry.isAbsent);
            file = entry.file || null;
          }
        }
      }
    }

    return {
      studentId: st._id,
      name: st.name,
      rollNo: st.rollNo || '',
      obtainedMarks,
      isAbsent,
      file
    };
  });

  res.status(200).json({
    status: 'success',
    data: { students: studentSheet }
  });
});

// =============================================================================
// SAVE SINGLE EVALUATION SHEET FROM POPUP EDITOR
// =============================================================================
exports.saveSingleEvaluationSheet = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const { category, title, totalMarks, marks } = req.body; 

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) {
    return next(new AppError('Classroom not found.', 404));
  }

  const cleanCategory = (category || '').trim().toLowerCase();
  const targetCategory = CATEGORY_MAP[cleanCategory] || getNormalizedTargetKey(cleanCategory);
  const isStandard = STANDARD_CATEGORIES.includes(targetCategory);

  const parsedTotal = Number(totalMarks) || 10;
  let cleanTitle = (title || '').trim();

  if (!['mids', 'finals', 'finalProject'].includes(targetCategory)) {
    if (isStandard) {
      if (!Array.isArray(classroom[targetCategory])) classroom[targetCategory] = [];
      const existingIndex = classroom[targetCategory].findIndex(i => i.title?.toLowerCase() === cleanTitle.toLowerCase());
      if (existingIndex > -1) {
        classroom[targetCategory][existingIndex].totalMarks = parsedTotal;
      } else {
        classroom[targetCategory].push({ title: cleanTitle, totalMarks: parsedTotal });
      }
    } else {
      if (!Array.isArray(classroom.customActivities)) classroom.customActivities = [];
      let customCat = classroom.customActivities.find(
        c => c.categoryName?.trim().toLowerCase() === targetCategory.toLowerCase() ||
             c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
      );
      if (!customCat) {
        classroom.customActivities.push({
          categoryName: cleanCategory,
          items: [{ title: cleanTitle, totalMarks: parsedTotal }]
        });
      } else {
        if (!Array.isArray(customCat.items)) customCat.items = [];
        const existingIndex = customCat.items.findIndex(i => i.title?.toLowerCase() === cleanTitle.toLowerCase());
        if (existingIndex > -1) {
          customCat.items[existingIndex].totalMarks = parsedTotal;
        } else {
          customCat.items.push({ title: cleanTitle, totalMarks: parsedTotal });
        }
      }
    }
    await classroom.save();
  } else {
    classroom[targetCategory] = { title: cleanTitle || 'Exam', totalMarks: parsedTotal };
    await classroom.save();
  }

  const updatedStudentIds = [];

  if (Array.isArray(marks)) {
    for (const m of marks) {
      const studentId = m.studentId || m._id;
      if (!studentId) continue;

      const rawVal = m.obtainedMarks !== undefined ? String(m.obtainedMarks).trim() : '';
      const isAbsent = Boolean(m.isAbsent) || rawVal.toUpperCase() === 'A';
      const isBypass = !isAbsent && rawVal.toUpperCase() === BYPASS_SENTINEL;
      
      // "-99" means ungraded. Skip it rather than letting Number() turn it into
      // a real number - the old Math.max(0, ...) clamp silently recorded an
      // ungraded entry as a graded zero.
      if (!isAbsent && !isBypass && (rawVal === '' || rawVal === null || rawVal === UNGRADED_SENTINEL || isNaN(Number(rawVal)))) {
        continue;
      }

      let markDoc = await Mark.findOne({ classroom: classroomId, student: studentId });
      if (!markDoc) {
        markDoc = new Mark({
          classroom: classroomId,
          student: studentId,
          quizzes: [],
          assignments: [],
          presentations: [],
          projects: [],
          homework: [],
          classActivities: [],
          classParticipation: [],
          vivas: [],
          specialMarks: [],
          customActivities: []
        });
      }

      // Bypass is capped per student per category, and the cap is enforced
      // here so it holds regardless of what the client sends.
      if (isBypass) {
        const verdict = canBypass(classroom, markDoc, targetCategory, cleanTitle);
        if (!verdict.allowed) {
          return res.status(400).json({
            status: 'fail',
            message: verdict.message,
            data: { limit: verdict.limit, used: verdict.used, category: targetCategory }
          });
        }
      }

      const obtained = (isAbsent || isBypass) ? 0 : Math.max(0, Number(rawVal) || 0);
      const fileData = parseCloudinaryFile(m);

      // Only notify students whose grade actually changed (avoids duplicate emails
      // when the same sheet is re-saved or ungraded entries are added).
      let marksChanged = !markDoc;
      if (markDoc) {
        if (['mids', 'finals', 'finalProject'].includes(targetCategory)) {
          const exam = markDoc[targetCategory];
          if (!exam) marksChanged = true;
          else marksChanged = (Number(exam.obtainedMarks) || 0) !== obtained ||
                              (exam.isAbsent === true) !== isAbsent ||
                              (Number(exam.totalMarks) || 0) !== parsedTotal;
        } else if (isStandard) {
          const existingItem = (Array.isArray(markDoc[targetCategory]) ? markDoc[targetCategory] : [])
            .find(e => e.title && e.title.toLowerCase() === cleanTitle.toLowerCase());
          if (!existingItem) marksChanged = true;
          else marksChanged = (Number(existingItem.obtainedMarks) || 0) !== obtained ||
                              (existingItem.isAbsent === true) !== isAbsent ||
                              (Number(existingItem.totalMarks) || 0) !== parsedTotal;
        } else {
          const customCat = (Array.isArray(markDoc.customActivities) ? markDoc.customActivities : [])
            .find(c => c.categoryName?.trim().toLowerCase() === targetCategory.toLowerCase() ||
                       c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase());
          const existingItem = customCat && Array.isArray(customCat.items)
            ? customCat.items.find(i => i.title?.toLowerCase() === cleanTitle.toLowerCase())
            : null;
          if (!existingItem) marksChanged = true;
          else marksChanged = (Number(existingItem.obtainedMarks) || 0) !== obtained ||
                              (existingItem.isAbsent === true) !== isAbsent ||
                              (Number(existingItem.totalMarks) || 0) !== parsedTotal;
        }
      }

      if (['mids', 'finals', 'finalProject'].includes(targetCategory)) {
        markDoc[targetCategory] = {
          title: cleanTitle || 'Exam',
          totalMarks: parsedTotal,
          obtainedMarks: obtained,
          isAbsent,
          isBypassed: isBypass,
          file: fileData || markDoc[targetCategory]?.file || { url: '', public_id: '', fileType: '', fileName: '' }
        };
      } else if (isStandard) {
        if (!Array.isArray(markDoc[targetCategory])) markDoc[targetCategory] = [];
        const entryIndex = markDoc[targetCategory].findIndex(e => e.title?.toLowerCase() === cleanTitle.toLowerCase());
        const scoreObj = {
          title: cleanTitle,
          totalMarks: parsedTotal,
          obtainedMarks: obtained,
          isAbsent,
          isBypassed: isBypass,
          file: fileData || (entryIndex > -1 ? markDoc[targetCategory][entryIndex].file : { url: '', public_id: '', fileType: '', fileName: '' })
        };

        if (entryIndex > -1) {
          markDoc[targetCategory][entryIndex] = scoreObj;
        } else {
          markDoc[targetCategory].push(scoreObj);
        }
      } else {
        if (!Array.isArray(markDoc.customActivities)) markDoc.customActivities = [];
        let customCat = markDoc.customActivities.find(
          c => c.categoryName?.trim().toLowerCase() === targetCategory.toLowerCase() ||
               c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
        );
        if (!customCat) {
          markDoc.customActivities.push({
            categoryName: cleanCategory,
            items: [{ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: obtained, isAbsent, isBypassed: isBypass, file: fileData || { url: '' } }]
          });
        } else {
          if (!Array.isArray(customCat.items)) customCat.items = [];
          const entryIndex = customCat.items.findIndex(e => e.title?.toLowerCase() === cleanTitle.toLowerCase());
          const scoreObj = {
            title: cleanTitle,
            totalMarks: parsedTotal,
            obtainedMarks: obtained,
            isAbsent,
            isBypassed: isBypass,
            file: fileData || (entryIndex > -1 ? customCat.items[entryIndex].file : { url: '' })
          };

          if (entryIndex > -1) {
            customCat.items[entryIndex] = scoreObj;
          } else {
            customCat.items.push(scoreObj);
          }
        }
      }

      await markDoc.save();
      if (marksChanged) updatedStudentIds.push(studentId);
    }
  }

  if (updatedStudentIds.length > 0) {
    const newlyGradedStudents = await User.find({ _id: { $in: updatedStudentIds } }).select('name email personalNotificationEmail').lean();
    
    await Promise.all(
      newlyGradedStudents.map(async (student) => {
        const studentEmail = student.personalNotificationEmail || student.email;
        if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
          try {
            const displayRole = req.user.role === 'STUDENT' ? 'Teaching Assistant' : req.user.role;
            await sendStyledEmail({
              to: studentEmail,
              subject: `Marks Uploaded: ${cleanTitle} (${targetCategory.toUpperCase()})`,
              title: `${cleanTitle} (${targetCategory.toUpperCase()})`,
              bodyText: `Your grade for <strong>${cleanTitle}</strong> in <strong>${classroom?.className || 'Course'}</strong> has been recorded/updated.`,
              details: [
                { label: 'Evaluation', value: cleanTitle },
                { label: 'Graded By', value: `${req.user.name} (${displayRole})` }
              ]
            });
          } catch (err) {
            console.warn('Failed to send evaluation popup email:', err.message);
          }
        }
      })
    );
  }

  res.status(200).json({
    status: 'success',
    message: `Marksheet updated and saved successfully! Notified ${updatedStudentIds.length} student(s).`
  });
});

// =============================================================================
// BATCH SUBMIT MARKS
// =============================================================================
exports.batchSubmitMarks = catchAsync(async (req, res, next) => {
  const { classroomId, category, title, totalMarks, marksData } = req.body;

  const cleanCategory = category ? category.trim().toLowerCase() : '';
  const resolvedCategory = CATEGORY_MAP[cleanCategory] || getNormalizedTargetKey(cleanCategory);
  const isStandard = STANDARD_CATEGORIES.includes(resolvedCategory);

  if (!classroomId || totalMarks === undefined || !Array.isArray(marksData) || marksData.length === 0) {
    return next(new AppError('Classroom ID, Total Marks (>0), and Marks Data array are required!', 400));
  }

  const parsedTotal = Number(totalMarks);
  if (isNaN(parsedTotal) || parsedTotal <= 0) {
    return next(new AppError('Total marks must be a valid number greater than 0!', 400));
  }

  const validEntries = marksData
    .map(item => ({
      studentId: item.studentId || item.student || item._id,
      obtainedMarks: item.obtainedMarks !== undefined ? item.obtainedMarks : (item.marks !== undefined ? item.marks : item.score),
      isAbsent: Boolean(item.isAbsent),
      file: parseCloudinaryFile(item)
    }))
    .filter(item => {
      if (!item.studentId) return false;
      const val = item.obtainedMarks;
      const strVal = val !== undefined && val !== null ? String(val).trim() : '';
      // "B" requests a bypass, so it must survive this filter.
      if (strVal.toUpperCase() === BYPASS_SENTINEL) return true;
      // -99 is the UI sentinel for "ungraded" - never persist it as a real mark.
      if (strVal !== '' && Number(strVal) === -99) return false;
      return strVal !== '' || item.isAbsent;
    });

  if (validEntries.length === 0) {
    return next(new AppError('No valid student marks were provided for submission.', 400));
  }

  let cleanTitle = (title || '').trim();
  const isMongoId = /^[0-9a-fA-F]{24}$/.test(cleanTitle);
  if (!cleanTitle || isMongoId) {
    cleanTitle = `${resolvedCategory.slice(0, -1).toUpperCase()} Entry`;
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
    classroom[resolvedCategory] = { title: cleanTitle, totalMarks: parsedTotal };
    await classroom.save();
  } else {
    if (isStandard) {
      if (!Array.isArray(classroom[resolvedCategory])) classroom[resolvedCategory] = [];
      const existingClassItem = classroom[resolvedCategory].find(
        (item) => item.title && item.title.toLowerCase() === cleanTitle.toLowerCase()
      );
      if (existingClassItem) {
        existingClassItem.totalMarks = parsedTotal;
      } else {
        classroom[resolvedCategory].push({ title: cleanTitle, totalMarks: parsedTotal });
      }
    } else {
      if (!Array.isArray(classroom.customActivities)) classroom.customActivities = [];
      let customCat = classroom.customActivities.find(
        c => c.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
             c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
      );
      if (!customCat) {
        classroom.customActivities.push({
          categoryName: cleanCategory,
          items: [{ title: cleanTitle, totalMarks: parsedTotal }]
        });
      } else {
        if (!Array.isArray(customCat.items)) customCat.items = [];
        const existingCustomItem = customCat.items.find(i => i.title?.toLowerCase() === cleanTitle.toLowerCase());
        if (existingCustomItem) {
          existingCustomItem.totalMarks = parsedTotal;
        } else {
          customCat.items.push({ title: cleanTitle, totalMarks: parsedTotal });
        }
      }
    }
    await classroom.save();
  }

  const studentIds = validEntries.map((m) => m.studentId);
  const students = await User.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  const existingDocs = await Mark.find({
    classroom: classroomId,
    student: { $in: studentIds },
  });

  const docMap = new Map(existingDocs.map((doc) => [doc.student.toString(), doc]));
  const docsToSave = [];
  const emailDispatchList = [];

  for (const item of validEntries) {
    const { studentId, obtainedMarks, isAbsent, file } = item;
    const studentIdStr = studentId.toString();
    const rawVal = String(obtainedMarks).trim();
    const absentFlag = isAbsent || rawVal.toUpperCase() === 'A';
    const bypassFlag = !absentFlag && rawVal.toUpperCase() === BYPASS_SENTINEL;
    if (!absentFlag && !bypassFlag && (isNaN(Number(rawVal)) || Number(rawVal) < 0)) {
      continue;
    }

    let markDoc = docMap.get(studentIdStr);

    // Cap bypasses per student per category. Checked before any write so a
    // rejected request leaves the sheet untouched, and enforced here rather
    // than in the UI so a TA cannot bypass the cap by calling the API.
    if (bypassFlag) {
      const verdict = canBypass(classroom, markDoc, resolvedCategory, cleanTitle);
      if (!verdict.allowed) {
        return res.status(400).json({
          status: 'fail',
          message: verdict.message,
          data: {
            limit: verdict.limit,
            used: verdict.used,
            category: resolvedCategory,
            studentId,
            studentName: studentMap.get(studentIdStr)?.name || 'Unknown'
          }
        });
      }
    }

    let marksChanged = !markDoc;
    const parsedObtained = (absentFlag || bypassFlag) ? 0 : Math.max(0, Number(rawVal) || 0);

    if (markDoc) {
      if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
        const exam = markDoc[resolvedCategory];
        if (!exam) marksChanged = true;
        else marksChanged = (Number(exam.obtainedMarks) || 0) !== parsedObtained ||
                            (exam.isAbsent === true) !== absentFlag ||
                            (Number(exam.totalMarks) || 0) !== parsedTotal;
      } else if (isStandard) {
        const existingItem = (Array.isArray(markDoc[resolvedCategory]) ? markDoc[resolvedCategory] : [])
          .find(e => e.title && e.title.toLowerCase() === cleanTitle.toLowerCase());
        if (!existingItem) marksChanged = true;
        else marksChanged = (Number(existingItem.obtainedMarks) || 0) !== parsedObtained ||
                            (existingItem.isAbsent === true) !== absentFlag ||
                            (Number(existingItem.totalMarks) || 0) !== parsedTotal;
      } else {
        const customCat = (Array.isArray(markDoc.customActivities) ? markDoc.customActivities : [])
          .find(c => c.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
                     c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase());
        const existingItem = customCat && Array.isArray(customCat.items)
          ? customCat.items.find(i => i.title?.toLowerCase() === cleanTitle.toLowerCase())
          : null;
        if (!existingItem) marksChanged = true;
        else marksChanged = (Number(existingItem.obtainedMarks) || 0) !== parsedObtained ||
                            (existingItem.isAbsent === true) !== absentFlag ||
                            (Number(existingItem.totalMarks) || 0) !== parsedTotal;
      }
    }

    if (!markDoc) {
      markDoc = new Mark({
        classroom: classroomId,
        student: studentId,
        quizzes: [],
        assignments: [],
        presentations: [],
        projects: [],
        homework: [],
        classActivities: [],
        classParticipation: [],
        vivas: [],
        specialMarks: [],
        customActivities: []
      });
    }

    if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
      markDoc[resolvedCategory] = {
        title: cleanTitle,
        totalMarks: parsedTotal,
        obtainedMarks: parsedObtained,
        isAbsent: absentFlag,
        isBypassed: bypassFlag,
        file: file || markDoc[resolvedCategory]?.file || { url: '', public_id: '', fileType: '', fileName: '' }
      };
    } else if (isStandard) {
      if (!Array.isArray(markDoc[resolvedCategory])) markDoc[resolvedCategory] = [];
      const existingIdx = markDoc[resolvedCategory].findIndex(
        (e) => e.title && e.title.toLowerCase() === cleanTitle.toLowerCase()
      );
      if (existingIdx > -1) {
        markDoc[resolvedCategory][existingIdx].totalMarks = parsedTotal;
        markDoc[resolvedCategory][existingIdx].obtainedMarks = parsedObtained;
        markDoc[resolvedCategory][existingIdx].isAbsent = absentFlag;
        markDoc[resolvedCategory][existingIdx].isBypassed = bypassFlag;
        if (file) markDoc[resolvedCategory][existingIdx].file = file;
      } else {
        const newItem = { title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent: absentFlag, isBypassed: bypassFlag };
        if (file) newItem.file = file;
        markDoc[resolvedCategory].push(newItem);
      }
    } else {
      if (!Array.isArray(markDoc.customActivities)) markDoc.customActivities = [];
      let customCat = markDoc.customActivities.find(
        c => c.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
             c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
      );
      if (!customCat) {
        markDoc.customActivities.push({
          categoryName: cleanCategory,
          items: [{ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent: absentFlag, isBypassed: bypassFlag, file: file || { url: '' } }]
        });
      } else {
        if (!Array.isArray(customCat.items)) customCat.items = [];
        const existingItemIdx = customCat.items.findIndex(i => i.title?.toLowerCase() === cleanTitle.toLowerCase());
        if (existingItemIdx > -1) {
          customCat.items[existingItemIdx].totalMarks = parsedTotal;
          customCat.items[existingItemIdx].obtainedMarks = parsedObtained;
          customCat.items[existingItemIdx].isAbsent = absentFlag;
          customCat.items[existingItemIdx].isBypassed = bypassFlag;
          if (file) customCat.items[existingItemIdx].file = file;
        } else {
          customCat.items.push({ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent: absentFlag, isBypassed: bypassFlag, file: file || { url: '' } });
        }
      }
    }

    docsToSave.push(markDoc);

    // Only notify students whose grade actually changed (avoids duplicate emails
    // when the same marksheet is re-submitted or ungraded entries are added).
    if (!marksChanged) continue;

    const studentUser = studentMap.get(studentIdStr);
    if (studentUser) {
      const targetStudentEmail = studentUser.personalNotificationEmail || studentUser.email;
      if (targetStudentEmail && !targetStudentEmail.includes('@temp.pucit.edu.pk')) {
        const percentage = parsedTotal > 0 ? ((parsedObtained / parsedTotal) * 100).toFixed(2) : '0.00';
        const displayRole = req.user.role === 'STUDENT' ? 'Teaching Assistant' : req.user.role;
        emailDispatchList.push({
          email: targetStudentEmail,
          title: `${cleanTitle} (${resolvedCategory.toUpperCase()})`,
          bodyText: absentFlag
            ? `You were marked <strong>ABSENT ('A')</strong> for <strong>${cleanTitle}</strong> in <strong>${classroom?.className || 'Course'}</strong>.`
            : bypassFlag
              ? `<strong>${cleanTitle}</strong> in <strong>${classroom?.className || 'Course'}</strong> was marked as bypassed ('B') and is excluded from your grade.`
              : `Your grade for <strong>${cleanTitle}</strong> in <strong>${classroom?.className || 'Course'}</strong> has been uploaded.`,
          details: [
            { label: 'Evaluation', value: cleanTitle },
            { label: 'Score', value: absentFlag
                ? `Absent (0 / ${parsedTotal})`
                : bypassFlag
                  ? 'Bypassed (excluded from grade)'
                  : `${parsedObtained} / ${parsedTotal} (${percentage}%)` },
            { label: 'Graded By', value: `${req.user.name} (${displayRole})` }
          ]
        });
      }
    }
  }

  await Promise.all(docsToSave.map((doc) => doc.save()));

  // Neutralize students left at -99 (ungraded) for this evaluation so cleared boxes truly unmark them.
  const submittedIds = new Set(validEntries.map(e => e.studentId.toString()));
  const enrolledIds = (classroom.students || []).map(s => (s && s._id ? s._id : s).toString());
  const excludedIds = enrolledIds.filter(id => !submittedIds.has(id));
  if (excludedIds.length > 0) {
    if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
      await Mark.updateMany(
        { classroom: classroomId, student: { $in: excludedIds } },
        { $set: { [`${resolvedCategory}.totalMarks`]: 0, [`${resolvedCategory}.obtainedMarks`]: null, [`${resolvedCategory}.isAbsent`]: false } }
      );
    } else if (isStandard) {
      await Mark.updateMany(
        { classroom: classroomId, student: { $in: excludedIds }, [resolvedCategory]: { $elemMatch: { title: cleanTitle } } },
        { $pull: { [resolvedCategory]: { title: cleanTitle } } }
      );
    } else {
      const neutralDocs = await Mark.find({
        classroom: classroomId,
        student: { $in: excludedIds },
        customActivities: { $elemMatch: { items: { $elemMatch: { title: cleanTitle } } } }
      });
      let changed = false;
      for (const doc of neutralDocs) {
        const cat = (doc.customActivities || []).find(c =>
          c.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
          c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
        );
        if (cat && Array.isArray(cat.items)) {
          const before = cat.items.length;
          cat.items = cat.items.filter(i => i.title?.trim().toLowerCase() !== cleanTitle.toLowerCase());
          if (cat.items.length !== before) changed = true;
        }
      }
      if (changed) await Promise.all(neutralDocs.map(d => d.save()));
    }
  }

  await Promise.all(
    emailDispatchList.map(async (mail) => {
      try {
        await sendStyledEmail({
          to: mail.email,
          subject: `Marks Uploaded: ${mail.title}`,
          title: mail.title,
          bodyText: mail.bodyText,
          details: mail.details
        });
      } catch (err) {
        console.warn('Failed to send mark email:', err.message);
      }
    })
  );

  res.status(200).json({
    status: 'success',
    message: `Successfully recorded grades for ${docsToSave.length} student(s)!`,
  });
});

// =============================================================================
// UPDATE SINGLE ITEM MARK FOR A STUDENT
// =============================================================================
exports.updateSingleStudentMark = catchAsync(async (req, res, next) => {
  const { classroomId, studentId, category } = req.body;
  let { itemTitle } = req.body;

  if (itemTitle && /^[0-9a-fA-F]{24}$/.test(itemTitle)) {
    itemTitle = '';
  }

  // Tracked title used for exclusion when re-saving an activity that is already
  // bypassed. Without this binding every canBypass() call below threw
  // "cleanTitle is not defined" at runtime, so the single-student grade endpoint
  // failed on every request that involved a bypass check.
  const cleanTitle = String(itemTitle || '').trim();

  const incomingObtained = req.body.newObtainedMarks !== undefined ? req.body.newObtainedMarks : (req.body.obtainedMarks !== undefined ? req.body.obtainedMarks : req.body.score);
  const incomingTotal = req.body.newTotalMarks !== undefined ? req.body.newTotalMarks : req.body.totalMarks;
  const isAbsentFlag = Boolean(req.body.isAbsent);

  const cleanCategory = category ? category.trim().toLowerCase() : '';
  const resolvedCategory = CATEGORY_MAP[cleanCategory] || getNormalizedTargetKey(cleanCategory);
  const isStandard = STANDARD_CATEGORIES.includes(resolvedCategory);

  const [classroom, student] = await Promise.all([
    Classroom.findById(classroomId).lean(),
    User.findById(studentId).select('name email personalNotificationEmail').lean()
  ]);

  if (!classroom) return next(new AppError('Classroom not found!', 404));
  if (!student) return next(new AppError('Student not found!', 404));

  let markDoc = await Mark.findOne({ classroom: classroomId, student: studentId });
  if (!markDoc) {
    markDoc = new Mark({
      classroom: classroomId,
      student: studentId,
      quizzes: [],
      assignments: [],
      presentations: [],
      projects: [],
      homework: [],
      classActivities: [],
      classParticipation: [],
      vivas: [],
      specialMarks: [],
      customActivities: []
    });
  }

  const fileData = parseCloudinaryFile(req.body);

  // Only notify the student when their grade actually changes.
  let marksChanged = true;

  if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
    const currentTotal = incomingTotal !== undefined ? Number(incomingTotal) : (markDoc[resolvedCategory]?.totalMarks || 100);
    const rawVal = incomingObtained !== undefined ? String(incomingObtained).trim() : String(markDoc[resolvedCategory]?.obtainedMarks || 0);
    const absentFlag = isAbsentFlag || rawVal.toUpperCase() === 'A';
    const bypassFlag = !absentFlag && rawVal.toUpperCase() === BYPASS_SENTINEL;
    if (bypassFlag) {
      const verdict = canBypass(classroom, markDoc, resolvedCategory, cleanTitle);
      if (!verdict.allowed) return next(new AppError(verdict.message, 400));
    }
    const currentObtained = (absentFlag || bypassFlag) ? 0 : Math.max(0, Number(rawVal));

    if (currentTotal <= 0) return next(new AppError('Total marks must be greater than 0!', 400));
    if (!absentFlag && !bypassFlag && currentObtained > currentTotal) {
      return next(new AppError(`Obtained marks (${currentObtained}) cannot exceed Total marks (${currentTotal})!`, 400));
    }

    const prevExam = markDoc[resolvedCategory];
    marksChanged = !prevExam ||
      (Number(prevExam.obtainedMarks) || 0) !== currentObtained ||
      (Number(prevExam.totalMarks) || 0) !== currentTotal ||
      (Boolean(prevExam.isAbsent)) !== absentFlag;

    markDoc[resolvedCategory] = {
      title: itemTitle || 'Exam',
      totalMarks: currentTotal,
      obtainedMarks: currentObtained,
      isAbsent: absentFlag,
      isBypassed: bypassFlag,
      file: fileData || markDoc[resolvedCategory]?.file || { url: '', public_id: '', fileType: '', fileName: '' }
    };
  } else if (isStandard) {
    if (!itemTitle) return next(new AppError('Item title is required!', 400));
    if (!Array.isArray(markDoc[resolvedCategory])) markDoc[resolvedCategory] = [];

    const itemIdx = markDoc[resolvedCategory].findIndex(
      (item) => item.title.toLowerCase() === itemTitle.trim().toLowerCase()
    );

    const currentTotal = incomingTotal !== undefined ? Number(incomingTotal) : (itemIdx > -1 ? markDoc[resolvedCategory][itemIdx].totalMarks : 10);
    const rawVal = incomingObtained !== undefined ? String(incomingObtained).trim() : (itemIdx > -1 ? String(markDoc[resolvedCategory][itemIdx].obtainedMarks) : '0');
    const absentFlag = isAbsentFlag || rawVal.toUpperCase() === 'A';
    const bypassFlag = !absentFlag && rawVal.toUpperCase() === BYPASS_SENTINEL;
    if (bypassFlag) {
      const verdict = canBypass(classroom, markDoc, resolvedCategory, cleanTitle);
      if (!verdict.allowed) return next(new AppError(verdict.message, 400));
    }
    const currentObtained = (absentFlag || bypassFlag) ? 0 : Math.max(0, Number(rawVal));

    if (currentTotal <= 0) return next(new AppError('Total marks must be greater than 0!', 400));
    if (!absentFlag && !bypassFlag && currentObtained > currentTotal) {
      return next(new AppError(`Obtained marks (${currentObtained}) cannot exceed Total marks (${currentTotal})!`, 400));
    }

    const prevItem = itemIdx > -1 ? markDoc[resolvedCategory][itemIdx] : null;
    marksChanged = !prevItem ||
      (Number(prevItem.obtainedMarks) || 0) !== currentObtained ||
      (Number(prevItem.totalMarks) || 0) !== currentTotal ||
      (Boolean(prevItem.isAbsent)) !== absentFlag;

    if (itemIdx > -1) {
      markDoc[resolvedCategory][itemIdx].totalMarks = currentTotal;
      markDoc[resolvedCategory][itemIdx].obtainedMarks = currentObtained;
      markDoc[resolvedCategory][itemIdx].isAbsent = absentFlag;
      markDoc[resolvedCategory][itemIdx].isBypassed = bypassFlag;
      if (fileData) markDoc[resolvedCategory][itemIdx].file = fileData;
    } else {
      markDoc[resolvedCategory].push({
        title: itemTitle.trim(),
        totalMarks: currentTotal,
        obtainedMarks: currentObtained,
        isAbsent: absentFlag,
        isBypassed: bypassFlag,
        file: fileData || { url: '', public_id: '', fileType: '', fileName: '' }
      });
    }
  } else {
    if (!itemTitle) return next(new AppError('Item title is required!', 400));
    if (!Array.isArray(markDoc.customActivities)) markDoc.customActivities = [];

    let customCat = markDoc.customActivities.find(
      c => c.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
           c.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()
    );

    if (!customCat) {
      // Normalise the sentinels before creating the category, so a bypass
      // submitted against a brand-new custom activity is validated and stored
      // the same way as one added to an existing category.
      const rawNew = incomingObtained !== undefined ? String(incomingObtained).trim() : '';
      const absentNew = isAbsentFlag || rawNew.toUpperCase() === 'A';
      const bypassNew = !absentNew && rawNew.toUpperCase() === BYPASS_SENTINEL;
      if (bypassNew) {
        const verdict = canBypass(classroom, markDoc, resolvedCategory, cleanTitle);
        if (!verdict.allowed) return next(new AppError(verdict.message, 400));
      }
      markDoc.customActivities.push({
        categoryName: cleanCategory,
        items: [{
          title: itemTitle.trim(),
          totalMarks: Number(incomingTotal) || 10,
          obtainedMarks: (absentNew || bypassNew) ? 0 : (Number(rawNew) || 0),
          isAbsent: absentNew,
          isBypassed: bypassNew,
          file: fileData || { url: '' }
        }]
      });
    } else {
      if (!Array.isArray(customCat.items)) customCat.items = [];
      const itemIdx = customCat.items.findIndex(i => i.title?.toLowerCase() === itemTitle.trim().toLowerCase());
      const currentTotal = incomingTotal !== undefined ? Number(incomingTotal) : (itemIdx > -1 ? customCat.items[itemIdx].totalMarks : 10);
      const rawVal = incomingObtained !== undefined ? String(incomingObtained).trim() : (itemIdx > -1 ? String(customCat.items[itemIdx].obtainedMarks) : '0');
      const absentFlag = isAbsentFlag || rawVal.toUpperCase() === 'A';
      const bypassFlag = !absentFlag && rawVal.toUpperCase() === BYPASS_SENTINEL;
      if (bypassFlag) {
        const verdict = canBypass(classroom, markDoc, resolvedCategory, cleanTitle);
        if (!verdict.allowed) return next(new AppError(verdict.message, 400));
      }
      const currentObtained = (absentFlag || bypassFlag) ? 0 : Math.max(0, Number(rawVal));

      const prevItem = itemIdx > -1 ? customCat.items[itemIdx] : null;
      marksChanged = !prevItem ||
        (Number(prevItem.obtainedMarks) || 0) !== currentObtained ||
        (Number(prevItem.totalMarks) || 0) !== currentTotal ||
        (Boolean(prevItem.isAbsent)) !== absentFlag;

      if (itemIdx > -1) {
        customCat.items[itemIdx].totalMarks = currentTotal;
        customCat.items[itemIdx].obtainedMarks = currentObtained;
        customCat.items[itemIdx].isAbsent = absentFlag;
        customCat.items[itemIdx].isBypassed = bypassFlag;
        if (fileData) customCat.items[itemIdx].file = fileData;
      } else {
        customCat.items.push({
          title: itemTitle.trim(),
          totalMarks: currentTotal,
          obtainedMarks: currentObtained,
          isAbsent: absentFlag,
          isBypassed: bypassFlag,
          file: fileData || { url: '' }
        });
      }
    }
  }

  await markDoc.save();

  const studentEmail = student.personalNotificationEmail || student.email;
  const displayTitle = itemTitle || resolvedCategory;
  if (marksChanged && studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
    try {
      const displayRole = req.user.role === 'STUDENT' ? 'Teaching Assistant' : req.user.role;
      await sendStyledEmail({
        to: studentEmail,
        subject: `Grade Updated: ${displayTitle}`,
        title: `Grade Update: ${displayTitle}`,
        bodyText: `Your score for <strong>${displayTitle}</strong> in <strong>${classroom?.className || 'Course'}</strong> has been updated by <strong>${req.user.name}</strong>.`,
        details: [
          { label: 'Graded By', value: `${req.user.name} (${displayRole})` }
        ]
      });
    } catch (err) {
      console.warn('Failed to send update email:', err.message);
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Marks updated successfully for student!',
    data: { markDoc },
  });
});

exports.updateSingleStudentItemMark = exports.updateSingleStudentMark;

// =============================================================================
// DELETE / CANCEL AN EVALUATION ENTRY ACROSS ENTIRE CLASSROOM
// =============================================================================
exports.deleteEvaluationEntry = catchAsync(async (req, res, next) => {
  const { classroomId, category, itemTitle } = req.body;

  const cleanCategory = category ? category.trim().toLowerCase() : '';
  const resolvedCategory = CATEGORY_MAP[cleanCategory] || getNormalizedTargetKey(cleanCategory);
  const isStandard = STANDARD_CATEGORIES.includes(resolvedCategory);

  if (!classroomId || !resolvedCategory || !itemTitle) {
    return next(new AppError('Classroom ID, Category, and Item Title are required!', 400));
  }

  if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
    return next(new AppError('Exam slots cannot be deleted.', 400));
  }

  const cleanTitle = itemTitle.trim().toLowerCase();
  const markDocs = await Mark.find({ classroom: classroomId });

  const savePromises = [];

  for (const doc of markDocs) {
    if (isStandard) {
      const initialLength = (doc[resolvedCategory] || []).length;
      doc[resolvedCategory] = (doc[resolvedCategory] || []).filter(
        (item) => item.title.trim().toLowerCase() !== cleanTitle
      );
      if (doc[resolvedCategory].length !== initialLength) {
        savePromises.push(doc.save());
      }
    } else if (Array.isArray(doc.customActivities)) {
      let modified = false;
      doc.customActivities.forEach(cat => {
        if (cat.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
            cat.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()) {
          const initialLen = (cat.items || []).length;
          cat.items = (cat.items || []).filter(i => i.title?.trim().toLowerCase() !== cleanTitle);
          if (cat.items.length !== initialLen) modified = true;
        }
      });
      if (modified) savePromises.push(doc.save());
    }
  }

  await Promise.all(savePromises);

  // Also remove the classroom-level item definition so the cancelled assessment disappears from the list/columns.
  const classroom = await Classroom.findById(classroomId);
  if (classroom) {
    if (isStandard && Array.isArray(classroom[resolvedCategory])) {
      classroom[resolvedCategory] = classroom[resolvedCategory].filter(
        (item) => !item.title || item.title.trim().toLowerCase() !== cleanTitle
      );
      await classroom.save();
    } else if (!isStandard && Array.isArray(classroom.customActivities)) {
      classroom.customActivities.forEach((cat) => {
        if (cat.categoryName?.trim().toLowerCase() === resolvedCategory.toLowerCase() ||
            cat.categoryName?.trim().toLowerCase() === cleanCategory.toLowerCase()) {
          cat.items = (cat.items || []).filter(i => i.title?.trim().toLowerCase() !== cleanTitle);
        }
      });
      await classroom.save();
    }
  }

  res.status(200).json({
    status: 'success',
    message: `Removed "${itemTitle}" successfully.`,
  });
});

// =============================================================================
// GET SINGLE STUDENT MARKS
// =============================================================================
exports.getStudentMarks = catchAsync(async (req, res, next) => {
  const { classroomId, studentId } = req.params;

  let markDoc = await Mark.findOne({ classroom: classroomId, student: studentId })
    .populate('student', 'name rollNo email personalNotificationEmail')
    .populate('classroom', 'className sectionPrefix');

  if (!markDoc) {
    markDoc = await Mark.create({
      classroom: classroomId,
      student: studentId,
      quizzes: [],
      assignments: [],
      presentations: [],
      projects: [],
      homework: [],
      classActivities: [],
      classParticipation: [],
      vivas: [],
      specialMarks: [],
      customActivities: []
    });
    
    markDoc = await Mark.findById(markDoc._id)
      .populate('student', 'name rollNo email personalNotificationEmail')
      .populate('classroom', 'className sectionPrefix');
  }

  res.status(200).json({
    status: 'success',
    data: { markDoc },
  });
});
// =============================================================================
// BYPASS LIMIT SETTINGS
// Teachers and admins cap how many activities per category a student may
// bypass. Limits are enforced at grading time in canBypass (see
// utils/bypassRules), so a TA cannot exceed them by bypassing the UI.
// =============================================================================

// Mongoose Maps do not serialise usefully, so always hand the client a plain
// object keyed by category.
const toPlainBypassLimits = (limits) => {
  const out = {};
  if (!limits) return out;
  if (typeof limits.entries === 'function') {
    for (const [key, value] of limits.entries()) out[key] = value;
    return out;
  }
  return { ...limits };
};

exports.getBypassLimits = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const classroom = await Classroom.findById(classroomId)
    .select('className bypassLimits quizzes assignments presentations projects homework classActivities classParticipation vivas specialMarks mids finals finalProject sessionalActivities')
    .lean();
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  res.status(200).json({
    status: 'success',
    data: {
      className: classroom.className,
      limits: toPlainBypassLimits(classroom.bypassLimits),
      // How many activities this room actually has per category. The UI uses
      // this to show a cap box only for categories that exist here, instead of
      // listing every category the schema happens to support.
      activityCounts: buildClassroomActivityCounts(classroom)
    }
  });
});

exports.updateBypassLimits = catchAsync(async (req, res, next) => {
  const { classroomId } = req.params;
  const incoming = req.body && req.body.limits;

  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return next(new AppError('A "limits" object keyed by category is required.', 400));
  }

  const classroom = await Classroom.findById(classroomId);
  if (!classroom) return next(new AppError('Classroom not found!', 404));

  const limits = {};
  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    const key = getNormalizedTargetKey(String(rawKey));
    if (!key) return next(new AppError(`Invalid category "${rawKey}".`, 400));

    // Accept "off" as an explicit way to disable a category.
    if (rawValue === 'off' || rawValue === null || rawValue === '') {
      limits[key] = 0;
      continue;
    }

    const n = Number(rawValue);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return next(new AppError(`Bypass limit for "${rawKey}" must be a whole number of 0 or more.`, 400));
    }

    // A student must always keep at least one real grade per category, so the
    // cap can never reach the number of activities that category has.
    const slots = countCategorySlots(classroom, key);
    const maxAllowed = slots > 0 ? slots - 1 : 0;
    if (slots > 0 && n > maxAllowed) {
      return next(new AppError(
        `"${rawKey}" only has ${slots} activit${slots === 1 ? 'y' : 'ies'}, so at most ${maxAllowed} can be bypassed - every student must keep one real grade.`,
        400
      ));
    }

    limits[key] = n;
  }

  classroom.bypassLimits = limits;
  await classroom.save();

  res.status(200).json({
    status: 'success',
    message: 'Bypass limits updated.',
    data: { limits: toPlainBypassLimits(classroom.bypassLimits) }
  });
});