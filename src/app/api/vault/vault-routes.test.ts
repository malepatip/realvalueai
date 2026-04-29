/**
 * Credential Vault API Routes — Integration Tests
 *
 * Tests the full CRUD flow through the route handlers with mocked
 * Supabase and env dependencies. Verifies:
 * - Store/list/update/delete CRUD flow
 * - Unauthenticated requests rejected with 401
 * - PIN never stored or returned in any response
 * - Soft delete works (entry marked deleted, not removed)
 * - Validation rejects missing/invalid fields
 * - Service name and URL returned in list, but never credential data
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

// Mock env to avoid real env validation
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  }),
}));

// Track Supabase calls via a shared mock builder
const mockResult = { data: null as unknown, error: null as unknown };

const mockBuilder = {
  insert: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
  single: vi.fn().mockImplementation(() => Promise.resolve(mockResult)),
};

vi.mock("@/lib/supabase/client", () => ({
  createServerClient: () => ({
    from: vi.fn().mockReturnValue(mockBuilder),
  }),
}));

// Mock vault functions to isolate route logic from crypto
const mockStoreCredential = vi.fn();
const mockListCredentials = vi.fn();
const mockDeleteCredential = vi.fn();

vi.mock("@/lib/vault/vault", () => ({
  storeCredential: (...args: unknown[]) => mockStoreCredential(...args),
  listCredentials: (...args: unknown[]) => mockListCredentials(...args),
  deleteCredential: (...args: unknown[]) => mockDeleteCredential(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────

function createRequest(
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): NextRequest {
  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function setResult(data: unknown, error: unknown = null) {
  mockResult.data = data;
  mockResult.error = error;
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  setResult(null, null);
});

// ── Store Route Tests ──────────────────────────────────────────────

describe("POST /api/vault/store", () => {
  async function callStore(
    body: unknown,
    headers: Record<string, string> = { "x-user-id": "user-1" },
  ) {
    const { POST } = await import("./store/route");
    const request = createRequest("POST", "/api/vault/store", {
      headers,
      body,
    });
    return POST(request);
  }

  it("stores a credential and returns entryId", async () => {
    mockStoreCredential.mockResolvedValue({ entryId: "new-entry-id" });

    const response = await callStore({
      serviceName: "Netflix",
      serviceUrl: "https://netflix.com",
      credential: "my-password",
      pin: "123456",
    });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.entryId).toBe("new-entry-id");
  });

  it("stores a credential without optional serviceUrl", async () => {
    mockStoreCredential.mockResolvedValue({ entryId: "entry-no-url" });

    const response = await callStore({
      serviceName: "Hulu",
      credential: "secret",
      pin: "9999",
    });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.entryId).toBe("entry-no-url");

    // Verify null was passed for serviceUrl
    expect(mockStoreCredential).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "Hulu",
      null,
      "secret",
      "9999",
    );
  });

  it("never returns credential data or PIN in response", async () => {
    mockStoreCredential.mockResolvedValue({ entryId: "safe-entry" });

    const response = await callStore({
      serviceName: "Test",
      credential: "super-secret",
      pin: "1234",
    });

    const json = await response.json();
    const responseText = JSON.stringify(json);
    expect(responseText).not.toContain("super-secret");
    expect(responseText).not.toContain("1234");
    expect(json).toEqual({ entryId: "safe-entry" });
  });

  it("returns 401 when x-user-id header is missing", async () => {
    const response = await callStore(
      { serviceName: "Test", credential: "pw", pin: "1234" },
      {},
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.error).toBe("Authentication required");
  });

  it("returns 400 when serviceName is missing", async () => {
    const response = await callStore({
      credential: "pw",
      pin: "1234",
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 when credential is missing", async () => {
    const response = await callStore({
      serviceName: "Netflix",
      pin: "1234",
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 when pin is missing", async () => {
    const response = await callStore({
      serviceName: "Netflix",
      credential: "pw",
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 when serviceName is empty string", async () => {
    const response = await callStore({
      serviceName: "",
      credential: "pw",
      pin: "1234",
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 when serviceUrl is not a valid URL", async () => {
    const response = await callStore({
      serviceName: "Netflix",
      serviceUrl: "not-a-url",
      credential: "pw",
      pin: "1234",
    });

    expect(response.status).toBe(400);
  });

  it("returns 500 when vault operation throws", async () => {
    mockStoreCredential.mockRejectedValue(new Error("DB failure"));

    const response = await callStore({
      serviceName: "Netflix",
      credential: "pw",
      pin: "1234",
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Internal server error");
    // Error details not leaked
    expect(JSON.stringify(json)).not.toContain("DB failure");
  });
});

// ── List Route Tests ───────────────────────────────────────────────

describe("GET /api/vault/list", () => {
  async function callList(
    headers: Record<string, string> = { "x-user-id": "user-1" },
  ) {
    const { GET } = await import("./list/route");
    const request = createRequest("GET", "/api/vault/list", { headers });
    return GET(request);
  }

  it("returns credential list items with service info", async () => {
    mockListCredentials.mockResolvedValue([
      {
        id: "entry-1",
        serviceName: "Netflix",
        serviceUrl: "https://netflix.com",
        isLocked: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "entry-2",
        serviceName: "Spotify",
        serviceUrl: null,
        isLocked: true,
        createdAt: "2024-01-02T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
    ]);

    const response = await callList();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveLength(2);
    expect(json[0].serviceName).toBe("Netflix");
    expect(json[0].serviceUrl).toBe("https://netflix.com");
    expect(json[0].isLocked).toBe(false);
    expect(json[1].serviceName).toBe("Spotify");
    expect(json[1].isLocked).toBe(true);
  });

  it("never returns credential data in list response", async () => {
    mockListCredentials.mockResolvedValue([
      {
        id: "entry-1",
        serviceName: "Netflix",
        serviceUrl: null,
        isLocked: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ]);

    const response = await callList();
    const json = await response.json();
    const responseText = JSON.stringify(json);

    // No encrypted data fields should appear
    expect(responseText).not.toContain("encrypted_blob");
    expect(responseText).not.toContain("encryptedBlob");
    expect(responseText).not.toContain("auth_tag");
    expect(responseText).not.toContain("authTag");
  });

  it("returns empty array when no credentials exist", async () => {
    mockListCredentials.mockResolvedValue([]);

    const response = await callList();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await callList({});
    expect(response.status).toBe(401);
  });

  it("returns 500 when list operation throws", async () => {
    mockListCredentials.mockRejectedValue(new Error("DB error"));

    const response = await callList();
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Internal server error");
  });
});

// ── Update Route Tests ─────────────────────────────────────────────

describe("PUT /api/vault/update/:id", () => {
  async function callUpdate(
    id: string,
    body: unknown,
    headers: Record<string, string> = { "x-user-id": "user-1" },
  ) {
    const { PUT } = await import("./update/[id]/route");
    const request = createRequest("PUT", `/api/vault/update/${id}`, {
      headers,
      body,
    });
    return PUT(request, { params: Promise.resolve({ id }) });
  }

  it("soft deletes old entry and creates new one with re-encrypted credential", async () => {
    // Mock: old entry found
    setResult({
      service_name: "Netflix",
      service_url: "https://netflix.com",
    });
    mockDeleteCredential.mockResolvedValue(undefined);
    mockStoreCredential.mockResolvedValue({ entryId: "new-entry-id" });

    const response = await callUpdate("old-entry-id", {
      credential: "new-password",
      pin: "654321",
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.entryId).toBe("new-entry-id");

    // Verify old entry was soft-deleted
    expect(mockDeleteCredential).toHaveBeenCalled();

    // Verify new entry was created with same service name/url
    expect(mockStoreCredential).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "Netflix",
      "https://netflix.com",
      "new-password",
      "654321",
    );
  });

  it("never returns credential data or PIN in update response", async () => {
    setResult({ service_name: "Test", service_url: null });
    mockDeleteCredential.mockResolvedValue(undefined);
    mockStoreCredential.mockResolvedValue({ entryId: "updated-entry" });

    const response = await callUpdate("old-id", {
      credential: "super-secret-new",
      pin: "9999",
    });

    const json = await response.json();
    const responseText = JSON.stringify(json);
    expect(responseText).not.toContain("super-secret-new");
    expect(responseText).not.toContain("9999");
    expect(json).toEqual({ entryId: "updated-entry" });
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await callUpdate(
      "entry-1",
      { credential: "pw", pin: "1234" },
      {},
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 when credential is missing", async () => {
    const response = await callUpdate("entry-1", { pin: "1234" });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Validation failed");
  });

  it("returns 400 when pin is missing", async () => {
    const response = await callUpdate("entry-1", { credential: "pw" });
    expect(response.status).toBe(400);
  });

  it("returns 404 when entry not found", async () => {
    setResult(null, { message: "not found" });

    const response = await callUpdate("nonexistent", {
      credential: "pw",
      pin: "1234",
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Credential entry not found");
  });

  it("returns 500 when store operation throws", async () => {
    setResult({ service_name: "Test", service_url: null });
    mockDeleteCredential.mockResolvedValue(undefined);
    mockStoreCredential.mockRejectedValue(new Error("encrypt failed"));

    const response = await callUpdate("entry-1", {
      credential: "pw",
      pin: "1234",
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(JSON.stringify(json)).not.toContain("encrypt failed");
  });
});

// ── Delete Route Tests ─────────────────────────────────────────────

describe("DELETE /api/vault/delete/:id", () => {
  async function callDelete(
    id: string,
    headers: Record<string, string> = { "x-user-id": "user-1" },
  ) {
    const { DELETE: deleteFn } = await import("./delete/[id]/route");
    const request = createRequest("DELETE", `/api/vault/delete/${id}`, {
      headers,
    });
    return deleteFn(request, { params: Promise.resolve({ id }) });
  }

  it("soft deletes a credential entry and returns success", async () => {
    // Mock: entry found (ownership check)
    setResult({ id: "entry-1" });
    mockDeleteCredential.mockResolvedValue(undefined);

    const response = await callDelete("entry-1");
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toEqual({ success: true });
    expect(mockDeleteCredential).toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const response = await callDelete("entry-1", {});
    expect(response.status).toBe(401);
  });

  it("returns 404 when entry not found or not owned by user", async () => {
    setResult(null, { message: "not found" });

    const response = await callDelete("nonexistent");
    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Credential entry not found");
  });

  it("never returns credential data in delete response", async () => {
    setResult({ id: "entry-1" });
    mockDeleteCredential.mockResolvedValue(undefined);

    const response = await callDelete("entry-1");
    const json = await response.json();
    const responseText = JSON.stringify(json);

    expect(responseText).not.toContain("encrypted");
    expect(responseText).not.toContain("credential");
    expect(json).toEqual({ success: true });
  });

  it("returns 500 when delete operation throws", async () => {
    setResult({ id: "entry-1" });
    mockDeleteCredential.mockRejectedValue(new Error("DB error"));

    const response = await callDelete("entry-1");
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Internal server error");
  });
});

// ── Cross-cutting Security Tests ───────────────────────────────────

describe("Security: no credential leakage", () => {
  it("store response contains only entryId", async () => {
    mockStoreCredential.mockResolvedValue({ entryId: "id-1" });

    const { POST } = await import("./store/route");
    const request = createRequest("POST", "/api/vault/store", {
      headers: { "x-user-id": "user-1" },
      body: { serviceName: "Test", credential: "secret", pin: "1234" },
    });
    const response = await POST(request);
    const json = await response.json();

    expect(Object.keys(json)).toEqual(["entryId"]);
  });

  it("list response contains only safe fields", async () => {
    mockListCredentials.mockResolvedValue([
      {
        id: "e1",
        serviceName: "Svc",
        serviceUrl: null,
        isLocked: false,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
    ]);

    const { GET } = await import("./list/route");
    const request = createRequest("GET", "/api/vault/list", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await GET(request);
    const json = await response.json();

    const allowedKeys = new Set([
      "id",
      "serviceName",
      "serviceUrl",
      "isLocked",
      "createdAt",
      "updatedAt",
    ]);
    for (const item of json) {
      for (const key of Object.keys(item)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });

  it("update response contains only entryId", async () => {
    setResult({ service_name: "Test", service_url: null });
    mockDeleteCredential.mockResolvedValue(undefined);
    mockStoreCredential.mockResolvedValue({ entryId: "id-2" });

    const { PUT } = await import("./update/[id]/route");
    const request = createRequest("PUT", "/api/vault/update/old-id", {
      headers: { "x-user-id": "user-1" },
      body: { credential: "new-pw", pin: "5678" },
    });
    const response = await PUT(request, {
      params: Promise.resolve({ id: "old-id" }),
    });
    const json = await response.json();

    expect(Object.keys(json)).toEqual(["entryId"]);
  });

  it("delete response contains only success flag", async () => {
    setResult({ id: "entry-1" });
    mockDeleteCredential.mockResolvedValue(undefined);

    const { DELETE: deleteFn } = await import("./delete/[id]/route");
    const request = createRequest("DELETE", "/api/vault/delete/entry-1", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await deleteFn(request, {
      params: Promise.resolve({ id: "entry-1" }),
    });
    const json = await response.json();

    expect(Object.keys(json)).toEqual(["success"]);
  });
});
