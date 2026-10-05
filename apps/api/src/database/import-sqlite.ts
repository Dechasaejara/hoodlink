import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { createDatabase } from './database.service';
import * as schema from './schema';
import type { Profile, UserState } from '../types';
import { z } from 'zod';

const profileSchema = z.object({ id: z.string().min(1), name: z.string().min(1), avatar: z.string(), school: z.string(), hood: z.string(), bio: z.string() });
const stateSchema = z.object({ joinedHoods: z.array(z.string()), joinedChallenges: z.array(z.string()), savedBusinesses: z.array(z.string()), attendingEvents: z.array(z.string()), likedPosts: z.array(z.string()), claimedOffers: z.array(z.string()), notifications: z.boolean(), publicProfile: z.boolean() });

export async function importSqlite(pool: Pool, source: string) {
  if (!existsSync(source)) throw new Error('SQLite source does not exist. No data was imported.');
  const sqlite = new DatabaseSync(source, { readOnly: true });
  try {
    const legacyUsers = (sqlite.prepare('SELECT * FROM users').all() as { id: string; profile: string; state: string }[]).map(row => ({ profile: profileSchema.parse(JSON.parse(row.profile)) as Profile, state: stateSchema.parse(JSON.parse(row.state)) as UserState }));
    const legacyPosts = sqlite.prepare('SELECT * FROM posts').all() as { id: string; author_id: string; body: string; hood: string; created_at: string }[];
    const legacyMessages = sqlite.prepare('SELECT * FROM messages').all() as { id: string; user_id: string; channel: string; body: string; created_at: string }[];
    const db = createDatabase(pool);
    return await db.transaction(async transaction => {
      await transaction.execute('SELECT pg_advisory_xact_lock(78124402)');
      const hoodRows = await transaction.select().from(schema.hoods);
      const hoodId = (name: string) => { const hood = hoodRows.find(item => item.name === name); if (!hood) throw new Error(`Unknown community in legacy data: ${name}. Seed the catalog first.`); return hood.id; };
      const imported: { id: string; state: UserState }[] = [];
      for (const { profile, state } of legacyUsers) {
        const created = await transaction.insert(schema.users).values({ id: profile.id, name: profile.name, avatar: profile.avatar, school: profile.school, hoodId: hoodId(profile.hood), bio: profile.bio, notifications: state.notifications, publicProfile: state.publicProfile, points: 340 }).onConflictDoNothing().returning({ id: schema.users.id });
        if (created.length) imported.push({ id: profile.id, state });
      }
      if (legacyPosts.length) await transaction.insert(schema.posts).values(legacyPosts.map(row => ({ id: row.id, authorId: row.author_id, hoodId: hoodId(row.hood), body: row.body, createdAt: row.created_at }))).onConflictDoNothing();
      if (legacyMessages.length) await transaction.insert(schema.messages).values(legacyMessages.map(row => ({ id: row.id, userId: row.user_id, channelId: row.channel, body: row.body, createdAt: row.created_at }))).onConflictDoNothing();
      const mappings = [
        [schema.hoodMembers, 'joinedHoods'], [schema.challengeParticipants, 'joinedChallenges'],
        [schema.savedBusinesses, 'savedBusinesses'], [schema.eventAttendees, 'attendingEvents'],
        [schema.postLikes, 'likedPosts'], [schema.offerClaims, 'claimedOffers'],
      ] as const;
      for (const { id, state } of imported) for (const [table, key] of mappings) {
        const entries = state[key].map(resourceId => ({ userId: id, resourceId }));
        if (entries.length) await transaction.insert(table).values(entries).onConflictDoNothing();
      }
      return { newUsers: imported.length, sourcePosts: legacyPosts.length, sourceMessages: legacyMessages.length };
    });
  } finally { sqlite.close(); }
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
  importSqlite(pool, path.resolve(process.argv[2] || './data/hoodlink.sqlite')).then(result => console.log('SQLite import complete. Original file unchanged.', result)).catch(error => { console.error('Import failed:', error.message); process.exitCode = 1; }).finally(() => pool.end());
}