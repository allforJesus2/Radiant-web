// Bump this version before deploying whenever you've changed any cached file
// (CSS, JS, HTML). This forces the deployed SW to reinstall and recache
// everything fresh for users. After deploying, users get the new files on
// their next page load.
// Note: on localhost the SW is a no-op (IS_DEV below), so you never need to
// bump this during local development. The default deployed strategy is
// network-first; cache-first only kicks in when the user enables "offline
// only" in settings.
const CACHE_VERSION = 'v4.3';
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
  'calculate_bmr.html',
  'set_activity_level.html',
  'set_macros.html',
  'set_time.html',
  'set_meal_times.html',
  'debug.html',
  'dark-theme.css',
  'nutrition.css',
  'nutrition.js',
  'navigation.css',
  'navigation.js',
  'database-utils.js',
  'fdc-import.js',
  'usda-id-to-key.js',
  'barcode-scanner.js',
  'offline-preference.js',
  'menu.js',
  'workout/workout.html',
  'workout/workout_routine.html',
  'workout/edit_workout_routine.html',
  'workout/set_workout_day.html',
  'workout/531.html',
  'workout/gzcl.html',
  'workout/workout.css',
  'workout/workout-utils.js',
  'chart.min.js',
];

// In-memory offline preference flag.
// Reset to false when the SW restarts, but pages push the current value via
// SET_OFFLINE_PREFERENCE on every load (see offline-preference.js).
let preferOffline = false;

// Install: cache all app-shell files using scope-relative URLs so the paths
// work regardless of whether the app is hosted at / or a subdirectory.
// On localhost (IS_DEV) skip pre-caching entirely — just activate immediately.
self.addEventListener('install', (event) => {
  if (IS_DEV) {
    console.log('[SW] Dev mode — skipping cache install');
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const scope = self.registration.scope;
      const urls = FILES_TO_CACHE.map((f) => scope + f);
      console.log('[SW] Caching', urls.length, 'files at scope:', scope);
      // addAll fetches & caches all URLs; if any fetch fails the whole
      // install fails (no silent swallowing) so we know when it breaks.
      return cache.addAll(urls);
    }).then(() => {
      console.log('[SW] Install complete, skipping waiting');
      return self.skipWaiting();
    })
    // No .catch() here — let install fail loudly if caching fails so it
    // is visible in DevTools instead of silently serving an empty cache.
  );
});

// Activate: remove stale caches and claim all open tabs immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Removing old cache:', name);
              return caches.delete(name);
            })
        )
      ),
    ])
  );
});

// Messages from pages.
self.addEventListener('message', (event) => {
  if (!event.data) return;

  // Update in-memory preference when the page pushes a new value.
  if (event.data.type === 'SET_OFFLINE_PREFERENCE') {
    preferOffline = !!event.data.preferOffline;
    console.log('[SW] preferOffline set to', preferOffline);
    return;
  }

  // Support both string and object forms of skipWaiting.
  if (event.data === 'skipWaiting' || event.data.type === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Fetch: two strategies controlled by the in-memory preferOffline flag.
//   preferOffline=true  → cache-first  (fast, works fully offline)
//   preferOffline=false → network-first with cache fallback (default; always
//                         serves fresh content when online, cached when not)
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
