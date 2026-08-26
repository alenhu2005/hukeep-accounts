import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const NOTE_PHOTO_FIXTURE = fileURLToPath(new URL('../../icons/icon-512.png', import.meta.url));

test('loads built app, navigates tabs, and registers service worker', async ({ page }, testInfo) => {
  const consoleErrors = [];
  const requestFailures = [];
  const badResponses = [];
  const seedRows = [
    ...Array.from({ length: 6 }, (_, index) => ({
      type: 'daily',
      action: 'add',
      id: `daily-seed-${index + 1}`,
      item: `日常測試 ${index + 1}`,
      amount: 100 + index,
      paidBy: '胡',
      splitMode: '均分',
      category: '生活',
      date: '2026-08-25',
    })),
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
        serverRows = [
          ...serverRows.filter(row => !(row.type === 'note' && row.id === payload.id)),
          { ...payload, action: 'add' },
        ];
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
  const homeFormHeader = page.locator('#home-form-header-toggle');
  await expect(homeFormHeader.locator('.card-kicker')).toHaveCount(0);
  await expect(homeFormHeader).toHaveAttribute('aria-expanded', 'true');
  await homeFormHeader.click({ position: { x: 80, y: 24 } });
  await expect(page.locator('#home-form')).not.toHaveClass(/is-open/);
  await expect(homeFormHeader).toHaveAttribute('aria-expanded', 'false');
  await homeFormHeader.press('Enter');
  await expect(page.locator('#home-form')).toHaveClass(/is-open/);
  await expect(homeFormHeader).toHaveAttribute('aria-expanded', 'true');
  const homeSearchLayout = await page.evaluate(() => {
    const card = document.querySelector('#page-home .home-history-card');
    const search = card?.querySelector('.record-search');
    if (!card || !search) return { topGap: -1, height: -1 };
    return {
      topGap: search.getBoundingClientRect().top - card.getBoundingClientRect().top,
      height: search.getBoundingClientRect().height,
    };
  });
  expect(homeSearchLayout.topGap).toBeGreaterThanOrEqual(10);
  expect(homeSearchLayout.height).toBeLessThanOrEqual(44);
  const compactHomeHistory = await page.evaluate(() => {
    const card = document.querySelector('#page-home .home-history-card');
    const item = card?.querySelector('.record-item');
    const more = card?.querySelector('.show-more-btn');
    if (!card || !item || !more) return { itemPaddingTop: -1, itemPaddingBottom: -1, bottomGap: -1 };
    const itemStyle = getComputedStyle(item);
    return {
      itemPaddingTop: Number.parseFloat(itemStyle.paddingTop),
      itemPaddingBottom: Number.parseFloat(itemStyle.paddingBottom),
      bottomGap: card.getBoundingClientRect().bottom - more.getBoundingClientRect().bottom,
    };
  });
  expect(compactHomeHistory.itemPaddingTop).toBeLessThanOrEqual(10);
  expect(compactHomeHistory.itemPaddingBottom).toBeLessThanOrEqual(10);
  expect(compactHomeHistory.bottomGap).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 360, height: 800 });
  const compactHomeForm = await page.evaluate(() => {
    const body = document.querySelector('#home-form .card-body');
    const group = document.querySelector('#home-form .form-group');
    const input = document.querySelector('#home-form .form-input');
    const toggle = document.querySelector('#home-form .btn-toggle');
    if (!body || !group || !input || !toggle) {
      return { bodyPaddingTop: -1, groupMarginBottom: -1, inputHeight: -1, toggleHeight: -1 };
    }
    return {
      bodyPaddingTop: Number.parseFloat(getComputedStyle(body).paddingTop),
      groupMarginBottom: Number.parseFloat(getComputedStyle(group).marginBottom),
      inputHeight: input.getBoundingClientRect().height,
      toggleHeight: toggle.getBoundingClientRect().height,
    };
  });
  expect(compactHomeForm.bodyPaddingTop).toBeLessThanOrEqual(12);
  expect(compactHomeForm.groupMarginBottom).toBeLessThanOrEqual(12);
  expect(compactHomeForm.inputHeight).toBeLessThanOrEqual(42);
  expect(compactHomeForm.toggleHeight).toBeLessThanOrEqual(40);
  const calendarHeaderAlignment = await page.evaluate(() => {
    const title = document.querySelector('#home-history-header .section-title');
    const button = document.getElementById('home-calendar-open-btn');
    if (!title || !button) return { titleHeight: -1, buttonHeight: -1, centerDelta: -1 };
    const titleRect = title.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      titleHeight: titleRect.height,
      buttonHeight: buttonRect.height,
      centerDelta: Math.abs(titleRect.top + titleRect.height / 2 - (buttonRect.top + buttonRect.height / 2)),
    };
  });
  expect(Math.abs(calendarHeaderAlignment.titleHeight - calendarHeaderAlignment.buttonHeight)).toBeLessThanOrEqual(1);
  expect(calendarHeaderAlignment.centerDelta).toBeLessThanOrEqual(1);
  const homeRecordEdgeAlignment = await page.evaluate(() => {
    const list = document.getElementById('home-records');
    const item = list?.querySelector('.record-item');
    if (!list || !item) return { leftDelta: -1, rightDelta: -1 };
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      leftDelta: Math.abs(itemRect.left - listRect.left),
      rightDelta: Math.abs(itemRect.right - listRect.right),
    };
  });
  expect(homeRecordEdgeAlignment.leftDelta).toBeLessThanOrEqual(1);
  expect(homeRecordEdgeAlignment.rightDelta).toBeLessThanOrEqual(1);
  const mobileHomeWidth = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(mobileHomeWidth.document).toBeLessThanOrEqual(mobileHomeWidth.viewport + 1);
  await page.screenshot({ path: testInfo.outputPath('home-history-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator('#nav-notes').click();
  await expect(page.locator('#nav-notes')).toHaveClass(/active/);
  await expect(page.locator('#page-notes')).toHaveClass(/active/);
  await page.locator('#new-note-btn').click();
  await page.locator('#note-title-input').fill('東京行前清單');
  await page.locator('#note-body-input').fill(
    '**護照**\n*充電器*\n\n- 轉接頭\n- 交通卡\n\n雨傘\n常備藥\n第七行完整內容\nhttps://example.com/guide',
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
  await expect(restoredNote.locator('.note-card-body strong')).toHaveText('護照');
  await expect(restoredNote.locator('.note-card-body em')).toHaveText('充電器');
  await expect(restoredNote.locator('.note-card-body li')).toHaveCount(2);
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

  const collapsedBodyStyle = await restoredNote.locator('.note-card-body').evaluate(element => ({
    color: getComputedStyle(element).color,
    fontSize: getComputedStyle(element).fontSize,
    lineHeight: getComputedStyle(element).lineHeight,
  }));
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
  const expandedBodyStyle = await restoredNote.locator('.note-card-body').evaluate(element => ({
    color: getComputedStyle(element).color,
    fontSize: getComputedStyle(element).fontSize,
    lineHeight: getComputedStyle(element).lineHeight,
  }));
  expect(expandedBodyStyle).toEqual(collapsedBodyStyle);
  const expansionContentTransforms = await restoredNote.locator('.note-card-content').evaluate(element =>
    element
      .getAnimations()
      .flatMap(animation => animation.effect?.getKeyframes?.() || [])
      .map(frame => frame.transform)
      .filter(Boolean),
  );
  expect(expansionContentTransforms).toEqual([]);
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
  const noteEditorBodyFits = await page.locator('#note-body-input').evaluate(
    element => element.scrollHeight <= element.clientHeight + 1,
  );
  expect(noteEditorBodyFits).toBe(true);
  const editorUsesOriginalNoteCard = await page.evaluate(() => {
    const card = document.querySelector('.note-card[data-note-id]');
    const editor = document.getElementById('note-editor-card');
    return {
      insideOriginalCard: Boolean(card && editor && card.contains(editor)),
      originalCardEditing: Boolean(card?.classList.contains('is-editing')),
      editorIsNotNestedCard: Boolean(editor && !editor.classList.contains('card')),
    };
  });
  expect(editorUsesOriginalNoteCard).toEqual({
    insideOriginalCard: true,
    originalCardEditing: true,
    editorIsNotNestedCard: true,
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '關閉編輯器' }).click();
  await expect(restoredNote).not.toHaveClass(/is-editing/);

  await page.locator('#new-note-btn').click();
  await page.locator('#note-title-input').fill('固定展開記事');
  await page.locator('#note-body-input').fill('這篇記事固定顯示完整內容。');
  const noteOptionsLayout = await page.evaluate(() => {
    const pinned = document.getElementById('note-pinned-input')?.closest('label');
    const forced = document.getElementById('note-force-expanded-input')?.closest('label');
    if (!pinned || !forced) return { sameRow: false, forcedOnRight: false };
    const pinnedRect = pinned.getBoundingClientRect();
    const forcedRect = forced.getBoundingClientRect();
    return {
      sameRow: Math.abs(pinnedRect.top - forcedRect.top) <= 2,
      forcedOnRight: forcedRect.left > pinnedRect.right,
    };
  });
  expect(noteOptionsLayout).toEqual({ sameRow: true, forcedOnRight: true });
  await page.locator('#note-force-expanded-input').check();
  await page.locator('#save-note-btn').click();
  const forcedNote = page.locator('.note-card', { hasText: '固定展開記事' });
  await expect(forcedNote).toHaveClass(/is-force-expanded/);
  await expect(forcedNote).toHaveClass(/is-expanded/);
  await expect(forcedNote).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() =>
    serverRows.some(row => row.type === 'note' && row.title === '固定展開記事' && row.forceExpanded === true),
  ).toBe(true);
  await forcedNote.click({ position: { x: 24, y: 24 } });
  await expect(forcedNote).toHaveClass(/is-expanded/);
  await expect(forcedNote).not.toHaveAttribute('tabindex');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#nav-notes').click();
  const restoredForcedNote = page.locator('#notes-list .note-card', { hasText: '固定展開記事' }).first();
  await expect(restoredForcedNote).toHaveClass(/is-force-expanded/);
  await expect(restoredForcedNote).toHaveClass(/is-expanded/);
  await restoredForcedNote.click({ position: { x: 24, y: 24 } });
  await expect(restoredForcedNote).toHaveClass(/is-expanded/);
  await restoredForcedNote.getByRole('button', { name: '編輯記事' }).click();
  await expect(restoredForcedNote).toHaveClass(/is-editing/);
  await expect(restoredForcedNote.locator('#note-editor-card')).toBeVisible();
  const forcedNoteEditDisplay = await restoredForcedNote.evaluate(card => ({
    topline: getComputedStyle(card.querySelector('.note-card-topline')).display,
    content: getComputedStyle(card.querySelector('.note-card-content')).display,
    editor: getComputedStyle(card.querySelector('#note-editor-card')).display,
  }));
  expect(forcedNoteEditDisplay).toEqual({ topline: 'none', content: 'none', editor: 'block' });
  await page.getByRole('button', { name: '關閉編輯器' }).click();
  await expect(restoredForcedNote).not.toHaveClass(/is-editing/);
  await expect(restoredForcedNote).toHaveClass(/is-expanded/);

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
  const mobileNotesSearchHeight = await page.locator('.notes-search').evaluate(
    element => element.getBoundingClientRect().height,
  );
  expect(mobileNotesSearchHeight).toBeLessThanOrEqual(44);
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
  const mobileNoteOptionsFit = await page.evaluate(() => {
    const editor = document.getElementById('note-editor-card');
    const options = document.querySelector('.note-editor-options');
    const pinned = document.getElementById('note-pinned-input')?.closest('label');
    const forced = document.getElementById('note-force-expanded-input')?.closest('label');
    if (!editor || !options || !pinned || !forced) return false;
    const editorRect = editor.getBoundingClientRect();
    const optionsRect = options.getBoundingClientRect();
    const pinnedRect = pinned.getBoundingClientRect();
    const forcedRect = forced.getBoundingClientRect();
    return (
      optionsRect.left >= editorRect.left - 1 &&
      optionsRect.right <= editorRect.right + 1 &&
      Math.abs(pinnedRect.top - forcedRect.top) <= 2 &&
      forcedRect.right <= editorRect.right + 1
    );
  });
  expect(mobileNoteOptionsFit).toBe(true);
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
