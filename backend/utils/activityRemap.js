/**
 * Decides how existing marks should be re-keyed when a room's activity list is
 * edited.
 *
 * The previous implementation paired the old and new activity lists BY INDEX
 * (`oldKeys.map((key, idx) => migrate(key, newKeys[idx]))`). That is only correct
 * when every activity is edited in place. Any other edit corrupted data:
 *
 *   old: [Quizzes, Assignments]      delete "Quizzes"
 *   new: [Assignments, Projects]     add "Projects"
 *
 * Index 0 said "Quizzes became Assignments", so quiz marks were appended to the
 * assignments array, and index 1 said "Assignments became Projects", so
 * assignment marks were appended to projects. Both categories ended up holding
 * marks that belonged to a different activity.
 *
 * Marks only ever need MOVING when an activity was genuinely renamed - the same
 * slot under a new name. Renames are detected conservatively:
 *
 *   - every old key still present under the same name needs no migration;
 *   - exactly one key removed AND exactly one key added, with the list length
 *     unchanged, is a rename candidate;
 *   - the candidate is only accepted if the removed and added keys sit at the
 *     SAME position in their lists. This is what separates a rename from a
 *     delete-plus-add, which are otherwise indistinguishable:
 *         [Quizzes, Assignments] -> [Quizzes, Homework]   rename   (index 1 = 1)
 *         [Quizzes, Assignments] -> [Assignments, Projects] add+del (index 0 != 1)
 *   - anything else (an add, a remove, a reorder, or several changes at once) is
 *     left alone. Guessing in those cases risks destroying real marks, and the
 *     caller's recalculation step still refreshes every derived percentage.
 */

/**
 * @param {Array<{category:string, allocatedMarks?:number}>} currentList  stored activities
 * @param {Array<{category:string, allocatedMarks?:number}>} nextList     submitted activities
 * @param {(category:string) => string} resolveKey  maps a label to its marks storage key
 * @returns {Array<{fromKey:string, toKey:string}>} pairs whose marks must move
 */
const planActivityMigrations = (currentList, nextList, resolveKey) => {
  const current = Array.isArray(currentList) ? currentList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  if (!current.length || !next.length) return [];

  const currentKeys = current.map((a) => resolveKey(a.category));
  const nextKeys = next.map((a) => resolveKey(a.category));

  const currentSet = new Set(currentKeys);
  const nextSet = new Set(nextKeys);
  const removed = currentKeys.filter((k, i) => k && !nextSet.has(k) && currentKeys.indexOf(k) === i);
  const added = nextKeys.filter((k, i) => k && !currentSet.has(k) && nextKeys.indexOf(k) === i);

  // Only a single like-for-like swap is a rename. Anything else is an add, a
  // remove or a reorder, where index pairing would move marks into the wrong
  // activity.
  if (removed.length !== 1 || added.length !== 1) return [];
  if (currentKeys.length !== nextKeys.length) return [];

  const fromKey = removed[0];
  const toKey = added[0];
  if (!fromKey || !toKey || fromKey === toKey) return [];

  // A true rename replaces one slot, so the two keys must occupy the same
  // position. Without this check a delete-plus-add of the same size is
  // indistinguishable from a rename and would move marks into an activity the
  // teacher never renamed.
  if (currentKeys.indexOf(fromKey) !== nextKeys.indexOf(toKey)) return [];

  return [{ fromKey, toKey }];
};

module.exports = { planActivityMigrations };