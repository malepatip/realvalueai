/**
 * GET /api/vault/list
 *
 * List credentials for the authenticated user.
 * Returns service names and IDs only — never decrypted data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/vault/auth";
import { listCredentials } from "@/lib/vault/vault";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const env = getEnv();
    const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const items = await listCredentials(supabase, userId);

    return NextResponse.json(items, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
