/** Supported messaging channel types */
export type ChannelType = "telegram" | "whatsapp" | "sms";

/** Action button rendered in messaging platforms (inline keyboard, interactive message, or reply code) */
export interface ActionButton {
  readonly id: string;
  readonly label: string;
  readonly callbackData: string;
}

/** Result of sending a message through a channel adapter */
export interface MessageResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly channel: ChannelType;
  readonly fallbackUsed: boolean;
}

/** Abstract channel adapter — unified interface across Telegram, WhatsApp, and SMS */
export interface ChannelAdapter {
  sendText(userId: string, text: string): Promise<MessageResult>;
  sendImage(userId: string, imageUrl: string, caption?: string): Promise<MessageResult>;
  sendActionButtons(userId: string, text: string, buttons: ActionButton[]): Promise<MessageResult>;
  sendProgressUpdate(userId: string, step: string, progress: number): Promise<MessageResult>;
}
