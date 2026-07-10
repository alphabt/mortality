// Actuarial life-expectancy data + estimator. Zero dependencies, pure functions.
//
// WORLD SOURCE: United Nations, Department of Economic and Social Affairs,
// Population Division (2024), World Population Prospects 2024. The arrays below
// are the World, 2023, Medium-variant `ex` columns extracted from the complete
// male, female, and both-sexes life-table CSVs and converted to JavaScript arrays
// (ages 0..99 plus the official 100+ endpoint):
// https://population.un.org/wpp/
// https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/
// WPP2024_Life_Table_Complete_Medium_Male_1950-2023.csv.gz
// WPP2024_Life_Table_Complete_Medium_Female_1950-2023.csv.gz
// WPP2024_Life_Table_Complete_Medium_Both_1950-2023.csv.gz
//
// UN data is licensed CC BY 3.0 IGO:
// https://creativecommons.org/licenses/by/3.0/igo/
// Redistribution and adaptation are permitted with attribution; this project is
// not endorsed by the United Nations. See THIRD_PARTY_NOTICES.txt.
//
// UNITED STATES SOURCE: U.S. Social Security Administration, "Actuarial Life
// Table" — Period Life Table, 2023 (as used in the 2026 Trustees Report).
// https://www.ssa.gov/oact/STATS/table4c6.html
// Works of the U.S. federal government are in the PUBLIC DOMAIN (17 U.S.C. Sec.
// 105). WHO GHO data is deliberately NOT used because its CC BY-NC-SA terms are
// incompatible with embedding here.
//
// MALE and FEMALE below are the e(x) column — the expectation of remaining years
// of life at exact integer age x — for x = 0..119 in the SSA table. WORLD_MALE
// and WORLD_FEMALE are the equivalent World series for ages 0..100. Spot checks:
// SSA male e(0)=75.79, e(65)=18.12; SSA female e(0)=81.06, e(65)=20.66.
// UN World male e(0)=70.5472, e(65)=16.0083; UN World female e(0)=75.8857,
// e(65)=18.9811.

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
 * U.S. unisex expectation of remaining life: the simple average of MALE and
 * FEMALE at each age.
 */
export const UNISEX = MALE.map((m, i) => (m + FEMALE[i]) / 2);

/** UN World male expectation of remaining life e(x), ages 0..100 (years). */
export const WORLD_MALE = [
  70.5472, 71.6729, 70.9245, 70.0974, 69.2331, 68.3454, 67.4395, 66.5183,
  65.5849, 64.6414, 63.6901, 62.7336, 61.7747, 60.8156, 59.8585, 58.9056,
  57.959, 57.0199, 56.089, 55.1661, 54.2497, 53.3382, 52.4297, 51.522, 50.6144,
  49.7065, 48.7978, 47.8881, 46.9777, 46.0669, 45.156, 44.2454, 43.3353,
  42.4251, 41.5153, 40.6074, 39.7012, 38.7971, 37.8961, 36.9988, 36.1058,
  35.2173, 34.3323, 33.4528, 32.5785, 31.7094, 30.8452, 29.9849, 29.1287,
  28.2771, 27.4314, 26.5939, 25.7658, 24.948, 24.1407, 23.3437, 22.5574,
  21.7815, 21.0141, 20.2561, 19.5098, 18.7773, 18.0628, 17.3651, 16.6807,
  16.0083, 15.3468, 14.6979, 14.0605, 13.4347, 12.823, 12.225, 11.64, 11.0676,
  10.5054, 9.961, 9.4238, 8.8972, 8.3893, 7.9004, 7.428, 6.975, 6.5449, 6.1348,
  5.7434, 5.3739, 5.0232, 4.6898, 4.3767, 4.0827, 3.811, 3.5576, 3.3205, 3.1026,
  2.9054, 2.7267, 2.5655, 2.4195, 2.2894, 2.1752, 2.0733,
];

/** UN World female expectation of remaining life e(x), ages 0..100 (years). */
export const WORLD_FEMALE = [
  75.8857, 76.8368, 76.1002, 75.2757, 74.4126, 73.5264, 72.6227, 71.7042,
  70.7734, 69.8318, 68.8814, 67.9249, 66.9652, 66.0048, 65.0457, 64.0893,
  63.1366, 62.1876, 61.2417, 60.2982, 59.3557, 58.4136, 57.4717, 56.53, 55.5889,
  54.6486, 53.7089, 52.7701, 51.8317, 50.8936, 49.9556, 49.0179, 48.0799,
  47.1415, 46.2033, 45.266, 44.3299, 43.3952, 42.4629, 41.5334, 40.6069,
  39.6831, 38.762, 37.8448, 36.9311, 36.0211, 35.1145, 34.2102, 33.3081,
  32.4086, 31.5125, 30.6213, 29.736, 28.8574, 27.9866, 27.1242, 26.271, 25.4266,
  24.5884, 23.7568, 22.9319, 22.1168, 21.3163, 20.5288, 19.7506, 18.9811,
  18.2196, 17.468, 16.727, 15.9966, 15.2795, 14.5748, 13.8834, 13.2064, 12.5426,
  11.9002, 11.2724, 10.6605, 10.0716, 9.5049, 8.9558, 8.4266, 7.9194, 7.4329,
  6.9666, 6.5228, 6.098, 5.6918, 5.3058, 4.9401, 4.5958, 4.2718, 3.9671, 3.6851,
  3.4265, 3.1902, 2.9708, 2.7686, 2.5843, 2.4183, 2.269,
];

/** UN World official both-sexes expectation of remaining life, ages 0..100. */
export const WORLD_BOTH = [
  73.1694, 74.216, 73.4736, 72.6481, 71.7845, 70.8978, 69.9931, 69.0733,
  68.1412, 67.1987, 66.2479, 65.2915, 64.3323, 63.3727, 62.4148, 61.4604,
  60.5111, 59.5676, 58.6299, 57.6977, 56.7694, 55.844, 54.9202, 53.9971,
  53.0742, 52.1516, 51.2288, 50.3059, 49.383, 48.4598, 47.5367, 46.6139,
  45.6912, 44.7683, 43.8457, 42.9246, 42.0049, 41.087, 40.1719, 39.26, 38.352,
  37.4475, 36.5463, 35.6499, 34.7579, 33.8704, 32.9872, 32.1071, 31.2302,
  30.3571, 29.4887, 28.6271, 27.7732, 26.9281, 26.0923, 25.2659, 24.4495,
  23.6429, 22.8437, 22.0527, 21.2711, 20.5014, 19.7481, 19.0098, 18.2827,
  17.5661, 16.8589, 16.1629, 15.4776, 14.8034, 14.1426, 13.4946, 12.8595,
  12.2377, 11.6275, 11.037, 10.4574, 9.8912, 9.3459, 8.8213, 8.3138, 7.8258,
  7.3595, 6.9131, 6.4856, 6.0801, 5.693, 5.3233, 4.9732, 4.6422, 4.3323, 4.0405,
  3.7659, 3.5116, 3.2785, 3.0651, 2.8673, 2.6847, 2.5176, 2.3666, 2.2298,
];

/** The official World both-sexes series used when sex is not shared. */
export const WORLD_UNISEX = WORLD_BOTH;

export const DEFAULT_LIFE_TABLE = "world";

/** Stable state values and locale message keys for life-expectancy data sources. */
export const LIFE_TABLE_OPTIONS = Object.freeze([
  Object.freeze({ value: "world", messageKey: "lifeTableWorld" }),
  Object.freeze({ value: "us", messageKey: "lifeTableUS" }),
]);

const TABLES = {
  world: {
    male: WORLD_MALE,
    female: WORLD_FEMALE,
    unisex: WORLD_UNISEX,
  },
  us: { male: MALE, female: FEMALE, unisex: UNISEX },
};

/** Normalize persisted/imported table ids; unknown values use the World baseline. */
export function normalizeLifeTable(value) {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TABLES, value)
    ? value
    : DEFAULT_LIFE_TABLE;
}

/** The e(x) table for a given sex and baseline; unknown/null sex uses unisex. */
function tableFor(sex, lifeTable) {
  const tables = TABLES[normalizeLifeTable(lifeTable)];
  if (sex === "male") return tables.male;
  if (sex === "female") return tables.female;
  return tables.unisex;
}

/**
 * Estimate the total expected age at death for someone who has ALREADY attained
 * `ageYears`, conditioned on an optional sex at birth and named actuarial
 * baseline. Life expectancy is conditional on survival: e(x) is the expected
 * REMAINING years at exact age x, so the total expected age is x + e(x), which
 * rises with attained age. e(x) is linearly interpolated between integer ages
 * for smoothness, and the final total is rounded to a whole year.
 *
 * The attained age is clamped to the table's bounds [0, last index] before
 * lookup; the result sits within the app's supported expectancy band [1, 150]
 * and never falls below an attained age inside that band.
 *
 * @param {number} ageYears Attained age in years (may be fractional).
 * @param {"male"|"female"|null} [sex] Sex at birth; null/omitted uses UNISEX.
 * @param {"world"|"us"} [lifeTable] Life-expectancy data source; defaults to World.
 * @returns {number} Whole-number total expected age at death.
 */
export function estimateExpectancy(
  ageYears,
  sex,
  lifeTable = DEFAULT_LIFE_TABLE,
) {
  const table = tableFor(sex, lifeTable);
  const last = table.length - 1;
  const attainedAge = Number.isFinite(ageYears) ? Math.max(0, ageYears) : 0;
  const age = Math.min(last, attainedAge);
  const lo = Math.floor(age);
  const hi = Math.min(last, lo + 1);
  // Interpolate e(x) between the two bracketing integer ages.
  const ex = table[lo] + (table[hi] - table[lo]) * (age - lo);
  const total = Math.round(age + ex);
  // Never below the person's current age; keep inside the app's clamp [1, 150].
  return Math.min(150, Math.max(1, Math.ceil(attainedAge), total));
}
