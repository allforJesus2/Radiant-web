// Name of the cache
const CACHE_NAME = 'my-cache';

// List of files to cache
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
 '/dark-theme.css'
];

// Install event
self.addEventListener('install', function(event) {
 event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('Opened cache');
      return cache.addAll(FILES_TO_CACHE);
    })
 );
});

// Activate event
self.addEventListener('activate', function(event) {
 event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          // Return true if you want to remove this cache,
          // but remember that caches are shared across
          // the whole origin
          return cacheName !== CACHE_NAME;
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
 );
});

// Fetch event
self.addEventListener('fetch', function(event) {
 // Check if the user is online
 if (navigator.onLine) {
    // If online, fetch from the network and update the cache
    event.respondWith(
      fetch(event.request).then(function(response) {
        // Check if we received a valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        // Clone the response to cache it
        var responseToCache = response.clone();

        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
    );
 } else {
    // If offline, try to serve from the cache
    event.respondWith(
      caches.match(event.request).then(function(response) {
        // Return the cached response if available, otherwise return an offline page
        return response || caches.match('/offline.html');
      })
    );
 }
});

