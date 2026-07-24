/**
 * Radiant Workout System - Flexible Data Management
 * Supports cycle-based and weekly scheduling with progressive overload
 */

const WorkoutUtils = {
    // Default settings for new installations
    DEFAULT_SETTINGS: {
        cycleLength: 4,
        cycleDayNames: ['Day 1', 'Day 2', 'Day 3', 'Day 4'],
        currentCycle: 1,
        scheduleType: 'cycle', // 'cycle' or 'weekly'
        weekStructure: {
            enabled: false,
            weeksPerCycle: 4,
            currentWeek: 1,
            weekLabels: []
        },
        defaultProgressionUpper: 5, // lbs
        defaultProgressionLower: 10 // lbs
    },

    /**
     * Initialize with default settings
     */
    initialize() {
        const settings = this.getSettings();
        
        // If no settings exist, create defaults
        if (!settings) {
            this.saveSettings(this.DEFAULT_SETTINGS);
        }

        this.migrate531OneRepMaxes();
    },

    /**
     * Sync 531 main-lift 1RM inputs into exerciseLibrary (one-time per install).
     */
    migrate531OneRepMaxes() {
        const profile = RadiantStorage.workout.get531Profile();
        if (!profile || !profile.inputs) return;

        const map = {
            squat: 'Squat',
            bench: 'Bench Press',
            deadlift: 'Deadlift',
            ohp: 'Overhead Press',
        };

        const library = this.getExerciseLibrary();
        let changed = false;

        Object.keys(map).forEach(function (key) {
            const raw = profile.inputs[key];
            const oneRepMax = Number(raw);
            if (!Number.isFinite(oneRepMax) || oneRepMax <= 0) return;

            const exerciseName = map[key];
            const exerciseKey = exerciseName.toLowerCase().replace(/\s+/g, '-');
            const existing = library[exerciseKey];
            if (existing && existing.oneRepMax === oneRepMax) return;

            library[exerciseKey] = {
                name: exerciseName,
                oneRepMax: oneRepMax,
                lastTested: new Date().toISOString().split('T')[0],
                category: key === 'squat' || key === 'deadlift' ? 'lower' : 'upper',
                source: '531',
            };
            changed = true;
        });

        if (changed) {
            this.saveExerciseLibrary(library);
        }
    },

    /**
     * Get workout settings
     */
    getSettings() {
        return RadiantStorage.workout.getSettings();
    },

    /**
     * Save workout settings
     */
    saveSettings(settings) {
        RadiantStorage.workout.saveSettings(settings);
    },

    /**
     * Update specific setting
     */
    updateSetting(key, value) {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        settings[key] = value;
        this.saveSettings(settings);
    },



    /**
     * Determine if exercise is lower body (for progression rates)
     */
    isLowerBodyExercise(exerciseName) {
        const lowerBodyKeywords = ['squat', 'deadlift', 'leg press', 'lunge', 'leg curl'];
        const name = exerciseName.toLowerCase();
        return lowerBodyKeywords.some(keyword => name.includes(keyword));
    },

    /**
     * Get all routines
     */
    getRoutines() {
        return RadiantStorage.workout.getRoutines();
    },

    /**
     * Save routines
     */
    saveRoutines(routines) {
        RadiantStorage.workout.saveRoutines(routines);
    },

    /**
     * Get a specific routine
     */
    getRoutine(routineName) {
        const routines = this.getRoutines();
        return routines[routineName] || null;
    },

    /**
     * Save a specific routine
     */
    saveRoutine(routineName, routine) {
        const routines = this.getRoutines();
        routines[routineName] = routine;
        this.saveRoutines(routines);
    },

    /**
     * Get schedule (supports both cycle and weekly)
     */
    getSchedule() {
        return RadiantStorage.workout.getSchedule();
    },

    /**
     * Save schedule
     */
    saveSchedule(schedule) {
        RadiantStorage.workout.saveSchedule(schedule);
    },

    /**
     * Get normalized week structure settings
     */
    getWeekStructure() {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        const ws = settings.weekStructure || this.DEFAULT_SETTINGS.weekStructure;
        return {
            enabled: !!ws.enabled,
            weeksPerCycle: ws.weeksPerCycle || 4,
            currentWeek: ws.currentWeek || 1,
            weekLabels: Array.isArray(ws.weekLabels) ? ws.weekLabels : []
        };
    },

    /**
     * Whether multi-week blocks are enabled
     */
    isWeekStructureEnabled() {
        return this.getWeekStructure().enabled;
    },

    /**
     * Label for a training week tab
     */
    getWeekLabel(weekNum) {
        const ws = this.getWeekStructure();
        const label = ws.weekLabels[weekNum - 1];
        return label && String(label).trim() ? String(label).trim() : `Week ${weekNum}`;
    },

    /**
     * Get day assignments for a specific training week
     */
    getWeekSchedule(weekNum) {
        const schedule = this.getSchedule();
        const ws = this.getWeekStructure();

        if (!ws.enabled) {
            return {
                cycleDays: schedule.cycleDays || {},
                weekly: schedule.weekly || {}
            };
        }

        const week = schedule.weeks && schedule.weeks[weekNum];
        if (week) {
            return {
                cycleDays: week.cycleDays || {},
                weekly: week.weekly || {}
            };
        }

        return {
            cycleDays: schedule.cycleDays || {},
            weekly: schedule.weekly || {}
        };
    },

    /**
     * Create or resize schedule.weeks from the flat schedule
     */
    ensureWeekSchedule(weeksPerCycle) {
        const schedule = this.getSchedule();
        if (!schedule.weeks) {
            schedule.weeks = {};
        }

        const flatCycleDays = JSON.parse(JSON.stringify(schedule.cycleDays || {}));
        const flatWeekly = JSON.parse(JSON.stringify(schedule.weekly || {}));

        for (let w = 1; w <= weeksPerCycle; w++) {
            if (!schedule.weeks[w]) {
                schedule.weeks[w] = {
                    cycleDays: JSON.parse(JSON.stringify(flatCycleDays)),
                    weekly: JSON.parse(JSON.stringify(flatWeekly))
                };
            }
        }

        Object.keys(schedule.weeks).forEach(function (key) {
            if (parseInt(key, 10) > weeksPerCycle) {
                delete schedule.weeks[key];
            }
        });

        this.saveSchedule(schedule);
        return schedule;
    },

    /**
     * Advance to the next training week (cycle mode)
     */
    advanceTrainingWeek() {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        if (!settings.weekStructure) {
            settings.weekStructure = { ...this.DEFAULT_SETTINGS.weekStructure };
        }

        const weeksPerCycle = settings.weekStructure.weeksPerCycle || 4;
        if (settings.weekStructure.currentWeek >= weeksPerCycle) {
            return false;
        }

        settings.weekStructure.currentWeek += 1;
        this.saveSettings(settings);
        RadiantStorage.workout.setLastCompletedCycleDay('0');
        return true;
    },

    /**
     * Get exercise library (1RM database)
     */
    getExerciseLibrary() {
        return RadiantStorage.workout.getExerciseLibrary();
    },

    /**
     * Save exercise library
     */
    saveExerciseLibrary(library) {
        RadiantStorage.workout.saveExerciseLibrary(library);
    },

    /**
     * Update 1RM for an exercise in the library
     */
    updateExercise1RM(exerciseName, oneRepMax) {
        const library = this.getExerciseLibrary();
        const exerciseKey = exerciseName.toLowerCase().replace(/\s+/g, '-');
        
        library[exerciseKey] = {
            name: exerciseName,
            oneRepMax: oneRepMax,
            lastTested: new Date().toISOString().split('T')[0],
            category: this.isLowerBodyExercise(exerciseName) ? 'lower' : 'upper'
        };
        
        this.saveExerciseLibrary(library);
        
        // Update all instances of this exercise in routines
        this.updateExerciseInRoutines(exerciseName, oneRepMax);
    },

    /**
     * Update all instances of an exercise across routines when 1RM changes
     */
    updateExerciseInRoutines(exerciseName, oneRepMax) {
        const routines = this.getRoutines();
        let updated = false;
        
        for (const routineName in routines) {
            const routine = routines[routineName];
            if (!routine.exercises) continue;
            
            routine.exercises.forEach(ex => {
                if (ex.name.toLowerCase() === exerciseName.toLowerCase()) {
                    ex.oneRepMax = oneRepMax;
                    ex.trainingMax = Math.round(oneRepMax * (ex.trainingMaxPercent / 100));
                    
                    // Auto-calculate weight if percentage-based
                    if (ex.percentageBased && ex.percentageBased.enabled && ex.percentageBased.autoCalculate) {
                        ex.weight = this.calculateWeight(ex.trainingMax, ex.percentageBased.percentage);
                    }
                    
                    updated = true;
                }
            });
        }
        
        if (updated) {
            this.saveRoutines(routines);
        }
    },

    /**
     * Calculate weight based on training max and percentage
     */
    calculateWeight(trainingMax, percentage) {
        const weight = trainingMax * (percentage / 100);
        return Math.round(weight / 5) * 5; // Round to nearest 5
    },

    /**
     * Calculate training max from 1RM
     */
    calculateTrainingMax(oneRepMax, percentage = 90) {
        return Math.round((oneRepMax * percentage / 100) / 5) * 5;
    },

    /**
     * Get current cycle day based on date
     */
    getCurrentCycleDay() {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        const schedule = this.getSchedule();
        
        if (schedule.type === 'weekly') {
            // Use old weekly system
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return days[new Date().getDay()];
        } else {
            // Cycle-based system
            const lastCompletedDay = RadiantStorage.workout.getLastCompletedCycleDay();
            const lastCompletedDate = RadiantStorage.workout.getLastCompletedDate();
            const today = new Date().toISOString().split('T')[0];
            
            if (lastCompletedDate !== today && lastCompletedDay) {
                // New day, advance cycle
                const nextDay = (parseInt(lastCompletedDay) % settings.cycleLength) + 1;
                return nextDay;
            }
            
            return parseInt(lastCompletedDay) || 1;
        }
    },

    /**
     * Complete current workout day
     */
    completeWorkoutDay(cycleDay) {
        const today = new Date().toISOString().split('T')[0];
        RadiantStorage.workout.setLastCompletedCycleDay(cycleDay);
        RadiantStorage.workout.setLastCompletedDate(today);
    },

    /**
     * Progress to next cycle
     */
    progressToNextCycle() {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        settings.currentCycle += 1;

        if (settings.weekStructure) {
            settings.weekStructure.currentWeek = 1;
        }

        this.saveSettings(settings);
        
        // Apply progression to all exercises with progression enabled
        this.applyProgression();
        
        // Save cycle history
        this.saveCycleHistory();
        
        // Reset to Day 1
        RadiantStorage.workout.setLastCompletedCycleDay('0');
    },

    /**
     * Apply progression to all exercises
     */
    applyProgression() {
        const routines = this.getRoutines();
        
        for (const routineName in routines) {
            const routine = routines[routineName];
            if (!routine.exercises) continue;
            
            routine.exercises.forEach(ex => {
                if (ex.progression && ex.progression.enabled) {
                    // Update 1RM if present
                    if (ex.oneRepMax) {
                        ex.oneRepMax += ex.progression.increment;
                        ex.trainingMax = this.calculateTrainingMax(ex.oneRepMax, ex.trainingMaxPercent);
                    }
                    
                    // Update working weight
                    if (ex.weight && !isNaN(ex.weight)) {
                        ex.weight = parseFloat(ex.weight) + ex.progression.increment;
                    }
                    
                    ex.progression.lastUpdated = new Date().toISOString().split('T')[0];
                }
            });
        }
        
        this.saveRoutines(routines);
    },

    /**
     * Save cycle history
     */
    saveCycleHistory() {
        const history = this.getCycleHistory();
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        const routines = this.getRoutines();
        
        history.push({
            cycleNumber: settings.currentCycle - 1,
            endDate: new Date().toISOString().split('T')[0],
            routines: JSON.parse(JSON.stringify(routines)) // Deep copy
        });
        
        RadiantStorage.workout.saveCycleHistory(history);
    },

    /**
     * Get cycle history
     */
    getCycleHistory() {
        return RadiantStorage.workout.getCycleHistory();
    },

    /**
     * Format cycle day label (Day 1, Day 2, …)
     */
    getCycleDayName(dayNumber) {
        return `Day ${dayNumber}`;
    },

    /**
     * Get assigned routine name for a cycle day (week-aware when weekNum provided)
     */
    getRoutineNameForCycleDay(dayNumber, weekNum) {
        const schedule = this.getSchedule();
        const ws = this.getWeekStructure();
        const week = weekNum != null ? weekNum : (ws.enabled ? ws.currentWeek : null);
        const weekSchedule = week != null && ws.enabled
            ? this.getWeekSchedule(week)
            : { cycleDays: schedule.cycleDays || {} };
        return weekSchedule.cycleDays[dayNumber] || null;
    },

    /**
     * Label for cycle day including routine: "Day 1 · Push Day" or "Day 1 · Rest Day"
     */
    getCycleDayDisplayLabel(dayNumber, weekNum) {
        const routineName = this.getRoutineNameForCycleDay(dayNumber, weekNum);
        return `${this.getCycleDayName(dayNumber)} · ${routineName || 'Rest Day'}`;
    },

    /**
     * Get routine for current day
     */
    getTodaysRoutine() {
        const schedule = this.getSchedule();
        const currentDay = this.getCurrentCycleDay();
        const ws = this.getWeekStructure();
        const weekSchedule = ws.enabled
            ? this.getWeekSchedule(ws.currentWeek)
            : { cycleDays: schedule.cycleDays || {}, weekly: schedule.weekly || {} };
        
        if (schedule.type === 'weekly') {
            const routineName = weekSchedule.weekly[currentDay];
            return routineName ? this.getRoutine(routineName) : null;
        } else {
            const routineName = weekSchedule.cycleDays[currentDay];
            return routineName ? this.getRoutine(routineName) : null;
        }
    },

    /**
     * Calculate plate loading for a given weight
     */
    calculatePlateLoading(weight, unit = 'lbs') {
        const barWeight = unit === 'lbs' ? 45 : 20;
        const weightPerSide = (weight - barWeight) / 2;
        
        const plates = unit === 'lbs' 
            ? [45, 25, 10, 5, 2.5]
            : [25, 20, 15, 10, 5, 2.5, 1.25];
        
        const loading = [];
        let remaining = weightPerSide;
        
        for (const plate of plates) {
            const count = Math.floor(remaining / plate);
            if (count > 0) {
                loading.push({ weight: plate, count });
                remaining -= count * plate;
            }
        }
        
        return { perSide: loading, barWeight, remaining };
    }
};

// Initialize on load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        WorkoutUtils.initialize();
    });
}



