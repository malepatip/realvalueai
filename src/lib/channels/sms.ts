import type {
  ChannelAdapter,
  ActionButton,
  MessageResult,
} from "@/types/channels";

/** Twilio API base URL */
const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

/**
 * SmsAdapter — sends messages via the Twilio SMS API.
 *
 * Since SMS has no native button support, action buttons are rendered as
 * text-based reply codes (e.g., "Reply 1 to approve, 2 to reject, 3 to snooze").
 */
export class SmsAdapter implements ChannelAdapter {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async sendText(userId: string, text: string): Promise<MessageResult> {
    return this.sendSms(userId, text);
  }

  async sendImage(
    userId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<MessageResult> {
    // MMS: include media URL with optional caption
    const text = caption ? `${caption}\n${imageUrl}` : imageUrl;
    return this.sendSms(userId, text, imageUrl);
  }

  async sendActionButtons(
    userId: string,
    text: string,
    buttons: ActionButton[],
  ): Promise<MessageResult> {
    const replyLines = buttons
      .map((btn, i) => `Reply ${i + 1} to ${btn.label}`)
      .join("\n");
    const fullText = `${text}\n\n${replyLines}`;
    return this.sendSms(userId, fullText);
  }

  async sendProgressUpdate(
    userId: string,
    step: string,
    progress: number,
  ): Promise<MessageResult> {
    const pct = Math.round(progress * 100);
    const text = `⏳ ${step} — ${pct}% complete`;
    return this.sendSms(userId, text);
  }

  /**
   * Send an SMS (or MMS) via the Twilio REST API and return a normalised MessageResult.
   */
  private async sendSms(
    to: string,
    body: string,
    mediaUrl?: string,
  ): Promise<MessageResult> {
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`;
    const params = new URLSearchParams({
      To: to,
      From: this.fromNumber,
      Body: body,
    });
    if (mediaUrl) {
      params.append("MediaUrl", mediaUrl);
    }

    const credentials = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString("base64");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: params.toString(),
      });
      const json = (await res.json()) as { sid?: string; status?: string };
      if (json.sid) {
        return {
          success: true,
          messageId: json.sid,
          channel: "sms",
          fallbackUsed: false,
        };
      }
      return { success: false, channel: "sms", fallbackUsed: false };
    } catch {
      return { success: false, channel: "sms", fallbackUsed: false };
    }
  }
}

/**
 * Parse an SMS reply code (e.g., "1", "2", "3") into the corresponding
 * action from the original button list.
 *
 * Returns the matching ActionButton's callbackData, or undefined if invalid.
 */
export function parseSmsReplyCode(
  replyText: string,
  originalButtons: ActionButton[],
): string | undefined {
  const trimmed = replyText.trim();
  const index = parseInt(trimmed, 10);
  if (Number.isNaN(index) || index < 1 || index > originalButtons.length) {
    return undefined;
  }
  return originalButtons[index - 1]?.callbackData;
}
