import type { CronError, FieldName } from "../core/types.js";
import { formatList } from "../describe/intl.js";
import type { Locale, Nth } from "../describe/locale.js";

const list = (items: string[]) => formatList("fr", items);
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (count === 1 ? singular : pluralForm);
/** Day of month as written in French: "1er", "15". */
const day = (value: number) => (value === 1 ? "1er" : String(value));

const ORDINALS: Record<Nth, string> = { 1: "premier", 2: "deuxième", 3: "troisième", 4: "quatrième", 5: "cinquième" };
const EVERY: Record<"second" | "minute" | "hour" | "day" | "year", string> = {
  second: "toutes les {n} secondes",
  minute: "toutes les {n} minutes",
  hour: "toutes les {n} heures",
  day: "tous les {n} jours",
  year: "tous les {n} ans",
};
const UNIT: Record<"second" | "minute", [string, string]> = {
  second: ["seconde", "secondes"],
  minute: ["minute", "minutes"],
};
const OF_EACH: Record<"second" | "minute", string> = { second: "de chaque minute", minute: "de chaque heure" };

const FIELD_LABELS: Record<FieldName, string> = {
  second: "Secondes",
  minute: "Minutes",
  hour: "Heures",
  dayOfMonth: "Jour du mois",
  month: "Mois",
  dayOfWeek: "Jour de la semaine",
  year: "Année",
};
const DIALECTS: Record<string, string> = { quartz: "Quartz", unix: "Unix" };

function formatError({ code, field, params }: Pick<CronError, "code" | "field" | "params">): string {
  const label = field ? `${FIELD_LABELS[field]} : ` : "";
  switch (code) {
    case "EMPTY_EXPRESSION":
      return "L'expression cron est vide";
    case "WRONG_FIELD_COUNT": {
      const got = params.count === undefined ? "" : ` (reçu : ${params.count})`;
      if (params.dialect === "quartz") return `Les expressions cron Quartz doivent comporter 6 champs, ou 7 avec l'année${got}`;
      if (params.dialect === "unix") return `Les expressions cron Unix doivent comporter 5 champs${got}`;
      return `Les expressions cron doivent comporter 5 champs (Unix) ou 6 à 7 champs (Quartz)${got}`;
    }
    case "UNKNOWN_MACRO":
      return `Macro inconnue '${params.macro}'`;
    case "UNSUPPORTED_MACRO":
      return `'${params.macro}' s'exécute au démarrage, pas selon un horaire, et n'est pas pris en charge`;
    case "INVALID_VALUE": {
      const names = params.names ? `, ou ${params.names}` : "";
      return `${label}la valeur doit être comprise entre ${params.min} et ${params.max}${names}`;
    }
    case "INVALID_RANGE":
      return `${label}plage non valide '${params.token}' (le début ne peut pas dépasser la fin)`;
    case "INVALID_STEP": {
      const bound = params.max === undefined ? "" : ` (l'incrément doit être compris entre 1 et ${params.max})`;
      return `${label}pas non valide '${params.token}'${bound}`;
    }
    case "UNSUPPORTED_SYNTAX":
      return `${label}'${params.token}' n'est pas pris en charge en cron ${DIALECTS[params.dialect] ?? params.dialect}`;
    case "INVALID_NTH":
      return "L'occurrence après '#' doit être comprise entre 1 et 5";
    case "SPECIAL_NOT_COMBINABLE":
      return `${label}'${params.token}' ne peut pas être combiné avec d'autres valeurs`;
    case "DAY_FIELDS_BOTH_SET":
      return "Quartz exige '?' dans le jour du mois ou dans le jour de la semaine";
    case "DAY_FIELDS_BOTH_UNSET":
      return "'?' peut être utilisé dans le jour du mois ou dans le jour de la semaine, mais pas les deux";
  }
}

export const fr: Locale = {
  code: "fr",

  everySecond: () => "toutes les secondes",
  everyMinute: () => "toutes les minutes",
  everyHour: () => "toutes les heures",
  every: (unit, n) => EVERY[unit].replace("{n}", String(n)),
  startingAt: (unit, value) => {
    if (unit === "day") return `à partir du ${day(value)} du mois`;
    if (unit === "year") return `à partir de ${value}`;
    return `à partir de la ${UNIT[unit][0]} ${value}`;
  },
  startingAtTime: (time) => `à partir de ${time.text}`,

  atTimes: (times) => `à ${list(times.map((time) => time.text))}`,
  atUnits: (unit, values) =>
    `${plural(values.length, "à la", "aux")} ${plural(values.length, ...UNIT[unit])} ${list(values.map(String))} ${OF_EACH[unit]}`,
  unitRange: (unit, start, end) => `de la ${UNIT[unit][0]} ${start} à ${end} ${OF_EACH[unit]}`,
  betweenTimes: (start, end) => `entre ${start.text} et ${end.text}`,
  duringHours: (times) => `pendant les heures ${list(times.map((time) => time.text))}`,

  onDaysOfMonth: (days) => `${plural(days.length, "le", "les")} ${list(days.map(day))} du mois`,
  betweenDaysOfMonth: (start, end) => `du ${day(start)} au ${day(end)} du mois`,
  lastDayOfMonth: (offset) =>
    offset === 0 ? "le dernier jour du mois" : `${offset} ${plural(offset, "jour")} avant le dernier jour du mois`,
  lastWeekdayOfMonth: () => "le dernier jour ouvré du mois",
  nearestWeekdayTo: (value) => `le jour ouvré le plus proche du ${day(value)} du mois`,

  onWeekdays: (names, exclusive) => `${exclusive ? "uniquement " : ""}${list(names.map((name) => `le ${name}`))}`,
  weekdayRange: (start, end) => `du ${start} au ${end}`,
  nthWeekday: (nth, name) => `le ${ORDINALS[nth]} ${name} du mois`,
  lastWeekday: (name) => `le dernier ${name} du mois`,

  inMonths: (names) => `uniquement en ${list(names)}`,
  monthRange: (start, end) => `de ${start} à ${end}`,

  inYears: (years) => `uniquement en ${list(years.map(String))}`,
  yearRange: (start, end) => `de ${start} à ${end}`,

  formatError,
};
