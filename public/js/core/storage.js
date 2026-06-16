/**
 * All app reads/writes of localStorage must go through RadiantStorage.
 */
const RadiantStorage = {
    KEYS: {
        PROFILE: 'profileStatistics',
        WEIGHT_AND_BODY_FAT: 'weightAndBodyFatData',
        MACROS: 'macros',
        USER_TIME: 'userTime',
        ACTIVITY_LEVELS: 'activityLevels',
        HAS_SEEN_WELCOME: 'hasSeenWelcome',
        FOOD_LOG: 'foodLog',
        FOOD_LOG_MIGRATION_VERSION: 'foodLogMigrationVersion',
        TODAY: 'today',
        MEAL_TIMES: 'mealTimes',
        DYNAMIC_MEAL_CONFIG: 'dynamicMealConfig',
        MEAL_PLANNING: 'meal_planning',
        PREFERRED_UNIT: 'preferredUnit',
        PREFER_OFFLINE: 'preferOfflineData',
        USDA_API_KEY: 'usdaFdcApiKey',
        BARCODE_SOURCE: 'barcodeLookupSource',
        DAILY_NOTES: 'dailyNotes',
        SLEEP: 'sleep',
        WORKOUT_SETTINGS: 'workoutSettings',
        WORKOUT_ROUTINES: 'workoutRoutines',
        WORKOUT_SCHEDULE: 'workoutSchedule',
        EXERCISE_LIBRARY: 'exerciseLibrary',
        CYCLE_HISTORY: 'cycleHistory',
        LAST_COMPLETED_CYCLE_DAY: 'lastCompletedCycleDay',
        LAST_COMPLETED_DATE: 'lastCompletedDate',
        STORED_DAY: 'storedDay',
        CHECKBOX_STATES: 'checkboxStates',
        PROFILE_531: '531-workout-profile',
        RECENT_FOOD_SELECTIONS: 'recentFoodSelections',
        CUSTOM_RECIPES_BACKUP: 'customRecipesBackup',
        SR_LEGACY_PORTION_VERSION: 'srLegacyPortionVersion',
        SR_LEGACY_IMPORT_COMPLETE: 'srLegacyImportComplete',
        ANNOUNCEMENTS_DISMISSED: 'announcementsDismissed',
    },

    /** Bump when default SR Legacy portions change in a deploy. */
    SR_LEGACY_PORTION_VERSION: 1,

    DEFAULT_MEAL_TIMES: {
        breakfast: { start: '06:00', end: '10:00' },
        lunch: { start: '11:00', end: '14:00' },
        dinner: { start: '17:00', end: '21:00' },
        snack: { start: '14:00', end: '17:00' },
    },

    DEFAULT_MEAL_PLANNING: {
        mealPlans: {},
        completedMeals: {},
        removedMeals: {},
        mealPlanDays: {},
        lastReset: null,
    },

    getRaw(key) {
        return localStorage.getItem(key);
    },

    setRaw(key, value) {
        localStorage.setItem(key, value);
    },

    getJSON(key, defaultValue) {
        const raw = localStorage.getItem(key);
        if (raw == null) return defaultValue;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return defaultValue;
        }
    },

    setJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    listKeys() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            keys.push(localStorage.key(i));
        }
        return keys;
    },

    exportAll() {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    },

    importAll(data, options) {
        const clearFirst = !options || options.clearFirst !== false;
        if (clearFirst) localStorage.clear();
        Object.keys(data).forEach(function (key) {
            localStorage.setItem(key, data[key]);
        });
    },

    clearAll() {
        localStorage.clear();
    },

    getUsageBytes() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            total += (key.length + (value ? value.length : 0)) * 2;
        }
        return total;
    },

    announcements: {
        _migrateLegacyPortionHint() {
            const legacy = RadiantStorage.getRaw('portionHintDismissedVersion');
            if (legacy == null || legacy === '') return;
            const list = RadiantStorage.getJSON(RadiantStorage.KEYS.ANNOUNCEMENTS_DISMISSED, []);
            if (list.indexOf('sr-legacy-portions-v1') === -1) {
                list.push('sr-legacy-portions-v1');
                RadiantStorage.setJSON(RadiantStorage.KEYS.ANNOUNCEMENTS_DISMISSED, list);
            }
            RadiantStorage.remove('portionHintDismissedVersion');
        },

        getDismissed() {
            RadiantStorage.announcements._migrateLegacyPortionHint();
            return RadiantStorage.getJSON(RadiantStorage.KEYS.ANNOUNCEMENTS_DISMISSED, []);
        },

        isDismissed(id) {
            return RadiantStorage.announcements.getDismissed().indexOf(id) >= 0;
        },

        dismiss(id) {
            const list = RadiantStorage.announcements.getDismissed();
            if (list.indexOf(id) >= 0) return;
            list.push(id);
            RadiantStorage.setJSON(RadiantStorage.KEYS.ANNOUNCEMENTS_DISMISSED, list);
        },
    },

    profile: {
        get() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.PROFILE, null);
        },

        save(profile) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.PROFILE, profile);
        },

        merge(partial) {
            const existing = this.get() || {};
            const merged = Object.assign({}, existing, partial);
            this.save(merged);
            return merged;
        },

        export() {
            const data = this.get();
            return data ? JSON.stringify(data) : null;
        },

        import(jsonString) {
            this.save(JSON.parse(jsonString));
        },

        getWeightAndBodyFat() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.WEIGHT_AND_BODY_FAT, {});
        },

        saveWeightAndBodyFat(data) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.WEIGHT_AND_BODY_FAT, data);
        },

        getMacros() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.MACROS, null);
        },

        saveMacros(macros) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.MACROS, macros);
        },

        getUserTime() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.USER_TIME);
        },

        saveUserTime(time) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.USER_TIME, time);
        },

        getActivityLevels() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.ACTIVITY_LEVELS, null);
        },

        saveActivityLevels(levels) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.ACTIVITY_LEVELS, levels);
        },

        isComplete() {
            return !!(this.get() && this.getUserTime() && this.getMacros());
        },
    },

    nutrition: {
        getFoodLog() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.FOOD_LOG, {});
        },

        saveFoodLog(foodLog) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.FOOD_LOG, foodLog);
        },

        getToday() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.TODAY) ||
                new Date().toLocaleDateString('en-CA');
        },

        setToday(date) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.TODAY, date);
        },

        getMealTimes() {
            return RadiantStorage.getJSON(
                RadiantStorage.KEYS.MEAL_TIMES,
                RadiantStorage.DEFAULT_MEAL_TIMES
            );
        },

        saveMealTimes(mealTimes) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.MEAL_TIMES, mealTimes);
        },

        getDynamicMealConfig() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.DYNAMIC_MEAL_CONFIG, null);
        },

        saveDynamicMealConfig(config) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.DYNAMIC_MEAL_CONFIG, config);
        },

        getMealPlanning() {
            return RadiantStorage.getJSON(
                RadiantStorage.KEYS.MEAL_PLANNING,
                Object.assign({}, RadiantStorage.DEFAULT_MEAL_PLANNING)
            );
        },

        saveMealPlanning(mealPlanning) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.MEAL_PLANNING, mealPlanning);
        },

        getPreferredUnit() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.PREFERRED_UNIT) === 'oz' ? 'oz' : 'grams';
        },

        setPreferredUnit(unit) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.PREFERRED_UNIT, unit);
        },

        hasSeenWelcome() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.HAS_SEEN_WELCOME) === 'true';
        },

        markWelcomeSeen() {
            RadiantStorage.setRaw(RadiantStorage.KEYS.HAS_SEEN_WELCOME, 'true');
        },

        getFoodLogMigrationVersion() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.FOOD_LOG_MIGRATION_VERSION);
        },

        setFoodLogMigrationVersion(version) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.FOOD_LOG_MIGRATION_VERSION, String(version));
        },

        getLegacyKey(key) {
            return RadiantStorage.getRaw(key);
        },

        getLegacyJSON(key, defaultValue) {
            return RadiantStorage.getJSON(key, defaultValue);
        },

        removeLegacyKey(key) {
            RadiantStorage.remove(key);
        },

        getRecentFoodSelections() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.RECENT_FOOD_SELECTIONS, []);
        },

        saveRecentFoodSelections(selections) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.RECENT_FOOD_SELECTIONS, selections);
        },

        markSrLegacyImported(portionVersion) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.SR_LEGACY_IMPORT_COMPLETE, 'true');
            if (portionVersion != null) {
                RadiantStorage.setRaw(
                    RadiantStorage.KEYS.SR_LEGACY_PORTION_VERSION,
                    String(portionVersion)
                );
            }
        },
    },

    recipes: {
        getBackup() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.CUSTOM_RECIPES_BACKUP, []);
        },

        saveBackup(recipes) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.CUSTOM_RECIPES_BACKUP, recipes);
        },
    },

    settings: {
        getPreferOffline() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.PREFER_OFFLINE) === 'true';
        },

        setPreferOffline(checked) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.PREFER_OFFLINE, String(checked));
        },

        getUsdaApiKey() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.USDA_API_KEY) || '';
        },

        setUsdaApiKey(key) {
            if (key) {
                RadiantStorage.setRaw(RadiantStorage.KEYS.USDA_API_KEY, key);
            } else {
                RadiantStorage.remove(RadiantStorage.KEYS.USDA_API_KEY);
            }
        },

        getBarcodeSource() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.BARCODE_SOURCE) || 'off_then_usda';
        },

        setBarcodeSource(source) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.BARCODE_SOURCE, source);
        },
    },

    notes: {
        getDailyNotes() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.DAILY_NOTES, {});
        },

        saveDailyNotes(notes) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.DAILY_NOTES, notes);
        },

        getSleep() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.SLEEP, {});
        },

        saveSleep(sleep) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.SLEEP, sleep);
        },
    },

    workout: {
        getSettings() {
            const raw = RadiantStorage.getRaw(RadiantStorage.KEYS.WORKOUT_SETTINGS);
            return raw ? JSON.parse(raw) : null;
        },

        saveSettings(settings) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.WORKOUT_SETTINGS, settings);
        },

        getRoutines() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.WORKOUT_ROUTINES, {});
        },

        saveRoutines(routines) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.WORKOUT_ROUTINES, routines);
        },

        getSchedule() {
            const schedule = RadiantStorage.getJSON(RadiantStorage.KEYS.WORKOUT_SCHEDULE, null);
            if (schedule) return schedule;
            return { type: 'cycle', cycleDays: {}, weekly: {} };
        },

        saveSchedule(schedule) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.WORKOUT_SCHEDULE, schedule);
        },

        getExerciseLibrary() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.EXERCISE_LIBRARY, {});
        },

        saveExerciseLibrary(library) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.EXERCISE_LIBRARY, library);
        },

        getLastCompletedCycleDay() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.LAST_COMPLETED_CYCLE_DAY);
        },

        setLastCompletedCycleDay(day) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.LAST_COMPLETED_CYCLE_DAY, String(day));
        },

        getLastCompletedDate() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.LAST_COMPLETED_DATE);
        },

        setLastCompletedDate(date) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.LAST_COMPLETED_DATE, date);
        },

        getCycleHistory() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.CYCLE_HISTORY, []);
        },

        saveCycleHistory(history) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.CYCLE_HISTORY, history);
        },

        getStoredDay() {
            return RadiantStorage.getRaw(RadiantStorage.KEYS.STORED_DAY);
        },

        setStoredDay(day) {
            RadiantStorage.setRaw(RadiantStorage.KEYS.STORED_DAY, day);
        },

        getCheckboxStates() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.CHECKBOX_STATES, {});
        },

        saveCheckboxStates(states) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.CHECKBOX_STATES, states);
        },

        get531Profile() {
            return RadiantStorage.getJSON(RadiantStorage.KEYS.PROFILE_531, null);
        },

        save531Profile(profile) {
            RadiantStorage.setJSON(RadiantStorage.KEYS.PROFILE_531, profile);
        },
    },
};
