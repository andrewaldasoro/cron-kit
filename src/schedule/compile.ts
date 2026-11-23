import { CANONICAL_BOUNDS } from "../constants.js";
import { startsWithWildcard } from "../core/ast.js";
import type { Cron, FieldExpr, FieldItem } from "../core/types.js";
import { daysFromCivil, daysInMonth, weekdayOf } from "./civil.js";

export interface CompiledCron {
  dialect: Cron["dialect"];
  seconds: number[];
  minutes: number[];
  hours: number[];
  months: number[];
  /** Explicit allowed years, or null when any year in `yearBounds` matches. */
  years: number[] | null;
  yearBounds: readonly [number, number];
  /** Sorted days of the given month that match both day fields. */
  daysOf: (year: number, month: number) => number[];
  /** Unix (cronie) "wildcard job": minute or hour starts with `*`. Drives DST defaults. */
  isWildcardJob: boolean;
}

const UNBOUNDED_YEARS = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] as const;

export function compile(cron: Cron): CompiledCron {
  const { fields } = cron;
  const yearBounds = cron.dialect === "quartz" ? CANONICAL_BOUNDS.year : UNBOUNDED_YEARS;

  return {
    dialect: cron.dialect,
    seconds: expand(fields.second, CANONICAL_BOUNDS.second),
    minutes: expand(fields.minute, CANONICAL_BOUNDS.minute),
    hours: expand(fields.hour, CANONICAL_BOUNDS.hour),
    months: expand(fields.month, CANONICAL_BOUNDS.month),
    years: fields.year.kind === "any" ? null : expand(fields.year, CANONICAL_BOUNDS.year),
    yearBounds,
    daysOf: memoizeLast(createDayMatcher(cron)),
    isWildcardJob: startsWithWildcard(fields.minute) || startsWithWildcard(fields.hour),
  };
}

/** Sorted unique values of a value/range/step field within [min, max]. */
export function expand(expr: FieldExpr, [min, max]: readonly [number, number]): number[] {
  if (expr.kind !== "list") return range(min, max, 1);
  const values = new Set<number>();
  for (const item of expr.items) {
    for (const value of expandItem(item, min, max)) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

function expandItem(item: FieldItem, min: number, max: number): number[] {
  switch (item.kind) {
    case "value":
      return item.value >= min && item.value <= max ? [item.value] : [];
    case "range":
      return range(item.start, Math.min(item.end, max), item.step ?? 1);
    case "step":
      return range(item.start === "any" ? min : item.start, max, item.step);
    default:
      return [];
  }
}

function range(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

function createDayMatcher(cron: Cron): (year: number, month: number) => number[] {
  const { dayOfMonth, dayOfWeek } = cron.fields;
  const weekdays = expand(dayOfWeek, CANONICAL_BOUNDS.dayOfWeek);
  const unixAnd = startsWithWildcard(dayOfMonth) || startsWithWildcard(dayOfWeek);

  return (year, month) => {
    const length = daysInMonth(year, month);
    const firstWeekday = weekdayOf(daysFromCivil(year, month, 1));
    const weekdayOfDay = (day: number) => (firstWeekday + day - 1) % 7;

    const all = range(1, length, 1);
    const domDays = dayOfMonth.kind === "list" ? dayOfMonthDays(dayOfMonth.items, length, weekdayOfDay) : all;
    const dowDays =
      dayOfWeek.kind === "list" ? dayOfWeekDays(dayOfWeek.items, weekdays, length, firstWeekday, weekdayOfDay) : all;

    if (cron.dialect === "quartz") {
      return dayOfMonth.kind === "none" ? dowDays : domDays;
    }
    if (unixAnd) return domDays.filter((day) => dowDays.includes(day));
    return [...new Set([...domDays, ...dowDays])].sort((a, b) => a - b);
  };
}

function dayOfMonthDays(items: FieldItem[], length: number, weekdayOfDay: (day: number) => number): number[] {
  const days = new Set<number>();
  for (const item of items) {
    switch (item.kind) {
      case "lastDay":
        if (length - item.offset >= 1) days.add(length - item.offset);
        break;
      case "lastWeekday":
        days.add(nearestWeekday(length, length, weekdayOfDay));
        break;
      case "nearestWeekday":
        if (item.day <= length) days.add(nearestWeekday(item.day, length, weekdayOfDay));
        break;
      default:
        for (const day of expandItem(item, 1, length)) days.add(day);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/** Quartz `W`: Saturday → Friday, Sunday → Monday, never crossing the month boundary. */
function nearestWeekday(day: number, length: number, weekdayOfDay: (day: number) => number): number {
  const weekday = weekdayOfDay(day);
  if (weekday === 6) return day === 1 ? day + 2 : day - 1;
  if (weekday === 0) return day === length ? day - 2 : day + 1;
  return day;
}

function dayOfWeekDays(
  items: FieldItem[],
  weekdays: number[],
  length: number,
  firstWeekday: number,
  weekdayOfDay: (day: number) => number
): number[] {
  const special = items.find((item) => item.kind === "lastDayOfWeek" || item.kind === "nthDayOfWeek");

  if (special?.kind === "nthDayOfWeek") {
    const first = 1 + ((special.weekday - firstWeekday + 7) % 7);
    const day = first + 7 * (special.nth - 1);
    return day <= length ? [day] : [];
  }
  if (special?.kind === "lastDayOfWeek") {
    return [length - ((weekdayOfDay(length) - special.weekday + 7) % 7)];
  }
  return range(1, length, 1).filter((day) => weekdays.includes(weekdayOfDay(day)));
}

function memoizeLast(fn: (year: number, month: number) => number[]): (year: number, month: number) => number[] {
  let lastKey = Number.NaN;
  let lastValue: number[] = [];
  return (year, month) => {
    const key = year * 16 + month;
    if (key !== lastKey) {
      lastKey = key;
      lastValue = fn(year, month);
    }
    return lastValue;
  };
}
