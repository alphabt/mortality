// Actuarial life-expectancy data + estimator. Zero dependencies, pure functions.
//
// Source: U.S. Social Security Administration, "Actuarial Life Table" —
// Period Life Table, 2023 (as used in the 2026 Trustees Report).
// https://www.ssa.gov/oact/STATS/table4c6.html
//
// Works of the U.S. federal government are in the PUBLIC DOMAIN (17 U.S.C. Sec.
// 105), so this table is safe to embed under the project's MIT, zero-dependency
// ethos. (WHO GHO life-expectancy data is deliberately NOT used: its
// CC BY-NC-SA licensing is incompatible with embedding here.)
//
// MALE and FEMALE below are the e(x) column — the expectation of remaining years
// of life at exact integer age x — for x = 0..119. Spot-check values from the
// source table: MALE e(0)=75.79, e(65)=18.12, e(100)=2.04; FEMALE e(0)=81.06,
// e(65)=20.66, e(100)=2.23. The table's own invariants hold across every age:
// e(x) is non-increasing, the total x+e(x) is non-decreasing, and FEMALE e(x) is
// >= MALE e(x) everywhere.

/** Male expectation of remaining life e(x), by integer age x = 0..119 (years). */
export const MALE = [
  75.79, 75.25, 74.28, 73.31, 72.33, 71.34, 70.35, 69.36, 68.37, 67.38, 66.39,
  65.39, 64.4, 63.41, 62.43, 61.45, 60.48, 59.51, 58.56, 57.62, 56.69, 55.76,
  54.83, 53.9, 52.98, 52.06, 51.14, 50.23, 49.32, 48.41, 47.5, 46.6, 45.7,
  44.81, 43.91, 43.02, 42.13, 41.24, 40.36, 39.47, 38.59, 37.71, 36.83, 35.95,
  35.08, 34.21, 33.34, 32.48, 31.62, 30.76, 29.9, 29.05, 28.21, 27.38, 26.55,
  25.73, 24.92, 24.12, 23.34, 22.56, 21.79, 21.04, 20.29, 19.56, 18.83, 18.12,
  17.41, 16.71, 16.02, 15.34, 14.66, 14.0, 13.34, 12.69, 12.05, 11.42, 10.8,
  10.19, 9.61, 9.04, 8.5, 7.97, 7.46, 6.97, 6.5, 6.04, 5.61, 5.2, 4.81, 4.45,
  4.11, 3.8, 3.5, 3.23, 2.99, 2.77, 2.58, 2.41, 2.27, 2.15, 2.04, 1.93, 1.83,
  1.72, 1.63, 1.54, 1.45, 1.36, 1.28, 1.2, 1.13, 1.05, 0.98, 0.92, 0.85, 0.79,
  0.74, 0.68, 0.63, 0.58,
];

/** Female expectation of remaining life e(x), by integer age x = 0..119 (years). */
export const FEMALE = [
  81.06, 80.48, 79.51, 78.53, 77.54, 76.55, 75.56, 74.57, 73.58, 72.59, 71.59,
  70.6, 69.61, 68.62, 67.63, 66.64, 65.66, 64.67, 63.69, 62.72, 61.74, 60.77,
  59.8, 58.83, 57.86, 56.9, 55.93, 54.97, 54.0, 53.04, 52.08, 51.13, 50.18,
  49.23, 48.28, 47.34, 46.39, 45.45, 44.51, 43.58, 42.64, 41.71, 40.78, 39.86,
  38.93, 38.01, 37.1, 36.18, 35.27, 34.36, 33.45, 32.55, 31.66, 30.77, 29.89,
  29.01, 28.14, 27.28, 26.42, 25.57, 24.73, 23.9, 23.08, 22.27, 21.46, 20.66,
  19.87, 19.08, 18.3, 17.53, 16.76, 16.01, 15.26, 14.53, 13.81, 13.1, 12.41,
  11.73, 11.08, 10.44, 9.82, 9.22, 8.64, 8.08, 7.54, 7.02, 6.53, 6.05, 5.61,
  5.19, 4.8, 4.44, 4.1, 3.79, 3.5, 3.23, 2.99, 2.77, 2.57, 2.39, 2.23, 2.08,
  1.94, 1.82, 1.7, 1.59, 1.48, 1.38, 1.29, 1.2, 1.13, 1.05, 0.98, 0.92, 0.85,
  0.79, 0.74, 0.68, 0.63, 0.58,
];

/**
 * Unisex expectation of remaining life: the simple average of MALE and FEMALE at
 * each age. Used when the user hasn't shared a sex at birth.
 */
export const UNISEX = MALE.map((m, i) => (m + FEMALE[i]) / 2);

/** The e(x) table for a given sex; unknown/null falls back to UNISEX. */
function tableFor(sex) {
  if (sex === "male") return MALE;
  if (sex === "female") return FEMALE;
  return UNISEX;
}

/**
 * Estimate the total expected age at death for someone who has ALREADY attained
 * `ageYears`, conditioned on an optional sex at birth. Life expectancy is
 * conditional on survival: e(x) is the expected REMAINING years at exact age x,
 * so the total expected age is x + e(x), which rises with attained age (a 70-year
 * old outlives the at-birth average). e(x) is linearly interpolated between
 * integer ages for smoothness, and the final total is rounded to a whole year.
 *
 * The attained age is clamped to the table's bounds [0, last index] before
 * lookup; the result is guaranteed to be >= the attained age and to sit within
 * the app's supported expectancy band [1, 150].
 *
 * @param {number} ageYears Attained age in years (may be fractional).
 * @param {"male"|"female"|null} [sex] Sex at birth; null/omitted uses UNISEX.
 * @returns {number} Whole-number total expected age at death.
 */
export function estimateExpectancy(ageYears, sex) {
  const table = tableFor(sex);
  const last = table.length - 1;
  const age = Math.min(
    last,
    Math.max(0, Number.isFinite(ageYears) ? ageYears : 0),
  );
  const lo = Math.floor(age);
  const hi = Math.min(last, lo + 1);
  // Interpolate e(x) between the two bracketing integer ages.
  const ex = table[lo] + (table[hi] - table[lo]) * (age - lo);
  const total = Math.round(age + ex);
  // Never below the person's current age; keep inside the app's clamp [1, 150].
  return Math.min(150, Math.max(1, Math.ceil(age), total));
}
