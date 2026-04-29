#!/usr/bin/env node
/**
 * One-off helper to register the Telegram webhook with our deployed Vercel app.
 *
 * Usage:
 *   node scripts/register-telegram-webhook.mjs <BOT_TOKEN> [WEBHOOK_SECRET]
 *
 * BOT_TOKEN may also come from $TELEGRAM_BOT_TOKEN.
 * WEBHOOK_SECRET may also come from $TELEGRAM_WEBHOOK_SECRET. It MUST match the
 * TELEGRAM_WEBHOOK_SECRET env var set in Vercel for the deployed handler to
 * accept webhooks.
 *
 * Prints the response from setWebhook and then getWebhookInfo so we can
 * verify wiring in one call.
 */

import https from "node:https";

const WEBHOOK_URL = "https://realvalueai.vercel.app/api/webhooks/telegram";

const botToken = process.argv[2] ?? process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.argv[3] ?? process.env.TELEGRAM_WEBHOOK_SECRET;

if (!botToken) {
  console.error(
    "Missing bot token. Pass as argv[1] or set TELEGRAM_BOT_TOKEN.\n" +
      "Usage: node scripts/register-telegram-webhook.mjs <BOT_TOKEN> [WEBHOOK_SECRET]",
  );
  process.exit(1);
}

if (!webhookSecret) {
  console.error(
    "Missing webhook secret. Pass as argv[2] or set TELEGRAM_WEBHOOK_SECRET.\n" +
      "It must match the TELEGRAM_WEBHOOK_SECRET env var deployed to Vercel.",
  );
  process.exit(1);
}

function callTelegram(method, params) {
  const query = new URLSearchParams(params).toString();
  const path = `/bot${botToken}/${method}${query ? `?${query}` : ""}`;
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: "api.telegram.org", path }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
  });
}

const main = async () => {
  console.log("--- setWebhook ---");
  const setResp = await callTelegram("setWebhook", {
    url: WEBHOOK_URL,
    secret_token: webhookSecret,
    allowed_updates: JSON.stringify(["message", "callback_query"]),
  });
  console.log(setResp);

  console.log("\n--- getWebhookInfo ---");
  const infoResp = await callTelegram("getWebhookInfo", {});
  console.log(infoResp);
};

main().catch((e) => {
  console.error("Request failed:", e);
  process.exit(1);
});
