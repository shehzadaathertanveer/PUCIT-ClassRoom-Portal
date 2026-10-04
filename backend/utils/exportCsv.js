// Shared helpers for the server-side lab result sheet export. Mirrors
// frontend/src/utils/exportCsv.js so both sheets order and pad identically.

/**
 * Sort a roster for export: regular students ascending by roll/reg number, then
 * add/drop students (whose identifier prefix does not match the room's) last.
 */
function partitionRoster(students, sectionPrefix, getId) {
  const prefix = String(sectionPrefix || '').trim().toUpperCase();
  const idOf = (s) => String(getId(s) || '').trim();

  const byNumber = (a, b) =>
    idOf(a).localeCompare(idOf(b), undefined, { numeric: true, sensitivity: 'base' }) ||
    String((a && a.name) || '').localeCompare(String((b && b.name) || ''));

  const regular = [];
  const addDrop = [];
  (students || []).forEach((s) => {
    const id = idOf(s).toUpperCase();
    // With no prefix configured nothing can mismatch, so everyone is regular.
    const isAddDrop = !!prefix && !id.startsWith(prefix);
    (isAddDrop ? addDrop : regular).push(s);
  });

  return { regular: regular.sort(byNumber), addDrop: addDrop.sort(byNumber) };
}

/** Wrap a value as a CSV cell, escaping quotes so a name cannot break the row. */
function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return '"' + str.replace(/"/g, '""') + '"';
}

/** Pad a cell to a minimum character width - CSV cannot carry column widths. */
function csvPad(value, width) {
  const str = value === null || value === undefined ? '' : String(value);
  return csvCell(str.padEnd(width, ' '));
}

/** Size the roll/name columns to the roster so long names are not clipped. */
function rosterWidths(roster, getId, minRoll, minName) {
  let roll = minRoll || 12;
  let name = minName || 20;
  (roster || []).forEach((s) => {
    roll = Math.max(roll, String(getId(s) || '').length);
    name = Math.max(name, String((s && s.name) || '').length);
  });
  return { roll: Math.min(roll, 28), name: Math.min(name, 34) };
}

/** A row of empty cells, used as the add/drop separator. */
function blankRow(width) {
  return new Array(Math.max(0, width)).fill('');
}

module.exports = { partitionRoster, csvCell, csvPad, rosterWidths, blankRow };