import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // API server
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default("0.0.0.0"),

  // Meta Ads API
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_PIXEL_ID: z.string().min(1),
  META_ACCESS_TOKEN: z.string().min(1),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  // GoHighLevel API
  GHL_API_KEY: z.string().min(1),
  GHL_LOCATION_ID: z.string().min(1),
  GHL_WEBHOOK_SECRET: z.string().min(1),

  // Anthropic / Claude
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),

  // BullMQ concurrency
  INGESTION_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  ANALYST_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const missing = result.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Environment validation failed:\n${missing}`);
    }
    _env = result.data;
  }
  return _env;
}
