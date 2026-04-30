import { describe, it, expect } from "vitest";
import { classify } from "./classifier";
import type { ConductorContext } from "./types";

function ctx(overrides: Partial<ConductorContext>): ConductorContext {
  return {
    userId: "user-1",
    telegramUserId: 1,
    chatId: 1,
    messageText: "",
    updateType: "message",
    ...overrides,
  };
}

describe("classify", () => {
  it("classifies callback_query updates as callback_query intent", () => {
    const result = classify(
      ctx({
        updateType: "callback_query",
        callbackAction: "approve",
        callbackActionId: "act-123",
      }),
    );
    expect(result).toEqual({
      kind: "callback_query",
      action: "approve",
      actionId: "act-123",
    });
  });

  it("uses 'unknown' as the action when callbackAction is missing", () => {
    const result = classify(ctx({ updateType: "callback_query" }));
    expect(result.kind).toBe("callback_query");
    if (result.kind === "callback_query") {
      expect(result.action).toBe("unknown");
      expect(result.actionId).toBe("");
    }
  });

  it("classifies a plain slash command", () => {
    const result = classify(ctx({ messageText: "/start" }));
    expect(result).toEqual({ kind: "command", name: "start", args: [] });
  });

  it("strips the @BotName mention from a group-chat command", () => {
    const result = classify(ctx({ messageText: "/help@RealValueAIBot" }));
    expect(result).toEqual({ kind: "command", name: "help", args: [] });
  });

  it("captures arguments after the command", () => {
    const result = classify(ctx({ messageText: "/link_bank chase" }));
    expect(result).toEqual({
      kind: "command",
      name: "link_bank",
      args: ["chase"],
    });
  });

  it("lowercases the command name", () => {
    const result = classify(ctx({ messageText: "/START" }));
    expect(result.kind).toBe("command");
    if (result.kind === "command") {
      expect(result.name).toBe("start");
    }
  });

  it("trims whitespace before classifying", () => {
    const result = classify(ctx({ messageText: "   /start   " }));
    expect(result).toEqual({ kind: "command", name: "start", args: [] });
  });

  it("classifies a plain message as natural_language", () => {
    const result = classify(ctx({ messageText: "hi there" }));
    expect(result).toEqual({ kind: "natural_language", text: "hi there" });
  });

  it("treats a single slash as natural_language (not a command)", () => {
    const result = classify(ctx({ messageText: "/" }));
    expect(result.kind).toBe("natural_language");
  });

  it("handles empty message as natural_language with empty text", () => {
    const result = classify(ctx({ messageText: "" }));
    expect(result).toEqual({ kind: "natural_language", text: "" });
  });
});
