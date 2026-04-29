import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCurrentPhase,
  advancePhase,
  downgradePhase,
  executeKillSwitch,
} from "./state-machine";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Creates a chainable Supabase query mock */
function createSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "single") {
            return () =>
              Promise.resolve({
                data: overrides["selectData"] ?? null,
                error: overrides["selectError"] ?? null,
              });
          }
          if (prop === "then") return undefined;
          return (..._args: unknown[]) => chain();
        },
      },
    );

  return {
    from: (_table: string) => chain(),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

/** Creates a mock Supabase client that returns userData for .single() calls */
function createTrackingSupabaseMock(userData: Record<string, unknown>) {
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "single") {
            return () => Promise.resolve({ data: userData, error: null });
          }
          if (prop === "then") {
            // Make the proxy itself resolve as { data: null, error: null }
            // for non-.single() terminal calls (e.g., update().eq())
            return (
              resolve: (v: unknown) => void,
              _reject: (e: unknown) => void,
            ) => resolve({ data: null, error: null });
          }
          return (..._args: unknown[]) => chain();
        },
      },
    );

  return {
    from: (_table: string) => chain(),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function createRedisMock() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(
      async (key: string, value: string, _ex?: string, _ttl?: number) => {
        store.set(key, value);
        return "OK";
      },
    ),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    publish: vi.fn(async () => 1),
    _store: store,
  } as unknown as import("ioredis").default & {
    _store: Map<string, string>;
  };
}

// Mock lockVault and publishEvent
vi.mock("@/lib/vault/vault", () => ({
  lockVault: vi.fn(async () => undefined),
}));

vi.mock("@/lib/agents/pubsub", () => ({
  publishEvent: vi.fn(async () => 1),
  CHANNELS: {
    HEALTH: "agent:health",
    KILL_SWITCH: "agent:kill-switch",
    PRIORITY_CHANGE: "agent:priority-change",
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCurrentPhase", () => {
  it("returns phase from database when cache is empty", async () => {
    const supabase = createSupabaseMock({
      selectData: { trust_phase: "phase_2" },
    });
    const redis = createRedisMock();

    const phase = await getCurrentPhase("user-1", supabase, redis);

    expect(phase).toBe("phase_2");
    expect(redis.set).toHaveBeenCalledWith(
      "trust:phase:user-1",
      "phase_2",
      "EX",
      300,
    );
  });

  it("returns phase from Redis cache when available", async () => {
    const supabase = createSupabaseMock({
      selectData: { trust_phase: "phase_0" },
    });
    const redis = createRedisMock();
    redis._store.set("trust:phase:user-1", "phase_3");

    const phase = await getCurrentPhase("user-1", supabase, redis);

    expect(phase).toBe("phase_3");
  });

  it("works without Redis (optional parameter)", async () => {
    const supabase = createSupabaseMock({
      selectData: { trust_phase: "phase_1" },
    });

    const phase = await getCurrentPhase("user-1", supabase);

    expect(phase).toBe("phase_1");
  });

  it("throws when user not found", async () => {
    const supabase = createSupabaseMock({
      selectData: null,
      selectError: { message: "not found" },
    });

    await expect(getCurrentPhase("missing", supabase)).rejects.toThrow(
      "Failed to fetch trust phase",
    );
  });
});

describe("advancePhase", () => {
  let redis: ReturnType<typeof createRedisMock>;

  beforeEach(() => {
    redis = createRedisMock();
  });

  it("advances phase_0 → phase_1 on bank_connected", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_0" });

    const result = await advancePhase(
      "user-1",
      "bank_connected",
      supabase,
      redis,
    );

    expect(result.success).toBe(true);
    expect(result.previousPhase).toBe("phase_0");
    expect(result.newPhase).toBe("phase_1");
    expect(result.trigger).toBe("bank_connected");
  });

  it("advances phase_1 → phase_2 on actions_enabled", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_1" });

    const result = await advancePhase(
      "user-1",
      "actions_enabled",
      supabase,
      redis,
    );

    expect(result.success).toBe(true);
    expect(result.previousPhase).toBe("phase_1");
    expect(result.newPhase).toBe("phase_2");
  });

  it("rejects invalid transition (e.g., bank_connected from phase_2)", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });

    const result = await advancePhase(
      "user-1",
      "bank_connected",
      supabase,
      redis,
    );

    expect(result.success).toBe(false);
    expect(result.newPhase).toBe("phase_2");
    expect(result.reason).toContain("Invalid transition");
  });

  it("rejects phase3_qualified when eligibility not met", async () => {
    const supabase = createTrackingSupabaseMock({
      trust_phase: "phase_2",
      phase2_approval_count: 5,
      phase2_total_actions: 10,
      kyc_verified: false,
    });

    const result = await advancePhase(
      "user-1",
      "phase3_qualified",
      supabase,
      redis,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Phase 3 eligibility not met");
  });

  it("advances phase_2 → phase_3 when eligible", async () => {
    const supabase = createTrackingSupabaseMock({
      trust_phase: "phase_2",
      phase2_approval_count: 25,
      phase2_total_actions: 30,
      kyc_verified: true,
    });

    const result = await advancePhase(
      "user-1",
      "phase3_qualified",
      supabase,
      redis,
    );

    expect(result.success).toBe(true);
    expect(result.newPhase).toBe("phase_3");
  });

  it("re-engages from killed → phase_0", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "killed" });

    const result = await advancePhase(
      "user-1",
      "user_re_engaged",
      supabase,
      redis,
    );

    expect(result.success).toBe(true);
    expect(result.previousPhase).toBe("killed");
    expect(result.newPhase).toBe("phase_0");
  });

  it("rejects actions_enabled from killed state", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "killed" });

    const result = await advancePhase(
      "user-1",
      "actions_enabled",
      supabase,
      redis,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Invalid transition");
  });
});

describe("downgradePhase", () => {
  let redis: ReturnType<typeof createRedisMock>;

  beforeEach(() => {
    redis = createRedisMock();
  });

  it("downgrades phase_3 → phase_0", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_3" });

    const result = await downgradePhase("user-1", "phase_0", supabase, redis);

    expect(result.success).toBe(true);
    expect(result.previousPhase).toBe("phase_3");
    expect(result.newPhase).toBe("phase_0");
    expect(result.trigger).toBe("voluntary_downgrade");
  });

  it("downgrades phase_3 → phase_1", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_3" });

    const result = await downgradePhase("user-1", "phase_1", supabase, redis);

    expect(result.success).toBe(true);
    expect(result.newPhase).toBe("phase_1");
  });

  it("downgrades phase_2 → phase_1", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });

    const result = await downgradePhase("user-1", "phase_1", supabase, redis);

    expect(result.success).toBe(true);
    expect(result.newPhase).toBe("phase_1");
  });

  it("rejects downgrade to same phase", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });

    const result = await downgradePhase("user-1", "phase_2", supabase, redis);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Cannot downgrade");
  });

  it("rejects downgrade to higher phase", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_1" });

    const result = await downgradePhase("user-1", "phase_3", supabase, redis);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Cannot downgrade");
  });

  it("rejects downgrade from killed state", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "killed" });

    const result = await downgradePhase("user-1", "phase_0", supabase, redis);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Cannot downgrade from killed");
  });

  it("rejects downgrade to killed", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });

    const result = await downgradePhase("user-1", "killed", supabase, redis);

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Cannot downgrade");
  });
});

describe("executeKillSwitch", () => {
  it("completes all steps and returns timing", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });
    const redis = createRedisMock();

    const result = await executeKillSwitch("user-1", supabase, redis);

    expect(result.tokensRevoked).toBe(true);
    expect(result.vaultLocked).toBe(true);
    expect(result.operationsHalted).toBe(true);
    expect(result.confirmationSent).toBe(true);
    expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.totalTimeMs).toBeLessThan(5000);
  });

  it("invalidates Redis cache after kill", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });
    const redis = createRedisMock();
    redis._store.set("trust:phase:user-1", "phase_2");

    await executeKillSwitch("user-1", supabase, redis);

    expect(redis.del).toHaveBeenCalledWith("trust:phase:user-1");
  });

  it("publishes kill event via Redis pub/sub", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });
    const redis = createRedisMock();

    await executeKillSwitch("user-1", supabase, redis);

    const { publishEvent: mockPublish } = await import(
      "@/lib/agents/pubsub"
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "agent:kill-switch",
      expect.objectContaining({ userId: "user-1", action: "kill" }),
      redis,
    );
  });

  it("calls lockVault", async () => {
    const supabase = createTrackingSupabaseMock({ trust_phase: "phase_2" });
    const redis = createRedisMock();

    await executeKillSwitch("user-1", supabase, redis);

    const { lockVault: mockLockVault } = await import("@/lib/vault/vault");
    expect(mockLockVault).toHaveBeenCalledWith(supabase, "user-1");
  });
});
