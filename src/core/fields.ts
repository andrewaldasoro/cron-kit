import { parseOperatorExpression, type FieldGrammar, type OperatorItem } from "../utils/operator-grammar.js";
import { parseCronInt } from "../utils/parse-cron-int.js";
import { toCanonicalWeekday, type DialectSpec, type FieldSpec } from "./dialects.js";
import type { CronError, CronErrorCode, FieldExpr, FieldItem, FieldName } from "./types.js";

export interface FieldIssue {
  code: CronErrorCode;
  params: CronError["params"];
}

export type FieldParseResult = { ok: true; expr: FieldExpr } | { ok: false; issue: FieldIssue };

const DOM_SPECIAL = /^(L|L-\d*|LW|\d+W)$/i;
const DOW_SPECIAL = /^(L|[a-z0-9]+L|.*#.*)$/i;
const MAX_LAST_DAY_OFFSET = 30;

/** Parses one field's text into canonical form for the given dialect. */
export function parseField(dialect: DialectSpec, field: FieldName, text: string): FieldParseResult {
  const spec = dialect.fields[field];
  if (!spec) throw new Error(`${dialect.dialect} has no ${field} field`);

  const isDayField = field === "dayOfMonth" || field === "dayOfWeek";

  if (text === "?") {
    if (isDayField && dialect.daySpecials) return { ok: true, expr: { kind: "none" } };
    return unsupported(dialect, text);
  }

  if (isDayField) {
    const special = field === "dayOfMonth" ? DOM_SPECIAL : DOW_SPECIAL;
    const items = text.split(",");
    const specialItem = items.find((item) => special.test(item));
    if (specialItem !== undefined) {
      if (!dialect.daySpecials) return unsupported(dialect, specialItem);
      if (items.length > 1) return failure("SPECIAL_NOT_COMBINABLE", { token: specialItem });
      return field === "dayOfMonth"
        ? parseDayOfMonthSpecial(spec, text)
        : parseDayOfWeekSpecial(dialect, spec, text);
    }
  }

  const result = parseOperatorExpression(text, grammarFor(dialect, spec));
  if (!result.ok) {
    const { code, token } = result.issue;
    if (code === "INVALID_VALUE") return invalidValue(spec, token);
    if (code === "INVALID_STEP") {
      return failure(code, spec.maxStep === undefined ? { token } : { token, max: spec.maxStep });
    }
    return failure(code, { token });
  }

  if (result.expr.kind === "any") return result;
  const items =
    field === "dayOfWeek" ? toCanonicalWeekdayItems(dialect, result.expr.items) : result.expr.items;
  return { ok: true, expr: { kind: "list", items } };
}

function grammarFor(dialect: DialectSpec, spec: FieldSpec): FieldGrammar {
  return {
    bounds: spec.bounds,
    parseAtom: (token) => parseAtom(spec, token),
    maxStep: spec.maxStep,
    allowNamedStepStart: dialect.allowNamedStepStart,
  };
}

/** Native value of a number or (case-insensitive) name, or NaN. */
function parseAtom(spec: FieldSpec, token: string): number {
  const numeric = parseCronInt(token);
  if (!Number.isNaN(numeric) || !spec.names) return numeric;

  const index = spec.names.indexOf(token.toLowerCase());
  return index === -1 ? NaN : index + (spec.nameBase ?? 0);
}

function parseBoundedAtom(spec: FieldSpec, token: string): number {
  const value = parseAtom(spec, token);
  const [min, max] = spec.bounds;
  return value >= min && value <= max ? value : NaN;
}

function parseDayOfMonthSpecial(spec: FieldSpec, text: string): FieldParseResult {
  const upper = text.toUpperCase();
  if (upper === "L") return list({ kind: "lastDay", offset: 0 });
  if (upper === "LW") return list({ kind: "lastWeekday" });

  if (upper.startsWith("L-")) {
    const offset = parseCronInt(upper.slice(2));
    if (!(offset >= 0 && offset <= MAX_LAST_DAY_OFFSET)) return invalidValue(spec, text);
    return list({ kind: "lastDay", offset });
  }

  const day = parseBoundedAtom(spec, upper.slice(0, -1));
  if (Number.isNaN(day)) return invalidValue(spec, text);
  return list({ kind: "nearestWeekday", day });
}

function parseDayOfWeekSpecial(dialect: DialectSpec, spec: FieldSpec, text: string): FieldParseResult {
  if (text.toUpperCase() === "L") return list({ kind: "value", value: 6 });

  if (text.includes("#")) {
    const [weekdayToken, nthToken, ...rest] = text.split("#");
    const native = parseBoundedAtom(spec, weekdayToken);
    if (Number.isNaN(native)) return invalidValue(spec, weekdayToken);
    const nth = parseCronInt(nthToken);
    if (rest.length > 0 || !(nth >= 1 && nth <= 5)) return failure("INVALID_NTH", { token: text });
    return list({
      kind: "nthDayOfWeek",
      weekday: toCanonicalWeekday(dialect.dialect, native),
      nth: nth as 1 | 2 | 3 | 4 | 5,
    });
  }

  const native = parseBoundedAtom(spec, text.slice(0, -1));
  if (Number.isNaN(native)) return invalidValue(spec, text);
  return list({ kind: "lastDayOfWeek", weekday: toCanonicalWeekday(dialect.dialect, native) });
}

/**
 * Maps native weekday items to canonical ones. Quartz is a plain shift (1-7 →
 * 0-6). Unix 7 also means Sunday, so items reaching 7 are split or expanded
 * instead of producing a wrap-around range.
 */
function toCanonicalWeekdayItems(dialect: DialectSpec, items: OperatorItem[]): FieldItem[] {
  if (dialect.dialect === "quartz") {
    return items.map((item): FieldItem => {
      if (item.kind === "value") return { kind: "value", value: item.value - 1 };
      if (item.kind === "range") return { ...item, start: item.start - 1, end: item.end - 1 };
      return item.start === "any" ? item : { ...item, start: item.start - 1 };
    });
  }

  return items.flatMap((item): FieldItem[] => {
    if (item.kind === "value") return [{ kind: "value", value: item.value % 7 }];
    if (item.kind === "step" && item.start === "any") return [item];

    const start = item.start as number;
    const end = item.kind === "range" ? item.end : 7;
    const step = item.step ?? 1;
    const reachesSeven = end === 7 && (7 - start) % step === 0;
    if (!reachesSeven) return [item.kind === "range" ? item : { ...item, start }];

    if (step === 1) {
      if (start === 0) return [{ kind: "range", start: 0, end: 6 }];
      if (start === 7) return [{ kind: "value", value: 0 }];
      return [
        { kind: "range", start, end: 6 },
        { kind: "value", value: 0 },
      ];
    }

    const expanded: number[] = [];
    for (let value = start; value <= end; value += step) {
      const canonical = value % 7;
      if (!expanded.includes(canonical)) expanded.push(canonical);
    }
    return expanded.map((value) => ({ kind: "value", value }));
  });
}

function list(item: FieldItem): FieldParseResult {
  return { ok: true, expr: { kind: "list", items: [item] } };
}

function invalidValue(spec: FieldSpec, token: string): FieldParseResult {
  const [min, max] = spec.bounds;
  const params: CronError["params"] = { token, min, max };
  if (spec.namesHint) params.names = spec.namesHint;
  return failure("INVALID_VALUE", params);
}

function unsupported(dialect: DialectSpec, token: string): FieldParseResult {
  return failure("UNSUPPORTED_SYNTAX", { token, dialect: dialect.dialect });
}

function failure(code: CronErrorCode, params: CronError["params"]): FieldParseResult {
  return { ok: false, issue: { code, params } };
}
