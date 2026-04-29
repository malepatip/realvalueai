import Decimal from "decimal.js";

// Configure Decimal.js for financial precision
Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding
  toExpNeg: -30,
  toExpPos: 30,
});

const DECIMAL_PLACES = 4; // Matches NUMERIC(19,4)

/**
 * Immutable wrapper around Decimal.js for safe financial arithmetic.
 * NEVER uses IEEE 754 floats internally.
 *
 * All operations return new Money instances.
 * Internal storage uses 4 decimal places matching PostgreSQL NUMERIC(19,4).
 */
export class Money {
  private readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = value.toDecimalPlaces(DECIMAL_PLACES, Decimal.ROUND_HALF_EVEN);
  }

  /**
   * Parse a decimal string into a Money instance.
   * Rejects NaN, Infinity, and non-numeric inputs.
   */
  static fromString(value: string): Money {
    if (typeof value !== "string") {
      throw new Error(`Money.fromString requires a string, got ${typeof value}`);
    }

    const trimmed = value.trim();
    if (trimmed === "") {
      throw new Error("Money.fromString received an empty string");
    }

    if (/^[+-]?infinity$/i.test(trimmed) || /^nan$/i.test(trimmed)) {
      throw new Error(`Money.fromString received invalid value: "${trimmed}"`);
    }

    let decimal: Decimal;
    try {
      decimal = new Decimal(trimmed);
    } catch {
      throw new Error(`Money.fromString received non-numeric value: "${trimmed}"`);
    }

    if (!decimal.isFinite()) {
      throw new Error(`Money.fromString received non-finite value: "${trimmed}"`);
    }

    return new Money(decimal);
  }

  /** Add another Money value. Returns a new Money instance. */
  add(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  /** Subtract another Money value. Returns a new Money instance. */
  subtract(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  /**
   * Multiply by a factor (for rates, percentages, quantities).
   * Accepts string or number — the factor is converted to Decimal internally.
   */
  multiply(factor: string | number): Money {
    const f = new Decimal(factor);
    if (!f.isFinite()) {
      throw new Error(`Money.multiply received non-finite factor: "${factor}"`);
    }
    return new Money(this.value.times(f));
  }

  /** Compare with another Money value. Returns -1, 0, or 1. */
  compare(other: Money): -1 | 0 | 1 {
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  isGreaterThan(other: Money): boolean {
    return this.value.greaterThan(other.value);
  }

  isLessThan(other: Money): boolean {
    return this.value.lessThan(other.value);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNeg() && !this.value.isZero();
  }

  /**
   * Locale-aware currency formatting (e.g., "$1,234.56").
   * Uses Intl.NumberFormat — the Decimal value is converted to string
   * and parsed only for display, never for computation.
   */
  format(locale: string = "en-US"): string {
    const formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Convert to number ONLY for display formatting — never for math
    return formatter.format(this.value.toNumber());
  }

  /**
   * Database-safe numeric string with exactly 4 decimal places.
   * Round-trip guarantee: Money.fromString(m.toNumericString()).toNumericString() === m.toNumericString()
   */
  toNumericString(): string {
    return this.value.toFixed(DECIMAL_PLACES);
  }

  /**
   * Apply a percentage buffer (e.g., 0.20 for 20%).
   * Used for overdraft safety buffer: multiply by (1 + bufferPercent).
   */
  applyBuffer(bufferPercent: number): Money {
    if (!Number.isFinite(bufferPercent)) {
      throw new Error(`Money.applyBuffer received non-finite bufferPercent: ${bufferPercent}`);
    }
    const multiplier = new Decimal(1).plus(new Decimal(bufferPercent));
    return new Money(this.value.times(multiplier));
  }
}
