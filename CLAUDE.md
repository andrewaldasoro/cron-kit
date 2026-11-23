# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`cron-toolkit` (formerly `cron-quartz-validator`; GitHub repo `cron-kit`, but npm rejects `cron-kit` as too similar to the existing `cronkit`): a zero-dependency TypeScript cron toolkit. It can parse, validate, format and convert cron expressions, describe them in en/es/fr, compute next/previous runs in any IANA zone, and map a UI recurrence model to cron and back. It supports the Quartz (6–7 fields) and Unix (5 fields, cronie-compatible) dialects. Its main consumer is a separate UI component library for recurring-task inputs.

The package is ESM-only and built with `tsc` to `dist/` (`files: ["dist"]`). Subpath exports:

- `.`: core (`src/index.ts`)
- `./describe`
- `./schedule`
- `./locales/*`

Tests are colocated (`src/**/*.test.ts`) and are the source of truth for behavior. If you change semantics, update the tests in the same commit.

## Commands

Package manager is pnpm (`packageManager` field in `package.json`).

```bash
pnpm i              # install dependencies
pnpm test           # run the Vitest suite once (vitest.setup.ts loads temporal-polyfill if Temporal isn't native)
pnpm test:watch     # run Vitest in watch mode
pnpm typecheck      # tsc --noEmit
pnpm lint           # oxlint . (if an RTK hook rewrites it to eslint, use `rtk proxy pnpm lint`)
pnpm build          # tsc -p tsconfig.build.json -> dist/
```

## Architecture

Everything is pure functions over one canonical AST. The only exception is `cron-toolkit/schedule`, which reads the `Temporal` global.

- **AST** (`src/core/types.ts`): `Cron = { dialect, source, fields }`. Each field is `any` | `none` (Quartz `?`) | `list` of items. Items are `value`, `range`, `step`, plus the day specials `lastDay` (`L`, `L-n`), `nearestWeekday` (`nW`), `lastWeekday` (`LW`), `lastDayOfWeek` (`nL`) and `nthDayOfWeek` (`n#k`).
  - **Day-of-week is canonical 0 = Sunday … 6 = Saturday in every dialect.** Quartz 1–7 and Unix 0–7 are mapped at parse/format time (`src/core/dialects.ts`).
  - Unix ranges that reach 7 are split or expanded, never wrapped.
- **Parsing**:
  - `src/core/parse.ts` handles field count, dialect detection, Unix macros, and the Quartz "exactly one `?`" rule. It collects every field's error (no short-circuiting).
  - Fields go through `src/core/fields.ts`. Day specials are handled there; everything else goes through `src/utils/operator-grammar.ts`'s `parseOperatorExpression`, the one place that understands `*`, `,`, `-` and `/`. Add a new operator there, once.
  - `parseCronInt` (`src/utils/parse-cron-int.ts`) is the only numeric coercion path.
  - Per-dialect bounds, names, max steps and whether specials are allowed are data in `src/core/dialects.ts`. A new dialect = a config there plus adapter tweaks.
- **Errors** (`src/core/errors.ts`): `CronError = { code, field?, params, message }`.
  - One code per real failure case. English text lives in `englishErrorMessage`, which is also the `en` locale's formatter.
  - `CronParseError` is thrown by functions taking `string | Cron` (`resolveCron`). `CronConvertError` is thrown by `convert`/`format` across dialects.
- **Format/convert** (`src/core/format.ts`): day-of-week values and ranges are written as names, so 0- vs 1-based numbering can't be confused.
  - Converting re-parses the output in the target dialect as a safety net.
  - Unix DOM/DOW OR, and AND-with-leading-`*` where both day fields are restricted, can't be expressed in Quartz, so converting them throws.
- **Unix day rule**: Vixie/cronie combine DOM and DOW with **AND if either field starts with `*`** (including `*/n`), otherwise **OR**. See `startsWithWildcard` in `src/core/ast.ts`. The matcher, describer and converter all depend on it.
- **Schedule** (`src/schedule.ts` + `src/schedule/`):
  - `compile.ts` expands fields to sorted arrays and builds a per-(year, month) day matcher.
  - `search.ts` does a field-by-field wall-clock search in "wall seconds", using `civil.ts` (pure Gregorian math, no Temporal).
  - `zone.ts` is the only code touching Temporal: offsets and transitions, split into constant-offset `Segment`s.
  - `engine.ts` combines them per segment and applies the DST policy for gaps and overlaps.
- **DST defaults mirror the real scheduler** (`defaultDstPolicy`):
  - Quartz: gap → `later` (Java Calendar lenient, 02:30 → 03:30), overlap → `first`.
  - Unix fixed-time job (minute and hour don't start with `*`): gap → `transition`, overlap → `first`.
  - Unix wildcard job: gap → `skip`, overlap → `all` (cronie).
  - `matches()` ignores DST policy on purpose.
  - `src/schedule/engine.oracle.test.ts` cross-checks the engine against a brute-force Temporal oracle around real transitions. Keep it green when touching the engine.
- **Describe** (`src/describe/`):
  - `describer.ts` normalizes each field to a `Shape` and asks a `Locale` (`src/describe/locale.ts`) for phrase fragments. It joins them with ", " and capitalizes.
  - Names, times and lists come from `Intl` (`intl.ts`), so locale packs (`src/locales/{en,es,fr}.ts`) only hold grammar and error text.
- **Recurrence** (`src/recurrence/`): the UI model (`minutely` | `hourly` | `daily` | `weekly` | `monthly` | `yearly`).
  - Restricted to what cron expresses faithfully: intervals that divide 60/24, `at = { hours[], minute, second? }`.
  - `toRecurrence` returns null for anything else.
- **No Temporal at the root**: `cron-toolkit`, `/describe` and `/locales/*` must never reference Temporal, so they keep working in Safari without a polyfill. `src/schedule.ts` carries `/// <reference lib="esnext.temporal" preserve="true" />` so the emitted `.d.ts` pulls in the Temporal types.

## Style

- Linting is [oxlint](https://oxc.rs/): Rust-based, no config file, default rule set. It replaced ESLint/typescript-eslint because typescript-eslint has no release supporting TypeScript 7.x.
- Runtime dependencies: none. Keep it that way. `temporal-polyfill` is a dev dependency used only by `vitest.setup.ts`.
