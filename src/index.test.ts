import { describe, expect, it } from "vitest";
import * as cronKit from "./index";

describe("public API (cron-toolkit)", () => {
  it("exposes the core functions and error classes", () => {
    expect(Object.keys(cronKit).sort()).toEqual(
      [
        "CronConvertError",
        "CronParseError",
        "CronRecurrenceError",
        "HOUR_INTERVALS",
        "MINUTE_INTERVALS",
        "WEEKDAYS",
        "convert",
        "format",
        "fromRecurrence",
        "isValid",
        "parse",
        "toRecurrence",
        "validate",
      ].sort()
    );
  });

  it("validates end to end", () => {
    expect(cronKit.isValid("0 0 12 * * ?")).toBe(true);
    expect(cronKit.validate("not a cron expression").valid).toBe(false);
  });
});
