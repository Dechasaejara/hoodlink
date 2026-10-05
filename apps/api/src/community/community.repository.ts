import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type Transaction } from '../database/database.service';
import * as schema from '../database/schema';
import type { Bootstrap, ChatMessage, Profile, Role, ThemePreferences, UserState } from '../types';

export const relations = {
  hood: schema.hoodMembers, challenge: schema.challengeParticipants, save: schema.savedBusinesses,
  rsvp: schema.eventAttendees, like: schema.postLikes, claim: schema.offerClaims,
};
export type RelationKind = keyof typeof relations;

@Injectable()
export class CommunityRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async hasUser(id: string) { return (await this.database.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).limit(1)).length > 0; }

  async provisionRole(id: string, role: Role) { await this.database.db.update(schema.users).set({ role }).where(eq(schema.users.id, id)); }

  async ensureUser(profile: Profile, role: Role = 'member') {
    await this.database.db.transaction(async transaction => {
      const available = await transaction.select().from(schema.hoods).where(eq(schema.hoods.archived, false)).orderBy(schema.hoods.id);
      const hood = available.find(item => item.name === profile.hood) || available.find(item => item.id === 'bole') || available[0];
      if (!hood) throw new BadRequestException('The community catalog has not been configured.');
      const schools = await transaction.select().from(schema.schools).where(eq(schema.schools.archived, false)).orderBy(schema.schools.id);
      const school = schools.find(item => item.name === profile.school) || schools[0];
      const created = await transaction.insert(schema.users).values({ id: profile.id, name: profile.name, avatar: profile.avatar, school: school?.name || profile.school, hoodId: hood.id, bio: profile.bio, role, points: profile.id === 'demo-yonas' ? 340 : 0 }).onConflictDoNothing().returning({ id: schema.users.id });
      if (created.length) {
        const defaults = await transaction.select({ id: schema.hoods.id }).from(schema.hoods).where(eq(schema.hoods.archived, false));
        const memberships = defaults.filter(item => item.id === 'bole' || item.id === 'school').map(item => ({ userId: profile.id, resourceId: item.id }));
        if (memberships.length) await transaction.insert(schema.hoodMembers).values(memberships).onConflictDoNothing();
      }
    });
  }

  async withUser<T>(id: string, operation: (transaction: Transaction) => Promise<T>) {
    return this.database.db.transaction(async transaction => {
      const [user] = await transaction.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).for('update');
      if (!user) throw new UnauthorizedException();
      return operation(transaction);
    });
  }

  async exists(transaction: Transaction, kind: RelationKind, id: string) {
    const table = { hood: schema.hoods, challenge: schema.challenges, save: schema.businesses, rsvp: schema.events, like: schema.posts, claim: schema.businesses }[kind];
    const active = 'archived' in table ? and(eq(table.id, id), eq(table.archived, false)) : eq(table.id, id);
    return (await transaction.select({ id: table.id }).from(table).where(active).limit(1)).length > 0;
  }

  async toggle(transaction: Transaction, kind: RelationKind, userId: string, resourceId: string) {
    const table = relations[kind];
    const condition = and(eq(table.userId, userId), eq(table.resourceId, resourceId));
    const found = await transaction.select({ resourceId: table.resourceId }).from(table).where(condition).limit(1);
    if (found.length && kind !== 'claim') await transaction.delete(table).where(condition);
    else await transaction.insert(table).values({ userId, resourceId }).onConflictDoNothing();
  }

  async canParticipate(transaction: Transaction, userId: string, hoodId: string) {
    return (await transaction.select({ userId: schema.hoodMembers.userId }).from(schema.hoodMembers).where(and(eq(schema.hoodMembers.userId, userId), eq(schema.hoodMembers.resourceId, hoodId))).limit(1)).length > 0;
  }

  async hoodByName(transaction: Transaction, name: string) { const [hood] = await transaction.select().from(schema.hoods).where(and(eq(schema.hoods.name, name), eq(schema.hoods.archived, false))).limit(1); return hood; }
  async schoolExists(transaction: Transaction, name: string) { return (await transaction.select().from(schema.schools).where(and(eq(schema.schools.name, name), eq(schema.schools.archived, false))).limit(1)).length > 0; }
  async channelExists(transaction: Transaction, id: string) { return (await transaction.select({ id: schema.channels.id }).from(schema.channels).where(eq(schema.channels.id, id)).limit(1)).length > 0; }
  async createPost(transaction: Transaction, userId: string, hoodId: string, body: string) { await transaction.insert(schema.posts).values({ id: randomUUID(), authorId: userId, hoodId, body }); }
  async createMessage(transaction: Transaction, userId: string, channelId: string, body: string) { await transaction.insert(schema.messages).values({ id: randomUUID(), userId, channelId, body }); }
  async updateProfile(transaction: Transaction, userId: string, profile: { name: string; bio: string; school: string; hoodId: string }) { await transaction.update(schema.users).set(profile).where(eq(schema.users.id, userId)); }
  async updateSettings(transaction: Transaction, userId: string, settings: { notifications: boolean; publicProfile: boolean }) { await transaction.update(schema.users).set(settings).where(eq(schema.users.id, userId)); }
  async updateTheme(transaction: Transaction, userId: string, theme: ThemePreferences) { await transaction.update(schema.users).set({ theme }).where(eq(schema.users.id, userId)); }

  async bootstrap(id: string): Promise<Bootstrap> {
    return this.database.db.transaction(async transaction => {
      const [record] = await transaction.select({ user: schema.users, hood: schema.hoods.name }).from(schema.users).innerJoin(schema.hoods, eq(schema.users.hoodId, schema.hoods.id)).where(eq(schema.users.id, id)).limit(1);
      if (!record) throw new UnauthorizedException();
      const membership = async (kind: RelationKind) => { const table = relations[kind]; return (await transaction.select({ id: table.resourceId }).from(table).where(eq(table.userId, id))).map(row => row.id); };
      const totals = async (kind: RelationKind) => { const table = relations[kind]; return new Map((await transaction.select({ id: table.resourceId, total: count() }).from(table).groupBy(table.resourceId)).map(row => [row.id, row.total])); };
      const [joinedHoods, joinedChallenges, savedBusinesses, attendingEvents, likedPosts, claimedOffers, hoodTotals, challengeTotals, eventTotals, likeTotals, hoodRows, challengeRows, businessRows, eventRows, channelRows, postRows] = [
        await membership('hood'), await membership('challenge'), await membership('save'), await membership('rsvp'), await membership('like'), await membership('claim'),
        await totals('hood'), await totals('challenge'), await totals('rsvp'), await totals('like'),
        await transaction.select().from(schema.hoods).where(eq(schema.hoods.archived, false)).orderBy(schema.hoods.id),
        await transaction.select({ challenge: schema.challenges, hood: schema.hoods.name }).from(schema.challenges).innerJoin(schema.hoods, eq(schema.challenges.hoodId, schema.hoods.id)).where(and(eq(schema.challenges.archived, false), eq(schema.hoods.archived, false))).orderBy(schema.challenges.id),
        await transaction.select().from(schema.businesses).where(eq(schema.businesses.archived, false)).orderBy(schema.businesses.id),
        await transaction.select().from(schema.events).where(eq(schema.events.archived, false)).orderBy(schema.events.date),
        await transaction.select({ id: schema.channels.id, name: schema.channels.name, image: schema.channels.image, members: schema.channels.members, preview: schema.channels.preview }).from(schema.channels).innerJoin(schema.hoods, eq(schema.channels.id, schema.hoods.id)).where(eq(schema.hoods.archived, false)).orderBy(schema.channels.id),
        await transaction.select({ post: schema.posts, author: schema.users, hood: schema.hoods.name }).from(schema.posts).innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id)).innerJoin(schema.hoods, eq(schema.posts.hoodId, schema.hoods.id)).where(and(eq(schema.posts.hidden, false), eq(schema.hoods.archived, false))).orderBy(desc(schema.posts.createdAt), desc(schema.posts.id)).limit(100),
      ] as const;
      const profile: Profile = { id, name: record.user.name, avatar: record.user.avatar, school: record.user.school, hood: record.hood, bio: record.user.bio, role: record.user.role, theme: record.user.theme };
      const state: UserState = { joinedHoods, joinedChallenges, savedBusinesses, attendingEvents, likedPosts, claimedOffers, notifications: record.user.notifications, publicProfile: record.user.publicProfile };
      return {
        profile, state, points: record.user.points,
        schools: await transaction.select().from(schema.schools).where(eq(schema.schools.archived, false)).orderBy(schema.schools.name),
        hoods: hoodRows.map(item => ({ ...item, members: item.members + (hoodTotals.get(item.id) || 0) })),
        challenges: challengeRows.map(({ challenge: { hoodId, ...item }, hood }) => ({ ...item, hood, participants: item.participants + (challengeTotals.get(item.id) || 0) })),
        businesses: businessRows.map(item => ({ ...item, rating: Number(item.rating) })),
        events: eventRows.map(item => ({ ...item, attending: item.attending + (eventTotals.get(item.id) || 0) })),
        channels: channelRows.map(item => ({ ...item, members: item.members + (hoodTotals.get(item.id) || 0) })),
        posts: postRows.map(({ post, author, hood }) => { const visible = author.publicProfile || author.id === id; return { id: post.id, author: visible ? author.name : 'Community member', authorId: author.id === id ? id : undefined, avatar: visible ? author.avatar : '', role: visible ? author.tagline : 'Community member', hood, body: post.body, image: post.image || undefined, createdAt: new Date(post.createdAt).toISOString(), likes: post.likes + (likeTotals.get(post.id) || 0) }; }),
      };
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async messages(id: string, channel: string): Promise<ChatMessage[]> {
    return this.withUser(id, async transaction => {
      if (!await this.channelExists(transaction, channel) || !await this.canParticipate(transaction, id, channel)) throw new BadRequestException('Join this hood to participate in its conversation.');
      const rows = await transaction.select({ message: schema.messages, author: schema.users }).from(schema.messages).innerJoin(schema.users, eq(schema.messages.userId, schema.users.id)).where(eq(schema.messages.channelId, channel)).orderBy(desc(schema.messages.createdAt), desc(schema.messages.id)).limit(100);
      return rows.reverse().map(({ message, author }) => ({ id: message.id, author: author.id === id || author.publicProfile ? author.name : 'Community member', body: message.body, createdAt: new Date(message.createdAt).toISOString(), own: author.id === id }));
    });
  }
}