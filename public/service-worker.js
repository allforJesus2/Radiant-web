// Bump this version before deploying whenever you've changed any cached file
// (CSS, JS, HTML). This forces the deployed SW to reinstall and recache
// everything fresh for users. After deploying, users get the new files on
// their next page load.
// Note: on localhost the SW is a no-op (IS_DEV below), so you never need to
// bump this during local development. The default deployed strategy is
// offline/cache-first; network-first is only used when the user enables
// "always check for updates" in settings. Updates are always confirmed by
// the user before any new files are downloaded and take over.
const CACHE_VERSION = 'vbc02716';
const CACHE_NAME = `my-cache-${CACHE_VERSION}`;

// On localhost the SW acts as a transparent pass-through — no caching, no
// interception — so every file change is visible instantly without bumping
// CACHE_VERSION. On the deployed site (any other hostname) full caching and
// offline support work as normal.
const IS_DEV = self.location.hostname === 'localhost';

// Paths relative to the service worker scope (no leading slash).
// Using scope-relative paths ensures correctness whether the site is hosted
// at the root (localhost) or a subdirectory (e.g. GitHub Pages /Radiant-web/).
const FILES_TO_CACHE = [
  'index.html',
  'nutrition.html',
  'create-recipe.html',
  'charts.html',
  'settings.html',
  'profile.html',
  'notes.html',
  'meal-plan.html',
  'create-meal-plan.html',
  'sleep.html',
  'calculate-bmr.html',
  'set-activity-level.html',
  'set-macros.html',
  'set-time.html',
  'set-meal-times.html',
  'debug.html',
  'css/theme/dark-theme.css',
  'css/shell/navigation.css',
  'css/nutrition/nutrition.css',
  'css/nutrition/meal-plan.css',
  'css/nutrition/create-recipe.css',
  'css/onboarding/profile.css',
  'css/notes/notes.css',
  'css/charts/charts.css',
  'css/workout/workout-shell.css',
  'css/workout/workout.css',
  'css/workout/strength-workout.css',
  'css/workout/gzcl.css',
  'css/workout/edit-workout-routine.css',
  'fonts/caveat-latin.woff2',
  'js/core/storage.js',
  'js/core/page-shell.js',
  'js/core/menu.js',
  'js/core/offline-preference.js',
  'js/core/sw-update.js',
  'js/core/onboarding.js',
  'js/onboarding/navigation.js',
  'js/onboarding/profile.js',
  'js/food/database-utils.js',
  'js/food/fdc-db.js',
  'js/food/fdc-search.js',
  'js/food/recipe-store.js',
  'js/food/food-emoji.js',
  'js/food/food-macros.js',
  'js/food/food-log-migrate.js',
  'js/food/food-autocomplete.js',
  'js/food/fdc-import.js',
  'js/food/usda-id-to-key.js',
  'js/food/barcode-scanner.js',
  'js/nutrition/nutrition.js',
  'js/nutrition/meal-plan.js',
  'js/nutrition/meal-plan-week.js',
  'js/nutrition/create-meal-plan.js',
  'js/nutrition/create-recipe.js',
  'js/notes/notes.js',
  'js/charts/charts.js',
  'js/settings/settings.js',
  'js/vendor/chart.min.js',
  'js/vendor/three.module.min.js',
  'vendor/zxing/index.min.js',
  'js/workout/workout-utils.js',
  'js/workout/strength-workout.js',
  'js/workout/gzcl.js',
  'js/workout/custom-workout-nav.js',
  'js/workout/workout-item-render.js',
  'js/workout/rest-timer.js',
  'js/workout/edit-workout-routine.js',
  'js/workout/workout-routine.js',
  'workout/custom-workout/workout.html',
  'workout/custom-workout/workout-routine.html',
  'workout/custom-workout/edit-workout-routine.html',
  'workout/custom-workout/set-workout-day.html',
  'workout/workout.html',
  'workout/workout-routine.html',
  'workout/edit-workout-routine.html',
  'workout/set-workout-day.html',
  'workout/strength.html',
  'workout/gzcl.html',
];

// In-memory offline preference flag. Defaults to true (offline-first).
// Reset when the SW restarts, but pages push the current value via
// SET_OFFLINE_PREFERENCE on every load (see offline-preference.js).
let preferOffline = true;

// The cache the SW currently serves from. Defaults to CACHE_NAME; it is
// pointed at the previous version's cache when the user reverts.
let activeCacheName = CACHE_NAME;

// The single most recent previous-version cache kept alive for reverting,
// or null when there is nothing to revert to.
let previousCacheName = null;

// Pre-cache every app-shell file into CACHE_NAME using scope-relative URLs
// so the paths work whether the app is hosted at / or a subdirectory.
function precacheAll() {
  return caches.open(CACHE_NAME).then((cache) => {
    const scope = self.registration.scope;
    const urls = FILES_TO_CACHE.map((f) => scope + f);
    console.log('[SW] Caching', urls.length, 'files at scope:', scope);
    // addAll fetches & caches all URLs; if any fetch fails the whole
    // install fails (no silent swallowing) so we know when it breaks.
    return cache.addAll(urls);
  });
}

// Install: on first-ever install, pre-cache everything and take control.
// On an update, install only — do NOT pre-cache and do NOT skipWaiting.
// The new worker waits until the user confirms in the page, which posts
// skipWaiting; only then are the new files downloaded and taken over.
// On localhost (IS_DEV) skip pre-caching entirely — just activate immediately.
self.addEventListener('install', (event) => {
  if (IS_DEV) {
    console.log('[SW] Dev mode — skipping cache install');
    self.skipWaiting();
    return;
  }
  if (!self.registration.active) {
    event.waitUntil(
      precacheAll().then(() => {
        console.log('[SW] Install complete, skipping waiting');
        return self.skipWaiting();
      })
      // No .catch() here — let install fail loudly if caching fails so it
      // is visible in DevTools instead of silently serving an empty cache.
    );
  }
});

// Activate: remove stale caches and claim all open tabs immediately. Keep
// CACHE_NAME plus the single most recent other cache (for reverting) and
// delete everything older.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        const others = cacheNames.filter((name) => name !== CACHE_NAME);
        // caches.keys() returns names in creation order, so the last other
        // cache is the most recent previous version.
        previousCacheName = others.length > 0 ? others[others.length - 1] : null;
        const toDelete = others.filter((name) => name !== previousCacheName);
        return Promise.all(
          toDelete.map((name) => {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          })
        );
      }),
    ])
  );
});

// Reply to GET_VERSION_INFO / REVERT / USE_LATEST on the caller's port.
function replyVersionInfo(port) {
  port.postMessage({
    version: CACHE_VERSION,
    previousCacheName: previousCacheName,
    activeCacheName: activeCacheName,
    hasPrevious: !!previousCacheName,
  });
}

// Messages from pages.
self.addEventListener('message', (event) => {
  if (!event.data) return;

  // Update in-memory preference when the page pushes a new value.
  if (event.data.type === 'SET_OFFLINE_PREFERENCE') {
    preferOffline = !!event.data.preferOffline;
    console.log('[SW] preferOffline set to', preferOffline);
    return;
  }

  // Restore the persisted reverted cache (SET_ACTIVE_CACHE re-pushed on every
  // page load). Validate the name still exists; otherwise fall back to latest.
  if (event.data.type === 'SET_ACTIVE_CACHE') {
    const name = event.data.cacheName;
    if (name && typeof name === 'string') {
      caches.keys().then((keys) => {
        activeCacheName = keys.indexOf(name) !== -1 ? name : CACHE_NAME;
        console.log('[SW] activeCacheName set to', activeCacheName);
      });
    } else {
      activeCacheName = CACHE_NAME;
    }
    return;
  }

  // Support both string and object forms of skipWaiting. On a confirmed
  // update the new CACHE_NAME has no entries yet — download them now, then
  // take over.
  if (event.data === 'skipWaiting' || event.data.type === 'skipWaiting') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) =>
        cache.keys().then((keys) => {
          if (keys.length > 0) return null;
          return precacheAll();
        })
      ).then(() => {
        self.skipWaiting();
      })
    );
    return;
  }

  const port = event.ports && event.ports[0];
  if (!port) return;

  if (event.data.type === 'GET_VERSION_INFO') {
    replyVersionInfo(port);
    return;
  }

  if (event.data.type === 'REVERT') {
    if (previousCacheName) {
      activeCacheName = previousCacheName;
      console.log('[SW] Reverted to cache:', activeCacheName);
    }
    replyVersionInfo(port);
    return;
  }

  if (event.data.type === 'USE_LATEST') {
    activeCacheName = CACHE_NAME;
    console.log('[SW] Using latest cache:', activeCacheName);
    replyVersionInfo(port);
    return;
  }
});

// Fetch: three strategies controlled by the in-memory state.
//   reverted (activeCacheName !== CACHE_NAME) → cache-first from the previous
//     version's cache; network responses are never written into it.
//   preferOffline=true  → cache-first  (fast, works fully offline)
//   preferOffline=false → network-first with cache fallback (used when the
//     user enables "always check for updates")
// On localhost (IS_DEV) all requests pass straight through to the network.
self.addEventListener('fetch', (event) => {
  // Only handle GET requests.
  if (event.request.method !== 'GET') return;

  // Dev mode: bypass the SW entirely so file changes are instant.
  if (IS_DEV) return;

  const url = new URL(event.request.url);

  if (url.pathname.includes('/assets/processed/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Reverted: serve the previous version, cache-first, in every mode.
  if (activeCacheName !== CACHE_NAME) {
    event.respondWith(
      caches.open(activeCacheName)
        .then((cache) => cache.match(event.request))
        .then((cached) => cached || fetch(event.request))
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (preferOffline) {
    // ── Cache-first ─────────────────────────────────────────────────────
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          // Not in cache yet — fetch and store it.
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        })
      ).catch(() => caches.match(event.request))
    );
  } else {
    // ── Network-first with cache fallback ────────────────────────────────
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) =>
              cache.put(event.request, clone)
            );
          }
          return response;
        })
        .catch(() => {
          // Network unavailable — serve from cache.
          return caches.match(event.request);
        })
    );
  }
});
