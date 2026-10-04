// Shared helpers for the classroom/lab result sheet exports: roster ordering
// (regular students first, add/drop students last behind a blank separator) and
// width-aware CSV cell formatting.

/**
 * Sort a roster for export: regular students ascending by roll/reg number, then
 * add/drop students (whose identifier prefix does not match the room's) last.
 *
 * The class prefix is what distinguishes a regular student from an add/drop one,
 * mirroring the existing bulk mark sheet logic so the exported sheet is ordered
 * exactly like the on-screen sheet.
 */
export function partitionRoster(students, sectionPrefix, getId) {
  const prefix = String(sectionPrefix || '').trim().toUpperCase();
  const idOf = (s) => String(getId(s) || '').trim();

  const byNumber = (a, b) =>
    idOf(a).localeCompare(idOf(b), undefined, { numeric: true, sensitivity: 'base' }) ||
    String(a?.name || '').localeCompare(String(b?.name || ''));

  const regular = [];
  const addDrop = [];
  students.forEach((s) => {
    const id = idOf(s).toUpperCase();
    // With no prefix configured nothing can mismatch, so everyone is regular.
    const isAddDrop = !!prefix && !id.startsWith(prefix);
    (isAddDrop ? addDrop : regular).push(s);
  });

  return { regular: regular.sort(byNumber), addDrop: addDrop.sort(byNumber) };
}

/**
 * Wrap a value as a CSV cell, escaping quotes so a name like
 * `Ali, "Top"`` cannot break the row apart.
 */
export function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Pad a cell to a minimum character width. CSV has no column-width concept, so
 * the only way to give roll numbers and names room to breathe when the sheet is
 * opened in Excel is to pad the content itself.
 */
export function csvPad(value, width) {
  const str = value === null || value === undefined ? '' : String(value);
  return csvCell(str.padEnd(width, ' '));
}

/**
 * The widest roll/reg number and name in the roster, used to size those two
 * columns so long names are not visually clipped.
 */
export function rosterWidths(roster, getId, { minRoll = 12, minName = 20 } = {}) {
  let roll = minRoll;
  let name = minName;
  roster.forEach((s) => {
    roll = Math.max(roll, String(getId(s) || '').length);
    name = Math.max(name, String(s?.name || '').length);
  });
  // Cap so one pathological 80-character name cannot stretch the column.
  return { roll: Math.min(roll, 28), name: Math.min(name, 34) };
}

/** A row of empty cells of the given length, used as the add/drop separator. */
export function blankRow(width) {
  return new Array(Math.max(0, width)).fill('');
}