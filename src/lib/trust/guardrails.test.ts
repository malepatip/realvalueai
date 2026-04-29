import { describe, it, expect } from "vitest";
import {
  enforceGuardrails,
  classifyActionTier,
  getDailyAggregate,
} from "./guardrails";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createSupabaseMock(rows: Array<Record<string, unknown>> = []) {
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (
              resolve: (v: unknown) => void,
              _reject: (e: unknown) => void,
            ) => resolve({ data: rows, error: null });
          }
          return (..._args: unknown[]) => chain();
        },
      },
    );

  return {
    from: (_table: string) => chain(),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ---------------------------------------------------------------------------
// enforceGuardrails
// ---------------------------------------------------------------------------

describe("enforceGuardrails", () => {
  const baseAction = {
    amount: "10.00",
    actionType: "cancel",
    isReversible: true,
  };

  describe("Phase 0 and Phase 1", () => {
    it("rejects all actions in phase_0", async () => {
      const supabase = createSupabaseMock();
      const result = await enforceGuardrails(
        "user-1",
        baseAction,
        "phase_0",
        supabase,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not permitted");
      expect(result.phase).toBe("phase_0");
    });

    it("rejects all actions in phase_1", async () => {
      const supabase = createSupabaseMock();
      const result = await enforceGuardrails(
        "user-1",
        baseAction,
        "phase_1",
        supabase,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not permitted");
    });
  });

  describe("killed state", () => {
    it("rejects all actions in killed state", async () => {
      const supabase = createSupabaseMock();
      const result = await enforceGuardrails(
        "user-1",
        baseAction,
        "killed",
        supabase,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("killed state");
    });
  });

  describe("Phase 2 limits", () => {
    it("allows action within per-action and daily limits", async () => {
      const supabase = createSupabaseMock([]); // no prior actions today
      const result = await enforceGuardrails(
        "user-1",
        { amount: "20.00", actionType: "cancel", isReversible: true },
        "phase_2",
        supabase,
      );

      expect(result.allowed).toBe(true);
      expect(result.remainingDailyLimit).toBe("80.0000");
    });

    it("rejects action exceeding $25 per-action limit", async () => {
      const supabase = createSupabaseMock([]);
      const result = await enforceGuardrails(
        "user-1",
        { amount: "30.00", actionType: "cancel", isReversible: true },
        "phase_2",
        supabase,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("per-action limit");
    });

    it("rejects action that would exceed $100 daily aggregate", async () => {
      // Already spent $90 today
      const supabase = createSupabaseMock([
        { financial_impact: "50.00" },
        { financial_impact: "40.00" },
      ]);
      const result = await enforceGuardrails(
        "user-1",
        { amount: "15.00", actionType: "cancel", isReversible: true },
        "phase_2",
        supabase,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("daily limit");
    });

    it("allows action right at the daily limit boundary", async () => {
      // Already spent $75 today, adding $25 = exactly $100
      const supabase = createSupabaseMock([{ financial_impact: "75.00" }]);
      const result = await enforceGuardrails(
        "user-1",
        { amount: "25.00", actionType: "cancel", isReversible: true },
        "phase_2",
        supabase,
      );

      expect(result.allowed).toBe(true);
      expect(result.remainingDailyLimit).toBe("0.0000");
    });

    it("handles exact per-action limit ($25.00)", async () => {
      const supabase = createSupabaseMock([]);
      const result = await enforceGuardrails(
        "user-1",
        { amount: "25.00", actionType: "cancel", isReversible: true },
        "phase_2",
        supabase,
      );

      // $25.00 is NOT greater than $25.00, so it should be allowed
      expect(result.allowed).toBe(true);
    });
  });

  describe("Phase 3 tier-based", () => {
    it("allows Tier 1 action (< $10, reversible)", async () => {
      const supabase = createSupabaseMock();
      const result = await enforceGuardrails(
        "user-1",
        { amount: "5.00", actionType: "cancel", isReversible: true },
        "phase_3",
        supabase,
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("Tier 1");
    });

    it("allows Tier 2 action (>= $10, reversible)", async () => {
      const supabase = createSupabaseMock();
      const result = await enforceGuardrails(
        "user-1",
        { amount: "50.00", actionType: "negotiate", isReversible: true },
        "phase_3",
        supabase,
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("Tier 2");
    });

    it("rejects Tier 3 action (irreversible)", async () => {
      const supabase = createSupabaseMock();
      const result = await enforceGuardrails(
        "user-1",
        { amount: "5.00", actionType: "transfer", isReversible: false },
        "phase_3",
        supabase,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Tier 3");
    });
  });
});

// ---------------------------------------------------------------------------
// classifyActionTier
// ---------------------------------------------------------------------------

describe("classifyActionTier", () => {
  it("returns Tier 1 for amount < $10 and reversible", () => {
    expect(
      classifyActionTier({ amount: "5.00", isReversible: true }),
    ).toBe(1);
  });

  it("returns Tier 1 for amount $9.99 and reversible", () => {
    expect(
      classifyActionTier({ amount: "9.99", isReversible: true }),
    ).toBe(1);
  });

  it("returns Tier 2 for amount $10.00 and reversible", () => {
    expect(
      classifyActionTier({ amount: "10.00", isReversible: true }),
    ).toBe(2);
  });

  it("returns Tier 2 for amount $500 and reversible", () => {
    expect(
      classifyActionTier({ amount: "500.00", isReversible: true }),
    ).toBe(2);
  });

  it("returns Tier 3 for irreversible action regardless of amount", () => {
    expect(
      classifyActionTier({ amount: "1.00", isReversible: false }),
    ).toBe(3);
  });

  it("returns Tier 3 for high amount irreversible", () => {
    expect(
      classifyActionTier({ amount: "1000.00", isReversible: false }),
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getDailyAggregate
// ---------------------------------------------------------------------------

describe("getDailyAggregate", () => {
  it("returns zero when no actions today", async () => {
    const supabase = createSupabaseMock([]);
    const result = await getDailyAggregate("user-1", supabase);

    expect(result.toNumericString()).toBe("0.0000");
  });

  it("sums financial_impact of completed actions", async () => {
    const supabase = createSupabaseMock([
      { financial_impact: "10.50" },
      { financial_impact: "25.00" },
      { financial_impact: "3.75" },
    ]);
    const result = await getDailyAggregate("user-1", supabase);

    expect(result.toNumericString()).toBe("39.2500");
  });

  it("skips null financial_impact values", async () => {
    const supabase = createSupabaseMock([
      { financial_impact: "10.00" },
      { financial_impact: null },
      { financial_impact: "5.00" },
    ]);
    const result = await getDailyAggregate("user-1", supabase);

    expect(result.toNumericString()).toBe("15.0000");
  });

  it("throws on database error", async () => {
    const chain = (): unknown =>
      new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === "then") {
              return (
                resolve: (v: unknown) => void,
                _reject: (e: unknown) => void,
              ) =>
                resolve({
                  data: null,
                  error: { message: "connection failed" },
                });
            }
            return (..._args: unknown[]) => chain();
          },
        },
      );

    const supabase = {
      from: (_table: string) => chain(),
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await expect(getDailyAggregate("user-1", supabase)).rejects.toThrow(
      "Failed to fetch daily aggregate",
    );
  });
});
