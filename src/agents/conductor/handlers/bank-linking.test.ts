/**
 * Tests for bank-linking chat handlers.
 *
 * Mocks the Supabase client, SimpleFIN fetchAccounts, encryptToken,
 * advancePhase, and ioredis. Verifies URL-shape validation, success
 * path, account-listing format, and the "no connections yet" empty
 * state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConductorContext, ConductorDeps, Intent } from "../types";

// ── Mocks ───────────────────────────────────────────────────────────

const mockFetchAccounts = vi.fn();
vi.mock("@/lib/banking/simplefin", () => ({
  fetchAccounts: (config: unknown) => mockFetchAccounts(config),
}));

const mockEncryptToken = vi.fn((s: string, _k: string) => `enc(${s})`);
vi.mock("@/lib/banking/adapter", () => ({
  encryptToken: (s: string, k: string) => mockEncryptToken(s, k),
}));

const mockAdvancePhase = vi.fn();
vi.mock("@/lib/trust/state-machine", () => ({
  advancePhase: (
    userId: string,
    trigger: string,
    supabase: unknown,
    redis: unknown,
  ) => mockAdvancePhase(userId, trigger, supabase, redis),
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(_url: string, _opts?: unknown) {}
    async quit() {
      return "OK";
    }
  },
}));

// Track Supabase calls via a chainable shared mock.
const insertedRows: unknown[] = [];
const queryResult = {
  data: null as unknown,
  error: null as unknown,
};

const mockBuilder = {
  insert: vi.fn((row: unknown) => {
    insertedRows.push(row);
    return mockBuilder;
  }),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockImplementation(() => Promise.resolve(queryResult)),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => mockBuilder,
  }),
}));

// Re-import handlers AFTER mocks are registered.
import { handleLinkSimpleFin, handleAccounts } from "./bank-linking";

// ── Fixtures ────────────────────────────────────────────────────────

const ctx: ConductorContext = {
  userId: "user-1",
  telegramUserId: 1,
  chatId: 1,
  messageText: "",
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

function cmdIntent(name: string, args: string[] = []): Intent {
  return { kind: "command", name, args };
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
  queryResult.data = null;
  queryResult.error = null;
});

// ── /link_simplefin ─────────────────────────────────────────────────

describe("handleLinkSimpleFin", () => {
  it("returns instructions when no URL is provided", async () => {
    const reply = await handleLinkSimpleFin(ctx, cmdIntent("link_simplefin"), DEPS);
    expect(reply.text).toContain("bridge.simplefin.org");
    expect(reply.text).toContain("/link_simplefin");
    expect(mockFetchAccounts).not.toHaveBeenCalled();
  });

  it("rejects a URL that doesn't parse as a valid https URL", async () => {
    const reply = await handleLinkSimpleFin(
      ctx,
      cmdIntent("link_simplefin", ["not-a-url"]),
      DEPS,
    );
    expect(reply.text).toContain("doesn't look like");
    expect(mockFetchAccounts).not.toHaveBeenCalled();
  });

  it("rejects an https URL missing basic-auth credentials", async () => {
    const reply = await handleLinkSimpleFin(
      ctx,
      cmdIntent("link_simplefin", ["https://beta-bridge.simplefin.org/simplefin"]),
      DEPS,
    );
    expect(reply.text).toContain("doesn't look like");
    expect(mockFetchAccounts).not.toHaveBeenCalled();
  });

  it("rejects an http (non-TLS) URL even with credentials", async () => {
    const reply = await handleLinkSimpleFin(
      ctx,
      cmdIntent("link_simplefin", ["http://u:p@host/simplefin"]),
      DEPS,
    );
    expect(reply.text).toContain("doesn't look like");
  });

  it("reports SimpleFIN reachability errors verbatim (truncated)", async () => {
    mockFetchAccounts.mockRejectedValueOnce(
      new Error("SimpleFIN API error (404): Not Found"),
    );
    const reply = await handleLinkSimpleFin(
      ctx,
      cmdIntent("link_simplefin", ["https://u:p@beta-bridge.simplefin.org/simplefin"]),
      DEPS,
    );
    expect(reply.text).toContain("404");
  });

  it("encrypts and stores the URL on success, advances trust, reports account count", async () => {
    mockFetchAccounts.mockResolvedValueOnce([{}, {}, {}]); // 3 accounts
    mockAdvancePhase.mockResolvedValueOnce({
      success: true,
      previousPhase: "phase_0",
      newPhase: "phase_1",
      trigger: "bank_connected",
    });

    const reply = await handleLinkSimpleFin(
      ctx,
      cmdIntent("link_simplefin", ["https://u:p@beta-bridge.simplefin.org/simplefin"]),
      DEPS,
    );

    expect(reply.text).toContain("3 accounts");
    expect(reply.text).toContain("phase_0 → phase_1");
    expect(mockEncryptToken).toHaveBeenCalledWith(
      "https://u:p@beta-bridge.simplefin.org/simplefin",
      DEPS.encryptionKey,
    );
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as Record<string, unknown>;
    expect(row["user_id"]).toBe("user-1");
    expect(row["provider"]).toBe("simplefin");
    expect(row["access_token_encrypted"]).toBe(
      "enc(https://u:p@beta-bridge.simplefin.org/simplefin)",
    );
    expect(row["status"]).toBe("active");
  });

  it("singularizes the success message when exactly 1 account is found", async () => {
    mockFetchAccounts.mockResolvedValueOnce([{}]);
    mockAdvancePhase.mockResolvedValueOnce({
      success: false,
      previousPhase: "phase_1",
      newPhase: "phase_1",
      trigger: "bank_connected",
    });

    const reply = await handleLinkSimpleFin(
      ctx,
      cmdIntent("link_simplefin", ["https://u:p@host/simplefin"]),
      DEPS,
    );
    expect(reply.text).toContain("1 account ");
    expect(reply.text).not.toContain("phase_"); // no advancement note
  });
});

// ── /accounts ───────────────────────────────────────────────────────

describe("handleAccounts", () => {
  it("returns an empty-state message when the user has no connections", async () => {
    queryResult.data = [];
    const reply = await handleAccounts(ctx, cmdIntent("accounts"), DEPS);
    expect(reply.text).toContain("haven't connected");
    expect(reply.text).toContain("/link_simplefin");
  });

  it("lists connections and accounts with last-4 masking", async () => {
    queryResult.data = [
      {
        id: "conn-1",
        provider: "simplefin",
        institution_name: "Demo Bank",
        status: "active",
      },
    ];

    // First call (connections) returns the array above; subsequent
    // call (accounts) needs a different result. The mock builder is
    // shared, so re-stub the .order resolution for the next call.
    const accountsResult = [
      {
        account_name: "Checking",
        account_type: "depository",
        account_mask: "5678",
        current_balance: "1234.56",
        currency: "USD",
      },
    ];
    let callCount = 0;
    mockBuilder.order.mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? queryResult : { data: accountsResult, error: null });
    });

    const reply = await handleAccounts(ctx, cmdIntent("accounts"), DEPS);
    expect(reply.text).toContain("Demo Bank");
    expect(reply.text).toContain("(simplefin)");
    expect(reply.text).toContain("active");
    expect(reply.text).toContain("Checking");
    expect(reply.text).toContain("••5678");
    // Money formats with $ prefix and comma separators
    expect(reply.text).toMatch(/\$1,234\.56|1,234\.56/);
  });

  it("handles a connection with no synced accounts gracefully", async () => {
    queryResult.data = [
      {
        id: "conn-1",
        provider: "simplefin",
        institution_name: "Empty Bank",
        status: "active",
      },
    ];
    let callCount = 0;
    mockBuilder.order.mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1 ? queryResult : { data: [], error: null });
    });

    const reply = await handleAccounts(ctx, cmdIntent("accounts"), DEPS);
    expect(reply.text).toContain("Empty Bank");
    expect(reply.text).toContain("no accounts synced yet");
  });
});
