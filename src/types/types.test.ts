import { describe, it, expect } from "vitest";
import {
  AgentMessageSchema,
  AgentEventSchema,
  QUEUES,
} from "./agents";
import {
  TrustPhaseSchema,
  PhaseTriggerSchema,
  PHASE_GUARDRAILS,
} from "./trust";
import { InsightSchema, OverdraftPredictionSchema } from "./watcher";
import { BrowserJobSchema, ApprovedActionSchema } from "./fixer";
import { BenefitOpportunitySchema, ImmigrationStatusSchema } from "./hunter";
import { PersonalityModeSchema, SentimentResultSchema } from "./voice";
import { IntentClassificationSchema } from "./conductor";

describe("AgentMessageSchema", () => {
  const validMessage = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2024-01-15T10:30:00Z",
    sourceAgent: "conductor",
    targetAgent: "watcher",
    userId: "user-123",
    type: "task",
    priority: "normal",
    payload: { action: "detect" },
    correlationId: "660e8400-e29b-41d4-a716-446655440000",
    ttl: 300,
  };

  it("validates a correct agent message", () => {
    const result = AgentMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it("rejects invalid agent type", () => {
    const result = AgentMessageSchema.safeParse({
      ...validMessage,
      sourceAgent: "invalid_agent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing correlationId", () => {
    const { correlationId: _, ...noCorrelation } = validMessage;
    const result = AgentMessageSchema.safeParse(noCorrelation);
    expect(result.success).toBe(false);
  });

  it("rejects negative ttl", () => {
    const result = AgentMessageSchema.safeParse({ ...validMessage, ttl: -1 });
    expect(result.success).toBe(false);
  });
});

describe("AgentEventSchema", () => {
  it("validates a correct agent event", () => {
    const result = AgentEventSchema.safeParse({
      agent: "watcher",
      eventType: "insight_detected",
      userId: "user-123",
      payload: { type: "unused_subscription" },
    });
    expect(result.success).toBe(true);
  });

  it("allows optional userId and correlationId", () => {
    const result = AgentEventSchema.safeParse({
      agent: "conductor",
      eventType: "health_ping",
      payload: {},
    });
    expect(result.success).toBe(true);
  });
});

describe("QUEUES constant", () => {
  it("has all 8 queue names", () => {
    expect(Object.keys(QUEUES)).toHaveLength(8);
    expect(QUEUES.INBOUND).toBe("inbound-messages");
    expect(QUEUES.DEAD_LETTER).toBe("dead-letter");
  });
});

describe("TrustPhaseSchema", () => {
  it("accepts valid phases", () => {
    for (const phase of ["phase_0", "phase_1", "phase_2", "phase_3", "killed"]) {
      expect(TrustPhaseSchema.safeParse(phase).success).toBe(true);
    }
  });

  it("rejects invalid phase", () => {
    expect(TrustPhaseSchema.safeParse("phase_4").success).toBe(false);
  });
});

describe("PhaseTriggerSchema", () => {
  it("accepts valid triggers", () => {
    expect(PhaseTriggerSchema.safeParse("bank_connected").success).toBe(true);
    expect(PhaseTriggerSchema.safeParse("stop_command").success).toBe(true);
  });
});

describe("PHASE_GUARDRAILS constant", () => {
  it("phase_0 cannot execute actions", () => {
    expect(PHASE_GUARDRAILS.phase_0.canExecuteActions).toBe(false);
  });

  it("phase_2 has correct monetary limits as strings", () => {
    expect(PHASE_GUARDRAILS.phase_2.perActionLimit).toBe("25.00");
    expect(PHASE_GUARDRAILS.phase_2.dailyAggregateLimit).toBe("100.00");
  });

  it("phase_3 tier1 max amount is a decimal string", () => {
    expect(PHASE_GUARDRAILS.phase_3.tier1.maxAmount).toBe("10.00");
  });
});

describe("InsightSchema", () => {
  it("validates a correct insight", () => {
    const result = InsightSchema.safeParse({
      type: "unused_subscription",
      urgency: "batched",
      merchantName: "Netflix",
      amount: "15.99",
      description: "Netflix unused for 60 days",
      metadata: { daysSinceUsage: 60 },
      detectedAt: "2024-01-15T10:30:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid insight type", () => {
    const result = InsightSchema.safeParse({
      type: "invalid_type",
      urgency: "batched",
      description: "test",
      metadata: {},
      detectedAt: "2024-01-15T10:30:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("OverdraftPredictionSchema", () => {
  it("validates a correct prediction", () => {
    const result = OverdraftPredictionSchema.safeParse({
      predictedDate: "2024-01-20",
      projectedShortfall: "150.00",
      currentBalance: "200.00",
      projectedExpenses: "350.00",
      suggestedActions: ["Cancel Netflix", "Pause Spotify"],
      confidence: 0.85,
    });
    expect(result.success).toBe(true);
  });

  it("rejects confidence > 1", () => {
    const result = OverdraftPredictionSchema.safeParse({
      predictedDate: "2024-01-20",
      projectedShortfall: "150.00",
      currentBalance: "200.00",
      projectedExpenses: "350.00",
      suggestedActions: [],
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("BrowserJobSchema", () => {
  it("validates a correct browser job", () => {
    const result = BrowserJobSchema.safeParse({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-123",
      actionId: "660e8400-e29b-41d4-a716-446655440000",
      provider: "netflix.com",
      actionType: "cancel",
      maxRetries: 3,
      screenshotAtEveryStep: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects screenshotAtEveryStep = false", () => {
    const result = BrowserJobSchema.safeParse({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-123",
      actionId: "660e8400-e29b-41d4-a716-446655440000",
      provider: "netflix.com",
      actionType: "cancel",
      maxRetries: 3,
      screenshotAtEveryStep: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("ApprovedActionSchema", () => {
  it("validates a correct approved action", () => {
    const result = ApprovedActionSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-123",
      actionType: "cancel",
      targetMerchant: "Netflix",
      estimatedSavings: "15.99",
    });
    expect(result.success).toBe(true);
  });
});

describe("BenefitOpportunitySchema", () => {
  it("validates a correct benefit opportunity", () => {
    const result = BenefitOpportunitySchema.safeParse({
      programName: "SNAP",
      estimatedMonthlyValue: "234.00",
      eligibilityRequirements: ["Income below 130% FPL"],
      applicationUrl: "https://www.fns.usda.gov/snap/apply",
      requiresCitizenship: false,
      requiresLegalResidency: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid URL", () => {
    const result = BenefitOpportunitySchema.safeParse({
      programName: "SNAP",
      estimatedMonthlyValue: "234.00",
      eligibilityRequirements: [],
      applicationUrl: "not-a-url",
      requiresCitizenship: false,
      requiresLegalResidency: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("ImmigrationStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(ImmigrationStatusSchema.safeParse("citizen").success).toBe(true);
    expect(ImmigrationStatusSchema.safeParse("undocumented").success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(ImmigrationStatusSchema.safeParse("tourist").success).toBe(false);
  });
});

describe("PersonalityModeSchema", () => {
  it("accepts all personality modes", () => {
    for (const mode of ["savage", "hype", "zen", "mentor"]) {
      expect(PersonalityModeSchema.safeParse(mode).success).toBe(true);
    }
  });
});

describe("SentimentResultSchema", () => {
  it("validates a correct sentiment result", () => {
    const result = SentimentResultSchema.safeParse({
      sentiment: "anxious",
      confidence: 0.92,
      triggerKeywords: ["worried", "scared"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid sentiment", () => {
    const result = SentimentResultSchema.safeParse({
      sentiment: "happy",
      confidence: 0.5,
      triggerKeywords: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("IntentClassificationSchema", () => {
  it("validates a correct intent classification", () => {
    const result = IntentClassificationSchema.safeParse({
      intent: "cancel_subscription",
      confidence: 0.95,
      targetAgent: "fixer",
      extractedEntities: { merchant: "Netflix" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid intent", () => {
    const result = IntentClassificationSchema.safeParse({
      intent: "hack_bank",
      confidence: 0.5,
      targetAgent: "fixer",
      extractedEntities: {},
    });
    expect(result.success).toBe(false);
  });
});
