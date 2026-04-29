/**
 * Tests for SimpleFIN banking integration.
 *
 * All external API calls are mocked — no real SimpleFIN requests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createConnection,
  fetchTransactions,
  fetchAccounts,
} from "./simplefin";
import type { SimpleFinConfig } from "./simplefin";
import { Money } from "@/lib/math/decimal";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const testConfig: SimpleFinConfig = {
  accessUrl: "https://testuser:testpass@bridge.simplefin.org",
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
// createConnection
// ---------------------------------------------------------------------------

describe("createConnection", () => {
  it("returns a connection ID from SimpleFIN accounts", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-sf-1",
            name: "Checking",
            balance: "1234.56",
            org: { name: "Test Bank", domain: "testbank.com" },
          },
        ],
      }),
    );

    const connectionId = await createConnection(testConfig);

    expect(connectionId).toMatch(/^simplefin-testbank\.com-\d+$/);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("bridge.simplefin.org/accounts");
    expect(options.headers).toBeDefined();
    expect((options.headers as Record<string, string>)["Authorization"]).toMatch(/^Basic /);
  });

  it("falls back to org name when domain is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-sf-2",
            name: "Savings",
            balance: "500.00",
            org: { name: "My Credit Union" },
          },
        ],
      }),
    );

    const connectionId = await createConnection(testConfig);
    expect(connectionId).toMatch(/^simplefin-My Credit Union-\d+$/);
  });

  it("throws when no accounts are returned", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ accounts: [] }));

    await expect(createConnection(testConfig)).rejects.toThrow(
      "SimpleFIN connection returned no accounts",
    );
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

    await expect(createConnection(testConfig)).rejects.toThrow("SimpleFIN API error (401)");
  });

  it("preserves the access URL pathname when building request URLs", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [{ id: "a", balance: "0", org: { name: "X" } }],
      }),
    );

    const configWithPath: SimpleFinConfig = {
      accessUrl: "https://u:p@beta-bridge.simplefin.org/simplefin",
    };

    await createConnection(configWithPath);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://beta-bridge.simplefin.org/simplefin/accounts");
  });

  it("sends Basic auth header derived from access URL", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [{ id: "a", balance: "0", org: { name: "X" } }],
      }),
    );

    await createConnection(testConfig);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const authHeader = (options.headers as Record<string, string>)["Authorization"];
    const decoded = Buffer.from(authHeader!.replace("Basic ", ""), "base64").toString("utf8");
    expect(decoded).toBe("testuser:testpass");
  });
});

// ---------------------------------------------------------------------------
// fetchTransactions
// ---------------------------------------------------------------------------

describe("fetchTransactions", () => {
  it("returns normalized transactions from SimpleFIN", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-sf-1",
            name: "Checking",
            balance: "1000.00",
            transactions: [
              {
                id: "tx-sf-1",
                posted: 1705363200, // 2024-01-16T00:00:00Z
                amount: "-42.50",
                description: "Grocery Store",
                payee: "Whole Foods",
                transacted_at: 1705276800, // 2024-01-15T00:00:00Z
              },
              {
                id: "tx-sf-2",
                posted: 1705276800,
                amount: "2500.00",
                description: "Direct Deposit",
                memo: "Payroll",
              },
            ],
          },
          {
            id: "acct-sf-2",
            name: "Savings",
            balance: "5000.00",
            transactions: [
              {
                id: "tx-sf-3",
                posted: 1705363200,
                amount: "-100.00",
                payee: "Transfer Out",
              },
            ],
          },
        ],
      }),
    );

    const transactions = await fetchTransactions(testConfig, "2024-01-01", "2024-01-31");

    expect(transactions).toHaveLength(3);

    const tx1 = transactions[0]!;
    expect(tx1.transactionId).toBe("tx-sf-1");
    expect(tx1.accountId).toBe("acct-sf-1");
    expect(tx1.amount).toBeInstanceOf(Money);
    expect(tx1.amount.toNumericString()).toBe("-42.5000");
    expect(tx1.merchantName).toBe("Whole Foods");
    expect(tx1.description).toBe("Grocery Store");
    expect(tx1.pending).toBe(false);

    // Transaction without payee falls back to null merchantName
    const tx2 = transactions[1]!;
    expect(tx2.merchantName).toBeNull();
    expect(tx2.description).toBe("Direct Deposit");

    // Transaction from second account
    const tx3 = transactions[2]!;
    expect(tx3.accountId).toBe("acct-sf-2");
    expect(tx3.merchantName).toBe("Transfer Out");
  });

  it("passes date range as Unix timestamps", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ accounts: [{ id: "a", balance: "0" }] }),
    );

    await fetchTransactions(testConfig, "2024-06-01", "2024-06-30");

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.get("start-date")).toBeTruthy();
    expect(parsedUrl.searchParams.get("end-date")).toBeTruthy();
  });

  it("handles accounts with no transactions", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          { id: "acct-empty", balance: "100.00" },
        ],
      }),
    );

    const transactions = await fetchTransactions(testConfig, "2024-01-01", "2024-01-31");
    expect(transactions).toHaveLength(0);
  });

  it("uses memo as description fallback", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-1",
            balance: "100.00",
            transactions: [
              {
                id: "tx-memo",
                posted: 1705363200,
                amount: "-10.00",
                memo: "ATM Withdrawal",
              },
            ],
          },
        ],
      }),
    );

    const transactions = await fetchTransactions(testConfig, "2024-01-01", "2024-01-31");
    expect(transactions[0]!.description).toBe("ATM Withdrawal");
  });
});

// ---------------------------------------------------------------------------
// fetchAccounts
// ---------------------------------------------------------------------------

describe("fetchAccounts", () => {
  it("returns normalized accounts with balances as Money", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          {
            id: "acct-sf-1",
            name: "Checking Account",
            currency: "USD",
            balance: "3456.78",
            available_balance: "3400.00",
            org: { name: "Test Bank" },
          },
          {
            id: "acct-sf-2",
            name: "Savings",
            currency: "USD",
            balance: "10000.00",
          },
        ],
      }),
    );

    const accounts = await fetchAccounts(testConfig);

    expect(accounts).toHaveLength(2);

    const checking = accounts[0]!;
    expect(checking.accountId).toBe("acct-sf-1");
    expect(checking.accountName).toBe("Checking Account");
    expect(checking.currentBalance).toBeInstanceOf(Money);
    expect(checking.currentBalance!.toNumericString()).toBe("3456.7800");
    expect(checking.availableBalance!.toNumericString()).toBe("3400.0000");
    expect(checking.currency).toBe("USD");

    // SimpleFIN doesn't provide type or mask
    expect(checking.accountType).toBeNull();
    expect(checking.accountMask).toBeNull();

    const savings = accounts[1]!;
    expect(savings.availableBalance).toBeNull();
  });

  it("defaults currency to USD when not provided", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        accounts: [
          { id: "acct-no-currency", balance: "100.00" },
        ],
      }),
    );

    const accounts = await fetchAccounts(testConfig);
    expect(accounts[0]!.currency).toBe("USD");
    expect(accounts[0]!.accountName).toBeNull();
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}, 500));

    await expect(fetchAccounts(testConfig)).rejects.toThrow("SimpleFIN API error (500)");
  });
});
