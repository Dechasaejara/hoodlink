import { z } from 'zod';

const name = z.string().trim().min(2).max(120);
const description = z.string().trim().min(5).max(2000);
const image = z.string().url().startsWith('https://').max(2048);
const nonnegative = z.number().int().min(0).max(1000000);
const id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
export const catalogSchemas = {
  schools: z.object({ id, name, city: name, description }),
  hoods: z.object({ id, name, description, category: z.enum(['Nearby', 'For you', 'My school']), image, members: nonnegative, color: z.string().regex(/^#[a-fA-F0-9]{6}$/) }),
  businesses: z.object({ id, name, description, category: z.enum(['Food & drink', 'Shopping', 'Health & fitness']), image, address: z.string().trim().min(5).max(240), rating: z.number().min(0).max(5), distance: z.string().trim().min(1).max(30), offer: z.string().trim().min(2).max(200), code: z.string().trim().min(2).max(80), phone: z.string().regex(/^\+?[0-9 ()-]{7,25}$/), hours: z.string().trim().min(2).max(120) }),
  challenges: z.object({ id, title: name, description, category: z.enum(['Community', 'School', 'Lifestyle']), image, participants: nonnegative, points: nonnegative, days: z.number().int().min(1).max(365), progress: z.number().int().min(0).max(100), icon: z.enum(['leaf', 'book', 'coffee', 'heart', 'trophy', 'music', 'users', 'palette']), hoodId: id }),
  events: z.object({ id, title: name, description, category: z.enum(['Community', 'Social', 'Arts & culture']), image, date: z.iso.date(), location: z.string().trim().min(2).max(160), time: z.string().trim().min(2).max(120), attending: nonnegative }),
};
export type CatalogEntity = keyof typeof catalogSchemas;
export const entitySchema = z.enum(['schools', 'hoods', 'businesses', 'challenges', 'events']);
export const themeSchema = z.object({ mode: z.enum(['system', 'light', 'dark']), accent: z.string().regex(/^#[a-fA-F0-9]{6}$/) });