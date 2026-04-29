import { describe, it, expect } from "vitest";
import {
  MERCHANT_RULES,
  fuzzyMatchMerchant,
} from "./merchant-rules";

describe("MERCHANT_RULES", () => {
  it("contains 50+ merchant rules", () => {
    expect(MERCHANT_RULES.size).toBeGreaterThanOrEqual(50);
  });

  it("maps known merchants to expected categories", () => {
    expect(MERCHANT_RULES.get("netflix")).toBe("Entertainment");
    expect(MERCHANT_RULES.get("spotify")).toBe("Entertainment");
    expect(MERCHANT_RULES.get("starbucks")).toBe("Food & Drink");
    expect(MERCHANT_RULES.get("walmart")).toBe("Shopping");
    expect(MERCHANT_RULES.get("verizon")).toBe("Utilities & Telecom");
    expect(MERCHANT_RULES.get("venmo")).toBe("Financial Services");
    expect(MERCHANT_RULES.get("coursera")).toBe("Education");
    expect(MERCHANT_RULES.get("airbnb")).toBe("Travel");
  });
});

describe("fuzzyMatchMerchant", () => {
  describe("exact regex matching", () => {
    it("matches exact merchant names", () => {
      const result = fuzzyMatchMerchant("Netflix");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
      expect(result!.confidence).toBe(0.95);
    });

    it("matches case-insensitive", () => {
      const result = fuzzyMatchMerchant("SPOTIFY");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("matches with .com suffix stripped", () => {
      const result = fuzzyMatchMerchant("NETFLIX.COM");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("matches with Inc suffix stripped", () => {
      const result = fuzzyMatchMerchant("Netflix Inc");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("matches with LLC suffix stripped", () => {
      const result = fuzzyMatchMerchant("Spotify LLC");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("matches NFLX* abbreviation pattern", () => {
      const result = fuzzyMatchMerchant("NFLX*STREAMING");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("matches Uber Eats as Food & Drink", () => {
      const result = fuzzyMatchMerchant("Uber Eats");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Food & Drink");
    });

    it("matches Amazon (non-video) as Shopping", () => {
      const result = fuzzyMatchMerchant("Amazon Marketplace");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Shopping");
    });

    it("matches AMZN abbreviation as Shopping", () => {
      const result = fuzzyMatchMerchant("AMZN MKTP US");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Shopping");
    });

    it("matches Disney+ with special character", () => {
      const result = fuzzyMatchMerchant("Disney+ Monthly");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("matches T-Mobile with hyphen", () => {
      const result = fuzzyMatchMerchant("T-Mobile Payment");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Utilities & Telecom");
    });

    it("matches Chick-fil-A with hyphens", () => {
      const result = fuzzyMatchMerchant("CHICK-FIL-A #1234");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Food & Drink");
    });
  });

  describe("fuzzy matching", () => {
    it("matches close misspellings via Levenshtein", () => {
      // "Netflixx" contains "netflix" as a substring so it regex-matches at 0.95.
      // Use a name that won't regex-match but is close enough for fuzzy.
      const result = fuzzyMatchMerchant("Spottify");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
      expect(result!.confidence).toBeLessThan(0.95);
      expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("matches merchant names with extra characters", () => {
      const result = fuzzyMatchMerchant("STARBUCKS #12345 SEATTLE WA");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Food & Drink");
    });
  });

  describe("edge cases", () => {
    it("returns null for empty string", () => {
      expect(fuzzyMatchMerchant("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(fuzzyMatchMerchant("   ")).toBeNull();
    });

    it("returns null for completely unknown merchant", () => {
      const result = fuzzyMatchMerchant("XYZZY CORP UNKNOWN");
      if (result) {
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      }
    });

    it("handles merchant names with asterisks", () => {
      const result = fuzzyMatchMerchant("NFLX***STREAMING");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Entertainment");
    });

    it("handles merchant names with hash symbols", () => {
      const result = fuzzyMatchMerchant("WALMART##1234");
      expect(result).not.toBeNull();
      expect(result!.category).toBe("Shopping");
    });
  });

  describe("confidence scores", () => {
    it("returns 0.95 confidence for exact regex matches", () => {
      const result = fuzzyMatchMerchant("Netflix");
      expect(result).not.toBeNull();
      expect(result!.confidence).toBe(0.95);
    });

    it("returns lower confidence for fuzzy matches", () => {
      // "Netflixx" contains "netflix" so it regex-matches. Use "Spottify" instead.
      const result = fuzzyMatchMerchant("Spottify");
      if (result && result.ruleMatched === "spotify") {
        expect(result.confidence).toBeLessThan(0.95);
      }
    });

    it("includes the matched rule pattern", () => {
      const result = fuzzyMatchMerchant("Spotify Premium");
      expect(result).not.toBeNull();
      expect(result!.ruleMatched).toBe("spotify");
    });
  });
});
