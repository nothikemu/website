import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at boot. Secrets are only ever read from
 * process.env and are never serialised to the client.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://forgebase:forgebase@localhost:5432/forgebase"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters"),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  EMAIL_DRIVER: z.enum(["console", "smtp"]).default("console"),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Forgebase <no-reply@forgebase.local>"),

  AI_PROVIDER: z.enum(["none", "openai", "anthropic", "google"]).default("none"),
  AI_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ERROR_TRACKING_DSN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.STORAGE_DRIVER === "s3" && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  }
  if (env.EMAIL_DRIVER === "smtp" && !env.SMTP_URL) throw new Error("EMAIL_DRIVER=smtp requires SMTP_URL");
  return env;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= load();
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";

/** Secure cookies everywhere except plain-http local runs (e.g. the desktop build on localhost). */
export const secureCookies = () => isProd() && env().APP_URL.startsWith("https://");

export const oauthEnabled = () => ({
  github: Boolean(env().GITHUB_CLIENT_ID && env().GITHUB_CLIENT_SECRET),
  google: Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET),
});
