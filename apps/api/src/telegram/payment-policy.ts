import { timingSafeEqual } from 'node:crypto';
import type { SuccessfulPayment, PreCheckoutQuery } from 'grammy/types';

export function validWebhookSecret(expected: string, received?: string) {
  if (expected.length < 32 || !received) return false;
  const expectedBytes = Buffer.from(expected), receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
export function matchesInvoice(invoice: { id: string; userId: string; amount: number }, payerId: number, payment: Pick<SuccessfulPayment | PreCheckoutQuery, 'currency' | 'total_amount' | 'invoice_payload'>) {
  return invoice.userId === `tg-${payerId}` && payment.currency === 'XTR' && payment.total_amount === invoice.amount && payment.invoice_payload === invoice.id;
}