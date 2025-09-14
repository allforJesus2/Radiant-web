const CACHE_NAME = 'my-cache-v3.1';
const FILES_TO_CACHE = [
  '/set_activity_level.html',
  '/set_macros.html',
  '/set_time.html',
  '/sleep.html',
  '/calculate_bmr.html',
  '/debug.html',
  '/index.html',
  '/nutrition.html',
  '/create-recipe.html',
  '/charts.html',
  '/settings.html',
  '/profile.html',
  '/dark-theme.css',
  '/navigation.css',
  '/navigation.js',
  '/database-utils.js',
  '/offline-preference.js',
  '/workout.html',
  '/set_workout_day.html',
  '/workout_routine.html',
  '/edit_workout_routine.html',
  '/workout/531.html',
  '/notes.html',
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

// Function to check if offline mode is preferred
async function shouldPreferOffline() {
  try {
    // Get the setting from localStorage by sending a message to the client
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      // Send a message to get the setting
      clients[0].postMessage({ type: 'GET_OFFLINE_PREFERENCE' });
      
      // Wait for response (with timeout)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 100);
        
        const messageHandler = (event) => {
          if (event.data && event.data.type === 'OFFLINE_PREFERENCE_RESPONSE') {
            clearTimeout(timeout);
            self.removeEventListener('message', messageHandler);
            resolve(event.data.preferOffline);
          }
        };
        
        self.addEventListener('message', messageHandler);
      });
    }
  } catch (error) {
    console.log('Could not check offline preference:', error);
  }
  return false;
}

// Fetch event - Respect offline preference setting
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Handle HTML files based on offline preference
  if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      shouldPreferOffline().then((preferOffline) => {
        if (preferOffline) {
          // Cache-first strategy when offline mode is preferred
          return caches.match(event.request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If no cache, try network
              return fetch(event.request)
                .then((networkResponse) => {
                  const responseToCache = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
                  return networkResponse;
                });
            });
        } else {
          // Network-first strategy when online mode is preferred
          return fetch(event.request)
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
            });
        }
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
  
  // Handle offline preference requests
  if (event.data && event.data.type === 'GET_OFFLINE_PREFERENCE') {
    // This will be handled by the client-side code
  }
});