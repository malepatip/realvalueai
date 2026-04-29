/**
 * POST /api/vault/store
 *
 * Encrypt and store a credential in the vault.
 * Never returns credential data, PINs, or encrypted blobs.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getUserIdFromRequest } from "@/lib/vault/auth";
import { storeCredential } from "@/lib/vault/vault";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const storeBodySchema = z.object({
  serviceName: z.string().min(1, "serviceName is required"),
  serviceUrl: z.string().url().optional(),
  credential: z.string().min(1, "credential is required"),
  pin: z.string().min(1, "pin is required"),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const parsed = storeBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { serviceName, serviceUrl, credential, pin } = parsed.data;
    const env = getEnv();
    const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const result = await storeCredential(
      supabase,
      userId,
      serviceName,
      serviceUrl ?? null,
      credential,
      pin,
    );

    return NextResponse.json({ entryId: result.entryId }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
