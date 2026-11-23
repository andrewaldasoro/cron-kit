import { describe, expect, it } from "vitest";
import { CronParseError } from "./errors";
import { isValid, parse, resolveCron, validate } from "./parse";
import type { Cron, CronError, FieldExpr, FieldName } from "./types";

const ANY: FieldExpr = { kind: "any" };
const NONE: FieldExpr = { kind: "none" };
const values = (...nums: number[]): FieldExpr => ({
  kind: "list",
  items: nums.map((value) => ({ kind: "value", value })),
});

function parsed(expression: string, dialect?: "quartz" | "unix" | "auto"): Cron {
  const result = parse(expression, { dialect });
  if (!result.success) throw new Error(`expected ${expression} to parse: ${JSON.stringify(result.errors)}`);
  return result.cron;
}

function errorsOf(expression: string, dialect?: "quartz" | "unix" | "auto"): Pick<CronError, "code" | "field">[] {
  const result = parse(expression, { dialect });
  if (result.success) throw new Error(`expected ${expression} to fail`);
  return result.errors.map(({ code, field }) => (field ? { code, field } : { code }));
}

/** Quartz expression with one field swapped in; day fields keep the other one as `?`. */
function quartzWith(field: FieldName, value: string): string {
  const fields = { second: "0", minute: "0", hour: "0", dayOfMonth: "*", month: "*", dayOfWeek: "?", year: "" };
  if (field === "dayOfWeek") fields.dayOfMonth = "?";
  fields[field] = value;
  return Object.values(fields).join(" ").trim();
}

function quartzField(field: FieldName, value: string): FieldExpr {
  return parsed(quartzWith(field, value), "quartz").fields[field];
}

function quartzFieldErrors(field: FieldName, value: string) {
  return errorsOf(quartzWith(field, value), "quartz");
}

function unixWith(field: FieldName, value: string): string {
  const fields: Partial<Record<FieldName, string>> = { minute: "0", hour: "0", dayOfMonth: "*", month: "*", dayOfWeek: "*" };
  fields[field] = value;
  return Object.values(fields).join(" ");
}

function unixField(field: FieldName, value: string): FieldExpr {
  return parsed(unixWith(field, value), "unix").fields[field];
}

describe("parse — whole expression", () => {
  it("parses a 6-field Quartz expression into canonical fields", () => {
    expect(parsed("0 0 12 * * ?")).toEqual({
      dialect: "quartz",
      source: "0 0 12 * * ?",
      fields: {
        second: values(0),
        minute: values(0),
        hour: values(12),
        dayOfMonth: ANY,
        month: ANY,
        dayOfWeek: NONE,
        year: ANY,
      },
    });
  });

  it("parses a 7-field Quartz expression with a year", () => {
    expect(parsed("0 0 12 * * ? 2025").fields.year).toEqual(values(2025));
  });

  it("parses a 5-field Unix expression, fixing seconds at 0 and leaving year open", () => {
    expect(parsed("30 9 * * 1")).toEqual({
      dialect: "unix",
      source: "30 9 * * 1",
      fields: {
        second: values(0),
        minute: values(30),
        hour: values(9),
        dayOfMonth: ANY,
        month: ANY,
        dayOfWeek: values(1),
        year: ANY,
      },
    });
  });

  it("collapses repeated and surrounding whitespace", () => {
    expect(parsed("  0  0 12 * * ?  ").source).toBe("0 0 12 * * ?");
  });

  it("rejects an empty expression", () => {
    expect(errorsOf("")).toEqual([{ code: "EMPTY_EXPRESSION" }]);
    expect(errorsOf("   ")).toEqual([{ code: "EMPTY_EXPRESSION" }]);
  });

  it("rejects an expression with no spaces as a wrong field count", () => {
    expect(errorsOf("0*12***")).toEqual([{ code: "WRONG_FIELD_COUNT" }]);
  });

  it("auto-detects the dialect from the field count", () => {
    expect(parsed("* * * * *").dialect).toBe("unix");
    expect(parsed("0 * * * * ?").dialect).toBe("quartz");
    expect(parsed("0 * * * * ? 2030").dialect).toBe("quartz");
    expect(errorsOf("* * * *")).toEqual([{ code: "WRONG_FIELD_COUNT" }]);
    expect(errorsOf("0 0 12 * * ? 2025 extra")).toEqual([{ code: "WRONG_FIELD_COUNT" }]);
  });

  it("enforces the field count of an explicit dialect", () => {
    expect(errorsOf("0 0 12 * *", "quartz")).toEqual([{ code: "WRONG_FIELD_COUNT" }]);
    expect(errorsOf("0 0 12 * * ?", "unix")).toEqual([{ code: "WRONG_FIELD_COUNT" }]);
  });

  it("collects an error for every invalid field, not just the first", () => {
    expect(errorsOf("60 0 99 * * ?")).toEqual([
      { code: "INVALID_VALUE", field: "second" },
      { code: "INVALID_VALUE", field: "hour" },
    ]);
  });

  it("accepts a complex, fully valid Quartz expression", () => {
    expect(parse("0 15 10 ? * MON-FRI 2025-2030").success).toBe(true);
  });

  it("is a pure function: repeated calls don't share or accumulate state", () => {
    const first = parse("0 0 12 * *", { dialect: "quartz" });
    const second = parse("0 0 12 * * ?");
    expect(first.success).toBe(false);
    expect(second.success).toBe(true);
  });
});

describe("Quartz day-of-month / day-of-week rule", () => {
  it("requires '?' in exactly one of the two day fields", () => {
    expect(parse("0 0 12 * * ?").success).toBe(true);
    expect(parse("0 0 12 ? * MON").success).toBe(true);
  });

  it("rejects '?' in both", () => {
    expect(errorsOf("0 0 12 ? * ?")).toEqual([{ code: "DAY_FIELDS_BOTH_UNSET" }]);
  });

  it("rejects neither being '?', even with '*' (real Quartz behavior)", () => {
    expect(errorsOf("0 0 12 * * *")).toEqual([{ code: "DAY_FIELDS_BOTH_SET" }]);
    expect(errorsOf("0 0 12 * * MON")).toEqual([{ code: "DAY_FIELDS_BOTH_SET" }]);
    expect(errorsOf("0 0 0 5 * MON")).toEqual([{ code: "DAY_FIELDS_BOTH_SET" }]);
  });

  it("rejects '?' outside the day fields", () => {
    expect(quartzFieldErrors("second", "?")).toEqual([{ code: "UNSUPPORTED_SYNTAX", field: "second" }]);
  });
});

describe("Quartz time fields", () => {
  it("accepts boundary values and rejects out-of-range ones", () => {
    expect(quartzField("second", "59")).toEqual(values(59));
    expect(quartzFieldErrors("second", "60")).toEqual([{ code: "INVALID_VALUE", field: "second" }]);
    expect(quartzFieldErrors("second", "-1")).toEqual([{ code: "INVALID_VALUE", field: "second" }]);
    expect(quartzField("hour", "23")).toEqual(values(23));
    expect(quartzFieldErrors("hour", "24")).toEqual([{ code: "INVALID_VALUE", field: "hour" }]);
  });

  it("accepts steps whose start is >= the increment (10/5 = 10,15,…,55)", () => {
    expect(quartzField("minute", "10/5")).toEqual({ kind: "list", items: [{ kind: "step", start: 10, step: 5 }] });
    expect(quartzField("minute", "5/5").kind).toBe("list");
  });

  it("parses '*/n' and stepped ranges", () => {
    expect(quartzField("minute", "*/15")).toEqual({ kind: "list", items: [{ kind: "step", start: "any", step: 15 }] });
    expect(quartzField("minute", "10-40/10")).toEqual({
      kind: "list",
      items: [{ kind: "range", start: 10, end: 40, step: 10 }],
    });
  });

  it("rejects a zero increment or one larger than the field allows", () => {
    expect(quartzFieldErrors("second", "0/0")).toEqual([{ code: "INVALID_STEP", field: "second" }]);
    expect(quartzFieldErrors("second", "0/60")).toEqual([{ code: "INVALID_STEP", field: "second" }]);
    expect(quartzFieldErrors("hour", "0/24")).toEqual([{ code: "INVALID_STEP", field: "hour" }]);
  });

  it("rejects descending and malformed ranges", () => {
    expect(quartzFieldErrors("minute", "50-10")).toEqual([{ code: "INVALID_RANGE", field: "minute" }]);
    expect(quartzFieldErrors("year", "2020-2030-2040")).toEqual([{ code: "INVALID_RANGE", field: "year" }]);
  });

  it("bounds the year to 1970-2199", () => {
    expect(quartzField("year", "1970")).toEqual(values(1970));
    expect(quartzField("year", "2199")).toEqual(values(2199));
    expect(quartzFieldErrors("year", "1969")).toEqual([{ code: "INVALID_VALUE", field: "year" }]);
    expect(quartzFieldErrors("year", "2200")).toEqual([{ code: "INVALID_VALUE", field: "year" }]);
  });

  it("rejects day-only specials in time fields", () => {
    expect(quartzFieldErrors("hour", "L")).toEqual([{ code: "INVALID_VALUE", field: "hour" }]);
  });
});

describe("Quartz month", () => {
  it("accepts numbers and case-insensitive names", () => {
    expect(quartzField("month", "1")).toEqual(values(1));
    expect(quartzField("month", "dec")).toEqual(values(12));
    expect(quartzField("month", "jan,3,DEC")).toEqual(values(1, 3, 12));
  });

  it("rejects out-of-range numbers and unknown names", () => {
    expect(quartzFieldErrors("month", "0")).toEqual([{ code: "INVALID_VALUE", field: "month" }]);
    expect(quartzFieldErrors("month", "13")).toEqual([{ code: "INVALID_VALUE", field: "month" }]);
    expect(quartzFieldErrors("month", "foo")).toEqual([{ code: "INVALID_VALUE", field: "month" }]);
    expect(quartzFieldErrors("month", "jan,foo")).toEqual([{ code: "INVALID_VALUE", field: "month" }]);
  });

  it("parses named and mixed ranges, rejecting backwards ones", () => {
    expect(quartzField("month", "jan-mar")).toEqual({ kind: "list", items: [{ kind: "range", start: 1, end: 3 }] });
    expect(quartzField("month", "jan-6")).toEqual({ kind: "list", items: [{ kind: "range", start: 1, end: 6 }] });
    expect(quartzFieldErrors("month", "dec-jan")).toEqual([{ code: "INVALID_RANGE", field: "month" }]);
  });

  it("parses numeric steps and rejects malformed or named ones", () => {
    expect(quartzField("month", "3/6")).toEqual({ kind: "list", items: [{ kind: "step", start: 3, step: 6 }] });
    expect(quartzFieldErrors("month", "1/2/3")).toEqual([{ code: "INVALID_STEP", field: "month" }]);
    expect(quartzFieldErrors("month", "JAN/2")).toEqual([{ code: "INVALID_STEP", field: "month" }]);
  });
});

describe("Quartz day-of-month", () => {
  it("accepts 1-31 and rejects 0 / 32", () => {
    expect(quartzField("dayOfMonth", "31")).toEqual(values(31));
    expect(quartzFieldErrors("dayOfMonth", "0")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
    expect(quartzFieldErrors("dayOfMonth", "1,32")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
  });

  it("parses L, L-n, LW and nW (case-insensitive)", () => {
    expect(quartzField("dayOfMonth", "L")).toEqual({ kind: "list", items: [{ kind: "lastDay", offset: 0 }] });
    expect(quartzField("dayOfMonth", "L-3")).toEqual({ kind: "list", items: [{ kind: "lastDay", offset: 3 }] });
    expect(quartzField("dayOfMonth", "lw")).toEqual({ kind: "list", items: [{ kind: "lastWeekday" }] });
    expect(quartzField("dayOfMonth", "15W")).toEqual({ kind: "list", items: [{ kind: "nearestWeekday", day: 15 }] });
  });

  it("rejects out-of-range L-n and nW", () => {
    expect(quartzFieldErrors("dayOfMonth", "L-31")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
    expect(quartzFieldErrors("dayOfMonth", "0W")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
    expect(quartzFieldErrors("dayOfMonth", "32W")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
  });

  it("rejects '<n>L', which has no meaning in day-of-month", () => {
    expect(quartzFieldErrors("dayOfMonth", "3L")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
  });

  it("rejects specials combined with other values", () => {
    expect(quartzFieldErrors("dayOfMonth", "L,15")).toEqual([{ code: "SPECIAL_NOT_COMBINABLE", field: "dayOfMonth" }]);
    expect(quartzFieldErrors("dayOfMonth", "1,15W")).toEqual([{ code: "SPECIAL_NOT_COMBINABLE", field: "dayOfMonth" }]);
  });

  it("rejects a range ending in 'L'", () => {
    expect(quartzFieldErrors("dayOfMonth", "10-L")).toEqual([{ code: "INVALID_VALUE", field: "dayOfMonth" }]);
  });

  it("accepts steps and ranges", () => {
    expect(quartzField("dayOfMonth", "1/5")).toEqual({ kind: "list", items: [{ kind: "step", start: 1, step: 5 }] });
    expect(quartzField("dayOfMonth", "10/5").kind).toBe("list");
    expect(quartzField("dayOfMonth", "10-20")).toEqual({ kind: "list", items: [{ kind: "range", start: 10, end: 20 }] });
    expect(quartzFieldErrors("dayOfMonth", "20-10")).toEqual([{ code: "INVALID_RANGE", field: "dayOfMonth" }]);
  });
});

describe("Quartz day-of-week (1-7, SUN=1) → canonical 0-6 (SUN=0)", () => {
  it("maps numbers and names to canonical weekdays", () => {
    expect(quartzField("dayOfWeek", "1")).toEqual(values(0));
    expect(quartzField("dayOfWeek", "7")).toEqual(values(6));
    expect(quartzField("dayOfWeek", "sun")).toEqual(values(0));
    expect(quartzField("dayOfWeek", "FRI")).toEqual(values(5));
    expect(quartzField("dayOfWeek", "2,5")).toEqual(values(1, 4));
    expect(quartzField("dayOfWeek", "mon,fri")).toEqual(values(1, 5));
  });

  it("rejects 0 and 8", () => {
    expect(quartzFieldErrors("dayOfWeek", "0")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
    expect(quartzFieldErrors("dayOfWeek", "8")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
  });

  it("maps ranges and steps", () => {
    expect(quartzField("dayOfWeek", "mon-fri")).toEqual({ kind: "list", items: [{ kind: "range", start: 1, end: 5 }] });
    expect(quartzField("dayOfWeek", "1-7")).toEqual({ kind: "list", items: [{ kind: "range", start: 0, end: 6 }] });
    expect(quartzField("dayOfWeek", "*/2")).toEqual({ kind: "list", items: [{ kind: "step", start: "any", step: 2 }] });
    expect(quartzField("dayOfWeek", "2/2")).toEqual({ kind: "list", items: [{ kind: "step", start: 1, step: 2 }] });
    expect(quartzFieldErrors("dayOfWeek", "fri-mon")).toEqual([{ code: "INVALID_RANGE", field: "dayOfWeek" }]);
  });

  it("treats 'L' alone as Saturday", () => {
    expect(quartzField("dayOfWeek", "L")).toEqual(values(6));
  });

  it("parses '<n>L' and '<NAME>L' as the last such weekday of the month", () => {
    expect(quartzField("dayOfWeek", "6L")).toEqual({ kind: "list", items: [{ kind: "lastDayOfWeek", weekday: 5 }] });
    expect(quartzField("dayOfWeek", "FRIL")).toEqual({ kind: "list", items: [{ kind: "lastDayOfWeek", weekday: 5 }] });
    expect(quartzFieldErrors("dayOfWeek", "0L")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
    expect(quartzFieldErrors("dayOfWeek", "8L")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
  });

  it("parses '#' occurrences with numbers or names, occurrence 1-5", () => {
    expect(quartzField("dayOfWeek", "6#3")).toEqual({
      kind: "list",
      items: [{ kind: "nthDayOfWeek", weekday: 5, nth: 3 }],
    });
    expect(quartzField("dayOfWeek", "MON#2")).toEqual({
      kind: "list",
      items: [{ kind: "nthDayOfWeek", weekday: 1, nth: 2 }],
    });
    expect(quartzFieldErrors("dayOfWeek", "1#0")).toEqual([{ code: "INVALID_NTH", field: "dayOfWeek" }]);
    expect(quartzFieldErrors("dayOfWeek", "1#6")).toEqual([{ code: "INVALID_NTH", field: "dayOfWeek" }]);
    expect(quartzFieldErrors("dayOfWeek", "1#")).toEqual([{ code: "INVALID_NTH", field: "dayOfWeek" }]);
    expect(quartzFieldErrors("dayOfWeek", "10#2")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
    expect(quartzFieldErrors("dayOfWeek", "#2")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
  });

  it("rejects '#' and 'L' combined with other values", () => {
    expect(quartzFieldErrors("dayOfWeek", "MON#2,FRI#3")).toEqual([
      { code: "SPECIAL_NOT_COMBINABLE", field: "dayOfWeek" },
    ]);
    expect(quartzFieldErrors("dayOfWeek", "MON,6L")).toEqual([{ code: "SPECIAL_NOT_COMBINABLE", field: "dayOfWeek" }]);
  });

  it("rejects a named step start", () => {
    expect(quartzFieldErrors("dayOfWeek", "MON/2")).toEqual([{ code: "INVALID_STEP", field: "dayOfWeek" }]);
  });
});

describe("Unix fields", () => {
  it("accepts minute/hour bounds", () => {
    expect(unixField("minute", "59")).toEqual(values(59));
    expect(errorsOf(unixWith("minute", "60"), "unix")).toEqual([{ code: "INVALID_VALUE", field: "minute" }]);
    expect(errorsOf(unixWith("hour", "24"), "unix")).toEqual([{ code: "INVALID_VALUE", field: "hour" }]);
  });

  it("allows both day fields to be restricted (they combine with OR at run time)", () => {
    expect(parse("0 0 1 * 1", { dialect: "unix" }).success).toBe(true);
  });

  it("maps day-of-week 0 and 7 to Sunday", () => {
    expect(unixField("dayOfWeek", "0")).toEqual(values(0));
    expect(unixField("dayOfWeek", "7")).toEqual(values(0));
    expect(unixField("dayOfWeek", "SUN")).toEqual(values(0));
    expect(errorsOf(unixWith("dayOfWeek", "8"), "unix")).toEqual([{ code: "INVALID_VALUE", field: "dayOfWeek" }]);
  });

  it("normalizes day-of-week ranges that reach 7 without wrapping", () => {
    expect(unixField("dayOfWeek", "5-7")).toEqual({
      kind: "list",
      items: [
        { kind: "range", start: 5, end: 6 },
        { kind: "value", value: 0 },
      ],
    });
    expect(unixField("dayOfWeek", "0-7")).toEqual({ kind: "list", items: [{ kind: "range", start: 0, end: 6 }] });
    expect(unixField("dayOfWeek", "1-7/2")).toEqual(values(1, 3, 5, 0));
    expect(unixField("dayOfWeek", "MON-FRI")).toEqual({ kind: "list", items: [{ kind: "range", start: 1, end: 5 }] });
  });

  it("accepts names in ranges and lists, and 'a/n' steps", () => {
    expect(unixField("month", "JAN-MAR,DEC")).toEqual({
      kind: "list",
      items: [
        { kind: "range", start: 1, end: 3 },
        { kind: "value", value: 12 },
      ],
    });
    expect(unixField("minute", "10/5")).toEqual({ kind: "list", items: [{ kind: "step", start: 10, step: 5 }] });
  });

  it("rejects a zero step", () => {
    expect(errorsOf(unixWith("minute", "*/0"), "unix")).toEqual([{ code: "INVALID_STEP", field: "minute" }]);
  });

  it("rejects Quartz-only syntax", () => {
    expect(errorsOf(unixWith("dayOfMonth", "?"), "unix")).toEqual([{ code: "UNSUPPORTED_SYNTAX", field: "dayOfMonth" }]);
    expect(errorsOf(unixWith("dayOfMonth", "L"), "unix")).toEqual([{ code: "UNSUPPORTED_SYNTAX", field: "dayOfMonth" }]);
    expect(errorsOf(unixWith("dayOfMonth", "15W"), "unix")).toEqual([
      { code: "UNSUPPORTED_SYNTAX", field: "dayOfMonth" },
    ]);
    expect(errorsOf(unixWith("dayOfWeek", "5#3"), "unix")).toEqual([{ code: "UNSUPPORTED_SYNTAX", field: "dayOfWeek" }]);
    expect(errorsOf(unixWith("dayOfWeek", "5L"), "unix")).toEqual([{ code: "UNSUPPORTED_SYNTAX", field: "dayOfWeek" }]);
  });
});

describe("Unix macros", () => {
  it.each([
    ["@yearly", "0 0 1 1 *"],
    ["@annually", "0 0 1 1 *"],
    ["@monthly", "0 0 1 * *"],
    ["@weekly", "0 0 * * 0"],
    ["@daily", "0 0 * * *"],
    ["@midnight", "0 0 * * *"],
    ["@hourly", "0 * * * *"],
  ])("expands %s like %s", (macro, equivalent) => {
    const cron = parsed(macro);
    expect(cron.dialect).toBe("unix");
    expect(cron.source).toBe(macro);
    expect(cron.fields).toEqual(parsed(equivalent).fields);
  });

  it("accepts macros case-insensitively", () => {
    expect(parsed("@DAILY").fields).toEqual(parsed("@daily").fields);
  });

  it("rejects @reboot (no schedule) and unknown macros", () => {
    expect(errorsOf("@reboot")).toEqual([{ code: "UNSUPPORTED_MACRO" }]);
    expect(errorsOf("@often")).toEqual([{ code: "UNKNOWN_MACRO" }]);
  });

  it("rejects macros when Quartz is requested", () => {
    expect(errorsOf("@daily", "quartz")).toEqual([{ code: "WRONG_FIELD_COUNT" }]);
  });
});

describe("validate / isValid", () => {
  it("returns { valid, errors } with English messages", () => {
    expect(validate("0 0 12 * * ?")).toEqual({ valid: true, errors: [] });

    const result = validate("60 0 12 * * ?");
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      {
        code: "INVALID_VALUE",
        field: "second",
        params: { token: "60", min: 0, max: 59 },
        message: "Seconds must be between 0 and 59",
      },
    ]);
  });

  it("mentions names in month and day-of-week range messages", () => {
    expect(validate("0 0 0 ? * 9").errors[0].message).toBe("Day-of-week must be between 1 and 7, or SUN-SAT");
    expect(validate("0 0 1 13 *").errors[0].message).toBe("Month must be between 1 and 12, or JAN-DEC");
  });

  it("explains the Quartz day-field rule", () => {
    expect(validate("0 0 12 * * MON").errors[0].message).toBe(
      "Quartz requires '?' in either day-of-month or day-of-week"
    );
  });

  it("isValid returns a boolean", () => {
    expect(isValid("0 0 12 * * ?")).toBe(true);
    expect(isValid("not a cron expression")).toBe(false);
    expect(isValid("0 0 12 * *", { dialect: "quartz" })).toBe(false);
  });
});

describe("resolveCron", () => {
  it("passes a parsed Cron through untouched", () => {
    const cron = parsed("0 0 12 * * ?");
    expect(resolveCron(cron)).toBe(cron);
  });

  it("parses a string", () => {
    expect(resolveCron("* * * * *").dialect).toBe("unix");
  });

  it("throws CronParseError with the errors for an invalid string", () => {
    expect(() => resolveCron("nope")).toThrow(CronParseError);
    try {
      resolveCron("0 0 99 * * ?");
    } catch (error) {
      expect((error as CronParseError).errors[0].code).toBe("INVALID_VALUE");
    }
  });
});
