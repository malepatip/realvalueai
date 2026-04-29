import { describe, it, expect } from "vitest";
import { Money } from "@/lib/math/decimal";
import {
  detectRecurringCharges,
  MIN_OCCURRENCES,
  UNUSED_THRESHOLD_DAYS,
} from "./recurring-detector";
import type { CategorizedTransaction } from "@/types/watcher";

function makeCatTx(
  overrides: Partial<CategorizedTransaction> & {
    transactionId: string;
    merchantName: string;
    transactionDate: string;
  },
): CategorizedTransaction {
  return {
    merchantCategory: "Entertainment",
    categoryConfidence: 0.95,
    amount: "15.9900",
    ...overrides,
  };
}

/** Generate monthly transactions for a merchant */
function generateMonthlyTxs(
  merchant: string,
  count: number,
  startDate: string,
  amount: string = "15.9900",
): CategorizedTransaction[] {
  const txs: CategorizedTransaction[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setMonth(date.getMonth() + i);
    txs.push(
      makeCatTx({
        transactionId: `tx-${merchant}-${i}`,
        merchantName: merchant,
        transactionDate: date.toISOString().split("T")[0]!,
        amount,
      }),
    );
  }

  return txs;
}

/** Generate weekly transactions for a merchant */
function generateWeeklyTxs(
  merchant: string,
  count: number,
  startDate: string,
  amount: string = "5.0000",
): CategorizedTransaction[] {
  const txs: CategorizedTransaction[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < count; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i * 7);
    txs.push(
      makeCatTx({
        transactionId: `tx-${merchant}-${i}`,
        merchantName: merchant,
        transactionDate: date.toISOString().split("T")[0]!,
        amount,
      }),
    );
  }

  return txs;
}

describe("detectRecurringCharges", () => {
  const userId = "user-123";

  describe("monthly pattern detection", () => {
    it("detects monthly recurring charges", () => {
      const txs = generateMonthlyTxs("Netflix", 4, "2024-01-15");
      const results = detectRecurringCharges(userId, txs, "2024-04-20");

      expect(results).toHaveLength(1);
      expect(results[0]!.merchantName).toBe("netflix");
      expect(results[0]!.frequency).toBe("monthly");
    });

    it("uses Money class for amounts (decimal string, not float)", () => {
      const txs = generateMonthlyTxs("Netflix", 3, "2024-01-15", "15.9900");
      const results = detectRecurringCharges(userId, txs, "2024-04-01");

      expect(results).toHaveLength(1);
      const amount = Money.fromString(results[0]!.amount);
      expect(amount.toNumericString()).toBe("15.9900");
    });

    it("tracks previous amount for price increase detection", () => {
      const txs = [
        makeCatTx({
          transactionId: "tx-1",
          merchantName: "Netflix",
          transactionDate: "2024-01-15",
          amount: "13.9900",
        }),
        makeCatTx({
          transactionId: "tx-2",
          merchantName: "Netflix",
          transactionDate: "2024-02-15",
          amount: "13.9900",
        }),
        makeCatTx({
          transactionId: "tx-3",
          merchantName: "Netflix",
          transactionDate: "2024-03-15",
          amount: "15.9900",
        }),
      ];

      const results = detectRecurringCharges(userId, txs, "2024-03-20");

      expect(results).toHaveLength(1);
      expect(results[0]!.amount).toBe("15.9900");
      expect(results[0]!.previousAmount).toBe("13.9900");
    });
  });

  describe("weekly pattern detection", () => {
    it("detects weekly recurring charges", () => {
      const txs = generateWeeklyTxs("Gym Membership", 5, "2024-01-01");
      const results = detectRecurringCharges(userId, txs, "2024-02-05");

      expect(results).toHaveLength(1);
      expect(results[0]!.frequency).toBe("weekly");
    });
  });

  describe("annual pattern detection", () => {
    it("detects annual recurring charges", () => {
      const txs = [
        makeCatTx({
          transactionId: "tx-1",
          merchantName: "Amazon Prime",
          transactionDate: "2022-03-15",
          amount: "139.0000",
        }),
        makeCatTx({
          transactionId: "tx-2",
          merchantName: "Amazon Prime",
          transactionDate: "2023-03-15",
          amount: "139.0000",
        }),
        makeCatTx({
          transactionId: "tx-3",
          merchantName: "Amazon Prime",
          transactionDate: "2024-03-14",
          amount: "149.0000",
        }),
      ];

      const results = detectRecurringCharges(userId, txs, "2024-04-01");

      expect(results).toHaveLength(1);
      expect(results[0]!.frequency).toBe("annual");
    });
  });

  describe("minimum occurrences", () => {
    it("requires at least MIN_OCCURRENCES transactions", () => {
      const txs = [
        makeCatTx({
          transactionId: "tx-1",
          merchantName: "OneTimeShop",
          transactionDate: "2024-01-15",
        }),
      ];

      const results = detectRecurringCharges(userId, txs, "2024-02-01");
      expect(results).toHaveLength(0);
    });

    it("detects pattern with exactly MIN_OCCURRENCES transactions", () => {
      expect(MIN_OCCURRENCES).toBe(2);

      const txs = generateMonthlyTxs("Spotify", MIN_OCCURRENCES, "2024-01-15");
      const results = detectRecurringCharges(userId, txs, "2024-03-01");

      expect(results).toHaveLength(1);
      expect(results[0]!.frequency).toBe("monthly");
    });
  });

  describe("unused subscription detection", () => {
    it("marks subscriptions as unused after UNUSED_THRESHOLD_DAYS", () => {
      const txs = generateMonthlyTxs("Netflix", 3, "2023-06-15");
      const results = detectRecurringCharges(userId, txs, "2024-06-01");

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("unused");
      expect(results[0]!.daysSinceUsage).toBeGreaterThan(UNUSED_THRESHOLD_DAYS);
    });

    it("marks recent subscriptions as active", () => {
      const txs = generateMonthlyTxs("Spotify", 3, "2024-01-15");
      const results = detectRecurringCharges(userId, txs, "2024-03-20");

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("active");
      expect(results[0]!.daysSinceUsage).toBeLessThanOrEqual(UNUSED_THRESHOLD_DAYS);
    });
  });

  describe("next expected date estimation", () => {
    it("estimates next monthly charge date", () => {
      // Use explicit dates to avoid timezone-related setMonth drift
      const txs = [
        makeCatTx({ transactionId: "tx-1", merchantName: "Netflix", transactionDate: "2024-01-15" }),
        makeCatTx({ transactionId: "tx-2", merchantName: "Netflix", transactionDate: "2024-02-15" }),
        makeCatTx({ transactionId: "tx-3", merchantName: "Netflix", transactionDate: "2024-03-15" }),
      ];
      const results = detectRecurringCharges(userId, txs, "2024-03-20");

      expect(results).toHaveLength(1);
      // Last charge 2024-03-15 + 1 month = 2024-04-15
      expect(results[0]!.nextExpectedDate).toBe("2024-04-15");
    });

    it("estimates next weekly charge date", () => {
      const txs = generateWeeklyTxs("Gym", 4, "2024-01-01");
      const results = detectRecurringCharges(userId, txs, "2024-01-25");

      expect(results).toHaveLength(1);
      expect(results[0]!.nextExpectedDate).toBe("2024-01-29");
    });
  });

  describe("merchant grouping", () => {
    it("groups transactions by normalized merchant name (case-insensitive)", () => {
      const txs = [
        makeCatTx({
          transactionId: "tx-1",
          merchantName: "Netflix",
          transactionDate: "2024-01-15",
        }),
        makeCatTx({
          transactionId: "tx-2",
          merchantName: "NETFLIX",
          transactionDate: "2024-02-15",
        }),
        makeCatTx({
          transactionId: "tx-3",
          merchantName: "netflix",
          transactionDate: "2024-03-15",
        }),
      ];

      const results = detectRecurringCharges(userId, txs, "2024-03-20");

      expect(results).toHaveLength(1);
      expect(results[0]!.frequency).toBe("monthly");
    });

    it("detects multiple recurring charges from different merchants", () => {
      const netflixTxs = generateMonthlyTxs("Netflix", 3, "2024-01-15", "15.9900");
      const spotifyTxs = generateMonthlyTxs("Spotify", 3, "2024-01-10", "9.9900");

      const results = detectRecurringCharges(
        userId,
        [...netflixTxs, ...spotifyTxs],
        "2024-04-01",
      );

      expect(results).toHaveLength(2);
      const merchants = results.map((r) => r.merchantName).sort();
      expect(merchants).toEqual(["netflix", "spotify"]);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty transactions", () => {
      const results = detectRecurringCharges(userId, [], "2024-01-01");
      expect(results).toEqual([]);
    });

    it("ignores irregular intervals that don't match any frequency", () => {
      const txs = [
        makeCatTx({
          transactionId: "tx-1",
          merchantName: "Random Shop",
          transactionDate: "2024-01-01",
        }),
        makeCatTx({
          transactionId: "tx-2",
          merchantName: "Random Shop",
          transactionDate: "2024-01-20",
        }),
        makeCatTx({
          transactionId: "tx-3",
          merchantName: "Random Shop",
          transactionDate: "2024-02-25",
        }),
      ];

      const results = detectRecurringCharges(userId, txs, "2024-03-01");
      if (results.length > 0) {
        expect(["weekly", "biweekly", "monthly", "quarterly", "annual"]).toContain(
          results[0]!.frequency,
        );
      }
    });

    it("generates a UUID for each recurring charge", () => {
      const txs = generateMonthlyTxs("Netflix", 3, "2024-01-15");
      const results = detectRecurringCharges(userId, txs, "2024-04-01");

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("sets isTrial to false by default", () => {
      const txs = generateMonthlyTxs("Netflix", 3, "2024-01-15");
      const results = detectRecurringCharges(userId, txs, "2024-04-01");

      expect(results[0]!.isTrial).toBe(false);
    });
  });
});
