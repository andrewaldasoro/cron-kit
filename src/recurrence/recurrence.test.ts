import { describe, expect, it } from "vitest";
import { CronRecurrenceError, fromRecurrence, HOUR_INTERVALS, MINUTE_INTERVALS, toRecurrence } from "./recurrence";
import type { Recurrence } from "./types";

const nineThirty = { hours: [9], minute: 30 };
const midnight = { hours: [0], minute: 0 };

describe("fromRecurrence", () => {
  it.each<[Recurrence, string, string | null]>([
    [{ frequency: "minutely", interval: 1 }, "0 * * * * ?", "* * * * *"],
    [{ frequency: "minutely", interval: 15 }, "0 */15 * * * ?", "*/15 * * * *"],
    [{ frequency: "hourly", interval: 1, minute: 0 }, "0 0 * * * ?", "0 * * * *"],
    [{ frequency: "hourly", interval: 6, minute: 30 }, "0 30 */6 * * ?", "30 */6 * * *"],
    [{ frequency: "daily", at: nineThirty }, "0 30 9 * * ?", "30 9 * * *"],
    [{ frequency: "daily", at: { hours: [17, 9, 9], minute: 0 } }, "0 0 9,17 * * ?", "0 9,17 * * *"],
    [{ frequency: "daily", at: { hours: [8], minute: 0, second: 30 } }, "30 0 8 * * ?", null],
    [
      { frequency: "weekly", weekdays: ["FRI", "MON", "TUE", "WED", "THU"], at: { hours: [9], minute: 0 } },
      "0 0 9 ? * MON-FRI",
      "0 9 * * MON-FRI",
    ],
    [{ frequency: "weekly", weekdays: ["SAT", "SUN"], at: midnight }, "0 0 0 ? * SUN,SAT", "0 0 * * SUN,SAT"],
    [{ frequency: "monthly", on: { days: [15, 1] }, at: midnight }, "0 0 0 1,15 * ?", "0 0 1,15 * *"],
    [{ frequency: "monthly", on: { lastDay: true }, at: midnight }, "0 0 0 L * ?", null],
    [{ frequency: "monthly", on: { nth: 3, weekday: "FRI" }, at: midnight }, "0 0 0 ? * 6#3", null],
    [{ frequency: "monthly", on: { nth: "last", weekday: "FRI" }, at: midnight }, "0 0 0 ? * 6L", null],
    [{ frequency: "yearly", months: [7, 1], on: { days: [1] }, at: midnight }, "0 0 0 1 1,7 ?", "0 0 1 1,7 *"],
    [{ frequency: "yearly", months: [12], on: { nth: 2, weekday: "MON" }, at: midnight }, "0 0 0 ? 12 2#2", null],
  ])("%j", (recurrence, quartz, unix) => {
    expect(fromRecurrence(recurrence, { dialect: "quartz" })).toBe(quartz);
    if (unix === null) {
      expect(() => fromRecurrence(recurrence, { dialect: "unix" })).toThrow(CronRecurrenceError);
    } else {
      expect(fromRecurrence(recurrence, { dialect: "unix" })).toBe(unix);
    }
  });

  it.each<[string, Recurrence]>([
    ["an interval cron can't repeat evenly", { frequency: "minutely", interval: 7 as never }],
    ["an hour interval that doesn't divide 24", { frequency: "hourly", interval: 5 as never, minute: 0 }],
    ["no hours", { frequency: "daily", at: { hours: [], minute: 0 } }],
    ["an hour out of range", { frequency: "daily", at: { hours: [24], minute: 0 } }],
    ["a minute out of range", { frequency: "daily", at: { hours: [9], minute: 60 } }],
    ["a fractional minute", { frequency: "daily", at: { hours: [9], minute: 1.5 } }],
    ["no weekdays", { frequency: "weekly", weekdays: [], at: midnight }],
    ["an unknown weekday", { frequency: "weekly", weekdays: ["FUN" as never], at: midnight }],
    ["a day out of range", { frequency: "monthly", on: { days: [32] }, at: midnight }],
    ["a month out of range", { frequency: "yearly", months: [13 as never], on: { days: [1] }, at: midnight }],
    ["an invalid nth", { frequency: "monthly", on: { nth: 6 as never, weekday: "MON" }, at: midnight }],
  ])("rejects %s", (_, recurrence) => {
    expect(() => fromRecurrence(recurrence, { dialect: "quartz" })).toThrow(CronRecurrenceError);
  });

  it("explains why Unix can't express a recurrence", () => {
    expect(() =>
      fromRecurrence({ frequency: "monthly", on: { lastDay: true }, at: midnight }, { dialect: "unix" })
    ).toThrow(/Unix/);
  });

  it("exports the intervals cron can repeat evenly", () => {
    expect(MINUTE_INTERVALS).toEqual([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);
    expect(HOUR_INTERVALS).toEqual([1, 2, 3, 4, 6, 8, 12]);
  });
});

describe("toRecurrence", () => {
  it.each<[string, Recurrence]>([
    ["0 * * * * ?", { frequency: "minutely", interval: 1 }],
    ["*/15 * * * *", { frequency: "minutely", interval: 15 }],
    ["0 0/15 * * * ?", { frequency: "minutely", interval: 15 }],
    ["@hourly", { frequency: "hourly", interval: 1, minute: 0 }],
    ["30 */6 * * *", { frequency: "hourly", interval: 6, minute: 30 }],
    ["@daily", { frequency: "daily", at: midnight }],
    ["0 0 9-11 * * ?", { frequency: "daily", at: { hours: [9, 10, 11], minute: 0 } }],
    ["15 0 1/8 * * ?", { frequency: "daily", at: { hours: [1, 9, 17], minute: 0, second: 15 } }],
    ["0 0 12 ? * MON-FRI", { frequency: "weekly", weekdays: ["MON", "TUE", "WED", "THU", "FRI"], at: { hours: [12], minute: 0 } }],
    ["@weekly", { frequency: "weekly", weekdays: ["SUN"], at: midnight }],
    ["0 0 0 L * ?", { frequency: "monthly", on: { lastDay: true }, at: midnight }],
    ["0 0 0 ? * FRI#3", { frequency: "monthly", on: { nth: 3, weekday: "FRI" }, at: midnight }],
    ["0 0 0 ? * FRIL", { frequency: "monthly", on: { nth: "last", weekday: "FRI" }, at: midnight }],
    ["0 0 1,15 * *", { frequency: "monthly", on: { days: [1, 15] }, at: midnight }],
    ["0 0 1 */6 *", { frequency: "yearly", months: [1, 7], on: { days: [1] }, at: midnight }],
  ])("%s", (expression, expected) => {
    expect(toRecurrence(expression)).toEqual(expected);
  });

  it.each([
    ["has a year", "0 0 9 * * ? 2030"],
    ["uses W", "0 0 9 15W * ?"],
    ["has L-n", "0 0 9 L-3 * ?"],
    ["has a minute range", "0 0-30 9 * * ?"],
    ["has a minute interval cron can't repeat evenly", "0 */7 * * * ?"],
    ["has several minutes at fixed hours", "0 0,30 9 * * ?"],
    ["uses Unix day-of-month OR day-of-week", "0 0 1 * MON"],
    ["restricts months without a day (daily in some months)", "0 9 * 1-3 *"],
    ["restricts weekdays in some months only", "0 0 9 ? 1-3 MON"],
  ])("returns null when the expression %s", (_, expression) => {
    expect(toRecurrence(expression)).toBeNull();
  });
});

describe("round trip", () => {
  const samples: Recurrence[] = [
    { frequency: "minutely", interval: 1 },
    { frequency: "minutely", interval: 30 },
    { frequency: "hourly", interval: 1, minute: 45 },
    { frequency: "hourly", interval: 12, minute: 0 },
    { frequency: "daily", at: { hours: [6, 18], minute: 15 } },
    { frequency: "weekly", weekdays: ["MON", "WED", "FRI"], at: { hours: [7], minute: 0 } },
    { frequency: "monthly", on: { days: [1, 10, 20] }, at: { hours: [23], minute: 59 } },
    { frequency: "monthly", on: { lastDay: true }, at: midnight },
    { frequency: "monthly", on: { nth: 1, weekday: "MON" }, at: midnight },
    { frequency: "yearly", months: [3, 6, 9, 12], on: { days: [31] }, at: midnight },
    { frequency: "yearly", months: [11], on: { nth: 4, weekday: "THU" }, at: { hours: [12], minute: 0 } },
  ];

  it.each(samples)("%j survives toRecurrence(fromRecurrence(…)) in each dialect it fits", (recurrence) => {
    for (const dialect of ["quartz", "unix"] as const) {
      let expression: string;
      try {
        expression = fromRecurrence(recurrence, { dialect });
      } catch {
        continue; // e.g. L / # in Unix
      }
      expect(toRecurrence(expression, { dialect }), `${dialect}: ${expression}`).toEqual(recurrence);
    }
  });
});
