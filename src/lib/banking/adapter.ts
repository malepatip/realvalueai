/**
 * Bank Data Adapter — Unified Banking Abstraction
 *
 * Abstracts Plaid and SimpleFIN behind a common interface.
 * Handles encrypted token storage/retrieval and unified sync.
 *
 * All monetary values use the Money class — NEVER IEEE 754 floats.
 * Never log credentials, access tokens, or secrets.
 *
 * @module banking/adapter
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedTransaction, NormalizedAccount, SyncResult, BankProvider } from "./types";
import type { PlaidConfig } from "./plaid";
import type { SimpleFinConfig } from "./simplefin";
import * as plaid from "./plaid";
import * as simplefin from "./simplefin";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// BankDataAdapter interface
// ---------------------------------------------------------------------------

/** Unified interface for bank data providers */
export interface BankDataAdapter {
  readonly provider: BankProvider;
  syncTransactions(cursor?: string): Promise<SyncResult>;
  getAccounts(): Promise<readonly NormalizedAccount[]>;
  revokeAccess(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Token encryption helpers (AES-256-GCM with ENCRYPTION_KEY)
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY env var.
 * Uses the first 32 bytes of the hex-decoded key, or pads/hashes as needed.
 */
function deriveEncryptionKey(encryptionKey: string): Buffer {
  const keyBuffer = Buffer.from(encryptionKey, "hex");
  if (keyBuffer.length >= 32) {
    return keyBuffer.subarray(0, 32);
  }
  // Pad with zeros if key is too short (shouldn't happen with proper config)
  const padded = Buffer.alloc(32);
  keyBuffer.copy(padded);
  return padded;
}

/**
 * Encrypt an access token for storage in bank_connections.
 * Format: base64(iv + authTag + ciphertext)
 */
export function encryptToken(plaintext: string, encryptionKey: string): string {
  const key = deriveEncryptionKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt an access token from bank_connections.
 */
export function decryptToken(encryptedBase64: string, encryptionKey: string): string {
  const key = deriveEncryptionKey(encryptionKey);
  const data = Buffer.from(encryptedBase64, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// PlaidAdapter
// ---------------------------------------------------------------------------

/** Adapter wrapping Plaid API calls behind the BankDataAdapter interface */
export class PlaidAdapter implements BankDataAdapter {
  readonly provider: BankProvider = "plaid";

  constructor(
    private readonly config: PlaidConfig,
    private readonly accessToken: string,
  ) {}

  async syncTransactions(cursor?: string): Promise<SyncResult> {
    const result = await plaid.syncTransactions(this.config, this.accessToken, cursor);
    return {
      transactions: result.transactions,
      nextCursor: result.nextCursor,
    };
  }

  async getAccounts(): Promise<readonly NormalizedAccount[]> {
    return plaid.getAccounts(this.config, this.accessToken);
  }

  async revokeAccess(): Promise<void> {
    return plaid.revokeAccessToken(this.config, this.accessToken);
  }
}

// ---------------------------------------------------------------------------
// SimpleFinAdapter
// ---------------------------------------------------------------------------

/** Adapter wrapping SimpleFIN API calls behind the BankDataAdapter interface */
export class SimpleFinAdapter implements BankDataAdapter {
  readonly provider: BankProvider = "simplefin";

  constructor(
    private readonly config: SimpleFinConfig,
  ) {}

  async syncTransactions(_cursor?: string): Promise<SyncResult> {
    // SimpleFIN doesn't support cursor-based sync — fetch last 30 days
    const endDate = new Date().toISOString().split("T")[0] ?? "";
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().split("T")[0] ?? "";

    const transactions = await simplefin.fetchTransactions(
      this.config,
      startDate,
      endDate,
    );

    return { transactions, nextCursor: null };
  }

  async getAccounts(): Promise<readonly NormalizedAccount[]> {
    return simplefin.fetchAccounts(this.config);
  }

  async revokeAccess(): Promise<void> {
    // SimpleFIN doesn't have a revocation API — mark as revoked in DB only
  }
}

// ---------------------------------------------------------------------------
// Unified sync function
// ---------------------------------------------------------------------------

/** Configuration for the unified sync function */
export interface SyncConfig {
  readonly plaidClientId: string;
  readonly plaidSecret: string;
  readonly encryptionKey: string;
  readonly plaidEnvironment?: "sandbox" | "production";
}

/**
 * Aggregate counters returned by `syncBankData`. Used by the /sync chat
 * handler to report mechanical refresh progress to the user.
 */
export interface SyncSummary {
  /** Connections that completed without throwing. */
  readonly connectionsSynced: number;
  /** Connections that errored mid-sync (provider unavailable, token bad). */
  readonly connectionsErrored: number;
  /** New transactions inserted into the DB (already-stored ones don't count). */
  readonly transactionsAdded: number;
  /** Accounts upserted (insert OR update — i.e. accounts touched). */
  readonly accountsTouched: number;
}

/**
 * Sync bank data for a user across all their active bank connections.
 *
 * For each active connection:
 * 1. Decrypt the stored access token
 * 2. Create the appropriate adapter (Plaid or SimpleFIN)
 * 3. Sync transactions and update accounts
 * 4. Store results in the database
 *
 * @returns SyncSummary so callers can report counts to the user
 */
export async function syncBankData(
  userId: string,
  supabase: SupabaseClient,
  config: SyncConfig,
): Promise<SyncSummary> {
  let connectionsSynced = 0;
  let connectionsErrored = 0;
  let transactionsAdded = 0;
  let accountsTouched = 0;

  const { data: connections, error: connError } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("status", "active");

  if (connError) {
    throw new Error(`Failed to fetch bank connections: ${connError.message}`);
  }

  if (!connections || connections.length === 0) {
    return { connectionsSynced, connectionsErrored, transactionsAdded, accountsTouched };
  }

  for (const conn of connections) {
    try {
      const decryptedToken = decryptToken(
        conn.access_token_encrypted as string,
        config.encryptionKey,
      );

      const adapter = createAdapter(
        conn.provider as BankProvider,
        decryptedToken,
        config,
      );

      const syncResult = await adapter.syncTransactions(
        conn.sync_cursor as string | undefined,
      );

      const accounts = await adapter.getAccounts();
      for (const account of accounts) {
        await upsertAccount(supabase, userId, conn.id as string, account);
        accountsTouched += 1;
      }

      for (const tx of syncResult.transactions) {
        const inserted = await insertTransaction(supabase, userId, tx);
        if (inserted) transactionsAdded += 1;
      }

      const updateData: Record<string, unknown> = {
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (syncResult.nextCursor) {
        updateData["sync_cursor"] = syncResult.nextCursor;
      }

      await supabase
        .from("bank_connections")
        .update(updateData)
        .eq("id", conn.id as string);

      connectionsSynced += 1;
    } catch (error) {
      connectionsErrored += 1;
      console.error(
        `Sync failed for connection ${conn.id as string}:`,
        error instanceof Error ? error.message : "Unknown error",
      );

      await supabase
        .from("bank_connections")
        .update({
          status: "error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id as string);
    }
  }

  return { connectionsSynced, connectionsErrored, transactionsAdded, accountsTouched };
}

/**
 * Create the appropriate adapter for a bank provider.
 */
function createAdapter(
  provider: BankProvider,
  accessToken: string,
  config: SyncConfig,
): BankDataAdapter {
  switch (provider) {
    case "plaid":
      return new PlaidAdapter(
        {
          clientId: config.plaidClientId,
          secret: config.plaidSecret,
          environment: config.plaidEnvironment,
        },
        accessToken,
      );
    case "simplefin":
      return new SimpleFinAdapter({ accessUrl: accessToken });
    default:
      throw new Error(`Unknown bank provider: ${provider as string}`);
  }
}

/**
 * Upsert an account record in the database.
 */
async function upsertAccount(
  supabase: SupabaseClient,
  userId: string,
  bankConnectionId: string,
  account: NormalizedAccount,
): Promise<void> {
  // Check if account already exists
  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("bank_connection_id", bankConnectionId)
    .eq("account_id_external", account.accountId)
    .eq("is_deleted", false)
    .maybeSingle();

  const accountData = {
    user_id: userId,
    bank_connection_id: bankConnectionId,
    account_id_external: account.accountId,
    account_name: account.accountName,
    account_type: account.accountType,
    account_mask: account.accountMask,
    current_balance: account.currentBalance?.toNumericString() ?? null,
    available_balance: account.availableBalance?.toNumericString() ?? null,
    currency: account.currency,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("accounts")
      .update(accountData)
      .eq("id", existing.id as string);

    if (error) {
      throw new Error(`Failed to update account: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from("accounts")
      .insert(accountData);

    if (error) {
      throw new Error(`Failed to insert account: ${error.message}`);
    }
  }
}

/**
 * Insert a transaction record, skipping duplicates by external ID.
 *
 * @returns `true` when a new row was inserted; `false` when skipped
 *          (orphan account or duplicate). Callers aggregate this to
 *          report "N new transactions" to the user.
 */
async function insertTransaction(
  supabase: SupabaseClient,
  userId: string,
  tx: NormalizedTransaction,
): Promise<boolean> {
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("account_id_external", tx.accountId)
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (!account) return false;

  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("transaction_id_external", tx.transactionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return false;

  const { error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      account_id: account.id as string,
      transaction_id_external: tx.transactionId,
      amount: tx.amount.toNumericString(),
      merchant_name: tx.merchantName,
      merchant_category: tx.merchantCategory,
      description: tx.description,
      transaction_date: tx.transactionDate,
      posted_at: tx.postedAt,
      is_recurring: false,
    });

  if (error) {
    throw new Error(`Failed to insert transaction: ${error.message}`);
  }
  return true;
}
