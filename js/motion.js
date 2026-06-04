import { animate, stagger } from './vendor/anime.esm.min.js';
import autoAnimate from './vendor/auto-animate.mjs';

const TAP_SELECTOR = [
  'button:not([disabled])',
  '.trip-card',
  '.record-item',
  '.analysis-cal-cell',
  '.analysis-year-mo',
  '.analysis-pie-label-chip',
  '.trip-color-dot',
].join(',');

const AVATAR_SELECTOR = [
  '.member-dir-avatar',
  '.member-chip-avatar-btn',
  '.record-avatar-clickable',
  '.member-avatar-preview-ring',
  '.trip-lottery-avatar',
].join(',');

const AUTO_ANIMATE_ROOTS = [
  '#home-records',
  '#trips-list',
  '#settlement-body',
  '#detail-member-chips',
  '#new-trip-member-chips',
  '#detail-known-members .known-member-bar',
  '#known-member-picker .known-member-bar',
  '#detail-expenses',
  '#member-dir-body',
  '#d-payers-list',
  '#d-split-chips',
  '#d-split-custom-list',
  '#trip-stats-modal-body',
  '#trip-closure-report-modal-body',
  '.analysis-history-list',
  '.analysis-legend-card',
  '.member-chips',
].join(',');

const PAGE_TARGETS = [
  'header.header',
  '.main > .card',
  '.main > .glass-card',
  '.main > .sync-health-card',
  '.analysis-period-nav',
  '.analysis-tabs',
  '.analysis-stat-card',
  '.analysis-legend-card',
  '.monthly-report-card',
  '#balance-card',
  '#settlement-card',
  '#trips-list',
].join(',');

const REVEAL_CHILD_TARGETS = [
  '.badge',
  '.category-badge',
  '.member-chip-avatar',
  '.known-member-bar-dot',
  '.trip-icon',
  '.record-avatar',
].join(',');

const autoAnimated = new WeakSet();
let interactionsReady = false;
let pageMotionRun = 0;

function prefersReducedMotion() {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function isMotionEnabled() {
  return (
    typeof document !== 'undefined' &&
    typeof window !== 'undefined' &&
    !prefersReducedMotion() &&
    !document.documentElement.classList.contains('anim-paused')
  );
}

function toArray(targets) {
  if (!targets) return [];
  if (Array.isArray(targets)) return targets.filter(Boolean);
  if (targets instanceof Element) return [targets];
  return Array.from(targets).filter(Boolean);
}

function isVisible(el) {
  if (!(el instanceof Element)) return false;
  if (!el.isConnected || el.hidden || el.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function visibleTargets(root, selector, limit = 28) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  return Array.from(root.querySelectorAll(selector)).filter(isVisible).slice(0, limit);
}

function runAnimation(targets, params) {
  if (!isMotionEnabled()) return null;
  const list = toArray(targets).filter(isVisible);
  if (!list.length) return null;
  try {
    return animate(list, params);
  } catch {
    return null;
  }
}

function addAnimateCss(el, className, duration = 520) {
  if (!isMotionEnabled() || !el) return;
  el.classList.remove('animate__animated', className);
  el.style.setProperty('--animate-duration', `${duration}ms`);
  void el.offsetWidth;
  el.classList.add('animate__animated', className);
  const done = () => {
    el.classList.remove('animate__animated', className);
    el.style.removeProperty('--animate-duration');
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done, { once: true });
  window.setTimeout(done, duration + 120);
}

function bindAutoAnimate(root = document) {
  if (!isMotionEnabled() || !root?.querySelectorAll) return;
  for (const el of root.querySelectorAll(AUTO_ANIMATE_ROOTS)) {
    if (!(el instanceof HTMLElement) || autoAnimated.has(el)) continue;
    try {
      autoAnimate(el, {
        duration: 270,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
      autoAnimated.add(el);
    } catch {
      /* AutoAnimate is an enhancement only. */
    }
  }
}

function animateAvatarFrames(root = document, { force = false } = {}) {
  if (!isMotionEnabled()) return;
  const avatars = visibleTargets(
    root,
    [
      '.member-dir-avatar',
      '.record-avatar--rare',
      '.member-chip-avatar--rare',
      '.member-avatar-preview-ring',
      '.trip-lottery-avatar--rare',
    ].join(','),
    36,
  ).filter(el => {
    if (force) return true;
    if (el.dataset.motionAvatarReady === '1') return false;
    el.dataset.motionAvatarReady = '1';
    return true;
  });
  if (!avatars.length) return;
  runAnimation(avatars, {
    opacity: [0, 1],
    scale: [0.82, 1],
    rotate: ['-5deg', '0deg'],
    duration: 660,
    delay: stagger(32),
    ease: 'out(4)',
  });
}

export function refreshMotion(root = document) {
  if (!isMotionEnabled()) return;
  document.documentElement.classList.add('motion-js');
  bindAutoAnimate(root);
  animateAvatarFrames(root);
}

export function initMotionSystem() {
  if (typeof document === 'undefined' || interactionsReady) return;
  document.documentElement.classList.add('motion-js');
  if (!isMotionEnabled()) {
    document.documentElement.classList.add('motion-reduced');
    return;
  }
  interactionsReady = true;
  bindAutoAnimate(document);

  document.addEventListener(
    'pointerdown',
    event => {
      const target = event.target?.closest?.(TAP_SELECTOR);
      if (!target || target.closest('[aria-hidden="true"]')) return;
      runAnimation(target, {
        scale: 0.965,
        duration: 105,
        ease: 'out(2)',
      });
    },
    { passive: true },
  );

  const release = event => {
    const target = event.target?.closest?.(TAP_SELECTOR);
    if (!target) return;
    runAnimation(target, {
      scale: 1,
      duration: 230,
      ease: 'out(4)',
    });
    const avatar = event.target?.closest?.(AVATAR_SELECTOR);
    if (avatar) animateAvatarTap(avatar);
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
}

export function animatePageEnter(pageEl, opts = {}) {
  if (!isMotionEnabled() || !pageEl) return;
  const run = ++pageMotionRun;
  window.requestAnimationFrame(() => {
    if (run !== pageMotionRun) return;
    refreshMotion(pageEl);

    if (opts.page === 'analysis') {
      const analysisBlocks = visibleTargets(
        pageEl,
        [
          'header.header',
          '.analysis-tabs',
          '.analysis-period-nav',
          '.analysis-period',
          '.analysis-stats-grid',
          '.monthly-report-card',
          '.analysis-pie-label-toggles',
          '.analysis-pie-wrap',
          '.analysis-legend-card',
        ].join(','),
        12,
      );
      runAnimation(analysisBlocks, {
        opacity: [0, 1],
        translateY: [6, 0],
        duration: 360,
        delay: stagger(22),
        ease: 'out(3)',
      });
      return;
    }

    const pageTone =
      opts.page === 'trips'
        ? ['-18px', '0px']
        : ['14px', '0px'];
    const blocks = visibleTargets(pageEl, PAGE_TARGETS, 16);
    runAnimation(blocks, {
      opacity: [0, 1],
      translateY: pageTone,
      filter: ['blur(7px)', 'blur(0px)'],
      duration: 620,
      delay: stagger(48),
      ease: 'out(4)',
    });

    const icons = visibleTargets(
      pageEl,
      '.header-icon, .balance-icon, .trip-icon, .analysis-stat-icon, .empty-icon',
      10,
    );
    runAnimation(icons, {
      scale: [0.78, 1],
      rotate: ['-8deg', '0deg'],
      duration: 720,
      delay: stagger(52, { start: 80 }),
      ease: 'out(5)',
    });
  });
}

export function revealOnScroll(root, selector, { enabled = true } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return () => {};
  if (root._scrollRevealCleanup) {
    root._scrollRevealCleanup();
    root._scrollRevealCleanup = null;
  }
  root.removeAttribute('data-scroll-reveal');
  const items = Array.from(root.querySelectorAll(selector));
  if (!items.length) return () => {};

  const markVisible = () => {
    items.forEach(el => {
      el.classList.remove('scroll-reveal-pending');
      el.classList.add('scroll-reveal-visible');
    });
  };

  if (!enabled || !isMotionEnabled() || typeof IntersectionObserver === 'undefined') {
    markVisible();
    return () => {};
  }

  items.forEach((el, index) => {
    el.classList.add('scroll-reveal-pending');
    el.classList.remove('scroll-reveal-visible');
    el.dataset.motionRevealIndex = String(index);
  });
  root.setAttribute('data-scroll-reveal', 'active');
  refreshMotion(root);

  let batch = [];
  let batchFrame = 0;
  const flushBatch = () => {
    batchFrame = 0;
    const targets = batch.filter(isVisible);
    batch = [];
    if (!targets.length) return;
    targets.forEach(t => {
      t.classList.remove('scroll-reveal-pending');
      t.classList.add('scroll-reveal-visible');
    });
    runAnimation(targets, {
      opacity: [0, 1],
      translateY: [14, 0],
      scale: [0.985, 1],
      duration: 500,
      delay: stagger(30),
      ease: 'out(4)',
    });
    const children = targets.flatMap(t => visibleTargets(t, REVEAL_CHILD_TARGETS, 4));
    runAnimation(children, {
      opacity: [0, 1],
      scale: [0.82, 1],
      duration: 430,
      delay: stagger(18, { start: 90 }),
      ease: 'out(5)',
    });
  };

  const io = new IntersectionObserver(
    entries => {
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        batch.push(ent.target);
        io.unobserve(ent.target);
      }
      if (batch.length && !batchFrame) batchFrame = window.requestAnimationFrame(flushBatch);
    },
    { root: null, rootMargin: '64px 0px 88px 0px', threshold: 0.01 },
  );
  items.forEach(el => io.observe(el));

  const cleanup = () => {
    io.disconnect();
    if (batchFrame) window.cancelAnimationFrame(batchFrame);
    root.removeAttribute('data-scroll-reveal');
    root._scrollRevealCleanup = null;
  };
  root._scrollRevealCleanup = cleanup;
  return cleanup;
}

export function animateOverlayIn(overlay, panelSelector = '.dialog', itemSelector = '') {
  if (!overlay || !isMotionEnabled()) return;
  window.requestAnimationFrame(() => {
    refreshMotion(overlay);
    const panel = overlay.querySelector(panelSelector) || overlay.querySelector('[role="dialog"]');
    if (panel) {
      runAnimation(panel, {
        opacity: [0, 1],
        translateY: [32, 0],
        scale: [0.955, 1],
        filter: ['blur(8px)', 'blur(0px)'],
        duration: 560,
        ease: 'out(4)',
      });
    }
    const items = itemSelector ? visibleTargets(overlay, itemSelector, 18) : [];
    runAnimation(items, {
      opacity: [0, 1],
      translateY: [16, 0],
      scale: [0.98, 1],
      duration: 520,
      delay: stagger(38, { start: 90 }),
      ease: 'out(4)',
    });
    animateAvatarFrames(overlay, { force: true });
  });
}

export function animateToastItem(el) {
  addAnimateCss(el, 'animate__fadeInUp', 360);
}

export function animateUpdateBadge(el) {
  if (!el) return;
  addAnimateCss(el, 'animate__bounceIn', 560);
  runAnimation(el, {
    translateY: [10, 0],
    scale: [0.92, 1],
    duration: 520,
    ease: 'out(5)',
  });
}

export function animateThemeToggle(el) {
  if (!el) return;
  const icon = el.querySelector('svg') || el;
  runAnimation(icon, {
    rotate: ['-90deg', '0deg'],
    scale: [0.72, 1.08, 1],
    opacity: [0.45, 1],
    duration: 620,
    ease: 'out(5)',
  });
  addAnimateCss(el, 'animate__pulse', 420);
}

export function animateCountBadge(el) {
  if (!el) return;
  runAnimation(el, {
    scale: [0.82, 1.12, 1],
    translateY: [-2, 0],
    duration: 520,
    ease: 'out(5)',
  });
}

export function animateBalanceIcon(el) {
  if (!el) return;
  runAnimation(el, {
    scale: [0.86, 1.12, 1],
    rotate: ['-7deg', '0deg'],
    duration: 620,
    ease: 'out(5)',
  });
}

export function animateAvatarTap(el) {
  if (!el) return;
  runAnimation(el, {
    scale: [0.92, 1.08, 1],
    rotate: ['-4deg', '3deg', '0deg'],
    filter: ['brightness(1.08)', 'brightness(1)'],
    duration: 520,
    ease: 'out(5)',
  });
}

export function animateSoftSwap(root, selector = '') {
  if (!root || !isMotionEnabled()) return;
  const targets = selector ? visibleTargets(root, selector, 18) : [root].filter(isVisible);
  runAnimation(targets, {
    opacity: [0.2, 1],
    translateY: [8, 0],
    duration: 380,
    delay: stagger(22),
    ease: 'out(3)',
  });
}
