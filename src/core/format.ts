import { DAY_NAMES } from "../constants.js";
import { isSingleValue, isSpecialItem, startsWithWildcard } from "./ast.js";
import { DIALECTS, fromCanonicalWeekday } from "./dialects.js";
import { CronConvertError, FIELD_LABELS } from "./errors.js";
import { parse, resolveCron } from "./parse.js";
import type { Cron, Dialect, DialectOption, FieldExpr, FieldItem, FieldName } from "./types.js";

export interface FormatOptions {
  /** Target dialect; defaults to the expression's own. A different one converts (and may throw). */
  dialect?: Dialect;
}

export interface ConvertOptions {
  to: Dialect;
  /** Source dialect when the input is a string; defaults to `auto`. */
  from?: DialectOption;
}

/**
 * Canonical string for an expression: single spaces, day-of-week as names
 * (so Quartz 1-7 vs Unix 0-7 numbering can't be confused), numbers elsewhere.
 */
export function format(input: string | Cron, options: FormatOptions = {}): string {
  const cron = resolveCron(input);
  const target = options.dialect ?? cron.dialect;
  const fields = target === cron.dialect ? cron.fields : convertFields(cron, target);
  return formatFields(fields, target);
}

/** Converts between dialects; throws `CronConvertError` when the target can't express it. */
export function convert(input: string | Cron, options: ConvertOptions): string {
  const cron = resolveCron(input, { dialect: options.from ?? "auto" });
  return format(cron, { dialect: options.to });
}

function convertFields(cron: Cron, target: Dialect): Record<FieldName, FieldExpr> {
  const reasons: string[] = [];
  const fields = { ...cron.fields };
  const { dayOfMonth, dayOfWeek } = cron.fields;

  if (target === "unix") {
    if (!isSingleValue(fields.second, 0)) reasons.push("Unix cron has no seconds field; seconds must be 0");
    if (fields.year.kind !== "any") reasons.push("Unix cron has no year field");

    for (const field of ["dayOfMonth", "dayOfWeek"] as const) {
      const expr = fields[field];
      if (expr.kind === "none") fields[field] = { kind: "any" };
      if (expr.kind === "list") {
        for (const item of expr.items.filter(isSpecialItem)) {
          const token = formatItem(item, field, cron.dialect);
          reasons.push(`Unix cron does not support '${token}' in ${FIELD_LABELS[field].toLowerCase()}`);
        }
      }
    }
  } else {
    const domAny = dayOfMonth.kind === "any";
    const dowAny = dayOfWeek.kind === "any";
    if (domAny) {
      fields.dayOfMonth = dowAny ? { kind: "any" } : { kind: "none" };
      fields.dayOfWeek = dowAny ? { kind: "none" } : dayOfWeek;
    } else if (dowAny) {
      fields.dayOfWeek = { kind: "none" };
    } else if (startsWithWildcard(dayOfMonth) || startsWithWildcard(dayOfWeek)) {
      reasons.push("Unix matches day-of-month AND day-of-week here (leading '*'); Quartz can't restrict both day fields");
    } else {
      reasons.push("Unix matches day-of-month OR day-of-week here; Quartz can't restrict both day fields");
    }
  }

  if (reasons.length > 0) throw new CronConvertError(reasons);

  // Safety net: the target dialect must accept the result (e.g. Quartz caps step sizes).
  const reparsed = parse(formatFields(fields, target), { dialect: target });
  if (!reparsed.success) throw new CronConvertError(reparsed.errors.map((error) => error.message));
  return fields;
}

function formatFields(fields: Record<FieldName, FieldExpr>, dialect: Dialect): string {
  const spec = DIALECTS[dialect];
  const names: FieldName[] = [...spec.fieldOrder];
  if (spec.optionalField && fields[spec.optionalField].kind !== "any") names.push(spec.optionalField);
  return names.map((field) => formatField(fields[field], field, dialect)).join(" ");
}

function formatField(expr: FieldExpr, field: FieldName, dialect: Dialect): string {
  if (expr.kind === "any") return "*";
  if (expr.kind === "none") return dialect === "quartz" ? "?" : "*";
  return expr.items.map((item) => formatItem(item, field, dialect)).join(",");
}

function formatItem(item: FieldItem, field: FieldName, dialect: Dialect): string {
  const isDayOfWeek = field === "dayOfWeek";
  const native = (value: number) => (isDayOfWeek ? fromCanonicalWeekday(dialect, value) : value);
  const label = (value: number) => (isDayOfWeek ? DAY_NAMES[value].toUpperCase() : String(value));

  switch (item.kind) {
    case "value":
      return label(item.value);
    case "range":
      return item.step === undefined
        ? `${label(item.start)}-${label(item.end)}`
        : `${native(item.start)}-${native(item.end)}/${item.step}`;
    case "step":
      if (item.start === "any") return `*/${item.step}`;
      // Unix day-of-week runs to 7 (= Sunday again), so `1/2` would add Sunday; bound it at Saturday.
      if (isDayOfWeek && dialect === "unix") return `${item.start}-6/${item.step}`;
      return `${native(item.start)}/${item.step}`;
    case "lastDay":
      return item.offset === 0 ? "L" : `L-${item.offset}`;
    case "nearestWeekday":
      return `${item.day}W`;
    case "lastWeekday":
      return "LW";
    case "lastDayOfWeek":
      return `${native(item.weekday)}L`;
    case "nthDayOfWeek":
      return `${native(item.weekday)}#${item.nth}`;
  }
}
