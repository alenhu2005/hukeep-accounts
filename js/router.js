import { appState } from './state.js';
import { renderHome } from './views-home.js';
import { renderTrips } from './views-trips.js';
import { renderAnalysis } from './views-analysis.js';
import { renderTripDetail } from './views-trip-detail.js';
import { setRender } from './render-registry.js';

function dispatchRender() {
  if (appState.currentPage === 'home') renderHome();
  else if (appState.currentPage === 'trips') renderTrips();
  else if (appState.currentPage === 'analysis') renderAnalysis();
  else renderTripDetail();
}

setRender(dispatchRender);
