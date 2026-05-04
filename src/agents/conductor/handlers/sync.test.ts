/**
 * Tests for the /sync chat handler.
 *
 * Mocks syncBankData and the Supabase client. Verifies:
 * - sync error → friendly user-facing message
 * - empty transactions table → helpful "no data yet" message
 * - non-empty txns + unused subs → formatted Holy-Shit-Moment reply
 * - non-empty txns + no unused subs → "all subs are used" reply
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConductorContext, ConductorDeps } from "../types";

// ── Mocks ───────────────────────────────────────────────────────────

const mockSyncBankData = vi.fn();
vi.mock("@/lib/banking/adapter", () => ({
  syncBankData: (
    userId: string,
    supabase: unknown,
    config: unknown,
  ) => mockSyncBankData(userId, supabase, config),
}));

// Supabase client mock — chainable builder for transactions select
const txnQueryResult = { data: null as unknown, error: null as unknown };

const mockBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockImplementation(() => Promise.resolve(txnQueryResult)),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => mockBuilder,
  }),
}));

import { handleSync } from "./sync";

// ── Fixtures ────────────────────────────────────────────────────────

const ctx: ConductorContext = {
  userId: "user-1",
  telegramUserId: 1,
  chatId: 12345,
  messageText: "/sync",
  updateType: "message",
};

const DEPS: ConductorDeps = {
  supabaseUrl: "https://stub.supabase.co",
  supabaseServiceRoleKey: "stub-key",
  redisUrl: "redis://stub:6379",
  encryptionKey: "0".repeat(64),
  plaidClientId: "stub-plaid-client",
  plaidSecret: "stub-plaid-secret",
  plaidEnv: "sandbox",
  appUrl: "https://stub.example.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  txnQueryResult.data = null;
  txnQueryResult.error = null;
});

describe("handleSync", () => {
  it("returns a friendly error if syncBankData throws", async () => {
    mockSyncBankData.mockRejectedValueOnce(new Error("Plaid timeout"));

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("couldn't pull");
    expect(reply.text).toContain("Plaid timeout");
  });

  it("returns a no-data message if the transactions query is empty", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    txnQueryResult.data = [];

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("didn't find any transactions");
    expect(reply.text).toContain("/link_bank");
  });

  it("reports zero unused subs when none qualify (still surfaces top outflows)", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    // Two transactions for the same merchant, far enough apart to be
    // recurring but very recent (no 45+ day gap). Negative amount —
    // matches Plaid/SimpleFIN convention for an outflow.
    const today = new Date().toISOString().split("T")[0]!;
    const lastMonth = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
    txnQueryResult.data = [
      {
        id: "tx-1",
        merchant_name: "Active Sub Co",
        amount: "-9.99",
        transaction_date: lastMonth,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "tx-2",
        merchant_name: "Active Sub Co",
        amount: "-9.99",
        transaction_date: today,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
    ];

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("didn't find any unused subscriptions");
    // Pipeline-ran diagnostics surface so the user can tell the
    // detector ran rather than silently failed.
    expect(reply.text).toContain("recurring outflow patterns");
    expect(reply.text.toLowerCase()).toContain("active sub co");
    // Amount displays as positive currency — never the raw negative.
    expect(reply.text).toContain("$9.99");
    expect(reply.text).not.toContain("-$9.99");
  });

  it("excludes incoming payroll / transfers from the user-facing top recurring list", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    // Three months of payroll on a biweekly cadence — positive amounts.
    // The recurring-detector will pick this up as biweekly, but the
    // /sync UI must NOT call it a "recurring outflow."
    const days = (n: number) =>
      new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
    txnQueryResult.data = [0, 14, 28, 42, 56, 70].map((d, i) => ({
      id: `pay-${i}`,
      merchant_name: "Acme Payroll",
      amount: "5000.00", // positive = inflow
      transaction_date: days(d),
      merchant_category: null,
      category_rule_matched: null,
      category_confidence: null,
    }));

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("didn't find any unused subscriptions");
    // The biggest recurring inflow in the dataset must NOT appear in
    // the top-recurring list — that's the whole point of the filter.
    expect(reply.text.toLowerCase()).not.toContain("acme payroll");
    // No outflows in the dataset → 0 outflow patterns reported.
    expect(reply.text).toContain("0 recurring outflow patterns");
  });

  it("formats the Holy-Shit-Moment reply when unused subs exist (negative amounts = real outflow convention)", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    // Two charges, last one 60 days ago → unused. Negative amounts to
    // match Plaid/SimpleFIN convention.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
    txnQueryResult.data = [
      {
        id: "tx-1",
        merchant_name: "OldSub",
        amount: "-14.99",
        transaction_date: ninetyDaysAgo,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "tx-2",
        merchant_name: "OldSub",
        amount: "-14.99",
        transaction_date: sixtyDaysAgo,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
    ];

    const reply = await handleSync(ctx, undefined, DEPS);
    // Recurring-detector normalizes merchant names to lowercase
    expect(reply.text.toLowerCase()).toContain("oldsub");
    expect(reply.text).toContain("unused");
    expect(reply.text).toContain("Total monthly waste");
    // Cost surfaces as positive — never bare negative.
    expect(reply.text).not.toContain("-$14.99");
  });

  it("calls syncBankData with the correct config built from deps", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    txnQueryResult.data = [];

    await handleSync(ctx, undefined, DEPS);

    expect(mockSyncBankData).toHaveBeenCalledOnce();
    const [userId, _supabase, config] = mockSyncBankData.mock.calls[0]!;
    expect(userId).toBe("user-1");
    expect(config).toEqual({
      plaidClientId: "stub-plaid-client",
      plaidSecret: "stub-plaid-secret",
      encryptionKey: DEPS.encryptionKey,
      plaidEnvironment: "sandbox",
    });
  });
});
