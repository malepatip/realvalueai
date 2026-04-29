import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock next/server — lightweight stubs for NextRequest / NextResponse
// ---------------------------------------------------------------------------
function createMockRequest(
  url: string,
  cookies: Record<string, string> = {},
): { nextUrl: { pathname: string }; url: string; cookies: { get: (name: string) => { value: string } | undefined } } {
  const parsed = new URL(url, "http://localhost:3000");
  return {
    nextUrl: { pathname: parsed.pathname },
    url,
    cookies: {
      get(name: string) {
        const val = cookies[name];
        return val !== undefined ? { value: val } : undefined;
      },
    },
  };
}

// Track calls to NextResponse static methods
const nextCalls: { type: "next" | "redirect"; url?: string }[] = [];

vi.mock("next/server", () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    next: vi.fn().mockImplementation(() => {
      const res = { type: "next" as const };
      nextCalls.push(res);
      return res;
    }),
    redirect: vi.fn().mockImplementation((url: URL) => {
      const res = { type: "redirect" as const, url: url.toString() };
      nextCalls.push(res);
      return res;
    }),
  },
}));

import { middleware } from "./middleware";

beforeEach(() => {
  nextCalls.length = 0;
  vi.clearAllMocks();
});

describe("middleware", () => {
  it("allows /api/auth/* routes without authentication", () => {
    const req = createMockRequest("http://localhost:3000/api/auth/magic-link");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("allows /api/auth/verify without authentication", () => {
    const req = createMockRequest("http://localhost:3000/api/auth/verify");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("allows /api/webhooks/* routes without authentication", () => {
    const req = createMockRequest("http://localhost:3000/api/webhooks/telegram");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("allows /api/health without authentication", () => {
    const req = createMockRequest("http://localhost:3000/api/health");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("allows /login without authentication", () => {
    const req = createMockRequest("http://localhost:3000/login");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("allows / (root) without authentication", () => {
    const req = createMockRequest("http://localhost:3000/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("redirects to /login when no session cookie on portal route", () => {
    const req = createMockRequest("http://localhost:3000/dashboard");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any) as { type: string; url?: string };
    expect(res).toHaveProperty("type", "redirect");
    expect(res.url).toContain("/login");
  });

  it("allows portal route when session cookie is present", () => {
    const req = createMockRequest("http://localhost:3000/dashboard", {
      session_token: "valid-session-token",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });

  it("redirects unauthenticated requests to nested portal routes", () => {
    const req = createMockRequest("http://localhost:3000/settings/profile");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any) as { type: string; url?: string };
    expect(res).toHaveProperty("type", "redirect");
    expect(res.url).toContain("/login");
  });

  it("allows nested portal routes when session cookie is present", () => {
    const req = createMockRequest("http://localhost:3000/settings/profile", {
      session_token: "my-session",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = middleware(req as any);
    expect(res).toHaveProperty("type", "next");
  });
});
