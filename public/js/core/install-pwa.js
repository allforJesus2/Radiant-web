// "Add to Home Screen" / install helper for Radiant.
//
// No public browser API can programmatically trigger Android's "Install app"
// or iOS's "Add to Home Screen", so this module turns the header button into a
// platform-aware guide: tapping it opens a short help modal with the exact
// steps for the visitor's device. When the app is already running standalone
// (installed), the button becomes a non-interactive "✓ Installed" label.
//
// Self-initializing, like offline-preference.js: the script is loaded at the
// end of <body>, so the button and modal already exist when it runs.
const RadiantInstall = (function () {
  let mounted = false;

  function isInstalled() {
    if (window.navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
    return false;
  }

  function detectPlatform() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    if (isIOS) return 'ios';

    const isAndroid = /Android/.test(ua);
    const isChromium = /Chrome|Chromium|CriOS/.test(ua);
    if (isAndroid) return 'android';

    const isMobile = /Mobi|Tablet/.test(ua) || isAndroid;
    if (isChromium && !isMobile) return 'desktop';

    return 'other';
  }

  function helpCopy(platform) {
    switch (platform) {
      case 'android':
        return 'Open the \u22ee menu \u2192 Install app (or Add to Home screen) \u2192 Install. ' +
          'This installs Radiant as a real app; your data stays on this device.';
      case 'ios':
        return 'Tap Share \u2192 Add to Home Screen. Radiant then opens full-screen from your home screen.';
      case 'desktop':
        return 'Click the install icon in the address bar \u2192 Install.';
      default:
        return "Use your browser's 'Add to Home Screen' / 'Install app' menu option.";
    }
  }

  function showModal() {
    const modal = document.getElementById('installHelpModal');
    const body = document.getElementById('installHelpBody');
    if (!modal) return;
    if (body) body.textContent = helpCopy(detectPlatform());
    modal.style.display = 'flex';
  }

  function hideModal() {
    const modal = document.getElementById('installHelpModal');
    if (modal) modal.style.display = 'none';
  }

  function markInstalled(btn) {
    if (!btn) return;
    btn.textContent = '\u2713 Installed';
    btn.classList.add('installed');
    btn.setAttribute('aria-disabled', 'true');
    btn.title = 'Radiant is installed';
  }

  function mount() {
    if (mounted) return;
    mounted = true;

    const btn = document.getElementById('installAppBtn');
    if (!btn) return;

    if (isInstalled()) {
      markInstalled(btn);
      return;
    }

    btn.addEventListener('click', showModal);

    const closeBtn = document.getElementById('installHelpClose');
    if (closeBtn) closeBtn.addEventListener('click', hideModal);

    const modal = document.getElementById('installHelpModal');
    if (modal) {
      modal.addEventListener('click', (event) => {
        if (event.target === modal) hideModal();
      });
    }

    window.addEventListener('appinstalled', () => markInstalled(btn));

    if (window.matchMedia) {
      const mq = window.matchMedia('(display-mode: standalone)');
      const onChange = () => {
        if (mq.matches) markInstalled(btn);
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  return { isInstalled, detectPlatform, mount };
})();

RadiantInstall.mount();
