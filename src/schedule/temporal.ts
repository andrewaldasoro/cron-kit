/** Thrown by `cron-toolkit/schedule` when the runtime has no `Temporal` global. */
export class TemporalUnavailableError extends Error {
  override name = "TemporalUnavailableError";

  constructor() {
    super(
      "Temporal is not available in this runtime (e.g. Safari, or Node < 26). " +
        'Load a polyfill before using cron-toolkit/schedule, e.g. `import "temporal-polyfill/global"`.'
    );
  }
}

export type TemporalNamespace = typeof Temporal;

export function getTemporal(): TemporalNamespace {
  const temporal = (globalThis as { Temporal?: TemporalNamespace }).Temporal;
  if (!temporal) throw new TemporalUnavailableError();
  return temporal;
}
