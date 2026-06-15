/**
 * Shared onboarding helpers — load/save/validation across setup pages.
 */
const Onboarding = {
    steps: [
        { id: 'profile', href: 'profile.html', label: 'Profile' },
        { id: 'bmr', href: 'calculate-bmr.html', label: 'BMR' },
        { id: 'activity', href: 'set-activity-level.html', label: 'Activity' },
        { id: 'macros', href: 'set-macros.html', label: 'Macros' },
        { id: 'time', href: 'set-time.html', label: 'Day start' },
    ],

    getProfile() {
        return RadiantStorage.profile.get() || {};
    },

    saveProfile(partial) {
        return RadiantStorage.profile.merge(partial);
    },

    isComplete() {
        return RadiantStorage.profile.isComplete();
    },

    redirectIfIncomplete(returnTo) {
        if (!RadiantStorage.profile.get()) {
            window.location.href = 'profile.html';
            return true;
        }
        if (returnTo && !this.isComplete()) {
            window.location.href = returnTo;
            return true;
        }
        return false;
    },

    redirectIfComplete(target) {
        if (this.isComplete()) {
            window.location.href = target || 'nutrition.html';
            return true;
        }
        return false;
    },

    /** Parse numeric field; returns null if empty/invalid. */
    parseNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    },

    requireFields(fields) {
        for (const id of fields) {
            const el = document.getElementById(id);
            if (!el || !String(el.value || '').trim()) {
                return false;
            }
        }
        return true;
    },
};
