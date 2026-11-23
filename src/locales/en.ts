import { englishErrorMessage } from "../core/errors.js";
import { formatList } from "../describe/intl.js";
import type { Locale, Nth } from "../describe/locale.js";

const list = (items: string[]) => formatList("en", items);
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);
const ORDINALS: Record<Nth, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" };
const PAST: Record<"second" | "minute", string> = { second: "past the minute", minute: "past the hour" };

export const en: Locale = {
  code: "en",

  everySecond: () => "every second",
  everyMinute: () => "every minute",
  everyHour: () => "every hour",
  every: (unit, n) => `every ${n} ${unit}s`,
  startingAt: (unit, value) => {
    if (unit === "day") return `starting on day ${value} of the month`;
    if (unit === "year") return `starting in ${value}`;
    return `starting at ${unit} ${value}`;
  },
  startingAtTime: (time) => `starting at ${time.text}`,

  atTimes: (times) => `at ${list(times.map((time) => time.text))}`,
  atUnits: (unit, values) => `at ${plural(values.length, unit)} ${list(values.map(String))} ${PAST[unit]}`,
  unitRange: (unit, start, end) => `${unit}s ${start} through ${end} ${PAST[unit]}`,
  betweenTimes: (start, end) => `between ${start.text} and ${end.text}`,
  duringHours: (times) => `during the ${list(times.map((time) => time.text))} hours`,

  onDaysOfMonth: (days) => `on ${plural(days.length, "day")} ${list(days.map(String))} of the month`,
  betweenDaysOfMonth: (start, end) => `between day ${start} and ${end} of the month`,
  lastDayOfMonth: (offset) =>
    offset === 0 ? "on the last day of the month" : `${offset} ${plural(offset, "day")} before the last day of the month`,
  lastWeekdayOfMonth: () => "on the last weekday of the month",
  nearestWeekdayTo: (day) => `on the weekday nearest day ${day} of the month`,

  onWeekdays: (names, exclusive) => `${exclusive ? "only on" : "on"} ${list(names)}`,
  weekdayRange: (start, end) => `${start} through ${end}`,
  nthWeekday: (nth, name) => `on the ${ORDINALS[nth]} ${name} of the month`,
  lastWeekday: (name) => `on the last ${name} of the month`,

  inMonths: (names) => `only in ${list(names)}`,
  monthRange: (start, end) => `${start} through ${end}`,

  inYears: (years) => `only in ${list(years.map(String))}`,
  yearRange: (start, end) => `${start} through ${end}`,

  formatError: englishErrorMessage,
};
