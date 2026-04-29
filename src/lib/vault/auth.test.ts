import { describe, it, expect } from "vitest";
import { getUserIdFromRequest } from "./auth";

/**
 * Creates a minimal NextRequest-like object with the given headers.
 */
function createMockRequest(headers: Record<string, string> = {}) {
  return {
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("getUserIdFromRequest", () => {
  it("returns user ID from x-user-id header", () => {
    const request = createMockRequest({ "x-user-id": "user-123" });
    expect(getUserIdFromRequest(request)).toBe("user-123");
  });

  it("returns null when x-user-id header is missing", () => {
    const request = createMockRequest({});
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it("returns null when x-user-id header is empty string", () => {
    const request = createMockRequest({ "x-user-id": "" });
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it("returns null when x-user-id header is whitespace only", () => {
    const request = createMockRequest({ "x-user-id": "   " });
    expect(getUserIdFromRequest(request)).toBeNull();
  });

  it("trims whitespace from user ID", () => {
    const request = createMockRequest({ "x-user-id": "  user-456  " });
    expect(getUserIdFromRequest(request)).toBe("user-456");
  });
});
