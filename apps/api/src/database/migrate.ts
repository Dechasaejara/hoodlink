import 'dotenv/config';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function migrateDatabase(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(78124401)');
    await migrate(drizzle(client), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  } finally {
    await client.query('SELECT pg_advisory_unlock(78124401)');
    client.release();
  }
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  migrateDatabase(pool).then(() => console.log('Database migrations applied.')).catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; }).finally(() => pool.end());
}