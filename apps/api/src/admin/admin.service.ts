import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService, type Transaction } from '../database/database.service';
import * as schema from '../database/schema';
import type { Role } from '../types';
import { catalogSchemas, entitySchema } from './catalog.schema';
import { canAssignRole, hasRole } from './role.policy';

const tables = { schools: schema.schools, hoods: schema.hoods, businesses: schema.businesses, challenges: schema.challenges, events: schema.events };

@Injectable()
export class AdminService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private async authorized<T>(actorId: string, minimum: Role, operation: (transaction: Transaction, role: Role) => Promise<T>) {
    return this.database.db.transaction(async transaction => {
      const [actor] = await transaction.select().from(schema.users).where(eq(schema.users.id, actorId)).for('share');
      if (!actor || !hasRole(actor.role, minimum)) throw new ForbiddenException('Your account does not have access to this workspace.');
      return operation(transaction, actor.role);
    });
  }

  private entity(input: string) { const result = entitySchema.safeParse(input); if (!result.success) throw new BadRequestException('Unknown catalog section.'); return result.data; }
  private async audit(transaction: Transaction, actorId: string, action: string, entity: string, recordId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) { await transaction.insert(schema.auditLogs).values({ id: randomUUID(), actorId, action, entity, recordId, before, after }); }

  async overview(actorId: string) {
    return this.authorized(actorId, 'moderator', async (transaction, role) => {
      const total = async (table: typeof schema.users | typeof schema.hoods | typeof schema.businesses | typeof schema.schools | typeof schema.posts) => (await transaction.select({ value: count() }).from(table))[0].value;
      return { role, users: await total(schema.users), communities: await total(schema.hoods), businesses: await total(schema.businesses), schools: await total(schema.schools), posts: await total(schema.posts), canManageCatalog: hasRole(role, 'admin'), canManageRoles: role === 'super_admin' };
    });
  }

  async list(actorId: string, input: string) {
    const entity = this.entity(input);
    return this.authorized(actorId, 'admin', transaction => transaction.select().from(tables[entity]).orderBy(tables[entity].id).limit(500));
  }

  async save(actorId: string, input: string, body: unknown) {
    const entity = this.entity(input);
    const parsed = catalogSchemas[entity].safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
    const value = parsed.data;
    try {
      return await this.authorized(actorId, 'admin', async transaction => {
        await transaction.execute(`SELECT pg_advisory_xact_lock(78124404)`);
        const table = tables[entity];
        const [before] = await transaction.select().from(table).where(eq(table.id, value.id)).for('update');
        if (entity === 'schools') {
          const row = catalogSchemas.schools.parse(value);
          await transaction.insert(schema.schools).values(row).onConflictDoUpdate({ target: schema.schools.id, set: row });
          if (before && 'name' in before && before.name !== row.name) await transaction.update(schema.users).set({ school: row.name }).where(eq(schema.users.school, before.name));
        } else if (entity === 'hoods') {
          const row = catalogSchemas.hoods.parse(value);
          await transaction.insert(schema.hoods).values(row).onConflictDoUpdate({ target: schema.hoods.id, set: row });
          if (before) await transaction.update(schema.channels).set({ name: row.name, image: row.image }).where(eq(schema.channels.id, row.id));
        } else if (entity === 'businesses') {
          const input = catalogSchemas.businesses.parse(value);
          const row = { ...input, rating: input.rating.toFixed(1) };
          await transaction.insert(schema.businesses).values(row).onConflictDoUpdate({ target: schema.businesses.id, set: row });
        } else if (entity === 'challenges') {
          const row = catalogSchemas.challenges.parse(value);
          const [hood] = await transaction.select().from(schema.hoods).where(and(eq(schema.hoods.id, row.hoodId), eq(schema.hoods.archived, false)));
          if (!hood) throw new BadRequestException('Choose an active community.');
          await transaction.insert(schema.challenges).values(row).onConflictDoUpdate({ target: schema.challenges.id, set: row });
        } else {
          const input = catalogSchemas.events.parse(value);
          const date = new Date(`${input.date}T12:00:00Z`);
          const row = { ...input, month: date.toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase(), day: String(date.getUTCDate()) };
          await transaction.insert(schema.events).values(row).onConflictDoUpdate({ target: schema.events.id, set: row });
        }
        const [after] = await transaction.select().from(table).where(eq(table.id, value.id));
        await this.audit(transaction, actorId, before ? 'update' : 'create', entity, value.id, before || null, after);
        return after;
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code || (error as { code?: string }).code;
      if (code === '23505') throw new ConflictException('A record with this name or ID already exists.');
      if (code === '23503') throw new BadRequestException('A referenced record is not available.');
      throw error;
    }
  }

  async archive(actorId: string, input: string, recordId: string, body: unknown) {
    const entity = this.entity(input);
    const parsed = z.object({ archived: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Specify whether to archive or restore this record.');
    return this.authorized(actorId, 'admin', async transaction => {
      await transaction.execute(`SELECT pg_advisory_xact_lock(78124404)`);
      const table = tables[entity];
      const [before] = await transaction.select().from(table).where(eq(table.id, recordId)).for('update');
      if (!before) throw new NotFoundException('Record not found.');
      if (parsed.data.archived && (entity === 'hoods' || entity === 'schools')) {
        const [active] = await transaction.select({ value: count() }).from(table).where(eq(table.archived, false));
        if (!before.archived && active.value <= 1) throw new BadRequestException('Keep at least one active school and community available.');
      }
      const [after] = await transaction.update(table).set({ archived: parsed.data.archived }).where(eq(table.id, recordId)).returning();
      await this.audit(transaction, actorId, parsed.data.archived ? 'archive' : 'restore', entity, recordId, before, after);
      return after;
    });
  }

  async users(actorId: string) { return this.authorized(actorId, 'super_admin', transaction => transaction.select({ id: schema.users.id, name: schema.users.name, school: schema.users.school, role: schema.users.role, createdAt: schema.users.createdAt }).from(schema.users).orderBy(desc(schema.users.createdAt)).limit(500)); }

  async assignRole(actorId: string, targetId: string, body: unknown) {
    const parsed = z.object({ role: z.enum(['member', 'moderator', 'admin']) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Choose a supported delegated role.');
    return this.authorized(actorId, 'super_admin', async (transaction, actorRole) => {
      const [target] = await transaction.select().from(schema.users).where(eq(schema.users.id, targetId)).for('update');
      if (!target) throw new NotFoundException('Account not found.');
      if (targetId.startsWith('seed-') || !canAssignRole(actorRole, target.role, parsed.data.role, actorId, targetId)) throw new ForbiddenException('You cannot change your own role or a protected account.');
      const [updated] = await transaction.update(schema.users).set({ role: parsed.data.role }).where(eq(schema.users.id, targetId)).returning({ id: schema.users.id, name: schema.users.name, role: schema.users.role });
      await this.audit(transaction, actorId, 'assign_role', 'users', targetId, { role: target.role }, { role: updated.role });
      return updated;
    });
  }

  async posts(actorId: string) { return this.authorized(actorId, 'moderator', transaction => transaction.select({ id: schema.posts.id, body: schema.posts.body, author: schema.users.name, hood: schema.hoods.name, hidden: schema.posts.hidden, createdAt: schema.posts.createdAt }).from(schema.posts).innerJoin(schema.users, eq(schema.posts.authorId, schema.users.id)).innerJoin(schema.hoods, eq(schema.posts.hoodId, schema.hoods.id)).orderBy(desc(schema.posts.createdAt)).limit(200)); }
  async moderate(actorId: string, postId: string, body: unknown) {
    const parsed = z.object({ hidden: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Specify whether to hide or restore the post.');
    return this.authorized(actorId, 'moderator', async transaction => {
      const [before] = await transaction.select().from(schema.posts).where(eq(schema.posts.id, postId)).for('update');
      if (!before) throw new NotFoundException('Post not found.');
      const [after] = await transaction.update(schema.posts).set({ hidden: parsed.data.hidden }).where(eq(schema.posts.id, postId)).returning();
      await this.audit(transaction, actorId, parsed.data.hidden ? 'hide_post' : 'restore_post', 'posts', postId, { hidden: before.hidden }, { hidden: after.hidden });
      return { id: after.id, hidden: after.hidden };
    });
  }
  async auditLog(actorId: string) { return this.authorized(actorId, 'super_admin', transaction => transaction.select({ id: schema.auditLogs.id, actor: schema.users.name, action: schema.auditLogs.action, entity: schema.auditLogs.entity, recordId: schema.auditLogs.recordId, before: schema.auditLogs.before, after: schema.auditLogs.after, createdAt: schema.auditLogs.createdAt }).from(schema.auditLogs).innerJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id)).orderBy(desc(schema.auditLogs.createdAt)).limit(200)); }
}