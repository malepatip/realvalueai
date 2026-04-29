/**
 * Tests for the bank data adapter — unified abstraction over Plaid/SimpleFIN.
 *
 * All external API calls and Supabase operations are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PlaidAdapter,
  SimpleFinAdapter,
  encryptToken,
  decryptToken,
  syncBankData,
} from "./adapter";
import type { SyncConfig } from "./adapter";
import { Money } from "@/lib/math/decimal";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Mock fetch globally (used by plaid/simplefin modules)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helper to create a mock Response
// ---------------------------------------------------------------------------

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Token encryption/decryption
// ---------------------------------------------------------------------------

describe("encryptToken / decryptToken", () => {
  const testKey = randomBytes(32).toString("hex");

  it("round-trips a token through encrypt and decrypt", () => {
    const original = "access-sandbox-abc123xyz";
    const encrypted = encryptToken(original, testKey);
    const decrypted = decryptToken(encrypted, testKey);

    expect(decrypted).toBe(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).not.toContain(original);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const token = "same-token-value";
    const enc1 = encryptToken(token, testKey);
    const enc2 = encryptToken(token, testKey);

    expect(enc1).not.toBe(enc2);
    expect(decryptToken(enc1, testKey)).toBe(token);
    expect(decryptToken(enc2, testKey)).toBe(token);
  });

  it("throws on decryption with wrong key", () => {
    const encrypted = encryptToken("secret-token", testKey);
    const wrongKey = randomBytes(32).toString("hex");

    expect(() => decryptToken(encrypted, wrongKey)).toThrow();
  });

  it("handles empty string token", () => {
    const encrypted = encryptToken("", testKey);
    const decrypted = decryptToken(encrypted, testKey);
    expect(decrypted).toBe("");
  });

  it("handles long token values", () => {
    const longToken = "a".repeat(1000);
    const encrypted = encryptToken(longToken, testKey);
    const decrypted = decryptToken(encrypted, testKey);
    expect(decrypted).toBe(longToken);
  });
});

// ---------------------------------------------------------------------------
// PlaidAdapter
// ---------------------------------------------------------------------------

describe("PlaidAdapter", () => {
  const plaidConfig = {
    clientId: "test-client",
    secret: "test-secret",
    environment: "sandbox" as const,
  };

  it("syncTransactions delegates to plaid module", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [
          {
            transaction_id: "tx-1",
            account_id: "acct-1",
            amount: 50.0,
            name: "Test",
            merchant_name: "Test Merchant",
            category: ["Shopping"],
            date: "2025-01-01",
            authorized_date: null,
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        next_cursor: "cursor-123",
        has_more: false,
      }),
    );

    const adapter = new PlaidAdapter(plaidConfig, "access-token");
    const result = await adapter.syncTransactions();

    expect(result.transactions).toHaveLength(1);
    expect(result.nextCursor).toBe("cursor-123");
    expect(result.transactions[0]!.amount).toBeInstanceOf(Money);
    expect(adapter.provider).toBe("plaid");
  });

  it("syncTransactions passes cursor for incremental sync", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [],
        modified: [],
        removed: [],
        next_cursor: "new-cursor",
        has_more: false,
      }),
    );

    const adapter = new PlaidAdapter(plaidConfig, "access-token");
    await adapter.syncTransactions("old-cursor");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["cursor"]).toBe("old-cursor");
  });

  it("getAccounts delegates to plaid module", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            account_id: "acct-1",
            name: "Checking",
            type: "depository",
            mask: "1234",
            balances: { current: 1000.0, available: 900.0, iso_currency_code: "USD" },
          },
        ],
      }),
    );

    const adapter = new PlaidAdapter(plaidConfig, "access-token");
    const accounts = await adapter.getAccounts();

    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.currentBalance).toBeInstanceOf(Money);
  });

  it("revokeAccess delegates to plaid module", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ request_id: "req" }));

    const adapter = new PlaidAdapter(plaidConfig, "access-token");
    await adapter.revokeAccess();

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/item/remove");
  });
});

// ---------------------------------------------------------------------------
// SimpleFinAdapter
// ---------------------------------------------------------------------------

describe("SimpleFinAdapter", () => {
  const sfConfig = { accessUrl: "https://user:pass@bridge.simplefin.org" };

  it("syncTransactions fetches last 30 days", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-1",
            balance: "500.00",
            transactions: [
              {
                id: "tx-1",
                posted: 1705363200,
                amount: "-25.00",
                payee: "Store",
              },
            ],
          },
        ],
      }),
    );

    const adapter = new SimpleFinAdapter(sfConfig);
    const result = await adapter.syncTransactions();

    expect(result.transactions).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(result.transactions[0]!.amount).toBeInstanceOf(Money);
    expect(adapter.provider).toBe("simplefin");
  });

  it("getAccounts delegates to simplefin module", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-1",
            name: "Checking",
            balance: "1234.56",
            currency: "USD",
          },
        ],
      }),
    );

    const adapter = new SimpleFinAdapter(sfConfig);
    const accounts = await adapter.getAccounts();

    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.currentBalance!.toNumericString()).toBe("1234.5600");
  });

  it("revokeAccess is a no-op for SimpleFIN", async () => {
    const adapter = new SimpleFinAdapter(sfConfig);
    await expect(adapter.revokeAccess()).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// syncBankData (unified sync)
// ---------------------------------------------------------------------------

describe("syncBankData", () => {
  const encryptionKey = randomBytes(32).toString("hex");
  const syncConfig: SyncConfig = {
    plaidClientId: "test-client",
    plaidSecret: "test-secret",
    encryptionKey,
    plaidEnvironment: "sandbox",
  };

  function createMockSupabase(connections: unknown[] = []) {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ error: null }),
        }),
      }),
    });

    const insertFn = vi.fn().mockReturnValue({ error: null });

    const selectFn = vi.fn();

    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === "bank_connections") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  data: connections,
                  error: null,
                }),
              }),
            }),
          }),
          update: updateFn,
        };
      }
      if (table === "accounts") {
        return {
          select: selectFn.mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockReturnValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: insertFn,
          update: updateFn,
        };
      }
      if (table === "transactions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockReturnValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
          insert: insertFn,
        };
      }
      return {
        select: vi.fn().mockReturnValue({ eq: vi.fn() }),
        insert: insertFn,
        update: updateFn,
      };
    });

    return { from: fromFn } as unknown as import("@supabase/supabase-js").SupabaseClient;
  }

  it("does nothing when user has no active connections", async () => {
    const supabase = createMockSupabase([]);

    await syncBankData("user-123", supabase, syncConfig);

    // Only the initial bank_connections query should have been made
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("syncs a Plaid connection", async () => {
    const encryptedToken = encryptToken("access-plaid-token", encryptionKey);

    const connections = [
      {
        id: "conn-1",
        user_id: "user-123",
        provider: "plaid",
        access_token_encrypted: encryptedToken,
        status: "active",
        sync_cursor: null,
      },
    ];

    const supabase = createMockSupabase(connections);

    // Mock Plaid sync response
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [
          {
            transaction_id: "tx-1",
            account_id: "acct-1",
            amount: 42.5,
            name: "Test",
            merchant_name: "Test",
            category: ["Shopping"],
            date: "2025-01-01",
            authorized_date: null,
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        next_cursor: "cursor-new",
        has_more: false,
      }),
    );

    // Mock Plaid accounts response
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            account_id: "acct-1",
            name: "Checking",
            type: "depository",
            mask: "1234",
            balances: { current: 1000.0, available: 900.0, iso_currency_code: "USD" },
          },
        ],
      }),
    );

    await syncBankData("user-123", supabase, syncConfig);

    // Should have made 2 fetch calls (sync + accounts)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("continues syncing other connections when one fails", async () => {
    const encryptedToken1 = encryptToken("bad-token", encryptionKey);
    const encryptedToken2 = encryptToken("access-plaid-token-2", encryptionKey);

    const connections = [
      {
        id: "conn-fail",
        user_id: "user-123",
        provider: "plaid",
        access_token_encrypted: encryptedToken1,
        status: "active",
        sync_cursor: null,
      },
      {
        id: "conn-ok",
        user_id: "user-123",
        provider: "plaid",
        access_token_encrypted: encryptedToken2,
        status: "active",
        sync_cursor: null,
      },
    ];

    const supabase = createMockSupabase(connections);

    // First connection fails
    mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

    // Second connection succeeds
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [],
        modified: [],
        removed: [],
        next_cursor: "c",
        has_more: false,
      }),
    );
    mockFetch.mockResolvedValueOnce(
      mockResponse({ accounts: [] }),
    );

    // Should not throw — errors are caught per-connection
    await expect(syncBankData("user-123", supabase, syncConfig)).resolves.toBeUndefined();
  });
});
