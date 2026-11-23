/// <reference lib="esnext.temporal" preserve="true" />
import { resolveCron } from "./core/parse.js";
import type { Cron, ParseOptions } from "./core/types.js";
import { compile } from "./schedule/compile.js";
import { defaultDstPolicy, nextInstant, previousInstant, type Context, type DstPolicy } from "./schedule/engine.js";
import { getTemporal } from "./schedule/temporal.js";
import { toSeconds, toSecondsCeil, Zone, type Segment } from "./schedule/zone.js";

export { TemporalUnavailableError } from "./schedule/temporal.js";
export type { DstPolicy } from "./schedule/engine.js";

export interface ScheduleOptions extends ParseOptions {
  /** Search start (exclusive). Defaults to now. */
  from?: Temporal.Instant | Temporal.ZonedDateTime;
  /** IANA zone. Defaults to `from`'s zone when it is a ZonedDateTime, else the system zone. */
  timeZone?: string;
  /** Overrides the dialect's DST behavior (see `DstPolicy`). */
  dst?: Partial<DstPolicy>;
}

export interface RunsOptions extends ScheduleOptions {
  direction?: "forward" | "backward";
}

export interface NextRunsOptions extends ScheduleOptions {
  count: number;
}

/**
 * Lazily yields run times, strictly after `from` (or strictly before it when
 * `direction` is `backward`). Ends when no further run exists (e.g. `30 FEB`,
 * or a Quartz year list is exhausted).
 */
export function runs(cron: string | Cron, options: RunsOptions = {}): Generator<Temporal.ZonedDateTime, void, undefined> {
  const temporal = getTemporal();
  const compiled = compile(resolveCron(cron, options));
  const { from } = options;
  const timeZone =
    options.timeZone ?? (from && "timeZoneId" in from ? from.timeZoneId : temporal.Now.timeZoneId());
  const context: Context = {
    compiled,
    zone: new Zone(temporal, timeZone),
    policy: { ...defaultDstPolicy(compiled), ...options.dst },
  };
  const epochNanoseconds = (from ?? temporal.Now.instant()).epochNanoseconds;

  return options.direction === "backward"
    ? iterateBackward(context, toSecondsCeil(epochNanoseconds) - 1)
    : iterateForward(context, toSeconds(epochNanoseconds));
}

function* iterateForward(context: Context, cursor: number): Generator<Temporal.ZonedDateTime, void, undefined> {
  let hint: Segment | undefined;
  for (;;) {
    const found = nextInstant(context, cursor, hint);
    if (!found) return;
    yield context.zone.toZonedDateTime(found.instant);
    cursor = found.instant;
    hint = found.segment;
  }
}

function* iterateBackward(context: Context, upper: number): Generator<Temporal.ZonedDateTime, void, undefined> {
  let hint: Segment | undefined;
  for (;;) {
    const found = previousInstant(context, upper, hint);
    if (!found) return;
    yield context.zone.toZonedDateTime(found.instant);
    upper = found.instant - 1;
    hint = found.segment;
  }
}

/** Next run strictly after `from`, or null if there is none. */
export function nextRun(cron: string | Cron, options: ScheduleOptions = {}): Temporal.ZonedDateTime | null {
  return runs(cron, options).next().value ?? null;
}

/** Up to `count` next runs (fewer if the schedule ends). */
export function nextRuns(cron: string | Cron, options: NextRunsOptions): Temporal.ZonedDateTime[] {
  const iterator = runs(cron, options);
  const result: Temporal.ZonedDateTime[] = [];
  while (result.length < options.count) {
    const { value, done } = iterator.next();
    if (done) break;
    result.push(value);
  }
  return result;
}

/** Latest run strictly before `from`, or null if there is none. */
export function previousRun(cron: string | Cron, options: ScheduleOptions = {}): Temporal.ZonedDateTime | null {
  return runs(cron, { ...options, direction: "backward" }).next().value ?? null;
}

/**
 * Whether a wall-clock date-time matches the expression's fields. Ignores DST
 * policy: `runs` is the source of truth for when a job actually fires.
 */
export function matches(cron: string | Cron, dateTime: Temporal.ZonedDateTime | Temporal.PlainDateTime): boolean {
  const compiled = compile(resolveCron(cron));
  const [minYear, maxYear] = compiled.yearBounds;
  const { year, month, day, hour, minute, second } = dateTime;
  return (
    (compiled.years ? compiled.years.includes(year) : year >= minYear && year <= maxYear) &&
    compiled.months.includes(month) &&
    compiled.daysOf(year, month).includes(day) &&
    compiled.hours.includes(hour) &&
    compiled.minutes.includes(minute) &&
    compiled.seconds.includes(second)
  );
}
