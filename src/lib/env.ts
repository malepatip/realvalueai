import { z } from "zod/v4";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/, "TELEGRAM_WEBHOOK_SECRET may only contain A-Z, a-z, 0-9, _ and -"),
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  SIMPLEFIN_ACCESS_URL: z.string().min(1),
  NVIDIA_NIM_API_KEY: z.string().min(1),
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Env {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

let _cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (!_cachedEnv) {
    _cachedEnv = validateEnv();
  }
  return _cachedEnv;
}

export { envSchema };
