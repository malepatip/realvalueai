import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { generateMagicLinkToken } from "@/lib/auth/magic-link";
import { SmsAdapter } from "@/lib/channels/sms";
import { getEnv } from "@/lib/env";

/** E.164 phone number format: + followed by 1-15 digits */
const MagicLinkRequestSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be in E.164 format (e.g., +14155551234)"),
});

const MAGIC_LINK_BASE_URL = "https://app.realvalue.ai/api/auth/verify";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = MagicLinkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    const { phoneNumber } = parsed.data;
    const env = getEnv();

    // Generate token and store hash in Redis
    const rawToken = await generateMagicLinkToken(phoneNumber, env.REDIS_URL);

    // Construct magic link URL
    const magicLinkUrl = `${MAGIC_LINK_BASE_URL}?token=${rawToken}`;

    // Send via SMS
    const sms = new SmsAdapter(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_FROM_NUMBER,
    );

    await sms.sendText(
      phoneNumber,
      `Your RealValue login link (expires in 15 minutes):\n${magicLinkUrl}`,
    );

    // NEVER return the token in the response
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
