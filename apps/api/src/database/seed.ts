import 'dotenv/config';
import { Pool } from 'pg';
import { createDatabase, type Database } from './database.service';
import * as schema from './schema';
import * as catalog from '../seed';

export async function seedDatabase(db: Database) {
  await db.transaction(async transaction => {
    await transaction.execute('SELECT pg_advisory_xact_lock(78124402)');
    await transaction.insert(schema.schools).values([
      { id: 'aau', name: 'Addis Ababa University', city: 'Addis Ababa', description: 'A connected university community.' },
      { id: 'st-marys', name: "St. Mary's University", city: 'Addis Ababa', description: 'Learn and grow with your school community.' },
      { id: 'unity', name: 'Unity University', city: 'Addis Ababa', description: 'Students, ideas, and opportunities.' },
      { id: 'other', name: 'Other school', city: 'Addis Ababa', description: 'Your school and your neighborhood, connected.' },
    ]).onConflictDoNothing();
    await transaction.insert(schema.hoods).values(catalog.hoods).onConflictDoNothing();
    await transaction.insert(schema.challenges).values(catalog.challenges.map(({ hood, ...item }) => ({ ...item, hoodId: catalog.hoods.find(community => community.name === hood)!.id }))).onConflictDoNothing();
    await transaction.insert(schema.businesses).values(catalog.businesses.map(item => ({ ...item, rating: item.rating.toFixed(1) }))).onConflictDoNothing();
    await transaction.insert(schema.events).values(catalog.events).onConflictDoNothing();
    await transaction.insert(schema.channels).values(catalog.channels).onConflictDoNothing();
    await transaction.insert(schema.users).values([
      ...catalog.posts.map(item => ({ id: `seed-${item.id}`, name: item.author, avatar: item.avatar, school: 'Addis Ababa University', hoodId: catalog.hoods.find(hood => hood.name === item.hood)!.id, tagline: item.role, points: 0 })),
      { id: 'seed-system', name: 'HoodLink', school: 'Other school', hoodId: 'bole', tagline: 'Community guide' },
    ]).onConflictDoNothing();
    await transaction.insert(schema.posts).values(catalog.posts.map(item => ({ id: item.id, authorId: `seed-${item.id}`, hoodId: catalog.hoods.find(hood => hood.name === item.hood)!.id, body: item.body, image: item.image, likes: item.likes, createdAt: item.createdAt }))).onConflictDoNothing();
    await transaction.insert(schema.messages).values(catalog.channels.flatMap(channel => [
      { id: `welcome-${channel.id}`, userId: 'seed-system', channelId: channel.id, body: 'A little connection goes a long way. Welcome to the conversation!', createdAt: '2026-10-04T08:00:00Z' },
      { id: `hello-${channel.id}`, userId: channel.id === 'school' ? 'seed-post-2' : 'seed-post-1', channelId: channel.id, body: channel.id === 'school' ? 'Anyone joining the study session tomorrow? Library at 3!' : 'See you at the community park on Saturday! Everyone is welcome.', createdAt: '2026-10-04T08:10:00Z' },
    ])).onConflictDoNothing();
  });
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
  seedDatabase(createDatabase(pool)).then(() => console.log('Demo catalog seeded without overwriting existing data.')).catch(error => { console.error('Seeding failed:', error.message); process.exitCode = 1; }).finally(() => pool.end());
}