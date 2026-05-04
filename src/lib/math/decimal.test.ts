import { describe, it, expect } from "vitest";
import { Money } from "./decimal";

describe("Money", () => {
  describe("fromString", () => {
    it("parses valid decimal strings", () => {
      expect(Money.fromString("100").toNumericString()).toBe("100.0000");
      expect(Money.fromString("99.99").toNumericString()).toBe("99.9900");
      expect(Money.fromString("0.1234").toNumericString()).toBe("0.1234");
      expect(Money.fromString("-50.25").toNumericString()).toBe("-50.2500");
    });

    it("trims whitespace", () => {
      expect(Money.fromString("  42.50  ").toNumericString()).toBe("42.5000");
    });

    it("rounds to 4 decimal places", () => {
      expect(Money.fromString("1.23456789").toNumericString()).toBe("1.2346");
    });

    it("rejects NaN", () => {
      expect(() => Money.fromString("NaN")).toThrow("invalid value");
    });

    it("rejects Infinity", () => {
      expect(() => Money.fromString("Infinity")).toThrow("invalid value");
      expect(() => Money.fromString("-Infinity")).toThrow("invalid value");
    });

    it("rejects non-numeric strings", () => {
      expect(() => Money.fromString("abc")).toThrow("non-numeric");
      expect(() => Money.fromString("$100")).toThrow("non-numeric");
      expect(() => Money.fromString("12.34.56")).toThrow("non-numeric");
    });

    it("rejects empty string", () => {
      expect(() => Money.fromString("")).toThrow("empty string");
    });
  });

  describe("arithmetic precision", () => {
    it("0.1 + 0.2 === 0.3 (no floating point drift)", () => {
      const a = Money.fromString("0.1");
      const b = Money.fromString("0.2");
      expect(a.add(b).toNumericString()).toBe("0.3000");
    });

    it("adds correctly", () => {
      const a = Money.fromString("1234.56");
      const b = Money.fromString("789.44");
      expect(a.add(b).toNumericString()).toBe("2024.0000");
    });

    it("subtracts correctly", () => {
      const a = Money.fromString("100.00");
      const b = Money.fromString("33.33");
      expect(a.subtract(b).toNumericString()).toBe("66.6700");
    });

    it("multiplies correctly with string factor", () => {
      const m = Money.fromString("50.00");
      expect(m.multiply("3").toNumericString()).toBe("150.0000");
    });

    it("multiplies correctly with number factor", () => {
      const m = Money.fromString("10.00");
      expect(m.multiply(0.5).toNumericString()).toBe("5.0000");
    });

    it("rejects non-finite multiply factor", () => {
      const m = Money.fromString("10.00");
      expect(() => m.multiply(Infinity)).toThrow("non-finite factor");
      expect(() => m.multiply(NaN)).toThrow("non-finite factor");
    });
  });

  describe("round-trip consistency", () => {
    it("round-trips through toNumericString and fromString", () => {
      const values = ["0.0000", "100.0000", "-50.2500", "999999999.9999", "0.0001"];
      for (const v of values) {
        const m = Money.fromString(v);
        expect(Money.fromString(m.toNumericString()).toNumericString()).toBe(v);
      }
    });

    it("round-trips arbitrary values", () => {
      const m = Money.fromString("1234.5600");
      expect(Money.fromString(m.toNumericString()).toNumericString()).toBe("1234.5600");
    });
  });

  describe("buffer calculation", () => {
    it("applies 20% buffer on $100 = $120", () => {
      const m = Money.fromString("100.00");
      expect(m.applyBuffer(0.20).toNumericString()).toBe("120.0000");
    });

    it("applies 0% buffer (no change)", () => {
      const m = Money.fromString("50.00");
      expect(m.applyBuffer(0).toNumericString()).toBe("50.0000");
    });

    it("applies buffer to negative amounts", () => {
      const m = Money.fromString("-100.00");
      expect(m.applyBuffer(0.20).toNumericString()).toBe("-120.0000");
    });

    it("rejects non-finite buffer percent", () => {
      const m = Money.fromString("100.00");
      expect(() => m.applyBuffer(Infinity)).toThrow("non-finite");
      expect(() => m.applyBuffer(NaN)).toThrow("non-finite");
    });
  });

  describe("comparison operators", () => {
    it("compare returns -1, 0, or 1", () => {
      const a = Money.fromString("10.00");
      const b = Money.fromString("20.00");
      const c = Money.fromString("10.00");
      expect(a.compare(b)).toBe(-1);
      expect(b.compare(a)).toBe(1);
      expect(a.compare(c)).toBe(0);
    });

    it("isGreaterThan works", () => {
      expect(Money.fromString("20").isGreaterThan(Money.fromString("10"))).toBe(true);
      expect(Money.fromString("10").isGreaterThan(Money.fromString("20"))).toBe(false);
      expect(Money.fromString("10").isGreaterThan(Money.fromString("10"))).toBe(false);
    });

    it("isLessThan works", () => {
      expect(Money.fromString("5").isLessThan(Money.fromString("10"))).toBe(true);
      expect(Money.fromString("10").isLessThan(Money.fromString("5"))).toBe(false);
      expect(Money.fromString("10").isLessThan(Money.fromString("10"))).toBe(false);
    });

    it("isZero works", () => {
      expect(Money.fromString("0").isZero()).toBe(true);
      expect(Money.fromString("0.0000").isZero()).toBe(true);
      expect(Money.fromString("0.01").isZero()).toBe(false);
    });

    it("isNegative works", () => {
      expect(Money.fromString("-1").isNegative()).toBe(true);
      expect(Money.fromString("0").isNegative()).toBe(false);
      expect(Money.fromString("1").isNegative()).toBe(false);
    });

    it("abs() strips sign", () => {
      expect(Money.fromString("-300.00").abs().toNumericString()).toBe("300.0000");
      expect(Money.fromString("300.00").abs().toNumericString()).toBe("300.0000");
      expect(Money.fromString("0").abs().toNumericString()).toBe("0.0000");
    });

    it("abs() does not mutate original", () => {
      const m = Money.fromString("-50.00");
      m.abs();
      expect(m.toNumericString()).toBe("-50.0000");
      expect(m.isNegative()).toBe(true);
    });
  });

  describe("locale formatting", () => {
    it("formats as USD by default", () => {
      const m = Money.fromString("1234.56");
      expect(m.format()).toBe("$1,234.56");
    });

    it("formats zero", () => {
      expect(Money.fromString("0").format()).toBe("$0.00");
    });

    it("formats negative amounts", () => {
      const formatted = Money.fromString("-42.50").format();
      expect(formatted).toContain("42.50");
    });

    it("formats large numbers with commas", () => {
      expect(Money.fromString("1000000").format()).toBe("$1,000,000.00");
    });
  });

  describe("immutability", () => {
    it("add does not mutate original", () => {
      const a = Money.fromString("100.00");
      const b = Money.fromString("50.00");
      const result = a.add(b);
      expect(a.toNumericString()).toBe("100.0000");
      expect(b.toNumericString()).toBe("50.0000");
      expect(result.toNumericString()).toBe("150.0000");
    });

    it("subtract does not mutate original", () => {
      const a = Money.fromString("100.00");
      const b = Money.fromString("30.00");
      a.subtract(b);
      expect(a.toNumericString()).toBe("100.0000");
    });

    it("multiply does not mutate original", () => {
      const a = Money.fromString("100.00");
      a.multiply(5);
      expect(a.toNumericString()).toBe("100.0000");
    });

    it("applyBuffer does not mutate original", () => {
      const a = Money.fromString("100.00");
      a.applyBuffer(0.20);
      expect(a.toNumericString()).toBe("100.0000");
    });
  });

  describe("edge cases", () => {
    it("handles zero", () => {
      const z = Money.fromString("0");
      expect(z.toNumericString()).toBe("0.0000");
      expect(z.isZero()).toBe(true);
      expect(z.isNegative()).toBe(false);
    });

    it("handles very large numbers", () => {
      const big = Money.fromString("999999999999999");
      expect(big.toNumericString()).toBe("999999999999999.0000");
      expect(big.add(Money.fromString("1")).toNumericString()).toBe("1000000000000000.0000");
    });

    it("handles very small positive amounts", () => {
      const tiny = Money.fromString("0.0001");
      expect(tiny.toNumericString()).toBe("0.0001");
      expect(tiny.isZero()).toBe(false);
      expect(tiny.isNegative()).toBe(false);
    });

    it("handles negative amounts", () => {
      const neg = Money.fromString("-999.99");
      expect(neg.isNegative()).toBe(true);
      expect(neg.isZero()).toBe(false);
      expect(neg.add(Money.fromString("999.99")).isZero()).toBe(true);
    });
  });
});
