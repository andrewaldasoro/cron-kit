import { DAY_NAMES, MONTH_NAMES } from "../constants.js";
import type { Boundaries } from "../utils/operator-grammar.js";
import type { Dialect, FieldName } from "./types.js";

export interface FieldSpec {
  /** Inclusive bounds in the dialect's native numbering. */
  bounds: Boundaries;
  /** Lowercase three-letter names; `names[i]` has native value `nameBase + i`. */
  names?: readonly string[];
  nameBase?: number;
  /** Human hint for the names, used in error messages (e.g. `JAN-DEC`). */
  namesHint?: string;
  maxStep?: number;
}

export interface DialectSpec {
  dialect: Dialect;
  /** Fields in the order they appear in an expression. */
  fieldOrder: readonly FieldName[];
  /** A trailing field that may be omitted (Quartz year). */
  optionalField?: FieldName;
  fields: Partial<Record<FieldName, FieldSpec>>;
  /** Quartz silently ignores `/n` after a name, so we reject it there. */
  allowNamedStepStart: boolean;
  /** Supports `?`, `L`, `W`, `#` in the day fields. */
  daySpecials: boolean;
}

const MONTH: FieldSpec = { bounds: [1, 12], names: MONTH_NAMES, nameBase: 1, namesHint: "JAN-DEC" };

export const QUARTZ: DialectSpec = {
  dialect: "quartz",
  fieldOrder: ["second", "minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
  optionalField: "year",
  fields: {
    second: { bounds: [0, 59], maxStep: 59 },
    minute: { bounds: [0, 59], maxStep: 59 },
    hour: { bounds: [0, 23], maxStep: 23 },
    dayOfMonth: { bounds: [1, 31], maxStep: 31 },
    month: { ...MONTH, maxStep: 12 },
    dayOfWeek: { bounds: [1, 7], names: DAY_NAMES, nameBase: 1, namesHint: "SUN-SAT", maxStep: 7 },
    year: { bounds: [1970, 2199] },
  },
  allowNamedStepStart: false,
  daySpecials: true,
};

export const UNIX: DialectSpec = {
  dialect: "unix",
  fieldOrder: ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"],
  fields: {
    minute: { bounds: [0, 59] },
    hour: { bounds: [0, 23] },
    dayOfMonth: { bounds: [1, 31] },
    month: MONTH,
    dayOfWeek: { bounds: [0, 7], names: DAY_NAMES, nameBase: 0, namesHint: "SUN-SAT" },
  },
  allowNamedStepStart: true,
  daySpecials: false,
};

export const DIALECTS: Record<Dialect, DialectSpec> = { quartz: QUARTZ, unix: UNIX };

/** Native (dialect) weekday → canonical weekday (0 = Sunday … 6 = Saturday). */
export function toCanonicalWeekday(dialect: Dialect, native: number): number {
  return dialect === "quartz" ? native - 1 : native % 7;
}

/** Canonical weekday → native weekday of the dialect. */
export function fromCanonicalWeekday(dialect: Dialect, canonical: number): number {
  return dialect === "quartz" ? canonical + 1 : canonical;
}

/** Unix `@macros` that expand to a schedule. `@reboot` is deliberately absent. */
export const UNIX_MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};
