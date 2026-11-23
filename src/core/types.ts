export type Dialect = "quartz" | "unix";

export type FieldName =
  | "second"
  | "minute"
  | "hour"
  | "dayOfMonth"
  | "month"
  | "dayOfWeek"
  | "year";

/**
 * One comma-separated item of a field, in canonical numbering:
 * day-of-week is always 0 = Sunday … 6 = Saturday, whatever the dialect.
 */
export type FieldItem =
  | { kind: "value"; value: number }
  | { kind: "range"; start: number; end: number; step?: number }
  /** `*\/5` (start "any" = field minimum) or `10/5` (start to field maximum). */
  | { kind: "step"; start: number | "any"; step: number }
  /** Day-of-month `L` (offset 0) or `L-3`. */
  | { kind: "lastDay"; offset: number }
  /** Day-of-month `15W`: weekday nearest the given day, within the same month. */
  | { kind: "nearestWeekday"; day: number }
  /** Day-of-month `LW`: last weekday (Mon-Fri) of the month. */
  | { kind: "lastWeekday" }
  /** Day-of-week `5L` / `FRIL`: last given weekday of the month. */
  | { kind: "lastDayOfWeek"; weekday: number }
  /** Day-of-week `6#3` / `FRI#3`: nth given weekday of the month. */
  | { kind: "nthDayOfWeek"; weekday: number; nth: 1 | 2 | 3 | 4 | 5 };

export type FieldExpr =
  | { kind: "any" }
  /** Quartz `?`: no specific value (day-of-month / day-of-week only). */
  | { kind: "none" }
  | { kind: "list"; items: FieldItem[] };

export interface Cron {
  dialect: Dialect;
  /** The expression as given (trimmed), e.g. `@daily` or `0 0 12 * * ?`. */
  source: string;
  fields: Record<FieldName, FieldExpr>;
}

export type DialectOption = Dialect | "auto";

export interface ParseOptions {
  /** `auto` (default): `@macro` or 5 fields → unix; 6-7 fields → quartz. */
  dialect?: DialectOption;
}

export type CronErrorCode =
  | "EMPTY_EXPRESSION"
  | "WRONG_FIELD_COUNT"
  | "UNKNOWN_MACRO"
  | "UNSUPPORTED_MACRO"
  | "INVALID_VALUE"
  | "INVALID_RANGE"
  | "INVALID_STEP"
  | "UNSUPPORTED_SYNTAX"
  | "INVALID_NTH"
  | "SPECIAL_NOT_COMBINABLE"
  | "DAY_FIELDS_BOTH_SET"
  | "DAY_FIELDS_BOTH_UNSET";

export interface CronError {
  code: CronErrorCode;
  /** The field the error belongs to; absent for whole-expression errors. */
  field?: FieldName;
  /** Values interpolated into the message (token, bounds, …). */
  params: Record<string, string | number>;
  /** English message. Use `formatError` from `cron-kit/describe` for other locales. */
  message: string;
}

export type ParseResult =
  | { success: true; cron: Cron }
  | { success: false; errors: CronError[] };

export interface ValidationResult {
  valid: boolean;
  errors: CronError[];
}
