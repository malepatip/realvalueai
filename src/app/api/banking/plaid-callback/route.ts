/**
 * Plaid Hosted Link callback.
 *
 * Plaid redirects the user here after they finish the Hosted Link
 * flow on `link.plaid.com`. We:
 *   1. Read the `state` query param we minted in handleLinkBank
 *   2. Look up the corresponding session in Redis (userId + chatId + linkToken)
 *   3. Call Plaid /link/token/get to retrieve the public_token
 *   4. Exchange the public_token for a long-lived access_token
 *   5. Encrypt the access_token and insert into bank_connections
 *   6. Advance the user's trust phase 0 → 1
 *   7. DM the user via Telegram to confirm
 *   8. Render a tiny "tap to return to RealValue" HTML page
 *
 * This is a server-side redirect handler — NOT a portal page. Per
 * Req 22.3, the only HTML we render is the closing courtesy message
 * with a tg:// deep link. No login, no app state.
 *
 * @module api/banking/plaid-callback
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import {
  getHostedLinkResult,
  exchangePublicToken,
  type PlaidConfig,
} from "@/lib/banking/plaid";
import { encryptToken } from "@/lib/banking/adapter";
import { advancePhase } from "@/lib/trust/state-machine";
import { TelegramAdapter } from "@/lib/channels/telegram";
import { getEnv } from "@/lib/env";
import type { PlaidLinkSessionState } from "@/agents/conductor/handlers/plaid-link";

export const dynamic = "force-dynamic";

const PLAID_LINK_STATE_PREFIX = "plaid:link:state:";

/** Render a minimal HTML response that lets the user return to Telegram. */
function htmlResponse(opts: {
  title: string;
  message: string;
  showReturnButton?: boolean;
  status: number;
}): NextResponse {
  const returnButton = opts.showReturnButton
    ? `<p style="margin-top:1.5rem"><a href="tg://resolve?domain=RealValueAIBot" style="display:inline-block;padding:0.75rem 1.25rem;background:#0088cc;color:white;text-decoration:none;border-radius:6px;font-weight:600">Open RealValue in Telegram</a></p>`
    : "";

  const body = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${opts.title} — RealValue AI</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:3rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a;text-align:center">
  <h1 style="margin-bottom:1rem">${opts.title}</h1>
  <p>${opts.message}</p>
  ${returnButton}
</body>
</html>`;

  return new NextResponse(body, {
    status: opts.status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Env validation outside the request try/catch so misconfig surfaces
  // as a 500 with a visible log line rather than a confusing user-facing error.
  const env = getEnv();

  const state = request.nextUrl.searchParams.get("state");
  if (!state) {
    return htmlResponse({
      status: 400,
      title: "Missing state",
      message:
        "This bank-linking link is missing a required parameter. Please " +
        "go back to Telegram and run /link_bank again.",
    });
  }

  // Look up the Redis session keyed by state.
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
  let session: PlaidLinkSessionState | null = null;
  try {
    const raw = await redis.get(`${PLAID_LINK_STATE_PREFIX}${state}`);
    if (raw) {
      try {
        session = JSON.parse(raw) as PlaidLinkSessionState;
      } catch {
        session = null;
      }
    }
    // Best-effort: clear the state key so it can't be replayed.
    if (session) {
      await redis.del(`${PLAID_LINK_STATE_PREFIX}${state}`);
    }
  } finally {
    await redis.quit();
  }

  if (!session) {
    return htmlResponse({
      status: 404,
      title: "Session expired",
      message:
        "This bank-linking link has expired or was already used. " +
        "Go back to Telegram and run /link_bank again to get a fresh link.",
      showReturnButton: true,
    });
  }

  const plaidConfig: PlaidConfig = {
    clientId: env.PLAID_CLIENT_ID,
    secret: env.PLAID_SECRET,
    environment: env.PLAID_ENV,
  };

  // 1. Get public_token from the completed Hosted Link session
  let linkResult: Awaited<ReturnType<typeof getHostedLinkResult>>;
  try {
    linkResult = await getHostedLinkResult(plaidConfig, session.linkToken);
  } catch (e) {
    console.error(
      "Plaid /link/token/get failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return htmlResponse({
      status: 502,
      title: "Plaid lookup failed",
      message:
        "I couldn't retrieve your bank-link result from Plaid. " +
        "Please try /link_bank again in Telegram.",
      showReturnButton: true,
    });
  }

  if (!linkResult) {
    return htmlResponse({
      status: 200,
      title: "Not finished",
      message:
        "It looks like the bank-linking flow didn't complete successfully. " +
        "Please go back to Telegram and run /link_bank to try again.",
      showReturnButton: true,
    });
  }

  // 2. Exchange public_token → access_token
  let accessToken: string;
  try {
    accessToken = await exchangePublicToken(plaidConfig, linkResult.publicToken);
  } catch (e) {
    console.error(
      "Plaid /item/public_token/exchange failed:",
      e instanceof Error ? e.message : "unknown",
    );
    return htmlResponse({
      status: 502,
      title: "Token exchange failed",
      message:
        "I couldn't finalize the bank link. Please try /link_bank again in Telegram.",
      showReturnButton: true,
    });
  }

  // 3. Encrypt + insert into bank_connections
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const encrypted = encryptToken(accessToken, env.ENCRYPTION_KEY);

  const insertPayload: Record<string, unknown> = {
    user_id: session.userId,
    provider: "plaid",
    access_token_encrypted: encrypted,
    institution_name: linkResult.institutionName ?? "Plaid Bank",
    status: "active",
  };
  if (linkResult.institutionId) {
    insertPayload["institution_id"] = linkResult.institutionId;
  }

  const { error: insertError } = await supabase
    .from("bank_connections")
    .insert(insertPayload);

  if (insertError) {
    console.error("bank_connections insert failed:", insertError.message);
    return htmlResponse({
      status: 500,
      title: "Storage failed",
      message:
        "I validated your bank link but couldn't save it. Please try " +
        "/link_bank again in Telegram.",
      showReturnButton: true,
    });
  }

  // 4. Advance trust phase 0 → 1 (best-effort)
  let phaseNote = "";
  try {
    const phaseRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });
    try {
      const result = await advancePhase(
        session.userId,
        "bank_connected",
        supabase,
        phaseRedis,
      );
      if (result.success && result.previousPhase !== result.newPhase) {
        phaseNote = `\n\n🎯 Trust phase advanced: ${result.previousPhase} → ${result.newPhase}.`;
      }
    } finally {
      await phaseRedis.quit();
    }
  } catch {
    // Non-fatal — connection is already saved.
  }

  // 5. DM the user via Telegram (best-effort)
  try {
    const tg = new TelegramAdapter(env.TELEGRAM_BOT_TOKEN);
    const institutionLabel = linkResult.institutionName ?? "your bank";
    await tg.sendText(
      String(session.chatId),
      `✅ ${institutionLabel} connected via Plaid. I'll start ` +
        `monitoring transactions and surface insights as I learn ` +
        `your patterns.${phaseNote}\n\n` +
        "Send `/accounts` to see what's connected.",
    );
  } catch (e) {
    console.error(
      "Plaid callback Telegram DM failed (non-fatal):",
      e instanceof Error ? e.message : "unknown",
    );
  }

  // 6. Render the closing courtesy page with a tg:// deep link
  return htmlResponse({
    status: 200,
    title: "✅ All set!",
    message:
      `<strong>${linkResult.institutionName ?? "Your bank"}</strong> is connected. ` +
      "You can close this tab — I've already sent you a confirmation in Telegram.",
    showReturnButton: true,
  });
}
