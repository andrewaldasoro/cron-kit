import { describe, expect, it } from "vitest";
import { convert, format } from "./format";
import { CronConvertError } from "./errors";
import { parse } from "./parse";

describe("format", () => {
  it.each([
    ["0 0 12 * * ?", "0 0 12 * * ?"],
    ["0 15 10 ? * mon-fri 2025-2030", "0 15 10 ? * MON-FRI 2025-2030"],
    ["0 */15 9-17 * * ?", "0 */15 9-17 * * ?"],
    ["0 10/5 0 * * ?", "0 10/5 0 * * ?"],
    ["0 10-40/10 0 * * ?", "0 10-40/10 0 * * ?"],
    ["0 0 0 L * ?", "0 0 0 L * ?"],
    ["0 0 0 l-3 * ?", "0 0 0 L-3 * ?"],
    ["0 0 0 LW * ?", "0 0 0 LW * ?"],
    ["0 0 0 15w * ?", "0 0 0 15W * ?"],
    ["0 0 0 ? * 6L", "0 0 0 ? * 6L"],
    ["0 0 0 ? * FRIL", "0 0 0 ? * 6L"],
    ["0 0 0 ? * MON#2", "0 0 0 ? * 2#2"],
    ["0 0 0 ? * 2/2", "0 0 0 ? * 2/2"],
    ["0 0 0 ? * 1-7/2", "0 0 0 ? * 1-7/2"],
    ["0 0 0 ? * L", "0 0 0 ? * SAT"],
    ["0 0 0 ? * 1,4", "0 0 0 ? * SUN,WED"],
    ["0 0 0 1 jan-mar ?", "0 0 0 1 1-3 ?"],
  ])("formats Quartz %s as %s", (input, expected) => {
    expect(format(input)).toBe(expected);
  });

  it.each([
    ["*/15 9-17 * * mon-fri", "*/15 9-17 * * MON-FRI"],
    ["0 0 * * 0", "0 0 * * SUN"],
    ["0 0 * * 7", "0 0 * * SUN"],
    ["0 0 * * 5-7", "0 0 * * FRI-SAT,SUN"],
    ["0 0 * * 1-7/2", "0 0 * * MON,WED,FRI,SUN"],
    ["0 0 * * */2", "0 0 * * */2"],
    ["@daily", "0 0 * * *"],
  ])("formats Unix %s as %s", (input, expected) => {
    expect(format(input)).toBe(expected);
  });

  it.each([
    "0 0 12 * * ?",
    "0 15 10 ? * MON-FRI 2025-2030",
    "0 0 0 L-3 * ?",
    "0 0 0 ? * 6#3",
    "0 0 0 ? * 2-6/2",
    "*/5 * 1,15 * *",
    "0 0 * * 5-7",
    "0 0 * * 1-7/2",
  ])("round-trips %s (parse → format → parse gives the same fields)", (input) => {
    const first = parse(input);
    if (!first.success) throw new Error("fixture must be valid");
    const second = parse(format(first.cron), { dialect: first.cron.dialect });
    expect(second.success && second.cron.fields).toEqual(first.cron.fields);
  });

  it("formats into another dialect when asked", () => {
    expect(format("0 30 9 ? * MON-FRI", { dialect: "unix" })).toBe("30 9 * * MON-FRI");
  });
});

describe("convert", () => {
  describe("quartz → unix", () => {
    it.each([
      ["0 30 9 ? * MON-FRI", "30 9 * * MON-FRI"],
      ["0 0 12 * * ?", "0 12 * * *"],
      ["0 0 0 1 * ?", "0 0 1 * *"],
      ["0 */5 * * * ?", "*/5 * * * *"],
      ["0 0 0 ? * */2", "0 0 * * */2"],
      ["0 0 0 ? * 2/2", "0 0 * * 1-6/2"],
    ])("converts %s to %s", (input, expected) => {
      expect(convert(input, { to: "unix" })).toBe(expected);
    });

    it.each([
      ["30 0 0 * * ?", /seconds/i],
      ["0 0 0 * * ? 2030", /year/i],
      ["0 0 0 L * ?", /'L'/],
      ["0 0 0 15W * ?", /'15W'/],
      ["0 0 0 ? * 6#3", /'6#3'/],
      ["0 0 0 ? * 6L", /'6L'/],
    ])("refuses %s", (input, reason) => {
      expect(() => convert(input, { to: "unix" })).toThrow(CronConvertError);
      expect(() => convert(input, { to: "unix" })).toThrow(reason);
    });
  });

  describe("unix → quartz", () => {
    it.each([
      ["30 9 * * MON-FRI", "0 30 9 ? * MON-FRI"],
      ["* * * * *", "0 * * * * ?"],
      ["0 0 1 * *", "0 0 0 1 * ?"],
      ["0 0 */2 * *", "0 0 0 */2 * ?"],
      ["0 0 * * */2", "0 0 0 ? * */2"],
      ["0 0 * * 1/2", "0 0 0 ? * MON,WED,FRI,SUN"],
      ["@weekly", "0 0 0 ? * SUN"],
    ])("converts %s to %s", (input, expected) => {
      expect(convert(input, { to: "quartz" })).toBe(expected);
    });

    it("refuses day-of-month OR day-of-week (both restricted)", () => {
      expect(() => convert("0 0 1 * 1", { to: "quartz" })).toThrow(/day-of-month or day-of-week/i);
    });

    it("refuses two restricted day fields combined with AND (leading '*')", () => {
      expect(() => convert("0 0 */2 * 1", { to: "quartz" })).toThrow(CronConvertError);
    });

    it("refuses steps larger than Quartz allows", () => {
      expect(() => convert("*/100 * * * *", { to: "quartz" })).toThrow(CronConvertError);
    });
  });

  it("normalizes when converting to the same dialect", () => {
    expect(convert("0 0 * * 7", { to: "unix" })).toBe("0 0 * * SUN");
  });

  it("honors an explicit source dialect", () => {
    expect(() => convert("0 0 * * *", { from: "quartz", to: "unix" })).toThrow(/fields/);
  });
});
