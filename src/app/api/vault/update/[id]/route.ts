/**
 * PUT /api/vault/update/:id
 *
 * Update a credential by soft-deleting the old entry and
 * creating a new one with re-encrypted data.
 * Never returns credential data, PINs, or encrypted blobs.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getUserIdFromRequest } from "@/lib/vault/auth";
import { storeCredential, deleteCredential } from "@/lib/vault/vault";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const updateBodySchema = z.object({
  credential: z.string().min(1, "credential is required"),
  pin: z.string().min(1, "pin is required"),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await params;
    if (!id || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Validation failed", issues: [{ message: "id parameter is required" }] },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const parsed = updateBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { credential, pin } = parsed.data;
    const env = getEnv();
    const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the old entry to get service name and URL before soft-deleting
    const { data: oldEntry, error: fetchError } = await supabase
      .from("credential_vault_entries")
      .select("service_name, service_url")
      .eq("id", id)
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !oldEntry) {
      return NextResponse.json(
        { error: "Credential entry not found" },
        { status: 404 },
      );
    }

    // Soft delete old entry
    await deleteCredential(supabase, id);

    // Create new entry with re-encrypted credential
    const result = await storeCredential(
      supabase,
      userId,
      oldEntry.service_name as string,
      (oldEntry.service_url as string | null) ?? null,
      credential,
      pin,
    );

    return NextResponse.json({ entryId: result.entryId }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
