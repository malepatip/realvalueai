import type { PersonalityMode } from "@/types/voice";

/** User preferences that control how messages are formatted and delivered. */
export interface UserMessagePrefs {
  readonly personality_mode: PersonalityMode;
  readonly locale: string;
  readonly safe_mode_enabled: boolean;
  readonly safe_mode_cover_topic: string;
  readonly stealth_mode_enabled: boolean;
  readonly simplified_mode_enabled: boolean;
}
