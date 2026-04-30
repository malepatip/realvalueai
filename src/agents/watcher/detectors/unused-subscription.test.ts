import { describe, it, expect } from "vitest";
import {
  detectUnusedSubscriptions,
  monthlyEquivalent,
  UNUSED_THRESHOLD_DAYS,
} from "./unused-subscription";
import { Money } from "@/lib/math/decimal";
import type { RecurringCharge, RecurringFrequency } from "@/types/watcher";

function charge(overrides: Partial<RecurringCharge>): RecurringCharge {
  return {
    id: "charge-1",
    merchantName: "Acme",
    amount: "10.00",
    frequency: "monthly",
    status: "active",
    isTrial: false,
    daysSinceUsage: 60,
    ...overrides,
  };
}

describe("monthlyEquivalent", () => {
  it("monthly stays the same", () => {
    expect(
      monthlyEquivalent(Money.fromString("9.99"), "monthly").toNumericString(),
    ).toBe("9.9900");
  });

  it("annual becomes ~1/12", () => {
    // $120/year → $9.9996/month (rounding artifact of the 0.08333 multiplier)
    const result = monthlyEquivalent(Money.fromString("120.00"), "annual");
    // exact: 120 * 0.08333 = 9.9996
    expect(result.toNumericString()).toBe("9.9996");
  });

  it("weekly becomes ~4.345x", () => {
    // $5/week → $21.7262/month
    const result = monthlyEquivalent(Money.fromString("5.00"), "weekly");
    expect(result.toNumericString()).toBe("21.7262");
  });

  it("never produces NaN or Infinity for any frequency", () => {
    const freqs: RecurringFrequency[] = [
      "weekly",
      "biweekly",
      "monthly",
      "quarterly",
      "annual",
    ];
    for (const f of freqs) {
      const r = monthlyEquivalent(Money.fromString("1.00"), f);
      expect(r.toNumericString()).toMatch(/^\d+\.\d{4}$/);
    }
  });
});

describe("detectUnusedSubscriptions", () => {
  const today = "2026-04-30T12:00:00.000Z";

  it("returns nothing for an empty input", () => {
    expect(detectUnusedSubscriptions([], today)).toEqual([]);
  });

  it("flags a monthly charge unused for 50 days", () => {
    const result = detectUnusedSubscriptions(
      [charge({ merchantName: "Hulu", amount: "17.99", daysSinceUsage: 50 })],
      today,
    );
    expect(result).toHaveLength(1);
    const i = result[0]!;
    expect(i.type).toBe("unused_subscription");
    expect(i.merchantName).toBe("Hulu");
    expect(i.urgency).toBe("batched");
    expect(i.detectedAt).toBe(today);
    expect(i.description).toContain("Hulu");
    expect(i.description).toContain("50 days");
    expect(i.metadata["chargeId"]).toBe("charge-1");
    expect(i.metadata["daysSinceUsage"]).toBe(50);
    expect(i.metadata["frequency"]).toBe("monthly");
  });

  it("does NOT flag a charge below the 45-day threshold", () => {
    const result = detectUnusedSubscriptions(
      [charge({ daysSinceUsage: UNUSED_THRESHOLD_DAYS - 1 })],
      today,
    );
    expect(result).toEqual([]);
  });

  it("flags exactly at the 45-day threshold (boundary inclusive)", () => {
    const result = detectUnusedSubscriptions(
      [charge({ daysSinceUsage: UNUSED_THRESHOLD_DAYS })],
      today,
    );
    expect(result).toHaveLength(1);
  });

  it("flags both 'active' and 'unused' status charges; ignores cancelled / paused", () => {
    // The recurring-detector auto-flips status to "unused" when last
    // charge was >45 days ago — that's the signal we want to surface
    // until separate usage-event tracking lands. Both statuses count.
    const charges: RecurringCharge[] = [
      charge({ id: "c1", status: "cancelled", daysSinceUsage: 90 }),
      charge({ id: "c2", status: "paused", daysSinceUsage: 90 }),
      charge({ id: "c3", status: "unused", daysSinceUsage: 90 }),
      charge({ id: "c4", status: "active", daysSinceUsage: 90 }),
    ];
    const result = detectUnusedSubscriptions(charges, today);
    expect(result).toHaveLength(2);
    const ids = result.map((i) => i.metadata["chargeId"]);
    expect(ids).toContain("c3");
    expect(ids).toContain("c4");
  });

  it("ignores charges with daysSinceUsage missing", () => {
    const c = charge({ daysSinceUsage: undefined });
    const result = detectUnusedSubscriptions([c], today);
    expect(result).toEqual([]);
  });

  it("ignores zero or negative amounts (defensive)", () => {
    const result = detectUnusedSubscriptions(
      [
        charge({ id: "z", amount: "0.00" }),
        charge({ id: "neg", amount: "-5.00" }),
      ],
      today,
    );
    expect(result).toEqual([]);
  });

  it("sorts results by monthly cost descending — biggest waste first", () => {
    const charges: RecurringCharge[] = [
      charge({ id: "small", merchantName: "Tiny", amount: "2.99" }),
      charge({ id: "big", merchantName: "Huge", amount: "49.99" }),
      charge({ id: "mid", merchantName: "Mid", amount: "9.99" }),
    ];
    const result = detectUnusedSubscriptions(charges, today);
    expect(result.map((i) => i.merchantName)).toEqual(["Huge", "Mid", "Tiny"]);
  });

  it("computes monthly equivalent for an annual subscription", () => {
    const c = charge({
      merchantName: "AnnualCo",
      amount: "120.00",
      frequency: "annual",
      daysSinceUsage: 90,
    });
    const result = detectUnusedSubscriptions([c], today);
    expect(result).toHaveLength(1);
    // 120 * 0.08333 = 9.9996
    expect(result[0]!.amount).toBe("9.9996");
    expect(result[0]!.metadata["monthlyEquivalent"]).toBe("9.9996");
  });

  it("preserves the original charge amount in metadata", () => {
    const c = charge({ amount: "59.99", frequency: "annual", daysSinceUsage: 60 });
    const result = detectUnusedSubscriptions([c], today);
    expect(result[0]!.metadata["chargeAmount"]).toBe("59.99");
  });

  it("includes optional lastUsageDate / lastChargedDate when present", () => {
    const c = charge({
      lastUsageDate: "2026-02-10",
      lastChargedDate: "2026-04-15",
    });
    const result = detectUnusedSubscriptions([c], today);
    expect(result[0]!.metadata["lastUsageDate"]).toBe("2026-02-10");
    expect(result[0]!.metadata["lastChargedDate"]).toBe("2026-04-15");
  });

  it("uses current ISO datetime as detectedAt when none provided", () => {
    const before = new Date().toISOString();
    const result = detectUnusedSubscriptions([charge({})]);
    const after = new Date().toISOString();
    expect(result).toHaveLength(1);
    expect(result[0]!.detectedAt >= before).toBe(true);
    expect(result[0]!.detectedAt <= after).toBe(true);
  });
});
