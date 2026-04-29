/**
 * Channel adapter re-exports.
 *
 * The canonical ChannelAdapter interface, ActionButton, and MessageResult
 * types live in `@/types/channels.ts`. This module re-exports them for
 * convenience so consumers within `src/lib/channels/` can import from a
 * single location.
 */
export type {
  ChannelAdapter,
  ChannelType,
  ActionButton,
  MessageResult,
} from "@/types/channels";
