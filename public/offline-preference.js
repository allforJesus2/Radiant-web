// Shared script for handling offline preference communication with service worker

// Handle messages from service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GET_OFFLINE_PREFERENCE') {
      // Get the offline preference from localStorage
      const preferOffline = localStorage.getItem('preferOfflineData') === 'true';
      
      // Send response back to service worker
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'OFFLINE_PREFERENCE_RESPONSE',
          preferOffline: preferOffline
        });
      }
    }
  });
}
