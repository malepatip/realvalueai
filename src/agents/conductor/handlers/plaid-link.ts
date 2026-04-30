/**
 * /link_bank chat handler — Plaid Hosted Link entry point.
 *
 * Flow:
 *   1. User sends `/link_bank` in Telegram
 *   2. We mint a one-time state UUID and call Plaid's
 *      /link/token/create with `hosted_link.completion_redirect_uri`
 *      pointing at `/api/banking/plaid-callback?state=<state>`
 *   3. Store `state → { userId, chatId, linkToken }` in Redis with a
 *      30-minute TTL (Plaid's hosted_link_url expires in 30 min anyway)
 *   4. Reply with the hosted_link_url — bot DMs it to the user
 *   5. User taps URL → Plaid hosts bank picker + login + MFA on
 *      `link.plaid.com` (their domain) → Plaid redirects to our callback
 *
 * Per Req 22.3, Plaid hosts the credential-entry page; we only host
 * the server-side redirect handler. No web portal pages from us.
 *
 * @module agents/conductor/handlers/plaid-link
 */

import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { createHostedLinkToken } from "@/lib/banking/plaid";
import type {
  ConductorContext,
  ConductorDeps,
  ConductorReply,
} from "../types";

/** Redis key prefix for Plaid Hosted Link session state. */
const PLAID_LINK_STATE_PREFIX = "plaid:link:state:";
/** TTL must match (or be ≤) Plaid's hosted_link_url expiration (30 min). */
const PLAID_LINK_STATE_TTL_SECONDS = 30 * 60;

/** Shape persisted in Redis under a Hosted Link state key. */
export interface PlaidLinkSessionState {
  readonly userId: string;
  readonly chatId: number;
  readonly linkToken: string;
  readonly createdAt: string;
}

export async function handleLinkBank(
  ctx: ConductorContext,
  _intent: unknown,
  deps: ConductorDeps,
): Promise<ConductorReply> {
  const state = randomUUID();
  const completionRedirectUri = `${deps.appUrl}/api/banking/plaid-callback?state=${encodeURIComponent(state)}`;

  let hostedLinkUrl: string;
  let linkToken: string;
  try {
    const result = await createHostedLinkToken(
      {
        clientId: deps.plaidClientId,
        secret: deps.plaidSecret,
        environment: deps.plaidEnv,
      },
      ctx.userId,
      completionRedirectUri,
    );
    hostedLinkUrl = result.hostedLinkUrl;
    linkToken = result.linkToken;
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    return {
      text:
        "I couldn't start the bank-linking flow with Plaid. Try again " +
        `in a minute — if this keeps happening, send /help. (\`${reason.slice(0, 200)}\`)`,
    };
  }

  // Persist state → session mapping. Callback uses this to find the
  // user + link_token after Plaid redirects.
  const sessionState: PlaidLinkSessionState = {
    userId: ctx.userId,
    chatId: ctx.chatId,
    linkToken,
    createdAt: new Date().toISOString(),
  };

  const redis = new Redis(deps.redisUrl, { maxRetriesPerRequest: 3 });
  try {
    await redis.set(
      `${PLAID_LINK_STATE_PREFIX}${state}`,
      JSON.stringify(sessionState),
      "EX",
      PLAID_LINK_STATE_TTL_SECONDS,
    );
  } finally {
    await redis.quit();
  }

  return {
    text:
      "🏦 Tap the link below to connect your bank — you'll go to " +
      "Plaid's secure flow on `link.plaid.com`, sign into your bank, " +
      "and come back here when you're done.\n\n" +
      `${hostedLinkUrl}\n\n` +
      "*The link expires in 30 minutes.* Plaid handles your bank " +
      "credentials directly — they never touch this chat. Send " +
      "`/link_bank` again any time if the link expires.",
  };
}
