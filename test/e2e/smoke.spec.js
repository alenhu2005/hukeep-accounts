import { expect, test } from '@playwright/test';

test('loads built app, navigates tabs, and registers service worker', async ({ page }, testInfo) => {
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

  let serverRows = seedRows.map(row => ({ ...row }));
  await page.route(/https:\/\/script\.google(?:usercontent)?\.com\/.*/, async route => {
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}');
      if (payload.type === 'note' && payload.action === 'add') {
        serverRows = [...serverRows, { ...payload, action: 'add' }];
      } else if (payload.type === 'note' && payload.action === 'edit') {
        serverRows = serverRows.map(row =>
          row.type === 'note' && row.id === payload.id ? { ...row, ...payload, action: 'add' } : row,
        );
      } else if (payload.type === 'note' && payload.action === 'delete') {
        serverRows = serverRows.filter(row => !(row.type === 'note' && row.id === payload.id));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'success' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serverRows),
    });
  });

  await page.goto('./', { waitUntil: 'networkidle' });

  await expect(page).toHaveTitle('記帳本');
  await expect(page.locator('#bottom-nav')).toBeVisible();
  await expect(page.locator('#nav-home')).toContainText('日常');
  await expect(page.locator('#nav-notes')).toContainText('記事');

  await page.locator('#nav-notes').click();
  await expect(page.locator('#nav-notes')).toHaveClass(/active/);
  await expect(page.locator('#page-notes')).toHaveClass(/active/);
  await page.locator('#new-note-btn').click();
  await page.locator('#note-title-input').fill('東京行前清單');
  await page.locator('#note-body-input').fill('護照\n充電器\nhttps://example.com/guide');
  await page.locator('#save-note-btn').click();
  await expect(page.locator('.note-card', { hasText: '東京行前清單' })).toBeVisible();
  await expect.poll(() => serverRows.some(row => row.type === 'note' && row.title === '東京行前清單')).toBe(true);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#nav-notes').click();
  const restoredNote = page.locator('.note-card', { hasText: '東京行前清單' });
  await expect(restoredNote).toHaveCount(1);
  await expect(restoredNote).toContainText('充電器');
  await expect(restoredNote.locator('.note-link')).toHaveAttribute('href', 'https://example.com/guide');
  await expect(restoredNote.locator('.note-link')).toHaveAttribute('target', '_blank');
  await page.context().route('https://example.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>External note link</title>' }),
  );
  const popupPromise = page.waitForEvent('popup');
  await restoredNote.locator('.note-link').click();
  const linkedPage = await popupPromise;
  await linkedPage.waitForURL('https://example.com/guide');
  expect(linkedPage.url()).toBe('https://example.com/guide');
  await linkedPage.close();

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

  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('#nav-notes').click();
  await expect(page.locator('#page-notes')).toHaveClass(/active/);
  await expect(page.locator('.note-card', { hasText: '東京行前清單' })).toHaveCount(1);
  await page.locator('#new-note-btn').click();
  await expect(page.locator('#note-editor-card')).toBeVisible();

  const mobileLayout = await page.evaluate(() => {
    const selectors = [
      '#page-notes .header',
      '#note-editor-card',
      '.notes-toolbar',
      '.note-card',
      '#bottom-nav',
    ];
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      navItems: document.querySelectorAll('#bottom-nav .nav-btn').length,
      outsideViewport: selectors.filter(selector => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return !rect || rect.left < -1 || rect.right > window.innerWidth + 1;
      }),
    };
  });

  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  expect(mobileLayout.navItems).toBe(4);
  expect(mobileLayout.outsideViewport).toEqual([]);
  await page.getByRole('button', { name: '關閉編輯器' }).click();
  await expect(page.locator('#note-editor-card')).toBeHidden();
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('notes-mobile.png'), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(page.locator('.note-card')).toHaveCSS('background-color', 'rgb(30, 35, 41)');
  await page.screenshot({ path: testInfo.outputPath('notes-mobile-dark.png'), fullPage: true });

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
