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

  it("reports zero unused subs when none qualify", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    // Two transactions for the same merchant, far enough apart to be
    // recurring but very recent (no 45+ day gap).
    const today = new Date().toISOString().split("T")[0]!;
    const lastMonth = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0]!;
    txnQueryResult.data = [
      {
        id: "tx-1",
        merchant_name: "Active Sub Co",
        amount: "9.99",
        transaction_date: lastMonth,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "tx-2",
        merchant_name: "Active Sub Co",
        amount: "9.99",
        transaction_date: today,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
    ];

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("didn't find any unused subscriptions");
  });

  it("formats the Holy-Shit-Moment reply when unused subs exist", async () => {
    mockSyncBankData.mockResolvedValueOnce(undefined);
    // Two charges, last one 60 days ago → unused.
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
        amount: "14.99",
        transaction_date: ninetyDaysAgo,
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "tx-2",
        merchant_name: "OldSub",
        amount: "14.99",
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
