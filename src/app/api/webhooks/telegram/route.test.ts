/**
 * Integration tests for the Telegram webhook route handler.
 *
 * All external services (Supabase, BullMQ, env) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks — declared before imports that use them
// ---------------------------------------------------------------------------

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockGetQueue = vi.fn().mockReturnValue({ add: mockQueueAdd });

const mockSupabaseFrom = vi.fn();
const mockCreateServerClient = vi.fn().mockReturnValue({ from: mockSupabaseFrom });

vi.mock("@/lib/redis/bullmq", () => ({
  getQueue: (...args: unknown[]) => mockGetQueue(...args),
  QUEUE_NAMES: {
    INBOUND: "inbound-messages",
    CONDUCTOR: "conductor-tasks",
    WATCHER: "watcher-tasks",
    FIXER: "fixer-tasks",
    HUNTER: "hunter-tasks",
    VOICE: "voice-outbound",
    FIXER_BROWSER: "fixer-browser-jobs",
    DEAD_LETTER: "dead-letter",
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    SUPABASE_ANON_KEY: "test-anon-key",
    REDIS_URL: "redis://localhost:6379",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    PLAID_CLIENT_ID: "test",
    PLAID_SECRET: "test",
    SIMPLEFIN_ACCESS_URL: "test",
    NVIDIA_NIM_API_KEY: "test",
    TWILIO_ACCOUNT_SID: "test",
    TWILIO_AUTH_TOKEN: "test",
    ENCRYPTION_KEY: "test",
  }),
}));

vi.mock("uuid", () => ({
  v4: () => "mock-uuid-v4",
}));

import { POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  body: Record<string, unknown>,
  secretToken?: string,
): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secretToken !== undefined) {
    headers.set("x-telegram-bot-api-secret-token", secretToken);
  }
  return new NextRequest("https://example.com/api/webhooks/telegram", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const EXISTING_USER = {
  id: "user-uuid-existing",
  phone_number: "+15551234567",
  telegram_user_id: "12345",
  display_name: "Alice Smith",
  trust_phase: "phase_1",
  subscription_tier: "free",
  personality_mode: "mentor",
  locale: "en-US",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const NEW_USER = {
  id: "user-uuid-new",
  phone_number: "telegram:99999",
  telegram_user_id: "99999",
  display_name: "New User",
  trust_phase: "phase_0",
  subscription_tier: "free",
  personality_mode: "mentor",
  locale: "en-US",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function setupSupabaseMock(options: {
  lookupResult?: Record<string, unknown> | null;
  lookupError?: { message: string } | null;
  createResult?: Record<string, unknown> | null;
  createError?: { message: string } | null;
}): void {
  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: options.lookupResult ?? null,
                error: options.lookupError ?? null,
              }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: options.createResult ?? null,
                error: options.createError ?? null,
              }),
          }),
        }),
      };
    }
    if (table === "agent_event_logs") {
      return {
        insert: () => Promise.resolve({ error: null }),
      };
    }
    return {};
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/webhooks/telegram", () => {
  // ---- Signature verification ----

  it("rejects requests with missing signature header", async () => {
    const req = makeRequest({ update_id: 1, message: { message_id: 1, from: { id: 1, first_name: "X" }, chat: { id: 1 }, text: "hi" } });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("rejects requests with wrong signature", async () => {
    const req = makeRequest(
      { update_id: 1, message: { message_id: 1, from: { id: 1, first_name: "X" }, chat: { id: 1 }, text: "hi" } },
      "wrong-token",
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ---- Body validation ----

  it("rejects body without update_id", async () => {
    const req = makeRequest({ not_an_update: true }, "test-bot-token");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid update body");
  });

  // ---- Unsupported update types ----

  it("returns 200 for unsupported update types without processing", async () => {
    const req = makeRequest(
      { update_id: 200, edited_message: { message_id: 1, from: { id: 1, first_name: "X" }, chat: { id: 1 } } },
      "test-bot-token",
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Should NOT have called Supabase or BullMQ
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  // ---- Existing user — text message ----

  it("processes a text message from an existing user", async () => {
    setupSupabaseMock({ lookupResult: EXISTING_USER });

    const req = makeRequest(
      {
        update_id: 300,
        message: {
          message_id: 42,
          from: { id: 12345, first_name: "Alice", last_name: "Smith" },
          chat: { id: 12345 },
          text: "Check my balance",
        },
      },
      "test-bot-token",
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Verify queue was called
    expect(mockGetQueue).toHaveBeenCalledWith("inbound-messages", "redis://localhost:6379");
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);

    const [jobName, agentMessage, jobOpts] = mockQueueAdd.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>];
    expect(jobName).toBe("telegram-webhook");
    expect(agentMessage).toMatchObject({
      sourceAgent: "voice",
      targetAgent: "conductor",
      type: "event",
      userId: "user-uuid-existing",
    });
    expect((agentMessage["payload"] as Record<string, unknown>)["messageText"]).toBe("Check my balance");
    expect((agentMessage["payload"] as Record<string, unknown>)["channel"]).toBe("telegram");
    expect((agentMessage["payload"] as Record<string, unknown>)["updateType"]).toBe("message");
    // Regular messages get priority 2
    expect(jobOpts["priority"]).toBe(2);
  });

  // ---- New user creation ----

  it("creates a new user at Phase 0 when telegram_user_id not found", async () => {
    setupSupabaseMock({
      lookupResult: null,
      createResult: NEW_USER,
    });

    const req = makeRequest(
      {
        update_id: 400,
        message: {
          message_id: 1,
          from: { id: 99999, first_name: "New", last_name: "User" },
          chat: { id: 99999 },
          text: "Hello",
        },
      },
      "test-bot-token",
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify user insert was called (via the from chain)
    expect(mockSupabaseFrom).toHaveBeenCalledWith("users");

    // Verify enqueue used the new user's ID
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const agentMessage = mockQueueAdd.mock.calls[0]![1] as Record<string, unknown>;
    expect(agentMessage["userId"]).toBe("user-uuid-new");
  });

  // ---- Callback query (approve/reject/snooze) ----

  it("processes a callback query and maps to correct action", async () => {
    setupSupabaseMock({ lookupResult: EXISTING_USER });

    const req = makeRequest(
      {
        update_id: 500,
        callback_query: {
          id: "cb-123",
          from: { id: 12345, first_name: "Alice" },
          message: { message_id: 50, chat: { id: 12345 } },
          data: "approve:action-uuid-abc",
        },
      },
      "test-bot-token",
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const agentMessage = mockQueueAdd.mock.calls[0]![1] as Record<string, unknown>;
    const payload = agentMessage["payload"] as Record<string, unknown>;
    expect(payload["updateType"]).toBe("callback_query");
    expect(payload["callbackAction"]).toBe("approve");
    expect(payload["callbackActionId"]).toBe("action-uuid-abc");
    expect(payload["callbackQueryId"]).toBe("cb-123");
    expect(payload["callbackData"]).toBe("approve:action-uuid-abc");

    // Callback queries get priority 1 (higher than regular messages)
    const jobOpts = mockQueueAdd.mock.calls[0]![2] as Record<string, unknown>;
    expect(jobOpts["priority"]).toBe(1);
  });

  it("processes reject callback query", async () => {
    setupSupabaseMock({ lookupResult: EXISTING_USER });

    const req = makeRequest(
      {
        update_id: 501,
        callback_query: {
          id: "cb-456",
          from: { id: 12345, first_name: "Alice" },
          message: { message_id: 51, chat: { id: 12345 } },
          data: "reject:action-uuid-def",
        },
      },
      "test-bot-token",
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const payload = (mockQueueAdd.mock.calls[0]![1] as Record<string, unknown>)["payload"] as Record<string, unknown>;
    expect(payload["callbackAction"]).toBe("reject");
    expect(payload["callbackActionId"]).toBe("action-uuid-def");
  });

  it("processes snooze callback query", async () => {
    setupSupabaseMock({ lookupResult: EXISTING_USER });

    const req = makeRequest(
      {
        update_id: 502,
        callback_query: {
          id: "cb-789",
          from: { id: 12345, first_name: "Alice" },
          message: { message_id: 52, chat: { id: 12345 } },
          data: "snooze:action-uuid-ghi",
        },
      },
      "test-bot-token",
    );

    const res = await POST(req);
    expect(res.status).toBe(200);

    const payload = (mockQueueAdd.mock.calls[0]![1] as Record<string, unknown>)["payload"] as Record<string, unknown>;
    expect(payload["callbackAction"]).toBe("snooze");
    expect(payload["callbackActionId"]).toBe("action-uuid-ghi");
  });

  // ---- Event logging ----

  it("logs raw event to agent_event_logs", async () => {
    setupSupabaseMock({ lookupResult: EXISTING_USER });

    const req = makeRequest(
      {
        update_id: 600,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Alice" },
          chat: { id: 12345 },
          text: "hi",
        },
      },
      "test-bot-token",
    );

    await POST(req);

    // agent_event_logs insert should have been called
    expect(mockSupabaseFrom).toHaveBeenCalledWith("agent_event_logs");
  });

  // ---- Error resilience ----

  it("returns 200 even when user lookup fails (prevents Telegram retry storms)", async () => {
    setupSupabaseMock({ lookupError: { message: "DB connection failed" } });

    const req = makeRequest(
      {
        update_id: 700,
        message: {
          message_id: 1,
          from: { id: 12345, first_name: "Alice" },
          chat: { id: 12345 },
          text: "hi",
        },
      },
      "test-bot-token",
    );

    const res = await POST(req);
    // Should still return 200 to prevent Telegram retries
    expect(res.status).toBe(200);
    // Queue should NOT have been called since user resolution failed
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
