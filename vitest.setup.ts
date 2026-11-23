// Node 26+ ships Temporal natively; older runtimes (e.g. Node 24) get the
// polyfill for tests only. The library itself never imports a polyfill.
if (typeof globalThis.Temporal === "undefined") {
  await import("temporal-polyfill/global");
}

export {};
