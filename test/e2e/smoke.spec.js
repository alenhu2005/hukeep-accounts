import { expect, test } from '@playwright/test';

test('loads built app, navigates tabs, and registers service worker', async ({ page }) => {
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];
  const seedRows = [
    {
      type: 'trip',
      action: 'add',
      id: 'trip-seed-1',
      name: '東京',
      members: '["小明","小華"]',
      createdAt: '2026-06-01',
    },
    {
      type: 'tripExpense',
      action: 'add',
      id: 'trip-expense-seed-1',
      tripId: 'trip-seed-1',
      item: '拉麵',
      amount: 100,
      paidBy: '小明',
      splitAmong: '["小明","小華"]',
      date: '2026-06-01',
    },
  ];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('requestfailed', request => {
    requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', response => {
    if (response.url().includes('/hukeep-accounts/') && response.status() >= 400) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.route(/https:\/\/script\.google(?:usercontent)?\.com\/.*/, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(seedRows),
    }),
  );

  await page.goto('./', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle('記帳本');
  await expect(page.locator('#bottom-nav')).toBeVisible();
  await expect(page.locator('#nav-home')).toContainText('日常');

  await page.locator('#nav-trips').click();
  await expect(page.locator('#nav-trips')).toHaveClass(/active/);
  await expect(page.locator('.trip-card-wrap[data-trip-id="trip-seed-1"]')).toBeVisible();
  await page.evaluate(() => window.navigate('tripDetail', 'trip-seed-1'));
  await expect(page.locator('#detail-name')).toHaveText('東京');
  await expect(page.locator('#d-paidby-toggles .btn-toggle.active')).toHaveText('小明');
  await page.locator('#d-paidby-toggles .btn-toggle', { hasText: '小華' }).click();
  await expect(page.locator('#d-paidby-toggles .btn-toggle.active')).toHaveText('小華');

  await page.locator('#nav-analysis').click();
  await expect(page.locator('#nav-analysis')).toHaveClass(/active/);

  const serviceWorkerScope = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return '';
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.scope) return registration.scope;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return '';
  });

  expect(serviceWorkerScope).toContain('/hukeep-accounts/');
  expect(badResponses).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
