/**
 * Tests for Telegram webhook parsing and verification helpers.
 */

import { describe, it, expect } from "vitest";
import {
  parseTelegramUpdate,
  verifyTelegramSignature,
  parseCallbackAction,
} from "./telegram-webhook";

// ---------------------------------------------------------------------------
// parseTelegramUpdate
// ---------------------------------------------------------------------------

describe("parseTelegramUpdate", () => {
  it("parses a regular text message", () => {
    const body = {
      update_id: 100,
      message: {
        message_id: 42,
        from: { id: 12345, first_name: "Alice", last_name: "Smith", username: "alice" },
        chat: { id: 12345 },
        text: "Hello bot",
      },
    };

    const result = parseTelegramUpdate(body);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("message");
    expect(result!.messageText).toBe("Hello bot");
    expect(result!.callbackData).toBeNull();
    expect(result!.callbackQueryId).toBeNull();
    expect(result!.user.id).toBe(12345);
    expect(result!.user.firstName).toBe("Alice");
    expect(result!.user.lastName).toBe("Smith");
    expect(result!.user.username).toBe("alice");
    expect(result!.chatId).toBe(12345);
    expect(result!.messageId).toBe(42);
    expect(result!.rawUpdate).toBe(body);
  });

  it("parses a callback query (button press)", () => {
    const body = {
      update_id: 101,
      callback_query: {
        id: "cb-999",
        from: { id: 67890, first_name: "Bob" },
        message: { message_id: 50, chat: { id: 67890 } },
        data: "approve:action-uuid-123",
      },
    };

    const result = parseTelegramUpdate(body);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("callback_query");
    expect(result!.messageText).toBeNull();
    expect(result!.callbackData).toBe("approve:action-uuid-123");
    expect(result!.callbackQueryId).toBe("cb-999");
    expect(result!.user.id).toBe(67890);
    expect(result!.user.firstName).toBe("Bob");
    expect(result!.chatId).toBe(67890);
    expect(result!.messageId).toBe(50);
  });

  it("returns null for unsupported update types", () => {
    const body = {
      update_id: 102,
      edited_message: { message_id: 1, from: { id: 1, first_name: "X" }, chat: { id: 1 } },
    };

    expect(parseTelegramUpdate(body)).toBeNull();
  });

  it("returns null for empty body", () => {
    expect(parseTelegramUpdate({})).toBeNull();
  });

  it("handles message without text (e.g., photo-only)", () => {
    const body = {
      update_id: 103,
      message: {
        message_id: 60,
        from: { id: 11111, first_name: "Carol" },
        chat: { id: 11111 },
        // no text field
      },
    };

    const result = parseTelegramUpdate(body);
    expect(result).not.toBeNull();
    expect(result!.messageText).toBeNull();
    expect(result!.type).toBe("message");
  });

  it("handles callback query without message (inline mode)", () => {
    const body = {
      update_id: 104,
      callback_query: {
        id: "cb-inline",
        from: { id: 22222, first_name: "Dave" },
        data: "reject:some-id",
      },
    };

    const result = parseTelegramUpdate(body);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("callback_query");
    // chatId falls back to from.id when message is missing
    expect(result!.chatId).toBe(22222);
    expect(result!.messageId).toBeUndefined();
  });

  it("handles callback query without data", () => {
    const body = {
      update_id: 105,
      callback_query: {
        id: "cb-nodata",
        from: { id: 33333, first_name: "Eve" },
        message: { message_id: 70, chat: { id: 33333 } },
      },
    };

    const result = parseTelegramUpdate(body);
    expect(result).not.toBeNull();
    expect(result!.callbackData).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyTelegramSignature
// ---------------------------------------------------------------------------

describe("verifyTelegramSignature", () => {
  const secret = "my-bot-token-secret";

  it("returns true for matching secret", () => {
    expect(verifyTelegramSignature(secret, secret)).toBe(true);
  });

  it("returns false for mismatched secret", () => {
    expect(verifyTelegramSignature("wrong-secret", secret)).toBe(false);
  });

  it("returns false for null header", () => {
    expect(verifyTelegramSignature(null, secret)).toBe(false);
  });

  it("returns false for undefined header", () => {
    expect(verifyTelegramSignature(undefined, secret)).toBe(false);
  });

  it("returns false for empty string header", () => {
    expect(verifyTelegramSignature("", secret)).toBe(false);
  });

  it("is not vulnerable to timing attacks (different lengths)", () => {
    // Different length strings should still return false without throwing
    expect(verifyTelegramSignature("short", "a-much-longer-secret-value")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseCallbackAction
// ---------------------------------------------------------------------------

describe("parseCallbackAction", () => {
  it("parses approve action", () => {
    const result = parseCallbackAction("approve:uuid-123");
    expect(result).toEqual({ action: "approve", actionId: "uuid-123" });
  });

  it("parses reject action", () => {
    const result = parseCallbackAction("reject:action-456");
    expect(result).toEqual({ action: "reject", actionId: "action-456" });
  });

  it("parses snooze action", () => {
    const result = parseCallbackAction("snooze:abc-def");
    expect(result).toEqual({ action: "snooze", actionId: "abc-def" });
  });

  it("returns null for unknown action type", () => {
    expect(parseCallbackAction("cancel:uuid-123")).toBeNull();
  });

  it("returns null for malformed data (no colon)", () => {
    expect(parseCallbackAction("approve")).toBeNull();
  });

  it("returns null for malformed data (too many colons)", () => {
    expect(parseCallbackAction("approve:id:extra")).toBeNull();
  });

  it("returns null for empty action", () => {
    expect(parseCallbackAction(":uuid-123")).toBeNull();
  });

  it("returns null for empty actionId", () => {
    expect(parseCallbackAction("approve:")).toBeNull();
  });
});
