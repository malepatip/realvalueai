import type {
  ChannelAdapter,
  ActionButton,
  MessageResult,
} from "@/types/channels";

/** Telegram Bot API base URL */
const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Build the Telegram Bot API URL for a given method.
 */
function apiUrl(botToken: string, method: string): string {
  return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
}

/**
 * TelegramAdapter — sends messages via the Telegram Bot API.
 *
 * Action buttons are rendered as inline keyboard buttons with callback data
 * for approve / reject / snooze flows.
 */
export class TelegramAdapter implements ChannelAdapter {
  constructor(private readonly botToken: string) {}

  async sendText(userId: string, text: string): Promise<MessageResult> {
    const body = { chat_id: userId, text, parse_mode: "Markdown" };
    return this.callApi("sendMessage", body);
  }

  async sendImage(
    userId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<MessageResult> {
    const body: Record<string, unknown> = {
      chat_id: userId,
      photo: imageUrl,
    };
    if (caption) {
      body["caption"] = caption;
      body["parse_mode"] = "Markdown";
    }
    return this.callApi("sendPhoto", body);
  }

  async sendActionButtons(
    userId: string,
    text: string,
    buttons: ActionButton[],
  ): Promise<MessageResult> {
    const inlineKeyboard = buttons.map((btn) => [
      { text: btn.label, callback_data: btn.callbackData },
    ]);

    const body = {
      chat_id: userId,
      text,
      parse_mode: "Markdown",
      reply_markup: JSON.stringify({ inline_keyboard: inlineKeyboard }),
    };
    return this.callApi("sendMessage", body);
  }

  async sendProgressUpdate(
    userId: string,
    step: string,
    progress: number,
  ): Promise<MessageResult> {
    const pct = Math.round(progress * 100);
    const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
    const text = `⏳ *${step}*\n${bar} ${pct}%`;
    return this.sendText(userId, text);
  }

  /**
   * Call the Telegram Bot API and return a normalised MessageResult.
   */
  private async callApi(
    method: string,
    body: Record<string, unknown>,
  ): Promise<MessageResult> {
    const url = apiUrl(this.botToken, method);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: { message_id: number };
      };
      if (json.ok && json.result) {
        return {
          success: true,
          messageId: String(json.result.message_id),
          channel: "telegram",
          fallbackUsed: false,
        };
      }
      return { success: false, channel: "telegram", fallbackUsed: false };
    } catch {
      return { success: false, channel: "telegram", fallbackUsed: false };
    }
  }
}

/**
 * Build a standard set of approve / reject / snooze action buttons
 * for Telegram inline keyboard usage.
 */
export function buildApproveRejectSnoozeButtons(actionId: string): ActionButton[] {
  return [
    { id: `approve-${actionId}`, label: "✅ Approve", callbackData: `approve:${actionId}` },
    { id: `reject-${actionId}`, label: "❌ Reject", callbackData: `reject:${actionId}` },
    { id: `snooze-${actionId}`, label: "⏰ Snooze", callbackData: `snooze:${actionId}` },
  ];
}
