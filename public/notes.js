        // Daily Notes functionality
        let currentSelectedDate = new Date();
        let currentCalendarDate = new Date();

        // Migration function to convert old dailyNotes_* keys to new structure
        function migrateDailyNotes() {
            const dailyNotes = {};
            const oldKeys = [];
            
            // Check for old format keys
            for (const key of RadiantStorage.listKeys()) {
                if (key && key.startsWith('dailyNotes_')) {
                    const dateKey = key.replace('dailyNotes_', '');
                    const notes = RadiantStorage.getRaw(key);
                    dailyNotes[dateKey] = notes;
                    oldKeys.push(key);
                }
            }
            
            // If we found old data, ask user for confirmation
            if (oldKeys.length > 0) {
                const confirmMessage = `Found ${oldKeys.length} old format daily notes entries.\n\n` +
                    `Would you like to migrate them to the new format?\n\n` +
                    `This will:\n` +
                    `• Convert individual date entries to a single dailyNotes object\n` +
                    `• Remove the old format entries\n` +
                    `• Preserve all your existing notes data\n\n` +
                    `Click OK to migrate, or Cancel to keep the old format.`;
                
                if (confirm(confirmMessage)) {
                    // User confirmed migration
                    RadiantStorage.notes.saveDailyNotes(dailyNotes);

                    oldKeys.forEach(key => {
                        RadiantStorage.remove(key);
                    });
                    
                    // Show success message
                    alert(`Migration completed successfully!\n\nMigrated ${oldKeys.length} daily notes entries to the new format.`);
                    console.log(`Daily notes migrated successfully. Migrated ${oldKeys.length} entries.`);
                } else {
                    // User cancelled migration
                    console.log('Migration cancelled by user. Old format notes will remain.');
                }
            }
        }

        // Initialize the page
        document.addEventListener('DOMContentLoaded', function() {
            // Run migration first
            migrateDailyNotes();
            
            // Set up header using centralized menu system
            setupHeader('Daily Notes');
            loadNotesForDate(currentSelectedDate);
            updateDateDisplay();
            generateCalendar(); // Generate calendar on page load
            
            // Check URL hash to activate specific tab
            const hash = window.location.hash;
            if (hash === '#sleep') {
                // Activate sleep tab programmatically
                switchTab('sleep');
            }
        });

        // Tab switching functionality
        function switchTab(tabName) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Remove active class from all tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Show selected tab content
            document.getElementById(tabName + 'Tab').classList.add('active');
            
            // Add active class to the corresponding tab button
            // Try to use event.target if available (from click), otherwise find button by onclick attribute
            let targetButton = null;
            if (event && event.target) {
                targetButton = event.target;
            } else {
                targetButton = document.querySelector(`button[onclick="switchTab('${tabName}')"]`);
            }
            if (targetButton) {
                targetButton.classList.add('active');
            }
            
            // If switching to calendar tab, regenerate calendar
            if (tabName === 'calendar') {
                generateCalendar();
            }
        }

        function updateDateDisplay() {
            const dateDisplay = document.getElementById('currentDateDisplay');
            dateDisplay.innerHTML = `<h3>${currentSelectedDate.toDateString()}</h3>`;
            updateEditMode();
        }

        function isToday(date) {
            const today = new Date();
            return date.toDateString() === today.toDateString();
        }

        function updateEditMode() {
            const textarea = document.getElementById('notesTextarea');
            const saveBtn = document.querySelector('button[onclick="saveNotes()"]');
            const clearBtn = document.querySelector('button[onclick="clearNotes()"]');
            const saveSleepBtn = document.querySelector('button[onclick="saveSleepData()"]');
            const sleepForm = document.getElementById('sleepForm');
            
            const isEditable = isToday(currentSelectedDate);
            
            if (isEditable) {
                // Enable editing for notes
                textarea.disabled = false;
                textarea.classList.remove('read-only');
                textarea.placeholder = "Write your daily notes here...";
                saveBtn.disabled = false;
                saveBtn.classList.remove('disabled');
                clearBtn.disabled = false;
                clearBtn.classList.remove('disabled');
                // Enable editing for sleep
                saveSleepBtn.disabled = false;
                saveSleepBtn.classList.remove('disabled');
                sleepForm.querySelectorAll('input').forEach(input => input.disabled = false);

            } else {
                // Disable editing for notes
                textarea.disabled = true;
                textarea.classList.add('read-only');
                textarea.placeholder = "Read-only: You can only edit notes for today's date";
                saveBtn.disabled = true;
                saveBtn.classList.add('disabled');
                clearBtn.disabled = true;
                clearBtn.classList.add('disabled');
                // Disable editing for sleep
                saveSleepBtn.disabled = true;
                saveSleepBtn.classList.add('disabled');
                sleepForm.querySelectorAll('input').forEach(input => input.disabled = true);
            }
        }

        function getDateKey(date) {
            return date.toISOString().split('T')[0];
        }

        function loadNotesForDate(date) {
            const dateKey = getDateKey(date);
            let savedNotes = '';
            
            // First try new format
            const dailyNotesData = RadiantStorage.getRaw(RadiantStorage.KEYS.DAILY_NOTES);
            if (dailyNotesData) {
                try {
                    const dailyNotes = JSON.parse(dailyNotesData);
                    savedNotes = dailyNotes[dateKey] || '';
                } catch (e) {
                    console.error('Error parsing daily notes data:', e);
                }
            }
            
            
            document.getElementById('notesTextarea').value = savedNotes;
            updateDailySummary(date);
            loadSleepDataForDate(date);
        }

        function loadSleepDataForDate(date) {
            const dateKey = getDateKey(date);
            const sleepData = RadiantStorage.notes.getSleep();
            const todayData = sleepData[dateKey] || {};

            document.getElementById('sleepHours').value = todayData.sleepHours || '';
            document.getElementById('timeInBed').value = todayData.timeInBed || '';
            document.getElementById('wakeUpTime').value = todayData.wakeUpTime || '';

            const rating = todayData.sleepRating;
            if (rating) {
                const ratingInput = document.querySelector(`input[name="sleepRating"][value="${rating}"]`);
                if (ratingInput) {
                    ratingInput.checked = true;
                }
            } else {
                // Uncheck all radio buttons if no rating
                document.querySelectorAll('input[name="sleepRating"]').forEach(radio => radio.checked = false);
            }
            
            // Auto-calculate sleep duration when loading data
            calculateSleepDuration();
        }

        function updateDailySummary(date) {
            const dateKey = getDateKey(date);
            
            // Get food data from foodLog (lowercase)
            const foodLog = RadiantStorage.getRaw(RadiantStorage.KEYS.FOOD_LOG);
            const foodSummary = document.getElementById('foodSummary');
            
            if (foodLog) {
                try {
                    const foodData = JSON.parse(foodLog);
                    const dayData = foodData[dateKey];
                    
                    if (dayData && Array.isArray(dayData)) {
                        // Calculate totals from food items array
                        let totalCalories = 0;
                        let totalProtein = 0;
                        let totalCarbs = 0;
                        let totalFat = 0;
                        
                        dayData.forEach(item => {
                            totalCalories += parseFloat(item.calories) || 0;
                            totalProtein += parseFloat(item.protein) || 0;
                            totalCarbs += parseFloat(item.carbs) || 0;
                            totalFat += parseFloat(item.fat) || 0;
                        });
                        
                        foodSummary.textContent = `${Math.round(totalCalories)} cal | ${Math.round(totalProtein)}g protein | ${Math.round(totalCarbs)}g carbs | ${Math.round(totalFat)}g fat`;
                    } else {
                        foodSummary.textContent = 'No data';
                    }
                } catch (e) {
                    foodSummary.textContent = 'Data error';
                }
            } else {
                foodSummary.textContent = 'No data';
            }
            
            // Get sleep data from sleep
            const sleepData = RadiantStorage.getRaw(RadiantStorage.KEYS.SLEEP);
            const sleepSummary = document.getElementById('sleepSummary');
            
            if (sleepData) {
                try {
                    const sleep = JSON.parse(sleepData);
                    const dayData = sleep[dateKey];
                    
                    if (dayData) {
                        const rating = dayData.sleepRating;
                        const hours = dayData.sleepHours;
                        
                        if (rating) {
                            const ratingText = getSleepRatingText(rating);
                            sleepSummary.textContent = ratingText;
                            if (hours) {
                                sleepSummary.textContent += ` (${hours} hrs)`;
                            }
                        } else if (hours) {
                            sleepSummary.textContent = `${hours} hrs`;
                        } else {
                            sleepSummary.textContent = 'No data';
                        }
                    } else {
                        sleepSummary.textContent = 'No data';
                    }
                } catch (e) {
                    sleepSummary.textContent = 'Data error';
                }
            } else {
                sleepSummary.textContent = 'No data';
            }
        }

        function getSleepRatingText(rating) {
            const ratingMap = {
                '1': 'Ugh X(',
                '2': 'eh :(',
                '3': 'meh',
                '4': 'Good-nuf',
                '5': 'between goodnuf and excellent',
                '6': 'Excellent',
                '7': 'Dreambaby'
            };
            return `${rating}: ${ratingMap[rating] || 'Unknown'}`;
        }

        function calculateSleepDuration() {
            const timeInBed = document.getElementById('timeInBed').value;
            const wakeUpTime = document.getElementById('wakeUpTime').value;
            const sleepHoursInput = document.getElementById('sleepHours');
            const slider = document.getElementById('sleepDurationSlider');
            const sliderValue = document.getElementById('sliderValue');
            const maxDuration = document.getElementById('maxDuration');
            
            if (timeInBed && wakeUpTime) {
                // Convert time strings to Date objects for the same day
                const bedTime = new Date(`2000-01-01T${timeInBed}`);
                const wakeTime = new Date(`2000-01-01T${wakeUpTime}`);
                
                // If wake time is earlier than bed time, assume it's the next day
                if (wakeTime <= bedTime) {
                    wakeTime.setDate(wakeTime.getDate() + 1);
                }
                
                // Calculate difference in hours
                const diffMs = wakeTime - bedTime;
                const diffHours = diffMs / (1000 * 60 * 60);
                
                // Round to nearest 0.5 hour
                const roundedHours = Math.round(diffHours * 2) / 2;
                
                // Update the input and slider
                sleepHoursInput.value = roundedHours;
                slider.value = roundedHours;
                slider.max = roundedHours;
                sliderValue.textContent = roundedHours + 'h';
                maxDuration.textContent = roundedHours + 'h';
            } else {
                sleepHoursInput.value = '';
                slider.value = 0;
                slider.max = 24;
                sliderValue.textContent = '0h';
                maxDuration.textContent = '24h';
            }
        }

        function updateSleepDurationFromSlider() {
            const slider = document.getElementById('sleepDurationSlider');
            const sleepHoursInput = document.getElementById('sleepHours');
            const sliderValue = document.getElementById('sliderValue');
            
            const value = parseFloat(slider.value);
            sleepHoursInput.value = value;
            sliderValue.textContent = value + 'h';
        }

        function updateSleepDurationFromInput() {
            const sleepHoursInput = document.getElementById('sleepHours');
            const slider = document.getElementById('sleepDurationSlider');
            const sliderValue = document.getElementById('sliderValue');
            
            const value = parseFloat(sleepHoursInput.value);
            if (value <= parseFloat(slider.max)) {
                slider.value = value;
                sliderValue.textContent = value + 'h';
            } else {
                // If input exceeds max, reset to max
                sleepHoursInput.value = slider.max;
                slider.value = slider.max;
                sliderValue.textContent = slider.max + 'h';
            }
        }

        function saveSleepData() {
            if (!isToday(currentSelectedDate)) {
                alert('You can only edit sleep data for today\'s date.');
                return;
            }

            const dateKey = getDateKey(currentSelectedDate);
            const sleepData = RadiantStorage.notes.getSleep();

            if (!sleepData[dateKey]) {
                sleepData[dateKey] = {};
            }

            sleepData[dateKey].sleepHours = document.getElementById('sleepHours').value;
            sleepData[dateKey].timeInBed = document.getElementById('timeInBed').value;
            sleepData[dateKey].wakeUpTime = document.getElementById('wakeUpTime').value;
            
            const selectedRating = document.querySelector('input[name="sleepRating"]:checked');
            if (selectedRating) {
                sleepData[dateKey].sleepRating = selectedRating.value;
            }

            RadiantStorage.notes.saveSleep(sleepData);

            if (event && event.target) {
                const saveBtn = event.target;
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!';
                saveBtn.style.backgroundColor = '#543';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.backgroundColor = '';
                }, 1000);
            }
            updateDailySummary(currentSelectedDate);
        }

        function saveNotes() {
            // Only allow saving for today's date
            if (!isToday(currentSelectedDate)) {
                alert('You can only edit notes for today\'s date.');
                return;
            }
            
            const dateKey = getDateKey(currentSelectedDate);
            const notes = document.getElementById('notesTextarea').value;
            
            // Get existing daily notes data or create new object
            let dailyNotes = {};
            const dailyNotesData = RadiantStorage.getRaw(RadiantStorage.KEYS.DAILY_NOTES);
            if (dailyNotesData) {
                try {
                    dailyNotes = JSON.parse(dailyNotesData);
                } catch (e) {
                    console.error('Error parsing daily notes data:', e);
                    dailyNotes = {};
                }
            }
            
            // Update the notes for the current date
            dailyNotes[dateKey] = notes;
            
            // Save back to localStorage
            RadiantStorage.notes.saveDailyNotes(dailyNotes); 
            
            
            // Show save confirmation (only if called from user interaction)
            if (event && event.target) {
                const saveBtn = event.target;
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!';
                saveBtn.style.backgroundColor = '#543';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                    saveBtn.style.backgroundColor = '';
                }, 1000);
            }
        }

        function clearNotes() {
            // Only allow clearing for today's date
            if (!isToday(currentSelectedDate)) {
                alert('You can only edit notes for today\'s date.');
                return;
            }
            
            if (confirm('Are you sure you want to clear all notes for today?')) {
                document.getElementById('notesTextarea').value = '';
                saveNotes();
            }
        }


        function generateCalendar() {
            const calendarGrid = document.getElementById('calendarGrid');
            const monthYear = document.getElementById('calendarMonthYear');
            
            // Update month/year display
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            monthYear.textContent = `${monthNames[currentCalendarDate.getMonth()]} ${currentCalendarDate.getFullYear()}`;
            
            // Clear previous calendar
            calendarGrid.innerHTML = '';
            
            // Get first day of month and number of days
            const firstDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
            const lastDay = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
            const daysInMonth = lastDay.getDate();
            const startingDayOfWeek = firstDay.getDay();
            
            // Add empty cells for days before the first day of the month
            for (let i = 0; i < startingDayOfWeek; i++) {
                const emptyDay = document.createElement('div');
                emptyDay.className = 'calendar-day';
                calendarGrid.appendChild(emptyDay);
            }
            
            // Add days of the month
            for (let day = 1; day <= daysInMonth; day++) {
                const dayElement = document.createElement('div');
                dayElement.className = 'calendar-day';
                
                const dayDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), day);
                const dateKey = getDateKey(dayDate);
                
                // Get notes from new structure first, then fall back to old format
                let savedNotes = '';
                const dailyNotesData = RadiantStorage.getRaw(RadiantStorage.KEYS.DAILY_NOTES);
                if (dailyNotesData) {
                    try {
                        const dailyNotes = JSON.parse(dailyNotesData);
                        savedNotes = dailyNotes[dateKey] || '';
                    } catch (e) {
                        console.error('Error parsing daily notes data:', e);
                    }
                }
                
                
                // Check if it's today
                const today = new Date();
                if (dayDate.toDateString() === today.toDateString()) {
                    dayElement.classList.add('today');
                }
                
                // Check if it has notes
                if (savedNotes && savedNotes.trim()) {
                    dayElement.classList.add('has-notes');
                }
                
                dayElement.innerHTML = `
                    <div class="day-number">${day}</div>
                    <div class="day-preview">${savedNotes ? savedNotes.substring(0, 20) + '...' : ''}</div>
                `;
                
                dayElement.onclick = () => selectDate(dayDate);
                calendarGrid.appendChild(dayElement);
            }
        }

        function selectDate(date) {
            currentSelectedDate = new Date(date);
            loadNotesForDate(currentSelectedDate);
            updateDateDisplay();
            
            // Switch to Daily Notes tab when a date is selected
            switchToNotesTab();
        }

        function switchToNotesTab() {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Remove active class from all tab buttons
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Show Daily Notes tab
            document.getElementById('notesTab').classList.add('active');
            document.querySelector('button[onclick="switchTab(\'notes\')"]').classList.add('active');
        }

        function previousMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            generateCalendar();
        }

        function nextMonth() {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            generateCalendar();
        }

        function getAvailableYears() {
            const years = new Set();
            
            // Check daily notes (new structure)
            const dailyNotesData = RadiantStorage.getRaw(RadiantStorage.KEYS.DAILY_NOTES);
            if (dailyNotesData) {
                try {
                    const dailyNotes = JSON.parse(dailyNotesData);
                    for (const dateKey in dailyNotes) {
                        const year = parseInt(dateKey.split('-')[0]);
                        if (!isNaN(year)) years.add(year);
                    }
                } catch (e) {
                    console.error('Error parsing daily notes data:', e);
                }
            }
            

            
            // Check foodLog data (lowercase)
            const foodLog = RadiantStorage.getRaw(RadiantStorage.KEYS.FOOD_LOG);
            if (foodLog) {
                try {
                    const foodData = JSON.parse(foodLog);
                    // Scan through food data to find years
                    for (const dateKey in foodData) {
                        const year = parseInt(dateKey.split('-')[0]);
                        if (!isNaN(year)) years.add(year);
                    }
                } catch (e) {
                    console.log('Error parsing foodLog data');
                }
            }
            
            // Check sleep data
            const sleepData = RadiantStorage.getRaw(RadiantStorage.KEYS.SLEEP);
            if (sleepData) {
                try {
                    const sleep = JSON.parse(sleepData);
                    // Scan through sleep data to find years
                    for (const dateKey in sleep) {
                        const year = parseInt(dateKey.split('-')[0]);
                        if (!isNaN(year)) years.add(year);
                    }
                } catch (e) {
                    console.log('Error parsing sleep data');
                }
            }
            
            // If no data found, include current year
            if (years.size === 0) {
                years.add(new Date().getFullYear());
            }
            
            return Array.from(years).sort();
        }

        function openDatePicker() {
            const dialog = document.getElementById('datePickerDialog');
            const monthSelect = document.getElementById('datePickerMonth');
            const yearSelect = document.getElementById('datePickerYear');
            
            // Get available years
            const availableYears = getAvailableYears();
            
            // Populate year dropdown
            yearSelect.innerHTML = '';
            availableYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelect.appendChild(option);
            });
            
            // Set current values
            monthSelect.value = currentCalendarDate.getMonth();
            yearSelect.value = currentCalendarDate.getFullYear();
            
            // Show dialog
            dialog.style.display = 'flex';
        }

        function closeDatePicker() {
            const dialog = document.getElementById('datePickerDialog');
            dialog.style.display = 'none';
        }

        function applyDatePicker() {
            const monthSelect = document.getElementById('datePickerMonth');
            const yearSelect = document.getElementById('datePickerYear');
            
            const selectedMonth = parseInt(monthSelect.value);
            const selectedYear = parseInt(yearSelect.value);
            
            // Update calendar date
            currentCalendarDate.setFullYear(selectedYear, selectedMonth);
            generateCalendar();
            closeDatePicker();
        }

        function previousDay() {
            const previousDate = new Date(currentSelectedDate);
            previousDate.setDate(previousDate.getDate() - 1);
            currentSelectedDate = previousDate;
            loadNotesForDate(currentSelectedDate);
            updateDateDisplay();
        }

        function nextDay() {
            const nextDate = new Date(currentSelectedDate);
            nextDate.setDate(nextDate.getDate() + 1);
            currentSelectedDate = nextDate;
            loadNotesForDate(currentSelectedDate);
            updateDateDisplay();
        }

        function returnToToday() {
            currentSelectedDate = new Date();
            loadNotesForDate(currentSelectedDate);
            updateDateDisplay();
        }

        // Auto-save notes every 30 seconds (only for today's date)
        setInterval(() => {
            if (isToday(currentSelectedDate)) {
                const notes = document.getElementById('notesTextarea').value;
                if (notes.trim()) {
                    saveNotes();
                }
            }
        }, 30000);
