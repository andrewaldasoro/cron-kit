# cron-toolkit

[![npm version](https://img.shields.io/npm/v/cron-toolkit.svg)](https://www.npmjs.com/package/cron-toolkit)
[![Test](https://github.com/andrewaldasoro/cron-toolkit/actions/workflows/test.yml/badge.svg)](https://github.com/andrewaldasoro/cron-toolkit/actions/workflows/test.yml)
[![license](https://img.shields.io/npm/l/cron-toolkit.svg)](./LICENSE)

A small cron toolkit in TypeScript: **parse, validate, format, convert, describe** (English, Spanish, French) and **compute next / previous runs in any time zone**, with DST handling that matches the scheduler that will actually run the job.

- **Quartz** (6–7 fields, seconds first, `?` `L` `W` `#`) and **Unix** crontab (5 fields, `@daily` …) dialects
- **Zero runtime dependencies**: built on `Temporal` and `Intl`
- ESM-only, fully typed, tree-shakeable subpath exports

> Formerly [`cron-quartz-validator`](https://www.npmjs.com/package/cron-quartz-validator). See [Migrating](#migrating-from-cron-quartz-validator).

## Installation

```bash
npm install cron-toolkit
```

| Import | What | Needs `Temporal` |
| --- | --- | --- |
| `cron-toolkit` | `parse`, `validate`, `isValid`, `format`, `convert`, `fromRecurrence`, `toRecurrence` | no |
| `cron-toolkit/describe` | `describe`, `formatError` | no |
| `cron-toolkit/locales/en` · `/es` · `/fr` | locale packs for `describe` / `formatError` | no |
| `cron-toolkit/schedule` | `nextRun`, `nextRuns`, `previousRun`, `runs`, `matches` | **yes** |

`Temporal` is built into Node 26+, Chrome/Edge 144+ and Firefox 139+. **Safari** and Node ≤ 24 need a polyfill, loaded once before you use `cron-toolkit/schedule`:

```ts
import "temporal-polyfill/global";
```

Without it, `cron-toolkit/schedule` throws a `TemporalUnavailableError`. Everything else works anywhere.

## Validate & parse

```ts
import { validate, isValid, parse } from "cron-toolkit";

isValid("0 0 12 * * ?"); // true (Quartz)
isValid("*/5 * * * *"); // true (Unix)

validate("60 0 99 * * ?");
// {
//   valid: false,
//   errors: [
//     { code: "INVALID_VALUE", field: "second", params: { token: "60", min: 0, max: 59 }, message: "Seconds must be between 0 and 59" },
//     { code: "INVALID_VALUE", field: "hour", params: { token: "99", min: 0, max: 23 }, message: "Hours must be between 0 and 23" },
//   ],
// }

const result = parse("0 15 10 ? * MON-FRI");
if (result.success) result.cron; // { dialect: "quartz", source, fields: { second, minute, … } }
```

The dialect is detected from the field count (`@macro` or 5 fields → Unix, 6–7 → Quartz). Pass `{ dialect: "quartz" | "unix" }` to require one. Every function that takes an expression also accepts an already-parsed `Cron`.

Errors carry a stable `code`, the `field` and `params`, so a UI can highlight the field and show its own text. See [Error codes](#error-codes).

## Describe

```ts
import { describe, formatError } from "cron-toolkit/describe";
import { es } from "cron-toolkit/locales/es";
import { fr } from "cron-toolkit/locales/fr";

describe("*/15 9-17 * * MON-FRI");
// "Every 15 minutes, between 9:00 AM and 5:59 PM, Monday through Friday"
describe("*/15 9-17 * * MON-FRI", { locale: es });
// "Cada 15 minutos, entre las 09:00 y las 17:59, de lunes a viernes"
describe("0 0 12 ? * 6#3", { locale: fr });
// "À 12:00, le troisième vendredi du mois"
describe("0 30 9 * * ?", { hourCycle: "h23" });
// "At 09:30"

formatError(validate("60 0 0 * * ?").errors[0], { locale: es });
// "Segundos: el valor debe estar entre 0 y 59"
```

Day and month names, times and lists come from `Intl`, so they follow each language's conventions. The default `hourCycle` is the locale's own (`en` 12-hour, `es`/`fr` 24-hour). To add a language, implement the `Locale` interface (see `src/locales/en.ts`).

## Next runs & time zones

```ts
import "temporal-polyfill/global"; // only where Temporal isn't native
import { nextRun, nextRuns, previousRun, runs, matches } from "cron-toolkit/schedule";

nextRuns("0 30 9 ? * MON-FRI", { count: 3, timeZone: "Europe/Madrid" });
// [Temporal.ZonedDateTime, …] strictly after now

const from = Temporal.ZonedDateTime.from("2026-03-07T12:00:00-05:00[America/New_York]");
nextRun("0 30 2 * * ?", { from }); // 2026-03-08T03:30-04:00 (Quartz: 02:30 doesn't exist that day)
nextRun("30 2 * * *", { from });   // 2026-03-08T03:00-04:00 (cronie runs it right after the jump)

previousRun("0 0 * * *", { timeZone: "Asia/Kathmandu" });

for (const run of runs("@hourly", { from })) {
  // lazy, unbounded iterator; break when you have enough
}

matches("0 30 9 ? * MON-FRI", Temporal.PlainDateTime.from("2026-11-23T09:30"));
// true (wall-clock field check only)
```

- `from`: `Temporal.Instant` or `Temporal.ZonedDateTime`, exclusive. Defaults to now.
- `timeZone`: any IANA zone. Defaults to `from`'s zone, or the system zone.
- Returns `null` / ends the iterator when no run exists (`30 FEB`, an exhausted Quartz year list). Searches never loop forever.

### Daylight-saving time

By default, runs around DST transitions match the scheduler that executes each dialect:

| | Skipped time (spring forward), e.g. 02:30 | Repeated time (fall back), e.g. 01:30 |
| --- | --- | --- |
| **Quartz** | shifted by the gap → 03:30 | once, first occurrence |
| **Unix, fixed-time job** (minute and hour don't start with `*`) | once, at the transition → 03:00 | once, first occurrence |
| **Unix, wildcard job** (`*/15 * * * *`, `0 * * * *`) | skipped | both occurrences |

Override with `dst: { gap: "later" | "transition" | "skip", overlap: "first" | "all" }`.

`matches()` only checks wall-clock fields and ignores DST policy. Use `runs()` to know when a job actually fires.

## Recurrence model (for UIs)

`fromRecurrence` / `toRecurrence` map simple form inputs to cron and back. `toRecurrence` returns `null` when an expression doesn't fit the model, so the UI can fall back to a raw editor.

```ts
import { fromRecurrence, toRecurrence, MINUTE_INTERVALS, HOUR_INTERVALS, WEEKDAYS } from "cron-toolkit";

fromRecurrence(
  { frequency: "weekly", weekdays: ["MON", "TUE", "WED", "THU", "FRI"], at: { hours: [9], minute: 0 } },
  { dialect: "quartz" }
); // "0 0 9 ? * MON-FRI"

fromRecurrence({ frequency: "monthly", on: { nth: 3, weekday: "FRI" }, at: { hours: [12], minute: 0 } }, { dialect: "quartz" });
// "0 0 12 ? * 6#3"

toRecurrence("30 */6 * * *"); // { frequency: "hourly", interval: 6, minute: 30 }
toRecurrence("0 0 1 * MON");  // null (Unix day-of-month OR day-of-week)
```

| `frequency` | Fields |
| --- | --- |
| `minutely` | `interval`: one of `MINUTE_INTERVALS` (divisors of 60) |
| `hourly` | `interval`: one of `HOUR_INTERVALS` (divisors of 24), `minute` |
| `daily` | `at` |
| `weekly` | `weekdays` (`"SUN"`…`"SAT"`), `at` |
| `monthly` | `on`, `at` |
| `yearly` | `months` (1–12), `on`, `at` |

- `at` is `{ hours: number[]; minute; second? }`. Cron fields combine as a cartesian product, so "09:00 and 17:30" can't be one expression and isn't representable.
- `on` is `{ days: number[] }`, `{ lastDay: true }` or `{ nth: 1–5 | "last", weekday }`. The last two are Quartz-only.
- Intervals are limited to values cron repeats evenly: `*/7` minutes would jump from :56 to :00.

Invalid input, or a dialect that can't express the recurrence, throws `CronRecurrenceError`.

## Format & convert

```ts
import { format, convert } from "cron-toolkit";

format("0 15 10 ? * mon-fri"); // "0 15 10 ? * MON-FRI" (weekdays as names, so 0- vs 1-based numbering can't be confused)
convert("0 30 9 ? * MON-FRI", { to: "unix" }); // "30 9 * * MON-FRI"
convert("*/5 * * * *", { to: "quartz" }); // "0 */5 * * * ?"
convert("0 0 0 L * ?", { to: "unix" }); // throws CronConvertError: Unix cron does not support 'L' in day-of-month
```

## Accepted syntax

**Quartz** (matches real Quartz):

    Seconds       0-59                 * , - /
    Minutes       0-59                 * , - /
    Hours         0-23                 * , - /
    Day of month  1-31                 * , - / ?  L  L-n  nW  LW
    Month         1-12 or JAN-DEC      * , - /
    Day of week   1-7 or SUN-SAT (1=SUN)   * , - / ?  L (=SAT)  nL  n#k
    Year          1970-2199 (optional) * , - /

- Exactly one of day-of-month / day-of-week must be `?`.
- `10/5` means 10, 15, …, 55.
- `L`, `W`, `#` can't be combined with other values in a list.
- Wrap-around ranges (`FRI-MON`, `22-2`) are rejected.

**Unix** (cronie-compatible):

    Minute        0-59                 * , - /
    Hour          0-23                 * , - /
    Day of month  1-31                 * , - /
    Month         1-12 or JAN-DEC      * , - /
    Day of week   0-7 or SUN-SAT (0 and 7 = SUN)   * , - /
    Macros        @yearly @annually @monthly @weekly @daily @midnight @hourly

- When both day fields are restricted, a run happens on either: `0 0 1 * MON` = the 1st **or** Mondays.
- If either day field starts with `*` (e.g. `*/2`), both must match.
- `@reboot` is rejected: it has no schedule.

## Error codes

| Code | When |
| --- | --- |
| `EMPTY_EXPRESSION` | blank input |
| `WRONG_FIELD_COUNT` | not 5 (Unix) or 6–7 (Quartz) fields |
| `UNKNOWN_MACRO` / `UNSUPPORTED_MACRO` | `@often` / `@reboot` |
| `INVALID_VALUE` | out of range or unknown name |
| `INVALID_RANGE` | `start > end`, malformed range |
| `INVALID_STEP` | `/0`, increment too large, named step start in Quartz |
| `UNSUPPORTED_SYNTAX` | e.g. `?`, `L`, `W`, `#` in Unix |
| `INVALID_NTH` | `#` occurrence outside 1–5 |
| `SPECIAL_NOT_COMBINABLE` | `L`/`W`/`#` inside a list |
| `DAY_FIELDS_BOTH_SET` / `DAY_FIELDS_BOTH_UNSET` | Quartz `?` rule |

## Migrating from `cron-quartz-validator`

| Before | After |
| --- | --- |
| `validateCronExpression(expr)` | `validate(expr, { dialect: "quartz" })`. Errors are now objects with `code`, `field`, `params`, `message`. |
| `isValidCronExpression(expr)` | `isValid(expr, { dialect: "quartz" })` |

Validation now matches real Quartz:

- **Rejected now:** `0 0 12 * * MON` (needs `?`), `3L` in day-of-month, `0L`, `#0`.
- **Accepted now:** `10/5`, `MON#2`, `15W`, `L-3`.

## Development

```bash
pnpm i
pnpm typecheck  # tsc --noEmit
pnpm lint       # oxlint .
pnpm test       # vitest run (loads temporal-polyfill when Temporal isn't native)
pnpm build      # tsc -p tsconfig.build.json -> dist/
```

CI (`.github/workflows/test.yml`) runs typecheck, lint, tests and build on Node 24 (polyfill) and Node 26 (native Temporal), on every push to `main` and every pull request.

Releases:

- Every push to `main` bumps the patch version and commits it back (`bump-version.yml`).
- Pushing a `v*.*.*` tag publishes to npm with provenance (`publish.yml`). The version comes from the tag.

## License

ISC
