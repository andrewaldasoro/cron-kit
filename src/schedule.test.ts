import { afterEach, describe, expect, it } from "vitest";
import { matches, nextRun, nextRuns, previousRun, runs, TemporalUnavailableError } from "./schedule";

const zdt = (text: string) => Temporal.ZonedDateTime.from(text);
const strings = (dates: Temporal.ZonedDateTime[]) => dates.map((date) => date.toString());

describe("nextRun / nextRuns basics (UTC)", () => {
  const from = Temporal.Instant.from("2026-01-01T00:00:00Z");

  it("returns runs strictly after `from`", () => {
    expect(strings(nextRuns("0 */15 * * * ?", { from, timeZone: "UTC", count: 3 }))).toEqual([
      "2026-01-01T00:15:00+00:00[UTC]",
      "2026-01-01T00:30:00+00:00[UTC]",
      "2026-01-01T00:45:00+00:00[UTC]",
    ]);
  });

  it("skips to the next whole second after a fractional `from`", () => {
    const fractional = Temporal.Instant.from("2026-01-01T10:00:00.5Z");
    expect(nextRun("* * * * * ?", { from: fractional, timeZone: "UTC" })?.toString()).toBe(
      "2026-01-01T10:00:01+00:00[UTC]"
    );
  });

  it("supports Unix expressions", () => {
    expect(nextRun("30 9 * * MON-FRI", { from, timeZone: "UTC" })?.toString()).toBe(
      "2026-01-01T09:30:00+00:00[UTC]"
    );
  });

  it("accepts a parsed Cron", async () => {
    const { parse } = await import("./index");
    const result = parse("0 0 12 * * ?");
    if (!result.success) throw new Error("fixture must parse");
    expect(nextRun(result.cron, { from, timeZone: "UTC" })?.toString()).toBe("2026-01-01T12:00:00+00:00[UTC]");
  });

  it("finds leap days", () => {
    expect(nextRun("0 0 0 29 2 ?", { from, timeZone: "UTC" })?.toString()).toBe("2028-02-29T00:00:00+00:00[UTC]");
  });

  it("returns null for dates that never exist instead of looping forever", () => {
    expect(nextRun("0 0 0 30 2 ?", { from, timeZone: "UTC" })).toBeNull();
    expect(nextRun("0 0 31 2 *", { from, timeZone: "UTC" })).toBeNull();
  });

  it("returns null once a Quartz year list is exhausted", () => {
    expect(nextRun("0 0 0 1 1 ? 2025", { from, timeZone: "UTC" })).toBeNull();
  });

  it("handles L-n, nW and #n across months", () => {
    const feb = Temporal.Instant.from("2026-02-01T00:00:00Z");
    expect(nextRun("0 0 0 L-3 * ?", { from: feb, timeZone: "UTC" })?.toString()).toBe(
      "2026-02-25T00:00:00+00:00[UTC]"
    );
    expect(nextRun("0 0 0 ? * 6#5", { from: feb, timeZone: "UTC" })?.toString()).toBe(
      "2026-05-29T00:00:00+00:00[UTC]"
    );
    const sep = Temporal.Instant.from("2026-09-01T00:00:00Z");
    expect(nextRun("0 0 0 31W * ?", { from: sep, timeZone: "UTC" })?.toString()).toBe(
      "2026-10-30T00:00:00+00:00[UTC]"
    );
  });

  it("applies Unix day-of-month OR day-of-week", () => {
    const end = Temporal.Instant.from("2026-11-30T12:00:00Z");
    expect(strings(nextRuns("0 0 1 * MON", { from: end, timeZone: "UTC", count: 2 }))).toEqual([
      "2026-12-01T00:00:00+00:00[UTC]",
      "2026-12-07T00:00:00+00:00[UTC]",
    ]);
  });

  it("works in zones with unusual offsets", () => {
    expect(nextRun("0 0 9 * * ?", { from, timeZone: "Asia/Kathmandu" })?.toString()).toBe(
      "2026-01-01T09:00:00+05:45[Asia/Kathmandu]"
    );
  });
});

describe("defaults", () => {
  it("uses the time zone of a ZonedDateTime `from`", () => {
    const from = zdt("2026-01-01T00:00:00+09:00[Asia/Tokyo]");
    expect(nextRun("0 0 9 * * ?", { from })?.toString()).toBe("2026-01-01T09:00:00+09:00[Asia/Tokyo]");
  });

  it("lets an explicit timeZone override the ZonedDateTime's zone", () => {
    const from = zdt("2026-01-01T00:00:00+09:00[Asia/Tokyo]");
    expect(nextRun("0 0 9 * * ?", { from, timeZone: "UTC" })?.toString()).toBe("2026-01-01T09:00:00+00:00[UTC]");
  });

  it("defaults `from` to now and the zone to the system zone", () => {
    const next = nextRun("* * * * * ?");
    expect(next).not.toBeNull();
    expect(next!.timeZoneId).toBe(Temporal.Now.timeZoneId());
    expect(Temporal.Instant.compare(next!.toInstant(), Temporal.Now.instant())).toBeGreaterThanOrEqual(-1);
  });
});

describe("runs (lazy iterator)", () => {
  it("yields runs on demand, forward by default", () => {
    const iterator = runs("0 0 * * * ?", { from: Temporal.Instant.from("2026-01-01T00:00:00Z"), timeZone: "UTC" });
    const first = iterator.next().value;
    const second = iterator.next().value;
    expect([first?.toString(), second?.toString()]).toEqual([
      "2026-01-01T01:00:00+00:00[UTC]",
      "2026-01-01T02:00:00+00:00[UTC]",
    ]);
  });

  it("walks backward with direction: 'backward'", () => {
    const iterator = runs("0 0 * * * ?", {
      from: Temporal.Instant.from("2026-01-01T00:30:00Z"),
      timeZone: "UTC",
      direction: "backward",
    });
    expect([iterator.next().value?.toString(), iterator.next().value?.toString()]).toEqual([
      "2026-01-01T00:00:00+00:00[UTC]",
      "2025-12-31T23:00:00+00:00[UTC]",
    ]);
  });
});

describe("previousRun", () => {
  it("returns the latest run strictly before `from`", () => {
    const from = Temporal.Instant.from("2026-01-01T00:15:00Z");
    expect(previousRun("0 */15 * * * ?", { from, timeZone: "UTC" })?.toString()).toBe(
      "2026-01-01T00:00:00+00:00[UTC]"
    );
  });

  it("finds a run in an exhausted Quartz year list", () => {
    const from = Temporal.Instant.from("2026-01-01T00:00:00Z");
    expect(previousRun("0 0 0 1 1 ? 2025", { from, timeZone: "UTC" })?.toString()).toBe(
      "2025-01-01T00:00:00+00:00[UTC]"
    );
  });

  it("returns null when nothing ever matched", () => {
    const from = Temporal.Instant.from("2026-01-01T00:00:00Z");
    expect(previousRun("0 0 0 30 2 ?", { from, timeZone: "UTC" })).toBeNull();
  });
});

describe("DST: spring forward (America/New_York, 2026-03-08 02:00 EST → 03:00 EDT)", () => {
  const before = zdt("2026-03-07T12:00:00-05:00[America/New_York]");

  it("Quartz shifts a skipped time forward by the gap (02:30 → 03:30)", () => {
    expect(strings(nextRuns("0 30 2 * * ?", { from: before, count: 2 }))).toEqual([
      "2026-03-08T03:30:00-04:00[America/New_York]",
      "2026-03-09T02:30:00-04:00[America/New_York]",
    ]);
  });

  it("Unix (cronie) runs a skipped fixed-time job at the transition (03:00)", () => {
    expect(strings(nextRuns("30 2 * * *", { from: before, count: 2 }))).toEqual([
      "2026-03-08T03:00:00-04:00[America/New_York]",
      "2026-03-09T02:30:00-04:00[America/New_York]",
    ]);
  });

  it("Unix (cronie) skips a wildcard job's nonexistent times", () => {
    const from = zdt("2026-03-08T01:00:00-05:00[America/New_York]");
    expect(strings(nextRuns("*/30 * * * *", { from, count: 3 }))).toEqual([
      "2026-03-08T01:30:00-05:00[America/New_York]",
      "2026-03-08T03:00:00-04:00[America/New_York]",
      "2026-03-08T03:30:00-04:00[America/New_York]",
    ]);
  });

  it("Quartz folds shifted wildcard times into real ones without duplicates", () => {
    const from = zdt("2026-03-08T01:00:00-05:00[America/New_York]");
    expect(strings(nextRuns("0 */30 * * * ?", { from, count: 4 }))).toEqual([
      "2026-03-08T01:30:00-05:00[America/New_York]",
      "2026-03-08T03:00:00-04:00[America/New_York]",
      "2026-03-08T03:30:00-04:00[America/New_York]",
      "2026-03-08T04:00:00-04:00[America/New_York]",
    ]);
  });

  it("dst.gap overrides the dialect default", () => {
    expect(nextRun("0 30 2 * * ?", { from: before, dst: { gap: "skip" } })?.toString()).toBe(
      "2026-03-09T02:30:00-04:00[America/New_York]"
    );
    expect(nextRun("0 30 2 * * ?", { from: before, dst: { gap: "transition" } })?.toString()).toBe(
      "2026-03-08T03:00:00-04:00[America/New_York]"
    );
  });

  it("previousRun mirrors the gap policy", () => {
    const after = zdt("2026-03-08T12:00:00-04:00[America/New_York]");
    expect(previousRun("0 30 2 * * ?", { from: after })?.toString()).toBe(
      "2026-03-08T03:30:00-04:00[America/New_York]"
    );
    expect(previousRun("30 2 * * *", { from: after })?.toString()).toBe(
      "2026-03-08T03:00:00-04:00[America/New_York]"
    );
  });

  it("handles 30-minute DST shifts (Australia/Lord_Howe, 2026-10-04 02:00 → 02:30)", () => {
    const from = zdt("2026-10-03T12:00:00+10:30[Australia/Lord_Howe]");
    expect(nextRun("0 15 2 * * ?", { from })?.toString()).toBe("2026-10-04T02:45:00+11:00[Australia/Lord_Howe]");
    expect(nextRun("15 2 * * *", { from })?.toString()).toBe("2026-10-04T02:30:00+11:00[Australia/Lord_Howe]");
  });
});

describe("DST: fall back (America/New_York, 2026-11-01 02:00 EDT → 01:00 EST)", () => {
  const before = zdt("2026-10-31T12:00:00-04:00[America/New_York]");

  it("Quartz fires a repeated fixed time once (first occurrence)", () => {
    expect(strings(nextRuns("0 30 1 * * ?", { from: before, count: 2 }))).toEqual([
      "2026-11-01T01:30:00-04:00[America/New_York]",
      "2026-11-02T01:30:00-05:00[America/New_York]",
    ]);
  });

  it("Unix (cronie) fires a repeated fixed-time job once", () => {
    expect(strings(nextRuns("30 1 * * *", { from: before, count: 2 }))).toEqual([
      "2026-11-01T01:30:00-04:00[America/New_York]",
      "2026-11-02T01:30:00-05:00[America/New_York]",
    ]);
  });

  it("Unix (cronie) runs wildcard jobs in both passes of the repeated hour", () => {
    const from = zdt("2026-11-01T00:45:00-04:00[America/New_York]");
    expect(strings(nextRuns("*/30 * * * *", { from, count: 5 }))).toEqual([
      "2026-11-01T01:00:00-04:00[America/New_York]",
      "2026-11-01T01:30:00-04:00[America/New_York]",
      "2026-11-01T01:00:00-05:00[America/New_York]",
      "2026-11-01T01:30:00-05:00[America/New_York]",
      "2026-11-01T02:00:00-05:00[America/New_York]",
    ]);
  });

  it("Quartz skips the second pass for wildcard schedules too", () => {
    const from = zdt("2026-11-01T00:45:00-04:00[America/New_York]");
    expect(strings(nextRuns("0 */30 * * * ?", { from, count: 3 }))).toEqual([
      "2026-11-01T01:00:00-04:00[America/New_York]",
      "2026-11-01T01:30:00-04:00[America/New_York]",
      "2026-11-01T02:00:00-05:00[America/New_York]",
    ]);
  });

  it("dst.overlap 'all' fires both occurrences", () => {
    expect(strings(nextRuns("0 30 1 * * ?", { from: before, count: 2, dst: { overlap: "all" } }))).toEqual([
      "2026-11-01T01:30:00-04:00[America/New_York]",
      "2026-11-01T01:30:00-05:00[America/New_York]",
    ]);
  });

  it("previousRun walks back through both passes for Unix wildcard jobs", () => {
    const from = zdt("2026-11-01T02:10:00-05:00[America/New_York]");
    const iterator = runs("*/30 * * * *", { from, direction: "backward" });
    const result = Array.from({ length: 6 }, () => iterator.next().value!.toString());
    expect(result).toEqual([
      "2026-11-01T02:00:00-05:00[America/New_York]",
      "2026-11-01T01:30:00-05:00[America/New_York]",
      "2026-11-01T01:00:00-05:00[America/New_York]",
      "2026-11-01T01:30:00-04:00[America/New_York]",
      "2026-11-01T01:00:00-04:00[America/New_York]",
      "2026-11-01T00:30:00-04:00[America/New_York]",
    ]);
  });

  it("previousRun skips the second pass for Quartz", () => {
    const from = zdt("2026-11-01T01:45:00-05:00[America/New_York]");
    expect(previousRun("0 30 1 * * ?", { from })?.toString()).toBe("2026-11-01T01:30:00-04:00[America/New_York]");
  });
});

describe("matches", () => {
  it("checks wall-clock fields only", () => {
    expect(matches("0 30 9 ? * MON-FRI", zdt("2026-11-23T09:30:00-05:00[America/New_York]"))).toBe(true);
    expect(matches("0 30 9 ? * MON-FRI", zdt("2026-11-22T09:30:00-05:00[America/New_York]"))).toBe(false);
    expect(matches("0 30 9 ? * MON-FRI", zdt("2026-11-23T09:30:01-05:00[America/New_York]"))).toBe(false);
  });

  it("accepts a PlainDateTime", () => {
    expect(matches("0 0 1 * *", Temporal.PlainDateTime.from("2026-12-01T00:00"))).toBe(true);
  });
});

describe("without Temporal", () => {
  const saved = globalThis.Temporal;
  afterEach(() => {
    globalThis.Temporal = saved;
  });

  it("throws TemporalUnavailableError with polyfill instructions", () => {
    // @ts-expect-error simulating a runtime without Temporal (e.g. Safari today)
    delete globalThis.Temporal;
    expect(() => nextRun("* * * * *")).toThrow(TemporalUnavailableError);
    expect(() => nextRun("* * * * *")).toThrow(/temporal-polyfill/);
  });
});
