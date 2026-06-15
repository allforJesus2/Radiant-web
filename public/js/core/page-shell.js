/**
 * Shared page chrome: theme link, header + menu, blur overlay wiring.
 * Call initPageShell() on DOMContentLoaded after #dateHeader and #blurOverlay exist.
 */
(function () {
    const THEME_HREF = 'css/theme/dark-theme.css';

    function ensureThemeLink(basePath) {
        const href = basePath + THEME_HREF;
        const existing = document.querySelector('link[rel="stylesheet"][href$="' + THEME_HREF + '"]');
        if (existing) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.insertBefore(link, document.head.firstChild);
    }

    function wireBlurOverlay() {
        const overlay = document.getElementById('blurOverlay');
        const menuPopup = document.getElementById('mainMenuPopup');
        if (!overlay || !menuPopup) return;

        const observer = new MutationObserver(function () {
            overlay.style.display = menuPopup.style.display === 'block' ? 'block' : 'none';
        });
        observer.observe(menuPopup, { attributes: true, attributeFilter: ['style'] });
    }

    /**
     * @param {object} [options]
     * @param {string|null} [options.title] — header center text
     * @param {'app'|'onboarding'|'workout'|'none'} [options.nav='app']
     * @param {string} [options.basePath=''] — prefix for theme/menu assets (e.g. '../')
     * @param {boolean} [options.showCenter=true]
     */
    window.initPageShell = function initPageShell(options) {
        const opts = options || {};
        const basePath = opts.basePath != null ? opts.basePath : '';
        const nav = opts.nav != null ? opts.nav : 'app';

        ensureThemeLink(basePath);

        if (nav === 'app' && typeof setupHeader === 'function') {
            setupHeader(opts.title != null ? opts.title : null, {
                basePath: basePath,
                showCenter: opts.showCenter !== false,
            });
            wireBlurOverlay();
        }
    };
})();
