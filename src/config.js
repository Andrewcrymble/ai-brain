import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default('claude-opus-4-7'),

  MS_TENANT_ID: z.string().min(1),
  MS_CLIENT_ID: z.string().min(1),
  MS_CLIENT_SECRET: z.string().min(1),
  MS_USER_ID: z.string().email(),

  BEEPMATE_API_KEY: z.string().min(1),
  BEEPMATE_TARGET_ID: z.string().min(1),

  INGEST_TOKEN: z.string().min(16, 'INGEST_TOKEN must be at least 16 characters'),

  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().default('Europe/London'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  DB_PATH: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
