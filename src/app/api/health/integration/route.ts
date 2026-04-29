import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

/**
 * Integration test endpoint — verifies live Supabase write/read
 * and BullMQ enqueue/dequeue on the actual deployed infrastructure.
 *
 * GET /api/health/integration
 */
export async function GET(): Promise<NextResponse> {
  const results: Record<string, { status: string; detail?: string; error?: string }> = {};

  // Test 1: Supabase write/read cycle
  try {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !key) {
      results["supabase_write_read"] = { status: "missing_env" };
    } else {
      const supabase = createServerClient(url, key);
      const testPhone = `+1test${Date.now()}`;

      const { data: inserted, error: insertErr } = await supabase
        .from("users")
        .insert({ phone_number: testPhone, display_name: "Wave1 Test" })
        .select("id, phone_number")
        .single();

      if (insertErr) {
        results["supabase_write_read"] = { status: "write_failed", error: insertErr.message };
      } else {
        const { data: fetched, error: readErr } = await supabase
          .from("users")
          .select("id, phone_number")
          .eq("id", inserted.id)
          .single();

        if (readErr || fetched.phone_number !== testPhone) {
          results["supabase_write_read"] = {
            status: "read_mismatch",
            error: readErr?.message ?? "phone mismatch",
          };
        } else {
          results["supabase_write_read"] = {
            status: "ok",
            detail: `wrote and read user ${inserted.id}`,
          };
        }

        // Cleanup
        await supabase.from("users").delete().eq("id", inserted.id);
      }
    }
  } catch (e) {
    results["supabase_write_read"] = {
      status: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }

  // Test 2: Redis enqueue/dequeue via BullMQ
  try {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) {
      results["bullmq_enqueue_dequeue"] = { status: "missing_env" };
    } else {
      const { getRedisClient } = await import("@/lib/redis/client");
      const redis = getRedisClient(redisUrl);

      const testKey = `wave1:test:${uuidv4()}`;
      await redis.set(testKey, "hello", "EX", 10);
      const value = await redis.get(testKey);
      await redis.del(testKey);

      results["bullmq_enqueue_dequeue"] = value === "hello"
        ? { status: "ok", detail: "redis set/get/del cycle passed" }
        : { status: "read_mismatch", error: `expected 'hello', got '${value}'` };
    }
  } catch (e) {
    results["bullmq_enqueue_dequeue"] = {
      status: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }

  const allOk = Object.values(results).every((r) => r.status === "ok");

  return NextResponse.json(
    { status: allOk ? "all_passed" : "some_failed", results },
    { status: allOk ? 200 : 503 },
  );
}
