import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const NOTE_PHOTO_FIXTURE = fileURLToPath(new URL('../../icons/icon-512.png', import.meta.url));

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
      if (payload.type === 'note' && payload.photoDataUrl !== undefined) {
        payload.photoUrl = payload.photoDataUrl;
        payload.photoFileId = payload.photoDataUrl ? 'note-photo-test' : '';
        delete payload.photoDataUrl;
      }
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
        body: JSON.stringify({
          result: 'success',
          ...(payload.type === 'note' && Object.prototype.hasOwnProperty.call(payload, 'photoUrl')
            ? { media: { photoUrl: payload.photoUrl, photoFileId: payload.photoFileId } }
            : {}),
        }),
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
  await page.locator('#note-body-input').fill(
    '護照\n充電器\n轉接頭\n交通卡\n雨傘\n常備藥\n第七行完整內容\nhttps://example.com/guide',
  );
  await page.locator('#note-photo-input').setInputFiles(NOTE_PHOTO_FIXTURE);
  await expect(page.locator('#note-photo-preview')).toBeVisible();
  await page.locator('#save-note-btn').click();
  await expect(page.locator('.note-card', { hasText: '東京行前清單' })).toBeVisible();
  await expect.poll(() => serverRows.some(row => row.type === 'note' && row.title === '東京行前清單')).toBe(true);

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#nav-notes').click();
  const restoredNote = page.locator('.note-card', { hasText: '東京行前清單' });
  await expect(restoredNote).toHaveCount(1);
  await expect(restoredNote).toContainText('充電器');
  await expect(restoredNote.locator('.note-card-photo')).toBeVisible();
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

  await restoredNote.click({ position: { x: 24, y: 24 } });
  await expect(restoredNote).toHaveClass(/is-expanded/);
  await expect(restoredNote).toHaveAttribute('aria-expanded', 'true');
  const expandAnimationCount = await restoredNote.evaluate(
    element => element.getAnimations().filter(animation => animation.playState === 'running').length,
  );
  expect(expandAnimationCount).toBeGreaterThan(0);
  const expandAnimationDurations = await restoredNote.evaluate(element =>
    element.getAnimations({ subtree: true }).map(animation => Number(animation.effect?.getTiming().duration) || 0),
  );
  expect(Math.max(...expandAnimationDurations)).toBeGreaterThanOrEqual(440);
  await expect(restoredNote.locator('.note-card-body')).toContainText('第七行完整內容');
  await expect(restoredNote.locator('.note-card-photo')).toBeVisible();
  const expandedBodyFits = await restoredNote.locator('.note-card-body').evaluate(element =>
    element.scrollHeight <= element.clientHeight + 1,
  );
  expect(expandedBodyFits).toBe(true);
  await restoredNote.click({ position: { x: 24, y: 24 } });
  await expect(restoredNote).not.toHaveClass(/is-expanded/);
  await expect(restoredNote).toHaveAttribute('aria-expanded', 'false');

  await restoredNote.click({ position: { x: 24, y: 24 } });
  await expect(restoredNote).toHaveClass(/is-expanded/);
  await page.waitForTimeout(320);
  await page.evaluate(() => window.scrollTo(0, 100));
  const scrollBeforeEdit = await page.evaluate(() => window.scrollY);
  expect(scrollBeforeEdit).toBeGreaterThan(0);
  await restoredNote.getByRole('button', { name: '編輯記事' }).click();
  await expect(page.locator('#note-editor-card')).toBeVisible();
  const editorFollowsEditedNote = await page.evaluate(() => {
    const card = document.querySelector('.note-card[data-note-id]');
    return card?.nextElementSibling?.id === 'note-editor-card';
  });
  expect(editorFollowsEditedNote).toBe(true);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '關閉編輯器' }).click();

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
  serverRows = [
    ...serverRows,
    {
      type: 'note',
      action: 'add',
      id: 'remote-note-seed-1',
      title: '其他裝置新增的記事',
      body: '這則記事應該在點擊通知後自動展開。',
      pinned: false,
      createdAt: Date.now() + 1000,
      updatedAt: Date.now() + 1000,
    },
  ];
  await page.reload({ waitUntil: 'networkidle' });
  const noteUpdateBanner = page.locator('#note-update-banner');
  await expect(noteUpdateBanner).toBeVisible();
  await expect(page.locator('#note-update-title')).toHaveText('其他裝置新增的記事');
  const noticeAnimationCount = await noteUpdateBanner.evaluate(element =>
    element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
  );
  expect(noticeAnimationCount).toBeGreaterThan(0);
  const noticeFitsViewport = await noteUpdateBanner.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1;
  });
  expect(noticeFitsViewport).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('new-note-banner-mobile.png'), fullPage: false });
  await page.locator('#note-update-view').click();
  const syncedNote = page.locator('.note-card[data-note-id="remote-note-seed-1"]');
  await expect(page.locator('#page-notes')).toHaveClass(/active/);
  await expect(syncedNote).toBeVisible();
  await expect(syncedNote).toHaveClass(/is-expanded/);
  await expect(syncedNote).toHaveAttribute('aria-expanded', 'true');

  await page.locator('#nav-notes').click();
  await expect(page.locator('#page-notes')).toHaveClass(/active/);
  await expect(page.locator('.note-card', { hasText: '東京行前清單' })).toHaveCount(1);
  const mobileNote = page.locator('.note-card', { hasText: '東京行前清單' });
  const controlsWithTapHighlight = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(
        element =>
          getComputedStyle(element).webkitTapHighlightColor !== 'rgba(0, 0, 0, 0)',
      )
      .map(element => element.id || element.getAttribute('aria-label') || element.className)
      .slice(0, 10),
  );
  expect(controlsWithTapHighlight).toEqual([]);
  await mobileNote.click({ position: { x: 24, y: 24 } });
  await expect(mobileNote).toHaveClass(/is-expanded/);
  await page.waitForTimeout(650);
  await page.screenshot({ path: testInfo.outputPath('note-expanded-mobile.png'), fullPage: true });
  await mobileNote.click({ position: { x: 24, y: 24 } });
  await expect(mobileNote).not.toHaveClass(/is-expanded/);
  await mobileNote.getByRole('button', { name: '編輯記事' }).click();
  await expect(page.locator('#note-editor-card')).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: testInfo.outputPath('note-editor-inline-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '關閉編輯器' }).click();
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
  await expect(page.locator('.note-card').first()).toHaveCSS('background-color', 'rgb(30, 35, 41)');
  await page.screenshot({ path: testInfo.outputPath('notes-mobile-dark.png'), fullPage: true });
  await page.locator('.note-card', { hasText: '東京行前清單' }).click({ position: { x: 24, y: 24 } });
  await expect(page.locator('.note-card', { hasText: '東京行前清單' })).toHaveClass(/is-expanded/);
  await page.waitForTimeout(650);
  await page.screenshot({ path: testInfo.outputPath('note-expanded-mobile-dark.png'), fullPage: true });
  await page.locator('.note-card', { hasText: '東京行前清單' }).click({ position: { x: 24, y: 24 } });

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
