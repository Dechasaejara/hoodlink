import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAssignRole, hasRole } from '../src/admin/role.policy';

test('role hierarchy grants only the expected privileges', () => {
  assert.equal(hasRole('member', 'moderator'), false);
  assert.equal(hasRole('moderator', 'admin'), false);
  assert.equal(hasRole('admin', 'super_admin'), false);
  assert.equal(hasRole('super_admin', 'admin'), true);
});
test('only super admins can assign lower roles, never self-promote or replace root accounts', () => {
  assert.equal(canAssignRole('super_admin', 'member', 'admin', 'root', 'neighbor'), true);
  assert.equal(canAssignRole('admin', 'member', 'admin', 'staff', 'neighbor'), false);
  assert.equal(canAssignRole('super_admin', 'member', 'super_admin', 'root', 'neighbor'), false);
  assert.equal(canAssignRole('super_admin', 'super_admin', 'member', 'root', 'other-root'), false);
  assert.equal(canAssignRole('super_admin', 'admin', 'member', 'root', 'root'), false);
});