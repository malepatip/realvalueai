import { describe, it, expect } from "vitest";
import { processInboundMessage } from "./worker";
import type { ConductorContext } from "./types";

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

describe("processInboundMessage (end-to-end conductor)", () => {
  it("greets a /start with the crew intro and a name when available", () => {
    const reply = processInboundMessage(
      ctx({ messageText: "/start", displayName: "Phani" }),
    );
    expect(reply.text).toMatch(/Hey Phani/);
    expect(reply.text).toContain("Watcher");
  });

  it("falls back to anonymous greeting when no name is set", () => {
    const reply = processInboundMessage(ctx({ messageText: "/start" }));
    expect(reply.text).toMatch(/^Hey — /);
  });

  it("returns the help list for /help", () => {
    const reply = processInboundMessage(ctx({ messageText: "/help" }));
    expect(reply.text).toContain("/start");
    expect(reply.text).toContain("/help");
  });

  it("returns the natural-language fallback for free-form text", () => {
    const reply = processInboundMessage(
      ctx({ messageText: "what's my balance?" }),
    );
    expect(reply.text).toContain("/help");
  });

  it("acknowledges an inline-keyboard button press", () => {
    const reply = processInboundMessage(
      ctx({
        updateType: "callback_query",
        callbackAction: "approve",
        callbackActionId: "act-1",
        callbackQueryId: "cb-9",
        messageText: "approve:act-1",
      }),
    );
    expect(reply.answerCallbackQueryId).toBe("cb-9");
    expect(reply.text).toContain("approve");
  });

  it("handles a /command@BotName from a group chat", () => {
    const reply = processInboundMessage(
      ctx({ messageText: "/start@RealValueAIBot" }),
    );
    expect(reply.text).toContain("Watcher");
  });

  it("handles unknown slash commands without throwing", () => {
    const reply = processInboundMessage(ctx({ messageText: "/wat" }));
    expect(reply.text).toContain("/wat");
    expect(reply.text).toContain("/help");
  });

  it("never returns an empty reply", () => {
    const reply = processInboundMessage(ctx({ messageText: "" }));
    expect(reply.text.length).toBeGreaterThan(0);
  });
});
