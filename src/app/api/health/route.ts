import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, { status: string; error?: string }> = {};

  // Check Supabase
  try {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !key) {
      checks["supabase"] = { status: "missing_env" };
    } else {
      const supabase = createServerClient(url, key);
      const { error } = await supabase.from("users").select("id").limit(1);
      checks["supabase"] = error
        ? { status: "error", error: error.message }
        : { status: "ok" };
    }
  } catch (e) {
    checks["supabase"] = {
      status: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }

  // Check Redis
  try {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) {
      checks["redis"] = { status: "missing_env" };
    } else {
      const { getRedisClient } = await import("@/lib/redis/client");
      const redis = getRedisClient(redisUrl);
      await redis.ping();
      checks["redis"] = { status: "ok" };
    }
  } catch (e) {
    checks["redis"] = {
      status: "error",
      error: e instanceof Error ? e.message : "unknown",
    };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    { status: allOk ? "healthy" : "degraded", checks },
    { status: allOk ? 200 : 503 },
  );
}
