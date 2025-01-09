//change this to have new updates propagated to all devices
const CACHE_NAME = 'my-cache-v1';

const FILES_TO_CACHE = [
  '/set_activity_level.html',
  '/set_macros.html',
  '/set_time.html',
  '/sleep.html',
  '/calculate_bmr.html',
  '/debug.html',
  '/index.html',
  '/nutrition.html',
  '/profile.html',
  '/dark-theme.css',
  '/workout.html',
  '/set_workout_day.html',
  '/workout_routine.html',
  '/edit_workout_routine.html'
];

// Install event - cache all initial resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching app shell and content');
        return cache.addAll(FILES_TO_CACHE);
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - Cache first, then network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // First try to return from cache
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache, try network
        return fetch(event.request)
          .then((networkResponse) => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone the response
            const responseToCache = networkResponse.clone();

            // Add to cache for next time
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          });
      })
  );
});

// Listen for online/offline events
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});