import { describe, it, expect } from "vitest";
import {
  formatMessage,
  maskAccountNumbers,
  applySafeMode,
  applyStealthMode,
  applySimplifiedMode,
} from "./formatter";
import type { UserMessagePrefs } from "./types";

/** Helper to build a default prefs object with overrides. */
function makePrefs(overrides: Partial<UserMessagePrefs> = {}): UserMessagePrefs {
  return {
    personality_mode: "mentor",
    locale: "en-US",
    safe_mode_enabled: false,
    safe_mode_cover_topic: "weather",
    stealth_mode_enabled: false,
    simplified_mode_enabled: false,
    ...overrides,
  };
}

describe("maskAccountNumbers", () => {
  it("masks a 10-digit account number to last 4", () => {
    expect(maskAccountNumbers("Account 1234567890")).toBe("Account ****7890");
  });

  it("masks a hyphenated card number", () => {
    expect(maskAccountNumbers("Card 1234-5678-9012-3456")).toBe(
      "Card ****3456",
    );
  });

  it("masks a space-separated account number", () => {
    expect(maskAccountNumbers("Account 1234 5678 9012")).toBe(
      "Account ****9012",
    );
  });

  it("does not mask dollar amounts", () => {
    expect(maskAccountNumbers("You spent $1234567890")).toBe(
      "You spent $1234567890",
    );
  });

  it("does not mask short numbers like dates or counts", () => {
    // Numbers with fewer than 8 digits total should not be masked
    expect(maskAccountNumbers("You have 42 items")).toBe("You have 42 items");
    expect(maskAccountNumbers("Date: 2024")).toBe("Date: 2024");
  });

  it("masks multiple account numbers in one string", () => {
    const input = "From 1234567890 to 9876543210";
    const result = maskAccountNumbers(input);
    expect(result).toBe("From ****7890 to ****3210");
  });

  it("returns unchanged text when no account numbers present", () => {
    const input = "Hello, how are you today?";
    expect(maskAccountNumbers(input)).toBe(input);
  });
});

describe("applySafeMode", () => {
  it("replaces financial content with weather cover", () => {
    const result = applySafeMode(
      "Your account is overdrawn by $500",
      "weather",
    );
    expect(result).toContain("cloudy");
    expect(result).not.toContain("overdrawn");
    expect(result).not.toContain("$500");
  });

  it("replaces financial content with recipes cover", () => {
    const result = applySafeMode(
      "Netflix charged you $22.99",
      "recipes",
    );
    expect(result).toContain("pasta");
    expect(result).not.toContain("Netflix");
    expect(result).not.toContain("$22.99");
  });

  it("replaces financial content with fitness cover", () => {
    const result = applySafeMode(
      "Your savings goal is $10,000",
      "fitness",
    );
    expect(result).toContain("workout");
    expect(result).not.toContain("savings");
    expect(result).not.toContain("$10,000");
  });

  it("replaces financial content with sports cover", () => {
    const result = applySafeMode(
      "Bill increase detected",
      "sports",
    );
    expect(result).toContain("game");
    expect(result).not.toContain("Bill");
  });

  it("uses default cover for unknown topic", () => {
    const result = applySafeMode(
      "Your balance is $2,000",
      "unknown_topic",
    );
    expect(result).toContain("checking in");
    expect(result).not.toContain("balance");
    expect(result).not.toContain("$2,000");
  });

  it("handles case-insensitive cover topics", () => {
    const result = applySafeMode("test", "Weather");
    expect(result).toContain("cloudy");
  });

  it("handles cover topic with whitespace", () => {
    const result = applySafeMode("test", "  recipes  ");
    expect(result).toContain("pasta");
  });
});

describe("applyStealthMode", () => {
  it("removes dollar amounts", () => {
    const result = applyStealthMode("You spent $45.99 on DoorDash");
    expect(result).not.toContain("$45.99");
    expect(result).toContain("[amount]");
    expect(result).toContain("DoorDash");
  });

  it("removes percentage amounts", () => {
    const result = applyStealthMode("Bill increased by 15%");
    expect(result).not.toContain("15%");
    expect(result).toContain("[percentage]");
  });

  it("removes multiple dollar amounts", () => {
    const result = applyStealthMode(
      "From $15.49 to $22.99 — that's a 48% increase",
    );
    expect(result).not.toContain("$15.49");
    expect(result).not.toContain("$22.99");
    expect(result).not.toContain("48%");
    expect(result).toContain("[amount]");
    expect(result).toContain("[percentage]");
  });

  it("removes comma-formatted dollar amounts", () => {
    const result = applyStealthMode("Balance: $1,234.56");
    expect(result).not.toContain("$1,234.56");
    expect(result).toContain("[amount]");
  });

  it("returns unchanged text when no amounts present", () => {
    const input = "Your subscription was cancelled.";
    expect(applyStealthMode(input)).toBe(input);
  });
});

describe("applySimplifiedMode", () => {
  it("limits to 2 sentences", () => {
    const input =
      "First sentence. Second sentence. Third sentence. Fourth sentence.";
    const result = applySimplifiedMode(input);

    const sentenceCount = (result.match(/[.!?](\s|$)/g) ?? []).length;
    expect(sentenceCount).toBeLessThanOrEqual(2);
  });

  it("replaces complex vocabulary with simpler words", () => {
    const input = "Your projected expenditures are insufficient.";
    const result = applySimplifiedMode(input);

    expect(result).toContain("expected");
    expect(result).toContain("spending");
    expect(result).toContain("not enough");
    expect(result).not.toContain("projected");
    expect(result).not.toContain("expenditures");
    expect(result).not.toContain("insufficient");
  });

  it("limits options to 2", () => {
    const input =
      "Choose one:\n1. Cancel subscription\n2. Negotiate rate\n3. Switch provider\n4. Do nothing";
    const result = applySimplifiedMode(input);

    expect(result).toContain("Cancel");
    expect(result).toContain("Negotiate");
    expect(result).not.toContain("Switch provider");
    expect(result).not.toContain("Do nothing");
  });

  it("limits emoji-prefixed options to 2", () => {
    const input =
      "Pick a style:\n🔥 Savage\n🎉 Hype\n🧘 Zen\n📚 Mentor";
    const result = applySimplifiedMode(input);

    expect(result).toContain("Savage");
    expect(result).toContain("Hype");
    expect(result).not.toContain("Zen");
    expect(result).not.toContain("Mentor");
  });

  it("preserves text with fewer than 2 sentences", () => {
    const input = "Your balance is fine.";
    const result = applySimplifiedMode(input);
    expect(result).toBe("Your balance is fine.");
  });

  it("replaces transaction with payment", () => {
    const result = applySimplifiedMode(
      "Your transaction was processed.",
    );
    expect(result).toContain("payment");
    expect(result).not.toContain("transaction");
  });
});

describe("formatMessage", () => {
  it("applies personality mode and returns FormattedMessage", () => {
    const prefs = makePrefs({ personality_mode: "hype" });
    const result = formatMessage("You saved $50!", "user-123", prefs);

    expect(result.personalityMode).toBe("hype");
    expect(result.locale).toBe("en-US");
    expect(result.isSafeMode).toBe(false);
    expect(result.isStealthMode).toBe(false);
    expect(result.isSimplifiedMode).toBe(false);
    expect(result.text).toContain("🎉🔥");
  });

  it("always masks account numbers", () => {
    const prefs = makePrefs();
    const result = formatMessage(
      "Account 1234567890 has a balance of $500.",
      "user-123",
      prefs,
    );

    expect(result.text).toContain("****7890");
    expect(result.text).not.toContain("1234567890");
  });

  it("applies stealth mode when enabled", () => {
    const prefs = makePrefs({ stealth_mode_enabled: true });
    const result = formatMessage(
      "You spent $45.99 on DoorDash.",
      "user-123",
      prefs,
    );

    expect(result.isStealthMode).toBe(true);
    expect(result.text).not.toContain("$45.99");
    expect(result.text).toContain("[amount]");
  });

  it("applies safe mode when enabled — completely replaces content", () => {
    const prefs = makePrefs({
      safe_mode_enabled: true,
      safe_mode_cover_topic: "weather",
    });
    const result = formatMessage(
      "Your account is overdrawn by $500.",
      "user-123",
      prefs,
    );

    expect(result.isSafeMode).toBe(true);
    expect(result.text).toContain("cloudy");
    expect(result.text).not.toContain("overdrawn");
  });

  it("applies simplified mode when enabled", () => {
    const prefs = makePrefs({ simplified_mode_enabled: true });
    const result = formatMessage(
      "Your projected expenditures are about $500 total. This is a significant payment. Please review carefully. Take action soon.",
      "user-123",
      prefs,
    );

    expect(result.isSimplifiedMode).toBe(true);
    // Vocabulary simplified
    expect(result.text).not.toContain("projected");
    expect(result.text).not.toContain("expenditures");
    // Sentence count limited — use the same lookbehind as the implementation
    const sentenceCount = (result.text.match(/(?<!\d)[.!?](\s|$)/g) ?? []).length;
    expect(sentenceCount).toBeLessThanOrEqual(2);
  });

  it("applies all modes together", () => {
    const prefs = makePrefs({
      personality_mode: "savage",
      stealth_mode_enabled: true,
      safe_mode_enabled: true,
      safe_mode_cover_topic: "fitness",
      simplified_mode_enabled: true,
    });
    const result = formatMessage(
      "Account 1234567890 spent $500.",
      "user-123",
      prefs,
    );

    // Safe mode replaces everything, so the final text is the cover
    expect(result.isSafeMode).toBe(true);
    expect(result.text).toContain("workout");
  });
});
