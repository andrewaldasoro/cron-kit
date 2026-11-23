import type { CronError } from "../core/types.js";

/** A formatted wall-clock time plus its hour (0-23), for languages whose articles depend on it. */
export interface TimeText {
  text: string;
  hour: number;
}

export type Nth = 1 | 2 | 3 | 4 | 5;

/**
 * Everything a language needs to describe a cron expression. Day and month
 * names, times and lists come pre-localized from `Intl` (via `code`); a
 * locale only supplies sentence structure and grammar. Phrases are lowercase
 * fragments — the describer joins them with ", " and capitalizes the result.
 */
export interface Locale {
  /** BCP 47 tag used for every `Intl` formatter (e.g. `en`, `es`, `fr-CA`). */
  code: string;

  everySecond(): string;
  everyMinute(): string;
  everyHour(): string;
  /** "every 5 minutes" (n ≥ 2). */
  every(unit: "second" | "minute" | "hour" | "day" | "year", n: number): string;
  /** Start of a step: "starting at minute 10", "starting on day 5 of the month", "starting in 2025". */
  startingAt(unit: "second" | "minute" | "day" | "year", value: number): string;
  /** Start of an hour step: "starting at 6:00 AM". */
  startingAtTime(time: TimeText): string;

  /** "at 9:30 AM" / "at 9:00 AM and 5:00 PM". */
  atTimes(times: TimeText[]): string;
  /** "at minute 30 past the hour" / "at seconds 0 and 30 past the minute". */
  atUnits(unit: "second" | "minute", values: number[]): string;
  /** "minutes 10 through 20 past the hour". */
  unitRange(unit: "second" | "minute", start: number, end: number): string;
  /** "between 9:00 AM and 5:59 PM". */
  betweenTimes(start: TimeText, end: TimeText): string;
  /** "during the 9:00 AM and 5:00 PM hours". */
  duringHours(times: TimeText[]): string;

  /** "on day 1 of the month" / "on days 1 and 15 of the month". */
  onDaysOfMonth(days: number[]): string;
  /** "between day 1 and 10 of the month". */
  betweenDaysOfMonth(start: number, end: number): string;
  /** offset 0: "on the last day of the month"; n: "3 days before the last day of the month". */
  lastDayOfMonth(offset: number): string;
  /** "on the last weekday of the month". */
  lastWeekdayOfMonth(): string;
  /** "on the weekday nearest day 15 of the month". */
  nearestWeekdayTo(day: number): string;

  /** `exclusive`: "only on Monday and Friday"; otherwise (unix day OR) "on Monday". */
  onWeekdays(names: string[], exclusive: boolean): string;
  /** "Monday through Friday". */
  weekdayRange(start: string, end: string): string;
  /** "on the third Friday of the month". */
  nthWeekday(nth: Nth, name: string): string;
  /** "on the last Friday of the month". */
  lastWeekday(name: string): string;

  /** "only in January and July". */
  inMonths(names: string[]): string;
  /** "January through March". */
  monthRange(start: string, end: string): string;

  /** "only in 2025". */
  inYears(years: number[]): string;
  /** "2025 through 2030". */
  yearRange(start: number, end: number): string;

  /** Localized validation message. */
  formatError(error: Pick<CronError, "code" | "field" | "params">): string;
}
