        // Toggle collapsible sections
        function toggleCollapsible(header) {
            const content = header.nextElementSibling;
            const isCollapsed = header.classList.contains('collapsed');
            
            if (isCollapsed) {
                header.classList.remove('collapsed');
                content.classList.remove('collapsed');
            } else {
                header.classList.add('collapsed');
                content.classList.add('collapsed');
            }
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            // Variables
            let tmPercentage = 90;
            let accessoryTemplate = 'standard';
            let workoutPlan = {};
            let currentWeek = 1;
            let currentDay = 0;
            let userLevel = 1; // Initialize user level
            let amrapResults = {}; // Store AMRAP results for each exercise
            let checkedDays = {}; // Store checked days: {week: {day: true}}

            
            // Rest timer state
            let currentTimer = null;
            let timerInterval = null;
            let restTimeSettings = {
                warmup: 75,
                main: 180,
                accessory: 90
            };

            // Load saved profile from localStorage
            function loadProfile() {
                const profile = RadiantStorage.workout.get531Profile();
                if (profile) {
                    
                    // Restore input values
                    document.getElementById('squat-1rm').value = profile.inputs.squat || '';
                    document.getElementById('bench-1rm').value = profile.inputs.bench || '';
                    document.getElementById('deadlift-1rm').value = profile.inputs.deadlift || '';
                    document.getElementById('ohp-1rm').value = profile.inputs.ohp || '';
                    // Restore TM percentage
                    tmPercentage = profile.tmPercentage || 90;
                    tmOptions.forEach(option => {
                        option.classList.toggle('active', option.dataset.value === tmPercentage.toString());
                    });
                    
                    // Restore accessory template
                    accessoryTemplate = profile.accessoryTemplate || 'standard';
                    accessorySelect.value = accessoryTemplate;
                    updateBbbAccessoryInputsVisibility();
                    
                    // Restore UI state
                    currentWeek = profile.currentWeek || 1;
                    currentDay = profile.currentDay || 0;
                    
                    // Restore user level
                    userLevel = profile.userLevel || 1;
                    updateLevelDisplay();
                    
                    // Restore AMRAP results BEFORE rendering workout plan
                    amrapResults = profile.amrapResults || {};
                    
                    // Restore checked days
                    checkedDays = profile.checkedDays || {};
                    
                    // Restore rest time settings
                    if (profile.restTimeSettings) {
                        restTimeSettings = profile.restTimeSettings;
                        document.getElementById('warmup-rest-time').value = restTimeSettings.warmup;
                        document.getElementById('main-rest-time').value = restTimeSettings.main;
                        document.getElementById('accessory-rest-time').value = restTimeSettings.accessory;
                        updateTimeDisplays();
                    }
                    
                    // Restore workout plan
                    if (profile.workoutPlan) {
                        workoutPlan = profile.workoutPlan;
                        renderWorkoutPlan();
                    }
                    
                    // Update UI to show saved week/day
                    setTimeout(() => {
                        weekTabs.forEach(tab => {
                            tab.classList.toggle('active', tab.dataset.week === currentWeek.toString());
                        });
                        showWeekContent(currentWeek, currentDay);
                    }, 0);
                }
            }

            // Update level display
            function updateLevelDisplay() {
                levelDisplay.textContent = `lvl: ${userLevel}`;
            }

            function updateBbbAccessoryInputsVisibility() {
                const block = document.getElementById('bbb-accessory-inputs');
                if (block) {
                    block.style.display = accessorySelect.value === 'bbb' ? 'block' : 'none';
                }
            }

            // Save profile to localStorage
            function saveProfile() {
                const profile = {
                    inputs: {
                        squat: document.getElementById('squat-1rm').value,
                        bench: document.getElementById('bench-1rm').value,
                        deadlift: document.getElementById('deadlift-1rm').value,
                        ohp: document.getElementById('ohp-1rm').value,
                    },
                    tmPercentage,
                    accessoryTemplate,
                    workoutPlan,
                    currentWeek,
                    currentDay,
                    userLevel, // Save user level
                    amrapResults, // Save AMRAP results
                    restTimeSettings, // Save rest time settings
                    checkedDays // Save checked days
                };
                
                RadiantStorage.workout.save531Profile(profile);
            }

            // Configuration objects
            const daysSetup = [
                { day: 1, main: "ohp", name: "Overhead Press Day" },
                { day: 2, main: "deadlift", name: "Deadlift Day" },
                { day: 3, main: "bench", name: "Bench Press Day" },
                { day: 4, main: "squat", name: "Squat Day" }
            ];

            const weekPercentages = {
                1: [
                    { reps: 5, percentage: 65 },
                    { reps: 5, percentage: 75 },
                    { reps: "5+", percentage: 85, amrap: true }
                ],
                2: [
                    { reps: 3, percentage: 70 },
                    { reps: 3, percentage: 80 },
                    { reps: "3+", percentage: 90, amrap: true }
                ],
                3: [
                    { reps: 5, percentage: 75 },
                    { reps: 3, percentage: 85 },
                    { reps: "1+", percentage: 95, amrap: true }
                ],
                4: [
                    { reps: 5, percentage: 40 },
                    { reps: 5, percentage: 50 },
                    { reps: 5, percentage: 60 }
                ]
            };

            const accessoryExercises = {
                standard: {
                    ohp: {
                        push: ["Dips", "Incline Dumbbell Press", "Pushups", "Dumbbell Press"],
                        pull: ["Chin-ups", "Barbell Rows", "Face Pulls", "Cable Rows"],
                        core: ["Ab Wheel", "Hanging Leg Raises", "Planks", "Russian Twists"]
                    },
                    deadlift: {
                        push: ["Push-ups", "Dumbbell Bench Press", "Dips", "Incline Press"],
                        pull: ["Lat Pulldowns", "Face Pulls", "Dumbbell Rows", "Pull-ups"],
                        legs: ["Bulgarian Split Squats", "Lunges", "Leg Curls", "Step-ups"]
                    },
                    bench: {
                        push: ["Close-grip Bench", "Tricep Extensions", "Dips", "Dumbbell Press"],
                        pull: ["Barbell Rows", "Pull-ups", "Face Pulls", "Cable Rows"],
                        core: ["Russian Twists", "Sit-ups", "Planks", "Ab Wheel"]
                    },
                    squat: {
                        push: ["Shoulder Press", "Push-ups", "Tricep Extensions", "Dips"],
                        pull: ["Cable Rows", "Bicep Curls", "Lat Pulldowns", "Face Pulls"],
                        legs: ["Lunges", "Leg Raises", "Glute Bridges", "Bulgarian Split Squats"]
                    }
                },
                bbb: {
                    ohp: { main: "OHP", secondary: "Bench Press" },
                    deadlift: { main: "Deadlift", secondary: "Squat" },
                    bench: { main: "Bench Press", secondary: "OHP" },
                    squat: { main: "Squat", secondary: "Deadlift" }
                },
                fsl: {
                    ohp: { main: "OHP", accessories: ["Dips", "Rows", "Ab Work"] },
                    deadlift: { main: "Deadlift", accessories: ["Leg Curls", "Pulldowns", "Planks"] },
                    bench: { main: "Bench Press", accessories: ["Triceps", "Pull-ups", "Core"] },
                    squat: { main: "Squat", accessories: ["Lunges", "Rows", "Ab Work"] }
                },
                triumvirate: {
                    ohp: {
                        accessories: [
                            { name: "Dips", sets: 5, reps: "10-15" },
                            { name: "Chin-ups", sets: 5, reps: "10-15" }
                        ]
                    },
                    deadlift: {
                        accessories: [
                            { name: "Hanging Leg Raises", sets: 5, reps: "10-15" },
                            { name: "Good Mornings", sets: 5, reps: "10-15" }
                        ]
                    },
                    bench: {
                        accessories: [
                            { name: "Dumbbell Rows", sets: 5, reps: "10-15" },
                            { name: "Incline Dumbbell Press", sets: 5, reps: "10-15" }
                        ]
                    },
                    squat: {
                        accessories: [
                            { name: "Leg Curls", sets: 5, reps: "10-15" },
                            { name: "Ab Wheel", sets: 5, reps: "10-15" }
                        ]
                    }
                },
                beginners: {
                    ohp: {
                        mainFSL: true,
                        accessories: {
                            push: ["Dips", "Push-ups", "Dumbbell Bench", "Incline Press"],
                            pull: ["Chin-ups", "Barbell Rows", "Face Pulls", "Cable Rows"],
                            legs: ["Ab Wheel", "Hanging Leg Raises", "Planks", "Russian Twists"]
                        }
                    },
                    deadlift: {
                        mainFSL: true,
                        accessories: {
                            push: ["Push-ups", "Dips", "Tricep Extensions", "Dumbbell Press"],
                            pull: ["Pull-ups", "Inverted Rows", "Face Pulls", "Lat Pulldowns"],
                            legs: ["Lunges", "Step-ups", "Ab Work", "Bulgarian Split Squats"]
                        }
                    },
                    bench: {
                        mainFSL: true,
                        accessories: {
                            push: ["Dips", "Incline Press", "Lateral Raises", "Close-grip Bench"],
                            pull: ["Pull-ups", "DB Rows", "Face Pulls", "Barbell Rows"],
                            legs: ["Hanging Leg Raises", "Ab Wheel", "Planks", "Sit-ups"]
                        }
                    },
                    squat: {
                        mainFSL: true,
                        accessories: {
                            push: ["Dips", "Push-ups", "DB Press", "Shoulder Press"],
                            pull: ["Pull-ups", "Barbell Rows", "Face Pulls", "Bicep Curls"],
                            legs: ["Leg Curls", "Back Raises", "Ab Work", "Glute Bridges"]
                        }
                    }
                }
            };

            // DOM elements
            const generateButton = document.getElementById('generate-button');
            const printButton = document.getElementById('print-button');
            const weekTabs = document.querySelectorAll('.week-tab');
            const mainTabs = document.querySelectorAll('.main-tab');
            const inputSection = document.querySelector('.input-section');
            const resultSection = document.querySelector('.result-section');
            const tmOptions = document.querySelectorAll('.toggle-option');
            const accessorySelect = document.getElementById('accessory-template');
            const levelDisplay = document.getElementById('level-display');
            
            // Main tab switching (for mobile)
            mainTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabType = tab.dataset.tab;
                    mainTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    
                    if (tabType === 'setup') {
                        inputSection.classList.add('active');
                        resultSection.classList.remove('active');
                    } else {
                        inputSection.classList.remove('active');
                        resultSection.classList.add('active');
                    }
                });
            });
            
            // Quiz elements
            const quizButton = document.getElementById('quiz-button');
            const quizModal = document.getElementById('quiz-modal');
            const closeQuiz = document.getElementById('close-quiz');
            const questionText = document.getElementById('question-text');
            const questionContent = document.getElementById('question-content');
            const quizOptions = document.getElementById('quiz-options');
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');
            const prevButton = document.getElementById('prev-question');
            const nextButton = document.getElementById('next-question');
            
            // Quiz data and state
            let currentQuestion = 0;
            let quizAnswers = [];
            
            const quizData = [
                {
                    question: "What's your primary training goal?",
                    options: [
                        { text: "Build muscle mass and size", scores: { bbb: 3, standard: 2, fsl: 1, triumvirate: 1, beginners: 1 } },
                        { text: "Increase strength and power", scores: { fsl: 3, standard: 2, bbb: 1, triumvirate: 2, beginners: 2 } },
                        { text: "General fitness and conditioning", scores: { standard: 3, triumvirate: 2, fsl: 1, bbb: 1, beginners: 2 } },
                        { text: "I'm new to 5/3/1 and need structure", scores: { beginners: 3, standard: 2, fsl: 1, bbb: 1, triumvirate: 1 } }
                    ]
                },
                {
                    question: "How much time do you have for accessory work?",
                    options: [
                        { text: "30+ minutes - I want maximum volume", scores: { bbb: 3, beginners: 2, standard: 2, fsl: 1, triumvirate: 1 } },
                        { text: "20-30 minutes - moderate volume", scores: { standard: 3, fsl: 2, triumvirate: 2, bbb: 1, beginners: 1 } },
                        { text: "15-20 minutes - focused work", scores: { triumvirate: 3, fsl: 2, standard: 1, bbb: 1, beginners: 1 } },
                        { text: "10-15 minutes - minimal but effective", scores: { fsl: 3, triumvirate: 2, standard: 1, bbb: 1, beginners: 1 } }
                    ]
                },
                {
                    question: "What's your experience level with 5/3/1?",
                    options: [
                        { text: "Complete beginner to 5/3/1", scores: { beginners: 3, standard: 2, fsl: 1, bbb: 1, triumvirate: 1 } },
                        { text: "Some experience, still learning", scores: { standard: 3, fsl: 2, beginners: 2, bbb: 1, triumvirate: 1 } },
                        { text: "Intermediate - comfortable with the program", scores: { fsl: 3, bbb: 2, standard: 2, triumvirate: 2, beginners: 1 } },
                        { text: "Advanced - ready for challenging variations", scores: { bbb: 3, fsl: 2, triumvirate: 2, standard: 1, beginners: 1 } }
                    ]
                },
                {
                    question: "How do you prefer to structure your accessory work?",
                    options: [
                        { text: "Same movement as main lift (more volume)", scores: { bbb: 3, fsl: 2, standard: 1, triumvirate: 1, beginners: 1 } },
                        { text: "Related movements at same intensity", scores: { fsl: 3, standard: 2, bbb: 1, triumvirate: 1, beginners: 2 } },
                        { text: "Variety of movements for balance", scores: { standard: 3, triumvirate: 2, fsl: 1, bbb: 1, beginners: 2 } },
                        { text: "Minimal, focused movements", scores: { triumvirate: 3, fsl: 2, standard: 1, bbb: 1, beginners: 1 } }
                    ]
                },
                {
                    question: "What's your recovery capacity?",
                    options: [
                        { text: "Excellent - I recover quickly", scores: { bbb: 3, beginners: 2, standard: 2, fsl: 1, triumvirate: 1 } },
                        { text: "Good - moderate volume works well", scores: { standard: 3, fsl: 2, triumvirate: 2, bbb: 1, beginners: 1 } },
                        { text: "Average - need to manage fatigue", scores: { fsl: 3, triumvirate: 2, standard: 2, bbb: 1, beginners: 1 } },
                        { text: "Limited - prefer lower volume", scores: { triumvirate: 3, fsl: 2, standard: 1, bbb: 1, beginners: 1 } }
                    ]
                }
            ];
            
            // Event listeners
            generateButton.addEventListener('click', () => {
                generateWorkoutPlan();
                saveProfile();
            });
            
            // Add delete profile functionality
            const deleteProfileButton = document.getElementById('delete-profile-button');
            deleteProfileButton.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete your saved workout profile? This cannot be undone.')) {
                    RadiantStorage.remove(RadiantStorage.KEYS.PROFILE_531);
                    // Reset form values
                    document.getElementById('squat-1rm').value = '';
                    document.getElementById('bench-1rm').value = '';
                    document.getElementById('deadlift-1rm').value = '';
                    document.getElementById('ohp-1rm').value = '';
                    // Reset user level
                    userLevel = 1;
                    updateLevelDisplay();
                    // Reset AMRAP results
                    amrapResults = {};
                    // Reset workout plan
                    workoutPlan = {};
                    // Reset UI
                    renderWorkoutPlan();
                    currentWeek = 1;
                    currentDay = 0;
                    weekTabs.forEach(tab => {
                        tab.classList.toggle('active', tab.dataset.week === '1');
                    });
                    showWeekContent(1, 0);
                    alert('Workout profile has been deleted.');
                }
            });
            
            printButton.addEventListener('click', () => { window.print(); });
            
            weekTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    weekTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentWeek = parseInt(tab.dataset.week);
                    showWeekContent(currentWeek, currentDay);
                    resetAllCheckmarks();
                    saveProfile();
                });
            });
            
            tmOptions.forEach(option => {
                option.addEventListener('click', () => {
                    tmOptions.forEach(o => o.classList.remove('active'));
                    option.classList.add('active');
                    tmPercentage = parseInt(option.dataset.value);
                    saveProfile();
                });
            });
            
            accessorySelect.addEventListener('change', () => {
                accessoryTemplate = accessorySelect.value;
                updateBbbAccessoryInputsVisibility();
                
                // If workout plan already exists, regenerate it with new accessory template
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                
                saveProfile();
            });

            // Long press handler for day tabs (mobile)
            let longPressTimer = null;
            let longPressTarget = null;
            let longPressCompleted = false;
            const longPressCompletedElements = new WeakSet();
            
            document.addEventListener('touchstart', function(e) {
                const dayTab = e.target.closest('.day-tab');
                if (dayTab) {
                    longPressTarget = dayTab;
                    longPressCompleted = false;
                    longPressTimer = setTimeout(() => {
                        toggleDayCheckmark(longPressTarget);
                        longPressCompleted = true;
                        longPressCompletedElements.add(longPressTarget);
                        // Temporarily disable pointer events to prevent click
                        longPressTarget.style.pointerEvents = 'none';
                        longPressTimer = null;
                        // Re-enable pointer events and clear flags after click would have fired
                        setTimeout(() => {
                            if (longPressTarget) {
                                longPressTarget.style.pointerEvents = '';
                            }
                            longPressCompleted = false;
                            longPressCompletedElements.delete(longPressTarget);
                        }, 300);
                    }, 500); // 500ms for long press
                }
            });
            
            document.addEventListener('touchend', function(e) {
                const dayTab = e.target.closest('.day-tab');
                // If long press completed, prevent click
                if (dayTab && (longPressCompleted || longPressCompletedElements.has(dayTab))) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return;
                }
                // Cancel long press timer if still running
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                longPressTarget = null;
                longPressCompleted = false;
            });
            
            document.addEventListener('touchmove', function(e) {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                    longPressTarget = null;
                    longPressCompleted = false;
                }
            });
            
            // Add event delegation for day tabs with profile saving
            document.addEventListener('click', function(e) {
                const dayTab = e.target.closest('.day-tab');
                if (dayTab) {
                    // Prevent click if it was triggered by a long press
                    if (longPressCompleted || longPressCompletedElements.has(dayTab)) {
                        return;
                    }
                    const weekContent = dayTab.closest('.week-content');
                    const day = parseInt(dayTab.dataset.day);

                    // Tap active day again to toggle checkmark
                    if (dayTab.classList.contains('active')) {
                        toggleDayCheckmark(dayTab);
                        saveProfile();
                        return;
                    }

                    currentDay = day;
                    showDayContent(weekContent, currentDay);
                    saveProfile();
                }
            });
            
            // Right click handler for day tabs (desktop)
            document.addEventListener('contextmenu', function(e) {
                if (e.target.classList.contains('day-tab')) {
                    e.preventDefault();
                    toggleDayCheckmark(e.target);
                }
            });
            
            // Function to toggle day checkmark
            function toggleDayCheckmark(dayTab) {
                const week = parseInt(dayTab.dataset.week);
                const day = parseInt(dayTab.dataset.day);
                
                // Initialize week object if it doesn't exist
                if (!checkedDays[week]) {
                    checkedDays[week] = {};
                }
                
                // Toggle checkmark
                if (checkedDays[week][day]) {
                    delete checkedDays[week][day];
                    dayTab.classList.remove('checked');
                } else {
                    checkedDays[week][day] = true;
                    dayTab.classList.add('checked');
                }
                
                // Update week checkmark
                updateWeekCheckmark(week);
                
                // Save profile
                saveProfile();
            }
            
            // Function to update week checkmark based on all days being checked
            function updateWeekCheckmark(week) {
                if (!workoutPlan.weeks || !workoutPlan.weeks[week]) {
                    return;
                }
                
                const weekTab = document.querySelector(`.week-tab[data-week="${week}"]`);
                if (!weekTab) {
                    return;
                }
                
                const daysInWeek = workoutPlan.weeks[week].length;
                const checkedCount = checkedDays[week] ? Object.keys(checkedDays[week]).length : 0;
                
                if (checkedCount === daysInWeek && daysInWeek > 0) {
                    weekTab.classList.add('checked');
                    let checkmark = weekTab.querySelector('.checkmark');
                    if (!checkmark) {
                        checkmark = document.createElement('span');
                        checkmark.className = 'checkmark';
                        checkmark.textContent = '✓';
                        weekTab.appendChild(checkmark);
                    }
                } else {
                    weekTab.classList.remove('checked');
                    const checkmark = weekTab.querySelector('.checkmark');
                    if (checkmark) {
                        checkmark.remove();
                    }
                }
            }
            
            // Function to update all week checkmarks
            function updateAllWeekCheckmarks() {
                if (!workoutPlan.weeks) {
                    return;
                }
                
                Object.keys(workoutPlan.weeks).forEach(week => {
                    updateWeekCheckmark(parseInt(week));
                });
            }

            // Load saved profile on page load
            loadProfile();
            
            // Rest Timer Functions
            function formatTime(seconds) {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            
            function playBeep() {
                // Create beep sound using Web Audio API
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    oscillator.frequency.value = 800;
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                    
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.5);
                    
                    // Play second beep after a short delay
                    setTimeout(() => {
                        const oscillator2 = audioContext.createOscillator();
                        const gainNode2 = audioContext.createGain();
                        
                        oscillator2.connect(gainNode2);
                        gainNode2.connect(audioContext.destination);
                        
                        oscillator2.frequency.value = 800;
                        oscillator2.type = 'sine';
                        
                        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
                        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                        
                        oscillator2.start(audioContext.currentTime);
                        oscillator2.stop(audioContext.currentTime + 0.5);
                    }, 200);
                } catch (e) {
                    console.error('Could not play beep sound:', e);
                }
            }
            
            function stopTimer() {
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                if (currentTimer) {
                    const btn = document.querySelector(`[data-timer-id="${currentTimer.id}"]`);
                    if (btn) {
                        btn.classList.remove('active');
                    }
                }
                currentTimer = null;
                const display = document.getElementById('rest-timer-display');
                if (display) {
                    display.style.display = 'none';
                    display.classList.remove('active');
                }
            }
            
            function startTimer(timerId, timerType) {
                // Stop any existing timer
                stopTimer();
                
                // Get rest time based on type
                let restTime = restTimeSettings.main;
                if (timerType === 'warmup') {
                    restTime = restTimeSettings.warmup;
                } else if (timerType === 'accessory') {
                    restTime = restTimeSettings.accessory;
                }
                
                // Find the button
                const btn = document.querySelector(`[data-timer-id="${timerId}"]`);
                if (!btn) return;
                
                // Store current completion count if button already has one
                const existingCount = btn.dataset.completionCount || '0';
                
                // Show clock emoji while timer is active (will restore count when done)
                btn.textContent = '⏰';
                btn.classList.remove('complete');
                btn.classList.add('active');
                currentTimer = { id: timerId, timeLeft: restTime, type: timerType, existingCount: existingCount };
                
                // Show timer display
                const display = document.getElementById('rest-timer-display');
                display.style.display = 'block';
                display.classList.add('active');
                display.textContent = formatTime(restTime);
                
                // Start countdown
                timerInterval = setInterval(() => {
                    if (!currentTimer) {
                        clearInterval(timerInterval);
                        return;
                    }
                    
                    currentTimer.timeLeft--;
                    display.textContent = formatTime(currentTimer.timeLeft);
                    
                    if (currentTimer.timeLeft <= 0) {
                        // Store values before stopTimer() sets currentTimer to null
                        const existingCount = currentTimer.existingCount || '0';
                        const timerBtn = document.querySelector(`[data-timer-id="${currentTimer.id}"]`);
                        
                        stopTimer();
                        
                        if (timerBtn) {
                            // Get completion count (use existing count from when timer started, or current count)
                            let completionCount = parseInt(existingCount || timerBtn.dataset.completionCount || '0');
                            completionCount++;
                            timerBtn.dataset.completionCount = completionCount;
                            
                            // Update button text to show checkmark(s) with count
                            if (completionCount === 1) {
                                timerBtn.textContent = '✓';
                            } else {
                                timerBtn.textContent = `✓${completionCount}`;
                            }
                            timerBtn.classList.remove('active');
                            timerBtn.classList.add('complete');
                        }
                        
                        // Play beep
                        playBeep();
                    }
                }, 1000);
            }
            
            function resetAllCheckmarks() {
                const allButtons = document.querySelectorAll('.rest-timer-btn');
                allButtons.forEach(btn => {
                    // Check if button has checkmark (could be ✓ or ✓2, ✓3, etc.)
                    if (btn.textContent.includes('✓')) {
                        btn.textContent = '⏰';
                        btn.classList.remove('complete');
                        btn.dataset.completionCount = '0';
                    }
                });
            }
            
            function updateTimeDisplays() {
                const warmupDisplay = document.getElementById('warmup-time-display');
                const mainDisplay = document.getElementById('main-time-display');
                const accessoryDisplay = document.getElementById('accessory-time-display');
                
                if (warmupDisplay) {
                    warmupDisplay.textContent = formatTime(restTimeSettings.warmup);
                }
                if (mainDisplay) {
                    mainDisplay.textContent = formatTime(restTimeSettings.main);
                }
                if (accessoryDisplay) {
                    accessoryDisplay.textContent = formatTime(restTimeSettings.accessory);
                }
            }
            
            // Event listeners for rest timer buttons
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('rest-timer-btn')) {
                    const timerId = e.target.dataset.timerId;
                    const timerType = e.target.dataset.timerType;
                    
                    // For accessory workouts, allow restarting even if complete
                    if (timerType === 'accessory' && e.target.textContent.includes('✓')) {
                        // Keep the completion count, just start a new timer
                        // The count will be incremented when this timer completes
                        startTimer(timerId, timerType);
                        return;
                    }
                    
                    // For warmup and main lifts, if button is already a checkmark, don't start timer
                    if (e.target.textContent.includes('✓')) {
                        return;
                    }
                    
                    startTimer(timerId, timerType);
                }
            });
            
            // Event listeners for rest time settings
            const warmupRestInput = document.getElementById('warmup-rest-time');
            const mainRestInput = document.getElementById('main-rest-time');
            const accessoryRestInput = document.getElementById('accessory-rest-time');
            
            if (warmupRestInput) {
                warmupRestInput.addEventListener('input', function() {
                    restTimeSettings.warmup = parseInt(this.value) || 75;
                    updateTimeDisplays();
                    saveProfile();
                });
            }
            
            if (mainRestInput) {
                mainRestInput.addEventListener('input', function() {
                    restTimeSettings.main = parseInt(this.value) || 180;
                    updateTimeDisplays();
                    saveProfile();
                });
            }
            
            if (accessoryRestInput) {
                accessoryRestInput.addEventListener('input', function() {
                    restTimeSettings.accessory = parseInt(this.value) || 90;
                    updateTimeDisplays();
                    saveProfile();
                });
            }
            
            // Initialize time displays
            updateTimeDisplays();
            
            // Helper functions
            function round5(num) {
                return Math.round(num / 5) * 5;
            }
            
            function generateWarmupSets(exerciseTM) {
                return [
                    { reps: 5, weight: round5(exerciseTM * 0.4) },
                    { reps: 5, weight: round5(exerciseTM * 0.5) },
                    { reps: 3, weight: round5(exerciseTM * 0.6) }
                ];
            }
            
            function calculateWorkingWeight(oneRM, tmPercent, weekPercent) {
                const trainingMax = oneRM * (tmPercent / 100);
                return round5(trainingMax * (weekPercent / 100));
            }
            
            // Main function to generate workout plan
            function generateWorkoutPlan() {
                const savedWeek = currentWeek;
                const savedDay = currentDay;
                
                // Get 1RM values
                const squat1RM = parseFloat(document.getElementById('squat-1rm').value) || 0;
                const bench1RM = parseFloat(document.getElementById('bench-1rm').value) || 0;
                const deadlift1RM = parseFloat(document.getElementById('deadlift-1rm').value) || 0;
                const ohp1RM = parseFloat(document.getElementById('ohp-1rm').value) || 0;
                
                if (squat1RM === 0 && bench1RM === 0 && deadlift1RM === 0 && ohp1RM === 0) {
                    alert('Please enter at least one 1RM value.');
                    return;
                }
                
                // Calculate Training Maxes
                const squatTM = squat1RM * (tmPercentage / 100);
                const benchTM = bench1RM * (tmPercentage / 100);
                const deadliftTM = deadlift1RM * (tmPercentage / 100);
                const ohpTM = ohp1RM * (tmPercentage / 100);
                
                // Week percentages
                // Create workout plan structure
                workoutPlan = {
                    weeks: {},
                    trainingMaxes: {
                        squat: round5(squatTM),
                        bench: round5(benchTM),
                        deadlift: round5(deadliftTM),
                        ohp: round5(ohpTM)
                    }
                };
                
                // Generate workout plan for each week
                for (let week = 1; week <= 4; week++) {
                    workoutPlan.weeks[week] = [];
                    
                    daysSetup.forEach(daySetup => {
                        const { day, main, name } = daySetup;
                        const exerciseTM = workoutPlan.trainingMaxes[main];
                        
                        if (exerciseTM === 0) return; // Skip if no 1RM entered
                        
                        const dayPlan = {
                            day,
                            name,
                            mainLift: { 
                                name: main.charAt(0).toUpperCase() + main.slice(1),
                                tm: exerciseTM,
                                warmup: generateWarmupSets(exerciseTM),
                                sets: []
                            },
                            accessories: []
                        };
                        
                        // Add main lift sets based on week percentages
                        weekPercentages[week].forEach(set => {
                            dayPlan.mainLift.sets.push({
                                reps: set.reps,
                                weight: round5(exerciseTM * (set.percentage / 100)),
                                percentage: set.percentage,
                                amrap: set.amrap || false
                            });
                        });
                        
                        // Add accessories based on template
                        if (accessoryTemplate === 'standard') {
                            const exercises = accessoryExercises.standard[main];
                            const accessoryReps = week === 4 ? '10-25 total reps (deload - may skip entirely)' : '25-50 total reps';
                            
                            // Select exercise based on day (0-3 index, cycling through 4 exercises)
                            const exerciseIndex = (day - 1) % 4;
                            
                            dayPlan.accessories = [
                                { type: 'Push', exercise: exercises.push[exerciseIndex], reps: accessoryReps },
                                { type: 'Pull', exercise: exercises.pull[exerciseIndex], reps: accessoryReps },
                                { type: exercises.core ? 'Core' : 'Legs', exercise: (exercises.core || exercises.legs)[exerciseIndex], reps: accessoryReps }
                            ];
                        } else if (accessoryTemplate === 'bbb') {
                            const bbbExercise = accessoryExercises.bbb[main];
                            const bbbWeight = round5(exerciseTM * 0.5); // 50% TM for BBB
                            
                            // Reduce BBB volume during deload week
                            const bbbSets = week === 4 ? '3 sets of 10 reps (deload - may skip entirely)' : '5 sets of 10 reps';
                            const isPressingDay = (main === 'ohp' || main === 'bench');
                            const deload = week === 4;
                            
                            const bbbBase = {
                                type: 'Boring But Big',
                                exercise: bbbExercise.main,
                                sets: bbbSets,
                                weight: bbbWeight
                            };
                            
                            if (isPressingDay) {
                                const chinSets = deload ? '3 sets × 10 reps (deload)' : '5 sets × 10 reps';
                                dayPlan.accessories = [
                                    bbbBase,
                                    { type: 'Chinups', exercise: 'Chin-ups', sets: chinSets,
                                      note: 'You can substitute Barbell Curl or Shrugs for the lat work' }
                                ];
                            } else {
                                const abSuggestions = [
                                    'Ab Wheel Rollouts', 'Hanging Leg Raises', 'Flutter Kicks', 'Scissor Kicks',
                                    'Standing Bag Kicks', 'Planks', 'Weighted Sit-ups', 'Lying Leg Raises',
                                    'Dragon Flags', 'Russian Twists'
                                ];
                                const abSets = deload ? '10–25 total reps (deload)' : '25–50 total reps';
                                dayPlan.accessories = [
                                    bbbBase,
                                    { type: 'AbWork', sets: abSets, suggestions: abSuggestions }
                                ];
                            }
                        } else if (accessoryTemplate === 'fsl') {
                            // First set last - use first working set weight for 5x5
                            const fslWeight = round5(exerciseTM * (weekPercentages[week][0].percentage / 100));
                            const fslExercises = accessoryExercises.fsl[main];
                            
                            // Reduce FSL volume during deload week
                            const fslSets = week === 4 ? '1-2 sets of 5 reps (deload - may skip entirely)' : '5 sets of 5 reps';
                            const supplementalReps = week === 4 ? 'Optional - consider skipping' : '50-100 total reps';
                            
                            dayPlan.accessories = [
                                {
                                    type: 'First Set Last',
                                    exercise: fslExercises.main,
                                    sets: fslSets,
                                    weight: fslWeight
                                },
                                {
                                    type: 'Supplemental Work',
                                    exercises: fslExercises.accessories,
                                    reps: supplementalReps
                                }
                            ];
                        } else if (accessoryTemplate === 'triumvirate') {
                            const triumvirateExercises = accessoryExercises.triumvirate[main];
                            
                            // Reduce Triumvirate volume during deload week
                            if (week === 4) {
                                // Show only first accessory with reduced sets
                                dayPlan.accessories = [
                                    {
                                        name: triumvirateExercises.accessories[0].name,
                                        sets: '2-3 sets of 10-15 reps (deload - may skip entirely)',
                                        reps: '10-15'
                                    }
                                ];
                            } else {
                                dayPlan.accessories = triumvirateExercises.accessories;
                            }
                        } else if (accessoryTemplate === 'beginners') {
                            // First set last - use first working set weight for 5x5
                            const fslWeight = round5(exerciseTM * (weekPercentages[week][0].percentage / 100));
                            const beginnerExercises = accessoryExercises.beginners[main];
                            
                            dayPlan.fslWeight = fslWeight; // Store for rendering
                            
                            // Reduce Beginners template volume during deload week
                            const accessoryReps = week === 4 ? '25-50 total reps (deload - may skip entirely)' : '50-100 total reps';
                            const fslSets = week === 4 ? 'Skip FSL during deload' : '5 sets of 5 reps';
                            
                            // Select exercise based on day (0-3 index, cycling through 4 exercises)
                            const exerciseIndex = (day - 1) % 4;
                            
                            // Ensure the accessories property has properly structured data
                            try {
                                dayPlan.accessories = [
                                    {
                                        type: 'First Set Last',
                                        exercise: main.charAt(0).toUpperCase() + main.slice(1),
                                        sets: fslSets,
                                        weight: fslWeight
                                    },
                                    {
                                        type: 'Push',
                                        exercise: (beginnerExercises.accessories.push || ['Push exercises'])[exerciseIndex],
                                        reps: accessoryReps
                                    },
                                    {
                                        type: 'Pull',
                                        exercise: (beginnerExercises.accessories.pull || ['Pull exercises'])[exerciseIndex],
                                        reps: accessoryReps
                                    },
                                    {
                                        type: 'Legs/Core',
                                        exercise: (beginnerExercises.accessories.legs || ['Legs/Core exercises'])[exerciseIndex],
                                        reps: accessoryReps
                                    }
                                ];
                            } catch (error) {
                                // Fallback if there's any issue with the data structure
                                console.error('Error setting up accessories for beginners template:', error);
                                dayPlan.accessories = [
                                    { type: 'First Set Last', exercise: main.charAt(0).toUpperCase() + main.slice(1), sets: fslSets, weight: fslWeight },
                                    { type: 'Push', exercise: 'Push exercises', reps: accessoryReps },
                                    { type: 'Pull', exercise: 'Pull exercises', reps: accessoryReps },
                                    { type: 'Legs/Core', exercise: 'Legs/Core exercises', reps: accessoryReps }
                                ];
                            }
                        }
                        
                        workoutPlan.weeks[week].push(dayPlan);
                    });
                }
                
                // Render workout plan
                renderWorkoutPlan();
                
                // Restore the UI state if we had a previous workout plan, otherwise show week 1
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    setTimeout(() => {
                        weekTabs.forEach(tab => {
                            tab.classList.toggle('active', tab.dataset.week === savedWeek.toString());
                        });
                        currentWeek = savedWeek;
                        showWeekContent(savedWeek, savedDay);
                    }, 0);
                } else {
                    // Show week 1 by default for new workout plans
                    currentWeek = 1;
                    currentDay = 0;
                    showWeekContent(1, 0);
                }
            }
            
            // Function to safely join an array or return a default string
            function safeJoin(arr, separator, defaultText) {
                if (Array.isArray(arr) && arr.length > 0) {
                    return arr.join(separator);
                }
                return defaultText || 'Not specified';
            }
            
            // Check if all AMRAP sets have been logged
            function areAllAmrapSetsLogged() {
                // Get the exercises that have 1RM values (are being used)
                const exercises = [];
                if (parseFloat(document.getElementById('squat-1rm').value) > 0) exercises.push('squat');
                if (parseFloat(document.getElementById('bench-1rm').value) > 0) exercises.push('bench');
                if (parseFloat(document.getElementById('deadlift-1rm').value) > 0) exercises.push('deadlift');
                if (parseFloat(document.getElementById('ohp-1rm').value) > 0) exercises.push('ohp');
                
                // Check if all exercises have logged AMRAP results
                return exercises.every(exercise => amrapResults[exercise] && amrapResults[exercise].reps !== undefined);
            }
            
            // Generate level up buttons with validation
            function generateLevelUpButtons() {
                const allLogged = areAllAmrapSetsLogged();
                const missingExercises = [];
                
                // Find which exercises are missing AMRAP logs
                ['squat', 'bench', 'deadlift', 'ohp'].forEach(exercise => {
                    const has1RM = parseFloat(document.getElementById(`${exercise}-1rm`).value) > 0;
                    const hasLogged = amrapResults[exercise] && amrapResults[exercise].reps !== undefined;
                    if (has1RM && !hasLogged) {
                        missingExercises.push(exercise.toUpperCase());
                    }
                });
                
                let html = '';
                
                if (allLogged) {
                    html += '<button id="level-up-button" class="level-up-button" style="width: 100%; margin-top: 1rem;">LEVEL UP! (Complete Cycle & Increase Weights)</button>';
                } else {
                    html += '<button id="level-up-button" class="level-up-button" disabled style="opacity: 0.5; cursor: not-allowed; width: 100%; margin-top: 1rem;">LEVEL UP! (Log Week 3 AMRAP Sets First)</button>';
                    html += `<div class="notes" style="margin-top: 1rem; background-color: #fff3e1; border-left-color: #ff9800;">
                        <p><strong>⚠️ Cannot Level Up Yet</strong></p>
                        <p>Please log your Week 3 AMRAP performance for: <strong>${missingExercises.join(', ')}</strong></p>
                        <p>Go to Week 3, complete your 1+ sets, and log your results to unlock progression.</p>
                    </div>`;
                }
                
                return html;
            }
            
            // Function to render workout plan
            function renderWorkoutPlan() {
                const resultsContainer = document.getElementById('workout-results');
                
                if (!workoutPlan.weeks || Object.keys(workoutPlan.weeks).length === 0) {
                    resultsContainer.innerHTML = '<p>Enter your 1-rep max values and click "Generate Workout Plan" to create your personalized 5/3/1 program.</p>';
                    return;
                }
                
                let html = '';
                
                // Create HTML for each week
                for (let week = 1; week <= 4; week++) {
                    let weekName = '';
                    switch(week) {
                        case 1: weekName = '5/5/5+'; break;
                        case 2: weekName = '3/3/3+'; break;
                        case 3: weekName = '5/3/1+'; break;
                        case 4: weekName = 'Deload'; break;
                    }
                    
                    html += `<div class="week-content ${week === 1 ? 'active' : ''}" data-week="${week}">`;
                    html += `<h3>Week ${week} (${weekName})</h3>`;
                    
                    if (workoutPlan.weeks[week].length === 0) {
                        html += '<p>Please enter at least one 1RM value to generate workout days.</p>';
                    } else {
                        // Add day tabs
                        html += '<div class="day-tabs">';
                        workoutPlan.weeks[week].forEach((day, dayIndex) => {
                            const isChecked = checkedDays[week] && checkedDays[week][dayIndex];
                            html += `<div class="day-tab ${dayIndex === 0 ? 'active' : ''} ${isChecked ? 'checked' : ''}" data-week="${week}" data-day="${dayIndex}">Day ${day.day}<span class="checkmark">✓</span></div>`;
                        });
                        html += '</div>';
                        html += '<p class="day-checkmark-hint">💡 tap active day again or right-click day buttons to mark as complete</p>';
                        
                        // Add day content container
                        html += '<div class="day-contents">';
                        workoutPlan.weeks[week].forEach((day, dayIndex) => {
                            const isLastDayOfCycle = (week === 4 && dayIndex === workoutPlan.weeks[week].length - 1);
                            
                            html += `
                            <div class="day-content ${dayIndex === 0 ? 'active' : ''}" data-day="${dayIndex}">
                                <div class="day-card">
                                    <div class="day-header">Day ${day.day}: ${day.name}</div>
                                    
                                    <div class="warm-up-section">
                                        <h4>Warm-up Sets</h4>
                                        <table class="warm-up-table">
                                            <tr>
                                                <td>5 reps × ${day.mainLift.warmup[0].weight} lbs (40%) <button class="rest-timer-btn" data-timer-type="warmup" data-timer-id="warmup-${week}-${dayIndex}-0" title="Start rest timer">⏰</button></td>
                                                <td>5 reps × ${day.mainLift.warmup[1].weight} lbs (50%) <button class="rest-timer-btn" data-timer-type="warmup" data-timer-id="warmup-${week}-${dayIndex}-1" title="Start rest timer">⏰</button></td>
                                                <td>3 reps × ${day.mainLift.warmup[2].weight} lbs (60%) <button class="rest-timer-btn" data-timer-type="warmup" data-timer-id="warmup-${week}-${dayIndex}-2" title="Start rest timer">⏰</button></td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <h4>Main Lift: ${day.mainLift.name}</h4>
                                    <table class="exercise-table">
                                        <thead>
                                            <tr>
                                                <th>Set</th>
                                                <th>Weight (lbs)</th>
                                                <th>Reps</th>
                                                <th>% of TM</th>
                                                <th>Rest</th>
                                            </tr>
                                        </thead>
                                        <tbody>`;
                            
                            day.mainLift.sets.forEach((set, index) => {
                                html += `
                                    <tr>
                                        <td>Set ${index + 1}</td>
                                        <td>${set.weight}</td>
                                        <td class="${set.amrap ? 'amrap-set' : ''}">${set.reps}${set.amrap ? ' (AMRAP)' : ''}</td>
                                        <td>${set.percentage}%</td>
                                        <td><button class="rest-timer-btn" data-timer-type="main" data-timer-id="main-${week}-${dayIndex}-${index}" title="Start rest timer">⏰</button></td>
                                    </tr>`;
                            });
                            
                            html += `
                                        </tbody>
                                    </table>`;
                            
                            // Add AMRAP logging section for Week 3 only
                            if (week === 3) {
                                const exerciseName = day.mainLift.name.toLowerCase();
                                const amrapData = amrapResults[exerciseName] || {};
                                const hasLogged = amrapData.reps !== undefined;
                                
                                html += `
                                    <div class="amrap-logging">
                                        <h4>📊 Log Your AMRAP Performance (Wendler Philosophy)</h4>
                                        <p style="margin-bottom: 1rem; font-size: 0.95rem;">
                                            Your performance on this 1+ set determines your progression for the next cycle.
                                        </p>`;
                                
                                if (hasLogged) {
                                    html += `
                                        <div class="amrap-status logged">
                                            <strong>✓ Logged:</strong> ${amrapData.reps} reps completed | 
                                            <strong>Decision:</strong> ${amrapData.decision}
                                        </div>
                                        <button id="amrap-undo-${exerciseName}" class="amrap-submit-btn" style="background-color: var(--accent);">
                                            Undo Decision
                                        </button>`;
                                } else {
                                    html += `
                                        <div class="amrap-input-group">
                                            <label for="amrap-reps-${exerciseName}">Reps completed on 1+ set:</label>
                                            <input type="number" id="amrap-reps-${exerciseName}" min="0" max="20" placeholder="0">
                                        </div>
                                        
                                        <div id="amrap-recommendations-${exerciseName}" class="amrap-recommendations" style="display: none;">
                                            <!-- Options will be populated by JavaScript -->
                                        </div>
                                        
                                        <button id="amrap-submit-${exerciseName}" class="amrap-submit-btn" style="display: none;">
                                            Apply Progression Decision
                                        </button>`;
                                }
                                
                                html += `
                                    </div>`;
                            }
                            
                            html += `
                                    <div class="accessory-section">
                                        <h4>Accessory Work</h4>`;
                            
                            if (accessoryTemplate === 'standard') {
                                html += `<ul class="accessory-list">`;
                                day.accessories.forEach((accessory, accIndex) => {
                                    html += `
                                        <li>
                                            <span><strong>${accessory.type}:</strong> ${accessory.exercise}</span>
                                            <span>${accessory.reps} <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex}" title="Start rest timer">⏰</button></span>
                                        </li>`;
                                });
                                html += `</ul>`;
                            } else if (accessoryTemplate === 'bbb') {
                                html += `<ul class="accessory-list">`;
                                day.accessories.forEach((acc, accIndex) => {
                                    if (acc.type === 'Boring But Big') {
                                        html += `
                                    <li>
                                        <span><strong>${acc.type}:</strong> ${acc.exercise}</span>
                                        <span>${acc.sets} @ ${acc.weight} lbs <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex}" title="Start rest timer">⏰</button></span>
                                    </li>`;
                                    } else if (acc.type === 'Chinups') {
                                        html += `
                                    <li>
                                        <span><strong>${acc.exercise}:</strong> ${acc.sets} (bodyweight)</span>
                                        <span><button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex}" title="Start rest timer">⏰</button></span>
                                    </li>
                                    <li style="list-style:none; padding-left:0; margin-top:0.25rem;">
                                        <span style="font-size:0.9rem; color:#555;"><em>${acc.note}</em></span>
                                    </li>`;
                                    } else if (acc.type === 'AbWork') {
                                        html += `
                                    <li>
                                        <span><strong>Ab Work:</strong> ${acc.sets}</span>
                                        <span><button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex}" title="Start rest timer">⏰</button></span>
                                    </li>
                                    <li style="list-style:none; padding-left:0; margin-top:0.25rem;">
                                        <span style="font-size:0.9rem; color:#555;"><em>Suggestions:</em> ${acc.suggestions.join(', ')}</span>
                                    </li>`;
                                    }
                                });
                                html += `</ul>`;
                            } else if (accessoryTemplate === 'fsl') {
                                html += `<ul class="accessory-list">
                                    <li>
                                        <span><strong>${day.accessories[0].type}:</strong> ${day.accessories[0].exercise}</span>
                                        <span>${day.accessories[0].sets} @ ${day.accessories[0].weight} lbs <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-0" title="Start rest timer">⏰</button></span>
                                    </li>
                                    <li>
                                        <span><strong>${day.accessories[1].type}:</strong> ${safeJoin(day.accessories[1].exercises, ', ')}</span>
                                        <span>${day.accessories[1].reps} <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-1" title="Start rest timer">⏰</button></span>
                                    </li>
                                </ul>`;
                            } else if (accessoryTemplate === 'triumvirate') {
                                html += `<ul class="accessory-list">`;
                                day.accessories.forEach((accessory, accIndex) => {
                                    html += `
                                        <li>
                                            <span><strong>${accessory.name}</strong></span>
                                            <span>${accessory.sets} sets of ${accessory.reps} reps <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex}" title="Start rest timer">⏰</button></span>
                                        </li>`;
                                });
                                html += `</ul>`;
                            } else if (accessoryTemplate === 'beginners') {
                                html += `<ul class="accessory-list">`;
                                
                                // Handle FSL work
                                const fslAccessory = day.accessories.find(acc => acc.type === 'First Set Last');
                                let accIndex = 0;
                                if (fslAccessory) {
                                    html += `
                                        <li>
                                            <span><strong>First Set Last:</strong> ${fslAccessory.exercise}</span>
                                            <span>${fslAccessory.sets}${fslAccessory.weight ? ' @ ' + fslAccessory.weight + ' lbs' : ''} <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex++}" title="Start rest timer">⏰</button></span>
                                        </li>`;
                                }
                                
                                // Handle other accessories
                                const otherAccessories = day.accessories.filter(acc => acc.type !== 'First Set Last');
                                otherAccessories.forEach(accessory => {
                                    html += `
                                        <li>
                                            <span><strong>${accessory.type}:</strong> ${accessory.exercise}</span>
                                            <span>${accessory.reps} <button class="rest-timer-btn" data-timer-type="accessory" data-timer-id="accessory-${week}-${dayIndex}-${accIndex++}" title="Start rest timer">⏰</button></span>
                                        </li>`;
                                });
                                
                                html += `</ul>`;
                            }
                            
                            html += `
                                    </div>
                                    
                                    <div class="collapsible-wrapper">
                                        <div class="collapsible-header collapsed" onclick="toggleCollapsible(this)">
                                            <strong>Notes</strong>
                                            <span class="collapsible-toggle">▼</span>
                                        </div>
                                        <div class="collapsible-content collapsed">
                                            <ul style="list-style: none; padding-left: 0; margin: 0.5rem 0;">
                                                <li>AMRAP = As Many Reps As Possible (with good form)</li>
                                                <li>Rest 2-3 minutes between main lift sets</li>
                                                <li>Rest 60-90 seconds between accessory sets</li>
                                                <li>Accessory work should be done at 70-80% RPE (Rate of Perceived Exertion)</li>
                                                <li>Leave 2-3 reps in reserve on accessory sets - focus on quality over max weight</li>
                                                <li>Increase weight only when you can complete all reps with good form</li>
                                            </ul>
                                        </div>
                                    </div>
                                    
                                    ${isLastDayOfCycle ? generateLevelUpButtons() : ''}
                                </div>
                            </div>`;
                        });
                        html += '</div>'; // Close day-contents
                    }
                    
                    html += '</div>'; // Close week-content
                }
                
                resultsContainer.innerHTML = html;
                
                // Update week checkmarks after rendering
                updateAllWeekCheckmarks();
                
                // Add event listeners for level up button
                const levelUpButton = document.getElementById('level-up-button');
                if (levelUpButton) {
                    levelUpButton.addEventListener('click', levelUp);
                }
                
                // Add event listeners for AMRAP logging
                setupAmrapListeners();
            }
            
            // Function to show specific week content
            function showWeekContent(weekNum, dayIndex) {
                document.querySelectorAll('.week-content').forEach(content => {
                    content.classList.toggle('active', content.dataset.week === weekNum.toString());
                });

                const activeWeek = document.querySelector(`.week-content[data-week="${weekNum}"]`);
                if (!activeWeek) return;

                const dayCount = activeWeek.querySelectorAll('.day-tab').length;
                if (dayCount === 0) return;

                const day = dayIndex !== undefined
                    ? Math.min(Math.max(0, dayIndex), dayCount - 1)
                    : Math.min(currentDay, dayCount - 1);
                currentDay = day;
                showDayContent(activeWeek, currentDay);
            }
            
            // Function to show specific day content
            function showDayContent(weekElement, dayIndex) {
                const dayTabs = weekElement.querySelectorAll('.day-tab');
                const dayContents = weekElement.querySelectorAll('.day-content');
                
                dayTabs.forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.day === dayIndex.toString());
                });
                
                dayContents.forEach(content => {
                    content.classList.toggle('active', content.dataset.day === dayIndex.toString());
                });
            }

            // Add explanation functionality for accessory templates
            const accessoryTemplateSelect = document.getElementById('accessory-template');
            const accessoryExplanation = document.getElementById('accessory-explanation');
            
            // Template explanations
            const explanations = {
                'standard': 'The Standard template focuses on balanced development with 25-50 reps each of pushing, pulling, and core exercises. This provides a well-rounded approach to assistance work that complements the main lifts without excessive fatigue.',
                
                'bbb': 'Boring But Big (BBB) adds 5×10 at ~50% of your training max after the main lift. Pressing days include chin-ups and barbell curl; squat and deadlift days include ab work (pick from the suggestions). Enter a curl working weight when using this template.',
                
                'fsl': 'First Set Last (FSL) uses the weight from your first work set (the 5 reps set) for 5 additional sets of 5 reps. This provides additional volume at a moderate intensity, helping to build strength and reinforce technique without excessive fatigue.',
                
                'triumvirate': 'The Triumvirate template prescribes two assistance exercises per main lift, each performed for 5 sets of 10-15 reps. This focused approach targets specific muscle groups that support your main lifts, providing balanced development with moderate volume.',
                
                'beginners': '5/3/1 for Beginners combines FSL work (5 sets of 5 reps at your first set weight) with specific push, pull, and single-leg/core accessories (50 reps each). This template is designed to build a foundation of strength and work capacity for those new to the program.'
            };
            
            // Function to update the explanation based on selected template
            function updateExplanation() {
                const selectedTemplate = accessoryTemplateSelect.value;
                accessoryExplanation.textContent = explanations[selectedTemplate] || '';
            }
            
            // Set initial explanation
            updateExplanation();
            
            // Update explanation when template changes
            accessoryTemplateSelect.addEventListener('change', updateExplanation);
            
            // Quiz functionality
            function showQuiz() {
                quizModal.style.display = 'flex';
                currentQuestion = 0;
                quizAnswers = [];
                displayQuestion();
            }
            
            function hideQuiz() {
                quizModal.style.display = 'none';
            }
            
            function displayQuestion() {
                const question = quizData[currentQuestion];
                questionText.textContent = `Question ${currentQuestion + 1} of ${quizData.length}`;
                questionContent.textContent = question.question;
                
                // Clear previous options
                quizOptions.innerHTML = '';
                
                // Add new options
                question.options.forEach((option, index) => {
                    const optionElement = document.createElement('div');
                    optionElement.className = 'quiz-option';
                    optionElement.textContent = option.text;
                    optionElement.dataset.index = index;
                    
                    // Check if this option was previously selected
                    if (quizAnswers[currentQuestion] === index) {
                        optionElement.classList.add('selected');
                    }
                    
                    optionElement.addEventListener('click', () => {
                        // Remove selection from other options
                        quizOptions.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
                        // Add selection to clicked option
                        optionElement.classList.add('selected');
                        // Store answer
                        quizAnswers[currentQuestion] = index;
                        // Enable next button
                        nextButton.disabled = false;
                    });
                    
                    quizOptions.appendChild(optionElement);
                });
                
                // Update progress
                const progress = ((currentQuestion + 1) / quizData.length) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${currentQuestion + 1}/${quizData.length}`;
                
                // Update navigation buttons
                prevButton.disabled = currentQuestion === 0;
                nextButton.disabled = quizAnswers[currentQuestion] === undefined;
                
                // Update next button text
                if (currentQuestion === quizData.length - 1) {
                    nextButton.textContent = 'Get My Recommendation';
                } else {
                    nextButton.textContent = 'Next';
                }
            }
            
            function calculateRecommendation() {
                const scores = { standard: 0, bbb: 0, fsl: 0, triumvirate: 0, beginners: 0 };
                
                // Calculate total scores
                quizAnswers.forEach((answerIndex, questionIndex) => {
                    const option = quizData[questionIndex].options[answerIndex];
                    Object.keys(scores).forEach(template => {
                        scores[template] += option.scores[template];
                    });
                });
                
                // Find the template with the highest score
                const recommendation = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
                
                return recommendation;
            }
            
            function showRecommendation() {
                const recommendation = calculateRecommendation();
                const templateNames = {
                    standard: 'Standard Template',
                    bbb: 'Boring But Big (BBB)',
                    fsl: 'First Set Last (FSL)',
                    triumvirate: 'Triumvirate',
                    beginners: '5/3/1 for Beginners'
                };
                
                // Update the select dropdown
                accessorySelect.value = recommendation;
                accessoryTemplate = recommendation;
                
                // Update explanation
                updateExplanation();
                updateBbbAccessoryInputsVisibility();
                
                // If workout plan exists, regenerate it
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                
                // Save profile
                saveProfile();
                
                // Hide quiz
                hideQuiz();
                
                // Show success message
                alert(`Based on your answers, we recommend the ${templateNames[recommendation]}! Your workout plan has been updated.`);
            }
            
            // Quiz event listeners
            quizButton.addEventListener('click', showQuiz);
            closeQuiz.addEventListener('click', hideQuiz);
            
            // Close quiz when clicking outside
            quizModal.addEventListener('click', (e) => {
                if (e.target === quizModal) {
                    hideQuiz();
                }
            });
            
            prevButton.addEventListener('click', () => {
                if (currentQuestion > 0) {
                    currentQuestion--;
                    displayQuestion();
                }
            });
            
            nextButton.addEventListener('click', () => {
                if (currentQuestion < quizData.length - 1) {
                    currentQuestion++;
                    displayQuestion();
                } else {
                    showRecommendation();
                }
            });

            // Setup AMRAP logging event listeners
            function setupAmrapListeners() {
                const exercises = ['squat', 'bench', 'deadlift', 'ohp'];
                
                exercises.forEach(exercise => {
                    const repsInput = document.getElementById(`amrap-reps-${exercise}`);
                    if (repsInput) {
                        repsInput.addEventListener('input', () => {
                            const reps = parseInt(repsInput.value);
                            if (reps >= 0) {
                                showAmrapOptions(exercise, reps);
                            } else {
                                hideAmrapOptions(exercise);
                            }
                        });
                    }
                    
                    // Setup undo button if it exists
                    const undoBtn = document.getElementById(`amrap-undo-${exercise}`);
                    if (undoBtn) {
                        undoBtn.addEventListener('click', () => {
                            undoAmrapDecision(exercise);
                        });
                    }
                });
            }
            
            // Show AMRAP progression options based on reps
            function showAmrapOptions(exercise, reps) {
                const recommendationsDiv = document.getElementById(`amrap-recommendations-${exercise}`);
                const submitBtn = document.getElementById(`amrap-submit-${exercise}`);
                
                if (!recommendationsDiv || !submitBtn) return;
                
                let optionsHtml = '<p style="margin-bottom: 0.75rem; font-weight: 600;">Choose your progression:</p>';
                
                if (reps >= 5) {
                    // 5+ reps: Earned the increase
                    const isUpperBody = exercise === 'bench' || exercise === 'ohp';
                    const increase = isUpperBody ? 5 : 10;
                    
                    optionsHtml += `
                        <div class="amrap-option recommended" onclick="selectAmrapOption('${exercise}', 'earned', ${increase})">
                            <input type="radio" name="amrap-${exercise}" value="earned">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    ✅ Earned Increase (+${increase} lbs)
                                    <span class="recommendation-badge badge-recommended">RECOMMENDED</span>
                                </div>
                                <div class="amrap-option-description">
                                    Perfect! Your TM is set correctly. Add ${increase} lbs for next cycle.
                                </div>
                            </div>
                        </div>`;
                } else if (reps >= 2 && reps <= 4) {
                    // 2-4 reps: Warning zone
                    const isUpperBody = exercise === 'bench' || exercise === 'ohp';
                    const increase = isUpperBody ? 5 : 10;
                    
                    optionsHtml += `
                        <div class="amrap-option warning" onclick="selectAmrapOption('${exercise}', 'smart', 0)">
                            <input type="radio" name="amrap-${exercise}" value="smart">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    🟡 Smart: Keep Same Weight (0 lbs)
                                    <span class="recommendation-badge badge-recommended">RECOMMENDED</span>
                                </div>
                                <div class="amrap-option-description">
                                    Your TM is getting heavy. Repeat the cycle with the same weight and beat your reps.
                                </div>
                            </div>
                        </div>
                        <div class="amrap-option warning" onclick="selectAmrapOption('${exercise}', 'aggressive', ${increase})">
                            <input type="radio" name="amrap-${exercise}" value="aggressive">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    ⚡ Aggressive: Add Weight (+${increase} lbs)
                                    <span class="recommendation-badge badge-warning">RISKY</span>
                                </div>
                                <div class="amrap-option-description">
                                    Warning: Next cycle will be very difficult. Only choose if you're confident.
                                </div>
                            </div>
                        </div>`;
                } else if (reps >= 0 && reps <= 1) {
                    // 0-1 rep: Failed - must decrease
                    optionsHtml += `
                        <div class="amrap-option danger" onclick="selectAmrapOption('${exercise}', 'decrease', -10)">
                            <input type="radio" name="amrap-${exercise}" value="decrease">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    🔴 Decrease TM (-10%)
                                    <span class="recommendation-badge badge-danger">REQUIRED</span>
                                </div>
                                <div class="amrap-option-description">
                                    Your TM is too high. You must lower it by 10% before starting the next cycle.
                                </div>
                            </div>
                        </div>`;
                }
                
                recommendationsDiv.innerHTML = optionsHtml;
                recommendationsDiv.style.display = 'block';
                // No need to show submit button - decision applies automatically
                submitBtn.style.display = 'none';
            }
            
            // Hide AMRAP options
            function hideAmrapOptions(exercise) {
                const recommendationsDiv = document.getElementById(`amrap-recommendations-${exercise}`);
                const submitBtn = document.getElementById(`amrap-submit-${exercise}`);
                
                if (recommendationsDiv) recommendationsDiv.style.display = 'none';
                if (submitBtn) submitBtn.style.display = 'none';
            }
            
            // Global variable to track selected option
            let selectedAmrapOptions = {};
            
            // Select AMRAP option
            function selectAmrapOption(exercise, decision, weightChange) {
                selectedAmrapOptions[exercise] = { decision, weightChange };
                
                // Update UI to show selection
                const recommendationsDiv = document.getElementById(`amrap-recommendations-${exercise}`);
                if (recommendationsDiv) {
                    const allOptions = recommendationsDiv.querySelectorAll('.amrap-option');
                    allOptions.forEach(opt => opt.classList.remove('selected'));
                    
                    const selectedOption = Array.from(allOptions).find(opt => 
                        opt.querySelector(`input[value="${decision}"]`)
                    );
                    if (selectedOption) {
                        selectedOption.classList.add('selected');
                        selectedOption.querySelector('input').checked = true;
                    }
                }
                
                // Automatically apply the decision when radio button is selected
                applyAmrapDecision(exercise);
            }
            
            // Make selectAmrapOption globally available
            window.selectAmrapOption = selectAmrapOption;
            
            // Undo AMRAP decision
            function undoAmrapDecision(exercise) {
                const amrapData = amrapResults[exercise];
                
                if (!amrapData || amrapData.original1RM === undefined) {
                    alert('No AMRAP decision to undo.');
                    return;
                }
                
                // Confirm undo
                if (!confirm(`Undo AMRAP decision for ${exercise.toUpperCase()}?\n\nThis will restore the original 1RM value and clear your logged performance.`)) {
                    return;
                }
                
                // Restore original 1RM
                const inputId = `${exercise}-1rm`;
                document.getElementById(inputId).value = amrapData.original1RM;
                
                // Clear the AMRAP result
                delete amrapResults[exercise];
                
                // Save profile
                saveProfile();
                
                // Update the UI to show the input form again
                updateAmrapUI(exercise);
                
                // Update level up button status if we're on Week 4
                updateLevelUpButtonStatus();
            }
            
            // Apply AMRAP decision
            function applyAmrapDecision(exercise) {
                const repsInput = document.getElementById(`amrap-reps-${exercise}`);
                const selectedOption = selectedAmrapOptions[exercise];
                
                if (!repsInput || !selectedOption) return;
                
                const reps = parseInt(repsInput.value);
                const { decision, weightChange } = selectedOption;
                
                // Get current 1RM
                const inputId = `${exercise}-1rm`;
                let current1RM = parseFloat(document.getElementById(inputId).value) || 0;
                
                // Calculate new 1RM based on decision
                let new1RM;
                if (decision === 'decrease') {
                    // Decrease by 10%
                    new1RM = Math.round(current1RM * 0.9);
                } else {
                    // Add the weight change
                    new1RM = current1RM + weightChange;
                }
                
                // Update the 1RM input
                document.getElementById(inputId).value = new1RM;
                
                // Store the AMRAP result
                const decisionText = decision === 'earned' ? `Earned +${weightChange}lbs` :
                                    decision === 'smart' ? 'Keep same weight (Smart)' :
                                    decision === 'aggressive' ? `Add +${weightChange}lbs (Aggressive)` :
                                    'Decrease TM by 10%';
                
                amrapResults[exercise] = {
                    reps: reps,
                    decision: decisionText,
                    weightChange: new1RM - current1RM,
                    original1RM: current1RM // Store original for undo
                };
                
                // Save profile
                saveProfile();
                
                // Update the UI to show the logged status
                updateAmrapUI(exercise);
                
                // Update level up button status if we're on Week 4
                updateLevelUpButtonStatus();
            }
            
            // Update level up button status
            function updateLevelUpButtonStatus() {
                const levelUpButton = document.getElementById('level-up-button');
                if (!levelUpButton) return; // Button not visible (not on Week 4 last day)
                
                const allLogged = areAllAmrapSetsLogged();
                const missingExercises = [];
                
                // Find which exercises are missing AMRAP logs
                ['squat', 'bench', 'deadlift', 'ohp'].forEach(exercise => {
                    const has1RM = parseFloat(document.getElementById(`${exercise}-1rm`).value) > 0;
                    const hasLogged = amrapResults[exercise] && amrapResults[exercise].reps !== undefined;
                    if (has1RM && !hasLogged) {
                        missingExercises.push(exercise.toUpperCase());
                    }
                });
                
                // Find the warning message div (next sibling)
                let warningDiv = levelUpButton.nextElementSibling;
                if (warningDiv && !warningDiv.classList.contains('notes')) {
                    warningDiv = null;
                }
                
                if (allLogged) {
                    // Enable button
                    levelUpButton.disabled = false;
                    levelUpButton.style.opacity = '1';
                    levelUpButton.style.cursor = 'pointer';
                    levelUpButton.textContent = 'LEVEL UP! (Complete Cycle & Increase Weights)';
                    
                    // Remove warning message if it exists
                    if (warningDiv && warningDiv.querySelector('strong')?.textContent === '⚠️ Cannot Level Up Yet') {
                        warningDiv.remove();
                    }
                } else {
                    // Disable button
                    levelUpButton.disabled = true;
                    levelUpButton.style.opacity = '0.5';
                    levelUpButton.style.cursor = 'not-allowed';
                    levelUpButton.textContent = 'LEVEL UP! (Log Week 3 AMRAP Sets First)';
                    
                    // Add or update warning message
                    if (!warningDiv || !warningDiv.querySelector('strong')?.textContent.includes('Cannot Level Up Yet')) {
                        const newWarning = document.createElement('div');
                        newWarning.className = 'notes';
                        newWarning.style.marginTop = '1rem';
                        newWarning.style.backgroundColor = '#fff3e1';
                        newWarning.style.borderLeftColor = '#ff9800';
                        newWarning.innerHTML = `
                            <p><strong>⚠️ Cannot Level Up Yet</strong></p>
                            <p>Please log your Week 3 AMRAP performance for: <strong>${missingExercises.join(', ')}</strong></p>
                            <p>Go to Week 3, complete your 1+ sets, and log your results to unlock progression.</p>
                        `;
                        levelUpButton.parentElement.appendChild(newWarning);
                    } else if (warningDiv) {
                        // Update existing warning with current missing exercises
                        warningDiv.innerHTML = `
                            <p><strong>⚠️ Cannot Level Up Yet</strong></p>
                            <p>Please log your Week 3 AMRAP performance for: <strong>${missingExercises.join(', ')}</strong></p>
                            <p>Go to Week 3, complete your 1+ sets, and log your results to unlock progression.</p>
                        `;
                    }
                }
            }
            
            // Update AMRAP UI for a specific exercise
            function updateAmrapUI(exercise) {
                const amrapData = amrapResults[exercise] || {};
                const hasLogged = amrapData.reps !== undefined;
                
                // Find the amrap-logging container directly by class and exercise name pattern
                const allAmrapContainers = document.querySelectorAll('.amrap-logging');
                let amrapContainer = null;
                
                // Find the container that has elements with this exercise name in their IDs
                for (let container of allAmrapContainers) {
                    const inputField = container.querySelector(`#amrap-reps-${exercise}`);
                    const undoBtn = container.querySelector(`#amrap-undo-${exercise}`);
                    const submitBtn = container.querySelector(`#amrap-submit-${exercise}`);
                    
                    if (inputField || undoBtn || submitBtn) {
                        amrapContainer = container;
                        break;
                    }
                }
                
                if (!amrapContainer) return;
                
                // Build new HTML content
                let html = `
                    <h4>📊 Log Your AMRAP Performance (Wendler Philosophy)</h4>
                    <p style="margin-bottom: 1rem; font-size: 0.95rem;">
                        Your performance on this 1+ set determines your progression for the next cycle.
                    </p>`;
                
                if (hasLogged) {
                    html += `
                        <div class="amrap-status logged">
                            <strong>✓ Logged:</strong> ${amrapData.reps} reps completed | 
                            <strong>Decision:</strong> ${amrapData.decision}
                        </div>
                        <button id="amrap-undo-${exercise}" class="amrap-submit-btn" style="background-color: var(--accent);">
                            Undo Decision
                        </button>`;
                } else {
                    html += `
                        <div class="amrap-input-group">
                            <label for="amrap-reps-${exercise}">Reps completed on 1+ set:</label>
                            <input type="number" id="amrap-reps-${exercise}" min="0" max="20" placeholder="0">
                        </div>
                        
                        <div id="amrap-recommendations-${exercise}" class="amrap-recommendations" style="display: none;">
                            <!-- Options will be populated by JavaScript -->
                        </div>
                        
                        <button id="amrap-submit-${exercise}" class="amrap-submit-btn" style="display: none;">
                            Apply Progression Decision
                        </button>`;
                }
                
                // Update the container HTML
                amrapContainer.innerHTML = html;
                
                // Re-attach event listeners for this specific exercise
                const repsInput = document.getElementById(`amrap-reps-${exercise}`);
                if (repsInput) {
                    repsInput.addEventListener('input', () => {
                        const reps = parseInt(repsInput.value);
                        if (reps >= 0) {
                            showAmrapOptions(exercise, reps);
                        } else {
                            hideAmrapOptions(exercise);
                        }
                    });
                }
                
                // Setup undo button if it exists
                const undoBtn = document.getElementById(`amrap-undo-${exercise}`);
                if (undoBtn) {
                    undoBtn.addEventListener('click', () => {
                        undoAmrapDecision(exercise);
                    });
                }
            }
            
            // Function to level up (increase weights)
            function levelUp() {
                // Check if all AMRAP sets have been logged
                if (!areAllAmrapSetsLogged()) {
                    alert('Please log your Week 3 AMRAP performance for all exercises before leveling up.\n\nGo to Week 3, complete your 1+ sets, and log your results.');
                    return;
                }
                
                // Get current 1RM values (these may have been modified by AMRAP logging)
                let squat1RM = parseFloat(document.getElementById('squat-1rm').value) || 0;
                let bench1RM = parseFloat(document.getElementById('bench-1rm').value) || 0;
                let deadlift1RM = parseFloat(document.getElementById('deadlift-1rm').value) || 0;
                let ohp1RM = parseFloat(document.getElementById('ohp-1rm').value) || 0;
                
                // Check if any AMRAP results were logged - if not, use standard progression
                const hasAmrapResults = Object.keys(amrapResults).some(key => amrapResults[key].reps !== undefined);
                
                if (!hasAmrapResults) {
                    // Standard progression: Increase upper body lifts by 5lbs, lower body by 10lbs
                    if (bench1RM > 0) bench1RM += 5;
                    if (ohp1RM > 0) ohp1RM += 5;
                    if (squat1RM > 0) squat1RM += 10;
                    if (deadlift1RM > 0) deadlift1RM += 10;
                    
                    // Update input fields
                    document.getElementById('squat-1rm').value = squat1RM;
                    document.getElementById('bench-1rm').value = bench1RM;
                    document.getElementById('deadlift-1rm').value = deadlift1RM;
                    document.getElementById('ohp-1rm').value = ohp1RM;
                }
                // If AMRAP results exist, the 1RM values have already been updated
                
                
                // Increase user level
                userLevel++;
                updateLevelDisplay();
                
                // Clear AMRAP results for the new cycle
                amrapResults = {};
                
                // Clear all checkmarks
                checkedDays = {};

                // Reset to week 1 before generating new plan
                currentWeek = 1;
                currentDay = 0;
                
                // Generate new workout plan
                generateWorkoutPlan();
                
                // Update week tabs UI
                weekTabs.forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.week === '1');
                });
                
                // Save profile
                saveProfile();
                
                // Show success message
                alert(`Congratulations! You've leveled up to Level ${userLevel}! Your lift weights have been ${hasAmrapResults ? 'updated based on your AMRAP performance' : 'increased'} and a new cycle has been generated.`);
            }
        });
