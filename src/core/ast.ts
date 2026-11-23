import type { FieldExpr, FieldItem } from "./types.js";

/**
 * Vixie/cronie rule: a day field "starts with `*`" when its text begins with
 * `*` (`*` itself or `*\/n`). If either day field does, unix combines them with
 * AND; otherwise with OR.
 */
export function startsWithWildcard(expr: FieldExpr): boolean {
  if (expr.kind === "any") return true;
  if (expr.kind === "none") return false;
  const [first] = expr.items;
  return first?.kind === "step" && first.start === "any";
}

/** `L`, `W`, `#` and friends: day-only items with no Unix equivalent. */
export function isSpecialItem(item: FieldItem): boolean {
  return (
    item.kind === "lastDay" ||
    item.kind === "nearestWeekday" ||
    item.kind === "lastWeekday" ||
    item.kind === "lastDayOfWeek" ||
    item.kind === "nthDayOfWeek"
  );
}

export function isSingleValue(expr: FieldExpr, value?: number): boolean {
  return (
    expr.kind === "list" &&
    expr.items.length === 1 &&
    expr.items[0].kind === "value" &&
    (value === undefined || expr.items[0].value === value)
  );
}
