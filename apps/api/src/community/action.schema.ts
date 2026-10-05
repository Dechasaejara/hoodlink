import { z } from 'zod';
import { themeSchema } from '../admin/catalog.schema';

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['hood', 'challenge', 'save', 'rsvp', 'like', 'claim']), id: z.string().min(1).max(100) }),
  z.object({ type: z.literal('post'), body: z.string().trim().min(1).max(2000), hood: z.string().max(100) }),
  z.object({ type: z.literal('message'), body: z.string().trim().min(1).max(2000), channel: z.string().max(100) }),
  z.object({ type: z.literal('profile'), name: z.string().trim().min(2).max(80), bio: z.string().trim().max(240), school: z.string().trim().min(2).max(120), hood: z.string().max(100) }),
  z.object({ type: z.literal('settings'), notifications: z.boolean(), publicProfile: z.boolean() }),
  z.object({ type: z.literal('theme'), theme: themeSchema }),
]);