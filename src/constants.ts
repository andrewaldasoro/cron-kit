/** Three-letter names, lowercase. Index 0 = January. */
export const MONTH_NAMES: readonly string[] = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Three-letter names, lowercase. Index = canonical weekday (0 = Sunday). */
export const DAY_NAMES: readonly string[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Canonical (dialect-independent) bounds used by the scheduler and formatter. */
export const CANONICAL_BOUNDS = {
  second: [0, 59],
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
  /** Quartz year bound (this library's, Quartz itself uses 2099 / now + 100). */
  year: [1970, 2199],
} as const;
