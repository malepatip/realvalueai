import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware — protects portal routes.
 *
 * - Allows `/api/auth/*` and `/api/webhooks/*` without authentication.
 * - Allows `/login` without authentication.
 * - Allows static assets and Next.js internals.
 * - All other routes under `/(portal)/*` require a `session_token` cookie.
 *   If missing, redirects to `/login`.
 *
 * NOTE: This middleware only checks for cookie presence. The actual session
 * validation (Redis lookup) happens in the portal layout server component,
 * which provides a stronger guarantee. The middleware acts as a fast-path
 * redirect for obviously unauthenticated requests.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Allow auth API routes
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow webhook routes
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }

  // Allow other API routes (health, cron, etc.)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow the login page itself
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Allow the root page
  if (pathname === "/") {
    return NextResponse.next();
  }

  // For all other routes (portal pages), check for session cookie
  const sessionToken = request.cookies.get("session_token")?.value;

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
