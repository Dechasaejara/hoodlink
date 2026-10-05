import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesInvoice, validWebhookSecret } from '../src/telegram/payment-policy';
import { readConfig } from '../src/config';

test('webhook secrets fail closed and payment identity, currency, payload, and amount are checked', () => {
  const secret = 'a'.repeat(48);
  assert.equal(validWebhookSecret(secret, secret), true);
  assert.equal(validWebhookSecret(secret, 'b'.repeat(48)), false);
  assert.equal(validWebhookSecret('', ''), false);
  const invoice = { id: 'invoice-42', userId: 'tg-42', amount: 250 };
  const payment = { currency: 'XTR', total_amount: 250, invoice_payload: 'invoice-42' };
  assert.equal(matchesInvoice(invoice, 42, payment), true);
  assert.equal(matchesInvoice(invoice, 808, payment), false);
  assert.equal(matchesInvoice(invoice, 42, { ...payment, total_amount: 1 }), false);
  assert.equal(matchesInvoice(invoice, 42, { ...payment, currency: 'USD' }), false);
  assert.equal(matchesInvoice(invoice, 42, { ...payment, invoice_payload: 'different' }), false);
});
test('Telegram and monetization cannot be enabled without required deployment configuration', () => {
  const source = { DATABASE_URL: 'postgresql://test:test@localhost/test' };
  assert.throws(() => readConfig({ ...source, TELEGRAM_ENABLED: 'true' }));
  assert.throws(() => readConfig({ ...source, PAYMENTS_ENABLED: 'true' }));
});