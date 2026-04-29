import type {
  ChannelAdapter,
  ActionButton,
  MessageResult,
} from "@/types/channels";

/** WhatsApp Cloud API base URL */
const WA_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * WhatsAppAdapter — sends messages via the WhatsApp Business Cloud API.
 *
 * Action buttons are rendered as interactive message buttons
 * for approve / reject / snooze flows.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  async sendText(userId: string, text: string): Promise<MessageResult> {
    const body = {
      messaging_product: "whatsapp",
      to: userId,
      type: "text",
      text: { body: text },
    };
    return this.callApi(body);
  }

  async sendImage(
    userId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<MessageResult> {
    const image: Record<string, string> = { link: imageUrl };
    if (caption) {
      image["caption"] = caption;
    }
    const body = {
      messaging_product: "whatsapp",
      to: userId,
      type: "image",
      image,
    };
    return this.callApi(body);
  }

  async sendActionButtons(
    userId: string,
    text: string,
    buttons: ActionButton[],
  ): Promise<MessageResult> {
    // WhatsApp interactive messages support up to 3 buttons
    const waButtons = buttons.slice(0, 3).map((btn) => ({
      type: "reply" as const,
      reply: { id: btn.callbackData, title: btn.label.slice(0, 20) },
    }));
    const body = {
      messaging_product: "whatsapp",
      to: userId,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons: waButtons },
      },
    };
    return this.callApi(body);
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
   * Call the WhatsApp Cloud API and return a normalised MessageResult.
   */
  private async callApi(body: Record<string, unknown>): Promise<MessageResult> {
    const url = `${WA_API_BASE}/${this.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        messages?: Array<{ id: string }>;
      };
      if (json.messages?.[0]) {
        return {
          success: true,
          messageId: json.messages[0].id,
          channel: "whatsapp",
          fallbackUsed: false,
        };
      }
      return { success: false, channel: "whatsapp", fallbackUsed: false };
    } catch {
      return { success: false, channel: "whatsapp", fallbackUsed: false };
    }
  }
}
