import { test, expect, type Page } from '@playwright/test';

async function navigate(page: Page, label: string) {
  if ((page.viewportSize()?.width || 0) < 761) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: label, exact: true }).click();
}

test('dashboard, community actions, conversations, and responsive navigation', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good to see you, Yonas.' })).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const challenge = page.locator('.challenge-card').first();
  const joinedBefore = await challenge.getByRole('button', { name: 'Joined', exact: true }).count();
  await challenge.locator('.card-action-row .button').click();
  await expect(challenge.getByRole('button', { name: joinedBefore ? 'Join challenge' : 'Joined', exact: !joinedBefore })).toBeVisible();
  await page.reload();
  await expect(page.locator('.challenge-card').first().getByRole('button', { name: joinedBefore ? 'Join challenge' : 'Joined', exact: !joinedBefore })).toBeVisible({ timeout: 30000 });
  await page.locator('.challenge-card').first().locator('.card-action-row .button').click();

  await navigate(page, 'Local businesses');
  await expect(page.getByRole('heading', { name: 'Keep it local.' })).toBeVisible();
  const wasSaved = await page.getByRole('button', { name: 'Unsave Bole Coffee House', exact: true }).count();
  if (!wasSaved) await page.getByRole('button', { name: 'Save Bole Coffee House', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave Bole Coffee House', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Saved', exact: true }).click();
  await page.getByRole('button', { name: 'View Bole Coffee House', exact: true }).click();
  await expect(page).toHaveURL(/\/businesses\/coffee$/);
  await expect(page.locator('.route-detail').getByRole('heading', { name: 'Bole Coffee House', level: 1 })).toBeVisible();
  const claim = page.getByRole('button', { name: 'Claim your offer', exact: true });
  if (await claim.count()) await claim.click();
  await expect(page.getByText('Show this code at checkout: HOOD-COFFEE15', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Show this code at checkout: HOOD-COFFEE15', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to directory', exact: true }).click();
  if (!wasSaved) await page.getByRole('button', { name: 'Unsave Bole Coffee House', exact: true }).click();

  await navigate(page, 'Events & activities');
  const firstEvent = page.locator('.event-card').first();
  const wasGoing = await firstEvent.getByRole('button', { name: 'Going', exact: true }).count();
  await firstEvent.locator('.card-action-row .button').click();
  await expect(firstEvent.getByRole('button', { name: wasGoing ? "I'm in" : 'Going', exact: true })).toBeVisible();
  await firstEvent.locator('.card-action-row .button').click();

  await navigate(page, 'Messages');
  const message = `A hello from our ${testInfo.project.name} neighbors ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Your message' }).fill(message);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByRole('heading', { name: 'Keep the conversation going.' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(message, { exact: true })).toBeVisible();

  for (const [label, title] of [['School hub', 'Your campus, connected.'], ['Hood community', 'Find your people.'], ['Rewards & recognition', 'Your impact adds up.'], ['Settings', 'Make yourself at home.']]) {
    await navigate(page, label);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  await navigate(page, 'Home');
  const post = `A neighborhood moment from ${testInfo.project.name} ${Date.now()}`;
  if ((page.viewportSize()?.width || 0) < 761) await page.locator('.bottom-nav').getByRole('button', { name: 'Create', exact: true }).click();
  else await page.locator('.page-heading').getByRole('button', { name: 'Create post', exact: true }).click();
  await page.getByRole('textbox', { name: 'Post content' }).fill(post);
  await page.getByRole('button', { name: 'Post to your hood' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText(post, { exact: true })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 761) await page.locator('.bottom-nav').getByRole('button', { name: 'You', exact: true }).click();
  else await page.locator('.topbar-profile').click();
  await expect(page.getByText(post, { exact: true })).toBeVisible();
  await navigate(page, 'School hub');
  await page.getByRole('button', { name: 'Meet your school community' }).click();
  await expect(page).toHaveURL(/\/hoods\/school$/);
  await expect(page.locator('.route-detail').getByRole('heading', { name: 'School Community', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Say hello' }).click();
  await expect(page).toHaveURL(/\/messages$/);
  await navigate(page, 'HoodLink Elite');
  await expect(page.getByRole('button', { name: 'Get Elite with Stars' })).toBeDisabled();
  await expect(page.getByText('Private place notes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.locator('.inbox-list article').first()).toBeVisible();
  await navigate(page, 'Settings');
  await page.getByRole('button', { name: 'Telegram connections Your groups, channels, and bot' }).click();
  await expect(page).toHaveURL(/\/telegram$/);
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});