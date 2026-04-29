/**
 * Vault Authentication Helper
 *
 * Extracts user identity from request headers.
 * Placeholder until magic link auth (2.7) is integrated.
 *
 * @module vault/auth
 */

import type { NextRequest } from "next/server";

/**
 * Extract user ID from the request.
 * Currently reads the `x-user-id` header — will be replaced
 * with session-based auth once magic link flow (2.7) ships.
 *
 * @param request - Incoming Next.js request
 * @returns User ID string, or null if unauthenticated
 */
export function getUserIdFromRequest(request: NextRequest): string | null {
  const userId = request.headers.get("x-user-id");
  if (!userId || userId.trim().length === 0) {
    return null;
  }
  return userId.trim();
}
