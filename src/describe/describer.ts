import { CANONICAL_BOUNDS } from "../constants.js";
import { startsWithWildcard } from "../core/ast.js";
import type { Cron, FieldExpr, FieldItem } from "../core/types.js";
import { expand } from "../schedule/compile.js";
import { capitalize, formatList, formatTime, monthName, weekdayName, type HourCycle } from "./intl.js";
import type { Locale, TimeText } from "./locale.js";

/** Up to this many distinct times are listed explicitly ("at 9:00 AM and 5:00 PM"). */
const MAX_LISTED_TIMES = 6;

type Bounds = readonly [number, number];

/** A field reduced to the shape that decides its wording. */
type Shape =
  | { kind: "any" }
  | { kind: "values"; values: number[] }
  | { kind: "step"; start: number | "any"; step: number }
  | { kind: "range"; start: number; end: number; step?: number }
  | { kind: "mixed"; items: FieldItem[] };

interface Context {
  locale: Locale;
  hourCycle: HourCycle;
}

export function describeCron(cron: Cron, locale: Locale, hourCycle: HourCycle): string {
  const context: Context = { locale, hourCycle };
  const pieces = [
    ...describeTime(cron, context),
    ...describeDays(cron, context),
    describeMonths(cron.fields.month, context),
    describeYears(cron.fields.year, context),
  ].filter((piece): piece is string => Boolean(piece));
  return capitalize(locale.code, pieces.join(", "));
}

// ── time of day ─────────────────────────────────────────────────────────────

function describeTime(cron: Cron, context: Context): string[] {
  const { locale } = context;
  const seconds = shapeOf(cron.fields.second, CANONICAL_BOUNDS.second);
  const minutes = shapeOf(cron.fields.minute, CANONICAL_BOUNDS.minute);
  const hours = shapeOf(cron.fields.hour, CANONICAL_BOUNDS.hour);

  if (seconds.kind === "values" && minutes.kind === "values" && hours.kind === "values") {
    const count = seconds.values.length * minutes.values.length * hours.values.length;
    if (count <= MAX_LISTED_TIMES) {
      const times = hours.values.flatMap((hour) =>
        minutes.values.flatMap((minute) => seconds.values.map((second) => time(context, hour, minute, second)))
      );
      return [locale.atTimes(times)];
    }
  }

  const secondsZero = isOnly(seconds, 0);
  if (secondsZero && isOnly(minutes, 0)) {
    if (hours.kind === "any") return [locale.everyHour()];
    if (hours.kind === "step" || (hours.kind === "range" && hours.step !== undefined)) {
      return [hourPhrase(hours, context)];
    }
    if (hours.kind === "range") return [locale.everyHour(), hourPhrase(hours, context)];
  }

  const pieces: string[] = [];
  if (!secondsZero) {
    pieces.push(seconds.kind === "any" ? locale.everySecond() : unitPhrase("second", seconds, context));
  }
  if (minutes.kind !== "any") pieces.push(unitPhrase("minute", minutes, context));
  else if (secondsZero) pieces.push(locale.everyMinute());
  if (hours.kind !== "any") pieces.push(hourPhrase(hours, context));
  return pieces;
}

function unitPhrase(unit: "second" | "minute", shape: Shape, context: Context): string {
  const { locale } = context;
  switch (shape.kind) {
    case "any":
      return unit === "second" ? locale.everySecond() : locale.everyMinute();
    case "values":
      return locale.atUnits(unit, shape.values);
    case "step":
      return stepPhrase(locale.every(unit, shape.step), shape.start, (start) => locale.startingAt(unit, start));
    case "range":
      return withStep(locale.unitRange(unit, shape.start, shape.end), shape.step, () => locale.every(unit, shape.step!));
    case "mixed":
      return joinItems(shape.items, CANONICAL_BOUNDS[unit], (item) => unitPhrase(unit, item, context), context);
  }
}

function hourPhrase(shape: Shape, context: Context): string {
  const { locale } = context;
  const startOf = (hour: number) => time(context, hour, 0);
  const endOf = (hour: number) => time(context, hour, 59);
  switch (shape.kind) {
    case "any":
      return locale.everyHour();
    case "values":
      return shape.values.length === 1
        ? locale.betweenTimes(startOf(shape.values[0]), endOf(shape.values[0]))
        : locale.duringHours(shape.values.map(startOf));
    case "step":
      return stepPhrase(locale.every("hour", shape.step), shape.start, (start) => locale.startingAtTime(startOf(start)));
    case "range":
      return withStep(locale.betweenTimes(startOf(shape.start), endOf(shape.end)), shape.step, () =>
        locale.every("hour", shape.step!)
      );
    case "mixed":
      return joinItems(shape.items, CANONICAL_BOUNDS.hour, (item) => hourPhrase(item, context), context);
  }
}

function time(context: Context, hour: number, minute: number, second = 0): TimeText {
  return { text: formatTime(context.locale.code, context.hourCycle, hour, minute, second), hour };
}

// ── days ────────────────────────────────────────────────────────────────────

function describeDays(cron: Cron, context: Context): (string | null)[] {
  const { dayOfMonth, dayOfWeek } = cron.fields;

  if (cron.dialect === "quartz") {
    return dayOfMonth.kind === "none"
      ? [dayOfWeekPhrase(dayOfWeek, true, context)]
      : [dayOfMonthPhrase(dayOfMonth, context)];
  }

  const monthDays = dayOfMonthPhrase(dayOfMonth, context);
  const weekDays = dayOfWeekPhrase(dayOfWeek, !monthDays || startsWithWildcard(dayOfMonth), context);
  if (!monthDays || !weekDays) return [monthDays ?? weekDays];
  // Vixie/cronie: AND if either field starts with '*', otherwise OR.
  if (startsWithWildcard(dayOfMonth) || startsWithWildcard(dayOfWeek)) return [monthDays, weekDays];
  return [formatList(context.locale.code, [monthDays, weekDays], "disjunction")];
}

function dayOfMonthPhrase(expr: FieldExpr, context: Context): string | null {
  const { locale } = context;
  if (expr.kind === "list" && expr.items.length === 1) {
    const [item] = expr.items;
    if (item.kind === "lastDay") return locale.lastDayOfMonth(item.offset);
    if (item.kind === "lastWeekday") return locale.lastWeekdayOfMonth();
    if (item.kind === "nearestWeekday") return locale.nearestWeekdayTo(item.day);
  }
  return dayShapePhrase(shapeOf(expr, CANONICAL_BOUNDS.dayOfMonth), context);
}

function dayShapePhrase(shape: Shape, context: Context): string | null {
  const { locale } = context;
  switch (shape.kind) {
    case "any":
      return null;
    case "values":
      return locale.onDaysOfMonth(shape.values);
    case "step":
      return stepPhrase(locale.every("day", shape.step), shape.start, (start) => locale.startingAt("day", start));
    case "range":
      return withStep(locale.betweenDaysOfMonth(shape.start, shape.end), shape.step, () =>
        locale.every("day", shape.step!)
      );
    case "mixed":
      return joinItems(
        shape.items,
        CANONICAL_BOUNDS.dayOfMonth,
        (item) => dayShapePhrase(item, context) ?? "",
        context
      );
  }
}

function dayOfWeekPhrase(expr: FieldExpr, exclusive: boolean, context: Context): string | null {
  const { locale } = context;
  const name = (weekday: number) => weekdayName(locale.code, weekday);

  if (expr.kind !== "list") return null;
  const [first] = expr.items;
  if (first.kind === "nthDayOfWeek") return locale.nthWeekday(first.nth, name(first.weekday));
  if (first.kind === "lastDayOfWeek") return locale.lastWeekday(name(first.weekday));

  const weekdays = expand(expr, CANONICAL_BOUNDS.dayOfWeek);
  if (weekdays.length === 7) return null;
  if (isContiguousRun(weekdays)) return locale.weekdayRange(name(weekdays[0]), name(weekdays.at(-1)!));
  return locale.onWeekdays(weekdays.map(name), exclusive);
}

// ── months & years ──────────────────────────────────────────────────────────

function describeMonths(expr: FieldExpr, context: Context): string | null {
  const { locale } = context;
  const months = expand(expr, CANONICAL_BOUNDS.month);
  if (months.length === 12) return null;
  const name = (month: number) => monthName(locale.code, month);
  if (isContiguousRun(months)) return locale.monthRange(name(months[0]), name(months.at(-1)!));
  return locale.inMonths(months.map(name));
}

function describeYears(expr: FieldExpr, context: Context): string | null {
  return yearShapePhrase(shapeOf(expr, CANONICAL_BOUNDS.year), context);
}

function yearShapePhrase(shape: Shape, context: Context): string | null {
  const { locale } = context;
  switch (shape.kind) {
    case "any":
      return null;
    case "values":
      return locale.inYears(shape.values);
    case "step":
      return stepPhrase(locale.every("year", shape.step), shape.start, (start) => locale.startingAt("year", start));
    case "range":
      return withStep(locale.yearRange(shape.start, shape.end), shape.step, () => locale.every("year", shape.step!));
    case "mixed":
      return joinItems(shape.items, CANONICAL_BOUNDS.year, (item) => yearShapePhrase(item, context) ?? "", context);
  }
}

// ── shared helpers ──────────────────────────────────────────────────────────

/** Normalizes trivial steps/ranges (`*\/1`, `0/5` = `*\/5`, full ranges) so wording stays natural. */
function shapeOf(expr: FieldExpr, [min, max]: Bounds): Shape {
  if (expr.kind !== "list") return { kind: "any" };
  const { items } = expr;

  if (items.every((item) => item.kind === "value")) {
    return { kind: "values", values: [...new Set(items.map((item) => item.value))].sort((a, b) => a - b) };
  }
  if (items.length > 1) return { kind: "mixed", items };

  const [item] = items;
  if (item.kind === "step") {
    const start = item.start === "any" || item.start === min ? "any" : item.start;
    if (item.step === 1) return start === "any" ? { kind: "any" } : { kind: "range", start, end: max };
    return { kind: "step", start, step: item.step };
  }
  if (item.kind === "range") {
    const step = item.step === 1 ? undefined : item.step;
    if (item.start === min && item.end === max) {
      return step === undefined ? { kind: "any" } : { kind: "step", start: "any", step };
    }
    return { kind: "range", start: item.start, end: item.end, step };
  }
  return { kind: "mixed", items };
}

function itemShape(item: FieldItem, bounds: Bounds): Shape {
  return shapeOf({ kind: "list", items: [item] }, bounds);
}

function joinItems(items: FieldItem[], bounds: Bounds, phrase: (shape: Shape) => string, context: Context): string {
  return formatList(
    context.locale.code,
    items.map((item) => phrase(itemShape(item, bounds)))
  );
}

function stepPhrase(every: string, start: number | "any", startingAt: (start: number) => string): string {
  return start === "any" ? every : `${every}, ${startingAt(start)}`;
}

function withStep(range: string, step: number | undefined, every: () => string): string {
  return step === undefined ? range : `${every()}, ${range}`;
}

function isOnly(shape: Shape, value: number): boolean {
  return shape.kind === "values" && shape.values.length === 1 && shape.values[0] === value;
}

function isContiguousRun(values: number[]): boolean {
  return values.length >= 3 && values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}
