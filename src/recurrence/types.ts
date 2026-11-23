export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Minute intervals cron repeats evenly (divisors of 60): `*\/7` would jump :56 → :00. */
export const MINUTE_INTERVALS = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30] as const;
export type MinuteInterval = (typeof MINUTE_INTERVALS)[number];

/** Hour intervals cron repeats evenly (divisors of 24). */
export const HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12] as const;
export type HourInterval = (typeof HOUR_INTERVALS)[number];

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Times of day as cron expresses them: every listed hour at the same minute
 * (cron fields are a cartesian product, so "09:00 and 17:30" isn't one cron).
 */
export interface TimeOfDay {
  hours: number[];
  minute: number;
  /** Quartz only; omitted means 0. */
  second?: number;
}

export type MonthDay =
  | { days: number[] }
  /** Quartz only (`L`). */
  | { lastDay: true }
  /** Quartz only (`FRI#3`, or `FRIL` for "last"). */
  | { nth: 1 | 2 | 3 | 4 | 5 | "last"; weekday: Weekday };

/** The simple schedules a recurring-task UI offers, each mapping to exactly one cron. */
export type Recurrence =
  | { frequency: "minutely"; interval: MinuteInterval }
  | { frequency: "hourly"; interval: HourInterval; minute: number }
  | { frequency: "daily"; at: TimeOfDay }
  | { frequency: "weekly"; weekdays: Weekday[]; at: TimeOfDay }
  | { frequency: "monthly"; on: MonthDay; at: TimeOfDay }
  | { frequency: "yearly"; months: Month[]; on: MonthDay; at: TimeOfDay };
