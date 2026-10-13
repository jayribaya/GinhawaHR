import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),PORT:z.coerce.number().default(4000),MONGODB_URI:z.string().min(1),APP_ORIGIN:z.string().url(),JWT_SECRET:z.string().min(32),FIELD_ENCRYPTION_KEY:z.string().regex(/^[a-fA-F0-9]{64}$/)});
export function readConfig(input:NodeJS.ProcessEnv=process.env){const config=schema.parse(input);if(config.NODE_ENV==='production'&&!config.APP_ORIGIN.startsWith('https://'))throw new Error('Production requires HTTPS');return config;}
export type Config=ReturnType<typeof readConfig>;
