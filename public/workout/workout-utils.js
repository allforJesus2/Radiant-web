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
            currentWeek: 1
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
    },

    /**
     * Get workout settings
     */
    getSettings() {
        const settings = localStorage.getItem('workoutSettings');
        return settings ? JSON.parse(settings) : null;
    },

    /**
     * Save workout settings
     */
    saveSettings(settings) {
        localStorage.setItem('workoutSettings', JSON.stringify(settings));
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
        const routines = localStorage.getItem('workoutRoutines');
        return routines ? JSON.parse(routines) : {};
    },

    /**
     * Save routines
     */
    saveRoutines(routines) {
        localStorage.setItem('workoutRoutines', JSON.stringify(routines));
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
        const schedule = localStorage.getItem('workoutSchedule');
        if (schedule) {
            return JSON.parse(schedule);
        }
        
        return {
            type: 'cycle',
            cycleDays: {},
            weekly: {}
        };
    },

    /**
     * Save schedule
     */
    saveSchedule(schedule) {
        localStorage.setItem('workoutSchedule', JSON.stringify(schedule));
    },

    /**
     * Get exercise library (1RM database)
     */
    getExerciseLibrary() {
        const library = localStorage.getItem('exerciseLibrary');
        return library ? JSON.parse(library) : {};
    },

    /**
     * Save exercise library
     */
    saveExerciseLibrary(library) {
        localStorage.setItem('exerciseLibrary', JSON.stringify(library));
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
            const lastCompletedDay = localStorage.getItem('lastCompletedCycleDay');
            const lastCompletedDate = localStorage.getItem('lastCompletedDate');
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
        localStorage.setItem('lastCompletedCycleDay', cycleDay.toString());
        localStorage.setItem('lastCompletedDate', today);
    },

    /**
     * Progress to next cycle
     */
    progressToNextCycle() {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        settings.currentCycle += 1;
        this.saveSettings(settings);
        
        // Apply progression to all exercises with progression enabled
        this.applyProgression();
        
        // Save cycle history
        this.saveCycleHistory();
        
        // Reset to Day 1
        localStorage.setItem('lastCompletedCycleDay', '0');
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
        
        localStorage.setItem('cycleHistory', JSON.stringify(history));
    },

    /**
     * Get cycle history
     */
    getCycleHistory() {
        const history = localStorage.getItem('cycleHistory');
        return history ? JSON.parse(history) : [];
    },

    /**
     * Format cycle day name
     */
    getCycleDayName(dayNumber) {
        const settings = this.getSettings() || this.DEFAULT_SETTINGS;
        return settings.cycleDayNames[dayNumber - 1] || `Day ${dayNumber}`;
    },

    /**
     * Get routine for current day
     */
    getTodaysRoutine() {
        const schedule = this.getSchedule();
        const currentDay = this.getCurrentCycleDay();
        
        if (schedule.type === 'weekly') {
            const routineName = schedule.weekly[currentDay];
            return routineName ? this.getRoutine(routineName) : null;
        } else {
            const routineName = schedule.cycleDays[currentDay];
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




