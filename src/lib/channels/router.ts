import type {
  ChannelAdapter,
  ChannelType,
  ActionButton,
  MessageResult,
} from "@/types/channels";

/** User info needed by the router to select a channel. */
export interface ChannelUserInfo {
  readonly phone_number: string;
  readonly subscription_tier: "free" | "premium" | "hardship";
  readonly primary_channel?: ChannelType | null;
}

/** Fallback timeout in milliseconds (30 seconds per design). */
const FALLBACK_TIMEOUT_MS = 30_000;

/**
 * ChannelRouter — selects the primary messaging channel based on
 * subscription tier and user preference, with SMS fallback.
 *
 * Channel selection rules:
 *   - Free / Hardship → Telegram (default)
 *   - Premium → WhatsApp (default)
 *   - User preference override takes priority
 *
 * Fallback: if the primary channel fails, retry on SMS within 30 seconds.
 * Cross-platform user recognition is by phone number.
 */
export class ChannelRouter {
  private readonly adapters: ReadonlyMap<ChannelType, ChannelAdapter>;
  private readonly smsAdapter: ChannelAdapter | undefined;

  constructor(adapters: Map<ChannelType, ChannelAdapter>) {
    this.adapters = adapters;
    this.smsAdapter = adapters.get("sms");
  }

  /**
   * Determine the primary channel for a user based on tier + preference.
   */
  selectPrimaryChannel(user: ChannelUserInfo): ChannelType {
    if (user.primary_channel) {
      return user.primary_channel;
    }
    return user.subscription_tier === "premium" ? "whatsapp" : "telegram";
  }

  /**
   * Send a text message via the user's primary channel, falling back to SMS
   * if the primary fails.
   */
  async sendText(
    user: ChannelUserInfo,
    userId: string,
    text: string,
  ): Promise<MessageResult> {
    return this.sendWithFallback(user, (adapter) =>
      adapter.sendText(userId, text),
    );
  }

  /**
   * Send an image via the user's primary channel with SMS fallback.
   */
  async sendImage(
    user: ChannelUserInfo,
    userId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<MessageResult> {
    return this.sendWithFallback(user, (adapter) =>
      adapter.sendImage(userId, imageUrl, caption),
    );
  }

  /**
   * Send action buttons via the user's primary channel with SMS fallback.
   */
  async sendActionButtons(
    user: ChannelUserInfo,
    userId: string,
    text: string,
    buttons: ActionButton[],
  ): Promise<MessageResult> {
    return this.sendWithFallback(user, (adapter) =>
      adapter.sendActionButtons(userId, text, buttons),
    );
  }

  /**
   * Send a progress update via the user's primary channel with SMS fallback.
   */
  async sendProgressUpdate(
    user: ChannelUserInfo,
    userId: string,
    step: string,
    progress: number,
  ): Promise<MessageResult> {
    return this.sendWithFallback(user, (adapter) =>
      adapter.sendProgressUpdate(userId, step, progress),
    );
  }

  /**
   * Look up a user's phone number to enable cross-platform recognition.
   * The phone number is the canonical identity across all channels.
   */
  resolveUserByPhone(phoneNumber: string, users: ChannelUserInfo[]): ChannelUserInfo | undefined {
    return users.find((u) => u.phone_number === phoneNumber);
  }

  /**
   * Attempt to send via the primary channel. If it fails, fall back to SMS
   * within the 30-second window.
   */
  private async sendWithFallback(
    user: ChannelUserInfo,
    send: (adapter: ChannelAdapter) => Promise<MessageResult>,
  ): Promise<MessageResult> {
    const primaryChannel = this.selectPrimaryChannel(user);
    const primaryAdapter = this.adapters.get(primaryChannel);

    if (primaryAdapter) {
      const result = await this.withTimeout(send(primaryAdapter), FALLBACK_TIMEOUT_MS);
      if (result.success) {
        return result;
      }
    }

    // Fallback to SMS if primary failed and SMS adapter is available
    if (this.smsAdapter && primaryChannel !== "sms") {
      const fallbackResult = await send(this.smsAdapter);
      return {
        ...fallbackResult,
        fallbackUsed: true,
      };
    }

    return {
      success: false,
      channel: primaryChannel,
      fallbackUsed: false,
    };
  }

  /**
   * Race a promise against a timeout. Returns a failure MessageResult
   * if the timeout fires first.
   */
  private async withTimeout(
    promise: Promise<MessageResult>,
    timeoutMs: number,
  ): Promise<MessageResult> {
    return Promise.race([
      promise,
      new Promise<MessageResult>((resolve) =>
        setTimeout(
          () =>
            resolve({
              success: false,
              channel: "telegram",
              fallbackUsed: false,
            }),
          timeoutMs,
        ),
      ),
    ]);
  }
}
