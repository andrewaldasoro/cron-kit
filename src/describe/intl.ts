export type HourCycle = "h12" | "h23";

/** Joins items with the language's list grammar ("a, b, and c" / "a, b y c"). */
export function formatList(code: string, items: string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  return new Intl.ListFormat(code, { style: "long", type }).format(items);
}

/** The language's preferred clock, e.g. `h12` for `en`, `h23` for `es`/`fr`. */
export function defaultHourCycle(code: string): HourCycle {
  // resolvedOptions().hourCycle is only defined when the formatter includes an hour.
  const cycle = new Intl.DateTimeFormat(code, { hour: "numeric" }).resolvedOptions().hourCycle;
  return cycle === "h11" || cycle === "h12" ? "h12" : "h23";
}

export function formatTime(code: string, hourCycle: HourCycle, hour: number, minute: number, second = 0): string {
  return new Intl.DateTimeFormat(code, {
    timeZone: "UTC",
    hourCycle,
    hour: hourCycle === "h12" ? "numeric" : "2-digit",
    minute: "2-digit",
    ...(second === 0 ? {} : { second: "2-digit" }),
  }).format(Date.UTC(2000, 0, 1, hour, minute, second));
}

/** Canonical weekday (0 = Sunday) → localized long name ("Monday", "lunes", "lundi"). */
export function weekdayName(code: string, weekday: number): string {
  // 2023-01-01 was a Sunday.
  return new Intl.DateTimeFormat(code, { timeZone: "UTC", weekday: "long" }).format(Date.UTC(2023, 0, 1 + weekday));
}

/** Month 1-12 → localized long name ("January", "enero", "janvier"). */
export function monthName(code: string, month: number): string {
  return new Intl.DateTimeFormat(code, { timeZone: "UTC", month: "long" }).format(Date.UTC(2023, month - 1, 1));
}

export function capitalize(code: string, text: string): string {
  const [first = "", ...rest] = text;
  return first.toLocaleUpperCase(code) + rest.join("");
}
