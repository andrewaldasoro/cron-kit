import { describe, expect, it } from "vitest";
import { civilFromDays, daysFromCivil, daysInMonth, fromWallSeconds, toWallSeconds, weekdayOf } from "./civil";

describe("civil date math", () => {
  it("counts days from the Unix epoch", () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(2000, 3, 1)).toBe(11017);
    expect(daysFromCivil(1969, 12, 31)).toBe(-1);
  });

  it("round-trips days ↔ civil dates across centuries", () => {
    for (const days of [-719468, -1, 0, 11016, 11017, 20780, 84000]) {
      const { year, month, day } = civilFromDays(days);
      expect(daysFromCivil(year, month, day)).toBe(days);
    }
  });

  it("knows month lengths, including Gregorian leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("computes the weekday (0 = Sunday)", () => {
    expect(weekdayOf(daysFromCivil(1970, 1, 1))).toBe(4);
    expect(weekdayOf(daysFromCivil(2026, 11, 23))).toBe(1);
    expect(weekdayOf(daysFromCivil(1969, 12, 28))).toBe(0);
  });

  it("round-trips wall-clock seconds", () => {
    const wall = { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 15 };
    expect(fromWallSeconds(toWallSeconds(wall))).toEqual(wall);
  });
});
