import { resolveCron } from "./core/parse.js";
import type { Cron, CronError, DialectOption } from "./core/types.js";
import { describeCron } from "./describe/describer.js";
import { defaultHourCycle, type HourCycle } from "./describe/intl.js";
import type { Locale } from "./describe/locale.js";
import { en } from "./locales/en.js";

export type { Locale, Nth, TimeText } from "./describe/locale.js";
export type { HourCycle } from "./describe/intl.js";

export interface DescribeOptions {
  /** Defaults to English. Import others from `cron-toolkit/locales/<code>`. */
  locale?: Locale;
  /** `h12` / `h23`; defaults to the locale's convention (en → h12, es/fr → h23). */
  hourCycle?: HourCycle;
  /** Dialect for string input; defaults to `auto`. */
  dialect?: DialectOption;
}

/** Plain-language description, e.g. "At 9:30 AM, Monday through Friday". */
export function describe(cron: string | Cron, options: DescribeOptions = {}): string {
  const locale = options.locale ?? en;
  const hourCycle = options.hourCycle ?? defaultHourCycle(locale.code);
  return describeCron(resolveCron(cron, { dialect: options.dialect }), locale, hourCycle);
}

/** Localized message for a validation error from `parse` / `validate`. */
export function formatError(error: Pick<CronError, "code" | "field" | "params">, options: { locale?: Locale } = {}): string {
  return (options.locale ?? en).formatError(error);
}
