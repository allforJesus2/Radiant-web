// Helpers for the confirm-first service worker update flow: prompting for
// updates, reading version info, and switching between the latest and the
// previous app version.
(function () {
  const RadiantSWUpdate = {};

  function getController() {
    if (!('serviceWorker' in navigator)) return null;
    return navigator.serviceWorker.controller;
  }

  // Post a message to the active service worker and resolve with its reply
  // on a MessageChannel port.
  function postToController(message) {
    return new Promise((resolve, reject) => {
      const controller = getController();
      if (!controller) {
        reject(new Error('No active service worker.'));
        return;
      }
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => {
        resolve(event.data);
      };
      channel.port1.onmessageerror = () => {
        reject(new Error('Service worker reply failed.'));
      };
      channel.port1.start();
      controller.postMessage(message, [channel.port2]);
    });
  }

  // Ask the user before downloading and installing a pending update.
  // On acceptance, mark this tab as confirmed so controllerchange reloads.
  RadiantSWUpdate.promptForUpdate = function (worker) {
    if (!worker) return false;
    if (
      !confirm(
        'A new version is available. Download and install it now? ' +
          'Your data stays right where it is.'
      )
    ) {
      return false;
    }
    window.__radiantUpdateConfirmed = true;
    worker.postMessage({ type: 'skipWaiting' });
    return true;
  };

  RadiantSWUpdate.getRegistration = function () {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.getRegistration) {
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.getRegistration().catch(function () {
      return null;
    });
  };

  RadiantSWUpdate.waitingWorker = async function () {
    const registration = await RadiantSWUpdate.getRegistration();
    return registration ? registration.waiting : null;
  };

  RadiantSWUpdate.getVersionInfo = function () {
    return postToController({ type: 'GET_VERSION_INFO' });
  };

  // Switch serving to the previous cache version and persist the choice.
  RadiantSWUpdate.revert = function () {
    return postToController({ type: 'REVERT' }).then((info) => {
      if (info) {
        RadiantStorage.settings.setActiveCacheName(info.activeCacheName);
      }
      return info;
    });
  };

  // Switch serving back to the latest cache version and clear the persisted
  // reverted state.
  RadiantSWUpdate.useLatest = function () {
    return postToController({ type: 'USE_LATEST' }).then((info) => {
      RadiantStorage.settings.setActiveCacheName('');
      return info;
    });
  };

  // Reload only when *this* tab confirmed an update. First installs and
  // cross-tab updates never force-reload the page.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (window.__radiantUpdateConfirmed) {
        window.__radiantUpdateConfirmed = false;
        window.location.reload();
      }
    });
  }

  window.RadiantSWUpdate = RadiantSWUpdate;
})();