import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL || 'postgresql://hoodlink:hoodlink_local@localhost:55432/hoodlink' },
  strict: true,
  verbose: true,
});