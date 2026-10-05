import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');
const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a PostgreSQL connection URL.'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  BOT_TOKEN: z.string().default(''),
  BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]*$/).default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]*$/).default(''),
  TELEGRAM_ADMIN_IDS: z.string().regex(/^(\d+(,\d+)*)?$/).default(''),
  SUPER_ADMIN_TELEGRAM_IDS: z.string().regex(/^(\d+(,\d+)*)?$/).default(''),
  TELEGRAM_ENABLED: z.enum(['true', 'false']).default('false'),
  ELITE_STARS: z.coerce.number().int().min(1).max(10000).default(250),
  PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  TERMS_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().startsWith('https://').optional()),
  SUPPORT_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().startsWith('https://').optional()),
  SESSION_SECRET: z.string().default(''),
  ALLOW_DEMO_AUTH: z.enum(['true', 'false']).default('true'),
  ALLOW_DEMO_ROLE_SWITCH: z.enum(['true', 'false']).default('false'),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
});
export type AppConfig = ReturnType<typeof readConfig>;

export function readConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = environment.safeParse(source);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  const values = parsed.data;
  if (values.TELEGRAM_ENABLED === 'true' && (!values.BOT_TOKEN || !values.BOT_USERNAME || values.TELEGRAM_WEBHOOK_SECRET.length < 32 || !values.WEB_ORIGIN.startsWith('https://'))) throw new Error('Telegram integration requires BOT_TOKEN, BOT_USERNAME, a strong webhook secret, and an HTTPS WEB_ORIGIN.');
  if (values.PAYMENTS_ENABLED === 'true' && (values.TELEGRAM_ENABLED !== 'true' || !values.TERMS_URL || !values.SUPPORT_URL)) throw new Error('Payments require enabled Telegram integration, TERMS_URL, and SUPPORT_URL.');
  if (values.NODE_ENV === 'production' && (!values.BOT_TOKEN || values.SESSION_SECRET.length < 32 || values.SESSION_SECRET.startsWith('hoodlink-local-'))) throw new Error('Production requires BOT_TOKEN and a unique SESSION_SECRET of at least 32 characters.');
  return { ...values, SESSION_SECRET: values.SESSION_SECRET || randomBytes(48).toString('hex'), ALLOW_DEMO_AUTH: values.NODE_ENV !== 'production' && values.ALLOW_DEMO_AUTH === 'true', ALLOW_DEMO_ROLE_SWITCH: values.NODE_ENV !== 'production' && values.ALLOW_DEMO_AUTH === 'true' && values.ALLOW_DEMO_ROLE_SWITCH === 'true' };
}