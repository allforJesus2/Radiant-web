const CACHE_NAME = 'my-cache-v2.3';
const FILES_TO_CACHE = [
  '/set_activity_level.html',
  '/set_macros.html',
  '/set_time.html',
  '/sleep.html',
  '/calculate_bmr.html',
  '/debug.html',
  '/index.html',
  '/nutrition.html',
  '/charts.html',
  '/settings.html',
  '/profile.html',
  '/dark-theme.css',
  '/workout.html',
  '/set_workout_day.html',
  '/workout_routine.html',
  '/edit_workout_routine.html',
  '/workout/531.html',
];

// Install event - cache all initial resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching app shell and content');
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => {
        // Force activation by skipping waiting
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of all clients
      self.clients.claim(),
      
      // Remove old caches
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
    ])
  );
});

// Fetch event - Network first for HTML, Cache first for other resources
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Network-first strategy for HTML files
  if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Clone the response before using it
          const responseToCache = networkResponse.clone();
          
          // Update cache with new version
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return networkResponse;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // Cache-first strategy for other resources
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
            return networkResponse;
          });
      })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});