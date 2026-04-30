import { describe, it, expect } from "vitest";
import { processInboundMessage } from "./worker";
import type { ConductorContext, ConductorDeps } from "./types";

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
};

describe("processInboundMessage (end-to-end conductor)", () => {
  it("greets a /start with the crew intro and a name when available", async () => {
    const reply = await processInboundMessage(
      ctx({ messageText: "/start", displayName: "Phani" }),
      STUB_DEPS,
    );
    expect(reply.text).toMatch(/Hey Phani/);
    expect(reply.text).toContain("Watcher");
  });

  it("falls back to anonymous greeting when no name is set", async () => {
    const reply = await processInboundMessage(
      ctx({ messageText: "/start" }),
      STUB_DEPS,
    );
    expect(reply.text).toMatch(/^Hey — /);
  });

  it("returns the help list for /help", async () => {
    const reply = await processInboundMessage(
      ctx({ messageText: "/help" }),
      STUB_DEPS,
    );
    expect(reply.text).toContain("/start");
    expect(reply.text).toContain("/link_simplefin");
  });

  it("returns the natural-language fallback for free-form text", async () => {
    const reply = await processInboundMessage(
      ctx({ messageText: "what's my balance?" }),
      STUB_DEPS,
    );
    expect(reply.text).toContain("/help");
  });

  it("acknowledges an inline-keyboard button press", async () => {
    const reply = await processInboundMessage(
      ctx({
        updateType: "callback_query",
        callbackAction: "approve",
        callbackActionId: "act-1",
        callbackQueryId: "cb-9",
        messageText: "approve:act-1",
      }),
      STUB_DEPS,
    );
    expect(reply.answerCallbackQueryId).toBe("cb-9");
    expect(reply.text).toContain("approve");
  });

  it("handles a /command@BotName from a group chat", async () => {
    const reply = await processInboundMessage(
      ctx({ messageText: "/start@RealValueAIBot" }),
      STUB_DEPS,
    );
    expect(reply.text).toContain("Watcher");
  });

  it("handles unknown slash commands without throwing", async () => {
    const reply = await processInboundMessage(
      ctx({ messageText: "/wat" }),
      STUB_DEPS,
    );
    expect(reply.text).toContain("/wat");
    expect(reply.text).toContain("/help");
  });

  it("never returns an empty reply", async () => {
    const reply = await processInboundMessage(ctx({ messageText: "" }), STUB_DEPS);
    expect(reply.text.length).toBeGreaterThan(0);
  });
});
