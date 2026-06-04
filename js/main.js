import './router.js';
import './globals.js';
import { initApp } from './bootstrap.js';
import { initPwaUpdateFlow } from './pwa-update.js';

initPwaUpdateFlow();
initApp();
