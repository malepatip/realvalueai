import { describe, it, expect } from "vitest";
import { route } from "./router";
import type { ConductorContext, Intent } from "./types";

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

describe("route", () => {
  it("routes /start to the crew-intro handler", () => {
    const intent: Intent = { kind: "command", name: "start", args: [] };
    const reply = route(ctx({ displayName: "Phani" }), intent);
    expect(reply.text).toContain("Phani");
    expect(reply.text).toContain("Watcher");
    expect(reply.text).toContain("Fixer");
    expect(reply.text).toContain("Hunter");
    expect(reply.text).toContain("Voice");
    expect(reply.text).toContain("/help");
  });

  it("routes /help to the help handler", () => {
    const intent: Intent = { kind: "command", name: "help", args: [] };
    const reply = route(ctx(), intent);
    expect(reply.text).toContain("/start");
    expect(reply.text).toContain("/help");
  });

  it("falls back gracefully for an unknown command", () => {
    const intent: Intent = { kind: "command", name: "wat", args: [] };
    const reply = route(ctx(), intent);
    expect(reply.text).toContain("/wat");
    expect(reply.text).toContain("/help");
  });

  it("acknowledges natural-language messages without going silent", () => {
    const intent: Intent = { kind: "natural_language", text: "hello" };
    const reply = route(ctx(), intent);
    expect(reply.text).toContain("/help");
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it("acknowledges callback_query taps and includes the callback id", () => {
    const intent: Intent = {
      kind: "callback_query",
      action: "approve",
      actionId: "act-1",
    };
    const reply = route(
      ctx({ updateType: "callback_query", callbackQueryId: "cb-9" }),
      intent,
    );
    expect(reply.text).toContain("approve");
    expect(reply.answerCallbackQueryId).toBe("cb-9");
  });
});
