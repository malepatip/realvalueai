#!/usr/bin/env node
/**
 * Probe the deployed Telegram webhook handler with a synthetic update
 * to isolate "did Telegram deliver?" from "is our handler working?".
 *
 * Sends a fake `message` update with the matching webhook secret and
 * a clearly synthetic telegram_user_id (999999001) so it can't collide
 * with real users.
 *
 * Usage:
 *   TELEGRAM_WEBHOOK_SECRET=... node scripts/probe-telegram-webhook.mjs
 *   node scripts/probe-telegram-webhook.mjs <WEBHOOK_SECRET>
 */

import https from "node:https";

const WEBHOOK_URL = "https://realvalueai.vercel.app/api/webhooks/telegram";

const SECRET = process.argv[2] ?? process.env.TELEGRAM_WEBHOOK_SECRET;

if (!SECRET) {
  console.error(
    "Missing webhook secret. Pass as argv[1] or set TELEGRAM_WEBHOOK_SECRET.\n" +
      "It must match the TELEGRAM_WEBHOOK_SECRET env var deployed to Vercel.",
  );
  process.exit(1);
}

const update = {
  update_id: Date.now(),
  message: {
    message_id: 1,
    from: {
      id: 999999001,
      first_name: "Probe",
      last_name: "User",
      username: "probe_user",
    },
    chat: { id: 999999001 },
    text: "synthetic probe from local script",
  },
};

const body = JSON.stringify(update);

const url = new URL(WEBHOOK_URL);
const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Telegram-Bot-Api-Secret-Token": SECRET,
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => {
    console.log("HTTP", res.statusCode);
    console.log("Body:", data);
    if (res.statusCode === 401) {
      console.log("\n→ 401 means TELEGRAM_WEBHOOK_SECRET in Vercel does not match the secret passed to this script.");
    } else if (res.statusCode === 200 && data.includes('"ok":true')) {
      console.log("\n→ 200 ok. Now check Supabase 'users' table for a row with telegram_user_id = 999999001");
      console.log("  and 'agent_event_logs' for an event_type = 'telegram_message' row.");
    } else {
      console.log("\n→ Unexpected response. Check Vercel runtime logs for the underlying error.");
    }
  });
});

req.on("error", (e) => {
  console.error("Request failed:", e);
  process.exit(1);
});

req.write(body);
req.end();
