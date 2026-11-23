import { describe as group, expect, it } from "vitest";
import { describe, formatError } from "./describe";
import { validate } from "./index";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";

/** ICU separates "9:30 AM" with a narrow no-break space; compare with plain spaces. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

// [expression, en, es, fr]
const CASES: [string, string, string, string][] = [
  ["* * * * *", "Every minute", "Cada minuto", "Toutes les minutes"],
  ["* * * * * ?", "Every second", "Cada segundo", "Toutes les secondes"],
  ["0 * * * * ?", "Every minute", "Cada minuto", "Toutes les minutes"],
  ["0 0 * * * ?", "Every hour", "Cada hora", "Toutes les heures"],
  ["0 */5 * * * ?", "Every 5 minutes", "Cada 5 minutos", "Toutes les 5 minutes"],
  ["0 */1 * * * ?", "Every minute", "Cada minuto", "Toutes les minutes"],
  [
    "*/15 9-17 * * MON-FRI",
    "Every 15 minutes, between 9:00 AM and 5:59 PM, Monday through Friday",
    "Cada 15 minutos, entre las 09:00 y las 17:59, de lunes a viernes",
    "Toutes les 15 minutes, entre 09:00 et 17:59, du lundi au vendredi",
  ],
  ["0 30 9 * * ?", "At 9:30 AM", "A las 09:30", "À 09:30"],
  ["0 30 1 * * ?", "At 1:30 AM", "A la 01:30", "À 01:30"],
  ["30 0 9 * * ?", "At 9:00:30 AM", "A las 09:00:30", "À 09:00:30"],
  ["30 9 * * 1-5", "At 9:30 AM, Monday through Friday", "A las 09:30, de lunes a viernes", "À 09:30, du lundi au vendredi"],
  ["0 0 9,17 * * ?", "At 9:00 AM and 5:00 PM", "A las 09:00 y 17:00", "À 09:00 et 17:00"],
  ["0 0 */2 * * ?", "Every 2 hours", "Cada 2 horas", "Toutes les 2 heures"],
  [
    "0 0 6/2 * * ?",
    "Every 2 hours, starting at 6:00 AM",
    "Cada 2 horas, a partir de las 06:00",
    "Toutes les 2 heures, à partir de 06:00",
  ],
  [
    "0 0 9-17 * * ?",
    "Every hour, between 9:00 AM and 5:59 PM",
    "Cada hora, entre las 09:00 y las 17:59",
    "Toutes les heures, entre 09:00 et 17:59",
  ],
  [
    "0 */10 9 * * ?",
    "Every 10 minutes, between 9:00 AM and 9:59 AM",
    "Cada 10 minutos, entre las 09:00 y las 09:59",
    "Toutes les 10 minutes, entre 09:00 et 09:59",
  ],
  ["0 30 * * * ?", "At minute 30 past the hour", "En el minuto 30 de cada hora", "À la minute 30 de chaque heure"],
  [
    "0 0,30 * * * ?",
    "At minutes 0 and 30 past the hour",
    "En los minutos 0 y 30 de cada hora",
    "Aux minutes 0 et 30 de chaque heure",
  ],
  [
    "0 10/5 * * * ?",
    "Every 5 minutes, starting at minute 10",
    "Cada 5 minutos, a partir del minuto 10",
    "Toutes les 5 minutes, à partir de la minute 10",
  ],
  [
    "0 10-20 * * * ?",
    "Minutes 10 through 20 past the hour",
    "Del minuto 10 al 20 de cada hora",
    "De la minute 10 à 20 de chaque heure",
  ],
  [
    "0 0 0 L * ?",
    "At 12:00 AM, on the last day of the month",
    "A las 00:00, el último día del mes",
    "À 00:00, le dernier jour du mois",
  ],
  [
    "0 0 0 L-3 * ?",
    "At 12:00 AM, 3 days before the last day of the month",
    "A las 00:00, 3 días antes del último día del mes",
    "À 00:00, 3 jours avant le dernier jour du mois",
  ],
  [
    "0 0 0 LW * ?",
    "At 12:00 AM, on the last weekday of the month",
    "A las 00:00, el último día laborable del mes",
    "À 00:00, le dernier jour ouvré du mois",
  ],
  [
    "0 0 0 15W * ?",
    "At 12:00 AM, on the weekday nearest day 15 of the month",
    "A las 00:00, el día laborable más cercano al día 15 del mes",
    "À 00:00, le jour ouvré le plus proche du 15 du mois",
  ],
  [
    "0 0 12 ? * 6#3",
    "At 12:00 PM, on the third Friday of the month",
    "A las 12:00, el tercer viernes del mes",
    "À 12:00, le troisième vendredi du mois",
  ],
  [
    "0 0 12 ? * 6L",
    "At 12:00 PM, on the last Friday of the month",
    "A las 12:00, el último viernes del mes",
    "À 12:00, le dernier vendredi du mois",
  ],
  [
    "0 0 0 1,15 * ?",
    "At 12:00 AM, on days 1 and 15 of the month",
    "A las 00:00, los días 1 y 15 del mes",
    "À 00:00, les 1er et 15 du mois",
  ],
  [
    "0 0 0 */2 * ?",
    "At 12:00 AM, every 2 days",
    "A las 00:00, cada 2 días",
    "À 00:00, tous les 2 jours",
  ],
  [
    "0 0 0 5/10 * ?",
    "At 12:00 AM, every 10 days, starting on day 5 of the month",
    "A las 00:00, cada 10 días, a partir del día 5 del mes",
    "À 00:00, tous les 10 jours, à partir du 5 du mois",
  ],
  [
    "0 0 0 1-10 * ?",
    "At 12:00 AM, between day 1 and 10 of the month",
    "A las 00:00, entre los días 1 y 10 del mes",
    "À 00:00, du 1er au 10 du mois",
  ],
  [
    "0 0 1 * MON",
    "At 12:00 AM, on day 1 of the month or on Monday",
    "A las 00:00, el día 1 del mes o los lunes",
    "À 00:00, le 1er du mois ou le lundi",
  ],
  [
    "0 0 */2 * MON",
    "At 12:00 AM, every 2 days, only on Monday",
    "A las 00:00, cada 2 días, solo los lunes",
    "À 00:00, tous les 2 jours, uniquement le lundi",
  ],
  [
    "0 0 12 ? * MON,WED,FRI",
    "At 12:00 PM, only on Monday, Wednesday, and Friday",
    "A las 12:00, solo los lunes, miércoles y viernes",
    "À 12:00, uniquement le lundi, le mercredi et le vendredi",
  ],
  [
    "0 0 12 ? * SAT,SUN",
    "At 12:00 PM, only on Sunday and Saturday",
    "A las 12:00, solo los domingos y sábados",
    "À 12:00, uniquement le dimanche et le samedi",
  ],
  [
    "0 0 0 1 1,7 ?",
    "At 12:00 AM, on day 1 of the month, only in January and July",
    "A las 00:00, el día 1 del mes, solo en enero y julio",
    "À 00:00, le 1er du mois, uniquement en janvier et juillet",
  ],
  [
    "0 0 0 ? JAN-MAR MON",
    "At 12:00 AM, only on Monday, January through March",
    "A las 00:00, solo los lunes, de enero a marzo",
    "À 00:00, uniquement le lundi, de janvier à mars",
  ],
  [
    "0 15 10 ? * MON-FRI 2025-2030",
    "At 10:15 AM, Monday through Friday, 2025 through 2030",
    "A las 10:15, de lunes a viernes, de 2025 a 2030",
    "À 10:15, du lundi au vendredi, de 2025 à 2030",
  ],
  [
    "0 0 0 1 1 ? 2025/2",
    "At 12:00 AM, on day 1 of the month, only in January, every 2 years, starting in 2025",
    "A las 00:00, el día 1 del mes, solo en enero, cada 2 años, a partir de 2025",
    "À 00:00, le 1er du mois, uniquement en janvier, tous les 2 ans, à partir de 2025",
  ],
  ["@daily", "At 12:00 AM", "A las 00:00", "À 00:00"],
];

group("describe", () => {
  it.each(CASES)("%s", (expression, english, spanish, french) => {
    expect(plain(describe(expression))).toBe(english);
    expect(plain(describe(expression, { locale: en }))).toBe(english);
    expect(plain(describe(expression, { locale: es }))).toBe(spanish);
    expect(plain(describe(expression, { locale: fr }))).toBe(french);
  });

  it("honors an explicit hourCycle", () => {
    expect(describe("0 30 9 * * ?", { hourCycle: "h23" })).toBe("At 09:30");
    expect(plain(describe("0 30 21 * * ?", { locale: es, hourCycle: "h12" }))).toMatch(/^A las 9:30 p\. ?m\.$/);
  });

  it("accepts a parsed Cron and an explicit dialect", () => {
    expect(plain(describe("0 0 * * *", { dialect: "unix" }))).toBe("At 12:00 AM");
  });
});

group("formatError", () => {
  const [error] = validate("60 0 12 * * ?").errors;
  const [dayRule] = validate("0 0 12 * * MON").errors;

  it("defaults to the English message", () => {
    expect(formatError(error)).toBe("Seconds must be between 0 and 59");
    expect(formatError(error, { locale: en })).toBe(error.message);
  });

  it("translates to Spanish and French", () => {
    expect(formatError(error, { locale: es })).toBe("Segundos: el valor debe estar entre 0 y 59");
    expect(formatError(error, { locale: fr })).toBe("Secondes : la valeur doit être comprise entre 0 et 59");
    expect(formatError(dayRule, { locale: es })).toBe(
      "Quartz requiere '?' en el día del mes o en el día de la semana"
    );
    expect(formatError(dayRule, { locale: fr })).toBe(
      "Quartz exige '?' dans le jour du mois ou dans le jour de la semaine"
    );
  });

  it("has a message for every error code in every locale", () => {
    const samples = [
      "",
      "1 2 3",
      "@nope",
      "@reboot",
      "0 0 0 ? * 9",
      "0 50-10 0 * * ?",
      "0 0/99 0 * * ?",
      "0 0 0 L * *",
      "0 0 0 ? * 1#7",
      "0 0 0 L,1 * ?",
      "0 0 0 * * MON",
      "0 0 0 ? * ?",
      "0 0 L * *",
    ];
    const errors = samples.flatMap((sample) => validate(sample).errors);
    const codes = new Set(errors.map((e) => e.code));
    expect(codes.size).toBe(12);
    for (const locale of [en, es, fr]) {
      for (const err of errors) {
        const text = formatError(err, { locale });
        expect(text, `${locale.code} ${err.code}`).not.toMatch(/undefined|\{/);
        expect(text.length).toBeGreaterThan(10);
      }
    }
  });
});
