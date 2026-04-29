import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { verifyMagicLinkToken } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

const VerifyRequestSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const parsed = VerifyRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request" },
        { status: 400 },
      );
    }

    const { token } = parsed.data;
    const env = getEnv();

    // Verify the magic link token (hashes it, looks up in Redis)
    const phoneNumber = await verifyMagicLinkToken(token, env.REDIS_URL);

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    // Look up or create user by phone number
    const supabase = createServerClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("phone_number", phoneNumber)
      .eq("is_deleted", false)
      .single();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id as string;
    } else {
      // Create new user at Phase 0
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({ phone_number: phoneNumber, trust_phase: "phase_0" })
        .select("id")
        .single();

      if (error || !newUser) {
        return NextResponse.json(
          { success: false, error: "Failed to create user" },
          { status: 500 },
        );
      }
      userId = newUser.id as string;
    }

    // Create session in Redis (7-day TTL)
    const sessionToken = await createSession(userId, env.REDIS_URL);

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      sessionToken,
      userId,
    });

    response.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
