import { DIALECTS, UNIX_MACROS } from "./dialects.js";
import { createError, CronParseError } from "./errors.js";
import { parseField } from "./fields.js";
import type {
  Cron,
  CronError,
  Dialect,
  DialectOption,
  FieldExpr,
  FieldName,
  ParseOptions,
  ParseResult,
  ValidationResult,
} from "./types.js";

const ANY: FieldExpr = { kind: "any" };
const ZERO: FieldExpr = { kind: "list", items: [{ kind: "value", value: 0 }] };

/**
 * Parses a cron expression into its canonical form. Never throws: invalid
 * input returns every field's error (no short-circuiting).
 */
export function parse(expression: string, options: ParseOptions = {}): ParseResult {
  const source = expression.trim().split(/\s+/).join(" ");
  const requested = options.dialect ?? "auto";

  if (source === "") return failure([createError("EMPTY_EXPRESSION")]);
  if (source.startsWith("@")) return parseMacro(source, requested);

  const tokens = source.split(" ");
  const dialect = resolveDialect(requested, tokens.length);
  if (!dialect) {
    return failure([createError("WRONG_FIELD_COUNT", undefined, { dialect: requested, count: tokens.length })]);
  }

  const spec = DIALECTS[dialect];
  const fieldNames: FieldName[] = [...spec.fieldOrder];
  if (spec.optionalField && tokens.length > fieldNames.length) fieldNames.push(spec.optionalField);

  const fields: Record<FieldName, FieldExpr> = {
    second: ZERO,
    minute: ANY,
    hour: ANY,
    dayOfMonth: ANY,
    month: ANY,
    dayOfWeek: ANY,
    year: ANY,
  };
  const errors: CronError[] = [];

  fieldNames.forEach((field, index) => {
    const result = parseField(spec, field, tokens[index]);
    if (result.ok) fields[field] = result.expr;
    else errors.push(createError(result.issue.code, field, result.issue.params));
  });

  const dayFieldsParsed = !errors.some((error) => error.field === "dayOfMonth" || error.field === "dayOfWeek");
  if (dialect === "quartz" && dayFieldsParsed) {
    const domNone = fields.dayOfMonth.kind === "none";
    const dowNone = fields.dayOfWeek.kind === "none";
    if (domNone && dowNone) errors.push(createError("DAY_FIELDS_BOTH_UNSET"));
    if (!domNone && !dowNone) errors.push(createError("DAY_FIELDS_BOTH_SET"));
  }

  if (errors.length > 0) return failure(errors);
  return { success: true, cron: { dialect, source, fields } };
}

export function validate(expression: string, options: ParseOptions = {}): ValidationResult {
  const result = parse(expression, options);
  return result.success ? { valid: true, errors: [] } : { valid: false, errors: result.errors };
}

export function isValid(expression: string, options: ParseOptions = {}): boolean {
  return parse(expression, options).success;
}

/** Accepts a parsed `Cron` as-is, or parses a string and throws `CronParseError` if invalid. */
export function resolveCron(input: string | Cron, options: ParseOptions = {}): Cron {
  if (typeof input !== "string") return input;
  const result = parse(input, options);
  if (!result.success) throw new CronParseError(result.errors);
  return result.cron;
}

function parseMacro(source: string, requested: DialectOption): ParseResult {
  if (requested === "quartz") {
    return failure([createError("WRONG_FIELD_COUNT", undefined, { dialect: "quartz", count: 1 })]);
  }

  const macro = source.toLowerCase();
  if (macro === "@reboot") return failure([createError("UNSUPPORTED_MACRO", undefined, { macro: source })]);

  const expansion = UNIX_MACROS[macro];
  if (!expansion) return failure([createError("UNKNOWN_MACRO", undefined, { macro: source })]);

  const result = parse(expansion, { dialect: "unix" });
  if (!result.success) return result;
  return { success: true, cron: { ...result.cron, source } };
}

function resolveDialect(requested: DialectOption, fieldCount: number): Dialect | null {
  const isUnixCount = fieldCount === 5;
  const isQuartzCount = fieldCount === 6 || fieldCount === 7;
  if (requested === "unix") return isUnixCount ? "unix" : null;
  if (requested === "quartz") return isQuartzCount ? "quartz" : null;
  if (isUnixCount) return "unix";
  if (isQuartzCount) return "quartz";
  return null;
}

function failure(errors: CronError[]): ParseResult {
  return { success: false, errors };
}
