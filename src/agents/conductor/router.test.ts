import { describe, it, expect } from "vitest";
import { route } from "./router";
import type { ConductorContext, ConductorDeps, Intent } from "./types";

function ctx(overrides: Partial<ConductorContext> = {}): ConductorContext {
  return {
    userId: "user-1",
    telegramUserId: 1,
    chatId: 1,
    messageText: "",
    updateType: "message",
    ...overrides,
  };
}

const STUB_DEPS: ConductorDeps = {
  supabaseUrl: "https://stub.supabase.co",
  supabaseServiceRoleKey: "stub-key",
  redisUrl: "redis://stub",
  encryptionKey: "0".repeat(64),
  plaidClientId: "stub-plaid-client",
  plaidSecret: "stub-plaid-secret",
  plaidEnv: "sandbox",
  appUrl: "https://stub.example.com",
};

describe("route", () => {
  it("routes /start to the crew-intro handler", async () => {
    const intent: Intent = { kind: "command", name: "start", args: [] };
    const reply = await route(ctx({ displayName: "Phani" }), intent, STUB_DEPS);
    expect(reply.text).toContain("Phani");
    expect(reply.text).toContain("Watcher");
    expect(reply.text).toContain("Fixer");
    expect(reply.text).toContain("Hunter");
    expect(reply.text).toContain("Voice");
    expect(reply.text).toContain("/help");
  });

  it("routes /help to the help handler", async () => {
    const intent: Intent = { kind: "command", name: "help", args: [] };
    const reply = await route(ctx(), intent, STUB_DEPS);
    expect(reply.text).toContain("/start");
    expect(reply.text).toContain("/help");
    expect(reply.text).toContain("/link_simplefin");
    expect(reply.text).toContain("/accounts");
  });

  it("falls back gracefully for an unknown command", async () => {
    const intent: Intent = { kind: "command", name: "wat", args: [] };
    const reply = await route(ctx(), intent, STUB_DEPS);
    expect(reply.text).toContain("/wat");
    expect(reply.text).toContain("/help");
  });

  it("acknowledges natural-language messages without going silent", async () => {
    const intent: Intent = { kind: "natural_language", text: "hello" };
    const reply = await route(ctx(), intent, STUB_DEPS);
    expect(reply.text).toContain("/help");
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it("acknowledges callback_query taps and includes the callback id", async () => {
    const intent: Intent = {
      kind: "callback_query",
      action: "approve",
      actionId: "act-1",
    };
    const reply = await route(
      ctx({ updateType: "callback_query", callbackQueryId: "cb-9" }),
      intent,
      STUB_DEPS,
    );
    expect(reply.text).toContain("approve");
    expect(reply.answerCallbackQueryId).toBe("cb-9");
  });

  it("registers /link_simplefin as a wired command", async () => {
    // No-arg form returns instructions and doesn't need real deps.
    const intent: Intent = { kind: "command", name: "link_simplefin", args: [] };
    const reply = await route(ctx(), intent, STUB_DEPS);
    expect(reply.text).toContain("bridge.simplefin.org");
  });
});
