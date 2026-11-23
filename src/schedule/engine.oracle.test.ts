import { describe, expect, it } from "vitest";
import { resolveCron } from "../core/parse";
import { runs, type DstPolicy } from "../schedule";
import { compile, type CompiledCron } from "./compile";

/**
 * Cross-checks the segment-based engine against a brute-force oracle that
 * walks every wall-clock minute and resolves it with Temporal's own
 * disambiguation, around real DST transitions.
 */

const ZONES = ["America/New_York", "Europe/London", "Australia/Lord_Howe", "Australia/Sydney", "America/Santiago"];
const MINUTES = ["0", "30", "*/15", "0,30", "15-45/15", "*/7", "5"];
const HOURS = ["*", "0", "1", "2", "1-3", "*/2", "0,2", "3", "23"];
const POLICIES: DstPolicy[] = [
  { gap: "later", overlap: "first" },
  { gap: "transition", overlap: "first" },
  { gap: "skip", overlap: "all" },
  { gap: "later", overlap: "all" },
];

function* pairs() {
  // Deterministic pseudo-random sample of minute/hour combinations.
  let seed = 7;
  const random = (n: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed % n;
  };
  for (let i = 0; i < 14; i++) yield [MINUTES[random(MINUTES.length)], HOURS[random(HOURS.length)]] as const;
}

function transitionsIn2026(timeZone: string): Temporal.ZonedDateTime[] {
  const result: Temporal.ZonedDateTime[] = [];
  let cursor: Temporal.ZonedDateTime | null = Temporal.ZonedDateTime.from({ timeZone, year: 2026, month: 1, day: 1 });
  while (result.length < 2) {
    cursor = cursor.getTimeZoneTransition("next");
    if (!cursor) break;
    result.push(cursor);
  }
  return result;
}

function wallMatches(compiled: CompiledCron, wall: Temporal.PlainDateTime): boolean {
  return (
    compiled.months.includes(wall.month) &&
    compiled.daysOf(wall.year, wall.month).includes(wall.day) &&
    compiled.hours.includes(wall.hour) &&
    compiled.minutes.includes(wall.minute) &&
    compiled.seconds.includes(wall.second)
  );
}

function oracle(
  compiled: CompiledCron,
  timeZone: string,
  policy: DstPolicy,
  start: Temporal.Instant,
  end: Temporal.Instant
): string[] {
  const instants = new Map<bigint, Temporal.ZonedDateTime>();
  const add = (zoned: Temporal.ZonedDateTime) => instants.set(zoned.epochNanoseconds, zoned);

  let wall = start.toZonedDateTimeISO(timeZone).toPlainDateTime().subtract({ hours: 4 }).round("minute");
  const lastWall = end.toZonedDateTimeISO(timeZone).toPlainDateTime().add({ hours: 4 });

  for (; Temporal.PlainDateTime.compare(wall, lastWall) <= 0; wall = wall.add({ minutes: 1 })) {
    if (!wallMatches(compiled, wall)) continue;
    const earlier = wall.toZonedDateTime(timeZone, { disambiguation: "earlier" });
    const later = wall.toZonedDateTime(timeZone, { disambiguation: "later" });
    const exists = earlier.toPlainDateTime().equals(wall);

    if (exists) {
      add(earlier);
      if (policy.overlap === "all" && !later.equals(earlier)) add(later);
    } else if (policy.gap === "later") {
      add(later);
    } else if (policy.gap === "transition") {
      add(later.add({ nanoseconds: 1 }).getTimeZoneTransition("previous")!);
    }
  }

  return [...instants.values()]
    .filter(
      (zoned) =>
        Temporal.Instant.compare(zoned.toInstant(), start) > 0 && Temporal.Instant.compare(zoned.toInstant(), end) < 0
    )
    .sort((a, b) => Temporal.ZonedDateTime.compare(a, b))
    .map((zoned) => zoned.toString());
}

function collect(
  iterator: Iterator<Temporal.ZonedDateTime>,
  keep: (instant: Temporal.Instant) => boolean
): string[] {
  const result: string[] = [];
  for (let next = iterator.next(); !next.done && keep(next.value.toInstant()); next = iterator.next()) {
    result.push(next.value.toString());
  }
  return result;
}

describe("engine vs brute-force oracle around DST transitions", () => {
  for (const timeZone of ZONES) {
    for (const transition of transitionsIn2026(timeZone)) {
      it(`${timeZone} @ ${transition.toString()}`, () => {
        const start = transition.toInstant().subtract({ hours: 30 });
        const end = transition.toInstant().add({ hours: 30 });

        for (const [minute, hour] of pairs()) {
          for (const expression of [`0 ${minute} ${hour} * * ?`, `${minute} ${hour} * * *`]) {
            const cron = resolveCron(expression);
            const compiled = compile(cron);
            for (const dst of POLICIES) {
              const expected = oracle(compiled, timeZone, dst, start, end);
              const label = `${expression} ${JSON.stringify(dst)}`;

              const forward = collect(
                runs(cron, { from: start, timeZone, dst }),
                (instant) => Temporal.Instant.compare(instant, end) < 0
              );
              expect(forward, label).toEqual(expected);

              const backward = collect(
                runs(cron, { from: end, timeZone, dst, direction: "backward" }),
                (instant) => Temporal.Instant.compare(instant, start) > 0
              );
              expect(backward, `${label} backward`).toEqual([...expected].reverse());
            }
          }
        }
      });
    }
  }
});
