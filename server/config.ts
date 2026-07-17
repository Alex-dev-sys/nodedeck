import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().default('127.0.0.1'),
  CORS_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  DATABASE_SSL: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  LOCAL_AUTH_BYPASS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  HOST_ALERT_THRESHOLD: z.coerce.number().min(50).max(100).default(90),
  CRON_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(32).optional()),
  BOOTSTRAP_EMAIL: z.string().email().optional(),
  BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env = process.env): Config {
  const parsed = schema.safeParse(env)
  if (parsed.success) {
    const localOrigin = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(parsed.data.CORS_ORIGIN)
    if (parsed.data.LOCAL_AUTH_BYPASS && !localOrigin) {
      throw new Error('LOCAL_AUTH_BYPASS requires a localhost origin')
    }
    if (parsed.data.COOKIE_SECURE && !parsed.data.CORS_ORIGIN.startsWith('https://')) {
      throw new Error('COOKIE_SECURE requires an HTTPS CORS_ORIGIN')
    }
    if (!parsed.data.COOKIE_SECURE && !localOrigin) {
      throw new Error('COOKIE_SECURE must be enabled for a non-local CORS_ORIGIN')
    }
    return parsed.data
  }

  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Invalid server configuration:\n${issues.join('\n')}`)
}
