import { describe, it, expect } from "vitest";
import { checkPhase3Eligibility } from "./phase3-eligibility";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createSupabaseMock(userData: Record<string, unknown> | null, error?: { message: string }) {
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "single") {
            return () =>
              Promise.resolve({
                data: userData,
                error: error ?? null,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("checkPhase3Eligibility", () => {
  it("returns eligible when all criteria met", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 25,
      phase2_total_actions: 30,
      kyc_verified: true,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(true);
    expect(result.approvalCount).toBe(25);
    expect(result.approvalRate).toBeCloseTo(25 / 30);
    expect(result.kycVerified).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("returns ineligible when approval count too low", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 10,
      phase2_total_actions: 12,
      kyc_verified: true,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContainEqual(
      expect.stringContaining("Need 20 approvals"),
    );
  });

  it("returns ineligible when approval rate too low", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 20,
      phase2_total_actions: 40, // 50% rate
      kyc_verified: true,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(false);
    expect(result.approvalRate).toBeCloseTo(0.5);
    expect(result.reasons).toContainEqual(
      expect.stringContaining("approval rate"),
    );
  });

  it("returns ineligible when KYC not verified", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 25,
      phase2_total_actions: 30,
      kyc_verified: false,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(false);
    expect(result.kycVerified).toBe(false);
    expect(result.reasons).toContainEqual(
      expect.stringContaining("KYC"),
    );
  });

  it("returns all reasons when nothing is met", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 5,
      phase2_total_actions: 10,
      kyc_verified: false,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBe(3);
  });

  it("handles exactly 70% approval rate as ineligible (must be >70%)", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 21,
      phase2_total_actions: 30, // 70% exactly
      kyc_verified: true,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    // 21/30 = 0.7 exactly — must be STRICTLY greater than 0.7
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContainEqual(
      expect.stringContaining("approval rate"),
    );
  });

  it("handles exactly 20 approvals as eligible (>= 20)", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 20,
      phase2_total_actions: 25, // 80% rate
      kyc_verified: true,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(true);
  });

  it("handles zero total actions (0% rate)", async () => {
    const supabase = createSupabaseMock({
      phase2_approval_count: 0,
      phase2_total_actions: 0,
      kyc_verified: false,
    });

    const result = await checkPhase3Eligibility("user-1", supabase);

    expect(result.eligible).toBe(false);
    expect(result.approvalRate).toBe(0);
  });

  it("throws when user not found", async () => {
    const supabase = createSupabaseMock(null, { message: "not found" });

    await expect(
      checkPhase3Eligibility("missing", supabase),
    ).rejects.toThrow("Failed to fetch user eligibility data");
  });
});
