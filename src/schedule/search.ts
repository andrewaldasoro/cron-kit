import { fromWallSeconds, toWallSeconds } from "./civil.js";
import type { CompiledCron } from "./compile.js";

/**
 * First matching wall second ≥ `start`, or null if none before the end of
 * `maxYear`. Field-by-field: a mismatch bumps that field to its next allowed
 * value (resetting smaller fields) or carries into the next larger field.
 */
export function nextWallMatch(compiled: CompiledCron, start: number, maxYear: number): number | null {
  let { year, month, day, hour, minute, second } = fromWallSeconds(start);
  const [minYear, boundMax] = compiled.yearBounds;
  const lastYear = Math.min(maxYear, boundMax);

  if (year < minYear) [year, month, day, hour, minute, second] = [minYear, 1, 1, 0, 0, 0];

  while (year <= lastYear) {
    if (compiled.years && !compiled.years.includes(year)) {
      const nextYear = firstAtLeast(compiled.years, year);
      if (nextYear === undefined) return null;
      [year, month, day, hour, minute, second] = [nextYear, 1, 1, 0, 0, 0];
      continue;
    }

    const nextMonth = firstAtLeast(compiled.months, month);
    if (nextMonth === undefined) {
      [year, month, day, hour, minute, second] = [year + 1, 1, 1, 0, 0, 0];
      continue;
    }
    if (nextMonth !== month) [month, day, hour, minute, second] = [nextMonth, 1, 0, 0, 0];

    const nextDay = firstAtLeast(compiled.daysOf(year, month), day);
    if (nextDay === undefined) {
      [month, day, hour, minute, second] = [month + 1, 1, 0, 0, 0];
      if (month > 12) [year, month] = [year + 1, 1];
      continue;
    }
    if (nextDay !== day) [day, hour, minute, second] = [nextDay, 0, 0, 0];

    const nextHour = firstAtLeast(compiled.hours, hour);
    if (nextHour === undefined) {
      [day, hour, minute, second] = [day + 1, 0, 0, 0];
      continue;
    }
    if (nextHour !== hour) [hour, minute, second] = [nextHour, 0, 0];

    const nextMinute = firstAtLeast(compiled.minutes, minute);
    if (nextMinute === undefined) {
      [hour, minute, second] = [hour + 1, 0, 0];
      continue;
    }
    if (nextMinute !== minute) [minute, second] = [nextMinute, 0];

    const nextSecond = firstAtLeast(compiled.seconds, second);
    if (nextSecond === undefined) {
      [minute, second] = [minute + 1, 0];
      continue;
    }

    return toWallSeconds({ year, month, day, hour, minute, second: nextSecond });
  }
  return null;
}

/** Last matching wall second ≤ `start`, or null if none since the start of `minYear`. */
export function previousWallMatch(compiled: CompiledCron, start: number, minYear: number): number | null {
  let { year, month, day, hour, minute, second } = fromWallSeconds(start);
  const [boundMin, maxYear] = compiled.yearBounds;
  const firstYear = Math.max(minYear, boundMin);

  if (year > maxYear) [year, month, day, hour, minute, second] = [maxYear, 12, 31, 23, 59, 59];

  while (year >= firstYear) {
    if (compiled.years && !compiled.years.includes(year)) {
      const previousYear = lastAtMost(compiled.years, year);
      if (previousYear === undefined) return null;
      [year, month, day, hour, minute, second] = [previousYear, 12, 31, 23, 59, 59];
      continue;
    }

    const previousMonth = lastAtMost(compiled.months, month);
    if (previousMonth === undefined) {
      [year, month, day, hour, minute, second] = [year - 1, 12, 31, 23, 59, 59];
      continue;
    }
    if (previousMonth !== month) [month, day, hour, minute, second] = [previousMonth, 31, 23, 59, 59];

    const previousDay = lastAtMost(compiled.daysOf(year, month), day);
    if (previousDay === undefined) {
      [month, day, hour, minute, second] = [month - 1, 31, 23, 59, 59];
      if (month < 1) [year, month] = [year - 1, 12];
      continue;
    }
    if (previousDay !== day) [day, hour, minute, second] = [previousDay, 23, 59, 59];

    const previousHour = lastAtMost(compiled.hours, hour);
    if (previousHour === undefined) {
      [day, hour, minute, second] = [day - 1, 23, 59, 59];
      if (day < 1) [month, day] = [month - 1, 31];
      if (month < 1) [year, month] = [year - 1, 12];
      continue;
    }
    if (previousHour !== hour) [hour, minute, second] = [previousHour, 59, 59];

    const previousMinute = lastAtMost(compiled.minutes, minute);
    if (previousMinute === undefined) {
      [hour, minute, second] = [hour - 1, 59, 59];
      if (hour < 0) [day, hour] = [day - 1, 23];
      if (day < 1) [month, day] = [month - 1, 31];
      if (month < 1) [year, month] = [year - 1, 12];
      continue;
    }
    if (previousMinute !== minute) [minute, second] = [previousMinute, 59];

    const previousSecond = lastAtMost(compiled.seconds, second);
    if (previousSecond === undefined) {
      [minute, second] = [minute - 1, 59];
      if (minute < 0) [hour, minute] = [hour - 1, 59];
      if (hour < 0) [day, hour] = [day - 1, 23];
      if (day < 1) [month, day] = [month - 1, 31];
      if (month < 1) [year, month] = [year - 1, 12];
      continue;
    }

    return toWallSeconds({ year, month, day, hour, minute, second: previousSecond });
  }
  return null;
}

function firstAtLeast(sorted: number[], value: number): number | undefined {
  return sorted.find((candidate) => candidate >= value);
}

function lastAtMost(sorted: number[], value: number): number | undefined {
  return sorted.findLast((candidate) => candidate <= value);
}
