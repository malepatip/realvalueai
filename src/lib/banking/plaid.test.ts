/**
 * Tests for Plaid banking integration.
 *
 * All external API calls are mocked — no real Plaid requests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  getAccounts,
  revokeAccessToken,
} from "./plaid";
import type { PlaidConfig } from "./plaid";
import { Money } from "@/lib/math/decimal";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const testConfig: PlaidConfig = {
  clientId: "test-client-id",
  secret: "test-secret",
  environment: "sandbox",
};

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
// createLinkToken
// ---------------------------------------------------------------------------

describe("createLinkToken", () => {
  it("returns a link token from Plaid", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ link_token: "link-sandbox-abc123", expiration: "2025-01-01T00:00:00Z" }),
    );

    const token = await createLinkToken(testConfig, "user-123");

    expect(token).toBe("link-sandbox-abc123");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.plaid.com/link/token/create");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["client_id"]).toBe("test-client-id");
    expect(body["secret"]).toBe("test-secret");
    expect((body["user"] as Record<string, unknown>)["client_user_id"]).toBe("user-123");
  });

  it("throws on Plaid API error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: "bad request" }, 400));

    await expect(createLinkToken(testConfig, "user-123")).rejects.toThrow("Plaid API error (400)");
  });

  it("throws on invalid response shape", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ wrong_field: "value" }));

    await expect(createLinkToken(testConfig, "user-123")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// exchangePublicToken
// ---------------------------------------------------------------------------

describe("exchangePublicToken", () => {
  it("exchanges a public token for an access token", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        access_token: "access-sandbox-xyz789",
        item_id: "item-abc",
        request_id: "req-123",
      }),
    );

    const accessToken = await exchangePublicToken(testConfig, "public-sandbox-token");

    expect(accessToken).toBe("access-sandbox-xyz789");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["public_token"]).toBe("public-sandbox-token");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

    await expect(exchangePublicToken(testConfig, "bad-token")).rejects.toThrow("Plaid API error");
  });
});

// ---------------------------------------------------------------------------
// syncTransactions
// ---------------------------------------------------------------------------

describe("syncTransactions", () => {
  it("returns normalized transactions from Plaid sync", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [
          {
            transaction_id: "tx-1",
            account_id: "acct-1",
            amount: 42.5,
            name: "Coffee Shop",
            merchant_name: "Starbucks",
            category: ["Food and Drink", "Coffee"],
            date: "2025-01-15",
            authorized_date: "2025-01-14",
            pending: false,
          },
          {
            transaction_id: "tx-2",
            account_id: "acct-1",
            amount: -1500.0,
            name: "Payroll",
            merchant_name: null,
            category: ["Transfer", "Payroll"],
            date: "2025-01-14",
            authorized_date: null,
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        next_cursor: "cursor-abc",
        has_more: false,
      }),
    );

    const result = await syncTransactions(testConfig, "access-token-123");

    expect(result.transactions).toHaveLength(2);
    expect(result.nextCursor).toBe("cursor-abc");

    const tx1 = result.transactions[0]!;
    expect(tx1.transactionId).toBe("tx-1");
    expect(tx1.accountId).toBe("acct-1");
    expect(tx1.amount).toBeInstanceOf(Money);
    expect(tx1.amount.toNumericString()).toBe("42.5000");
    expect(tx1.merchantName).toBe("Starbucks");
    expect(tx1.merchantCategory).toBe("Food and Drink");
    expect(tx1.description).toBe("Coffee Shop");
    expect(tx1.transactionDate).toBe("2025-01-15");
    expect(tx1.postedAt).toBe("2025-01-14");
    expect(tx1.pending).toBe(false);

    // Negative amount (credit)
    const tx2 = result.transactions[1]!;
    expect(tx2.amount.toNumericString()).toBe("-1500.0000");
    expect(tx2.merchantName).toBe("Payroll");
  });

  it("includes modified transactions in results", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [],
        modified: [
          {
            transaction_id: "tx-mod-1",
            account_id: "acct-1",
            amount: 25.0,
            name: "Updated Merchant",
            merchant_name: "Updated Merchant",
            category: ["Shopping"],
            date: "2025-01-10",
            authorized_date: null,
            pending: false,
          },
        ],
        removed: [],
        next_cursor: "cursor-def",
        has_more: false,
      }),
    );

    const result = await syncTransactions(testConfig, "access-token-123");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]!.transactionId).toBe("tx-mod-1");
  });

  it("passes cursor for incremental sync", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [],
        modified: [],
        removed: [],
        next_cursor: "cursor-new",
        has_more: false,
      }),
    );

    await syncTransactions(testConfig, "access-token-123", "cursor-old");

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["cursor"]).toBe("cursor-old");
  });

  it("uses production URL when environment is production", async () => {
    const prodConfig: PlaidConfig = { ...testConfig, environment: "production" };

    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [],
        modified: [],
        removed: [],
        next_cursor: "c",
        has_more: false,
      }),
    );

    await syncTransactions(prodConfig, "access-token");

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://production.plaid.com/transactions/sync");
  });

  it("falls back to name when merchant_name is null", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        added: [
          {
            transaction_id: "tx-fallback",
            account_id: "acct-1",
            amount: 10.0,
            name: "Some Name",
            merchant_name: null,
            category: null,
            date: "2025-01-01",
            authorized_date: null,
            pending: true,
          },
        ],
        modified: [],
        removed: [],
        next_cursor: "c",
        has_more: false,
      }),
    );

    const result = await syncTransactions(testConfig, "token");
    expect(result.transactions[0]!.merchantName).toBe("Some Name");
    expect(result.transactions[0]!.merchantCategory).toBeNull();
    expect(result.transactions[0]!.pending).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getAccounts
// ---------------------------------------------------------------------------

describe("getAccounts", () => {
  it("returns normalized accounts with balances as Money", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            account_id: "acct-checking",
            name: "My Checking",
            type: "depository",
            mask: "1234",
            balances: {
              current: 5432.1,
              available: 5000.0,
              iso_currency_code: "USD",
            },
          },
          {
            account_id: "acct-savings",
            name: "Savings",
            type: "depository",
            mask: "5678",
            balances: {
              current: 10000.0,
              available: null,
              iso_currency_code: "USD",
            },
          },
        ],
      }),
    );

    const accounts = await getAccounts(testConfig, "access-token-123");

    expect(accounts).toHaveLength(2);

    const checking = accounts[0]!;
    expect(checking.accountId).toBe("acct-checking");
    expect(checking.accountName).toBe("My Checking");
    expect(checking.accountType).toBe("depository");
    expect(checking.accountMask).toBe("1234");
    expect(checking.currentBalance).toBeInstanceOf(Money);
    expect(checking.currentBalance!.toNumericString()).toBe("5432.1000");
    expect(checking.availableBalance!.toNumericString()).toBe("5000.0000");
    expect(checking.currency).toBe("USD");

    const savings = accounts[1]!;
    expect(savings.availableBalance).toBeNull();
  });

  it("handles accounts with null balances", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            account_id: "acct-null",
            name: null,
            type: null,
            mask: null,
            balances: {
              current: null,
              available: null,
              iso_currency_code: null,
            },
          },
        ],
      }),
    );

    const accounts = await getAccounts(testConfig, "access-token");
    const acct = accounts[0]!;
    expect(acct.accountName).toBeNull();
    expect(acct.currentBalance).toBeNull();
    expect(acct.availableBalance).toBeNull();
    expect(acct.currency).toBe("USD");
  });
});

// ---------------------------------------------------------------------------
// revokeAccessToken
// ---------------------------------------------------------------------------

describe("revokeAccessToken", () => {
  it("calls the Plaid item/remove endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ request_id: "req-remove" }));

    await revokeAccessToken(testConfig, "access-token-to-revoke");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://sandbox.plaid.com/item/remove");

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["access_token"]).toBe("access-token-to-revoke");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(revokeAccessToken(testConfig, "token")).rejects.toThrow("Plaid API error (500)");
  });
});
