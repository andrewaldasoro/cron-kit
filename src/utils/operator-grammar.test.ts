import { describe, expect, it } from "vitest";
import { isWithinBoundaries, parseOperatorExpression, type FieldGrammar } from "./operator-grammar";
import { parseCronInt } from "./parse-cron-int";

const numericGrammar: FieldGrammar = {
  bounds: [0, 9],
  parseAtom: parseCronInt,
};

const NAMES = ["a", "b", "c"];
const namedGrammar: FieldGrammar = {
  bounds: [1, 3],
  parseAtom: (token) => {
    const index = NAMES.indexOf(token.toLowerCase());
    return index === -1 ? parseCronInt(token) : index + 1;
  },
};

describe("isWithinBoundaries", () => {
  it("accepts values inside the boundaries, inclusive", () => {
    expect(isWithinBoundaries(0, [0, 9])).toBe(true);
    expect(isWithinBoundaries(9, [0, 9])).toBe(true);
  });

  it("rejects values outside the boundaries", () => {
    expect(isWithinBoundaries(-1, [0, 9])).toBe(false);
    expect(isWithinBoundaries(10, [0, 9])).toBe(false);
  });

  it("rejects NaN", () => {
    expect(isWithinBoundaries(NaN, [0, 9])).toBe(false);
  });
});

describe("parseOperatorExpression", () => {
  it("parses the wildcard as 'any'", () => {
    expect(parseOperatorExpression("*", numericGrammar)).toEqual({ ok: true, expr: { kind: "any" } });
  });

  it("parses a plain value", () => {
    expect(parseOperatorExpression("5", numericGrammar)).toEqual({
      ok: true,
      expr: { kind: "list", items: [{ kind: "value", value: 5 }] },
    });
  });

  it("rejects an out-of-bounds value", () => {
    expect(parseOperatorExpression("15", numericGrammar)).toEqual({
      ok: false,
      issue: { code: "INVALID_VALUE", token: "15" },
    });
  });

  it("resolves names through parseAtom", () => {
    expect(parseOperatorExpression("B", namedGrammar)).toEqual({
      ok: true,
      expr: { kind: "list", items: [{ kind: "value", value: 2 }] },
    });
  });

  describe("lists", () => {
    it("parses every item of a list", () => {
      expect(parseOperatorExpression("1,3-5,0/2", numericGrammar)).toEqual({
        ok: true,
        expr: {
          kind: "list",
          items: [
            { kind: "value", value: 1 },
            { kind: "range", start: 3, end: 5 },
            { kind: "step", start: 0, step: 2 },
          ],
        },
      });
    });

    it("rejects a list with any invalid item", () => {
      expect(parseOperatorExpression("1,2,15", numericGrammar).ok).toBe(false);
    });

    it("rejects an empty list item", () => {
      expect(parseOperatorExpression("1,,2", numericGrammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_VALUE", token: "" },
      });
    });

    it("rejects '*' inside a list", () => {
      expect(parseOperatorExpression("*,2", numericGrammar).ok).toBe(false);
    });
  });

  describe("ranges", () => {
    it("parses an ascending range", () => {
      expect(parseOperatorExpression("2-5", numericGrammar)).toEqual({
        ok: true,
        expr: { kind: "list", items: [{ kind: "range", start: 2, end: 5 }] },
      });
    });

    it("accepts a single-value range (start equals end)", () => {
      expect(parseOperatorExpression("5-5", numericGrammar).ok).toBe(true);
    });

    it("rejects a descending range", () => {
      expect(parseOperatorExpression("5-2", numericGrammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_RANGE", token: "5-2" },
      });
    });

    it("rejects a range with more than two parts", () => {
      expect(parseOperatorExpression("1-2-3", numericGrammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_RANGE", token: "1-2-3" },
      });
    });

    it("rejects a range with an invalid side", () => {
      expect(parseOperatorExpression("1-15", numericGrammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_VALUE", token: "15" },
      });
    });

    it("rejects a negative number (parsed as a range with an empty start)", () => {
      expect(parseOperatorExpression("-1", numericGrammar).ok).toBe(false);
    });

    it("orders named ranges by their resolved value", () => {
      expect(parseOperatorExpression("a-c", namedGrammar).ok).toBe(true);
      expect(parseOperatorExpression("c-a", namedGrammar).ok).toBe(false);
    });
  });

  describe("steps", () => {
    it("parses a step from a start value", () => {
      expect(parseOperatorExpression("1/2", numericGrammar)).toEqual({
        ok: true,
        expr: { kind: "list", items: [{ kind: "step", start: 1, step: 2 }] },
      });
    });

    it("parses '*' as the step start", () => {
      expect(parseOperatorExpression("*/2", numericGrammar)).toEqual({
        ok: true,
        expr: { kind: "list", items: [{ kind: "step", start: "any", step: 2 }] },
      });
    });

    it("accepts a start greater than or equal to the increment (Quartz: 10/5 = 10,15,...)", () => {
      expect(parseOperatorExpression("5/5", numericGrammar).ok).toBe(true);
      expect(parseOperatorExpression("6/5", numericGrammar).ok).toBe(true);
    });

    it("parses a stepped range", () => {
      expect(parseOperatorExpression("2-8/3", numericGrammar)).toEqual({
        ok: true,
        expr: { kind: "list", items: [{ kind: "range", start: 2, end: 8, step: 3 }] },
      });
    });

    it("rejects a step with more than two parts", () => {
      expect(parseOperatorExpression("1/2/3", numericGrammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_STEP", token: "1/2/3" },
      });
    });

    it("rejects a zero or non-numeric increment", () => {
      expect(parseOperatorExpression("1/0", numericGrammar).ok).toBe(false);
      expect(parseOperatorExpression("1/x", numericGrammar).ok).toBe(false);
    });

    it("rejects an increment above maxStep when one is set", () => {
      const grammar: FieldGrammar = { ...numericGrammar, maxStep: 9 };
      expect(parseOperatorExpression("0/9", grammar).ok).toBe(true);
      expect(parseOperatorExpression("0/10", grammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_STEP", token: "0/10" },
      });
    });

    it("accepts any positive increment when maxStep is not set", () => {
      expect(parseOperatorExpression("0/100", numericGrammar).ok).toBe(true);
    });

    it("rejects a named step start when allowNamedStepStart is false", () => {
      const grammar: FieldGrammar = { ...namedGrammar, allowNamedStepStart: false };
      expect(parseOperatorExpression("a/2", grammar)).toEqual({
        ok: false,
        issue: { code: "INVALID_STEP", token: "a/2" },
      });
      expect(parseOperatorExpression("1/2", grammar).ok).toBe(true);
    });
  });
});
