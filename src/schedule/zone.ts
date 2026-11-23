import type { TemporalNamespace } from "./temporal.js";

const NS_PER_SECOND = 1_000_000_000n;

/**
 * A stretch of time with one UTC offset, between two offset transitions.
 * All values are epoch seconds (instants) or offset seconds.
 */
export interface Segment {
  /** Transition that starts the segment; null = unbounded past. */
  start: number | null;
  /** Next transition; null = unbounded future. */
  end: number | null;
  offset: number;
  /** Offset just before `start`. */
  previousOffset: number | null;
}

/** Thin Temporal wrapper: UTC offsets and transitions of one IANA zone. */
export class Zone {
  readonly #temporal: TemporalNamespace;
  readonly timeZone: string;

  constructor(temporal: TemporalNamespace, timeZone: string) {
    this.#temporal = temporal;
    // Validates the zone up front (throws RangeError for unknown ids).
    this.timeZone = temporal.Now.zonedDateTimeISO(timeZone).timeZoneId;
  }

  toZonedDateTime(seconds: number): Temporal.ZonedDateTime {
    return this.#zoned(seconds);
  }

  segmentAt(seconds: number): Segment {
    const start = this.#transitionAtOrBefore(seconds);
    return {
      start,
      end: this.#transitionAfter(seconds),
      offset: this.#offsetAt(seconds),
      previousOffset: start === null ? null : this.#offsetAt(start - 1),
    };
  }

  next(segment: Segment): Segment {
    const start = segment.end as number;
    return { start, end: this.#transitionAfter(start), offset: this.#offsetAt(start), previousOffset: segment.offset };
  }

  previous(segment: Segment): Segment {
    const end = segment.start as number;
    const start = this.#transitionAtOrBefore(end - 1);
    return {
      start,
      end,
      offset: segment.previousOffset as number,
      previousOffset: start === null ? null : this.#offsetAt(start - 1),
    };
  }

  #zoned(seconds: number, extraNanoseconds = 0n): Temporal.ZonedDateTime {
    const epochNanoseconds = BigInt(seconds) * NS_PER_SECOND + extraNanoseconds;
    return this.#temporal.Instant.fromEpochNanoseconds(epochNanoseconds).toZonedDateTimeISO(this.timeZone);
  }

  #offsetAt(seconds: number): number {
    return Math.round(this.#zoned(seconds).offsetNanoseconds / 1e9);
  }

  #transitionAfter(seconds: number): number | null {
    const transition = this.#zoned(seconds).getTimeZoneTransition("next");
    return transition ? toSeconds(transition.epochNanoseconds) : null;
  }

  #transitionAtOrBefore(seconds: number): number | null {
    // "previous" is strictly before the instant, so ask from 1ns later.
    const transition = this.#zoned(seconds, 1n).getTimeZoneTransition("previous");
    return transition ? toSeconds(transition.epochNanoseconds) : null;
  }
}

export function contains(segment: Segment, seconds: number): boolean {
  return (segment.start === null || segment.start <= seconds) && (segment.end === null || seconds < segment.end);
}

/** floor(epochNanoseconds / 1e9) as a number. */
export function toSeconds(epochNanoseconds: bigint): number {
  const quotient = epochNanoseconds / NS_PER_SECOND;
  return Number(epochNanoseconds < 0n && quotient * NS_PER_SECOND !== epochNanoseconds ? quotient - 1n : quotient);
}

/** ceil(epochNanoseconds / 1e9) as a number. */
export function toSecondsCeil(epochNanoseconds: bigint): number {
  const floor = toSeconds(epochNanoseconds);
  return BigInt(floor) * NS_PER_SECOND === epochNanoseconds ? floor : floor + 1;
}
