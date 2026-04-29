import { describe, it, expect, vi } from "vitest";
import { encrypt } from "./crypto";
import {
  storeCredential,
  retrieveCredential,
  listCredentials,
  deleteCredential,
  lockVault,
} from "./vault";

/**
 * Creates a mock Supabase client with chainable query builder.
 * Each test configures the mock's return values as needed.
 */
function createMockSupabase() {
  const mockResult = { data: null as unknown, error: null as unknown };

  const builder = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
    single: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
  };

  const client = {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
    _setResult: (data: unknown, error: unknown = null) => {
      mockResult.data = data;
      mockResult.error = error;
    },
  };

  return client;
}


describe("storeCredential", () => {
  it("encrypts and stores credential, returns entry ID", async () => {
    const mock = createMockSupabase();
    mock._setResult({ id: "entry-uuid-123" });

    const result = await storeCredential(
      mock as never,
      "user-1",
      "Netflix",
      "https://netflix.com",
      "my-password",
      "123456",
    );

    expect(result.entryId).toBe("entry-uuid-123");
    expect(mock.from).toHaveBeenCalledWith("credential_vault_entries");

    // Verify the insert was called with base64-encoded fields
    const insertCall = mock._builder.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertCall.user_id).toBe("user-1");
    expect(insertCall.service_name).toBe("Netflix");
    expect(insertCall.service_url).toBe("https://netflix.com");
    expect(typeof insertCall.encrypted_blob).toBe("string");
    expect(typeof insertCall.salt).toBe("string");
    expect(typeof insertCall.iv).toBe("string");
    expect(typeof insertCall.auth_tag).toBe("string");
    expect(insertCall.is_locked).toBe(false);
    expect(insertCall.is_deleted).toBe(false);
  });

  it("throws on Supabase error", async () => {
    const mock = createMockSupabase();
    mock._setResult(null, { message: "DB error" });

    await expect(
      storeCredential(mock as never, "user-1", "Hulu", null, "pw", "123456"),
    ).rejects.toThrow("Failed to store credential");
  });
});

describe("retrieveCredential", () => {
  it("fetches and decrypts a stored credential", async () => {
    const pin = "123456";
    const plaintext = "super-secret-credential";
    const encrypted = await encrypt(plaintext, pin);

    const mock = createMockSupabase();
    mock._setResult({
      encrypted_blob: encrypted.encryptedBlob.toString("base64"),
      salt: encrypted.salt.toString("base64"),
      iv: encrypted.iv.toString("base64"),
      auth_tag: encrypted.authTag.toString("base64"),
      is_locked: false,
      is_deleted: false,
    });

    const result = await retrieveCredential(mock as never, "entry-1", pin);
    expect(result).toBe(plaintext);
  });

  it("throws when entry is locked", async () => {
    const encrypted = await encrypt("test", "123456");
    const mock = createMockSupabase();
    mock._setResult({
      encrypted_blob: encrypted.encryptedBlob.toString("base64"),
      salt: encrypted.salt.toString("base64"),
      iv: encrypted.iv.toString("base64"),
      auth_tag: encrypted.authTag.toString("base64"),
      is_locked: true,
      is_deleted: false,
    });

    await expect(
      retrieveCredential(mock as never, "entry-1", "123456"),
    ).rejects.toThrow("Credential vault is locked");
  });

  it("throws when entry is deleted", async () => {
    const encrypted = await encrypt("test", "123456");
    const mock = createMockSupabase();
    mock._setResult({
      encrypted_blob: encrypted.encryptedBlob.toString("base64"),
      salt: encrypted.salt.toString("base64"),
      iv: encrypted.iv.toString("base64"),
      auth_tag: encrypted.authTag.toString("base64"),
      is_locked: false,
      is_deleted: true,
    });

    await expect(
      retrieveCredential(mock as never, "entry-1", "123456"),
    ).rejects.toThrow("Credential entry has been deleted");
  });

  it("throws when entry not found", async () => {
    const mock = createMockSupabase();
    mock._setResult(null, { message: "not found" });

    await expect(
      retrieveCredential(mock as never, "nonexistent", "123456"),
    ).rejects.toThrow("Credential entry not found");
  });
});

describe("listCredentials", () => {
  it("returns credential list items without encrypted data", async () => {
    const mock = createMockSupabase();
    mock._setResult([
      {
        id: "entry-1",
        service_name: "Netflix",
        service_url: "https://netflix.com",
        is_locked: false,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "entry-2",
        service_name: "Spotify",
        service_url: null,
        is_locked: true,
        created_at: "2024-01-02T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      },
    ]);

    const items = await listCredentials(mock as never, "user-1");
    expect(items).toHaveLength(2);
    expect(items[0]!.serviceName).toBe("Netflix");
    expect(items[0]!.serviceUrl).toBe("https://netflix.com");
    expect(items[0]!.isLocked).toBe(false);
    expect(items[1]!.serviceName).toBe("Spotify");
    expect(items[1]!.isLocked).toBe(true);

    // Verify only safe columns were selected
    expect(mock._builder.select).toHaveBeenCalledWith(
      "id, service_name, service_url, is_locked, created_at, updated_at",
    );
  });

  it("returns empty array when no credentials exist", async () => {
    const mock = createMockSupabase();
    mock._setResult([]);

    const items = await listCredentials(mock as never, "user-1");
    expect(items).toHaveLength(0);
  });
});

describe("deleteCredential", () => {
  it("soft deletes by setting is_deleted and deleted_at", async () => {
    const mock = createMockSupabase();
    mock._builder.eq.mockImplementation(() => Promise.resolve({ data: null, error: null }));

    await deleteCredential(mock as never, "entry-1");

    expect(mock.from).toHaveBeenCalledWith("credential_vault_entries");
    const updateArg = mock._builder.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(updateArg.is_deleted).toBe(true);
    expect(typeof updateArg.deleted_at).toBe("string");
  });
});

describe("lockVault", () => {
  it("sets is_locked = true on all user entries", async () => {
    const mock = createMockSupabase();
    // lockVault chains .update().eq().eq() — need eq to return chainable then resolve
    let eqCallCount = 0;
    mock._builder.eq.mockImplementation(() => {
      eqCallCount++;
      if (eqCallCount >= 2) {
        return Promise.resolve({ data: null, error: null });
      }
      return mock._builder;
    });

    await lockVault(mock as never, "user-1");

    expect(mock.from).toHaveBeenCalledWith("credential_vault_entries");
    const updateArg = mock._builder.update.mock.calls[0]![0] as Record<string, unknown>;
    expect(updateArg.is_locked).toBe(true);
  });
});
