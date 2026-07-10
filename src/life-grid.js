export const WEEKS_PER_ROW = 52;

/**
 * Describe fixed 52-cell visual bands without implying that their boundaries
 * are exact calendar birthdays.
 */
export function lifeGridRows(total, columns = WEEKS_PER_ROW) {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("Life-grid total must be a non-negative integer");
  }
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError("Life-grid columns must be a positive integer");
  }

  const rows = [];
  for (let startIndex = 0, age = 0; startIndex < total; age++) {
    const cellCount = Math.min(columns, total - startIndex);
    rows.push({
      age,
      startIndex,
      endIndex: startIndex + cellCount - 1,
      cellCount,
      isDecade: age % 10 === 0,
      showLabel: age % 5 === 0,
    });
    startIndex += cellCount;
  }
  return rows;
}
