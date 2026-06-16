/**
 * In-app update / release notices. Register entries below; call mount() on a page.
 *
 * Each entry: { id, when(): boolean, message: html string, pages?: string[] }
 * Dismissals persist via RadiantStorage.announcements.
 */
var RadiantAnnouncements = (function () {
  var REGISTRY = [
    {
      id: 'sr-legacy-portions-v1',
      pages: ['index'],
      when: function () {
        if (typeof RadiantStorage === 'undefined') return false;
        if (
          RadiantStorage.getRaw(RadiantStorage.KEYS.SR_LEGACY_PORTION_VERSION) ===
          String(RadiantStorage.SR_LEGACY_PORTION_VERSION)
        ) {
          return false;
        }
        return (
          RadiantStorage.getRaw(RadiantStorage.KEYS.SR_LEGACY_IMPORT_COMPLETE) === 'true'
        );
      },
      message:
        'Food serving sizes were updated. ' +
        '<a href="settings.html">Settings → Re-import SR Legacy</a> ' +
        'for improved default portions.',
    },
  ];

  function getActive(page) {
    return REGISTRY.filter(function (entry) {
      if (RadiantStorage.announcements.isDismissed(entry.id)) return false;
      if (entry.pages && page && entry.pages.indexOf(page) === -1) return false;
      try {
        return entry.when();
      } catch (e) {
        return false;
      }
    });
  }

  function mount(containerId, page) {
    var root = document.getElementById(containerId);
    if (!root || typeof RadiantStorage === 'undefined') return;

    root.innerHTML = '';
    getActive(page).forEach(function (entry) {
      var banner = document.createElement('div');
      banner.className = 'app-announcement';
      banner.setAttribute('role', 'status');
      banner.dataset.announcementId = entry.id;

      var dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'app-announcement-dismiss';
      dismiss.setAttribute('aria-label', 'Dismiss');
      dismiss.textContent = '×';

      var body = document.createElement('span');
      body.innerHTML = entry.message;

      dismiss.addEventListener('click', function () {
        RadiantStorage.announcements.dismiss(entry.id);
        banner.remove();
      });

      banner.appendChild(dismiss);
      banner.appendChild(body);
      root.appendChild(banner);
    });
  }

  return {
    getActive: getActive,
    mount: mount,
  };
})();
