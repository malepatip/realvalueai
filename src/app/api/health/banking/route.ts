/**
 * Banking integration health probe.
 *
 * Exercises Plaid (sandbox) and SimpleFIN end-to-end against live external
 * APIs, using the same lib functions production code uses. Read-only on our
 * side: never writes to bank_connections / transactions / users.
 *
 * GET /api/health/banking
 *
 * Returns 200 if all sub-checks pass, 503 otherwise. Each sub-check returns
 * a status string and either a `detail` or `error`. PII / tokens are never
 * returned in the response body.
 */

import { NextResponse } from "next/server";
import {
  createLinkToken,
  exchangePublicToken,
  syncTransactions,
  revokeAccessToken,
  type PlaidConfig,
} from "@/lib/banking/plaid";
import { fetchAccounts as simpleFinFetchAccounts } from "@/lib/banking/simplefin";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type CheckResult = {
  status: string;
  detail?: string;
  error?: string;
};

/**
 * Plaid sandbox-only: mint a public_token for a fake institution without
 * needing the browser-based Plaid Link flow. Not part of the production lib
 * because it only works against sandbox.plaid.com.
 */
async function createSandboxPublicToken(config: PlaidConfig): Promise<string> {
  const response = await fetch("https://sandbox.plaid.com/sandbox/public_token/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      secret: config.secret,
      institution_id: "ins_109508", // First Platypus Bank — Plaid's canonical sandbox institution
      initial_products: ["transactions"],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`sandbox/public_token/create failed (${response.status}): ${errText}`);
  }

  const json = (await response.json()) as { public_token?: string };
  if (!json.public_token) {
    throw new Error("sandbox/public_token/create returned no public_token");
  }
  return json.public_token;
}

async function checkPlaid(config: PlaidConfig): Promise<{
  link_token: CheckResult;
  full_flow: CheckResult;
}> {
  const linkResult: CheckResult = await (async () => {
    try {
      const token = await createLinkToken(config, "health-probe-user");
      return { status: "ok", detail: `link_token created (len=${token.length})` };
    } catch (e) {
      return { status: "error", error: e instanceof Error ? e.message : "unknown" };
    }
  })();

  const fullFlowResult: CheckResult = await (async () => {
    let accessToken: string | null = null;
    try {
      const publicToken = await createSandboxPublicToken(config);
      accessToken = await exchangePublicToken(config, publicToken);
      const { transactions, nextCursor } = await syncTransactions(config, accessToken);
      return {
        status: "ok",
        detail: `synced ${transactions.length} txns; cursor len=${nextCursor.length}`,
      };
    } catch (e) {
      return { status: "error", error: e instanceof Error ? e.message : "unknown" };
    } finally {
      if (accessToken) {
        // Best-effort cleanup; don't let revoke failure mask the real result
        revokeAccessToken(config, accessToken).catch(() => undefined);
      }
    }
  })();

  return { link_token: linkResult, full_flow: fullFlowResult };
}

async function checkSimpleFin(accessUrl: string): Promise<CheckResult> {
  try {
    const accounts = await simpleFinFetchAccounts({ accessUrl });
    return {
      status: "ok",
      detail: `fetched ${accounts.length} accounts`,
    };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function GET(): Promise<NextResponse> {
  const env = getEnv();

  const plaidConfig: PlaidConfig = {
    clientId: env.PLAID_CLIENT_ID,
    secret: env.PLAID_SECRET,
    environment: env.PLAID_ENV,
  };

  const [plaid, simplefin] = await Promise.all([
    checkPlaid(plaidConfig),
    checkSimpleFin(env.SIMPLEFIN_ACCESS_URL),
  ]);

  const results = {
    plaid_env: { status: "ok", detail: env.PLAID_ENV },
    plaid_link_token: plaid.link_token,
    plaid_full_flow: plaid.full_flow,
    simplefin_accounts: simplefin,
  };

  const allOk = Object.values(results).every((r) => r.status === "ok");

  return NextResponse.json(
    { status: allOk ? "all_passed" : "some_failed", results },
    { status: allOk ? 200 : 503 },
  );
}
