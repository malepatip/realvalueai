import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChannelAdapter, ActionButton, MessageResult } from "@/types/channels";
import { TelegramAdapter, buildApproveRejectSnoozeButtons } from "./telegram";
import { WhatsAppAdapter } from "./whatsapp";
import { SmsAdapter, parseSmsReplyCode } from "./sms";
import { ChannelRouter, type ChannelUserInfo } from "./router";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOk(json: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(json),
    }),
  );
}

function mockFetchReject(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
}

const sampleButtons: ActionButton[] = [
  { id: "a1", label: "✅ Approve", callbackData: "approve:123" },
  { id: "a2", label: "❌ Reject", callbackData: "reject:123" },
  { id: "a3", label: "⏰ Snooze", callbackData: "snooze:123" },
];

// ---------------------------------------------------------------------------
// TelegramAdapter
// ---------------------------------------------------------------------------

describe("TelegramAdapter", () => {
  const adapter = new TelegramAdapter("test-bot-token");

  beforeEach(() => vi.restoreAllMocks());

  it("sendText formats a Telegram sendMessage request", async () => {
    mockFetchOk({ ok: true, result: { message_id: 42 } });
    const result = await adapter.sendText("chat-1", "Hello");

    expect(result.success).toBe(true);
    expect(result.channel).toBe("telegram");
    expect(result.messageId).toBe("42");
    expect(result.fallbackUsed).toBe(false);

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain("/bottest-bot-token/sendMessage");
    const body = JSON.parse(call[1].body as string);
    expect(body.chat_id).toBe("chat-1");
    expect(body.text).toBe("Hello");
    expect(body.parse_mode).toBe("Markdown");
  });

  it("sendImage sends a photo with optional caption", async () => {
    mockFetchOk({ ok: true, result: { message_id: 99 } });
    const result = await adapter.sendImage("chat-1", "https://img.test/pic.png", "Look!");

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain("sendPhoto");
    const body = JSON.parse(call[1].body as string);
    expect(body.photo).toBe("https://img.test/pic.png");
    expect(body.caption).toBe("Look!");
  });

  it("sendActionButtons renders inline keyboard", async () => {
    mockFetchOk({ ok: true, result: { message_id: 7 } });
    const result = await adapter.sendActionButtons("chat-1", "Choose:", sampleButtons);

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    const keyboard = JSON.parse(body.reply_markup);
    expect(keyboard.inline_keyboard).toHaveLength(3);
    expect(keyboard.inline_keyboard[0][0].text).toBe("✅ Approve");
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe("approve:123");
  });

  it("sendProgressUpdate includes progress bar", async () => {
    mockFetchOk({ ok: true, result: { message_id: 1 } });
    const result = await adapter.sendProgressUpdate("chat-1", "Cancelling", 0.5);

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.text).toContain("50%");
    expect(body.text).toContain("Cancelling");
  });

  it("returns failure when API returns ok: false", async () => {
    mockFetchOk({ ok: false });
    const result = await adapter.sendText("chat-1", "Hi");
    expect(result.success).toBe(false);
    expect(result.channel).toBe("telegram");
  });

  it("returns failure on network error", async () => {
    mockFetchReject();
    const result = await adapter.sendText("chat-1", "Hi");
    expect(result.success).toBe(false);
  });
});

describe("buildApproveRejectSnoozeButtons", () => {
  it("creates 3 buttons with correct callback data", () => {
    const buttons = buildApproveRejectSnoozeButtons("action-42");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.callbackData).toBe("approve:action-42");
    expect(buttons[1]!.callbackData).toBe("reject:action-42");
    expect(buttons[2]!.callbackData).toBe("snooze:action-42");
  });
});

// ---------------------------------------------------------------------------
// WhatsAppAdapter
// ---------------------------------------------------------------------------

describe("WhatsAppAdapter", () => {
  const adapter = new WhatsAppAdapter("phone-id-123", "wa-access-token");

  beforeEach(() => vi.restoreAllMocks());

  it("sendText formats a WhatsApp text message", async () => {
    mockFetchOk({ messages: [{ id: "wamid.abc" }] });
    const result = await adapter.sendText("+15551234567", "Hello");

    expect(result.success).toBe(true);
    expect(result.channel).toBe("whatsapp");
    expect(result.messageId).toBe("wamid.abc");

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain("phone-id-123/messages");
    const body = JSON.parse(call[1].body as string);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("+15551234567");
    expect(body.type).toBe("text");
  });

  it("sendActionButtons renders interactive buttons (max 3)", async () => {
    mockFetchOk({ messages: [{ id: "wamid.btn" }] });
    const result = await adapter.sendActionButtons("+15551234567", "Choose:", sampleButtons);

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.type).toBe("interactive");
    expect(body.interactive.type).toBe("button");
    expect(body.interactive.action.buttons).toHaveLength(3);
    expect(body.interactive.action.buttons[0].reply.id).toBe("approve:123");
  });

  it("sendImage includes media link and caption", async () => {
    mockFetchOk({ messages: [{ id: "wamid.img" }] });
    const result = await adapter.sendImage("+15551234567", "https://img.test/pic.png", "Cap");

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.type).toBe("image");
    expect(body.image.link).toBe("https://img.test/pic.png");
    expect(body.image.caption).toBe("Cap");
  });

  it("returns failure on network error", async () => {
    mockFetchReject();
    const result = await adapter.sendText("+15551234567", "Hi");
    expect(result.success).toBe(false);
    expect(result.channel).toBe("whatsapp");
  });
});

// ---------------------------------------------------------------------------
// SmsAdapter
// ---------------------------------------------------------------------------

describe("SmsAdapter", () => {
  const adapter = new SmsAdapter("AC-test-sid", "test-auth-token", "+15550001111");

  beforeEach(() => vi.restoreAllMocks());

  it("sendText sends an SMS via Twilio", async () => {
    mockFetchOk({ sid: "SM123", status: "queued" });
    const result = await adapter.sendText("+15559998888", "Hello SMS");

    expect(result.success).toBe(true);
    expect(result.channel).toBe("sms");
    expect(result.messageId).toBe("SM123");

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain("AC-test-sid/Messages.json");
    expect(call[1].headers).toHaveProperty("Authorization");
    const bodyStr = call[1].body as string;
    expect(bodyStr).toContain("To=%2B15559998888");
    expect(bodyStr).toContain("From=%2B15550001111");
    expect(bodyStr).toContain("Body=Hello+SMS");
  });

  it("sendActionButtons renders text-based reply codes", async () => {
    mockFetchOk({ sid: "SM456" });
    const result = await adapter.sendActionButtons("+15559998888", "Action needed:", sampleButtons);

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const bodyStr = call[1].body as string;
    // URLSearchParams encodes spaces as '+', so decode both forms
    const decoded = decodeURIComponent(bodyStr.replaceAll("+", " "));
    expect(decoded).toContain("Reply 1 to ✅ Approve");
    expect(decoded).toContain("Reply 2 to ❌ Reject");
    expect(decoded).toContain("Reply 3 to ⏰ Snooze");
  });

  it("sendImage includes MediaUrl for MMS", async () => {
    mockFetchOk({ sid: "SM789" });
    const result = await adapter.sendImage("+15559998888", "https://img.test/pic.png", "Look!");

    expect(result.success).toBe(true);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const bodyStr = call[1].body as string;
    const decoded = decodeURIComponent(bodyStr);
    expect(decoded).toContain("MediaUrl=https://img.test/pic.png");
  });

  it("returns failure on network error", async () => {
    mockFetchReject();
    const result = await adapter.sendText("+15559998888", "Hi");
    expect(result.success).toBe(false);
    expect(result.channel).toBe("sms");
  });
});

describe("parseSmsReplyCode", () => {
  it("maps reply '1' to the first button's callbackData", () => {
    expect(parseSmsReplyCode("1", sampleButtons)).toBe("approve:123");
  });

  it("maps reply '2' to the second button's callbackData", () => {
    expect(parseSmsReplyCode("2", sampleButtons)).toBe("reject:123");
  });

  it("maps reply '3' to the third button's callbackData", () => {
    expect(parseSmsReplyCode("3", sampleButtons)).toBe("snooze:123");
  });

  it("returns undefined for out-of-range reply", () => {
    expect(parseSmsReplyCode("0", sampleButtons)).toBeUndefined();
    expect(parseSmsReplyCode("4", sampleButtons)).toBeUndefined();
  });

  it("returns undefined for non-numeric reply", () => {
    expect(parseSmsReplyCode("approve", sampleButtons)).toBeUndefined();
  });

  it("trims whitespace from reply", () => {
    expect(parseSmsReplyCode("  2  ", sampleButtons)).toBe("reject:123");
  });
});

// ---------------------------------------------------------------------------
// ChannelRouter
// ---------------------------------------------------------------------------

describe("ChannelRouter", () => {
  function makeMockAdapter(channel: "telegram" | "whatsapp" | "sms", shouldSucceed = true): ChannelAdapter {
    const result: MessageResult = {
      success: shouldSucceed,
      messageId: shouldSucceed ? `msg-${channel}` : undefined,
      channel,
      fallbackUsed: false,
    };
    return {
      sendText: vi.fn().mockResolvedValue(result),
      sendImage: vi.fn().mockResolvedValue(result),
      sendActionButtons: vi.fn().mockResolvedValue(result),
      sendProgressUpdate: vi.fn().mockResolvedValue(result),
    };
  }

  const freeUser: ChannelUserInfo = {
    phone_number: "+15551234567",
    subscription_tier: "free",
  };

  const premiumUser: ChannelUserInfo = {
    phone_number: "+15559876543",
    subscription_tier: "premium",
  };

  const overrideUser: ChannelUserInfo = {
    phone_number: "+15550001111",
    subscription_tier: "free",
    primary_channel: "whatsapp",
  };

  it("selects Telegram for free-tier users", () => {
    const router = new ChannelRouter(new Map());
    expect(router.selectPrimaryChannel(freeUser)).toBe("telegram");
  });

  it("selects WhatsApp for premium-tier users", () => {
    const router = new ChannelRouter(new Map());
    expect(router.selectPrimaryChannel(premiumUser)).toBe("whatsapp");
  });

  it("selects Telegram for hardship-tier users", () => {
    const router = new ChannelRouter(new Map());
    const hardshipUser: ChannelUserInfo = {
      phone_number: "+15550000000",
      subscription_tier: "hardship",
    };
    expect(router.selectPrimaryChannel(hardshipUser)).toBe("telegram");
  });

  it("respects user preference override", () => {
    const router = new ChannelRouter(new Map());
    expect(router.selectPrimaryChannel(overrideUser)).toBe("whatsapp");
  });

  it("sends via primary channel when it succeeds", async () => {
    const tg = makeMockAdapter("telegram");
    const sms = makeMockAdapter("sms");
    const router = new ChannelRouter(
      new Map([["telegram", tg], ["sms", sms]]),
    );

    const result = await router.sendText(freeUser, "chat-1", "Hello");
    expect(result.success).toBe(true);
    expect(result.channel).toBe("telegram");
    expect(result.fallbackUsed).toBe(false);
    expect(tg.sendText).toHaveBeenCalledOnce();
    expect(sms.sendText).not.toHaveBeenCalled();
  });

  it("falls back to SMS when primary channel fails", async () => {
    const tg = makeMockAdapter("telegram", false);
    const sms = makeMockAdapter("sms");
    const router = new ChannelRouter(
      new Map([["telegram", tg], ["sms", sms]]),
    );

    const result = await router.sendText(freeUser, "chat-1", "Hello");
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(tg.sendText).toHaveBeenCalledOnce();
    expect(sms.sendText).toHaveBeenCalledOnce();
  });

  it("returns failure when both primary and SMS fail", async () => {
    const tg = makeMockAdapter("telegram", false);
    const sms = makeMockAdapter("sms", false);
    const router = new ChannelRouter(
      new Map([["telegram", tg], ["sms", sms]]),
    );

    const result = await router.sendText(freeUser, "chat-1", "Hello");
    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
  });

  it("does not double-fallback when SMS is the primary channel", async () => {
    const sms = makeMockAdapter("sms", false);
    const smsUser: ChannelUserInfo = {
      phone_number: "+15550001111",
      subscription_tier: "free",
      primary_channel: "sms",
    };
    const router = new ChannelRouter(new Map([["sms", sms]]));

    const result = await router.sendText(smsUser, "+15550001111", "Hello");
    expect(result.success).toBe(false);
    expect(sms.sendText).toHaveBeenCalledOnce();
  });

  it("resolveUserByPhone finds user by phone number", () => {
    const router = new ChannelRouter(new Map());
    const users = [freeUser, premiumUser];
    const found = router.resolveUserByPhone("+15559876543", users);
    expect(found).toBe(premiumUser);
  });

  it("resolveUserByPhone returns undefined for unknown phone", () => {
    const router = new ChannelRouter(new Map());
    const found = router.resolveUserByPhone("+10000000000", [freeUser]);
    expect(found).toBeUndefined();
  });

  it("sendActionButtons falls back to SMS on primary failure", async () => {
    const wa = makeMockAdapter("whatsapp", false);
    const sms = makeMockAdapter("sms");
    const router = new ChannelRouter(
      new Map([["whatsapp", wa], ["sms", sms]]),
    );

    const result = await router.sendActionButtons(
      premiumUser, "+15559876543", "Choose:", sampleButtons,
    );
    expect(result.success).toBe(true);
    expect(result.fallbackUsed).toBe(true);
    expect(wa.sendActionButtons).toHaveBeenCalledOnce();
    expect(sms.sendActionButtons).toHaveBeenCalledOnce();
  });
});
