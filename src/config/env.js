import { isIP } from 'node:net';
import { z } from 'zod';

const integer = (minimum, maximum) => z.string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(minimum).max(maximum));

function isOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
}

function isProxyAddress(value) {
  const parts = value.split('/');
  if (parts.length > 2) return false;
  const family = isIP(parts[0]);
  if (!family) return false;
  if (parts.length === 1) return true;
  return /^\d+$/.test(parts[1]) && Number(parts[1]) <= (family === 4 ? 32 : 128);
}

const splitList = (value) => value.split(',').map((entry) => entry.trim());

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().refine((value) => value === 'localhost' || isIP(value) !== 0)
    .default('127.0.0.1'),
  PORT: integer(1, 65535).default(3000),
  CORS_ORIGINS: z.string().default('').transform((value) => value === '' ? [] : splitList(value))
    .pipe(z.array(z.string().refine(isOrigin))),
  JSON_BODY_LIMIT: integer(1024, 1048576).default(16384),
  TRUST_PROXY: z.string().default('false')
    .transform((value) => value === 'false' ? false : splitList(value))
    .pipe(z.union([z.literal(false), z.array(z.string().refine(isProxyAddress)).min(1)])),
});

export function readConfig(environment = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    // Report field names only: configuration may contain secrets.
    const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  const env = result.data;
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    corsOrigins: Object.freeze(env.CORS_ORIGINS),
    jsonBodyLimit: env.JSON_BODY_LIMIT,
    trustProxy: Array.isArray(env.TRUST_PROXY) ? Object.freeze(env.TRUST_PROXY) : false,
  });
}
