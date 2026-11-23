import { fromWallSeconds } from "./civil.js";
import type { CompiledCron } from "./compile.js";
import { nextWallMatch, previousWallMatch } from "./search.js";
import { contains, type Segment, type Zone } from "./zone.js";

export interface DstPolicy {
  /**
   * Wall times skipped by a forward jump (spring forward):
   * - `later`: shift forward by the gap length (02:30 → 03:30), like Quartz / Java Calendar.
   * - `transition`: run once at the transition instant (≈03:00), like cronie fixed-time jobs.
   * - `skip`: don't run, like cronie wildcard jobs.
   */
  gap: "later" | "transition" | "skip";
  /**
   * Wall times repeated by a backward jump (fall back):
   * - `first`: run once, at the earlier offset (Quartz; cronie fixed-time jobs).
   * - `all`: run in both passes (cronie wildcard jobs).
   */
  overlap: "first" | "all";
}

/** Mirrors the scheduler that actually runs each dialect. */
export function defaultDstPolicy(compiled: CompiledCron): DstPolicy {
  if (compiled.dialect === "quartz") return { gap: "later", overlap: "first" };
  return compiled.isWildcardJob ? { gap: "skip", overlap: "all" } : { gap: "transition", overlap: "first" };
}

/** Upper bound on how far a search looks; covers the full 400-year Gregorian cycle. */
const HORIZON_YEARS = 400;

export interface Context {
  compiled: CompiledCron;
  zone: Zone;
  policy: DstPolicy;
}

export interface Found {
  instant: number;
  segment: Segment;
}

interface Gap {
  wallStart: number;
  wallEnd: number;
  offsetBefore: number;
}

function gapAt(segment: Segment): Gap | null {
  const { start, previousOffset, offset } = segment;
  if (start === null || previousOffset === null || offset <= previousOffset) return null;
  return { wallStart: start + previousOffset, wallEnd: start + offset, offsetBefore: previousOffset };
}

/** Wall time where regular (non-gap) runs of the segment begin. */
function regularWallStart(segment: Segment, policy: DstPolicy): number {
  if (segment.start === null) return Number.NEGATIVE_INFINITY;
  const repeatsWallTime = segment.previousOffset !== null && segment.previousOffset > segment.offset;
  if (repeatsWallTime && policy.overlap === "first") return segment.start + (segment.previousOffset as number);
  return segment.start + segment.offset;
}

/** Earliest run instant strictly after `cursor` (epoch seconds). */
export function nextInstant(context: Context, cursor: number, hint?: Segment): Found | null {
  const { compiled, zone, policy } = context;
  const maxYear = fromWallSeconds(cursor).year + HORIZON_YEARS;
  let segment = hint && contains(hint, cursor) ? hint : zone.segmentAt(cursor);

  for (;;) {
    let best: number | null = null;
    const consider = (instant: number) => {
      if (instant > cursor && (best === null || instant < best)) best = instant;
    };

    const gap = gapAt(segment);
    if (gap && policy.gap === "later") {
      const from = Math.max(gap.wallStart, cursor + gap.offsetBefore + 1);
      const wall = nextWallMatch(compiled, from, maxYear);
      if (wall !== null && wall < gap.wallEnd) consider(wall - gap.offsetBefore);
    } else if (gap && policy.gap === "transition") {
      const wall = nextWallMatch(compiled, gap.wallStart, maxYear);
      if (wall !== null && wall < gap.wallEnd) consider(segment.start as number);
    }

    const from = Math.max(cursor + segment.offset + 1, regularWallStart(segment, policy));
    const wall = nextWallMatch(compiled, from, maxYear);
    if (wall !== null && (segment.end === null || wall < segment.end + segment.offset)) {
      consider(wall - segment.offset);
    }

    if (best !== null) return { instant: best, segment };
    if (wall === null || segment.end === null) return null;
    segment = zone.next(segment);
  }
}

/** Latest run instant at or before `upper` (epoch seconds). */
export function previousInstant(context: Context, upper: number, hint?: Segment): Found | null {
  const { compiled, zone, policy } = context;
  const minYear = fromWallSeconds(upper).year - HORIZON_YEARS;
  let segment = hint && contains(hint, upper) ? hint : zone.segmentAt(upper);

  for (;;) {
    let best: number | null = null;
    const consider = (instant: number) => {
      if (instant <= upper && (best === null || instant > best)) best = instant;
    };

    let to = upper + segment.offset;
    if (segment.end !== null) to = Math.min(to, segment.end + segment.offset - 1);
    const wall = previousWallMatch(compiled, to, minYear);
    if (wall !== null && wall >= regularWallStart(segment, policy)) consider(wall - segment.offset);

    const gap = gapAt(segment);
    if (gap && policy.gap === "later") {
      const gapTo = Math.min(gap.wallEnd - 1, upper + gap.offsetBefore);
      const gapWall = previousWallMatch(compiled, gapTo, minYear);
      if (gapWall !== null && gapWall >= gap.wallStart) consider(gapWall - gap.offsetBefore);
    } else if (gap && policy.gap === "transition") {
      const gapWall = previousWallMatch(compiled, gap.wallEnd - 1, minYear);
      if (gapWall !== null && gapWall >= gap.wallStart) consider(segment.start as number);
    }

    if (best !== null) return { instant: best, segment };
    if (wall === null || segment.start === null) return null;
    segment = zone.previous(segment);
  }
}
