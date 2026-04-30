/**
 * Tests for the /link_bank Plaid Hosted Link chat handler.
 *
 * Mocks Plaid's createHostedLinkToken and ioredis. Verifies:
 * - Successful flow: hosted_link_url returned in reply, state stored
 *   in Redis with the right TTL and shape
 * - Plaid error: caller sees a friendly error message, nothing in Redis
 * - State token is unique per call (replay protection)
 * - completion_redirect_uri is built correctly from deps.appUrl
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ConductorContext,
  ConductorDeps,
} from "../types";

// ── Mocks ───────────────────────────────────────────────────────────

const mockCreateHostedLinkToken = vi.fn();
vi.mock("@/lib/banking/plaid", () => ({
  createHostedLinkToken: (
    config: unknown,
    userId: string,
    redirectUri: string,
    completionRedirectUri: string,
  ) => mockCreateHostedLinkToken(config, userId, redirectUri, completionRedirectUri),
}));

const redisStore = new Map<string, { value: string; ex: number }>();
const redisCalls: { method: string; args: unknown[] }[] = [];

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(_url: string, _opts?: unknown) {}
    async set(key: string, value: string, mode: string, ex: number) {
      redisCalls.push({ method: "set", args: [key, value, mode, ex] });
      redisStore.set(key, { value, ex });
      return "OK";
    }
    async quit() {
      return "OK";
    }
  },
}));

import { handleLinkBank } from "./plaid-link";

// ── Fixtures ────────────────────────────────────────────────────────

const ctx: ConductorContext = {
  userId: "user-1",
  telegramUserId: 1,
  chatId: 12345,
  messageText: "/link_bank",
  updateType: "message",
};

const DEPS: ConductorDeps = {
  supabaseUrl: "https://stub.supabase.co",
  supabaseServiceRoleKey: "stub-key",
  redisUrl: "redis://stub:6379",
  encryptionKey: "0".repeat(64),
  plaidClientId: "stub-plaid-client",
  plaidSecret: "stub-plaid-secret",
  plaidEnv: "sandbox",
  appUrl: "https://realvalueai.vercel.app",
};

beforeEach(() => {
  vi.clearAllMocks();
  redisStore.clear();
  redisCalls.length = 0;
});

describe("handleLinkBank", () => {
  it("returns a reply containing the hosted_link_url on success", async () => {
    mockCreateHostedLinkToken.mockResolvedValueOnce({
      linkToken: "link-tok-abc",
      hostedLinkUrl: "https://link.plaid.com/?session=xyz",
    });

    const reply = await handleLinkBank(ctx, undefined, DEPS);

    expect(reply.text).toContain("https://link.plaid.com/?session=xyz");
    expect(reply.text).toContain("30 minutes");
    expect(reply.text).toContain("Plaid");
  });

  it("calls Plaid with a bare redirect_uri (matches dashboard) and a state-bearing completion_redirect_uri", async () => {
    mockCreateHostedLinkToken.mockResolvedValueOnce({
      linkToken: "link-tok",
      hostedLinkUrl: "https://link.plaid.com/?session=q",
    });

    await handleLinkBank(ctx, undefined, DEPS);

    expect(mockCreateHostedLinkToken).toHaveBeenCalledOnce();
    const [config, userId, redirectUri, completionRedirectUri] =
      mockCreateHostedLinkToken.mock.calls[0]!;
    expect((config as { clientId: string }).clientId).toBe("stub-plaid-client");
    expect((config as { environment: string }).environment).toBe("sandbox");
    expect(userId).toBe("user-1");
    // redirectUri is bare — no query params (Plaid dashboard match is exact)
    expect(redirectUri).toBe("https://realvalueai.vercel.app/api/banking/plaid-callback");
    // completionRedirectUri carries the state UUID
    expect(completionRedirectUri).toMatch(
      /^https:\/\/realvalueai\.vercel\.app\/api\/banking\/plaid-callback\?state=[A-Za-z0-9-]+$/,
    );
  });

  it("stores the session in Redis keyed by state with a 30-minute TTL", async () => {
    mockCreateHostedLinkToken.mockResolvedValueOnce({
      linkToken: "link-tok-stored",
      hostedLinkUrl: "https://link.plaid.com/?session=q",
    });

    await handleLinkBank(ctx, undefined, DEPS);

    expect(redisCalls).toHaveLength(1);
    const call = redisCalls[0]!;
    expect(call.method).toBe("set");
    const [key, value, mode, ex] = call.args as [string, string, string, number];
    expect(key).toMatch(/^plaid:link:state:[A-Za-z0-9-]+$/);
    expect(mode).toBe("EX");
    expect(ex).toBe(30 * 60);

    const stored = JSON.parse(value) as {
      userId: string;
      chatId: number;
      linkToken: string;
      createdAt: string;
    };
    expect(stored.userId).toBe("user-1");
    expect(stored.chatId).toBe(12345);
    expect(stored.linkToken).toBe("link-tok-stored");
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("each invocation produces a unique state UUID (replay protection)", async () => {
    mockCreateHostedLinkToken.mockResolvedValue({
      linkToken: "link-tok",
      hostedLinkUrl: "https://link.plaid.com/?session=q",
    });

    await handleLinkBank(ctx, undefined, DEPS);
    await handleLinkBank(ctx, undefined, DEPS);

    const calls = mockCreateHostedLinkToken.mock.calls;
    // state is the 4th argument (completion_redirect_uri)
    const state1 = new URL(calls[0]![3] as string).searchParams.get("state");
    const state2 = new URL(calls[1]![3] as string).searchParams.get("state");
    expect(state1).toBeTruthy();
    expect(state2).toBeTruthy();
    expect(state1).not.toBe(state2);
  });

  it("returns a friendly error and stores nothing if Plaid call fails", async () => {
    mockCreateHostedLinkToken.mockRejectedValueOnce(
      new Error("Plaid API error (401): Invalid client_id"),
    );

    const reply = await handleLinkBank(ctx, undefined, DEPS);

    expect(reply.text).toContain("couldn't start");
    expect(reply.text).toContain("Invalid client_id");
    expect(redisCalls).toHaveLength(0);
  });

  it("URL-encodes the state in the completion_redirect_uri (defense-in-depth)", async () => {
    mockCreateHostedLinkToken.mockResolvedValueOnce({
      linkToken: "link-tok",
      hostedLinkUrl: "https://link.plaid.com/?session=q",
    });

    await handleLinkBank(ctx, undefined, DEPS);

    const completionRedirectUri = mockCreateHostedLinkToken.mock.calls[0]![3] as string;
    // randomUUID() produces only [0-9a-f-], so encoding is a no-op in
    // practice. We assert the URI is parseable + the state survives a
    // round-trip URL parse.
    const parsed = new URL(completionRedirectUri);
    const state = parsed.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state).toMatch(/^[A-Za-z0-9-]+$/);
  });
});
