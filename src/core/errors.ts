import type { CronError, CronErrorCode, FieldName } from "./types.js";

export const FIELD_LABELS: Record<FieldName, string> = {
  second: "Seconds",
  minute: "Minutes",
  hour: "Hours",
  dayOfMonth: "Day-of-month",
  month: "Month",
  dayOfWeek: "Day-of-week",
  year: "Year",
};

const DIALECT_LABELS: Record<string, string> = { quartz: "Quartz", unix: "Unix" };

type ErrorParams = CronError["params"];

/** English text for an error. Also the `en` locale's error formatter. */
export function englishErrorMessage(error: Pick<CronError, "code" | "field" | "params">): string {
  const { code, field, params } = error;
  const label = field ? FIELD_LABELS[field] : "Field";
  const lowerLabel = label.toLowerCase();

  switch (code) {
    case "EMPTY_EXPRESSION":
      return "Cron expression is empty";
    case "WRONG_FIELD_COUNT": {
      const got = params.count === undefined ? "" : ` (got ${params.count})`;
      if (params.dialect === "quartz") return `Quartz cron expressions must have 6 fields, or 7 including a year${got}`;
      if (params.dialect === "unix") return `Unix cron expressions must have 5 fields${got}`;
      return `Cron expressions must have 5 fields (Unix) or 6-7 fields (Quartz)${got}`;
    }
    case "UNKNOWN_MACRO":
      return `Unknown macro '${params.macro}'`;
    case "UNSUPPORTED_MACRO":
      return `'${params.macro}' runs at startup, not on a schedule, and is not supported`;
    case "INVALID_VALUE": {
      const names = params.names ? `, or ${params.names}` : "";
      return `${label} must be between ${params.min} and ${params.max}${names}`;
    }
    case "INVALID_RANGE":
      return `${label} has an invalid range '${params.token}' (start must not be after end)`;
    case "INVALID_STEP": {
      const bound = params.max === undefined ? "" : ` (increment must be between 1 and ${params.max})`;
      return `${label} has an invalid step '${params.token}'${bound}`;
    }
    case "UNSUPPORTED_SYNTAX":
      return `${label} does not support '${params.token}' in ${DIALECT_LABELS[params.dialect] ?? params.dialect} cron`;
    case "INVALID_NTH":
      return "The occurrence after '#' must be between 1 and 5";
    case "SPECIAL_NOT_COMBINABLE":
      return `'${params.token}' cannot be combined with other values in ${lowerLabel}`;
    case "DAY_FIELDS_BOTH_SET":
      return "Quartz requires '?' in either day-of-month or day-of-week";
    case "DAY_FIELDS_BOTH_UNSET":
      return "'?' can be used in day-of-month or day-of-week, not both";
  }
}

export function createError(code: CronErrorCode, field?: FieldName, params: ErrorParams = {}): CronError {
  const draft = field ? { code, field, params } : { code, params };
  return { ...draft, message: englishErrorMessage(draft) };
}

/** Thrown by functions that accept `string | Cron` when the string is invalid. */
export class CronParseError extends Error {
  override name = "CronParseError";
  readonly errors: CronError[];

  constructor(errors: CronError[]) {
    super(errors.map((error) => error.message).join("; "));
    this.errors = errors;
  }
}

/** Thrown by `convert` when the target dialect can't express part of the expression. */
export class CronConvertError extends Error {
  override name = "CronConvertError";
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super(reasons.join("; "));
    this.reasons = reasons;
  }
}
