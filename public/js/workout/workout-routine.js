// Function to add a workout routine
function addRoutine() {
    const routineNameInput = document.getElementById('routine-name');
    const routineName = routineNameInput.value.trim();
    if (routineName === '') {
        alert('Please enter a workout routine name.');
        return;
    }
    const routines = WorkoutUtils.getRoutines();

    // New structure with metadata
    routines[routineName] = {
        cycleDay: null, // User will assign in schedule
        exercises: []
    };

    WorkoutUtils.saveRoutines(routines);
    displayRoutines();
    routineNameInput.value = ''; // Clear the input field
}

// Function to add predefined workout routines
function addPredefinedRoutines() {
    const confirmAdd = confirm('This will add several predefined workout routines. Continue?');
    if (!confirmAdd) return;

    // Get user profile data
    const profileData = RadiantStorage.profile.get();
    const hasCompleteProfile = profileData
        && profileData.weight
        && profileData.gender
        && profileData.bodyFatPercent;

    // Get user's preferred weight unit
    const userWeightUnit = (profileData && profileData.weightUnit) || 'lbs';

    const routines = WorkoutUtils.getRoutines();

    // Calculate appropriate weights based on user profile
    const calculateWeight = (baseWeight, exerciseType) => {
        if (!hasCompleteProfile) {
            return baseWeight;
        }

        // Convert weight to pounds if stored in kg
        let userWeightLbs = userWeightUnit === 'kg'
            ? profileData.weight * 2.20462  // Convert kg to lbs
            : profileData.weight;

        // Calculate lean body mass (in pounds)
        const leanBodyMass = userWeightLbs * (1 - (profileData.bodyFatPercent / 100));

        // Different multipliers based on exercise type and gender
        let multiplier = 0;

        if (exerciseType === 'bench') {
            multiplier = profileData.gender === 'Male' ? 0.75 : 0.5;
        } else if (exerciseType === 'squat') {
            multiplier = profileData.gender === 'Male' ? 1.0 : 0.75;
        } else if (exerciseType === 'deadlift') {
            multiplier = profileData.gender === 'Male' ? 1.2 : 0.9;
        } else if (exerciseType === 'overhead') {
            multiplier = profileData.gender === 'Male' ? 0.45 : 0.3;
        } else if (exerciseType === 'curl') {
            multiplier = profileData.gender === 'Male' ? 0.2 : 0.15;
        } else if (exerciseType === 'tricep') {
            multiplier = profileData.gender === 'Male' ? 0.2 : 0.15;
        } else if (exerciseType === 'legpress') {
            multiplier = profileData.gender === 'Male' ? 1.5 : 1.2;
        } else if (exerciseType === 'calf') {
            multiplier = profileData.gender === 'Male' ? 0.5 : 0.4;
        } else if (exerciseType === 'lunge') {
            multiplier = profileData.gender === 'Male' ? 0.3 : 0.25;
        } else if (exerciseType === 'facepull') {
            multiplier = profileData.gender === 'Male' ? 0.25 : 0.2;
        } else if (exerciseType === 'twist') {
            multiplier = profileData.gender === 'Male' ? 0.1 : 0.08;
        } else {
            // Default case - use the base weight
            return baseWeight;
        }

        // Calculate weight based on lean body mass and round to nearest 5
        let calculatedWeight = Math.round((leanBodyMass * multiplier) / 5) * 5;

        // Convert back to kg if that's the user's preferred unit
        if (userWeightUnit === 'kg') {
            calculatedWeight = Math.round((calculatedWeight / 2.20462) * 2) / 2; // Convert to kg and round to nearest 0.5
        }

        return calculatedWeight;
    };

    // Upper Body Routine
    if (!routines['Upper Body']) {
        routines['Upper Body'] = {
            cycleDay: null,
            exercises: [
                { id: `ex-${Date.now()}-0`, name: 'Bench Press', reps: '8', sets: 3, weight: calculateWeight(135, 'bench'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-1`, name: 'Overhead Press', reps: '8', sets: 3, weight: calculateWeight(95, 'overhead'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-2`, name: 'Dumbbell Curl', reps: '12', sets: 3, weight: calculateWeight(25, 'curl'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-3`, name: 'Tricep Extension', reps: '12', sets: 3, weight: calculateWeight(30, 'tricep'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-4`, name: 'Pull-ups', reps: '8', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: false, type: 'linear', increment: 0 } },
                { id: `ex-${Date.now()}-5`, name: 'Face Pull', reps: '15', sets: 3, weight: calculateWeight(50, 'facepull'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: true, type: 'linear', increment: 5 } }
            ]
        };
    }

    // Lower Body Routine
    if (!routines['Lower Body']) {
        routines['Lower Body'] = {
            cycleDay: null,
            exercises: [
                { id: `ex-${Date.now()}-10`, name: 'Squat', reps: '8', sets: 3, weight: calculateWeight(185, 'squat'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: true, type: 'linear', increment: 10 } },
                { id: `ex-${Date.now()}-11`, name: 'Deadlift', reps: '6', sets: 3, weight: calculateWeight(225, 'deadlift'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: true, type: 'linear', increment: 10 } },
                { id: `ex-${Date.now()}-12`, name: 'Leg Press', reps: '12', sets: 3, weight: calculateWeight(250, 'legpress'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: true, type: 'linear', increment: 10 } },
                { id: `ex-${Date.now()}-13`, name: 'Lunges', reps: '10', sets: 3, weight: calculateWeight(30, 'lunge'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-14`, name: 'Calf Raise', reps: '15', sets: 3, weight: calculateWeight(100, 'calf'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: true, type: 'linear', increment: 10 } }
            ]
        };
    }

    // Core Workout
    if (!routines['Core Workout']) {
        routines['Core Workout'] = {
            cycleDay: null,
            exercises: [
                { id: `ex-${Date.now()}-20`, name: 'Plank', reps: '', sets: 3, weight: '', time: '60', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'core', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-21`, name: 'Russian Twist', reps: '20', sets: 3, weight: calculateWeight(15, 'twist'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'core', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-22`, name: 'Crunches', reps: '20', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'core', progression: { enabled: false, type: 'linear', increment: 0 } },
                { id: `ex-${Date.now()}-23`, name: 'Leg Raises', reps: '15', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'core', progression: { enabled: false, type: 'linear', increment: 0 } },
                { id: `ex-${Date.now()}-24`, name: 'Mountain Climbers', reps: '', sets: 3, weight: '', time: '45', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'core', progression: { enabled: true, type: 'linear', increment: 5 } }
            ]
        };
    }

    // Cardio Session
    if (!routines['Cardio Session']) {
        routines['Cardio Session'] = {
            cycleDay: null,
            exercises: [
                { id: `ex-${Date.now()}-30`, name: 'Running', reps: '', sets: 1, weight: '', time: '20', weightUnit: userWeightUnit, timeUnit: 'min', category: 'cardio', progression: { enabled: true, type: 'linear', increment: 1 } },
                { id: `ex-${Date.now()}-31`, name: 'Jump Rope', reps: '', sets: 3, weight: '', time: '5', weightUnit: userWeightUnit, timeUnit: 'min', category: 'cardio', progression: { enabled: true, type: 'linear', increment: 1 } },
                { id: `ex-${Date.now()}-32`, name: 'Burpees', reps: '15', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'cardio', progression: { enabled: false, type: 'linear', increment: 0 } },
                { id: `ex-${Date.now()}-33`, name: 'Cycling', reps: '', sets: 1, weight: '', time: '15', weightUnit: userWeightUnit, timeUnit: 'min', category: 'cardio', progression: { enabled: true, type: 'linear', increment: 1 } }
            ]
        };
    }

    // Full Body Workout
    if (!routines['Full Body Workout']) {
        routines['Full Body Workout'] = {
            cycleDay: null,
            exercises: [
                { id: `ex-${Date.now()}-40`, name: 'Squat', reps: '10', sets: 3, weight: calculateWeight(155, 'squat'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: true, type: 'linear', increment: 10 } },
                { id: `ex-${Date.now()}-41`, name: 'Push-ups', reps: '15', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'accessory', progression: { enabled: false, type: 'linear', increment: 0 } },
                { id: `ex-${Date.now()}-42`, name: 'Deadlift', reps: '8', sets: 3, weight: calculateWeight(185, 'deadlift'), time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: true, type: 'linear', increment: 10 } },
                { id: `ex-${Date.now()}-43`, name: 'Pull-ups', reps: '8', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'compound', progression: { enabled: false, type: 'linear', increment: 0 } },
                { id: `ex-${Date.now()}-44`, name: 'Plank', reps: '', sets: 3, weight: '', time: '45', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'core', progression: { enabled: true, type: 'linear', increment: 5 } },
                { id: `ex-${Date.now()}-45`, name: 'Burpees', reps: '10', sets: 3, weight: '', time: '', weightUnit: userWeightUnit, timeUnit: 'sec', category: 'cardio', progression: { enabled: false, type: 'linear', increment: 0 } }
            ]
        };
    }

    WorkoutUtils.saveRoutines(routines);
    displayRoutines();
    alert('Predefined workout routines have been added.');
}

// Function to display workout routines
function displayRoutines() {
    const routines = WorkoutUtils.getRoutines();
    const settings = WorkoutUtils.getSettings();
    const schedule = WorkoutUtils.getSchedule();
    const routineList = document.getElementById('routine-list');
    routineList.innerHTML = ''; // Clear the list

    Object.keys(routines).forEach((routineName) => {
        const routine = routines[routineName];
        const routineElement = document.createElement('div');

        // Show routine name and optional cycle day assignment
        let displayText = routineName;

        // Check if this routine is assigned to a schedule
        if (schedule.type === 'cycle') {
            const assignedDays = Object.keys(schedule.cycleDays || {})
                .filter(function(day) { return schedule.cycleDays[day] === routineName; })
                .map(function(day) { return 'Day ' + day; });
            if (assignedDays.length > 0) {
                displayText += ' (' + assignedDays.join(', ') + ')';
            }
        } else if (schedule.type === 'weekly') {
            // Find which days this routine is assigned to
            const assignedDays = Object.keys(schedule.weekly).filter(day => schedule.weekly[day] === routineName);
            if (assignedDays.length > 0) {
                displayText += ` (${assignedDays.join(', ')})`;
            }
        }

        // Show exercise count
        const exerciseCount = routine.exercises ? routine.exercises.length : 0;
        displayText += ` - ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}`;

        const textSpan = document.createElement('span');
        textSpan.textContent = displayText;
        textSpan.style.cursor = 'pointer';
        textSpan.onclick = function() {
            window.location.href = `edit-workout-routine.html?selectedRoutine=${encodeURIComponent(routineName)}`;
        };
        routineElement.appendChild(textSpan);

        const buttonGroup = document.createElement('span');
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '8px';

        const copyButton = document.createElement('span');
        copyButton.textContent = '📋';
        copyButton.onclick = function(e) {
            e.stopPropagation();
            copyRoutine(routineName);
        };
        buttonGroup.appendChild(copyButton);

        const deleteButton = document.createElement('span');
        deleteButton.textContent = '❌';
        deleteButton.onclick = function(e) {
            e.stopPropagation();
            deleteRoutine(routineName);
        };
        buttonGroup.appendChild(deleteButton);
        routineElement.appendChild(buttonGroup);
        routineList.appendChild(routineElement);
    });
}

// Function to delete a workout routine
function deleteRoutine(routineName) {
    const confirmDelete = confirm('Are you sure you want to delete this workout routine?');
    if (confirmDelete) {
        const routines = WorkoutUtils.getRoutines();
        delete routines[routineName];
        WorkoutUtils.saveRoutines(routines);
        displayRoutines();
    }
}

// Function to copy a workout routine
function copyRoutine(routineName) {
    const routines = WorkoutUtils.getRoutines();
    const routine = routines[routineName];
    if (!routine) return;

    let copyName = routineName + ' (Copy)';
    let counter = 1;
    while (routines[copyName]) {
        copyName = routineName + ' (Copy ' + counter + ')';
        counter++;
    }

    routines[copyName] = {
        cycleDay: routine.cycleDay,
        exercises: routine.exercises.map(function(ex) {
            return Object.assign({}, ex, { id: 'ex-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) });
        })
    };

    WorkoutUtils.saveRoutines(routines);
    displayRoutines();
}

// Display routines on page load
window.onload = function() {
    displayRoutines();
    document.getElementById('addPredefinedBtn').addEventListener('click', addPredefinedRoutines);
};
