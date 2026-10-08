(function (global) {
    'use strict';
    var current = null;

    function init(options) {
        options = options || {};
        var root = options.root || document;
        var hashSync = !!options.hashSync;          // write hash on click, read on init
        var onSwitch = options.onSwitch || function () {};
        var tabs   = Array.prototype.slice.call(root.querySelectorAll('.folder-tab'));
        var panels = Array.prototype.slice.call(root.querySelectorAll('.folder-tab-panel'));

        function switchTo(name, silent) {
            tabs.forEach(function (tab) {
                var on = tab.dataset.tab === name;
                tab.classList.toggle('active', on);
                if (tab.hasAttribute('aria-selected')) tab.setAttribute('aria-selected', String(on));
                if (on) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
            });
            panels.forEach(function (panel) {
                var on = panel.dataset.panel === name || panel.id === name + 'Tab';
                panel.classList.toggle('active', on);
                if ('hidden' in panel) panel.hidden = !on;
            });
            if (!silent) onSwitch(name);
            if (hashSync && !silent) { try { history.replaceState(null, '', '#' + name); } catch (e) {} }
        }

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () { switchTo(tab.dataset.tab); });
        });

        current = { switchTo: switchTo };

        var hashName = global.location.hash && global.location.hash.slice(1);
        if (hashSync && hashName && tabs.some(function (t) { return t.dataset.tab === hashName; })) {
            switchTo(hashName, true);   // silent: apply state without firing onSwitch
        }
        return current;
    }

    function switchTo(name) {
        if (current) current.switchTo(name);
        else if (global.console) global.console.warn('RadiantTabs: no tab bar initialized');
    }

    global.RadiantTabs = { init: init, switchTo: switchTo };
})(window);