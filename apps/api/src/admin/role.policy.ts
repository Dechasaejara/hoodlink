import type { Role } from '../types';

export const roleOrder: Record<Role, number> = { member: 0, moderator: 1, admin: 2, super_admin: 3 };
export const hasRole = (actual: Role, required: Role) => roleOrder[actual] >= roleOrder[required];
export function canAssignRole(actor: Role, current: Role, requested: Role, actorId: string, targetId: string) { return actor === 'super_admin' && actorId !== targetId && current !== 'super_admin' && requested !== 'super_admin'; }