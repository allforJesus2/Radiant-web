/**
 * Shared meal-plan storage helpers and formatting.
 */
const MealPlanning = {
    CUSTOM_PLAN_NAME: 'Custom',
    CATEGORIES: ['breakfast', 'lunch', 'dinner', 'snack'],
    CATEGORY_EMOJIS: {
        breakfast: '🌅',
        lunch: '☀️',
        dinner: '🌙',
        snack: '🍎',
    },

    load() {
        return RadiantStorage.nutrition.getMealPlanning();
    },

    save(mealPlanning) {
        RadiantStorage.nutrition.saveMealPlanning(mealPlanning);
    },

    ensureDefaults(mealPlanning) {
        if (!mealPlanning.mealPlans) mealPlanning.mealPlans = {};
        if (!mealPlanning.completedMeals) mealPlanning.completedMeals = {};
        if (!mealPlanning.removedMeals) mealPlanning.removedMeals = {};
        if (!mealPlanning.mealPlanDays) mealPlanning.mealPlanDays = {};
        if (!mealPlanning.lastReset) mealPlanning.lastReset = null;
        return mealPlanning;
    },

    ensureCustomPlanExists(mealPlanning) {
        this.ensureDefaults(mealPlanning);
        if (!mealPlanning.mealPlans[this.CUSTOM_PLAN_NAME]) {
            mealPlanning.mealPlans[this.CUSTOM_PLAN_NAME] = this.emptyPlan();
        }
        return mealPlanning;
    },

    emptyPlan() {
        return { breakfast: [], lunch: [], dinner: [], snack: [] };
    },

    isReservedPlanName(name) {
        return String(name).trim().toLowerCase() === this.CUSTOM_PLAN_NAME.toLowerCase();
    },

    customPlanHasItems(plan) {
        if (!plan) return false;
        return this.CATEGORIES.some(function (k) {
            return plan[k] && plan[k].length > 0;
        });
    },

    formatTotals(calories, protein, carbs, fat) {
        return (
            Math.round(calories) + ' cal, ' +
            Math.round(protein) + 'g protein, ' +
            Math.round(carbs) + 'g carbs, ' +
            Math.round(fat) + 'g fat'
        );
    },

    formatTotalsSpan(calories, protein, carbs, fat) {
        return '<span style="font-size: 0.8em; color: #888;">Total: ' +
            this.formatTotals(calories, protein, carbs, fat) + '</span>';
    },

    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const weekStart = new Date(d.setDate(diff));
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    },

    shouldResetWeekly(userTime, lastResetDateString, currentDate) {
        if (!lastResetDateString) return false;

        const parts = userTime.split(':').map(Number);
        const userTimeInMinutes = parts[0] * 60 + parts[1];
        const currentTimeInMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
        const currentWeekStart = this.getWeekStart(currentDate);

        let lastResetDate;
        try {
            lastResetDate = new Date(lastResetDateString);
        } catch (_) {
            return true;
        }

        const lastResetWeekStart = this.getWeekStart(lastResetDate);
        if (currentWeekStart.getTime() <= lastResetWeekStart.getTime()) return false;

        if (currentDate.getDay() === 0) {
            return currentTimeInMinutes >= userTimeInMinutes;
        }
        return true;
    },
};
