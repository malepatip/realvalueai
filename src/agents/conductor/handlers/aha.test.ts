/**
 * Tests for /aha — the curated activation surface.
 *
 * Covers:
 *   - empty transactions table → "nothing to look at yet, run /sync"
 *   - txns present but no unused subs → friendly empty fallback
 *   - one unused sub → friend-text-flavored ahaa render
 *   - multiple unused subs → only the highest-impact one is rendered
 *   - inflows (positive amounts) excluded from candidate pool
 *   - pure pickAhaInsight ranking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Insight } from "@/types/watcher";
import type { ConductorContext, ConductorDeps } from "../types";

const txnQueryResult = { data: null as unknown, error: null as unknown };

const mockBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  order: vi.fn().mockImplementation(() => Promise.resolve(txnQueryResult)),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => mockBuilder }),
}));

import {
  handleAha,
  pickAhaInsight,
  renderUnusedSubAha,
  renderEmptyAha,
} from "./aha";

const ctx: ConductorContext = {
  userId: "user-1",
  telegramUserId: 1,
  chatId: 12345,
  messageText: "/aha",
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

const days = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;

describe("pickAhaInsight (pure ranker)", () => {
  it("returns null when no candidates qualify", () => {
    expect(pickAhaInsight([])).toBeNull();
  });

  it("returns the first candidate (detectUnusedSubscriptions pre-sorts by cost)", () => {
    const a: Insight = {
      type: "unused_subscription",
      urgency: "batched",
      merchantName: "Big",
      amount: "29.99",
      description: "",
      metadata: {},
      detectedAt: new Date().toISOString(),
    };
    const b: Insight = { ...a, merchantName: "Small", amount: "4.99" };
    expect(pickAhaInsight([a, b])?.merchantName).toBe("Big");
  });
});

describe("render helpers", () => {
  it("renderUnusedSubAha includes merchant in backticks, monthly cost, day count", () => {
    const insight: Insight = {
      type: "unused_subscription",
      urgency: "batched",
      merchantName: "Streamy McStreamface",
      amount: "14.99",
      description: "",
      metadata: { daysSinceUsage: 67 },
      detectedAt: new Date().toISOString(),
    };
    const out = renderUnusedSubAha(insight);
    expect(out).toContain("`Streamy McStreamface`");
    expect(out).toContain("$14.99/mo");
    expect(out).toContain("67 days");
    expect(out.toLowerCase()).toContain("cancel");
  });

  it("renderEmptyAha is positively framed (no anxiety dump)", () => {
    const out = renderEmptyAha();
    expect(out.toLowerCase()).toContain("all clear");
    expect(out.toLowerCase()).not.toContain("error");
    expect(out.toLowerCase()).not.toContain("unable");
  });
});

describe("handleAha (integration)", () => {
  it("nudges to /sync when transactions table is empty", async () => {
    txnQueryResult.data = [];
    const reply = await handleAha(ctx, undefined, DEPS);
    expect(reply.text).toContain("/sync");
    expect(reply.text).toContain("/link_bank");
  });

  it("returns the friendly empty fallback when no recurring outflows are unused", async () => {
    // Two recent outflows for the same merchant — recurring but actively
    // used (no 45+ day gap), so unused-sub detector returns nothing.
    txnQueryResult.data = [
      {
        id: "tx-1",
        merchant_name: "Active Sub",
        amount: "-9.99",
        transaction_date: days(31),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "tx-2",
        merchant_name: "Active Sub",
        amount: "-9.99",
        transaction_date: days(0),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
    ];

    const reply = await handleAha(ctx, undefined, DEPS);
    expect(reply.text.toLowerCase()).toContain("all clear");
    // Critically: NOT a list, NOT a breakdown.
    expect(reply.text).not.toContain("•");
    expect(reply.text.toLowerCase()).not.toContain("top");
  });

  it("renders a single unused-sub insight when one qualifies (negative outflow convention)", async () => {
    // Two charges, last one 60 days ago → unused. Negative amounts
    // match the Plaid/SimpleFIN sign convention.
    txnQueryResult.data = [
      {
        id: "tx-1",
        merchant_name: "OldSub",
        amount: "-14.99",
        transaction_date: days(90),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "tx-2",
        merchant_name: "OldSub",
        amount: "-14.99",
        transaction_date: days(60),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
    ];

    const reply = await handleAha(ctx, undefined, DEPS);
    expect(reply.text.toLowerCase()).toContain("oldsub");
    expect(reply.text).toContain("$14.99/mo");
    // Cost is positive — never bare negative leaking from the sign-flip.
    expect(reply.text).not.toContain("-$14.99");
    // One observation, not a list.
    expect(reply.text).not.toContain("•");
  });

  it("excludes recurring inflows (positive amounts) from candidate pool", async () => {
    // Six biweekly payroll deposits — recurring inflows, NOT subscriptions.
    txnQueryResult.data = [0, 14, 28, 42, 56, 70].map((d, i) => ({
      id: `pay-${i}`,
      merchant_name: "Acme Payroll",
      amount: "5000.00",
      transaction_date: days(d),
      merchant_category: null,
      category_rule_matched: null,
      category_confidence: null,
    }));

    const reply = await handleAha(ctx, undefined, DEPS);
    // Payroll must never show up as an "unused subscription" prompt.
    expect(reply.text.toLowerCase()).not.toContain("acme payroll");
    expect(reply.text.toLowerCase()).toContain("all clear");
  });

  it("surfaces ONLY the single highest-impact unused sub when multiple qualify", async () => {
    // Two qualifying unused subs at very different price points. The
    // expensive one should be the only thing rendered. Each merchant
    // has two charges (recurring-detector minimum) both > 45 days old.
    txnQueryResult.data = [
      {
        id: "expensive-1",
        merchant_name: "BigSub",
        amount: "-49.99",
        transaction_date: days(120),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "expensive-2",
        merchant_name: "BigSub",
        amount: "-49.99",
        transaction_date: days(90),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "cheap-1",
        merchant_name: "CheapSub",
        amount: "-2.99",
        transaction_date: days(120),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
      {
        id: "cheap-2",
        merchant_name: "CheapSub",
        amount: "-2.99",
        transaction_date: days(90),
        merchant_category: null,
        category_rule_matched: null,
        category_confidence: null,
      },
    ];

    const reply = await handleAha(ctx, undefined, DEPS);
    expect(reply.text.toLowerCase()).toContain("bigsub");
    expect(reply.text.toLowerCase()).not.toContain("cheapsub");
  });

  it("returns a friendly read-error message if the txn query fails", async () => {
    txnQueryResult.data = null;
    txnQueryResult.error = { message: "boom" };

    const reply = await handleAha(ctx, undefined, DEPS);
    expect(reply.text).toContain("Couldn't read");
  });
});
