import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';

const telegramUser = z.object({ id: z.number().int().positive(), first_name: z.string().min(1).max(100), last_name: z.string().max(100).optional(), photo_url: z.string().url().optional(), allows_write_to_pm: z.boolean().optional() });

export function validateTelegramData(initData: string, botToken: string, now = Date.now()) {
  if (!botToken || !initData || initData.length > 16384) throw new UnauthorizedException('Telegram authentication is not configured.');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const keys = Array.from(params.keys());
  if (new Set(keys).size !== keys.length || !receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash) || !Number.isInteger(authDate) || authDate <= 0 || now / 1000 - authDate > 3600 || authDate - now / 1000 > 30) {
    throw new UnauthorizedException('This Telegram session has expired. Reopen the mini app.');
  }
  params.delete('hash');
  const checkString = Array.from(params.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secret).update(checkString).digest();
  if (!timingSafeEqual(expectedHash, Buffer.from(receivedHash, 'hex'))) throw new UnauthorizedException('Invalid Telegram identity.');
  try {
    return telegramUser.parse(JSON.parse(params.get('user') ?? '{}'));
  } catch {
    throw new UnauthorizedException('Invalid Telegram user.');
  }
}