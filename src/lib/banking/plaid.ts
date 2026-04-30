/**
 * Plaid Banking Integration
 *
 * Wraps the Plaid API for link token creation, token exchange,
 * transaction sync, account fetching, and access token revocation.
 *
 * All monetary values use the Money class — NEVER IEEE 754 floats.
 * Never log credentials, access tokens, or secrets.
 *
 * @module banking/plaid
 */

import { Money } from "@/lib/math/decimal";
import type { NormalizedTransaction, NormalizedAccount } from "./types";
import {
  PlaidLinkTokenResponseSchema,
  PlaidHostedLinkTokenResponseSchema,
  PlaidLinkTokenGetResponseSchema,
  PlaidExchangeTokenResponseSchema,
  PlaidSyncResponseSchema,
  PlaidAccountsResponseSchema,
} from "./types";

const PLAID_BASE_URL = "https://production.plaid.com";
const PLAID_SANDBOX_URL = "https://sandbox.plaid.com";

/** Plaid API configuration */
export interface PlaidConfig {
  readonly clientId: string;
  readonly secret: string;
  readonly environment?: "sandbox" | "production";
}

/**
 * Get the base URL for the configured Plaid environment.
 */
function getBaseUrl(environment: "sandbox" | "production" = "production"): string {
  return environment === "sandbox" ? PLAID_SANDBOX_URL : PLAID_BASE_URL;
}

/**
 * Make an authenticated request to the Plaid API.
 * Never logs the request body (may contain tokens).
 */
async function plaidRequest<T>(
  config: PlaidConfig,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const baseUrl = getBaseUrl(config.environment);
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      ...body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Plaid API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Generate a Plaid Link token for the frontend to initiate bank linking.
 *
 * @param config - Plaid API credentials
 * @param userId - Internal user ID (used as Plaid client_user_id)
 * @returns Link token string for Plaid Link initialization
 */
export async function createLinkToken(
  config: PlaidConfig,
  userId: string,
): Promise<string> {
  const raw = await plaidRequest(config, "/link/token/create", {
    user: { client_user_id: userId },
    client_name: "RealValue AI",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
  });

  const parsed = PlaidLinkTokenResponseSchema.parse(raw);
  return parsed.link_token;
}

/**
 * Create a Hosted Link token. Plaid hosts the entire bank-linking flow
 * on `link.plaid.com`; we only host the `completion_redirect_uri`
 * server endpoint that fires once the user finishes.
 *
 * Used by the `/link_bank` Telegram chat handler — bot DMs the
 * `hosted_link_url` to the user, the user taps it, completes the flow
 * on Plaid's domain, and Plaid redirects to our callback.
 *
 * **Important — two redirect URIs:**
 *   - `redirectUri` is for **OAuth bank flows** (Chase, BofA, etc.).
 *     It must EXACTLY match the URI registered in the Plaid dashboard
 *     — no query string, no trailing slash variation. Plaid rejects
 *     mismatches with a 400.
 *   - `completionRedirectUri` is the URL Plaid sends the user to after
 *     the entire Hosted Link flow finishes. May include query params
 *     (we use `?state=<uuid>` so the callback can look up the session
 *     in Redis).
 *
 * @param config - Plaid API credentials
 * @param userId - Internal user ID (used as Plaid client_user_id)
 * @param redirectUri - Bare callback URL, must match dashboard registration
 * @param completionRedirectUri - Same callback URL with `?state=<uuid>` appended
 * @returns Object with link_token (use later with /link/token/get) and
 *   hosted_link_url (DM this to the user)
 */
export async function createHostedLinkToken(
  config: PlaidConfig,
  userId: string,
  redirectUri: string,
  completionRedirectUri: string,
): Promise<{ linkToken: string; hostedLinkUrl: string }> {
  const raw = await plaidRequest(config, "/link/token/create", {
    user: { client_user_id: userId },
    client_name: "RealValue AI",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
    redirect_uri: redirectUri,
    hosted_link: {
      completion_redirect_uri: completionRedirectUri,
    },
  });

  const parsed = PlaidHostedLinkTokenResponseSchema.parse(raw);
  return {
    linkToken: parsed.link_token,
    hostedLinkUrl: parsed.hosted_link_url,
  };
}

/**
 * Retrieve the public_token from a completed Hosted Link session.
 *
 * Called by `/api/banking/plaid-callback` after Plaid redirects the
 * user back. Polls `/link/token/get` for the most recent successful
 * link_session and returns the public_token + institution metadata.
 *
 * @param config - Plaid API credentials
 * @param linkToken - The link_token returned by createHostedLinkToken
 * @returns public_token + institution name/id, or null if no successful
 *   session has finished yet (caller should retry or surface error)
 */
export async function getHostedLinkResult(
  config: PlaidConfig,
  linkToken: string,
): Promise<{
  publicToken: string;
  institutionName: string | null;
  institutionId: string | null;
} | null> {
  const raw = await plaidRequest(config, "/link/token/get", {
    link_token: linkToken,
  });

  const parsed = PlaidLinkTokenGetResponseSchema.parse(raw);

  // Find the most recent finished session that has a public_token
  const finished = (parsed.link_sessions ?? [])
    .filter((s) => s.finished_at)
    .reverse(); // most-recent-first

  for (const session of finished) {
    const result = session.results?.item_add_results?.[0];
    if (result?.public_token) {
      return {
        publicToken: result.public_token,
        institutionName: result.institution?.name ?? null,
        institutionId: result.institution?.institution_id ?? null,
      };
    }
  }

  return null;
}

/**
 * Exchange a public token (from Plaid Link) for a persistent access token.
 *
 * @param config - Plaid API credentials
 * @param publicToken - Public token from Plaid Link callback
 * @returns Access token (must be encrypted before storage)
 */
export async function exchangePublicToken(
  config: PlaidConfig,
  publicToken: string,
): Promise<string> {
  const raw = await plaidRequest(config, "/item/public_token/exchange", {
    public_token: publicToken,
  });

  const parsed = PlaidExchangeTokenResponseSchema.parse(raw);
  return parsed.access_token;
}

/**
 * Convert a Plaid transaction amount to a Money instance.
 * Plaid amounts are positive for debits and negative for credits.
 * We store them as-is (positive = money out, negative = money in).
 */
function plaidAmountToMoney(amount: number): Money {
  return Money.fromString(amount.toFixed(4));
}

/**
 * Fetch new transactions since the last sync using Plaid's cursor-based sync.
 *
 * @param config - Plaid API credentials
 * @param accessToken - Plaid access token for the item
 * @param cursor - Optional cursor from previous sync (omit for initial sync)
 * @returns Normalized transactions and the next cursor for incremental sync
 */
export async function syncTransactions(
  config: PlaidConfig,
  accessToken: string,
  cursor?: string,
): Promise<{ transactions: readonly NormalizedTransaction[]; nextCursor: string }> {
  const body: Record<string, unknown> = { access_token: accessToken };
  if (cursor) {
    body["cursor"] = cursor;
  }

  const raw = await plaidRequest(config, "/transactions/sync", body);
  const parsed = PlaidSyncResponseSchema.parse(raw);

  const transactions: NormalizedTransaction[] = [
    ...parsed.added,
    ...parsed.modified,
  ].map((tx) => ({
    transactionId: tx.transaction_id,
    accountId: tx.account_id,
    amount: plaidAmountToMoney(tx.amount),
    merchantName: tx.merchant_name ?? tx.name ?? null,
    merchantCategory: tx.category?.[0] ?? null,
    description: tx.name ?? null,
    transactionDate: tx.date,
    postedAt: tx.authorized_date ?? null,
    pending: tx.pending,
  }));

  return { transactions, nextCursor: parsed.next_cursor };
}

/**
 * Fetch account balances from Plaid.
 *
 * @param config - Plaid API credentials
 * @param accessToken - Plaid access token for the item
 * @returns Normalized account data with balances
 */
export async function getAccounts(
  config: PlaidConfig,
  accessToken: string,
): Promise<readonly NormalizedAccount[]> {
  const raw = await plaidRequest(config, "/accounts/balance/get", {
    access_token: accessToken,
  });

  const parsed = PlaidAccountsResponseSchema.parse(raw);

  return parsed.accounts.map((acct) => ({
    accountId: acct.account_id,
    accountName: acct.name ?? null,
    accountType: acct.type ?? null,
    accountMask: acct.mask ?? null,
    currentBalance: acct.balances.current != null
      ? Money.fromString(acct.balances.current.toFixed(4))
      : null,
    availableBalance: acct.balances.available != null
      ? Money.fromString(acct.balances.available.toFixed(4))
      : null,
    currency: acct.balances.iso_currency_code ?? "USD",
  }));
}

/**
 * Revoke a Plaid access token (kill switch).
 * After revocation, the token can no longer be used for any API calls.
 *
 * @param config - Plaid API credentials
 * @param accessToken - Plaid access token to revoke
 */
export async function revokeAccessToken(
  config: PlaidConfig,
  accessToken: string,
): Promise<void> {
  await plaidRequest(config, "/item/remove", {
    access_token: accessToken,
  });
}
