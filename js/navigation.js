import { appState } from './state.js';
import { render } from './render-registry.js';

export function navigate(page, tripId = null) {
  appState.currentPage = page;
  appState.currentTripId = tripId;
  if (page === 'tripDetail' && appState.detailMultiPay) {
    appState.detailMultiPay = false;
    const tog = document.getElementById('d-multipay-toggle');
    if (tog) tog.textContent = '多人出款';
    const pg = document.getElementById('d-paidby-group');
    const ag = document.getElementById('d-amount-group');
    const mg = document.getElementById('d-multipay-group');
    if (pg) pg.style.display = '';
    if (ag) ag.style.display = '';
    if (mg) mg.style.display = 'none';
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageId =
    page === 'tripDetail' ? 'page-trip-detail' : page === 'trips' ? 'page-trips' : page === 'analysis' ? 'page-analysis' : 'page-home';
  document.getElementById(pageId).classList.add('active');
  const navId = page === 'trips' ? 'nav-trips' : page === 'analysis' ? 'nav-analysis' : 'nav-home';
  document.getElementById(navId).classList.add('active');
  window.scrollTo(0, 0);
  render();
}
