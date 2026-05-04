/**
 * Tests for the /sync chat handler — mechanical refresh only.
 *
 * /sync no longer renders insights (that moved to /aha). It runs
 * syncBankData, reports counts, and hands off. Tests verify:
 *   - sync error → friendly user-facing message
 *   - no active connections → /link_bank nudge
 *   - successful sync with new txns → count + /aha hand-off
 *   - successful sync with zero new txns → "no new transactions"
 *   - partial failure → connections-errored line surfaces
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConductorContext, ConductorDeps } from "../types";
import type { SyncSummary } from "@/lib/banking/adapter";

const mockSyncBankData = vi.fn();
vi.mock("@/lib/banking/adapter", () => ({
  syncBankData: (
    userId: string,
    supabase: unknown,
    config: unknown,
  ) => mockSyncBankData(userId, supabase, config),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({}) }),
}));

import { handleSync } from "./sync";

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
});

const summary = (s: Partial<SyncSummary>): SyncSummary => ({
  connectionsSynced: 0,
  connectionsErrored: 0,
  transactionsAdded: 0,
  accountsTouched: 0,
  ...s,
});

describe("handleSync (mechanical refresh)", () => {
  it("returns a friendly error if syncBankData throws", async () => {
    mockSyncBankData.mockRejectedValueOnce(new Error("Plaid timeout"));

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("couldn't pull");
    expect(reply.text).toContain("Plaid timeout");
  });

  it("nudges to /link_bank when there are no active connections", async () => {
    mockSyncBankData.mockResolvedValueOnce(summary({}));

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("haven't linked a bank");
    expect(reply.text).toContain("/link_bank");
  });

  it("reports counts and hands off to /aha on successful sync", async () => {
    mockSyncBankData.mockResolvedValueOnce(
      summary({ connectionsSynced: 2, transactionsAdded: 17, accountsTouched: 5 }),
    );

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("Synced 5 accounts");
    expect(reply.text).toContain("17 new transactions");
    expect(reply.text).toContain("/aha");
  });

  it("uses singular grammar for one transaction / one account", async () => {
    mockSyncBankData.mockResolvedValueOnce(
      summary({ connectionsSynced: 1, transactionsAdded: 1, accountsTouched: 1 }),
    );

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("Synced 1 account");
    expect(reply.text).toContain("1 new transaction");
    expect(reply.text).not.toContain("1 new transactions");
    expect(reply.text).not.toContain("1 accounts");
  });

  it("says 'no new transactions' when nothing was added", async () => {
    mockSyncBankData.mockResolvedValueOnce(
      summary({ connectionsSynced: 1, transactionsAdded: 0, accountsTouched: 3 }),
    );

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("no new transactions");
    expect(reply.text).toContain("/aha");
  });

  it("surfaces a partial-failure line when at least one connection errored", async () => {
    mockSyncBankData.mockResolvedValueOnce(
      summary({
        connectionsSynced: 1,
        connectionsErrored: 1,
        transactionsAdded: 4,
        accountsTouched: 2,
      }),
    );

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text).toContain("Synced 2 accounts");
    expect(reply.text).toContain("1 connection hit an error");
  });

  it("does NOT render any detector or insight output (that's /aha's job)", async () => {
    mockSyncBankData.mockResolvedValueOnce(
      summary({ connectionsSynced: 1, transactionsAdded: 100, accountsTouched: 5 }),
    );

    const reply = await handleSync(ctx, undefined, DEPS);
    expect(reply.text.toLowerCase()).not.toContain("subscription");
    expect(reply.text.toLowerCase()).not.toContain("recurring");
    expect(reply.text.toLowerCase()).not.toContain("unused");
    expect(reply.text.toLowerCase()).not.toContain("monthly waste");
  });

  it("calls syncBankData with the correct config built from deps", async () => {
    mockSyncBankData.mockResolvedValueOnce(summary({}));

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
