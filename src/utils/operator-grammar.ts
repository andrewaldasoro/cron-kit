import { parseCronInt } from "./parse-cron-int.js";

export type Boundaries = readonly [min: number, max: number];

export function isWithinBoundaries(value: number, [min, max]: Boundaries): boolean {
  return value >= min && value <= max;
}

export interface FieldGrammar {
  /** Inclusive bounds, in the field's native numbering (e.g. Quartz day-of-week is 1-7). */
  bounds: Boundaries;
  /** Resolves a single token (number or name) to its native value, or NaN. */
  parseAtom: (token: string) => number;
  /** Largest allowed increment after `/`; unbounded when omitted. */
  maxStep?: number;
  /** Whether a name may start a step (`MON/2`). Defaults to true. */
  allowNamedStepStart?: boolean;
}

/** Items in the field's native numbering. Field modules map them to canonical values. */
export type OperatorItem =
  | { kind: "value"; value: number }
  | { kind: "range"; start: number; end: number; step?: number }
  | { kind: "step"; start: number | "any"; step: number };

export type OperatorExpr = { kind: "any" } | { kind: "list"; items: OperatorItem[] };

export interface OperatorIssue {
  code: "INVALID_VALUE" | "INVALID_RANGE" | "INVALID_STEP";
  token: string;
}

export type OperatorResult = { ok: true; expr: OperatorExpr } | { ok: false; issue: OperatorIssue };

type ItemResult = { ok: true; item: OperatorItem } | { ok: false; issue: OperatorIssue };

/**
 * Shared grammar for cron field values: wildcard, comma lists, dashed ranges,
 * and slash steps. Each field supplies its own bounds and atom resolver (plain
 * numbers, or names like JAN/SUN) and gets list/range/step parsing for free.
 */
export function parseOperatorExpression(expression: string, grammar: FieldGrammar): OperatorResult {
  if (expression === "*") return { ok: true, expr: { kind: "any" } };

  const items: OperatorItem[] = [];
  for (const token of expression.split(",")) {
    const result = parseItem(token, grammar);
    if (!result.ok) return result;
    items.push(result.item);
  }
  return { ok: true, expr: { kind: "list", items } };
}

function parseItem(token: string, grammar: FieldGrammar): ItemResult {
  if (token.includes("/")) return parseStep(token, grammar);
  if (token.includes("-")) return parseRange(token, grammar);

  const value = parseAtom(token, grammar);
  if (Number.isNaN(value)) return invalid("INVALID_VALUE", token);
  return { ok: true, item: { kind: "value", value } };
}

function parseStep(token: string, grammar: FieldGrammar): ItemResult {
  const parts = token.split("/");
  if (parts.length !== 2) return invalid("INVALID_STEP", token);

  const [base, increment] = parts;
  const step = parseCronInt(increment);
  const maxStep = grammar.maxStep ?? Number.POSITIVE_INFINITY;
  if (!(step >= 1 && step <= maxStep)) return invalid("INVALID_STEP", token);

  if (grammar.allowNamedStepStart === false && /[a-z]/i.test(base)) {
    return invalid("INVALID_STEP", token);
  }

  if (base === "*") return { ok: true, item: { kind: "step", start: "any", step } };

  if (base.includes("-")) {
    const range = parseRange(base, grammar);
    if (!range.ok || range.item.kind !== "range") return range;
    return { ok: true, item: { ...range.item, step } };
  }

  const start = parseAtom(base, grammar);
  if (Number.isNaN(start)) return invalid("INVALID_VALUE", base);
  return { ok: true, item: { kind: "step", start, step } };
}

function parseRange(token: string, grammar: FieldGrammar): ItemResult {
  const parts = token.split("-");
  if (parts.length !== 2) return invalid("INVALID_RANGE", token);

  const [startToken, endToken] = parts;
  const start = parseAtom(startToken, grammar);
  if (Number.isNaN(start)) return invalid("INVALID_VALUE", startToken);
  const end = parseAtom(endToken, grammar);
  if (Number.isNaN(end)) return invalid("INVALID_VALUE", endToken);

  if (start > end) return invalid("INVALID_RANGE", token);
  return { ok: true, item: { kind: "range", start, end } };
}

/** Native value of a single token, or NaN when it is unknown or out of bounds. */
function parseAtom(token: string, grammar: FieldGrammar): number {
  const value = grammar.parseAtom(token);
  return isWithinBoundaries(value, grammar.bounds) ? value : NaN;
}

function invalid(code: OperatorIssue["code"], token: string): ItemResult {
  return { ok: false, issue: { code, token } };
}
