/**
 * Magic-link auth health probe.
 *
 * Two modes:
 *   GET /api/health/auth                       — validates Twilio creds only (no SMS sent, no cost).
 *   GET /api/health/auth?phone=+15551234567    — also sends a real magic-link SMS.
 *
 * Returns 200 if all sub-checks pass, 503 otherwise.
 *
 * Trial-account note: Twilio trials only deliver SMS to verified caller IDs.
 * If the phone parameter isn't your verified number, twilio_send will return
 * status=twilio_rejected and the response code will be 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateMagicLinkToken } from "@/lib/auth/magic-link";
import { SmsAdapter } from "@/lib/channels/sms";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type CheckResult = {
  status: string;
  detail?: string;
  error?: string;
};

const PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "phone must be E.164 (e.g. +14155551234)");

/**
 * Validate Twilio auth without sending an SMS by hitting the Account
 * resource — auth failure returns 401, success returns the account JSON.
 */
async function checkTwilioCreds(
  accountSid: string,
  authToken: string,
): Promise<CheckResult> {
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    if (res.status === 401) {
      return { status: "auth_failed", error: "Twilio rejected SID/token (401)" };
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { status: "error", error: `Twilio ${res.status}: ${errText.slice(0, 200)}` };
    }
    const json = (await res.json()) as { friendly_name?: string; status?: string };
    return {
      status: "ok",
      detail: `account ${json.friendly_name ?? "(unnamed)"} status=${json.status ?? "unknown"}`,
    };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "unknown" };
  }
}

async function sendProbeSms(
  env: ReturnType<typeof getEnv>,
  phoneNumber: string,
): Promise<CheckResult> {
  try {
    const rawToken = await generateMagicLinkToken(phoneNumber, env.REDIS_URL);
    const sms = new SmsAdapter(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_FROM_NUMBER,
    );
    const sent = await sms.sendText(
      phoneNumber,
      `RealValue /api/health/auth probe — magic link generated (len=${rawToken.length}). Test message; safe to ignore.`,
    );
    if (sent.success && sent.messageId) {
      return { status: "ok", detail: `sent SID ${sent.messageId}` };
    }
    return {
      status: "twilio_rejected",
      error:
        "SmsAdapter returned success=false — likely unverified recipient on Twilio trial, or invalid From number",
    };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "unknown" };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();

  const phoneParam = request.nextUrl.searchParams.get("phone");
  let phoneResult: CheckResult = { status: "skipped", detail: "no phone param — creds-only check" };
  let twilioSendResult: CheckResult | null = null;

  if (phoneParam !== null) {
    const parsed = PhoneSchema.safeParse(phoneParam);
    if (!parsed.success) {
      return NextResponse.json(
        {
          status: "bad_request",
          error: parsed.error.issues[0]?.message ?? "invalid phone",
        },
        { status: 400 },
      );
    }
    phoneResult = { status: "ok", detail: parsed.data };
    twilioSendResult = await sendProbeSms(env, parsed.data);
  }

  const credsResult = await checkTwilioCreds(
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_AUTH_TOKEN,
  );

  const results: Record<string, CheckResult> = {
    twilio_creds: credsResult,
    twilio_from: { status: "ok", detail: env.TWILIO_FROM_NUMBER },
    phone_param: phoneResult,
  };
  if (twilioSendResult) {
    results["twilio_send"] = twilioSendResult;
  }

  const allOk = Object.values(results).every(
    (r) => r.status === "ok" || r.status === "skipped",
  );

  return NextResponse.json(
    { status: allOk ? "all_passed" : "some_failed", results },
    { status: allOk ? 200 : 503 },
  );
}
