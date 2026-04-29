import { describe, it, expect } from "vitest";
import { applyPersonalityMode } from "./personality";

describe("personality", () => {
  const content = "You spent $45 on DoorDash yesterday.";

  describe("savage mode", () => {
    it("adds a roast-style prefix and skull emoji suffix", () => {
      const result = applyPersonalityMode(content, "savage", "en-US");

      // Must have one of the savage prefixes
      const hasSavagePrefix =
        result.startsWith("Real talk: ") ||
        result.startsWith("Not gonna sugarcoat this: ") ||
        result.startsWith("Brace yourself: ") ||
        result.startsWith("Oof. ") ||
        result.startsWith("Yikes. ");

      expect(hasSavagePrefix).toBe(true);
      expect(result).toContain(content);
      expect(result).toContain("💀");
    });

    it("preserves the original content", () => {
      const result = applyPersonalityMode(content, "savage", "en-US");
      expect(result).toContain("$45");
      expect(result).toContain("DoorDash");
    });
  });

  describe("hype mode", () => {
    it("adds an enthusiastic prefix and celebration emojis", () => {
      const result = applyPersonalityMode(content, "hype", "en-US");

      const hasHypePrefix =
        result.startsWith("YOOO ") ||
        result.startsWith("LET'S GO! ") ||
        result.startsWith("BIG MOVES! ") ||
        result.startsWith("AMAZING! ") ||
        result.startsWith("HUGE! ");

      expect(hasHypePrefix).toBe(true);
      expect(result).toContain(content);
      expect(result).toContain("🎉🔥");
    });
  });

  describe("zen mode", () => {
    it("replaces dollar amounts with qualitative descriptions", () => {
      const result = applyPersonalityMode(content, "zen", "en-US");

      expect(result).not.toContain("$45");
      expect(result).toContain("a moderate amount");
    });

    it("adds calming prefix", () => {
      const result = applyPersonalityMode(content, "zen", "en-US");
      expect(result).toContain("🧘 Take a breath.");
    });

    it("maps small amounts correctly", () => {
      const result = applyPersonalityMode(
        "You spent $3.50 on coffee.",
        "zen",
        "en-US",
      );
      expect(result).toContain("a small amount");
      expect(result).not.toContain("$3.50");
    });

    it("maps moderate amounts correctly", () => {
      const result = applyPersonalityMode(
        "Your bill is $75.",
        "zen",
        "en-US",
      );
      expect(result).toContain("a moderate amount");
      expect(result).not.toContain("$75");
    });

    it("maps significant amounts correctly", () => {
      const result = applyPersonalityMode(
        "You spent $350 on electronics.",
        "zen",
        "en-US",
      );
      expect(result).toContain("a significant amount");
      expect(result).not.toContain("$350");
    });

    it("maps large amounts correctly", () => {
      const result = applyPersonalityMode(
        "Your rent is $1,500.",
        "zen",
        "en-US",
      );
      expect(result).toContain("a large amount");
      expect(result).not.toContain("$1,500");
    });

    it("replaces multiple dollar amounts in one message", () => {
      const result = applyPersonalityMode(
        "You spent $5 on coffee and $200 on groceries.",
        "zen",
        "en-US",
      );
      expect(result).not.toContain("$5");
      expect(result).not.toContain("$200");
      expect(result).toContain("a small amount");
      expect(result).toContain("a significant amount");
    });
  });

  describe("mentor mode", () => {
    it("adds educational prefix and suffix", () => {
      const result = applyPersonalityMode(content, "mentor", "en-US");

      expect(result).toContain("📚 Here's what's happening: ");
      expect(result).toContain(content);
      expect(result).toContain("Understanding your finances");
    });

    it("preserves the original content including amounts", () => {
      const result = applyPersonalityMode(content, "mentor", "en-US");
      expect(result).toContain("$45");
      expect(result).toContain("DoorDash");
    });
  });
});
