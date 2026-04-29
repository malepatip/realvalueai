/**
 * DELETE /api/vault/delete/:id
 *
 * Soft delete a credential entry from the vault.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/vault/auth";
import { deleteCredential } from "@/lib/vault/vault";
import { createServerClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function DELETE(
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

    const env = getEnv();
    const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Verify the entry belongs to this user and isn't already deleted
    const { data: entry, error: fetchError } = await supabase
      .from("credential_vault_entries")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json(
        { error: "Credential entry not found" },
        { status: 404 },
      );
    }

    await deleteCredential(supabase, id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
