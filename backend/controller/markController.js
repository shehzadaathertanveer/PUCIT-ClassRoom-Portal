const Mark = require('../models/markSchema');
const Classroom = require('../models/classRoomSchema');
const User = require('../models/userSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const sendStyledEmail = require('../utils/emailService'); // Centralized email utility with IPv4 Render fix & dark theme layout

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
  const clean = rawType.trim().toLowerCase();
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
  const sanitizedCamel = clean
    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return sanitizedCamel.endsWith('s') ? sanitizedCamel : sanitizedCamel + 's';
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

    let totalObtSessional = 0;
    let totalTotSessional = 0;

    const evaluationCategories = [
      'quizzes', 'assignments', 'presentations', 'projects', 
      'homework', 'classActivities', 'classParticipation', 'vivas', 'specialMarks'
    ];

    evaluationCategories.forEach(cat => {
      if (Array.isArray(doc[cat])) {
        doc[cat].forEach(item => {
          if (!item.isAbsent) totalObtSessional += (Number(item.obtainedMarks) || 0);
          totalTotSessional += (Number(item.totalMarks) || 0);
        });
      }
    });

    if (Array.isArray(doc.customActivities)) {
      doc.customActivities.forEach(customCat => {
        if (Array.isArray(customCat.items)) {
          customCat.items.forEach(item => {
            if (!item.isAbsent) totalObtSessional += (Number(item.obtainedMarks) || 0);
            totalTotSessional += (Number(item.totalMarks) || 0);
          });
        }
      });
    }

    const sessionalPercentage = totalTotSessional > 0 ? (totalObtSessional / totalTotSessional) * 100 : 0;
    if (totalTotSessional > 0) { 
      sumSessional += sessionalPercentage; 
      sessionalCount++; 
    }

    let midsPercentage = 0;
    if (doc.mids && doc.mids.totalMarks > 0) {
      midsPercentage = doc.mids.isAbsent ? 0 : ((Number(doc.mids.obtainedMarks) || 0) / doc.mids.totalMarks) * 100;
      sumMids += midsPercentage; midsCount++;
    }

    let finalsPercentage = 0;
    if (doc.finals && doc.finals.totalMarks > 0) {
      finalsPercentage = doc.finals.isAbsent ? 0 : ((Number(doc.finals.obtainedMarks) || 0) / doc.finals.totalMarks) * 100;
      sumFinals += finalsPercentage; finalsCount++;
    }

    const sW = Number(gradingScheme.sessionalWeight) || 25;
    const mW = Number(gradingScheme.midsWeight) || 35;
    const fW = Number(gradingScheme.finalsWeight) || 40;

    const overallPercentage = ((sessionalPercentage * sW) + (midsPercentage * mW) + (finalsPercentage * fW)) / 100;
    sumOverall += overallPercentage; overallCount++;

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
      marksDoc: doc
    };
  });

  rankings.sort((a, b) => b.overallPercentage - a.overallPercentage);

  const classAverages = {
    sessionalPercentage: sessionalCount > 0 ? Number((sumSessional / sessionalCount).toFixed(2)) : 0,
    midsPercentage: midsCount > 0 ? Number((sumMids / midsCount).toFixed(2)) : 0,
    finalsPercentage: finalsCount > 0 ? Number((sumFinals / finalsCount).toFixed(2)) : 0,
    overallPercentage: overallCount > 0 ? Number((sumOverall / overallCount).toFixed(2)) : 0,
  };

  res.status(200).json({
    status: 'success',
    data: { classAverages, rankings, performanceTiers: tiers }
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
      
      if (!isAbsent && (rawVal === '' || rawVal === null || isNaN(Number(rawVal)))) {
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

      const obtained = isAbsent ? 0 : Math.max(0, Number(rawVal) || 0);
      const fileData = parseCloudinaryFile(m);

      if (['mids', 'finals', 'finalProject'].includes(targetCategory)) {
        markDoc[targetCategory] = {
          title: cleanTitle || 'Exam',
          totalMarks: parsedTotal,
          obtainedMarks: obtained,
          isAbsent,
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
            items: [{ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: obtained, isAbsent, file: fileData || { url: '' } }]
          });
        } else {
          if (!Array.isArray(customCat.items)) customCat.items = [];
          const entryIndex = customCat.items.findIndex(e => e.title?.toLowerCase() === cleanTitle.toLowerCase());
          const scoreObj = {
            title: cleanTitle,
            totalMarks: parsedTotal,
            obtainedMarks: obtained,
            isAbsent,
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
      updatedStudentIds.push(studentId);
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
    if (!absentFlag && (isNaN(Number(rawVal)) || Number(rawVal) < 0)) {
      continue;
    }
    const parsedObtained = absentFlag ? 0 : Math.max(0, Number(rawVal) || 0);

    let markDoc = docMap.get(studentIdStr);
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
        if (file) markDoc[resolvedCategory][existingIdx].file = file;
      } else {
        const newItem = { title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent: absentFlag };
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
          items: [{ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent: absentFlag, file: file || { url: '' } }]
        });
      } else {
        if (!Array.isArray(customCat.items)) customCat.items = [];
        const existingItemIdx = customCat.items.findIndex(i => i.title?.toLowerCase() === cleanTitle.toLowerCase());
        if (existingItemIdx > -1) {
          customCat.items[existingItemIdx].totalMarks = parsedTotal;
          customCat.items[existingItemIdx].obtainedMarks = parsedObtained;
          customCat.items[existingItemIdx].isAbsent = absentFlag;
          if (file) customCat.items[existingItemIdx].file = file;
        } else {
          customCat.items.push({ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent: absentFlag, file: file || { url: '' } });
        }
      }
    }

    docsToSave.push(markDoc);

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
            : `Your grade for <strong>${cleanTitle}</strong> in <strong>${classroom?.className || 'Course'}</strong> has been uploaded.`,
          details: [
            { label: 'Evaluation', value: cleanTitle },
            { label: 'Score', value: absentFlag ? 'Absent (0 / ' + parsedTotal + ')' : `${parsedObtained} / ${parsedTotal} (${percentage}%)` },
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

  if (['mids', 'finals', 'finalProject'].includes(resolvedCategory)) {
    const currentTotal = incomingTotal !== undefined ? Number(incomingTotal) : (markDoc[resolvedCategory]?.totalMarks || 100);
    const rawVal = incomingObtained !== undefined ? String(incomingObtained).trim() : String(markDoc[resolvedCategory]?.obtainedMarks || 0);
    const absentFlag = isAbsentFlag || rawVal.toUpperCase() === 'A';
    const currentObtained = absentFlag ? 0 : Math.max(0, Number(rawVal));

    if (currentTotal <= 0) return next(new AppError('Total marks must be greater than 0!', 400));
    if (!absentFlag && currentObtained > currentTotal) {
      return next(new AppError(`Obtained marks (${currentObtained}) cannot exceed Total marks (${currentTotal})!`, 400));
    }

    markDoc[resolvedCategory] = {
      title: itemTitle || 'Exam',
      totalMarks: currentTotal,
      obtainedMarks: currentObtained,
      isAbsent: absentFlag,
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
    const currentObtained = absentFlag ? 0 : Math.max(0, Number(rawVal));

    if (currentTotal <= 0) return next(new AppError('Total marks must be greater than 0!', 400));
    if (!absentFlag && currentObtained > currentTotal) {
      return next(new AppError(`Obtained marks (${currentObtained}) cannot exceed Total marks (${currentTotal})!`, 400));
    }

    if (itemIdx > -1) {
      markDoc[resolvedCategory][itemIdx].totalMarks = currentTotal;
      markDoc[resolvedCategory][itemIdx].obtainedMarks = currentObtained;
      markDoc[resolvedCategory][itemIdx].isAbsent = absentFlag;
      if (fileData) markDoc[resolvedCategory][itemIdx].file = fileData;
    } else {
      markDoc[resolvedCategory].push({
        title: itemTitle.trim(),
        totalMarks: currentTotal,
        obtainedMarks: currentObtained,
        isAbsent: absentFlag,
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
      markDoc.customActivities.push({
        categoryName: cleanCategory,
        items: [{
          title: itemTitle.trim(),
          totalMarks: Number(incomingTotal) || 10,
          obtainedMarks: isAbsentFlag ? 0 : (Number(incomingObtained) || 0),
          isAbsent: isAbsentFlag,
          file: fileData || { url: '' }
        }]
      });
    } else {
      if (!Array.isArray(customCat.items)) customCat.items = [];
      const itemIdx = customCat.items.findIndex(i => i.title?.toLowerCase() === itemTitle.trim().toLowerCase());
      const currentTotal = incomingTotal !== undefined ? Number(incomingTotal) : (itemIdx > -1 ? customCat.items[itemIdx].totalMarks : 10);
      const rawVal = incomingObtained !== undefined ? String(incomingObtained).trim() : (itemIdx > -1 ? String(customCat.items[itemIdx].obtainedMarks) : '0');
      const absentFlag = isAbsentFlag || rawVal.toUpperCase() === 'A';
      const currentObtained = absentFlag ? 0 : Math.max(0, Number(rawVal));

      if (itemIdx > -1) {
        customCat.items[itemIdx].totalMarks = currentTotal;
        customCat.items[itemIdx].obtainedMarks = currentObtained;
        customCat.items[itemIdx].isAbsent = absentFlag;
        if (fileData) customCat.items[itemIdx].file = fileData;
      } else {
        customCat.items.push({
          title: itemTitle.trim(),
          totalMarks: currentTotal,
          obtainedMarks: currentObtained,
          isAbsent: absentFlag,
          file: fileData || { url: '' }
        });
      }
    }
  }

  await markDoc.save();

  const studentEmail = student.personalNotificationEmail || student.email;
  const displayTitle = itemTitle || resolvedCategory;
  if (studentEmail && !studentEmail.includes('@temp.pucit.edu.pk')) {
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