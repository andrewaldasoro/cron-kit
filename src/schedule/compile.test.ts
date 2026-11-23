import { describe, expect, it } from "vitest";
import { resolveCron } from "../core/parse";
import { compile } from "./compile";

const daysOf = (expression: string, year: number, month: number) =>
  compile(resolveCron(expression)).daysOf(year, month);

describe("compile", () => {
  it("expands time fields to sorted values", () => {
    const compiled = compile(resolveCron("0 10/20,5 9-11 * * ?"));
    expect(compiled.seconds).toEqual([0]);
    expect(compiled.minutes).toEqual([5, 10, 30, 50]);
    expect(compiled.hours).toEqual([9, 10, 11]);
    expect(compiled.months).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("bounds Quartz years and leaves Unix years open", () => {
    expect(compile(resolveCron("0 0 0 * * ? 2025,2030")).years).toEqual([2025, 2030]);
    expect(compile(resolveCron("0 0 0 * * ?")).yearBounds).toEqual([1970, 2199]);
    expect(compile(resolveCron("0 0 * * *")).years).toBeNull();
  });

  it("marks Unix jobs with '*' leading the minute or hour as wildcard jobs", () => {
    expect(compile(resolveCron("*/5 * * * *")).isWildcardJob).toBe(true);
    expect(compile(resolveCron("0 * * * *")).isWildcardJob).toBe(true);
    expect(compile(resolveCron("30 2 * * *")).isWildcardJob).toBe(false);
  });
});

describe("compile → daysOf(year, month)", () => {
  it("returns every day when both day fields are open", () => {
    expect(daysOf("0 0 0 * * ?", 2026, 2)).toHaveLength(28);
    expect(daysOf("0 0 * * *", 2028, 2)).toHaveLength(29);
  });

  it("drops days that don't exist in the month", () => {
    expect(daysOf("0 0 0 29,30,31 * ?", 2026, 2)).toEqual([]);
    expect(daysOf("0 0 0 29,30,31 * ?", 2028, 2)).toEqual([29]);
  });

  it("handles L and L-n", () => {
    expect(daysOf("0 0 0 L * ?", 2026, 2)).toEqual([28]);
    expect(daysOf("0 0 0 L-3 * ?", 2026, 2)).toEqual([25]);
    expect(daysOf("0 0 0 L-30 * ?", 2026, 2)).toEqual([]);
  });

  it("handles LW (last weekday)", () => {
    // 2026-02-28 is a Saturday.
    expect(daysOf("0 0 0 LW * ?", 2026, 2)).toEqual([27]);
    // 2026-05-31 is a Sunday.
    expect(daysOf("0 0 0 LW * ?", 2026, 5)).toEqual([29]);
  });

  it("handles nW without leaving the month", () => {
    // 2026-08-15 is a Saturday → Friday 14th.
    expect(daysOf("0 0 0 15W * ?", 2026, 8)).toEqual([14]);
    // 2026-08-01 is a Saturday → Monday 3rd (can't go back into July).
    expect(daysOf("0 0 0 1W * ?", 2026, 8)).toEqual([3]);
    // 2026-05-31 is a Sunday → Friday 29th (can't go forward into June).
    expect(daysOf("0 0 0 31W * ?", 2026, 5)).toEqual([29]);
    // September has no 31st.
    expect(daysOf("0 0 0 31W * ?", 2026, 9)).toEqual([]);
  });

  it("handles day-of-week names, nth occurrence and last occurrence", () => {
    // Fridays in February 2026: 6, 13, 20, 27.
    expect(daysOf("0 0 0 ? * FRI", 2026, 2)).toEqual([6, 13, 20, 27]);
    expect(daysOf("0 0 0 ? * 6#2", 2026, 2)).toEqual([13]);
    expect(daysOf("0 0 0 ? * 6#5", 2026, 2)).toEqual([]);
    expect(daysOf("0 0 0 ? * 6#5", 2026, 5)).toEqual([29]);
    expect(daysOf("0 0 0 ? * 6L", 2026, 2)).toEqual([27]);
  });

  it("uses Quartz's '?' to pick the active day field", () => {
    expect(daysOf("0 0 0 1,15 * ?", 2026, 2)).toEqual([1, 15]);
    expect(daysOf("0 0 0 ? * MON", 2026, 2)).toEqual([2, 9, 16, 23]);
  });

  it("combines Unix day fields with OR when both are restricted", () => {
    // Day 1 OR Mondays (2, 9, 16, 23) in February 2026.
    expect(daysOf("0 0 1 * MON", 2026, 2)).toEqual([1, 2, 9, 16, 23]);
  });

  it("combines Unix day fields with AND when either starts with '*'", () => {
    // Odd days (*/2 → 1, 3, 5, …) AND Mondays (2, 9, 16, 23) → 9, 23.
    expect(daysOf("0 0 */2 * MON", 2026, 2)).toEqual([9, 23]);
    expect(daysOf("0 0 1 * */7", 2026, 2)).toEqual([1]);
  });
});
