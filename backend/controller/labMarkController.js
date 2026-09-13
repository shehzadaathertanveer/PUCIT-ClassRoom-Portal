const LabMark = require('../models/labMarkSchema');
const Labroom = require('../models/labSchema');
const User = require('../models/userSchema');
const catchAsync = require('../utils/catchAsyncError');
const AppError = require('../utils/appError');
const nodemailer = require('nodemailer');

const VALID_STANDARD_CATEGORIES = ['labTasks', 'vivas', 'labTests', 'projects', 'quizzes', 'assignments'];

// Helper: Normalizes input categories to match schema arrays
const RESOLVE_LAB_CATEGORY = (raw = '') => {
  const clean = raw.trim().toLowerCase();
  if (clean.includes('task')) return 'labTasks';
  if (clean.includes('viva')) return 'vivas';
  if (clean.includes('test')) return 'labTests';
  if (clean.includes('project')) return 'projects';
  if (clean.includes('quiz')) return 'quizzes';
  if (clean.includes('assign')) return 'assignments';
  if (clean.includes('lab')) return 'labTasks';
  return clean.endsWith('s') ? clean : clean + 's';
};

// Helper: Nodemailer transporter with safeguards
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  socketTimeout: 10000,
});

// Helper: Sleek Enterprise Dark Theme Email Wrapper
const sendStyledEmail = async ({ to, subject, title, bodyText, details = [] }) => {
  if (!to) return;
  const timestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const detailsHtml =
    details.length > 0
      ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; margin: 24px 0;">
      <tr>
        <td style="padding: 16px 20px;">
          ${details
            .map(
              (d) => `
            <div style="font-size: 13px; color: #a1a1aa; padding: 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <strong style="color: #f4f4f5; font-weight: 600;">${d.label}:</strong> <span style="color: #e4e4e7; font-weight: 500;">${d.value}</span>
            </div>
          `,
            )
            .join('')}
        </td>
      </tr>
    </table>
  `
      : '';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 0; color: #f4f4f5;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #09090b;">
        <tr>
          <td align="center">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
              
              <!-- Header Bar -->
              <tr>
                <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #27272a;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td>
                        <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #f4f4f5; background: #27272a; padding: 6px 12px; border-radius: 6px; display: inline-block;">
                          PUCIT Lab Portal
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top: 8px; font-size: 11px; color: #a1a1aa; font-weight: 500;">
                        Practical Laboratory Ecosystem
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Main Content Area -->
              <tr>
                <td style="padding: 32px;">
                  <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #f4f4f5; letter-spacing: -0.025em;">
                    ${title}
                  </h2>
                  <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                    ${bodyText}
                  </p>

                  ${detailsHtml}

                  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; font-size: 12px; color: #71717a; line-height: 1.5;">
                    Automated secure lab notification.<br>
                    <span>Timestamp: ${timestamp}</span>
                  </div>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="padding: 16px 32px; background-color: #09090b; border-top: 1px solid #27272a; text-align: center;">
                  <p style="margin: 0; font-size: 11px; color: #71717a;">
                    Independent Lab Tool • Administered by <strong style="color: #a1a1aa;">Shehzada Ather</strong>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: '"PUCIT Lab System" <no-reply@pucit.edu.pk>',
      to,
      subject: `[PUCIT Lab] ${subject || title}`,
      html: htmlContent,
    });
  } catch (err) {
    console.error('Failed to send styled email notification:', err.message);
  }
};

// Helper: Extract numbers safely for sorting roll numbers (e.g., BITF25A012 -> 12)
const getRollDigits = (rollNo = '') => {
  const digits = rollNo.replace(/\D/g, '');
  if (!digits) return 99999;
  return parseInt(digits.slice(-3), 10);
};

// =============================================================================
// 1. GET BULK LAB MARK SHEET (Sorted 001->040 + Add/Drop)
// =============================================================================
exports.getBulkLabMarkSheet = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId)
    .populate('students', 'name rollNo email personalNotificationEmail')
    .lean();

  if (!labroom) {
    return next(new AppError('Labroom not found!', 404));
  }

  const prefix = labroom.sectionPrefix ? labroom.sectionPrefix.toUpperCase() : '';
  const regular = [];
  const addDrop = [];

  (labroom.students || []).forEach((student) => {
    const roll = student.rollNo ? student.rollNo.toUpperCase() : '';
    if (prefix && roll.startsWith(prefix)) {
      regular.push(student);
    } else {
      addDrop.push(student);
    }
  });

  regular.sort((a, b) => getRollDigits(a.rollNo) - getRollDigits(b.rollNo));
  addDrop.sort((a, b) => (a.rollNo || '').localeCompare(b.rollNo || ''));

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
        labTasks: labroom.labTasks,
        vivas: labroom.vivas,
        labTests: labroom.labTests,
        projects: labroom.projects,
        quizzes: labroom.quizzes,
        assignments: labroom.assignments,
        customActivities: labroom.customActivities,
        sessionalActivities: labroom.sessionalActivities,
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
    .populate('students', 'name rollNo email personalNotificationEmail')
    .lean();

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const allStudents = labroom.students || [];
  const studentIds = allStudents.map(s => s._id);
  const markDocs = await LabMark.find({ labroom: labroomId, student: { $in: studentIds } }).lean();

  const gradedStudentIds = new Set();
  const cleanCategory = category.trim().toLowerCase();
  const cleanTitle = title.trim().toLowerCase();
  const standardKey = RESOLVE_LAB_CATEGORY(cleanCategory);

  markDocs.forEach(doc => {
    if (VALID_STANDARD_CATEGORIES.includes(standardKey)) {
      const items = doc[standardKey] || [];
      if (items.some(i => i.title && i.title.trim().toLowerCase() === cleanTitle)) {
        gradedStudentIds.add(doc.student.toString());
      }
    } else {
      const customCats = doc.customActivities || [];
      const matchedCat = customCats.find(c => c.categoryName.trim().toLowerCase() === cleanCategory);
      if (matchedCat && matchedCat.items.some(i => i.title && i.title.trim().toLowerCase() === cleanTitle)) {
        gradedStudentIds.add(doc.student.toString());
      }
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
      if (Array.isArray(doc[cat])) {
        doc[cat].forEach(item => {
          if (item.title) {
            const key = `${cat}:${item.title.trim().toLowerCase()}`;
            if (!gradedCountMap[key]) gradedCountMap[key] = new Set();
            if ((item.obtainedMarks !== undefined && item.obtainedMarks !== null) || item.isAbsent === true) {
              gradedCountMap[key].add(studentId);
            }
          }
        });
      }
    });

    if (Array.isArray(doc.customActivities)) {
      doc.customActivities.forEach(cat => {
        if (Array.isArray(cat.items)) {
          cat.items.forEach(item => {
            if (item.title) {
              const key = `custom:${cat.categoryName.trim().toLowerCase()}:${item.title.trim().toLowerCase()}`;
              if (!gradedCountMap[key]) gradedCountMap[key] = new Set();
              if ((item.obtainedMarks !== undefined && item.obtainedMarks !== null) || item.isAbsent === true) {
                gradedCountMap[key].add(studentId);
              }
            }
          });
        }
      });
    }
  });

  const pendingActivities = [];

  const checkGroups = [
    { key: 'labTasks', items: labroom.labTasks || [] },
    { key: 'vivas', items: labroom.vivas || [] },
    { key: 'labTests', items: labroom.labTests || [] },
    { key: 'projects', items: labroom.projects || [] },
    { key: 'quizzes', items: labroom.quizzes || [] },
    { key: 'assignments', items: labroom.assignments || [] },
  ];

  checkGroups.forEach(group => {
    group.items.forEach(item => {
      const key = `${group.key}:${item.title.trim().toLowerCase()}`;
      const gradedSet = gradedCountMap[key] || new Set();
      const remainingCount = totalStudentsCount - gradedSet.size;

      if (remainingCount > 0) {
        pendingActivities.push({
          category: group.key,
          title: item.title,
          totalStudents: totalStudentsCount,
          gradedCount: gradedSet.size,
          remainingCount
        });
      }
    });
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
    .populate('students', '_id rollNo name')
    .populate('teacher', '_id')
    .populate('tas', '_id')
    .lean();

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const isInstructor = labroom.teacher && labroom.teacher._id.toString() === userId.toString();
  const isTa = labroom.tas && labroom.tas.some(ta => ta._id.toString() === userId.toString());
  const isStaffOrAdmin = userRole === 'ADMIN' || userRole === 'TEACHER' || isInstructor || isTa;

  // IF STUDENT: Return only their personal mark document without triggering staff restrictions
  if (!isStaffOrAdmin) {
    let studentMark = await LabMark.findOne({ labroom: labroomId, student: userId })
      .populate('student', 'name rollNo email personalNotificationEmail')
      .lean();

    if (!studentMark) {
      studentMark = {
        labroom: labroomId,
        student: userId,
        labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [], customActivities: []
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

  // IF STAFF / TA / ADMIN: Return full class rankings and analytics
  const markDocs = await LabMark.find({ labroom: labroomId }).populate('student', 'name rollNo').lean();
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
  const sActivities = labroom.sessionalActivities || [
    { category: 'Lab Tasks', allocatedMarks: 50 },
    { category: 'Vivas', allocatedMarks: 30 },
    { category: 'Lab Tests', allocatedMarks: 20 }
  ];

  const rankings = validDocs.map(doc => {
    let totalObtained = 0;
    let totalPossible = 0;
    let catStats = {};

    sActivities.forEach(act => {
      const targetKey = RESOLVE_LAB_CATEGORY(act.category);
      let catObt = 0;
      let catPoss = 0;
      const items = doc[targetKey] || [];
      items.forEach(item => {
        if (!item.isAbsent && item.obtainedMarks !== undefined && item.obtainedMarks !== null) {
          catObt += Number(item.obtainedMarks) || 0;
        }
        catPoss += Number(item.totalMarks) || 0;
      });

      totalObtained += catObt;
      totalPossible += catPoss;
      const catPct = catPoss > 0 ? Number(((catObt / catPoss) * 100).toFixed(2)) : 0;
      catStats[targetKey + 'Percentage'] = catPct;
    });

    const percentage = totalPossible > 0 ? Number(((totalObtained / totalPossible) * 100).toFixed(2)) : 0;
    sumOverall += percentage;

    return {
      student: doc.student,
      marksDoc: doc,
      percentage,
      overallPercentage: percentage,
      totalObtained,
      totalPossible,
      ...catStats
    };
  });

  rankings.sort((a, b) => b.percentage - a.percentage);

  const classAverages = {
    overallLabPercentage: Number((sumOverall / validDocs.length).toFixed(2))
  };

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
// 1.4 EXPORT COMPLETE LAB RESULT SHEET AS EXCEL / CSV FILE DOWNLOAD
// =============================================================================
exports.downloadLabExcelExport = catchAsync(async (req, res, next) => {
  const { labroomId } = req.params;

  const labroom = await Labroom.findById(labroomId)
    .populate('students', '_id rollNo name')
    .lean();

  if (!labroom) return next(new AppError('Labroom not found!', 404));

  const markDocs = await LabMark.find({ labroom: labroomId }).populate('student', '_id rollNo name').lean();
  const markDocMap = new Map(markDocs.map(m => [m.student?._id?.toString(), m]));

  const sActivities = labroom.sessionalActivities && labroom.sessionalActivities.length > 0
    ? labroom.sessionalActivities
    : [
        { category: 'Lab Tasks', allocatedMarks: 50 },
        { category: 'Vivas', allocatedMarks: 30 },
        { category: 'Lab Tests', allocatedMarks: 20 }
      ];

  let headerActivityCols = [];
  sActivities.forEach(act => {
    const targetKey = RESOLVE_LAB_CATEGORY(act.category);
    const items = labroom[targetKey] || [];
    items.forEach(item => {
      headerActivityCols.push({ category: act.category, targetKey, title: item.title, max: item.totalMarks || 10 });
    });
  });

  let csvRows = [];
  let headerRow = ['Roll Number', 'Student Name'];
  headerActivityCols.forEach(col => {
    headerRow.push(`"${col.category}: ${col.title} (${col.max}M)"`);
  });
  sActivities.forEach(act => {
    headerRow.push(`"${act.category} %"`);
  });
  headerRow.push('"Overall %"', '"Final Grade"');
  csvRows.push(headerRow.join(','));

  const sortedStudents = [...(labroom.students || [])].sort((a, b) => {
    const rollA = (a.rollNo || '').localeCompare(b.rollNo || '');
    return rollA !== 0 ? rollA : (a.name || '').localeCompare(b.name || '');
  });

  sortedStudents.forEach(st => {
    const doc = markDocMap.get(st._id.toString()) || {};
    let rowData = [
      `"${st.rollNo || 'N/A'}"`,
      `"${st.name || 'Unknown'}"`
    ];

    let totalObtAll = 0;
    let totalPossAll = 0;

    headerActivityCols.forEach(col => {
      const scores = doc[col.targetKey] || [];
      const match = scores.find(s => s.title?.trim().toLowerCase() === col.title?.trim().toLowerCase());
      const markVal = (match && !match.isAbsent && match.obtainedMarks !== undefined && match.obtainedMarks !== null) ? match.obtainedMarks : 0;
      rowData.push(markVal);
    });

    sActivities.forEach(act => {
      const targetKey = RESOLVE_LAB_CATEGORY(act.category);
      const scores = doc[targetKey] || [];
      let catObt = 0;
      let catPoss = 0;
      scores.forEach(s => {
        if (!s.isAbsent && s.obtainedMarks !== undefined && s.obtainedMarks !== null) {
          catObt += Number(s.obtainedMarks) || 0;
        }
        catPoss += Number(s.totalMarks) || 0;
      });
      totalObtAll += catObt;
      totalPossAll += catPoss;
      const catPct = catPoss > 0 ? ((catObt / catPoss) * 100).toFixed(2) : '0.00';
      rowData.push(`"${catPct}%"`);
    });

    const overallPct = totalPossAll > 0 ? ((totalObtAll / totalPossAll) * 100).toFixed(2) : '0.00';
    
    // PUCIT Grade Helper
    const pVal = Number(overallPct);
    let grade = 'F';
    if (pVal >= 85) grade = 'A+';
    else if (pVal >= 80) grade = 'A';
    else if (pVal >= 75) grade = 'B+';
    else if (pVal >= 70) grade = 'B';
    else if (pVal >= 65) grade = 'C+';
    else if (pVal >= 60) grade = 'C';
    else if (pVal >= 50) grade = 'D';

    rowData.push(`"${overallPct}%"`, `"${grade}"`);
    csvRows.push(rowData.join(','));
  });

  const csvString = csvRows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${labroom.labName}_Results.csv`);
  return res.status(200).send(csvString);
});

// =============================================================================
// 2. BATCH SUBMIT LAB MARKS
// =============================================================================
exports.batchSubmitLabMarks = catchAsync(async (req, res, next) => {
  const { labroomId, category, title, totalMarks, marksData } = req.body;

  if (!labroomId || totalMarks === undefined || !Array.isArray(marksData) || marksData.length === 0) {
    return next(new AppError('Labroom ID, Total Marks (>0), and Marks Data array are required!', 400));
  }

  const parsedTotal = Number(totalMarks);
  if (isNaN(parsedTotal) || parsedTotal <= 0) {
    return next(new AppError('Total marks must be valid and greater than 0!', 400));
  }

  const cleanCategory = (category || '').trim();
  const standardKey = RESOLVE_LAB_CATEGORY(cleanCategory);
  let cleanTitle = (title || '').trim();

  if (!cleanTitle) {
    cleanTitle = `Lab Item Entry`;
  }

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  if (VALID_STANDARD_CATEGORIES.includes(standardKey)) {
    if (!Array.isArray(labroom[standardKey])) labroom[standardKey] = [];
    const exists = labroom[standardKey].find(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
    if (exists) {
      exists.totalMarks = parsedTotal;
    } else {
      labroom[standardKey].push({ title: cleanTitle, totalMarks: parsedTotal });
    }
  } else {
    if (!Array.isArray(labroom.customActivities)) labroom.customActivities = [];
    let customCat = labroom.customActivities.find(c => c.categoryName.toLowerCase() === cleanCategory.toLowerCase());
    if (!customCat) {
      labroom.customActivities.push({
        categoryName: cleanCategory,
        items: [{ title: cleanTitle, totalMarks: parsedTotal }]
      });
    } else {
      const exists = customCat.items.find(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
      if (exists) {
        exists.totalMarks = parsedTotal;
      } else {
        customCat.items.push({ title: cleanTitle, totalMarks: parsedTotal });
      }
    }
  }
  await labroom.save();

  const validEntries = marksData.map(item => ({
    studentId: item.studentId || item.student || item._id,
    obtainedMarks: item.obtainedMarks !== undefined ? item.obtainedMarks : (item.marks !== undefined ? item.marks : item.score)
  })).filter(item => item.studentId && item.obtainedMarks !== undefined && item.obtainedMarks !== null);

  const studentIds = validEntries.map(e => e.studentId);
  const students = await User.find({ _id: { $in: studentIds } }).lean();
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  const existingDocs = await LabMark.find({ labroom: labroomId, student: { $in: studentIds } });
  const docMap = new Map(existingDocs.map(d => [d.student.toString(), d]));
  const docsToSave = [];
  const emailList = [];

  for (const entry of validEntries) {
    const studentIdStr = entry.studentId.toString();
    const rawVal = String(entry.obtainedMarks).trim();
    const isAbsent = rawVal.toUpperCase() === 'A';
    const parsedObtained = isAbsent ? 0 : Math.max(0, Number(rawVal) || 0);

    let markDoc = docMap.get(studentIdStr);
    if (!markDoc) {
      markDoc = new LabMark({
        labroom: labroomId,
        student: entry.studentId,
        labTasks: [],
        vivas: [],
        labTests: [],
        projects: [],
        quizzes: [],
        assignments: [],
        customActivities: []
      });
    }

    if (VALID_STANDARD_CATEGORIES.includes(standardKey)) {
      if (!Array.isArray(markDoc[standardKey])) markDoc[standardKey] = [];
      const idx = markDoc[standardKey].findIndex(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
      if (idx > -1) {
        markDoc[standardKey][idx].totalMarks = parsedTotal;
        markDoc[standardKey][idx].obtainedMarks = parsedObtained;
        markDoc[standardKey][idx].isAbsent = isAbsent;
      } else {
        markDoc[standardKey].push({ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent });
      }
    } else {
      if (!Array.isArray(markDoc.customActivities)) markDoc.customActivities = [];
      let catObj = markDoc.customActivities.find(c => c.categoryName.toLowerCase() === cleanCategory.toLowerCase());
      if (!catObj) {
        markDoc.customActivities.push({
          categoryName: cleanCategory,
          items: [{ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent }]
        });
      } else {
        const itemIdx = catObj.items.findIndex(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
        if (itemIdx > -1) {
          catObj.items[itemIdx].totalMarks = parsedTotal;
          catObj.items[itemIdx].obtainedMarks = parsedObtained;
          catObj.items[itemIdx].isAbsent = isAbsent;
        } else {
          catObj.items.push({ title: cleanTitle, totalMarks: parsedTotal, obtainedMarks: parsedObtained, isAbsent });
        }
      }
    }

    docsToSave.push(markDoc);

    const studentUser = studentMap.get(studentIdStr);
    if (studentUser) {
      const email = studentUser.personalNotificationEmail || studentUser.email;
      if (email) {
        emailList.push({
          email,
          title: `${cleanTitle} (${cleanCategory})`,
          bodyText: isAbsent 
            ? `You were marked absent for <strong>${cleanTitle}</strong> in lab <strong>${labroom.labName}</strong>.`
            : `Your lab grade for <strong>${cleanTitle}</strong> has been uploaded.`,
          details: [
            { label: 'Lab', value: labroom.labName },
            { label: 'Score', value: isAbsent ? `Absent (0 / ${parsedTotal})` : `${parsedObtained} / ${parsedTotal}` },
            { label: 'Graded By', value: req.user.name }
          ]
        });
      }
    }
  }

  await Promise.all(docsToSave.map(d => d.save()));

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
    message: `Successfully recorded grades for ${docsToSave.length} student(s)!`,
  });
});

// =============================================================================
// 3. UPDATE SINGLE STUDENT ITEM MARK
// =============================================================================
exports.updateSingleStudentLabMark = catchAsync(async (req, res, next) => {
  const { labroomId, studentId, category, itemTitle, obtainedMarks, totalMarks } = req.body;

  if (!labroomId || !studentId || !category || !itemTitle) {
    return next(new AppError('Labroom ID, Student ID, category, and item title are required!', 400));
  }

  let markDoc = await LabMark.findOne({ labroom: labroomId, student: studentId });
  if (!markDoc) {
    markDoc = new LabMark({
      labroom: labroomId,
      student: studentId,
      labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [], customActivities: []
    });
  }

  const cleanCategory = category.trim();
  const standardKey = RESOLVE_LAB_CATEGORY(cleanCategory);
  const cleanTitle = itemTitle.trim();

  const currentTotal = totalMarks !== undefined ? Number(totalMarks) : 10;
  const rawVal = String(obtainedMarks).trim();
  const isAbsent = rawVal.toUpperCase() === 'A';
  const currentObtained = isAbsent ? 0 : Math.max(0, Number(rawVal) || 0);

  if (VALID_STANDARD_CATEGORIES.includes(standardKey)) {
    if (!Array.isArray(markDoc[standardKey])) markDoc[standardKey] = [];
    const idx = markDoc[standardKey].findIndex(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
    if (idx > -1) {
      markDoc[standardKey][idx].totalMarks = currentTotal;
      markDoc[standardKey][idx].obtainedMarks = currentObtained;
      markDoc[standardKey][idx].isAbsent = isAbsent;
    } else {
      markDoc[standardKey].push({ title: cleanTitle, totalMarks: currentTotal, obtainedMarks: currentObtained, isAbsent });
    }
  } else {
    if (!Array.isArray(markDoc.customActivities)) markDoc.customActivities = [];
    let catObj = markDoc.customActivities.find(c => c.categoryName.toLowerCase() === cleanCategory.toLowerCase());
    if (!catObj) {
      markDoc.customActivities.push({
        categoryName: cleanCategory,
        items: [{ title: cleanTitle, totalMarks: currentTotal, obtainedMarks: currentObtained, isAbsent }]
      });
    } else {
      const itemIdx = catObj.items.findIndex(i => i.title.toLowerCase() === cleanTitle.toLowerCase());
      if (itemIdx > -1) {
        catObj.items[itemIdx].totalMarks = currentTotal;
        catObj.items[itemIdx].obtainedMarks = currentObtained;
        catObj.items[itemIdx].isAbsent = isAbsent;
      } else {
        catObj.items.push({ title: cleanTitle, totalMarks: currentTotal, obtainedMarks: currentObtained, isAbsent });
      }
    }
  }

  await markDoc.save();

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
    .populate('student', 'name rollNo email personalNotificationEmail')
    .populate('labroom', 'labName sectionPrefix');

  if (!markDoc) {
    markDoc = await LabMark.create({
      labroom: labroomId,
      student: studentId,
      labTasks: [], vivas: [], labTests: [], projects: [], quizzes: [], assignments: [], customActivities: []
    });
    markDoc = await LabMark.findById(markDoc._id)
      .populate('student', 'name rollNo email personalNotificationEmail')
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

  if (!labroomId || !category || !itemTitle) {
    return next(new AppError('Labroom ID, category, and item title are required!', 400));
  }

  const cleanTitle = itemTitle.trim();
  const standardKey = RESOLVE_LAB_CATEGORY(category);

  const labroom = await Labroom.findById(labroomId);
  if (!labroom) return next(new AppError('Labroom not found!', 404));

  if (VALID_STANDARD_CATEGORIES.includes(standardKey)) {
    labroom[standardKey] = (labroom[standardKey] || []).filter(
      i => i.title.toLowerCase() !== cleanTitle.toLowerCase()
    );
    await labroom.save();

    await LabMark.updateMany(
      { labroom: labroomId },
      { $pull: { [standardKey]: { title: { $regex: new RegExp(`^${cleanTitle}$`, 'i') } } } }
    );
  } else {
    labroom.customActivities.forEach(cat => {
      cat.items = (cat.items || []).filter(i => i.title.toLowerCase() !== cleanTitle.toLowerCase());
    });
    await labroom.save();
  }

  res.status(200).json({
    status: 'success',
    message: `Lab evaluation "${cleanTitle}" permanently removed.`,
  });
});