/**
 * Proleptic Gregorian calendar math on plain numbers. The scheduler searches
 * wall-clock time in "wall seconds" (seconds since 1970-01-01T00:00 as if the
 * zone were UTC) and only asks Temporal for UTC offsets and transitions.
 * Algorithms: Howard Hinnant, "chrono-Compatible Low-Level Date Algorithms".
 */

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const SECONDS_PER_DAY = 86_400;

export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12; // March = 0
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365
  );
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1];
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekdayOf(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

export function toWallSeconds(wall: WallTime): number {
  return (
    daysFromCivil(wall.year, wall.month, wall.day) * SECONDS_PER_DAY +
    wall.hour * 3600 +
    wall.minute * 60 +
    wall.second
  );
}

export function fromWallSeconds(seconds: number): WallTime {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  let rest = seconds - days * SECONDS_PER_DAY;
  const hour = Math.floor(rest / 3600);
  rest -= hour * 3600;
  const minute = Math.floor(rest / 60);
  return { ...civilFromDays(days), hour, minute, second: rest - minute * 60 };
}
