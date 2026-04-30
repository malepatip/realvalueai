/**
 * Vault Authentication Helper
 *
 * Extracts user identity from request headers.
 *
 * Placeholder until task 3.10 wires Telegram-resolved session auth.
 * (Magic-link auth from task 2.7 is `[TBD on use]` pending Twilio A2P
 * 10DLC carrier approval; the post-pivot primary auth path is the
 * Telegram-resolved session issued by the 2.1 webhook on a recognized
 * `telegram_user_id`. See tasks.md task 3.10 + 2.8 deferred bullets.)
 *
 * @module vault/auth
 */

import type { NextRequest } from "next/server";

/**
 * Extract user ID from the request.
 *
 * Currently reads the `x-user-id` header — will be replaced with
 * `session_token` cookie + `validateSession()` (Telegram-resolved
 * session) when task 3.10 lands. There are no live callers of these
 * vault routes yet; the swap will happen alongside the chat handlers
 * that invoke them.
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
