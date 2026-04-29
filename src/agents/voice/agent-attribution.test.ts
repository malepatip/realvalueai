import { describe, it, expect } from "vitest";
import { addAttribution } from "./agent-attribution";

describe("agent-attribution", () => {
  const message = "You have an unused subscription to Netflix.";

  it("prepends conductor attribution", () => {
    const result = addAttribution(message, "conductor");
    expect(result).toBe(`Your team noticed: ${message}`);
  });

  it("prepends watcher attribution", () => {
    const result = addAttribution(message, "watcher");
    expect(result).toBe(`Your Watcher spotted: ${message}`);
  });

  it("prepends fixer attribution", () => {
    const result = addAttribution(message, "fixer");
    expect(result).toBe(`Your Fixer handled: ${message}`);
  });

  it("prepends hunter attribution", () => {
    const result = addAttribution(message, "hunter");
    expect(result).toBe(`Your Hunter found: ${message}`);
  });

  it("returns message unchanged for voice agent (no self-attribution)", () => {
    const result = addAttribution(message, "voice");
    expect(result).toBe(message);
  });

  it("preserves the original message content", () => {
    const result = addAttribution(message, "watcher");
    expect(result).toContain(message);
  });

  it("works with empty message", () => {
    const result = addAttribution("", "watcher");
    expect(result).toBe("Your Watcher spotted: ");
  });

  it("works with empty message for voice", () => {
    const result = addAttribution("", "voice");
    expect(result).toBe("");
  });
});
