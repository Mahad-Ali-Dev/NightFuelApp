import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Zod's z.string().url() uses the WHATWG URL spec which rejects non-http(s)
// schemes like redis://, rediss://, postgresql://, and postgres://.
// Use regex-backed refinements so each URL is validated at the right layer
// (ioredis / Prisma) rather than being killed by Zod at startup.
const redisUrl = z
    .string()
    .min(1)
    .refine(
        (val) => /^rediss?:\/\/.+/.test(val),
        { message: 'REDIS_URL must begin with redis:// or rediss://' },
    );

const postgresUrl = z
    .string()
    .min(1)
    .refine(
        (val) => /^(postgres|postgresql):\/\/.+/.test(val),
        { message: 'DATABASE_URL must begin with postgres:// or postgresql://' },
    );

export const baseEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    REDIS_URL: redisUrl,
    DATABASE_URL: postgresUrl,
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

export const loadConfig = <T extends z.ZodType>(schema: T): z.infer<T> & BaseEnv => {
    const mergedSchema = baseEnvSchema.and(schema);
    const parsed = mergedSchema.safeParse(process.env);

    if (!parsed.success) {
        console.error('❌ Invalid environment variables:', parsed.error.format());
        process.exit(1);
    }

    return parsed.data;
};
