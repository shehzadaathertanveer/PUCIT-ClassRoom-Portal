const LabMark = require('../models/labMarkSchema');
const Labroom = require('../models/labSchema');
const User = require('../models/userSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService');
const { createBypassRules, BYPASS_SENTINEL } = require('../utils/bypassRules');
const { computeLabWeightedPercentage, resolveCategoryKey } = require('../utils/labWeights');
const { getGradeAndGpa } = require('../utils/gradeScale');
const { partitionRoster, csvCell, csvPad, rosterWidths, blankRow } = require('../utils/exportCsv');
const { applyVivaMultiplier, normalizeVivaScore, withVivaAdjusted, effectiveMarks, VIVA_MAX } = require('../utils/viva');

const VALID_STANDARD_CATEGORIES = [
  'labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments',
  'presentations', 'finalProject', 'labMids', 'labFinals',
  'labActivities', 'labBehavior', 'labWorksheets', 'troubleshooting'
];

// Helper: Normalizes input categories to match schema arrays safely
const RESOLVE_LAB_CATEGORY = (raw = '') => {
  const clean = raw.trim().toLowerCase();
  if (clean.includes('task')) return 'labTasks';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('test')) return 'labTests';
  if (clean.includes('final project') || clean.includes('finalproject')) return 'finalProject';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('present')) return 'presentations';
  if (clean === 'mids' || clean === 'midterm' || clean.includes('lab mid') || clean.includes('labmid')) return 'labMids';
  if (clean === 'finals' || clean === 'final' || clean.includes('lab final') || clean.includes('labfinal')) return 'labFinals';
  if (clean.includes('activ')) return 'labActivities';
  if (clean.includes('behavior') || clean.includes('behaviour')) return 'labBehavior';
  if (clean.includes('worksheet')) return 'labWorksheets';
  if (clean.includes('troubleshoot')) return 'troubleshooting';
  
  const sanitizedCamel = clean
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  const potentialKey = sanitizedCamel.endsWith('s') ? sanitizedCamel : sanitizedCamel + 's';
  
  if (VALID_STANDARD_CATEGORIES.includes(potentialKey)) return potentialKey;

  return 'labTasks';
};

// Helper: Extract numbers safely for sorting roll numbers (e.g., BITF25A012 -> 12)
const getRollDigits = (rollNo = '') => {
  const digits = rollNo.replace(/\D/g, '');
  if (!digits) return 99999;
  return parseInt(digits.slice(-3), 10);
};

// ---------------------------------------------------------------------------
// Bypass ("B") support - shared with the Classroom mark controller so both
// room types enforce identical limits and cannot drift apart.
// Every Lab category (including labMids / labFinals / finalProject) is stored
// as an array of items, so no single-object special case is needed here.
// ---------------------------------------------------------------------------
// How many graded activities a labroom category holds. Used to clamp bypass
// limits so a student can never bypass every activity in a category.
const countLabSlots = (labroom, categoryKey) => {
  if (!labroom) return 0;
  // Every Labroom evaluation category is an array in labSchema.js, including
  // finalProject / labMids / labFinals. Treating those as single objects made the
  // count 0, which made getBypassLimit skip its clamp entirely and allowed a TA
  // to bypass every remaining activity in those categories.
  return Array.isArray(labroom[categoryKey]) ? labroom[categoryKey].length : 0;
};

const { canBypass } = createBypassRules({
  resolveKey: (catName = '') => RESOLVE_LAB_CATEGORY(String(catName || '')),
  getItems: (markDoc, categoryKey) => {
    const items = markDoc[categoryKey];
    return Array.isArray(items) ? items : (items ? [items] : []);
  },
  getSlotCount: countLabSlots
});

/**
 * How many activities this labroom actually holds in each category.
 *
 * The panel used to render a box for every category the schema supports, so the
 * handful a teacher really uses were buried under empty inputs. Reporting live
 * counts lets the UI show exactly this labroom's categories, recomputed on every
 * fetch so it follows the lab's activities as they are added or removed.
 *
 * Standard categories only. Labroom has no custom-activity bucket in its mark
 * schema and RESOLVE_LAB_CATEGORY folds unrecognised names into labTasks, so
 * deriving extra keys here would both double-count lab tasks and surface that
 * collision in the UI.
 */
const buildLabActivityCounts = (labroom) => {
  const counts = {};
  for (const key of VALID_STANDARD_CATEGORIES) {
    counts[key] = countLabSlots(labroom, key);
  }
  return counts;
};

// =============================================================================
// 1. GET BULK LAB MARK SHEET (Sorted 001->040 + Add/Drop)
// =============================================================================
exports.getBulkLabMarkSheet = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId)
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail')
    .lean();

  if (!labroom) {
    return next(new AppError('Labroom not found!', 404));
  }

  const prefix = labroom.sectionPrefix ? labroom.sectionPrefix.toUpperCase() : '';
  const regular = [];
  const addDrop = [];

  (labroom.students || []).forEach((student) => {
    const roll = student.rollNo ? student.rollNo.toUpperCase() : '';
    const reg = student.registrationNo ? student.registrationNo.toUpperCase() : '';
    if ((prefix && roll.startsWith(prefix)) || (prefix && reg.startsWith(prefix))) {
      regular.push(student);
    } else {
      addDrop.push(student);
    }
  });

  regular.sort((a, b) => getRollDigits(a.rollNo || a.registrationNo) - getRollDigits(b.rollNo || b.registrationNo));
  addDrop.sort((a, b) => (a.rollNo || a.registrationNo || '').localeCompare(b.rollNo || b.registrationNo || ''));

  const sortedStudents = [...regular, ...addDrop];
  const studentIds = sortedStudents.map((s) => s._id);

  const existingMarks = await LabMark.find({
    labroom: labroomId,
    student: { $in: studentIds },
  }).lean();

  res.status(200).json({
    status: 'success',
    data: {
      labroom: {
        _id: labroom._id,
        labName: labroom.labName,
        sectionPrefix: labroom.sectionPrefix,
        labTasks: labroom.labTasks || [],
        vivas: labroom.vivas || [],
        labTests: labroom.labTests || [],
        projects: labroom.projects || [],
        quizzes: labroom.quizzes || [],
        assignments: labroom.assignments || [],
        presentations: labroom.presentations || [],
        finalProject: labroom.finalProject || [],
        labMids: labroom.labMids || [],
        labFinals: labroom.labFinals || [],
        labActivities: labroom.labActivities || [],
        labBehavior: labroom.labBehavior || [],
        labWorksheets: labroom.labWorksheets || [],
        troubleshooting: labroom.troubleshooting || [],
        sessionalActivities: labroom.sessionalActivities || [],
      },
      students: sortedStudents,
      existingMarks,
    },
  });
});

// =============================================================================
// 1.1 GET UNASSIGNED STUDENTS FOR A SPECIFIC LAB ITEM
// =============================================================================
exports.getUnassignedLabStudents = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const { category, title } = req.query;

  if (!category || !title) {
    return next(new AppError('Category and item title are required!', 400));
  }

  const labroom = await Labroom.findById(labroomId)
    .populate('students', 'name rollNo registrationNo email personalNotificationEmail')
    .lean();

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const allStudents = labroom.students || [];
  const studentIds = allStudents.map(s => s._id);
  const markDocs = await LabMark.find({ labroom: labroomId, student: { $in: studentIds } }).lean();

  const gradedStudentIds = new Set();
  const cleanTitle = title.trim().toLowerCase();
  const standardKey = RESOLVE_LAB_CATEGORY(category);

  markDocs.forEach(doc => {
    const items = doc[standardKey] || [];
    if (Array.isArray(items)) {
      if (items.some(i => i.title && i.title.trim().toLowerCase() === cleanTitle)) {
        gradedStudentIds.add(doc.student.toString());
      }
    } else if (items && items.title && items.title.trim().toLowerCase() === cleanTitle) {
      gradedStudentIds.add(doc.student.toString());
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
// 1.2 GET PENDING GRADING ACTIVITIES & UNGRADED COUNTS
// =============================================================================
exports.getPendingLabActivities = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId).populate('students', '_id').lean();
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const totalStudentsCount = (labroom.students || []).length;
  if (totalStudentsCount === 0) {
    return res.status(200).json({ status: 'success', data: { pendingActivities: [] } });
  }

  const markDocs = await LabMark.find({ labroom: labroomId }).lean();
  const gradedCountMap = {};

  markDocs.forEach(doc => {
    const studentId = doc.student.toString();
    
    VALID_STANDARD_CATEGORIES.forEach(cat => {
      const itemsList = doc[cat];
      if (Array.isArray(itemsList)) {
        itemsList.forEach(item => {
          if (item.title) {
            const key = `${cat}:${item.title.trim().toLowerCase()}`;
            if (!gradedCountMap[key]) gradedCountMap[key] = new Set();
            if ((item.obtainedMarks !== undefined && item.obtainedMarks !== null) || item.isAbsent === true) {
              gradedCountMap[key].add(studentId);
            }
          }
        });
      } else if (itemsList && itemsList.title) {
        const key = `${cat}:${itemsList.title.trim().toLowerCase()}`;
        if (!gradedCountMap[key]) gradedCountMap[key] = new Set();
        if ((itemsList.obtainedMarks !== undefined && itemsList.obtainedMarks !== null) || itemsList.isAbsent === true) {
          gradedCountMap[key].add(studentId);
        }
      }
    });
  });

  const pendingActivities = [];

  VALID_STANDARD_CATEGORIES.forEach(catKey => {
    const items = labroom[catKey];
    if (Array.isArray(items)) {
      items.forEach(item => {
        const key = `${catKey}:${item.title.trim().toLowerCase()}`;
        const gradedSet = gradedCountMap[key] || new Set();
        const remainingCount = totalStudentsCount - gradedSet.size;

        if (remainingCount > 0) {
          pendingActivities.push({
            category: catKey,
            title: item.title,
            totalStudents: totalStudentsCount,
            gradedCount: gradedSet.size,
            remainingCount
          });
        }
      });
    } else if (items && items.title) {
      const key = `${catKey}:${items.title.trim().toLowerCase()}`;
      const gradedSet = gradedCountMap[key] || new Set();
      const remainingCount = totalStudentsCount - gradedSet.size;

      if (remainingCount > 0) {
        pendingActivities.push({
          category: catKey,
          title: items.title,
          totalStudents: totalStudentsCount,
          gradedCount: gradedSet.size,
          remainingCount
        });
      }
    }
  });

  res.status(200).json({
    status: 'success',
    data: { pendingActivities }
  });
});

// =============================================================================
// 1.3 GET LABROOM ANALYTICS, CLASS AVERAGES & SECURE RANKINGS
// =============================================================================
exports.getLabroomAnalytics = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const labroom = await Labroom.findById(labroomId)
    .populate('students', '_id rollNo registrationNo name')
    .populate('teacher', '_id')
    .populate('tas', '_id')
    .lean();

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const isInstructor = labroom.teacher && labroom.teacher._id.toString() === userId.toString();
  const isTa = labroom.tas && labroom.tas.some(ta => ta._id.toString() === userId.toString());
  const isStaffOrAdmin = userRole === 'ADMIN' || userRole === 'TEACHER' || isInstructor || isTa;

  if (!isStaffOrAdmin) {
    let studentMark = await LabMark.findOne({ labroom: labroomId, student: userId })
      .populate('student', 'name rollNo registrationNo email personalNotificationEmail')
      .lean();

    if (!studentMark) {
      studentMark = {
        labroom: labroomId,
        student: userId,
        labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [],
        presentations: [], finalProject: [], labMids: [], labFinals: [],
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: []
      };
    }

    return res.status(200).json({
      status: 'success',
      data: {
        isStaff: false,
        studentMark
      }
    });
  }

  const markDocs = await LabMark.find({ labroom: labroomId }).populate('student', 'name rollNo registrationNo').lean();
  const activeStudentIds = new Set((labroom.students || []).map(s => s._id.toString()));
  const validDocs = markDocs.filter(doc => doc.student && activeStudentIds.has(doc.student._id.toString()));

  if (validDocs.length === 0) {
    return res.status(200).json({
      status: 'success',
      data: {
        isStaff: true,
        classAverages: { overallLabPercentage: 0 },
        rankings: []
      }
    });
  }

  let sumOverall = 0;
  let sumGradePoints = 0;

  const rankings = validDocs.map(doc => {
    // Weighted overall comes from the shared helper, which is the same code the
    // CSV export uses. Keeping one implementation is what guarantees a student's
    // exported "Overall %" matches their leaderboard percentage.
    const weighted = computeLabWeightedPercentage(labroom, doc);
    const { percentage, marksObtained, marksPossible, totalMarks, finalMarks, hasWeights, categoryPercentages } = weighted;

    // Flat per-category percentages for the leaderboard filters. Keys stay as
    // `<targetKey>Percentage` because the frontend reads exactly that shape.
    const catStats = {};
    VALID_STANDARD_CATEGORIES.forEach(k => {
      catStats[k + 'Percentage'] = categoryPercentages[k] !== undefined ? categoryPercentages[k] : 0;
    });

    sumOverall += percentage;

    // A lab is graded on the same scale as a classroom, so students see the same
    // letter and grade point they would get in the theory half.
    const graded = getGradeAndGpa(percentage);
    sumGradePoints += graded.gradePoint;

    return {
      student: doc.student,
      marksDoc: doc,
      percentage,
      overallPercentage: percentage,
      // Marks out of the room's allocated total, so the UI can show "35.00/50"
      // as well as the 70% that produced it.
      finalMarks,
      totalMarks,
      letterGrade: graded.grade,
      gradePoint: graded.gradePoint,
      isFailing: graded.isFailing,
      isWeighted: hasWeights,
      totalObtained: marksObtained,
      totalPossible: marksPossible,
      ...catStats
    };
  });

  rankings.sort((a, b) => b.percentage - a.percentage);

  const labTotal = Number(labroom?.totalMarks) > 0 ? Number(labroom.totalMarks) : 100;
  const classAverages = {
    overallLabPercentage: Number((sumOverall / validDocs.length).toFixed(2)),
    // Marks out of the lab's allocated total, e.g. "36.13/50". This used to repeat
    // the average percentage unchanged, so a 50-mark lab displayed "72.25/50" - a
    // score above the maximum. The percentage is now resolved against the total.
    overallMarks: Number(((sumOverall / validDocs.length) / 100 * labTotal).toFixed(2)),
    averageGradePoint: validDocs.length > 0 ? Number((sumGradePoints / validDocs.length).toFixed(2)) : 0,
    gradePointScale: '4.00',
    totalMarks: labTotal
  };

  // Persist the cached overall percentage. LabMark.studentLabPercentage existed
  // in the schema but was never assigned, so it always read back as 0 - which
  // made any consumer of the cached field disagree with the analytics endpoint.
  const percentageUpdates = rankings
    .filter((r) => {
      if (!r.marksDoc || !r.marksDoc._id) return false;
      // Analytics is a GET, and the leaderboard is re-fetched on every tab switch
      // and every poll. Writing a row whose value already matches turns a read
      // into N pointless writes, so only genuinely stale caches are refreshed.
      const cached = Number(r.marksDoc.studentLabPercentage);
      const cachedGp = Number(r.marksDoc.gradePoint);
      const cachedGrade = String(r.marksDoc.letterGrade || '');
      return !Number.isFinite(cached) || cached !== r.percentage
        || !Number.isFinite(cachedGp) || cachedGp !== r.gradePoint
        || cachedGrade !== r.letterGrade;
    })
    .map((r) => ({
      updateOne: {
        filter: { _id: r.marksDoc._id },
        // Grade and grade point ride along with the percentage so a consumer
        // reading only the cached fields still sees a consistent record.
        update: {
          $set: {
            studentLabPercentage: r.percentage,
            letterGrade: r.letterGrade,
            gradePoint: r.gradePoint,
            isFailing: r.isFailing
          }
        }
      }
    }));

  if (percentageUpdates.length > 0) {
    try {
      await LabMark.bulkWrite(percentageUpdates, { ordered: false });
    } catch (err) {
      // Never fail the analytics request over a cache refresh.
      console.warn('studentLabPercentage cache refresh failed:', err.message);
    }
  }

  // Per-category class averages (e.g. classAverages['labTasksPercentage'])
  VALID_STANDARD_CATEGORIES.forEach(targetKey => {
    let catSum = 0;
    rankings.forEach(r => {
      catSum += Number(r[targetKey + 'Percentage'] || 0);
    });
    classAverages[targetKey + 'Percentage'] = Number((catSum / rankings.length).toFixed(2));
  });

  res.status(200).json({
    status: 'success',
    data: {
      isStaff: true,
      classAverages,
      rankings
    }
  });
});

// =============================================================================
// 1.4 EXPORT COMPLETE LAB RESULT SHEET AS CSV FILE DOWNLOAD
// =============================================================================
exports.downloadLabExcelExport = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId)
    .populate('students', '_id rollNo registrationNo name')
    .lean();

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const markDocs = await LabMark.find({ labroom: labroomId }).populate('student', '_id rollNo registrationNo name').lean();
  const markDocMap = new Map(markDocs.map(m => [m.student?._id?.toString(), m]));

  const labTotal = Number(labroom.totalMarks) > 0 ? Number(labroom.totalMarks) : 100;

  // mode: "roster" = names/roll numbers only, "current" = only activities that
  // have marks entered, "final" = the full deep breakdown.
  const mode = String(req.query.mode || 'final').toLowerCase();
  const safeName = String(labroom.labName || 'Labroom').replace(/[^A-Za-z0-9 _-]/g, '').trim();

  // Only the activities the teacher actually configured get columns. Iterating
  // VALID_STANDARD_CATEGORIES instead meant every schema slot appeared in the sheet
  // whether or not the room used it, so a lab with two activities exported fourteen.
  const allActivities = ((labroom.sessionalActivities) || [])
    .map(act => {
      const targetKey = resolveCategoryKey(act.category);
      const weight = Number(act.allocatedMarks || 0);
      if (!targetKey || weight <= 0) return null;
      const raw = labroom[targetKey];
      const items = Array.isArray(raw)
        ? raw
        : (raw && raw.title ? [raw] : []);
      return { category: act.category, targetKey, weight, items };
    })
    .filter(Boolean);

  const students = labroom.students || [];
  const getStudentId = (s) => s.rollNo || s.registrationNo || '';

  // Roster mode needs nothing but the two identity columns.
  if (mode === 'roster') {
    const { regular, addDrop } = partitionRoster(students, labroom.sectionPrefix, getStudentId);
    const widths = rosterWidths([...regular, ...addDrop], getStudentId);
    const rows = [
      `${csvCell('Roll / Reg No')},${csvCell('Student Name')}`
    ];
    const emit = (list) => {
      list.forEach((st) => {
        rows.push(
          `${csvPad(st.rollNo || st.registrationNo || 'N/A', widths.roll)},${csvPad(st.name || 'Unknown', widths.name)}`
        );
      });
    };
    emit(regular);
    if (addDrop.length > 0) {
      rows.push('');
      emit(addDrop);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${safeName}_Roster.csv`);
    return res.status(200).send(rows.join('\n'));
  }

  // "current" mode keeps only activities with marks actually entered, so a
  // part-finished term does not export a wall of empty zeros.
  const entriesFor = (doc, targetKey) => {
    const scores = doc[targetKey];
    return Array.isArray(scores) ? scores : (scores && scores.title ? [scores] : []);
  };
  const hasEntered = (targetKey) =>
    students.some((st) => entriesFor(markDocMap.get(st._id.toString()) || {}, targetKey).length > 0);
  const configuredActivities =
    mode === 'current' ? allActivities.filter((a) => hasEntered(a.targetKey)) : allActivities;

  const csvRows = [];
  const headerRow = ['Roll / Reg No', 'Student Name'];

  // Group 1: the raw marks behind every activity item.
  configuredActivities.forEach(({ category, items }) => {
    items.forEach(item => {
      headerRow.push(`"${category}: ${item.title} (${item.totalMarks || 10})"`);
    });
  });
  headerRow.push('');
  // Group 2: each activity resolved against its share of the lab total. A lab
  // activity's weight is a PERCENTAGE of the total, not marks, so its marks are
  // pct/100 * weight% * total.
  configuredActivities.forEach(({ category, weight }) => {
    headerRow.push(`"${category} %"`, `"${category} Marks (wt ${weight}% of ${labTotal})"`, `"${category} Wt"`);
  });
  headerRow.push('');
  // Group 3: the result.
  headerRow.push('"Total %"', `"Total Obtained (of ${labTotal})"`, '"Grade"', '"Grade Point"');
  csvRows.push(headerRow.join(','));

  // Resolves a percentage inside a weighted block into the marks it contributes,
  // mirroring marksFromPct on the classroom export. For a lab the weight is a
  // percentage of the room's total, so a 60% activity in a 50-mark lab is worth 30
  // marks and contributes 18 of them at 60%.
  const marksFromPct = (pct, weightPct) =>
    Number(((Number(pct || 0) / 100) * ((Number(weightPct) || 0) / 100) * labTotal).toFixed(2));

  // Regular students first in ascending identifier order, add/drop students last
  // behind a blank separator so the two groups are never read as one roster.
  const { regular, addDrop } = partitionRoster(students, labroom.sectionPrefix, getStudentId);
  const widths = rosterWidths([...regular, ...addDrop], getStudentId);
  const totalColumns = headerRow.length;

  const emitRows = (list) => {
    list.forEach(st => {
    const doc = markDocMap.get(st._id.toString()) || {};
    const identifier = st.rollNo || st.registrationNo || 'N/A';
    let rowData = [
      csvPad(identifier, widths.roll),
      csvPad(st.name || 'Unknown', widths.name)
    ];

    configuredActivities.forEach(({ targetKey, items }) => {
      const entries = entriesFor(doc, targetKey);

      items.forEach(item => {
        const match = entries.find(
          s => s?.title?.trim().toLowerCase() === item.title?.trim().toLowerCase()
        );
        // Absent, bypassed and not-yet-graded are three different states and used
        // to all export as 0, so a sheet could not tell a real zero from an activity
        // that never happened or was never entered.
        if (!match) { rowData.push(''); return; }
        if (match.isBypassed) { rowData.push('Bypassed(-)'); return; }
        if (match.isAbsent) { rowData.push('Absent(0)'); return; }
        // VIVA-ADJUSTED, not the raw score. The overall % further down these rows is
        // computed from the adjusted marks, so exporting raw marks here would print
        // components that do not add up to the total beside them.
        rowData.push(match.hasViva ? effectiveMarks(match) : (match.obtainedMarks ?? ''));
      });
    });

    rowData.push('');

    // The exported "Overall %" must be the SAME weighted percentage the leaderboard
    // shows. This used to pool raw marks across every activity
    // (totalObtAll / totalPossAll), which ignores the teacher's allocated weights
    // entirely - so the sheet reported something closer to the sessional mark
    // distribution and disagreed with the app's own overall.
    const weighted = computeLabWeightedPercentage(labroom, doc);

    // Group 2 values: each configured activity's own percentage and the marks it
    // contributes. categoryPercentages comes from the same helper that produced the
    // overall figure, so the columns always reconcile with the total below them.
    configuredActivities.forEach(({ targetKey, weight }) => {
      const catPct = Number(weighted.categoryPercentages[targetKey] || 0);
      rowData.push(
        `"${catPct.toFixed(2)}%"`,
        `"${marksFromPct(catPct, weight).toFixed(2)}"`,
        `"${weight}%"`
      );
    });

    rowData.push('');

    // Group 3: the result. Grade and grade point come from the shared scale, so the
    // sheet matches the app's leaderboard and the stored transcript. The old
    // hand-written thresholds here used A+/A/B+ and had no grade points.
    const graded = getGradeAndGpa(weighted.percentage);
    rowData.push(
      `"${weighted.percentage.toFixed(2)}%"`,
      `"${weighted.finalMarks.toFixed(2)}"`,
      `"${graded.grade}"`,
      `"${graded.gradePoint.toFixed(2)}"`
    );
    csvRows.push(rowData.join(','));
    });
  };

  emitRows(regular);
  if (addDrop.length > 0) {
    csvRows.push(blankRow(totalColumns).join(','));
    emitRows(addDrop);
  }

  const csvString = csvRows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const suffix = mode === 'current' ? 'Current_Results' : 'Results';
  res.setHeader('Content-Disposition', `attachment; filename=${safeName}_${suffix}.csv`);
  return res.status(200).send(csvString);
});

// =============================================================================
// 2. BATCH SUBMIT LAB MARKS (Targeted Notifications & File Attachments)
// =============================================================================
exports.batchSubmitLabMarks = catchAsync(async (req, res, next) => {
  const { labroomId, category, title, totalMarks, marksData, hasViva } = req.body;

  if (!labroomId || totalMarks === undefined || !Array.isArray(marksData) || marksData.length === 0) {
    return next(new AppError('Labroom ID, Total Marks (>0), and Marks Data array are required!', 400));
  }

  const parsedTotal = Number(totalMarks);
  if (isNaN(parsedTotal) || parsedTotal <= 0) {
    return next(new AppError('Total marks must be valid and greater than 0!', 400));
  }

  // Omitted `hasViva` means OFF, not "keep whatever was there". The sheet always
  // sends the toggle's current value, so an absent flag can only be an older
  // client - and the safe reading for those is the pre-viva behaviour, which is
  // also what every already-graded lab activity keeps.
  const vivaEnabled = hasViva === true || hasViva === 'true';

  const standardKey = RESOLVE_LAB_CATEGORY(category || '');
  let cleanTitle = (title || '').trim();

  if (!cleanTitle) {
    cleanTitle = `Lab Item Entry`;
  }

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  // The room-side definition carries hasViva so the marksheet can render the
  // viva column from the moment the activity is opened, before any marks exist.
  if (['labMids', 'labFinals', 'finalProject'].includes(standardKey)) {
    labroom[standardKey] = [{ title: cleanTitle, totalMarks: parsedTotal, hasViva: vivaEnabled }];
  } else {
    if (!Array.isArray(labroom[standardKey])) labroom[standardKey] = [];
    const exists = labroom[standardKey].find(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
    if (exists) {
      exists.totalMarks = parsedTotal;
      exists.hasViva = vivaEnabled;
    } else {
      labroom[standardKey].push({ title: cleanTitle, totalMarks: parsedTotal, hasViva: vivaEnabled });
    }
  }
  await labroom.save();

  const validEntries = marksData.map(item => ({
    studentId: item.studentId || item.student || item._id,
    obtainedMarks: item.obtainedMarks !== undefined ? item.obtainedMarks : (item.marks !== undefined ? item.marks : item.score),
    vivaMarks: item.vivaMarks,
    file: item.file || {}
  })).filter(item => {
    if (!item.studentId) return false;
    const rawVal = item.obtainedMarks;
    if (rawVal === undefined || rawVal === null) return false;
    const str = String(rawVal).trim();
    // "B" requests a bypass, so it must survive this filter.
    if (str.toUpperCase() === BYPASS_SENTINEL) return true;
    // -99 is the UI sentinel for "ungraded" - never persist it as a real mark.
    if (Number(str) === -99) return false;
    return str !== '' || str.toUpperCase() === 'A';
  });

  if (validEntries.length === 0) {
    return next(new AppError('No valid student marks were provided for submission.', 400));
  }

  // A viva-gated activity needs a viva score on every graded row. Rejecting the
  // whole batch is deliberate: silently defaulting a missing viva would either
  // silently zero a student or silently grant full marks, and both are worse than
  // asking the teacher to fill in the highlighted boxes. Absent and bypassed rows
  // are exempt - there is nothing to multiply.
  if (vivaEnabled) {
    const missingViva = validEntries.filter((e) => {
      const raw = String(e.obtainedMarks).trim();
      if (raw.toUpperCase() === 'A' || raw.toUpperCase() === BYPASS_SENTINEL) return false;
      return normalizeVivaScore(e.vivaMarks) === null;
    });
    if (missingViva.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: `Viva is ON for this activity, so every graded student needs a viva score out of ${VIVA_MAX}. ${missingViva.length} row(s) are missing one.`,
        data: { missingCount: missingViva.length, studentIds: missingViva.map(e => e.studentId) }
      });
    }
  }

  const studentIds = validEntries.map(e => e.studentId);
  const students = await User.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  const existingDocs = await LabMark.find({ labroom: labroomId, student: { $in: studentIds } });
  const docMap = new Map(existingDocs.map(d => [d.student.toString(), d]));
  const docsToSave = [];
  const emailList = [];
  const successfullyGradedStudentIds = [];

  for (const entry of validEntries) {
    const studentIdStr = entry.studentId.toString();
    const rawVal = String(entry.obtainedMarks).trim();
    const isAbsent = rawVal.toUpperCase() === 'A';
    const isBypass = !isAbsent && rawVal.toUpperCase() === BYPASS_SENTINEL;
    if (!isAbsent && !isBypass && (isNaN(Number(rawVal)) || Number(rawVal) < 0)) {
      continue;
    }
    const parsedObtained = (isAbsent || isBypass) ? 0 : Math.max(0, Number(rawVal) || 0);
    const parsedViva = vivaEnabled && !isAbsent && !isBypass ? normalizeVivaScore(entry.vivaMarks) : null;
    const fileData = entry.file || {};

    let markDoc = docMap.get(studentIdStr);
    let marksChanged = !markDoc;

    // Bypass is capped per student per category, enforced here so the cap holds
    // regardless of what the client sends (a TA cannot bypass the UI to exceed it).
    if (isBypass) {
      const verdict = canBypass(labroom, markDoc, standardKey, cleanTitle);
      if (!verdict.allowed) {
        return res.status(400).json({
          status: 'fail',
          message: verdict.message,
          data: {
            limit: verdict.limit,
            used: verdict.used,
            category: standardKey,
            studentId: entry.studentId,
            studentName: studentMap.get(studentIdStr)?.name || 'Unknown'
          }
        });
      }
    }

    if (markDoc) {
      const existingItems = markDoc[standardKey];
      const existingItem = Array.isArray(existingItems)
        ? existingItems.find(i => i.title && i.title.toLowerCase() === cleanTitle.toLowerCase())
        : (existingItems && existingItems.title && existingItems.title.toLowerCase() === cleanTitle.toLowerCase() ? existingItems : null);

      if (!existingItem) {
        marksChanged = true;
      } else {
        const oldObtained = Number(existingItem.obtainedMarks) || 0;
        const oldAbsent = existingItem.isAbsent === true;
        const oldBypassed = existingItem.isBypassed === true;
        const oldTotal = Number(existingItem.totalMarks) || 0;
        const oldVivaEnabled = existingItem.hasViva === true;
        const oldViva = normalizeVivaScore(existingItem.vivaMarks);
        marksChanged = oldObtained !== parsedObtained || oldAbsent !== isAbsent ||
                       oldBypassed !== isBypass || oldTotal !== parsedTotal ||
                       oldVivaEnabled !== vivaEnabled || oldViva !== parsedViva;
      }
    }

    if (!markDoc) {
      markDoc = new LabMark({
        labroom: labroomId,
        student: entry.studentId,
        labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [],
        presentations: [], finalProject: [], labMids: [], labFinals: [],
        labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: []
      });
    }

    // Reaching here means a real value was submitted: a number (including 0), "A",
    // or "B". The -99/empty ungraded sentinel was already filtered out above, so
    // mark the row graded - this is what keeps a legitimate 0 score from being
    // re-read as "ungraded" later.
    // vivaAdjustedMarks is computed HERE rather than trusted from the client, and
    // it is stored alongside the raw score so the sheet can show both "scored 80"
    // and "viva 0 means that counts as 0".
    const itemPayload = withVivaAdjusted({
      title: cleanTitle,
      totalMarks: parsedTotal,
      obtainedMarks: parsedObtained,
      hasViva: vivaEnabled,
      vivaMarks: parsedViva,
      isGraded: true,
      isAbsent,
      isBypassed: isBypass,
      file: fileData
    });

    if (['labMids', 'labFinals', 'finalProject'].includes(standardKey)) {
      markDoc[standardKey] = [itemPayload];
    } else {
      if (!Array.isArray(markDoc[standardKey])) markDoc[standardKey] = [];
      const idx = markDoc[standardKey].findIndex(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
      if (idx > -1) {
        markDoc[standardKey][idx] = { ...markDoc[standardKey][idx], ...itemPayload };
      } else {
        markDoc[standardKey].push(itemPayload);
      }
    }

    docsToSave.push(markDoc);

    // Only notify students whose grade actually changed (avoids duplicate emails
    // when the same marksheet is re-submitted or ungraded entries are added).
    if (!marksChanged) continue;

    successfullyGradedStudentIds.push(studentIdStr);

    const studentUser = studentMap.get(studentIdStr);
    if (studentUser) {
      const email = studentUser.personalNotificationEmail || studentUser.email;
      if (email && !email.includes('@temp.pucit.edu.pk')) {
        emailList.push({
          email,
          title: `${cleanTitle}`,
          bodyText: isAbsent
            ? `You were marked absent for <strong>${cleanTitle}</strong> in lab <strong>${labroom.labName}</strong>.`
            : isBypass
              ? `<strong>${cleanTitle}</strong> in lab <strong>${labroom.labName}</strong> was marked as bypassed and is excluded from your grade.`
              : `Your lab grade for <strong>${cleanTitle}</strong> has been uploaded.`,
          details: [
            { label: 'Lab', value: labroom.labName },
            { label: 'Score', value: isAbsent
                ? `Absent (0 / ${parsedTotal})`
                : isBypass
                  ? 'Bypassed (excluded from grade)'
                  : `${parsedObtained} / ${parsedTotal}` },
            // The viva and its effect are both surfaced so a student can see WHY
            // their marks changed rather than finding a lower number with no reason.
            ...(vivaEnabled && parsedViva !== null
              ? [
                  { label: 'Viva (out of 10)', value: `${parsedViva}` },
                  { label: 'Marks after viva', value: `${applyVivaMultiplier(parsedObtained, parsedViva)} / ${parsedTotal}` }
                ]
              : []),
            { label: 'Graded By', value: req.user.name }
          ]
        });
      }
    }
  }

  await Promise.all(docsToSave.map(d => d.save()));

  // Neutralize students left at -99 (ungraded) for this lab evaluation so cleared boxes truly unmark them.
  const submittedIds = new Set(validEntries.map(e => e.studentId.toString()));
  const enrolledIds = (labroom.students || []).map(s => (s && s._id ? s._id : s).toString());
  const excludedIds = enrolledIds.filter(id => !submittedIds.has(id));
  if (excludedIds.length > 0) {
    await LabMark.updateMany(
      { labroom: labroomId, student: { $in: excludedIds }, [standardKey]: { $elemMatch: { title: cleanTitle } } },
      { $pull: { [standardKey]: { title: cleanTitle } } }
    );
  }

  await Promise.all(
    emailList.map(async (m) => {
      try {
        await sendStyledEmail({
          to: m.email,
          subject: `Lab Marks Uploaded: ${m.title}`,
          title: m.title,
          bodyText: m.bodyText,
          details: m.details
        });
      } catch (err) {
        console.warn('Email dispatch failed:', err.message);
      }
    })
  );

  res.status(200).json({
    status: 'success',
    message: `Successfully recorded grades for ${successfullyGradedStudentIds.length} student(s)!`,
  });
});

// =============================================================================
// 3. UPDATE SINGLE STUDENT ITEM MARK (With File Attachment Support)
// =============================================================================
exports.updateSingleStudentLabMark = catchAsync(async (req, res, next) => {
  const { labroomId, studentId, category, itemTitle, obtainedMarks, totalMarks, file, vivaMarks, hasViva } = req.body;

  if (!labroomId || !studentId || !category || !itemTitle) {
    return next(new AppError('Labroom ID, Student ID, category, and item title are required!', 400));
  }

  const [labroom, student] = await Promise.all([
    Labroom.findById(labroomId),
    User.findById(studentId).select('name email personalNotificationEmail')
  ]);

  if (!labroom) return next(new AppError('Labroom not found!', 404));
  if (!student) return next(new AppError('Student not found!', 404));

  let markDoc = await LabMark.findOne({ labroom: labroomId, student: studentId });
  if (!markDoc) {
    markDoc = new LabMark({
      labroom: labroomId,
      student: studentId,
      labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [],
      presentations: [], finalProject: [], labMids: [], labFinals: [],
      labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: []
    });
  }

  const standardKey = RESOLVE_LAB_CATEGORY(category);
  const cleanTitle = itemTitle.trim();

  const currentTotal = totalMarks !== undefined ? Number(totalMarks) : 10;
  const rawVal = String(obtainedMarks).trim();
  const isAbsent = rawVal.toUpperCase() === 'A';
  const isBypass = !isAbsent && rawVal.toUpperCase() === BYPASS_SENTINEL;
  const currentObtained = (isAbsent || isBypass) ? 0 : Math.max(0, Number(rawVal) || 0);
  const fileData = file || {};

  // Only notify the student when their grade actually changes.
  const existingItems = markDoc[standardKey];
  const existingItem = Array.isArray(existingItems)
    ? existingItems.find(i => i.title && i.title.toLowerCase() === cleanTitle.toLowerCase())
    : (existingItems && existingItems.title && existingItems.title.toLowerCase() === cleanTitle.toLowerCase() ? existingItems : null);

  // Single-row edit falls back to whatever the row already had, so nudging one
  // student's viva without touching their score does not blank the other field.
  const singleVivaEnabled = hasViva === undefined
    ? Boolean(existingItem && existingItem.hasViva)
    : (hasViva === true || hasViva === 'true');
  const singleViva = singleVivaEnabled
    ? normalizeVivaScore(vivaMarks !== undefined ? vivaMarks : (existingItem ? existingItem.vivaMarks : null))
    : null;
  if (singleVivaEnabled && !isAbsent && !isBypass && singleViva === null) {
    return next(new AppError(`Viva is ON for this activity, so a viva score out of ${VIVA_MAX} is required.`, 400));
  }

  if (isBypass) {
    const verdict = canBypass(labroom, markDoc, standardKey, cleanTitle);
    if (!verdict.allowed) return next(new AppError(verdict.message, 400));
  }

  let marksChanged = !existingItem;
  if (existingItem) {
    const oldObtained = Number(existingItem.obtainedMarks) || 0;
    const oldAbsent = existingItem.isAbsent === true;
    const oldBypassed = existingItem.isBypassed === true;
    const oldTotal = Number(existingItem.totalMarks) || 0;
    const oldVivaEnabled = existingItem.hasViva === true;
    const oldViva = normalizeVivaScore(existingItem.vivaMarks);
    marksChanged = oldObtained !== currentObtained || oldAbsent !== isAbsent ||
                   oldBypassed !== isBypass || oldTotal !== currentTotal ||
                   oldVivaEnabled !== singleVivaEnabled || oldViva !== singleViva;
  }

  // Same reasoning as the bulk path: a submitted value means graded, so a real 0
  // is preserved as a 0 on reload instead of being normalised to ungraded.
  const itemPayload = withVivaAdjusted({
    title: cleanTitle,
    totalMarks: currentTotal,
    obtainedMarks: currentObtained,
    hasViva: singleVivaEnabled,
    vivaMarks: singleViva,
    isGraded: true,
    isAbsent,
    isBypassed: isBypass,
    file: fileData
  });

  if (['labMids', 'labFinals', 'finalProject'].includes(standardKey)) {
    markDoc[standardKey] = [itemPayload];
  } else {
    if (!Array.isArray(markDoc[standardKey])) markDoc[standardKey] = [];
    const idx = markDoc[standardKey].findIndex(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
    if (idx > -1) {
      markDoc[standardKey][idx] = { ...markDoc[standardKey][idx], ...itemPayload };
    } else {
      markDoc[standardKey].push(itemPayload);
    }
  }

  await markDoc.save();

  const studentEmail = student.personalNotificationEmail || student.email;
  if (marksChanged && studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
    try {
      await sendStyledEmail({
        to: studentEmail,
        subject: `Lab Mark Updated: ${cleanTitle}`,
        title: `Grade Update: ${cleanTitle}`,
        bodyText: isAbsent
          ? `You were marked absent for <strong>${cleanTitle}</strong> in lab <strong>${labroom.labName}</strong>.`
          : isBypass
            ? `<strong>${cleanTitle}</strong> in lab <strong>${labroom.labName}</strong> is now bypassed and excluded from your grade.`
            : `Your lab grade for <strong>${cleanTitle}</strong> has been updated.`,
        details: [
          { label: 'Lab Course', value: labroom.labName },
          { label: 'Updated Score', value: isAbsent
              ? `Absent (0 / ${currentTotal})`
              : isBypass
                ? 'Bypassed (excluded from grade)'
                : `${currentObtained} / ${currentTotal}` },
          ...(singleVivaEnabled && singleViva !== null
            ? [
                { label: 'Viva (out of 10)', value: `${singleViva}` },
                { label: 'Marks after viva', value: `${applyVivaMultiplier(currentObtained, singleViva)} / ${currentTotal}` }
              ]
            : []),
          { label: 'Updated By', value: req.user.name }
        ]
      });
    } catch (err) {
      console.warn('Single student email dispatch failed:', err.message);
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Lab mark updated successfully!',
    data: { markDoc },
  });
});

// =============================================================================
// 4. GET SINGLE STUDENT LAB MARKS
// =============================================================================
exports.getStudentLabMarks = catchAsync(async (req, res, next) => {
  const { labroomId, studentId } = req.params;

  let markDoc = await LabMark.findOne({ labroom: labroomId, student: studentId })
    .populate('student', 'name rollNo registrationNo email personalNotificationEmail')
    .populate('labroom', 'labName sectionPrefix');

  if (!markDoc) {
    markDoc = await LabMark.create({
      labroom: labroomId,
      student: studentId,
      labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [],
      presentations: [], finalProject: [], labMids: [], labFinals: [],
      labActivities: [], labBehavior: [], labWorksheets: [], troubleshooting: []
    });
    markDoc = await LabMark.findById(markDoc._id)
      .populate('student', 'name rollNo registrationNo email personalNotificationEmail')
      .populate('labroom', 'labName sectionPrefix');
  }

  res.status(200).json({
    status: 'success',
    data: { markDoc },
  });
});

// =============================================================================
// 5. DELETE / CANCEL LAB EVALUATION ENTRY ACROSS ALL STUDENTS
// =============================================================================
exports.deleteEvaluationEntry = catchAsync(async (req, res, next) => {
  const { labroomId, category, itemTitle } = req.body;

  if (!labroomId || !category) {
    return next(new AppError('Labroom ID and category are required!', 400));
  }

  const cleanTitle = (itemTitle || '').trim();
  const standardKey = RESOLVE_LAB_CATEGORY(category);

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  if (['labMids', 'labFinals', 'finalProject'].includes(standardKey)) {
    labroom[standardKey] = [];
    await labroom.save();

    await LabMark.updateMany(
      { labroom: labroomId },
      { $set: { [standardKey]: [] } }
    );
  } else {
    if (!cleanTitle) {
      return next(new AppError('Item title is required for deletion!', 400));
    }
    labroom[standardKey] = (labroom[standardKey] || []).filter(
      i => i.title.toLowerCase() !== cleanTitle.toLowerCase()
    );
    await labroom.save();

    await LabMark.updateMany(
      { labroom: labroomId },
      { $pull: { [standardKey]: { title: { $regex: new RegExp(`^${cleanTitle}$`, 'i') } } } }
    );
  }

  res.status(200).json({
    status: 'success',
    message: `Lab evaluation successfully removed.`,
  });
});
// =============================================================================
// BYPASS LIMIT SETTINGS (Labroom)
// Mirrors the classroom implementation so both room types behave identically.
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

// Every lab category is stored as an array, including labMids / labFinals /
// finalProject, so counting activities is a single array-length check.
const countLabCategorySlots = (labroom, categoryKey) =>
  (Array.isArray(labroom[categoryKey]) ? labroom[categoryKey] : []).filter(a => a && a.title).length;

exports.getLabBypassLimits = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const labroom = await Labroom.findById(labroomId)
    .select('labName bypassLimits labTasks quizzes assignments presentations vivas labTests projects troubleshooting labWorksheets labBehavior labActivities labMids labFinals finalProject sessionalActivities')
    .lean();
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  res.status(200).json({
    status: 'success',
    data: {
      labName: labroom.labName,
      limits: toPlainBypassLimits(labroom.bypassLimits),
      // Same purpose as the classroom endpoint: only offer a cap box for the
      // categories this labroom actually has, and re-read on every fetch so the
      // list tracks the lab's activities as they change.
      activityCounts: buildLabActivityCounts(labroom)
    }
  });
});

exports.updateLabBypassLimits = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;
  const incoming = req.body && req.body.limits;

  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return next(new AppError('A "limits" object keyed by category is required.', 400));
  }

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const limits = {};
  for (const [rawKey, rawValue] of Object.entries(incoming)) {
    const key = RESOLVE_LAB_CATEGORY(String(rawKey));
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

    // A student must always keep at least one real grade per category.
    const slots = countLabCategorySlots(labroom, key);
    const maxAllowed = slots > 0 ? slots - 1 : 0;
    if (slots > 0 && n > maxAllowed) {
      return next(new AppError(
        `"${rawKey}" only has ${slots} activit${slots === 1 ? 'y' : 'ies'}, so at most ${maxAllowed} can be bypassed - every student must keep one real grade.`,
        400
      ));
    }

    limits[key] = n;
  }

  labroom.bypassLimits = limits;
  await labroom.save();

  res.status(200).json({
    status: 'success',
    message: 'Bypass limits updated.',
    data: { limits: toPlainBypassLimits(labroom.bypassLimits) }
  });
});