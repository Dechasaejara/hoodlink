import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../config';
import * as schema from './schema';

export const createDatabase = (pool: Pool) => drizzle(pool, { schema });
export type Database = ReturnType<typeof createDatabase>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;
  readonly db: Database;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new Pool({ connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_SIZE, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000, application_name: 'hoodlink-api' });
    this.pool.on('error', () => this.logger.error('An idle PostgreSQL connection failed.'));
    this.db = createDatabase(this.pool);
  }

  async onModuleInit() { await this.pool.query('SELECT 1'); }
  async healthy() { await this.pool.query('SELECT 1'); return true; }
  async onModuleDestroy() { await this.pool.end(); }
}