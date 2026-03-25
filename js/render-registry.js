/** Set once from main to avoid circular imports (navigation ↔ views ↔ router). */
let renderImpl = () => {};

export function setRender(fn) {
  renderImpl = fn;
}

export function render() {
  try {
    renderImpl();
  } catch (e) {
    console.error('[render] Uncaught error in view:', e);
    const app = document.getElementById('app');
    if (app) {
      const existing = document.getElementById('render-error-banner');
      if (!existing) {
        const banner = document.createElement('div');
        banner.id = 'render-error-banner';
        banner.style.cssText =
          'position:fixed;top:0;left:0;right:0;z-index:9999;padding:10px 16px;background:#fef2f2;color:#991b1b;font-size:13px;text-align:center;border-bottom:1px solid #fecaca';
        banner.textContent = '畫面渲染發生錯誤，請重新整理頁面';
        app.prepend(banner);
      }
    }
  }
}
