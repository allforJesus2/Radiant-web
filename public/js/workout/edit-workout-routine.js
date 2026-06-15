        const queryString = window.location.search;
        const urlParams = new URLSearchParams(queryString);
        const selectedRoutine = urlParams.get('selectedRoutine');

        document.getElementById('routine-name').textContent = decodeURIComponent(selectedRoutine);

        function toggleInfo(button) {
            const content = document.getElementById('explanationContent');
            const icon = document.getElementById('toggleIcon');
            
            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                icon.textContent = '▼';
            } else {
                content.classList.add('expanded');
                icon.textContent = '▲';
            }
        }

        function toggleAdvanced() {
            const advancedContent = document.getElementById('advanced-section').querySelector('div');
            const icon = document.getElementById('advanced-toggle-icon');
            
            if (advancedContent.classList.contains('expanded')) {
                advancedContent.classList.remove('expanded');
                icon.textContent = '▼';
            } else {
                advancedContent.classList.add('expanded');
                icon.textContent = '▲';
            }
        }

        function displayExercises() {
            const routines = WorkoutUtils.getRoutines();
            const routine = routines[selectedRoutine] || { exercises: [] };
            const exercises = routine.exercises || [];
            
            const exerciseList = document.getElementById('exercise-list');
            exerciseList.innerHTML = '';
			
            exercises.forEach((exercise, index) => {
                const { name, reps, sets = 3, weight, time, weightUnit = 'lbs', timeUnit = 'sec', 
                        category, progression, oneRepMax, amrap } = exercise;
                const exerciseElement = document.createElement('li');
                exerciseElement.dataset.index = index;
                
                const exerciseInfo = document.createElement('div');
                
                const nameElement = document.createElement('div');
                let displayName = name;
                if (category) {
                    const categoryBadge = category === 'compound' ? '🏋️' : 
                                         category === 'core' ? '💪' : 
                                         category === 'cardio' ? '🏃' : '💡';
                    displayName = `${categoryBadge} ${name}`;
                }
                if (amrap) displayName += ' (AMRAP)';
                nameElement.textContent = displayName;
                
                const detailsElement = document.createElement('div');
                const timeDisplay = timeUnit === 'min' ? `${time || '-'} min` : `${time || '-'} sec`;
                const weightDisplay = weightUnit === 'kg' ? `${weight || '-'} kg` : `${weight || '-'} lbs`;
                
                let detailsText = `${sets}x${reps || '-'}`;
                if (weight) detailsText += `, ${weightDisplay}`;
                if (time) detailsText += `, ${timeDisplay}`;
                if (oneRepMax) detailsText += ` (1RM: ${oneRepMax}${weightUnit})`;
                if (progression && progression.enabled) {
                    detailsText += ` 📈+${progression.increment}${weightUnit}`;
                }
                
                detailsElement.textContent = detailsText;
                
                exerciseInfo.appendChild(nameElement);
                exerciseInfo.appendChild(detailsElement);
                exerciseElement.appendChild(exerciseInfo);
                
                const buttonContainer = document.createElement('div');
                
                const deleteButton = document.createElement('button');
                deleteButton.textContent = '❌';
                deleteButton.title = 'Delete';
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();  // Prevent event from bubbling up
                    const confirmDelete = confirm('Are you sure you want to delete this exercise?');
                    if (confirmDelete) {
                        const routines = WorkoutUtils.getRoutines();
                        const routine = routines[selectedRoutine] || { exercises: [] };
                        const exercises = routine.exercises || [];
                        
                        exercises.splice(index, 1);
                        routine.exercises = exercises;
                        routines[selectedRoutine] = routine;
                        WorkoutUtils.saveRoutines(routines);
                        displayExercises();
                        clearForm();
                    }
                });
                
                
                buttonContainer.appendChild(deleteButton);
                exerciseElement.appendChild(buttonContainer);
                
                exerciseElement.addEventListener('click', () => {
                    editExercise(index);
                });
                
                exerciseList.appendChild(exerciseElement);
            });
        }



        function addExercise() {
            const exerciseName = document.getElementById('exercise-name').value.trim();
            if (exerciseName === '') {
                alert('Please enter an exercise name.');
                return;
            }

            // Basic fields
            const sets = document.getElementById('sets').value || 3;
            const reps = document.getElementById('reps').value;
            const weight = document.getElementById('weight').value;
            const time = document.getElementById('time').value;
            const weightUnit = document.getElementById('weight-unit').value;
            const timeUnit = document.getElementById('time-unit').value;

            // Advanced fields
            const oneRepMax = document.getElementById('oneRepMax').value ? parseFloat(document.getElementById('oneRepMax').value) : null;
            const trainingMaxPercent = document.getElementById('trainingMaxPercent').value || 90;
            const progressionEnabled = document.getElementById('progressionEnabled').checked;
            const progressionIncrement = parseFloat(document.getElementById('progressionIncrement').value) || 5;
            const category = document.getElementById('category').value;
            const amrap = document.getElementById('amrap').checked;
            const rpe = document.getElementById('rpe').value ? parseInt(document.getElementById('rpe').value) : null;
            const restTime = parseInt(document.getElementById('restTime').value) || 90;

            // Calculate training max if 1RM is provided
            const trainingMax = oneRepMax ? WorkoutUtils.calculateTrainingMax(oneRepMax, trainingMaxPercent) : null;

            const routines = WorkoutUtils.getRoutines();
            const routine = routines[selectedRoutine] || { exercises: [] };
            const exercises = routine.exercises || [];

            const newExercise = {
                id: `ex-${Date.now()}`,
                name: exerciseName,
                sets: parseInt(sets),
                reps,
                weight,
                weightUnit,
                time,
                timeUnit,
                oneRepMax,
                trainingMax,
                trainingMaxPercent: parseInt(trainingMaxPercent),
                progression: {
                    enabled: progressionEnabled,
                    type: 'linear',
                    increment: progressionIncrement,
                    lastUpdated: null
                },
                percentageBased: {
                    enabled: false,
                    percentage: 75,
                    autoCalculate: false
                },
                category,
                amrap,
                rpe,
                restTime
            };

            exercises.push(newExercise);
            routine.exercises = exercises;
            routines[selectedRoutine] = routine;
            WorkoutUtils.saveRoutines(routines);

            // Update exercise library if 1RM is provided
            if (oneRepMax) {
                WorkoutUtils.updateExercise1RM(exerciseName, oneRepMax);
            }

            displayExercises();
            clearForm();
        }

        function clearForm() {
            // Basic fields
            document.getElementById('exercise-name').value = '';
            document.getElementById('sets').value = '3';
            document.getElementById('reps').value = '';
            document.getElementById('weight').value = '';
            document.getElementById('time').value = '';
            
            // Advanced fields
            document.getElementById('oneRepMax').value = '';
            document.getElementById('trainingMaxPercent').value = '90';
            document.getElementById('progressionEnabled').checked = false;
            document.getElementById('progressionIncrement').value = '5';
            document.getElementById('category').value = 'accessory';
            document.getElementById('amrap').checked = false;
            document.getElementById('rpe').value = '';
            document.getElementById('restTime').value = '90';
            
            // Advanced section handling removed - no styling
            
            // Reset buttons to ADD mode
            const addButton = document.getElementById('add-button');
            const updateButton = document.getElementById('update-button');
            const addCopyButton = document.getElementById('add-copy-button');
            const cancelButton = document.getElementById('cancel-button');
            
            addButton.style.display = 'block';
            updateButton.style.display = 'none';
            addCopyButton.style.display = 'none';
            cancelButton.style.display = 'none';

            // Highlight removal removed - no styling
        }

        function editExercise(index) {
            const routines = WorkoutUtils.getRoutines();
            const routine = routines[selectedRoutine] || { exercises: [] };
            const exercises = routine.exercises || [];
            const exercise = exercises[index];
            
            // Fill basic fields
            document.getElementById('exercise-name').value = exercise.name;
            document.getElementById('sets').value = exercise.sets || 3;
            document.getElementById('reps').value = exercise.reps || '';
            document.getElementById('weight').value = exercise.weight || '';
            document.getElementById('time').value = exercise.time || '';
            document.getElementById('weight-unit').value = exercise.weightUnit || 'lbs';
            document.getElementById('time-unit').value = exercise.timeUnit || 'sec';
            
            // Fill advanced fields
            document.getElementById('oneRepMax').value = exercise.oneRepMax || '';
            document.getElementById('trainingMaxPercent').value = exercise.trainingMaxPercent || 90;
            document.getElementById('progressionEnabled').checked = exercise.progression?.enabled || false;
            document.getElementById('progressionIncrement').value = exercise.progression?.increment || 5;
            document.getElementById('category').value = exercise.category || 'accessory';
            document.getElementById('amrap').checked = exercise.amrap || false;
            document.getElementById('rpe').value = exercise.rpe || '';
            document.getElementById('restTime').value = exercise.restTime || 90;
            
            // Advanced section display removed - no styling
            
            // Show edit mode buttons
            const addButton = document.getElementById('add-button');
            const updateButton = document.getElementById('update-button');
            const addCopyButton = document.getElementById('add-copy-button');
            const cancelButton = document.getElementById('cancel-button');
            
            addButton.style.display = 'none';
            updateButton.style.display = 'block';
            addCopyButton.style.display = 'block';
            cancelButton.style.display = 'block';
            
            // Set up button click handlers
            updateButton.onclick = function() {
                updateExercise(index);
            };
            
            addCopyButton.onclick = function() {
                addExercise();
            };

            cancelButton.onclick = function() {
                clearForm();
            };
            
            // Scroll functionality removed - no styling
        }
        
        function updateExercise(index) {
            const exerciseName = document.getElementById('exercise-name').value.trim();
            if (exerciseName === '') {
                alert('Please enter an exercise name.');
                return;
            }
            
            // Get all form values (same as addExercise)
            const sets = document.getElementById('sets').value || 3;
            const reps = document.getElementById('reps').value;
            const weight = document.getElementById('weight').value;
            const time = document.getElementById('time').value;
            const weightUnit = document.getElementById('weight-unit').value;
            const timeUnit = document.getElementById('time-unit').value;

            const oneRepMax = document.getElementById('oneRepMax').value ? parseFloat(document.getElementById('oneRepMax').value) : null;
            const trainingMaxPercent = document.getElementById('trainingMaxPercent').value || 90;
            const progressionEnabled = document.getElementById('progressionEnabled').checked;
            const progressionIncrement = parseFloat(document.getElementById('progressionIncrement').value) || 5;
            const category = document.getElementById('category').value;
            const amrap = document.getElementById('amrap').checked;
            const rpe = document.getElementById('rpe').value ? parseInt(document.getElementById('rpe').value) : null;
            const restTime = parseInt(document.getElementById('restTime').value) || 90;

            const trainingMax = oneRepMax ? WorkoutUtils.calculateTrainingMax(oneRepMax, trainingMaxPercent) : null;
            
            const routines = WorkoutUtils.getRoutines();
            const routine = routines[selectedRoutine] || { exercises: [] };
            const exercises = routine.exercises || [];
            
            // Keep the existing ID
            const existingId = exercises[index].id || `ex-${Date.now()}`;
            
            exercises[index] = {
                id: existingId,
                name: exerciseName,
                sets: parseInt(sets),
                reps,
                weight,
                weightUnit,
                time,
                timeUnit,
                oneRepMax,
                trainingMax,
                trainingMaxPercent: parseInt(trainingMaxPercent),
                progression: {
                    enabled: progressionEnabled,
                    type: 'linear',
                    increment: progressionIncrement,
                    lastUpdated: exercises[index].progression?.lastUpdated || null
                },
                percentageBased: exercises[index].percentageBased || {
                    enabled: false,
                    percentage: 75,
                    autoCalculate: false
                },
                category,
                amrap,
                rpe,
                restTime
            };
            
            routine.exercises = exercises;
            routines[selectedRoutine] = routine;
            WorkoutUtils.saveRoutines(routines);
            
            // Update exercise library if 1RM is provided
            if (oneRepMax) {
                WorkoutUtils.updateExercise1RM(exerciseName, oneRepMax);
            }
            
            clearForm();
            displayExercises();
        }

        // Clear old format data and ensure clean new format
        function clearOldFormatData() {
            const routines = WorkoutUtils.getRoutines();
            const cleanedRoutines = {};
            
            for (const routineName in routines) {
                const routine = routines[routineName];
                
                // Only keep routines that are in the new format (objects with exercises property)
                if (routine && typeof routine === 'object' && !Array.isArray(routine) && routine.exercises) {
                    cleanedRoutines[routineName] = routine;
                }
                // Skip old format routines (arrays) - they will be lost
            }
            
            // Save the cleaned routines
            WorkoutUtils.saveRoutines(cleanedRoutines);
            console.log('Cleared old format data, kept new format routines:', cleanedRoutines);
        }

        // RPE slider functionality
        function updateRPEValue() {
            const rpeSlider = document.getElementById('rpe');
            const rpeValue = document.getElementById('rpe-value');
            rpeValue.textContent = rpeSlider.value;
        }

        window.onload = function() {
            clearOldFormatData();
            displayExercises();
            // Initialize the cancel button to be hidden
            document.getElementById('cancel-button').style.display = 'none';
            
            // Initialize advanced section as collapsed
            const advancedContent = document.getElementById('advanced-section').querySelector('div');
            advancedContent.classList.remove('expanded');
            
            // Set up RPE slider
            const rpeSlider = document.getElementById('rpe');
            if (rpeSlider) {
                rpeSlider.addEventListener('input', updateRPEValue);
            }
        };
