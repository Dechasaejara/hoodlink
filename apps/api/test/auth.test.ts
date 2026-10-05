import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTelegramData } from '../src/auth';
import { AuthService } from '../src/auth/auth.service';
import { readConfig } from '../src/config';
import type { CommunityRepository } from '../src/community/community.repository';

export const botToken = 'test-bot-token';
export function signedData(date: number, id = 42, name = 'Sara') {
  const params = new URLSearchParams({ auth_date: String(date), user: JSON.stringify({ id, first_name: name }) });
  const check = Array.from(params.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
test('Telegram identity requires an authentic, recent signature', () => {
  const now = Date.now();
  const valid = signedData(Math.floor(now / 1000));
  assert.equal(validateTelegramData(valid, botToken, now).id, 42);
  assert.throws(() => validateTelegramData(valid.replace('Sara', 'Fake'), botToken, now));
  assert.throws(() => validateTelegramData(signedData(Math.floor(now / 1000) - 4000), botToken, now));
  assert.throws(() => validateTelegramData(signedData(Math.floor(now / 1000) + 300), botToken, now));
  assert.throws(() => validateTelegramData(valid + '&auth_date=1', botToken, now));
});
test('environment validation fails closed and never enables a production demo', () => {
  const values = { DATABASE_URL: 'postgresql://test:test@localhost/test', NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(48), BOT_TOKEN: botToken, ALLOW_DEMO_AUTH: 'true' };
  assert.equal(readConfig(values).ALLOW_DEMO_AUTH, false);
  assert.equal(readConfig({ ...values, ALLOW_DEMO_ROLE_SWITCH: 'true' }).ALLOW_DEMO_ROLE_SWITCH, false);
  assert.throws(() => readConfig({ ...values, SESSION_SECRET: 'short' }));
  assert.throws(() => readConfig({ ...values, SESSION_SECRET: 'hoodlink-local-development-secret-change-before-deploying' }));
  assert.throws(() => readConfig({ ...values, BOT_TOKEN: '' }));
  assert.throws(() => readConfig({ ...values, DATABASE_URL: 'sqlite://data' }));
  assert.throws(() => readConfig({ ...values, PORT: 'invalid' }));
});
test('signed sessions validate identity and reject demo login in production', async () => {
  const ids = new Set<string>();
  const repository = { ensureUser: async (profile: { id: string }) => { ids.add(profile.id); }, hasUser: async (id: string) => ids.has(id) } as unknown as CommunityRepository;
  const config = readConfig({ DATABASE_URL: 'postgresql://test:test@localhost/test', NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(48), BOT_TOKEN: botToken });
  const auth = new AuthService(config, repository);
  await assert.rejects(() => auth.authenticate({ demo: true }));
  const session = await auth.authenticate({ initData: signedData(Math.floor(Date.now() / 1000)) });
  assert.equal(await auth.identify(`Bearer ${session.token}`), 'tg-42');
  await assert.rejects(() => auth.identify('Bearer fake'));
  ids.clear();
  await assert.rejects(() => auth.identify(`Bearer ${session.token}`));
});