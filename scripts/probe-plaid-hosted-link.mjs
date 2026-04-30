#!/usr/bin/env node
/**
 * One-shot probe of Plaid /link/token/create for the Hosted Link flow.
 *
 * Validates the request shape my fixed `createHostedLinkToken()` will
 * send before we deploy + test in Telegram. Saves a deploy round-trip
 * if my fix is wrong.
 *
 * Usage:
 *   PLAID_CLIENT_ID=... PLAID_SECRET=... PLAID_ENV=sandbox \
 *     node scripts/probe-plaid-hosted-link.mjs
 *
 * Or pull from Vercel:
 *   npx vercel env pull .env.local --environment production --yes
 *   node --env-file=.env.local scripts/probe-plaid-hosted-link.mjs
 *
 * Expected success: HTTP 200 with link_token + hosted_link_url.
 * Common failures:
 *   - 400 INVALID_FIELD on redirect_uri → registered URI doesn't match
 *     EXACTLY (no trailing slash, no query string)
 *   - 400 INVALID_PRODUCT → Plaid plan doesn't include "transactions"
 *     (unlikely; transactions is in every plan)
 *   - 401 INVALID_API_KEYS → wrong client_id/secret combo for the env
 */

import https from "node:https";

const clientId = process.env.PLAID_CLIENT_ID;
const secret = process.env.PLAID_SECRET;
const env = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://realvalueai.vercel.app";

if (!clientId || !secret) {
  console.error("Missing PLAID_CLIENT_ID or PLAID_SECRET. Set them via env or:");
  console.error("  npx vercel env pull .env.local --environment production --yes");
  console.error("  node --env-file=.env.local scripts/probe-plaid-hosted-link.mjs");
  process.exit(1);
}

if (env !== "sandbox" && env !== "production") {
  console.error(`Invalid PLAID_ENV=${env} (must be sandbox or production)`);
  process.exit(1);
}

const host = env === "sandbox" ? "sandbox.plaid.com" : "production.plaid.com";

// Same shape as src/lib/banking/plaid.ts createHostedLinkToken() will send.
const fakeUserId = "probe-user-" + Date.now();
const fakeState = "probe-state-" + Date.now();
const redirectUri = `${appUrl}/api/banking/plaid-callback`;
const completionRedirectUri = `${redirectUri}?state=${encodeURIComponent(fakeState)}`;

const body = JSON.stringify({
  client_id: clientId,
  secret,
  user: { client_user_id: fakeUserId },
  client_name: "RealValue AI",
  products: ["transactions"],
  country_codes: ["US"],
  language: "en",
  redirect_uri: redirectUri,
  hosted_link: {
    completion_redirect_uri: completionRedirectUri,
  },
});

console.log("─".repeat(60));
console.log("POST", `https://${host}/link/token/create`);
console.log("redirect_uri:           ", redirectUri);
console.log("completion_redirect_uri:", completionRedirectUri);
console.log("─".repeat(60));

const req = https.request(
  {
    hostname: host,
    path: "/link/token/create",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log("HTTP", res.statusCode);
      // Pretty-print JSON if possible
      try {
        const json = JSON.parse(data);
        if (res.statusCode === 200) {
          console.log("✅ link_token:      ", String(json.link_token).slice(0, 30) + "...");
          console.log("✅ hosted_link_url: ", json.hosted_link_url);
          console.log("✅ expiration:      ", json.expiration);
          console.log("\nThe fix is correct — Plaid accepted the Hosted Link create request.");
          console.log("Safe to commit + deploy.");
        } else {
          console.log("❌ Plaid rejected the request:");
          console.log(JSON.stringify(json, null, 2));
        }
      } catch {
        console.log(data);
      }
    });
  },
);

req.on("error", (e) => {
  console.error("Request failed:", e);
  process.exit(1);
});

req.write(body);
req.end();
