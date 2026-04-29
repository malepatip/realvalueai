import { describe, it, expect } from "vitest";
import { validateEnv, envSchema } from "./env";

const validEnv: Record<string, string> = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SUPABASE_ANON_KEY: "test-anon-key",
  REDIS_URL: "redis://localhost:6379",
  TELEGRAM_BOT_TOKEN: "123456:ABC-DEF",
  TELEGRAM_WEBHOOK_SECRET: "abcdef0123456789abcdef0123456789",
  PLAID_CLIENT_ID: "plaid-client-id",
  PLAID_SECRET: "plaid-secret",
  SIMPLEFIN_ACCESS_URL: "https://simplefin.example.com",
  NVIDIA_NIM_API_KEY: "nim-api-key",
  TWILIO_ACCOUNT_SID: "AC1234567890",
  TWILIO_AUTH_TOKEN: "twilio-auth-token",
  TWILIO_FROM_NUMBER: "+14155551234",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
};

describe("validateEnv", () => {
  it("accepts a complete valid environment", () => {
    const result = validateEnv(validEnv);
    expect(result.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(result.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("rejects when SUPABASE_URL is missing", () => {
    const { SUPABASE_URL: _, ...incomplete } = validEnv;
    expect(() => validateEnv(incomplete)).toThrow(
      "Environment validation failed",
    );
  });

  it("rejects when REDIS_URL is missing", () => {
    const { REDIS_URL: _, ...incomplete } = validEnv;
    expect(() => validateEnv(incomplete)).toThrow(
      "Environment validation failed",
    );
  });

  it("rejects when SUPABASE_URL is not a valid URL", () => {
    expect(() =>
      validateEnv({ ...validEnv, SUPABASE_URL: "not-a-url" }),
    ).toThrow("Environment validation failed");
  });

  it("rejects when any required var is empty string", () => {
    expect(() =>
      validateEnv({ ...validEnv, ENCRYPTION_KEY: "" }),
    ).toThrow("Environment validation failed");
  });

  it("rejects TELEGRAM_WEBHOOK_SECRET containing a colon (Telegram char restriction)", () => {
    expect(() =>
      validateEnv({ ...validEnv, TELEGRAM_WEBHOOK_SECRET: "123456:ABC-DEF" }),
    ).toThrow("Environment validation failed");
  });

  it("rejects when TELEGRAM_WEBHOOK_SECRET is missing", () => {
    const { TELEGRAM_WEBHOOK_SECRET: _, ...incomplete } = validEnv;
    expect(() => validateEnv(incomplete)).toThrow(
      "Environment validation failed",
    );
  });

  it("rejects completely empty environment", () => {
    expect(() => validateEnv({})).toThrow("Environment validation failed");
  });
});

describe("envSchema", () => {
  it("is exported for external use", () => {
    expect(envSchema).toBeDefined();
  });
});
