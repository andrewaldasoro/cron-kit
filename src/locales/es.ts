import type { CronError, FieldName } from "../core/types.js";
import { formatList } from "../describe/intl.js";
import type { Locale, Nth, TimeText } from "../describe/locale.js";

const list = (items: string[]) => formatList("es", items);
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);
/** "la 01:00" / "las 09:00": singular article for one o'clock. */
const article = (time: TimeText) => (time.hour % 12 === 1 ? "la" : "las");
/** Recurring weekdays are plural: "los lunes", "los sábados". */
const weekdayPlural = (name: string) => (name.endsWith("s") ? name : `${name}s`);

const ORDINALS: Record<Nth, string> = { 1: "primer", 2: "segundo", 3: "tercer", 4: "cuarto", 5: "quinto" };
const UNITS: Record<"second" | "minute" | "hour" | "day" | "year", [string, string]> = {
  second: ["segundo", "segundos"],
  minute: ["minuto", "minutos"],
  hour: ["hora", "horas"],
  day: ["día", "días"],
  year: ["año", "años"],
};
const OF_EACH: Record<"second" | "minute", string> = { second: "de cada minuto", minute: "de cada hora" };

const FIELD_LABELS: Record<FieldName, string> = {
  second: "Segundos",
  minute: "Minutos",
  hour: "Horas",
  dayOfMonth: "Día del mes",
  month: "Mes",
  dayOfWeek: "Día de la semana",
  year: "Año",
};
const DIALECTS: Record<string, string> = { quartz: "Quartz", unix: "Unix" };

function formatError({ code, field, params }: Pick<CronError, "code" | "field" | "params">): string {
  const label = field ? `${FIELD_LABELS[field]}: ` : "";
  switch (code) {
    case "EMPTY_EXPRESSION":
      return "La expresión cron está vacía";
    case "WRONG_FIELD_COUNT": {
      const got = params.count === undefined ? "" : ` (recibidos: ${params.count})`;
      if (params.dialect === "quartz") return `Las expresiones cron de Quartz deben tener 6 campos, o 7 con el año${got}`;
      if (params.dialect === "unix") return `Las expresiones cron de Unix deben tener 5 campos${got}`;
      return `Las expresiones cron deben tener 5 campos (Unix) o 6-7 campos (Quartz)${got}`;
    }
    case "UNKNOWN_MACRO":
      return `Macro desconocida '${params.macro}'`;
    case "UNSUPPORTED_MACRO":
      return `'${params.macro}' se ejecuta al iniciar, no según un horario, y no es compatible`;
    case "INVALID_VALUE": {
      const names = params.names ? `, o ${params.names}` : "";
      return `${label}el valor debe estar entre ${params.min} y ${params.max}${names}`;
    }
    case "INVALID_RANGE":
      return `${label}rango no válido '${params.token}' (el inicio no puede ser mayor que el final)`;
    case "INVALID_STEP": {
      const bound = params.max === undefined ? "" : ` (el incremento debe estar entre 1 y ${params.max})`;
      return `${label}incremento no válido '${params.token}'${bound}`;
    }
    case "UNSUPPORTED_SYNTAX":
      return `${label}'${params.token}' no es compatible con cron de ${DIALECTS[params.dialect] ?? params.dialect}`;
    case "INVALID_NTH":
      return "La ocurrencia después de '#' debe estar entre 1 y 5";
    case "SPECIAL_NOT_COMBINABLE":
      return `${label}'${params.token}' no se puede combinar con otros valores`;
    case "DAY_FIELDS_BOTH_SET":
      return "Quartz requiere '?' en el día del mes o en el día de la semana";
    case "DAY_FIELDS_BOTH_UNSET":
      return "'?' se puede usar en el día del mes o en el día de la semana, pero no en ambos";
  }
}

export const es: Locale = {
  code: "es",

  everySecond: () => "cada segundo",
  everyMinute: () => "cada minuto",
  everyHour: () => "cada hora",
  every: (unit, n) => `cada ${n} ${UNITS[unit][1]}`,
  startingAt: (unit, value) => {
    if (unit === "day") return `a partir del día ${value} del mes`;
    if (unit === "year") return `a partir de ${value}`;
    return `a partir del ${UNITS[unit][0]} ${value}`;
  },
  startingAtTime: (time) => `a partir de ${article(time)} ${time.text}`,

  atTimes: (times) =>
    times.length === 1
      ? `a ${article(times[0])} ${times[0].text}`
      : `a las ${list(times.map((time) => time.text))}`,
  atUnits: (unit, values) =>
    `en ${plural(values.length, "el", "los")} ${plural(values.length, ...UNITS[unit])} ${list(values.map(String))} ${OF_EACH[unit]}`,
  unitRange: (unit, start, end) => `del ${UNITS[unit][0]} ${start} al ${end} ${OF_EACH[unit]}`,
  betweenTimes: (start, end) => `entre ${article(start)} ${start.text} y ${article(end)} ${end.text}`,
  duringHours: (times) => `durante las horas ${list(times.map((time) => time.text))}`,

  onDaysOfMonth: (days) =>
    `${plural(days.length, "el día", "los días")} ${list(days.map(String))} del mes`,
  betweenDaysOfMonth: (start, end) => `entre los días ${start} y ${end} del mes`,
  lastDayOfMonth: (offset) =>
    offset === 0 ? "el último día del mes" : `${offset} ${plural(offset, "día")} antes del último día del mes`,
  lastWeekdayOfMonth: () => "el último día laborable del mes",
  nearestWeekdayTo: (day) => `el día laborable más cercano al día ${day} del mes`,

  onWeekdays: (names, exclusive) => `${exclusive ? "solo los" : "los"} ${list(names.map(weekdayPlural))}`,
  weekdayRange: (start, end) => `de ${start} a ${end}`,
  nthWeekday: (nth, name) => `el ${ORDINALS[nth]} ${name} del mes`,
  lastWeekday: (name) => `el último ${name} del mes`,

  inMonths: (names) => `solo en ${list(names)}`,
  monthRange: (start, end) => `de ${start} a ${end}`,

  inYears: (years) => `solo en ${list(years.map(String))}`,
  yearRange: (start, end) => `de ${start} a ${end}`,

  formatError,
};
