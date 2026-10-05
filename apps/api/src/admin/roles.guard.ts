import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { users } from '../database/schema';
import type { Role } from '../types';
import { hasRole } from './role.policy';

export const RequireRole = (role: Role) => SetMetadata('minimumRole', role);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(Reflector) private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const minimum = this.reflector.getAllAndOverride<Role>('minimumRole', [context.getHandler(), context.getClass()]) || 'member';
    const request = context.switchToHttp().getRequest<Request & { userId: string }>();
    const [user] = await this.database.db.select({ role: users.role }).from(users).where(eq(users.id, request.userId)).limit(1);
    if (!user || !hasRole(user.role, minimum)) throw new ForbiddenException('Your account does not have access to this workspace.');
    return true;
  }
}