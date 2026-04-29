/**
 * Credential Vault Operations
 *
 * High-level vault operations for storing, retrieving, listing,
 * deleting, and locking credentials in Supabase.
 *
 * PIN never stored — only used transiently for key derivation.
 * Never log credentials, PINs, or decrypted data.
 *
 * @module vault/vault
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CredentialVaultEntry } from "@/types/database";
import { encrypt, decrypt, type EncryptedData } from "./crypto";

/** Result of a store operation */
export interface StoreCredentialResult {
  readonly entryId: string;
}

/** Credential listing item — no decrypted data */
export interface CredentialListItem {
  readonly id: string;
  readonly serviceName: string;
  readonly serviceUrl: string | null;
  readonly isLocked: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}


/**
 * Encrypt and store a credential in the vault.
 *
 * @param supabase - Supabase client
 * @param userId - Owner user ID
 * @param serviceName - Name of the service (e.g. "Netflix")
 * @param serviceUrl - URL of the service
 * @param credential - Plaintext credential to encrypt
 * @param pin - User's PIN for key derivation (never stored)
 * @returns The new entry ID
 */
export async function storeCredential(
  supabase: SupabaseClient,
  userId: string,
  serviceName: string,
  serviceUrl: string | null,
  credential: string,
  pin: string,
): Promise<StoreCredentialResult> {
  const encrypted = await encrypt(credential, pin);

  const { data, error } = await supabase
    .from("credential_vault_entries")
    .insert({
      user_id: userId,
      service_name: serviceName,
      service_url: serviceUrl,
      encrypted_blob: encrypted.encryptedBlob.toString("base64"),
      salt: encrypted.salt.toString("base64"),
      iv: encrypted.iv.toString("base64"),
      auth_tag: encrypted.authTag.toString("base64"),
      is_locked: false,
      is_deleted: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to store credential: ${error.message}`);
  }

  return { entryId: data.id as string };
}

/**
 * Fetch and decrypt a credential from the vault.
 * For ephemeral container use only — decrypted data should be
 * discarded from memory immediately after use.
 *
 * @param supabase - Supabase client
 * @param entryId - Vault entry ID
 * @param pin - User's PIN for key derivation
 * @returns Decrypted credential string
 * @throws Error if entry not found, locked, deleted, or PIN is wrong
 */
export async function retrieveCredential(
  supabase: SupabaseClient,
  entryId: string,
  pin: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("credential_vault_entries")
    .select("encrypted_blob, salt, iv, auth_tag, is_locked, is_deleted")
    .eq("id", entryId)
    .single();

  if (error || !data) {
    throw new Error("Credential entry not found");
  }

  const entry = data as Pick<CredentialVaultEntry, "encrypted_blob" | "salt" | "iv" | "auth_tag" | "is_locked" | "is_deleted">;

  if (entry.is_deleted) {
    throw new Error("Credential entry has been deleted");
  }

  if (entry.is_locked) {
    throw new Error("Credential vault is locked");
  }

  const encryptedData: EncryptedData = {
    encryptedBlob: Buffer.from(entry.encrypted_blob, "base64"),
    salt: Buffer.from(entry.salt, "base64"),
    iv: Buffer.from(entry.iv, "base64"),
    authTag: Buffer.from(entry.auth_tag, "base64"),
  };

  return decrypt(encryptedData, pin);
}

/**
 * List credentials for a user without decryption.
 * Returns service names and IDs only — never decrypted data.
 *
 * @param supabase - Supabase client
 * @param userId - Owner user ID
 * @returns Array of credential list items
 */
export async function listCredentials(
  supabase: SupabaseClient,
  userId: string,
): Promise<readonly CredentialListItem[]> {
  const { data, error } = await supabase
    .from("credential_vault_entries")
    .select("id, service_name, service_url, is_locked, created_at, updated_at")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list credentials: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    serviceName: row.service_name as string,
    serviceUrl: row.service_url as string | null,
    isLocked: row.is_locked as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

/**
 * Soft delete a credential entry.
 *
 * @param supabase - Supabase client
 * @param entryId - Vault entry ID to delete
 */
export async function deleteCredential(
  supabase: SupabaseClient,
  entryId: string,
): Promise<void> {
  const { error } = await supabase
    .from("credential_vault_entries")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", entryId);

  if (error) {
    throw new Error(`Failed to delete credential: ${error.message}`);
  }
}

/**
 * Lock all vault entries for a user (kill switch).
 * Sets is_locked = true on every entry, preventing decryption.
 *
 * @param supabase - Supabase client
 * @param userId - Owner user ID
 */
export async function lockVault(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("credential_vault_entries")
    .update({ is_locked: true })
    .eq("user_id", userId)
    .eq("is_deleted", false);

  if (error) {
    throw new Error(`Failed to lock vault: ${error.message}`);
  }
}
