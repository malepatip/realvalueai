/**
 * SimpleFIN Banking Integration
 *
 * Wraps the SimpleFIN Bridge API for establishing connections,
 * fetching transactions, and fetching account balances.
 *
 * All monetary values use the Money class — NEVER IEEE 754 floats.
 * Never log credentials, access tokens, or secrets.
 *
 * @module banking/simplefin
 */

import { Money } from "@/lib/math/decimal";
import type { NormalizedTransaction, NormalizedAccount } from "./types";
import {
  SimpleFinAccountsResponseSchema,
} from "./types";

/** SimpleFIN configuration */
export interface SimpleFinConfig {
  readonly accessUrl: string;
}

/**
 * Parse the SimpleFIN access URL into base URL and credentials.
 * Access URL format: https://username:password@bridge.simplefin.org/simplefin
 *
 * The pathname is preserved — real SimpleFIN access URLs end in /simplefin
 * and resource paths like /accounts are appended to that, not to the host.
 */
function parseAccessUrl(accessUrl: string): { baseUrl: string; authHeader: string } {
  const url = new URL(accessUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const pathname = url.pathname.replace(/\/$/, "");
  const baseUrl = `${url.protocol}//${url.host}${pathname}`;
  return { baseUrl, authHeader };
}

/**
 * Make an authenticated request to the SimpleFIN API.
 * Never logs the request URL or auth header (contains credentials).
 */
async function simpleFinRequest<T>(
  config: SimpleFinConfig,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const { baseUrl, authHeader } = parseAccessUrl(config.accessUrl);

  const url = new URL(`${baseUrl}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`SimpleFIN API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Establish a SimpleFIN connection by verifying the access URL works.
 * Returns a connection ID derived from the first account's org info.
 *
 * @param config - SimpleFIN configuration with access URL
 * @returns Connection ID string for future requests
 */
export async function createConnection(
  config: SimpleFinConfig,
): Promise<string> {
  const raw = await simpleFinRequest(config, "/accounts");
  const parsed = SimpleFinAccountsResponseSchema.parse(raw);

  if (parsed.accounts.length === 0) {
    throw new Error("SimpleFIN connection returned no accounts");
  }

  // Use the first account's org domain or a hash of the access URL as connection ID
  const firstAccount = parsed.accounts[0];
  const orgName = firstAccount?.org?.domain ?? firstAccount?.org?.name ?? "unknown";
  return `simplefin-${orgName}-${Date.now()}`;
}

/**
 * Convert a Unix timestamp (seconds) to an ISO date string.
 */
function unixToIsoDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().split("T")[0] ?? "";
}

/**
 * Convert a Unix timestamp (seconds) to an ISO datetime string.
 */
function unixToIsoDatetime(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Fetch transactions from SimpleFIN for a date range.
 *
 * @param config - SimpleFIN configuration
 * @param startDate - Start date (ISO format YYYY-MM-DD)
 * @param endDate - End date (ISO format YYYY-MM-DD)
 * @returns Normalized transactions from all connected accounts
 */
export async function fetchTransactions(
  config: SimpleFinConfig,
  startDate: string,
  endDate: string,
): Promise<readonly NormalizedTransaction[]> {
  const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
  const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);

  const raw = await simpleFinRequest(config, "/accounts", {
    "start-date": String(startTimestamp),
    "end-date": String(endTimestamp),
  });

  const parsed = SimpleFinAccountsResponseSchema.parse(raw);

  const transactions: NormalizedTransaction[] = [];

  for (const account of parsed.accounts) {
    if (!account.transactions) continue;

    for (const tx of account.transactions) {
      transactions.push({
        transactionId: tx.id,
        accountId: account.id,
        amount: Money.fromString(tx.amount),
        merchantName: tx.payee ?? null,
        merchantCategory: null,
        description: tx.description ?? tx.memo ?? null,
        transactionDate: unixToIsoDate(tx.posted),
        postedAt: tx.transacted_at != null
          ? unixToIsoDatetime(tx.transacted_at)
          : unixToIsoDatetime(tx.posted),
        pending: false,
      });
    }
  }

  return transactions;
}

/**
 * Fetch account balances from SimpleFIN.
 *
 * @param config - SimpleFIN configuration
 * @returns Normalized account data with balances
 */
export async function fetchAccounts(
  config: SimpleFinConfig,
): Promise<readonly NormalizedAccount[]> {
  const raw = await simpleFinRequest(config, "/accounts");
  const parsed = SimpleFinAccountsResponseSchema.parse(raw);

  return parsed.accounts.map((acct) => ({
    accountId: acct.id,
    accountName: acct.name ?? null,
    accountType: null,
    accountMask: null,
    currentBalance: Money.fromString(acct.balance),
    availableBalance: acct.available_balance != null
      ? Money.fromString(acct.available_balance)
      : null,
    currency: acct.currency ?? "USD",
  }));
}
