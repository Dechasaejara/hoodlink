import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { and, count, desc, eq, gt, gte, lte, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { GrammyError } from 'grammy';
import type { Message, Update } from 'grammy/types';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config';
import { DatabaseService, type Transaction } from '../database/database.service';
import * as schema from '../database/schema';
import { CommunityRepository } from '../community/community.repository';
import { TelegramClient } from './telegram.client';
import { matchesInvoice, validWebhookSecret } from './payment-policy';

const pollInput = z.object({ hoodId: z.string().min(1).max(100), question: z.string().trim().min(5).max(300), options: z.array(z.string().trim().min(1).max(100)).min(2).max(10).refine(options => new Set(options.map(option => option.toLowerCase())).size === options.length, 'Poll choices must be distinct.') });
const linkInput = z.object({ hoodId: z.string().min(1).max(100), chatId: z.string().regex(/^(-\d+|@[A-Za-z0-9_]{5,})$/) });
const updateInput = z.object({ update_id: z.number().int().min(0).max(2147483647) }).passthrough();

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(TelegramService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, @Inject(DatabaseService) private readonly database: DatabaseService, @Inject(TelegramClient) private readonly telegram: TelegramClient, @Inject(CommunityRepository) private readonly repository: CommunityRepository) {}
  onModuleInit() { if (this.config.TELEGRAM_ENABLED === 'true') { this.timer = setInterval(() => void this.dispatch().catch(() => this.logger.error('Telegram delivery worker failed.')), 2000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  isAdmin(id: string) { return id.startsWith('tg-') && this.config.TELEGRAM_ADMIN_IDS.split(',').includes(id.slice(3)); }
  private enabled() { if (this.config.TELEGRAM_ENABLED !== 'true') throw new ServiceUnavailableException('Telegram integration is awaiting deployment configuration.'); }
  private admin(id: string) { if (!this.isAdmin(id)) throw new ForbiddenException('A community administrator is required.'); }
  private telegramId(id: string) { if (!/^tg-\d+$/.test(id)) throw new ForbiddenException('Open HoodLink in Telegram with a verified account.'); return Number(id.slice(3)); }
  private async elite(id: string) { const [payment] = await this.database.db.select().from(schema.payments).where(and(eq(schema.payments.userId, id), eq(schema.payments.refunded, false), gt(schema.payments.validUntil, new Date().toISOString()))).orderBy(desc(schema.payments.validUntil)).limit(1); return payment; }

  async status(id: string) {
    const db = this.database.db;
    const [account] = await db.select().from(schema.telegramAccounts).where(eq(schema.telegramAccounts.userId, id));
    const elite = await this.elite(id);
    const linkedChats = await db.select({ hoodId: schema.telegramChats.hoodId, kind: schema.telegramChats.kind, title: schema.telegramChats.title, url: schema.telegramChats.url }).from(schema.telegramChats).innerJoin(schema.hoodMembers, and(eq(schema.telegramChats.hoodId, schema.hoodMembers.resourceId), eq(schema.hoodMembers.userId, id)));
    const [unread] = await db.select({ total: count() }).from(schema.notifications).where(and(eq(schema.notifications.userId, id), sql`${schema.notifications.readAt} IS NULL`));
    return { connected: this.config.TELEGRAM_ENABLED === 'true', botUsername: this.config.BOT_USERNAME, accountVerified: id.startsWith('tg-'), notificationsAllowed: account?.canNotify || false, admin: this.isAdmin(id), linkedChats, unread: unread.total, elite: { active: !!elite, expiresAt: elite?.validUntil || null, stars: this.config.ELITE_STARS, days: 30, checkoutEnabled: this.config.PAYMENTS_ENABLED === 'true' && id.startsWith('tg-'), termsUrl: this.config.TERMS_URL || null, supportUrl: this.config.SUPPORT_URL || null, termsVersion: 'elite-v1', pollLimit: elite ? 10 : 1 } };
  }

  async connectAccount(id: string, telegramId: number, canNotify = false) {
    await this.database.db.insert(schema.telegramAccounts).values({ userId: id, telegramId: String(telegramId), canNotify }).onConflictDoUpdate({ target: schema.telegramAccounts.userId, set: canNotify ? { canNotify: true } : { telegramId: String(telegramId) } });
  }

  async notificationAccess(id: string) {
    this.enabled();
    const telegramId = this.telegramId(id);
    try { await this.telegram.api.sendMessage(telegramId, 'HoodLink updates are connected. You can turn them off in Settings or send /stop.'); }
    catch { throw new BadRequestException('Allow bot messages in Telegram or start the bot first.'); }
    await this.connectAccount(id, telegramId, true);
    return this.status(id);
  }

  async inbox(id: string) { return this.database.db.select().from(schema.notifications).where(eq(schema.notifications.userId, id)).orderBy(desc(schema.notifications.createdAt)).limit(100); }
  async markRead(id: string, notificationId: string) { await this.database.db.update(schema.notifications).set({ readAt: new Date().toISOString() }).where(and(eq(schema.notifications.userId, id), eq(schema.notifications.id, notificationId))); return this.inbox(id); }
  async notify(id: string, title: string, body: string, path = '/') {
    await this.database.db.insert(schema.notifications).values({ id: randomUUID(), userId: id, title, body, path, delivery: this.config.TELEGRAM_ENABLED === 'true' ? 'pending' : 'in_app' });
  }
  async queue(transaction: Transaction, id: string, title: string, body: string, path: string) { await transaction.insert(schema.notifications).values({ id: randomUUID(), userId: id, title, body, path, delivery: this.config.TELEGRAM_ENABLED === 'true' ? 'pending' : 'in_app' }); }

  async dispatch() {
    if (this.running || this.config.TELEGRAM_ENABLED !== 'true') return;
    this.running = true;
    try {
      const jobs = await this.database.db.transaction(async transaction => {
        const now = new Date().toISOString();
        const rows = await transaction.select().from(schema.notifications).where(and(or(eq(schema.notifications.delivery, 'pending'), eq(schema.notifications.delivery, 'sending')), lte(schema.notifications.nextAttemptAt, now))).orderBy(schema.notifications.createdAt).limit(1).for('update', { skipLocked: true });
        for (const row of rows) await transaction.update(schema.notifications).set({ delivery: 'sending', attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + 120000).toISOString() }).where(eq(schema.notifications.id, row.id));
        return rows;
      });
      for (const job of jobs) {
        const [recipient] = await this.database.db.select({ account: schema.telegramAccounts, enabled: schema.users.notifications }).from(schema.telegramAccounts).innerJoin(schema.users, eq(schema.telegramAccounts.userId, schema.users.id)).where(eq(schema.telegramAccounts.userId, job.userId));
        if (!recipient?.account.canNotify || !recipient.enabled) { await this.database.db.update(schema.notifications).set({ delivery: 'in_app' }).where(eq(schema.notifications.id, job.id)); continue; }
        try {
          const url = `${this.config.WEB_ORIGIN}${job.path}`;
          await this.telegram.api.sendMessage(Number(recipient.account.telegramId), `${job.title}\n\n${job.body}`, { reply_markup: { inline_keyboard: [[{ text: 'Open HoodLink', web_app: { url } }]] } });
          await this.database.db.update(schema.notifications).set({ delivery: 'sent' }).where(eq(schema.notifications.id, job.id));
        } catch (error) {
          const blocked = error instanceof GrammyError && error.error_code === 403;
          if (blocked) await this.database.db.update(schema.telegramAccounts).set({ canNotify: false }).where(eq(schema.telegramAccounts.userId, job.userId));
          const delay = error instanceof GrammyError && error.parameters.retry_after ? error.parameters.retry_after * 1000 : Math.min(600000, 10000 * 2 ** job.attempts);
          await this.database.db.update(schema.notifications).set({ delivery: blocked ? 'in_app' : job.attempts >= 4 ? 'failed' : 'pending', nextAttemptAt: new Date(Date.now() + delay).toISOString() }).where(eq(schema.notifications.id, job.id));
        }
      }
    } finally { this.running = false; }
  }

  async linkChat(id: string, input: unknown) {
    this.enabled(); this.admin(id);
    const parsed = linkInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Choose a community and a valid Telegram chat ID or @username.');
    const { hoodId, chatId } = parsed.data;
    const [hood] = await this.database.db.select().from(schema.hoods).where(eq(schema.hoods.id, hoodId));
    if (!hood) throw new BadRequestException('Community not found.');
    const chat = await this.telegram.api.getChat(chatId);
    if (chat.type === 'private') throw new BadRequestException('Link a group, supergroup, or channel.');
    const me = await this.telegram.api.getMe();
    const botMember = await this.telegram.api.getChatMember(chat.id, me.id);
    if (botMember.status !== 'administrator') throw new BadRequestException('Add the HoodLink bot as a chat administrator first.');
    const actor = await this.telegram.api.getChatMember(chat.id, this.telegramId(id));
    if (!['creator', 'administrator'].includes(actor.status)) throw new ForbiddenException('You must also administer this Telegram chat.');
    if (chat.type === 'channel' && !botMember.can_post_messages) throw new BadRequestException('The bot needs permission to publish channel posts.');
    const url = chat.username ? `https://t.me/${chat.username}` : botMember.can_invite_users ? (await this.telegram.api.createChatInviteLink(chat.id, { name: 'HoodLink community' })).invite_link : undefined;
    if (!url) throw new BadRequestException('A private chat requires invite permissions for the bot.');
    const kind = chat.type === 'channel' ? 'channel' : 'group';
    await this.database.db.insert(schema.telegramChats).values({ hoodId, kind, chatId: String(chat.id), title: chat.title, url, linkedBy: id }).onConflictDoUpdate({ target: [schema.telegramChats.hoodId, schema.telegramChats.kind], set: { chatId: String(chat.id), title: chat.title, url, linkedBy: id, linkedAt: new Date().toISOString() } });
    return this.status(id);
  }

  async polls(id: string, hoodId: string) {
    const member = await this.database.db.select().from(schema.hoodMembers).where(and(eq(schema.hoodMembers.userId, id), eq(schema.hoodMembers.resourceId, hoodId))).limit(1);
    if (!member.length) throw new ForbiddenException('Join this community to view its polls.');
    return this.database.db.select().from(schema.telegramPolls).where(eq(schema.telegramPolls.hoodId, hoodId)).orderBy(desc(schema.telegramPolls.createdAt)).limit(50);
  }

  async createPoll(id: string, input: unknown) {
    this.enabled(); this.telegramId(id);
    const parsed = pollInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
    const value = parsed.data;
    const [chat] = await this.database.db.select().from(schema.telegramChats).where(and(eq(schema.telegramChats.hoodId, value.hoodId), eq(schema.telegramChats.kind, 'group')));
    if (!chat) throw new BadRequestException('This community has no connected Telegram group.');
    const [member, nativeChat] = await Promise.all([this.telegram.api.getChatMember(Number(chat.chatId), this.telegramId(id)), this.telegram.api.getChat(Number(chat.chatId))]);
    const defaultPollPermission = (nativeChat.type === 'group' || nativeChat.type === 'supergroup') && nativeChat.permissions?.can_send_polls === true;
    const allowed = ['creator', 'administrator'].includes(member.status) || (member.status === 'member' && defaultPollPermission) || (member.status === 'restricted' && member.is_member && member.can_send_polls);
    if (!allowed) throw new ForbiddenException('Join the Telegram group and have poll permissions before publishing.');
    const elite = await this.elite(id);
    const pollId = randomUUID();
    await this.repository.withUser(id, async transaction => {
      if (!await this.repository.canParticipate(transaction, id, value.hoodId)) throw new ForbiddenException('Join this community before publishing a poll.');
      const day = new Date(); day.setUTCHours(0, 0, 0, 0);
      const [used] = await transaction.select({ total: count() }).from(schema.telegramPolls).where(and(eq(schema.telegramPolls.authorId, id), gte(schema.telegramPolls.createdAt, day.toISOString())));
      if (!this.isAdmin(id) && used.total >= (elite ? 10 : 1)) throw new ForbiddenException('Your daily poll allowance has been used.');
      await transaction.insert(schema.telegramPolls).values({ id: pollId, hoodId: value.hoodId, authorId: id, question: value.question, options: value.options.map(text => ({ text, voter_count: 0 })) });
    });
    try {
      const sent = await this.telegram.api.sendPoll(Number(chat.chatId), value.question, value.options.map(text => ({ text })), { is_anonymous: true });
      const url = chat.chatId.startsWith('-100') ? `https://t.me/c/${chat.chatId.slice(4)}/${sent.message_id}` : chat.url;
      await this.database.db.update(schema.telegramPolls).set({ telegramPollId: sent.poll.id, messageId: sent.message_id, url, state: 'published' }).where(eq(schema.telegramPolls.id, pollId));
      await this.notify(id, 'Your poll is live', value.question, `/hoods/${value.hoodId}`);
    } catch { await this.database.db.update(schema.telegramPolls).set({ state: 'failed' }).where(eq(schema.telegramPolls.id, pollId)); throw new ServiceUnavailableException('Telegram did not confirm poll publication. Check the group before retrying.'); }
    return this.polls(id, value.hoodId);
  }

  async notes(id: string, businessId: string) { const [note] = await this.database.db.select().from(schema.placeNotes).where(and(eq(schema.placeNotes.userId, id), eq(schema.placeNotes.businessId, businessId))); return { body: note?.body || '', updatedAt: note?.updatedAt || null }; }
  async saveNote(id: string, businessId: string, input: unknown) {
    const parsed = z.object({ body: z.string().trim().max(2000) }).safeParse(input);
    if (!parsed.success) throw new BadRequestException('Notes can contain up to 2000 characters.');
    if (!await this.elite(id)) throw new ForbiddenException('An active Elite pass is needed to edit private place notes.');
    const [business] = await this.database.db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId));
    if (!business) throw new BadRequestException('Business not found.');
    await this.database.db.insert(schema.placeNotes).values({ userId: id, businessId, body: parsed.data.body }).onConflictDoUpdate({ target: [schema.placeNotes.userId, schema.placeNotes.businessId], set: { body: parsed.data.body, updatedAt: new Date().toISOString() } });
    return this.notes(id, businessId);
  }

  async invoice(id: string, input: unknown) {
    this.enabled(); this.telegramId(id);
    if (this.config.PAYMENTS_ENABLED !== 'true') throw new ServiceUnavailableException('Elite checkout is not enabled yet.');
    if (!z.object({ acceptedTerms: z.literal(true) }).safeParse(input).success) throw new BadRequestException('Accept the purchase terms to continue.');
    const invoiceId = randomUUID();
    await this.repository.withUser(id, async transaction => {
      const [pending] = await transaction.select().from(schema.invoices).where(and(eq(schema.invoices.userId, id), eq(schema.invoices.status, 'pending'), gte(schema.invoices.createdAt, new Date(Date.now() - 60000).toISOString()))).limit(1);
      if (pending) throw new BadRequestException('A checkout was recently created. Wait a minute before starting another.');
      await transaction.insert(schema.invoices).values({ id: invoiceId, userId: id, product: 'elite', amount: this.config.ELITE_STARS, termsVersion: 'elite-v1' });
    });
    const url = await this.telegram.api.createInvoiceLink('HoodLink Elite', '30 days of private place notes and up to 10 community polls per day. One-time pass. No automatic renewal.', invoiceId, '', 'XTR', [{ label: 'Elite 30-day pass', amount: this.config.ELITE_STARS }]);
    await this.database.db.update(schema.invoices).set({ url }).where(eq(schema.invoices.id, invoiceId));
    return { id: invoiceId, url };
  }

  async refund(id: string, input: unknown) {
    this.enabled(); this.admin(id);
    const parsed = z.object({ chargeId: z.string().min(1).max(200) }).safeParse(input);
    if (!parsed.success) throw new BadRequestException('A payment charge ID is required.');
    const [payment] = await this.database.db.select().from(schema.payments).where(eq(schema.payments.chargeId, parsed.data.chargeId));
    if (!payment) throw new BadRequestException('Payment not found.');
    if (!payment.refunded) await this.telegram.api.refundStarPayment(this.telegramId(payment.userId), payment.chargeId);
    await this.database.db.transaction(async transaction => { await transaction.update(schema.payments).set({ refunded: true }).where(eq(schema.payments.chargeId, payment.chargeId)); await transaction.update(schema.invoices).set({ status: 'refunded' }).where(eq(schema.invoices.id, payment.invoiceId)); });
    return { refunded: true };
  }

  async webhook(secret: string | undefined, input: unknown) {
    this.enabled();
    if (!validWebhookSecret(this.config.TELEGRAM_WEBHOOK_SECRET, secret)) throw new UnauthorizedException('Invalid Telegram webhook.');
    const parsed = updateInput.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid update.');
    const update = parsed.data as unknown as Update;
    await this.database.db.transaction(async transaction => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(78124403, ${update.update_id})`);
      const existing = await transaction.select().from(schema.telegramUpdates).where(eq(schema.telegramUpdates.id, update.update_id));
      if (existing.length) return;
      await this.processUpdate(transaction, update);
      await transaction.insert(schema.telegramUpdates).values({ id: update.update_id });
    });
    return { ok: true };
  }

  private async processUpdate(transaction: Transaction, update: Update) {
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const [invoice] = await transaction.select().from(schema.invoices).where(eq(schema.invoices.id, query.invoice_payload));
      const ok = !!invoice && invoice.status === 'pending' && matchesInvoice(invoice, query.from.id, query) && this.config.PAYMENTS_ENABLED === 'true';
      await this.telegram.api.answerPreCheckoutQuery(query.id, ok, ok ? {} : { error_message: 'This checkout is not available. Open HoodLink and create a new one.' });
    }
    if (update.message?.successful_payment && update.message.from) {
      const payment = update.message.successful_payment;
      const alreadyRecorded = await transaction.select().from(schema.payments).where(eq(schema.payments.chargeId, payment.telegram_payment_charge_id)).limit(1);
      if (alreadyRecorded.length) return;
      const [invoice] = await transaction.select().from(schema.invoices).where(eq(schema.invoices.id, payment.invoice_payload)).for('update');
      if (!invoice || !matchesInvoice(invoice, update.message.from.id, payment)) throw new BadRequestException('Payment does not match its original invoice.');
      if (invoice.status !== 'pending') {
        const duplicate = await transaction.select().from(schema.payments).where(eq(schema.payments.chargeId, payment.telegram_payment_charge_id)).limit(1);
        if (duplicate.length) return;
        throw new BadRequestException('This invoice has already been fulfilled.');
      }
      await transaction.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, invoice.userId)).for('update');
      const current = await transaction.select().from(schema.payments).where(and(eq(schema.payments.userId, invoice.userId), eq(schema.payments.refunded, false))).orderBy(desc(schema.payments.validUntil)).limit(1);
      const base = Math.max(Date.now(), current[0] ? Date.parse(current[0].validUntil) : 0);
      const recorded = await transaction.insert(schema.payments).values({ chargeId: payment.telegram_payment_charge_id, invoiceId: invoice.id, userId: invoice.userId, amount: payment.total_amount, validUntil: new Date(base + 30 * 86400000).toISOString() }).onConflictDoNothing().returning();
      if (recorded.length) { await transaction.update(schema.invoices).set({ status: 'paid' }).where(eq(schema.invoices.id, invoice.id)); await transaction.insert(schema.notifications).values({ id: randomUUID(), userId: invoice.userId, title: 'Welcome to Elite', body: 'Your 30-day pass is active. Your private place notes and higher poll allowance are ready.', path: '/elite' }); }
    }
    if (update.message?.refunded_payment) {
      const [payment] = await transaction.update(schema.payments).set({ refunded: true }).where(eq(schema.payments.chargeId, update.message.refunded_payment.telegram_payment_charge_id)).returning();
      if (payment) await transaction.update(schema.invoices).set({ status: 'refunded' }).where(eq(schema.invoices.id, payment.invoiceId));
    }
    if (update.poll) await transaction.update(schema.telegramPolls).set({ options: update.poll.options.map(option => ({ text: option.text, voter_count: option.voter_count })), voters: update.poll.total_voter_count, closed: update.poll.is_closed }).where(eq(schema.telegramPolls.telegramPollId, update.poll.id));
    if (update.message?.chat.type === 'private' && update.message.from) await this.privateCommand(update.message);
    if (update.my_chat_member?.chat.type === 'private') await transaction.update(schema.telegramAccounts).set({ canNotify: update.my_chat_member.new_chat_member.status !== 'kicked' }).where(eq(schema.telegramAccounts.telegramId, String(update.my_chat_member.chat.id)));
  }

  private async privateCommand(message: Message) {
    if (!message.from) return;
    const command = message.text?.split(/\s/)[0].split('@')[0];
    const id = `tg-${message.from.id}`;
    if (command === '/start' || message.write_access_allowed) {
      await this.repository.ensureUser({ id, name: [message.from.first_name, message.from.last_name].filter(Boolean).join(' '), avatar: '', school: 'Addis Ababa University', hood: 'Bole Hood', bio: 'Making a little difference, close to home.' });
      await this.connectAccount(id, message.from.id, true);
      await this.telegram.api.sendMessage(message.chat.id, 'Your school. Your hood. Your community. Welcome to HoodLink.', { reply_markup: { inline_keyboard: [[{ text: 'Open HoodLink', web_app: { url: this.config.WEB_ORIGIN } }]] } });
    } else if (command === '/stop') { await this.database.db.update(schema.telegramAccounts).set({ canNotify: false }).where(eq(schema.telegramAccounts.userId, id)); await this.telegram.api.sendMessage(message.chat.id, 'Telegram updates are paused. Use the app to enable them again.'); }
    else if (command === '/terms') await this.telegram.api.sendMessage(message.chat.id, this.config.TERMS_URL || 'Purchases are not available until the operator publishes terms.');
    else if (command === '/paysupport' || command === '/support') await this.telegram.api.sendMessage(message.chat.id, this.config.SUPPORT_URL || 'Payment support is not configured. No live purchases are enabled.');
    else if (command === '/link') await this.telegram.api.sendMessage(message.chat.id, 'Open Telegram connections in HoodLink to link a group or channel. Your configured operator account and chat administrator rights will be verified.');
  }
}