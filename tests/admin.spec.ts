import { test, expect, type Page } from '@playwright/test';

async function menu(page: Page) { if ((page.viewportSize()?.width || 0) < 761) await page.getByRole('button', { name: 'Open menu', exact: true }).click(); }
async function switchRole(page: Page, role: string) {
  await menu(page);
  await page.getByRole('combobox', { name: 'Preview account role' }).selectOption(role);
  await expect(page).toHaveURL(role === 'member' ? /\/$/ : /\/admin$/);
  await expect(page.locator('.sidebar-role .role-badge')).toHaveText(role === 'super_admin' ? 'Super Admin' : role === 'moderator' ? 'Moderator' : role === 'admin' ? 'Admin' : 'Member');
}
async function navigate(page: Page, label: string) { await menu(page); await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click(); }

test('role layouts, catalog management, audit, and saved appearance', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good to see you, Yonas.' })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#3390ec');
  await switchRole(page, 'super_admin');
  await expect(page.getByRole('heading', { name: 'Super Admin workspace', exact: true }).first()).toBeVisible();
  await page.locator('.workspace-tabs').getByRole('button', { name: 'Schools', exact: true }).click();
  await page.getByRole('button', { name: 'Add record', exact: true }).click();
  const schoolName = `Test Academy ${testInfo.project.name} ${Date.now()}`;
  await page.getByRole('textbox', { name: 'School name', exact: true }).fill(schoolName);
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Addis Ababa');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('A school created during the administration browser check.');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await expect(page.getByText(schoolName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Edit ${schoolName}`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Updated catalog description, saved through the staff workspace.');
  await page.getByRole('button', { name: 'Save record', exact: true }).click();
  await page.getByRole('button', { name: `Archive ${schoolName}`, exact: true }).click();
  await expect(page.getByText(schoolName, { exact: true })).not.toBeVisible();
  await page.getByRole('combobox', { name: 'Record status' }).selectOption('archived');
  await expect(page.getByText(schoolName, { exact: true })).toBeVisible();
  await page.locator('.workspace-tabs').getByRole('button', { name: 'Accounts & roles' }).click();
  await expect(page.locator('.admin-table')).toBeVisible();
  await page.locator('.workspace-tabs').getByRole('button', { name: 'Audit trail' }).click();
  await expect(page.getByText(new RegExp(schoolName.toLowerCase().replace(/[^a-z0-9]+/g, '-'))).first()).toBeVisible();
  await switchRole(page, 'moderator');
  await expect(page.locator('.workspace-tabs').getByRole('button', { name: 'Moderation', exact: true })).toBeVisible();
  await expect(page.locator('.workspace-tabs').getByRole('button', { name: 'Schools', exact: true })).not.toBeVisible();
  await expect(page.locator('.workspace-tabs').getByRole('button', { name: 'Accounts & roles', exact: true })).not.toBeVisible();
  await switchRole(page, 'member');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Staff access required' })).toBeVisible();
  await navigate(page, 'Settings');
  await page.getByRole('button', { name: 'Use Coral accent' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByText('Saved to your account', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe('#d64c59');
  await page.getByRole('button', { name: 'Reset to Telegram defaults' }).click();
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByText('Saved to your account', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});