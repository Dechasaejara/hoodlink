import { boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { IconName, ThemePreferences } from '../types';

const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow();
export const userRole = pgEnum('user_role', ['member', 'moderator', 'admin', 'super_admin']);

export const schools = pgTable('schools', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  city: text('city').notNull(),
  description: text('description').notNull(),
  archived: boolean('archived').notNull().default(false),
});

export const hoods = pgTable('hoods', {
  id: text('id').primaryKey(),
  archived: boolean('archived').notNull().default(false),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  image: text('image').notNull(),
  members: integer('members').notNull().default(0),
  color: text('color').notNull(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  role: userRole('role').notNull().default('member'),
  theme: jsonb('theme').$type<ThemePreferences>().notNull().default({ mode: 'system', accent: '#3390ec' }),
  name: text('name').notNull(),
  avatar: text('avatar').notNull().default(''),
  school: text('school').notNull(),
  hoodId: text('hood_id').notNull().references(() => hoods.id),
  bio: text('bio').notNull().default(''),
  tagline: text('tagline').notNull().default('Community member'),
  notifications: boolean('notifications').notNull().default(true),
  publicProfile: boolean('public_profile').notNull().default(true),
  points: integer('points').notNull().default(0),
  createdAt: createdAt(),
}, table => [check('users_points_nonnegative', sql`${table.points} >= 0`)]);

export const challenges = pgTable('challenges', {
  id: text('id').primaryKey(),
  archived: boolean('archived').notNull().default(false),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  image: text('image').notNull(),
  participants: integer('participants').notNull().default(0),
  points: integer('points').notNull(),
  days: integer('days').notNull(),
  progress: integer('progress').notNull().default(0),
  icon: text('icon').$type<IconName>().notNull(),
  hoodId: text('hood_id').notNull().references(() => hoods.id),
}, table => [check('challenge_progress_range', sql`${table.progress} BETWEEN 0 AND 100`), check('challenge_points_nonnegative', sql`${table.points} >= 0`)]);

export const businesses = pgTable('businesses', {
  id: text('id').primaryKey(),
  archived: boolean('archived').notNull().default(false),
  name: text('name').notNull(),
  category: text('category').notNull(),
  image: text('image').notNull(),
  description: text('description').notNull(),
  address: text('address').notNull(),
  rating: numeric('rating', { precision: 2, scale: 1 }).notNull(),
  distance: text('distance').notNull(),
  offer: text('offer').notNull(),
  code: text('code').notNull(),
  phone: text('phone').notNull(),
  hours: text('hours').notNull(),
}, table => [check('business_rating_range', sql`${table.rating} BETWEEN 0 AND 5`)]);

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  archived: boolean('archived').notNull().default(false),
  title: text('title').notNull(),
  category: text('category').notNull(),
  image: text('image').notNull(),
  month: text('month').notNull(),
  day: text('day').notNull(),
  date: text('date').notNull(),
  location: text('location').notNull(),
  time: text('time').notNull(),
  attending: integer('attending').notNull().default(0),
  description: text('description').notNull(),
});

export const channels = pgTable('channels', {
  id: text('id').primaryKey().references(() => hoods.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  image: text('image').notNull(),
  members: integer('members').notNull().default(0),
  preview: text('preview').notNull(),
});

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  hidden: boolean('hidden').notNull().default(false),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  hoodId: text('hood_id').notNull().references(() => hoods.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  image: text('image'),
  likes: integer('likes').notNull().default(0),
  createdAt: createdAt(),
}, table => [index('posts_created_at_idx').on(table.createdAt), index('posts_hood_idx').on(table.hoodId), check('post_body_length', sql`length(${table.body}) BETWEEN 1 AND 2000`)]);

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull().references(() => channels.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: createdAt(),
}, table => [index('messages_channel_date_idx').on(table.channelId, table.createdAt), check('message_body_length', sql`length(${table.body}) BETWEEN 1 AND 2000`)]);

export const hoodMembers = pgTable('hood_members', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('hood_id').notNull().references(() => hoods.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, table => [primaryKey({ columns: [table.userId, table.resourceId] }), index('hood_members_hood_idx').on(table.resourceId)]);

export const challengeParticipants = pgTable('challenge_participants', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, table => [primaryKey({ columns: [table.userId, table.resourceId] }), index('challenge_participants_challenge_idx').on(table.resourceId)]);

export const savedBusinesses = pgTable('saved_businesses', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, table => [primaryKey({ columns: [table.userId, table.resourceId] })]);

export const eventAttendees = pgTable('event_attendees', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, table => [primaryKey({ columns: [table.userId, table.resourceId] }), index('event_attendees_event_idx').on(table.resourceId)]);

export const postLikes = pgTable('post_likes', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, table => [primaryKey({ columns: [table.userId, table.resourceId] }), index('post_likes_post_idx').on(table.resourceId)]);

export const offerClaims = pgTable('offer_claims', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resourceId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, table => [primaryKey({ columns: [table.userId, table.resourceId] })]);

export const telegramAccounts = pgTable('telegram_accounts', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  telegramId: text('telegram_id').notNull().unique(),
  canNotify: boolean('can_notify').notNull().default(false),
  connectedAt: createdAt(),
});

export const telegramChats = pgTable('telegram_chats', {
  hoodId: text('hood_id').notNull().references(() => hoods.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'group' | 'channel'>().notNull(),
  chatId: text('chat_id').notNull().unique(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  linkedBy: text('linked_by').notNull().references(() => users.id),
  linkedAt: createdAt(),
}, table => [primaryKey({ columns: [table.hoodId, table.kind] })]);

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  path: text('path').notNull().default('/'),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
  delivery: text('delivery').$type<'pending' | 'sending' | 'sent' | 'in_app' | 'failed'>().notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  createdAt: createdAt(),
}, table => [index('notification_user_date_idx').on(table.userId, table.createdAt), index('notification_delivery_idx').on(table.delivery, table.nextAttemptAt)]);

export const telegramPolls = pgTable('telegram_polls', {
  id: text('id').primaryKey(),
  hoodId: text('hood_id').notNull().references(() => hoods.id),
  authorId: text('author_id').notNull().references(() => users.id),
  question: text('question').notNull(),
  options: jsonb('options').$type<{ text: string; voter_count: number }[]>().notNull(),
  telegramPollId: text('telegram_poll_id').unique(),
  messageId: integer('message_id'),
  url: text('url'),
  voters: integer('voters').notNull().default(0),
  closed: boolean('closed').notNull().default(false),
  state: text('state').$type<'creating' | 'published' | 'failed'>().notNull().default('creating'),
  createdAt: createdAt(),
}, table => [index('polls_hood_date_idx').on(table.hoodId, table.createdAt)]);

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  product: text('product').$type<'elite'>().notNull(),
  amount: integer('amount').notNull(),
  url: text('url'),
  termsVersion: text('terms_version').notNull(),
  status: text('status').$type<'pending' | 'paid' | 'refunded'>().notNull().default('pending'),
  createdAt: createdAt(),
}, table => [check('invoice_amount_positive', sql`${table.amount} > 0`)]);

export const payments = pgTable('payments', {
  chargeId: text('charge_id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => invoices.id),
  userId: text('user_id').notNull().references(() => users.id),
  amount: integer('amount').notNull(),
  validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }).notNull(),
  refunded: boolean('refunded').notNull().default(false),
  createdAt: createdAt(),
}, table => [index('payments_user_expiry_idx').on(table.userId, table.validUntil)]);

export const telegramUpdates = pgTable('telegram_updates', {
  id: integer('id').primaryKey(),
  processedAt: createdAt(),
});

export const placeNotes = pgTable('place_notes', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  businessId: text('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.businessId] }), check('place_note_length', sql`length(${table.body}) <= 2000`)]);

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  recordId: text('record_id').notNull(),
  before: jsonb('before').$type<Record<string, unknown>>(),
  after: jsonb('after').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
}, table => [index('audit_created_idx').on(table.createdAt)]);