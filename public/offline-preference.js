// Push the current offline preference to the service worker whenever a page
// loads so the in-memory flag in the SW is always up to date after restart.
(function syncOfflinePreference() {
  if (!('serviceWorker' in navigator)) return;

  function sendPreference(controller) {
    const preferOffline = RadiantStorage.settings.getPreferOffline();
    controller.postMessage({
      type: 'SET_OFFLINE_PREFERENCE',
      preferOffline: preferOffline,
    });
  }

  // If the SW is already controlling this page, push immediately.
  if (navigator.serviceWorker.controller) {
    sendPreference(navigator.serviceWorker.controller);
  }

  // Also push when a new SW takes control (after an update).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (navigator.serviceWorker.controller) {
      sendPreference(navigator.serviceWorker.controller);
    }
  });
})();
