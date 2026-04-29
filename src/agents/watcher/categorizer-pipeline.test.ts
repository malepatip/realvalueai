import { describe, it, expect, vi, beforeEach } from "vitest";
import { categorizeBatch } from "./categorizer-pipeline";
import type { RawTransaction } from "./categorizer-pipeline";
import type { NimApiConfig } from "./categorizer";

const nimConfig: NimApiConfig = { apiKey: "test-key" };

function makeTx(overrides: Partial<RawTransaction> & { id: string }): RawTransaction {
  return {
    amount: "10.0000",
    merchant_name: null,
    description: null,
    transaction_date: "2024-01-15",
    ...overrides,
  };
}

describe("categorizeBatch (pipeline)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array for empty input", async () => {
    const results = await categorizeBatch([], nimConfig);
    expect(results).toEqual([]);
  });

  it("categorizes known merchants via Pass 1 (rule-based) without calling LLM", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const transactions: RawTransaction[] = [
      makeTx({ id: "tx-1", merchant_name: "Netflix", amount: "15.9900" }),
      makeTx({ id: "tx-2", merchant_name: "Spotify", amount: "9.9900" }),
      makeTx({ id: "tx-3", merchant_name: "Starbucks #1234", amount: "5.5000" }),
    ];

    const results = await categorizeBatch(transactions, nimConfig);

    // LLM should NOT be called — all matched by rules
    expect(fetchSpy).not.toHaveBeenCalled();

    expect(results).toHaveLength(3);
    expect(results[0]!.merchantCategory).toBe("Entertainment");
    expect(results[0]!.categoryConfidence).toBe(0.95);
    expect(results[1]!.merchantCategory).toBe("Entertainment");
    expect(results[2]!.merchantCategory).toBe("Food & Drink");
  });

  it("sends unmatched transactions to LLM in Pass 2", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { transactionId: "tx-2", category: "Healthcare", confidence: 0.80 },
              ]),
            },
          },
        ],
      }),
    } as unknown as Response);

    const transactions: RawTransaction[] = [
      makeTx({ id: "tx-1", merchant_name: "Netflix", amount: "15.9900" }),
      makeTx({ id: "tx-2", merchant_name: "Dr. Johnson Family Practice", amount: "150.0000" }),
    ];

    const results = await categorizeBatch(transactions, nimConfig);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    expect(results).toHaveLength(2);
    expect(results[0]!.merchantCategory).toBe("Entertainment");
    expect(results[0]!.categoryRuleMatched).not.toBe("llm");
    expect(results[1]!.merchantCategory).toBe("Healthcare");
    expect(results[1]!.categoryRuleMatched).toBe("llm");
  });

  it("handles transactions with no merchant name by sending to LLM", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { transactionId: "tx-1", category: "Other", confidence: 0.55 },
              ]),
            },
          },
        ],
      }),
    } as unknown as Response);

    const transactions: RawTransaction[] = [
      makeTx({ id: "tx-1", merchant_name: null, description: "POS DEBIT 12345" }),
    ];

    const results = await categorizeBatch(transactions, nimConfig);

    expect(results).toHaveLength(1);
    expect(results[0]!.categoryRuleMatched).toBe("llm");
  });

  it("preserves transaction amounts as decimal strings (Money-safe)", async () => {
    const transactions: RawTransaction[] = [
      makeTx({ id: "tx-1", merchant_name: "Netflix", amount: "15.9900" }),
    ];

    const results = await categorizeBatch(transactions, nimConfig);

    expect(results[0]!.amount).toBe("15.9900");
    expect(typeof results[0]!.amount).toBe("string");
  });

  it("preserves transaction dates", async () => {
    const transactions: RawTransaction[] = [
      makeTx({ id: "tx-1", merchant_name: "Spotify", transaction_date: "2024-03-15" }),
    ];

    const results = await categorizeBatch(transactions, nimConfig);

    expect(results[0]!.transactionDate).toBe("2024-03-15");
  });

  it("runs Pass 1 then Pass 2 in correct order", async () => {
    const callOrder: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callOrder.push("llm");
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { transactionId: "tx-3", category: "Healthcare", confidence: 0.75 },
                ]),
              },
            },
          ],
        }),
      } as unknown as Response;
    });

    const transactions: RawTransaction[] = [
      makeTx({ id: "tx-1", merchant_name: "Netflix" }),
      makeTx({ id: "tx-2", merchant_name: "Walmart" }),
      makeTx({ id: "tx-3", merchant_name: "Zhangwei Acupuncture Clinic" }),
    ];

    const results = await categorizeBatch(transactions, nimConfig);

    expect(callOrder).toEqual(["llm"]);

    expect(results).toHaveLength(3);
    expect(results[0]!.merchantCategory).toBe("Entertainment");
    expect(results[1]!.merchantCategory).toBe("Shopping");
    expect(results[2]!.merchantCategory).toBe("Healthcare");
  });
});
