import { CANONICAL_BOUNDS } from "../constants.js";
import { format } from "../core/format.js";
import { resolveCron } from "../core/parse.js";
import type { Cron, Dialect, FieldExpr, FieldItem, ParseOptions } from "../core/types.js";
import { expand } from "../schedule/compile.js";
import {
  HOUR_INTERVALS,
  MINUTE_INTERVALS,
  WEEKDAYS,
  type HourInterval,
  type MinuteInterval,
  type Month,
  type MonthDay,
  type Recurrence,
  type TimeOfDay,
  type Weekday,
} from "./types.js";

export { HOUR_INTERVALS, MINUTE_INTERVALS, WEEKDAYS } from "./types.js";

/** Thrown by `fromRecurrence` for invalid input or a dialect that can't express it. */
export class CronRecurrenceError extends Error {
  override name = "CronRecurrenceError";
}

const ANY: FieldExpr = { kind: "any" };
const NONE: FieldExpr = { kind: "none" };

// ── Recurrence → cron ───────────────────────────────────────────────────────

export function fromRecurrence(recurrence: Recurrence, options: { dialect: Dialect }): string {
  const { dialect } = options;
  const fields: Cron["fields"] = {
    second: values([0]),
    minute: ANY,
    hour: ANY,
    dayOfMonth: ANY,
    month: ANY,
    dayOfWeek: ANY,
    year: ANY,
  };

  switch (recurrence.frequency) {
    case "minutely":
      fields.minute = every(checkInterval(recurrence.interval, MINUTE_INTERVALS, "minute"));
      break;
    case "hourly":
      fields.minute = values([checkInteger(recurrence.minute, CANONICAL_BOUNDS.minute, "minute")]);
      fields.hour = every(checkInterval(recurrence.interval, HOUR_INTERVALS, "hour"));
      break;
    case "daily":
      setTime(fields, recurrence.at, dialect);
      break;
    case "weekly":
      setTime(fields, recurrence.at, dialect);
      fields.dayOfWeek = weekdayList(recurrence.weekdays);
      break;
    case "monthly":
      setTime(fields, recurrence.at, dialect);
      setMonthDay(fields, recurrence.on, dialect);
      break;
    case "yearly":
      setTime(fields, recurrence.at, dialect);
      setMonthDay(fields, recurrence.on, dialect);
      fields.month = values(checkList(recurrence.months, CANONICAL_BOUNDS.month, "month"));
      break;
    default:
      throw new CronRecurrenceError(`Unknown frequency '${(recurrence as { frequency: string }).frequency}'`);
  }

  if (dialect === "quartz") {
    // Quartz needs '?' in exactly one day field.
    if (fields.dayOfWeek.kind !== "any") fields.dayOfMonth = fields.dayOfMonth.kind === "any" ? NONE : fields.dayOfMonth;
    else fields.dayOfWeek = NONE;
  }

  return format({ dialect, source: "", fields });
}

function setTime(fields: Cron["fields"], at: TimeOfDay, dialect: Dialect): void {
  const second = checkInteger(at.second ?? 0, CANONICAL_BOUNDS.second, "second");
  if (second !== 0 && dialect === "unix") throw new CronRecurrenceError("Unix cron has no seconds; second must be 0");
  fields.second = values([second]);
  fields.minute = values([checkInteger(at.minute, CANONICAL_BOUNDS.minute, "minute")]);
  fields.hour = values(checkList(at.hours, CANONICAL_BOUNDS.hour, "hour"));
}

function setMonthDay(fields: Cron["fields"], on: MonthDay, dialect: Dialect): void {
  if ("days" in on) {
    fields.dayOfMonth = values(checkList(on.days, CANONICAL_BOUNDS.dayOfMonth, "day"));
    return;
  }
  if (dialect === "unix") {
    throw new CronRecurrenceError("Unix cron can't express the last day or the nth weekday of a month (Quartz only)");
  }
  if ("lastDay" in on) {
    fields.dayOfMonth = { kind: "list", items: [{ kind: "lastDay", offset: 0 }] };
    return;
  }

  const weekday = weekdayIndex(on.weekday);
  if (on.nth === "last") {
    fields.dayOfWeek = { kind: "list", items: [{ kind: "lastDayOfWeek", weekday }] };
  } else if ([1, 2, 3, 4, 5].includes(on.nth)) {
    fields.dayOfWeek = { kind: "list", items: [{ kind: "nthDayOfWeek", weekday, nth: on.nth }] };
  } else {
    throw new CronRecurrenceError(`nth must be 1-5 or "last", got ${String(on.nth)}`);
  }
}

/** Weekdays as values, collapsing a contiguous run of 3+ into a range (`MON-FRI`). */
function weekdayList(weekdays: Weekday[]): FieldExpr {
  if (weekdays.length === 0) throw new CronRecurrenceError("weekdays must not be empty");
  const sorted = [...new Set(weekdays.map(weekdayIndex))].sort((a, b) => a - b);
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (contiguous && sorted.length >= 3 && sorted.length < 7) {
    return { kind: "list", items: [{ kind: "range", start: sorted[0], end: sorted.at(-1)! }] };
  }
  return sorted.length === 7 ? ANY : values(sorted);
}

function weekdayIndex(weekday: Weekday): number {
  const index = WEEKDAYS.indexOf(weekday);
  if (index === -1) throw new CronRecurrenceError(`Unknown weekday '${String(weekday)}'`);
  return index;
}

function checkInterval(interval: number, allowed: readonly number[], unit: string): number {
  if (!allowed.includes(interval)) {
    throw new CronRecurrenceError(`A ${unit} interval must be one of ${allowed.join(", ")} (got ${interval})`);
  }
  return interval;
}

function checkInteger(value: number, [min, max]: readonly [number, number], unit: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CronRecurrenceError(`${unit} must be a whole number between ${min} and ${max} (got ${value})`);
  }
  return value;
}

function checkList(list: number[], bounds: readonly [number, number], unit: string): number[] {
  if (list.length === 0) throw new CronRecurrenceError(`${unit} list must not be empty`);
  return [...new Set(list.map((value) => checkInteger(value, bounds, unit)))].sort((a, b) => a - b);
}

function every(interval: number): FieldExpr {
  return interval === 1 ? ANY : { kind: "list", items: [{ kind: "step", start: "any", step: interval }] };
}

function values(list: number[]): FieldExpr {
  return { kind: "list", items: list.map((value) => ({ kind: "value", value })) };
}

// ── cron → Recurrence ───────────────────────────────────────────────────────

/**
 * The simple recurrence an expression represents, or null when it doesn't fit
 * the model (the UI should then fall back to a raw/advanced editor).
 */
export function toRecurrence(input: string | Cron, options: ParseOptions = {}): Recurrence | null {
  const { fields } = resolveCron(input, options);
  if (fields.year.kind !== "any") return null;

  const second = singleValue(fields.second);
  if (second === null) return null;

  const daysOpen = isOpen(fields.dayOfMonth) && isOpen(fields.dayOfWeek);
  const monthsOpen = fields.month.kind === "any";

  if (second === 0 && daysOpen && monthsOpen && fields.hour.kind === "any") {
    const interval = evenInterval(fields.minute, MINUTE_INTERVALS);
    if (interval !== null) return { frequency: "minutely", interval: interval as MinuteInterval };
  }

  const minute = singleValue(fields.minute);
  if (minute === null) return null;

  if (second === 0 && daysOpen && monthsOpen) {
    const interval = evenInterval(fields.hour, HOUR_INTERVALS);
    if (interval !== null) {
      return { frequency: "hourly", interval: interval as HourInterval, minute };
    }
  }

  const hours = plainValues(fields.hour, CANONICAL_BOUNDS.hour);
  if (hours === null) return null;
  const at: TimeOfDay = second === 0 ? { hours, minute } : { hours, minute, second };

  if (daysOpen) return monthsOpen ? { frequency: "daily", at } : null;

  if (isOpen(fields.dayOfMonth)) {
    const weekdays = plainValues(fields.dayOfWeek, CANONICAL_BOUNDS.dayOfWeek);
    if (weekdays !== null) {
      return monthsOpen ? { frequency: "weekly", weekdays: weekdays.map((day) => WEEKDAYS[day]), at } : null;
    }
  }

  const on = monthDayOf(fields.dayOfMonth, fields.dayOfWeek);
  if (on === null) return null;
  if (monthsOpen) return { frequency: "monthly", on, at };

  const months = plainValues(fields.month, CANONICAL_BOUNDS.month);
  return months === null ? null : { frequency: "yearly", months: months as Month[], on, at };
}

function monthDayOf(dayOfMonth: FieldExpr, dayOfWeek: FieldExpr): MonthDay | null {
  if (isOpen(dayOfWeek)) {
    const [item] = dayOfMonth.kind === "list" ? dayOfMonth.items : [];
    if (item?.kind === "lastDay" && item.offset === 0) return { lastDay: true };
    const days = plainValues(dayOfMonth, CANONICAL_BOUNDS.dayOfMonth);
    return days === null ? null : { days };
  }
  if (isOpen(dayOfMonth) && dayOfWeek.kind === "list" && dayOfWeek.items.length === 1) {
    const [item] = dayOfWeek.items;
    if (item.kind === "nthDayOfWeek") return { nth: item.nth, weekday: WEEKDAYS[item.weekday] };
    if (item.kind === "lastDayOfWeek") return { nth: "last", weekday: WEEKDAYS[item.weekday] };
  }
  return null;
}

/** `*` or `?`: the field doesn't restrict anything. */
function isOpen(expr: FieldExpr): boolean {
  return expr.kind === "any" || expr.kind === "none";
}

function singleValue(expr: FieldExpr): number | null {
  return expr.kind === "list" && expr.items.length === 1 && expr.items[0].kind === "value" ? expr.items[0].value : null;
}

/** `*` → 1, `*\/n` or `0/n` → n, when n is an interval cron repeats evenly. */
function evenInterval(expr: FieldExpr, allowed: readonly number[]): number | null {
  if (expr.kind === "any") return 1;
  if (expr.kind !== "list" || expr.items.length !== 1) return null;
  const [item] = expr.items;
  const startsAtZero = item.kind === "step" && (item.start === "any" || item.start === 0);
  return startsAtZero && allowed.includes(item.step) ? item.step : null;
}

/** Explicit values of a value/range/step list; null for `*`, `?` or special items. */
function plainValues(expr: FieldExpr, bounds: readonly [number, number]): number[] | null {
  if (expr.kind !== "list" || expr.items.some(isSpecial)) return null;
  return expand(expr, bounds);
}

function isSpecial(item: FieldItem): boolean {
  return item.kind !== "value" && item.kind !== "range" && item.kind !== "step";
}
