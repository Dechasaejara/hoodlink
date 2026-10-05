import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../src/database/database.service';
import { migrateDatabase } from '../src/database/migrate';
import { seedDatabase } from '../src/database/seed';
import { CommunityRepository } from '../src/community/community.repository';
import { CommunityService } from '../src/community/community.service';
import { AuthService } from '../src/auth/auth.service';
import { readConfig } from '../src/config';
import * as schema from '../src/database/schema';
import { TelegramService } from '../src/telegram/telegram.service';
import type { TelegramClient } from '../src/telegram/telegram.client';
import { AdminService } from '../src/admin/admin.service';

test('PostgreSQL migration, constraints, concurrency, isolation, and community behavior', async context => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'Set TEST_DATABASE_URL to a local PostgreSQL connection with CREATE DATABASE permission. Tests use a separate temporary database.');
  const admin = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
  const name = `hoodlink_test_${process.pid}_${Date.now()}`;
  const testUrl = new URL(url);
  testUrl.pathname = `/${name}`;
  let database: DatabaseService | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const config = readConfig({ DATABASE_URL: testUrl.toString(), NODE_ENV: 'test', SESSION_SECRET: 'test-secret-with-more-than-thirty-two-characters', BOT_TOKEN: 'test-bot-token' });
    database = new DatabaseService(config);
    await migrateDatabase(database.pool);
    await migrateDatabase(database.pool);
    await seedDatabase(database.db);
    await seedDatabase(database.db);
    const repository = new CommunityRepository(database);
    const service = new CommunityService(repository);
    const auth = new AuthService(config, repository);
    const session = await auth.authenticate({ demo: true });
    const id = await auth.identify(`Bearer ${session.token}`);

    await context.test('migrations and seeding are repeatable and preserve the catalog', async () => {
      const initial = await service.bootstrap(id);
      assert.equal(initial.hoods.length, 6);
      assert.equal(initial.businesses.length, 4);
      assert.equal(initial.posts.length, 3);
      assert.equal(initial.points, 340);
    });
    await context.test('joins, claims, messages, posts, and RSVPs persist with membership validation', async () => {
      assert.equal((await service.action(id, { type: 'challenge', id: 'green-week' })).state.joinedChallenges.length, 1);
      assert.equal((await service.action(id, { type: 'challenge', id: 'green-week' })).state.joinedChallenges.length, 0);
      await service.action(id, { type: 'claim', id: 'coffee' });
      assert.equal((await service.action(id, { type: 'claim', id: 'coffee' })).state.claimedOffers.length, 1);
      await assert.rejects(() => service.action(id, { type: 'save', id: 'missing' }));
      await assert.rejects(() => service.action(id, { type: 'post', body: '  ', hood: 'Bole Hood' }));
      await assert.rejects(() => service.action(id, { type: 'post', body: 'Hello', hood: 'Green Addis' }));
      await service.action(id, { type: 'post', body: 'Hello, neighbors!', hood: 'Bole Hood' });
      assert.equal((await service.bootstrap(id)).posts[0].body, 'Hello, neighbors!');
      await service.action(id, { type: 'message', body: 'See you soon', channel: 'bole' });
      assert.equal((await service.messages(id, 'bole')).at(-1)?.body, 'See you soon');
      await assert.rejects(() => service.messages(id, 'green'));
      assert.equal((await service.action(id, { type: 'rsvp', id: 'cleanup' })).state.attendingEvents.length, 1);
      assert.equal((await service.action(id, { type: 'rsvp', id: 'cleanup' })).state.attendingEvents.length, 0);
      await assert.rejects(() => service.action(id, { type: 'settings', notifications: 'yes', publicProfile: true }));
    });
    await context.test('parallel actions do not lose unrelated writes or duplicate claims', async () => {
      await Promise.all([
        service.action(id, { type: 'save', id: 'coffee' }), service.action(id, { type: 'save', id: 'books' }),
        service.action(id, { type: 'claim', id: 'coffee' }), service.action(id, { type: 'claim', id: 'coffee' }),
      ]);
      const result = await service.bootstrap(id);
      assert.deepEqual(result.state.savedBusinesses.sort(), ['books', 'coffee']);
      assert.deepEqual(result.state.claimedOffers, ['coffee']);
      await Promise.all([service.action(id, { type: 'hood', id: 'green' }), service.action(id, { type: 'hood', id: 'green' })]);
      assert.equal((await service.bootstrap(id)).state.joinedHoods.includes('green'), false);
    });
    await context.test('state is account-scoped and private names are hidden from other users', async () => {
      const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 808, first_name: 'Sara' }) });
      const secret = createHmac('sha256', 'WebAppData').update(config.BOT_TOKEN).digest();
      const check = Array.from(params.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
      params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
      const other = await auth.authenticate({ initData: params.toString() });
      const otherId = await auth.identify(`Bearer ${other.token}`);
      assert.equal((await service.bootstrap(otherId)).state.savedBusinesses.length, 0);
      assert.equal((await service.bootstrap(otherId)).points, 0);
      await service.action(id, { type: 'settings', notifications: false, publicProfile: false });
      const ownPost = (await service.bootstrap(id)).posts.find(post => post.body === 'Hello, neighbors!')!;
      assert.equal(ownPost.authorId, id);
      const visiblePost = (await service.bootstrap(otherId)).posts.find(post => post.id === ownPost.id)!;
      assert.equal(visiblePost.author, 'Community member');
      assert.equal(visiblePost.avatar, '');
      assert.equal(visiblePost.authorId, undefined);
      assert.equal((await service.messages(otherId, 'bole')).at(-1)?.author, 'Community member');
    });
    await context.test('foreign keys and database constraints prevent invalid records', async () => {
      await assert.rejects(() => database!.db.insert(schema.savedBusinesses).values({ userId: id, resourceId: 'missing' }));
      await assert.rejects(() => database!.db.update(schema.users).set({ points: -1 }).where(eq(schema.users.id, id)));
    });
    await context.test('administration enforces fresh roles, audit, archive, moderation, and per-account themes', async () => {
      const admin = new AdminService(database!);
      await assert.rejects(() => admin.list(id, 'schools'));
      await assert.rejects(() => admin.save(id, 'schools', { id: 'test-school', name: 'Test School', city: 'Addis Ababa', description: 'A test school catalog entry.' }));
      await assert.rejects(() => auth.authenticate({ demo: true, role: 'super_admin' }));
      const previews = new AuthService({ ...config, ALLOW_DEMO_ROLE_SWITCH: true }, repository);
      const rootSession = await previews.authenticate({ demo: true, role: 'super_admin' });
      const root = await previews.identify(`Bearer ${rootSession.token}`);
      const catalogSession = await previews.authenticate({ demo: true, role: 'admin' });
      const catalogAdmin = await previews.identify(`Bearer ${catalogSession.token}`);
      const moderatorSession = await previews.authenticate({ demo: true, role: 'moderator' });
      const moderator = await previews.identify(`Bearer ${moderatorSession.token}`);
      assert.equal((await service.bootstrap(root)).profile.role, 'super_admin');
      assert.equal((await admin.overview(moderator)).canManageCatalog, false);
      await assert.rejects(() => admin.list(moderator, 'schools'));
      await assert.rejects(() => admin.users(catalogAdmin));
      const school = { id: 'test-school', name: 'Test School', city: 'Addis Ababa', description: 'A test school catalog entry.' };
      await admin.save(root, 'schools', school);
      assert.equal((await service.bootstrap(id)).schools?.some(item => item.id === school.id), true);
      await service.action(id, { type: 'profile', name: 'Yonas Tesfaye', bio: 'Student.', school: school.name, hood: 'Bole Hood' });
      await admin.save(catalogAdmin, 'schools', { ...school, name: 'Updated Test School' });
      assert.equal((await service.bootstrap(id)).profile.school, 'Updated Test School');
      await admin.archive(root, 'schools', school.id, { archived: true });
      assert.equal((await service.bootstrap(id)).schools?.some(item => item.id === school.id), false);
      await admin.archive(root, 'schools', school.id, { archived: false });
      await admin.archive(root, 'businesses', 'books', { archived: true });
      assert.equal((await service.bootstrap(id)).businesses.some(item => item.id === 'books'), false);
      await assert.rejects(() => service.action(id, { type: 'claim', id: 'books' }));
      await admin.archive(root, 'businesses', 'books', { archived: false });
      await admin.assignRole(root, 'tg-808', { role: 'admin' });
      assert.equal((await admin.overview('tg-808')).canManageCatalog, true);
      await assert.rejects(() => admin.assignRole(catalogAdmin, id, { role: 'admin' }));
      await assert.rejects(() => admin.assignRole(root, root, { role: 'member' }));
      await assert.rejects(() => admin.assignRole(root, id, { role: 'super_admin' }));
      await admin.assignRole(root, 'tg-808', { role: 'member' });
      await assert.rejects(() => admin.list('tg-808', 'schools'));
      await admin.moderate(moderator, 'post-1', { hidden: true });
      assert.equal((await service.bootstrap(id)).posts.some(post => post.id === 'post-1'), false);
      await admin.moderate(moderator, 'post-1', { hidden: false });
      await assert.rejects(() => admin.moderate(id, 'post-1', { hidden: true }));
      const theme = { mode: 'dark', accent: '#d64c59' } as const;
      await service.action(id, { type: 'theme', theme });
      assert.deepEqual((await service.bootstrap(id)).profile.theme, theme);
      assert.deepEqual((await service.bootstrap('tg-808')).profile.theme, { mode: 'system', accent: '#3390ec' });
      await assert.rejects(() => service.action(id, { type: 'theme', theme: { mode: 'dark', accent: 'url(javascript:bad)' } }));
      assert.ok((await admin.auditLog(root)).length >= 10);
      await assert.rejects(() => admin.auditLog(moderator));
    });
    await context.test('Telegram inbox, verified Stars fulfillment, duplicate delivery, private notes, and refunds', async paymentContext => {
      const checkoutAnswers: boolean[] = [];
      const client = { api: {
        createInvoiceLink: async () => 'https://t.me/$test-invoice',
        answerPreCheckoutQuery: async (_query: string, ok: boolean) => { checkoutAnswers.push(ok); return true; },
        sendMessage: async () => ({ message_id: 1 }),
      } } as unknown as TelegramClient;
      const telegramConfig = { ...config, TELEGRAM_ENABLED: 'true' as const, PAYMENTS_ENABLED: 'true' as const, BOT_USERNAME: 'HoodLinkTestBot', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(48), WEB_ORIGIN: 'https://example.test', TERMS_URL: 'https://example.test/terms', SUPPORT_URL: 'https://example.test/support' };
      const telegram = new TelegramService(telegramConfig, database!, client, repository);
      const realId = 'tg-808';
      await telegram.connectAccount(realId, 808);
      await telegram.notify(realId, 'A test update', 'Your community update is ready.', '/hoods/bole');
      const inbox = await telegram.inbox(realId);
      assert.equal(inbox.length, 1);
      assert.equal((await telegram.inbox(id)).length, 0);
      await telegram.markRead(realId, inbox[0].id);
      assert.ok((await telegram.inbox(realId))[0].readAt);
      await assert.rejects(() => telegram.saveNote(realId, 'coffee', { body: 'Private note' }));
      await assert.rejects(() => telegram.invoice(id, { acceptedTerms: true }));
      await assert.rejects(() => telegram.invoice(realId, { acceptedTerms: false }));
      const invoice = await telegram.invoice(realId, { acceptedTerms: true });
      const query = { id: 'checkout-1', from: { id: 808, is_bot: false, first_name: 'Sara' }, currency: 'XTR', total_amount: 250, invoice_payload: invoice.id };
      await assert.rejects(() => telegram.webhook('wrong-secret', { update_id: 100, pre_checkout_query: query }));
      await telegram.webhook('a'.repeat(48), { update_id: 100, pre_checkout_query: { ...query, total_amount: 1 } });
      assert.equal(checkoutAnswers.at(-1), false);
      await telegram.webhook('a'.repeat(48), { update_id: 101, pre_checkout_query: query });
      assert.equal(checkoutAnswers.at(-1), true);
      assert.equal((await telegram.status(realId)).elite.active, false);
      const payment = { currency: 'XTR', total_amount: 250, invoice_payload: invoice.id, telegram_payment_charge_id: 'charge-808', provider_payment_charge_id: '' };
      const message = { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: 808, type: 'private' }, from: query.from, successful_payment: payment };
      await telegram.webhook('a'.repeat(48), { update_id: 102, message });
      const expiry = (await telegram.status(realId)).elite.expiresAt;
      assert.ok(expiry);
      assert.equal((await telegram.status(realId)).elite.active, true);
      await telegram.webhook('a'.repeat(48), { update_id: 102, message });
      await telegram.webhook('a'.repeat(48), { update_id: 103, message });
      assert.equal((await telegram.status(realId)).elite.expiresAt, expiry);
      assert.equal((await database!.db.select().from(schema.payments)).length, 1);
      await telegram.saveNote(realId, 'coffee', { body: 'My favorite quiet corner.' });
      assert.equal((await telegram.notes(realId, 'coffee')).body, 'My favorite quiet corner.');
      assert.equal((await telegram.notes(id, 'coffee')).body, '');
      await telegram.webhook('a'.repeat(48), { update_id: 104, message: { ...message, successful_payment: undefined, refunded_payment: payment } });
      assert.equal((await telegram.status(realId)).elite.active, false);
      await assert.rejects(() => telegram.saveNote(realId, 'coffee', { body: 'Changed' }));
      assert.equal((await telegram.notes(realId, 'coffee')).body, 'My favorite quiet corner.');
      const community = new CommunityService(repository, telegram);
      await community.action(realId, { type: 'rsvp', id: 'cleanup' });
      assert.equal((await telegram.inbox(realId)).some(item => item.title === 'Event RSVP updated'), true);
      await paymentContext.test('Telegram chat linkage verifies operators, bot rights, native polls, and notification opt-out', async () => {
        let administrator = true;
        const sentTo: number[] = [];
        const nativeClient = { api: {
          getMe: async () => ({ id: 999 }),
          getChat: async () => ({ id: -100123456, type: 'supergroup', title: 'Bole Telegram Group', username: 'bole_test_group' }),
          getChatMember: async (_chat: number, user: number) => user === 999 ? { status: 'administrator', can_invite_users: true } : { status: administrator ? 'administrator' : 'member' },
          sendPoll: async () => ({ message_id: 50, poll: { id: 'poll-123' } }),
          sendMessage: async (chatId: number) => { sentTo.push(chatId); return { message_id: 51 }; },
        } } as unknown as TelegramClient;
        const native = new TelegramService({ ...telegramConfig, TELEGRAM_ADMIN_IDS: '808' }, database!, nativeClient, repository);
        await assert.rejects(() => native.linkChat(id, { hoodId: 'bole', chatId: '@bole_test_group' }));
        administrator = false;
        await assert.rejects(() => native.linkChat(realId, { hoodId: 'bole', chatId: '@bole_test_group' }));
        administrator = true;
        await native.linkChat(realId, { hoodId: 'bole', chatId: '@bole_test_group' });
        assert.equal((await native.status(realId)).linkedChats[0].url, 'https://t.me/bole_test_group');
        await assert.rejects(() => native.createPoll(id, { hoodId: 'bole', question: 'Next meetup?', options: ['Study', 'Coffee'] }));
        await native.createPoll(realId, { hoodId: 'bole', question: 'Next meetup?', options: ['Study', 'Coffee'] });
        assert.equal((await native.polls(realId, 'bole'))[0].url, 'https://t.me/c/123456/50');
        await native.webhook('a'.repeat(48), { update_id: 105, poll: { id: 'poll-123', options: [{ text: 'Study', voter_count: 3 }, { text: 'Coffee', voter_count: 2 }], total_voter_count: 5, is_closed: false } });
        assert.equal((await native.polls(realId, 'bole'))[0].voters, 5);
        await native.connectAccount(realId, 808, true);
        await community.action(realId, { type: 'settings', notifications: false, publicProfile: false });
        await native.dispatch();
        assert.equal(sentTo.length, 0);
        const disconnected = new TelegramService({ ...config, TELEGRAM_ENABLED: 'false' }, database!, nativeClient, repository);
        await disconnected.notify(realId, 'Local inbox only', 'Created before Telegram was connected.');
        assert.equal((await disconnected.inbox(realId)).find(item => item.title === 'Local inbox only')?.delivery, 'in_app');
      });
    });
  } finally {
    await database?.onModuleDestroy();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  }
});