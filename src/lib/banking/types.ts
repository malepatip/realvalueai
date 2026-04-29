/**
 * Banking Integration — Shared Types
 *
 * Normalized types that abstract over Plaid and SimpleFIN differences.
 * All monetary values use the Money class — NEVER IEEE 754 floats.
 *
 * @module banking/types
 */

import { z } from "zod/v4";
import { Money } from "@/lib/math/decimal";

// ---------------------------------------------------------------------------
// Normalized Transaction
// ---------------------------------------------------------------------------

/** Unified transaction format from either Plaid or SimpleFIN */
export interface NormalizedTransaction {
  readonly transactionId: string;
  readonly accountId: string;
  readonly amount: Money;
  readonly merchantName: string | null;
  readonly merchantCategory: string | null;
  readonly description: string | null;
  readonly transactionDate: string;
  readonly postedAt: string | null;
  readonly pending: boolean;
}

// ---------------------------------------------------------------------------
// Normalized Account
// ---------------------------------------------------------------------------

/** Unified account format from either Plaid or SimpleFIN */
export interface NormalizedAccount {
  readonly accountId: string;
  readonly accountName: string | null;
  readonly accountType: string | null;
  readonly accountMask: string | null;
  readonly currentBalance: Money | null;
  readonly availableBalance: Money | null;
  readonly currency: string;
}

// ---------------------------------------------------------------------------
// Bank Data Adapter
// ---------------------------------------------------------------------------

/** Sync result containing transactions and an optional cursor for incremental sync */
export interface SyncResult {
  readonly transactions: readonly NormalizedTransaction[];
  readonly nextCursor: string | null;
}

/** Provider type discriminator */
export type BankProvider = "plaid" | "simplefin";

// ---------------------------------------------------------------------------
// Plaid API response Zod schemas (external input validation)
// ---------------------------------------------------------------------------

export const PlaidLinkTokenResponseSchema = z.object({
  link_token: z.string().min(1),
  expiration: z.string().optional(),
  request_id: z.string().optional(),
});

export const PlaidExchangeTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  item_id: z.string().min(1),
  request_id: z.string().optional(),
});

export const PlaidTransactionSchema = z.object({
  transaction_id: z.string(),
  account_id: z.string(),
  amount: z.number(),
  name: z.string().nullable().optional(),
  merchant_name: z.string().nullable().optional(),
  category: z.array(z.string()).nullable().optional(),
  date: z.string(),
  authorized_date: z.string().nullable().optional(),
  pending: z.boolean(),
});

export const PlaidSyncResponseSchema = z.object({
  added: z.array(PlaidTransactionSchema),
  modified: z.array(PlaidTransactionSchema),
  removed: z.array(z.object({ transaction_id: z.string() })),
  next_cursor: z.string(),
  has_more: z.boolean(),
  request_id: z.string().optional(),
});

export const PlaidAccountSchema = z.object({
  account_id: z.string(),
  name: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  mask: z.string().nullable().optional(),
  balances: z.object({
    current: z.number().nullable().optional(),
    available: z.number().nullable().optional(),
    iso_currency_code: z.string().nullable().optional(),
  }),
});

export const PlaidAccountsResponseSchema = z.object({
  accounts: z.array(PlaidAccountSchema),
  request_id: z.string().optional(),
});

// ---------------------------------------------------------------------------
// SimpleFIN API response Zod schemas
// ---------------------------------------------------------------------------

export const SimpleFinTransactionSchema = z.object({
  id: z.string(),
  posted: z.number(),
  amount: z.string(),
  description: z.string().optional(),
  payee: z.string().optional(),
  memo: z.string().optional(),
  transacted_at: z.number().optional(),
});

export const SimpleFinAccountSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  currency: z.string().optional(),
  balance: z.string(),
  available_balance: z.string().optional(),
  org: z.object({
    name: z.string().optional(),
    domain: z.string().optional(),
  }).optional(),
  transactions: z.array(SimpleFinTransactionSchema).optional(),
});

export const SimpleFinAccountsResponseSchema = z.object({
  accounts: z.array(SimpleFinAccountSchema),
});

// ---------------------------------------------------------------------------
// Plaid Webhook schemas
// ---------------------------------------------------------------------------

export const PlaidWebhookSchema = z.object({
  webhook_type: z.string(),
  webhook_code: z.string(),
  item_id: z.string().optional(),
  error: z.object({
    error_type: z.string(),
    error_code: z.string(),
    error_message: z.string(),
  }).nullable().optional(),
  new_transactions: z.number().optional(),
});

// ---------------------------------------------------------------------------
// SimpleFIN Webhook schemas
// ---------------------------------------------------------------------------

export const SimpleFinWebhookSchema = z.object({
  event: z.string(),
  connection_id: z.string().optional(),
  error: z.string().nullable().optional(),
});
