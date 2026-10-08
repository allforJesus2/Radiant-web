	var today;
	var displayFoodItemsGeneration = 0;
	var pendingExpandMealType = null;
	var mealPlanNavIndex = { breakfast: -1, lunch: -1, dinner: -1, snack: -1 };
	var mealPlanNavInit = { breakfast: false, lunch: false, dinner: false, snack: false };

	// Threshold (minutes) used for both deduplication and "recent food" yellow highlight
	const RECENT_FOOD_MINUTES = 60;
	// When changing a food's log time, other items within this many minutes of its original time may be updated together
	const EDIT_TIME_SYNC_WINDOW_MINUTES = 5;

	function getTodayKey() {
		return new Date().toLocaleDateString('en-CA');
	}

	function escapeHtml(s) {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function updateScrollableWindowHeight() {
		var scrollableWindow = document.getElementById('scrollableWindow');
		if (!scrollableWindow) return;
		var firstBtn = document.getElementsByClassName('btn')[0];
		var buttonHeight = firstBtn ? firstBtn.clientHeight * 4 : 0;
		var viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
		scrollableWindow.style.height = (viewportHeight - buttonHeight - 48) + 'px';
	}

	function refreshTodayIfDateChanged() {
		var key = getTodayKey();
		if (key === today) return;
		today = key;
		RadiantStorage.nutrition.setToday(today);
		var foodLog = RadiantStorage.nutrition.getFoodLog();
		displayFoodItems(foodLog[today] || []);
		if (typeof setupHeader === 'function') setupHeader();
	}

	// Function to check if user just completed profile creation flow
	function checkProfileCompletion() {
		if (RadiantStorage.profile.isComplete()) {
			if (!RadiantStorage.nutrition.hasSeenWelcome()) {
				document.getElementById('welcomeMessage').style.display = 'block';
				RadiantStorage.nutrition.markWelcomeSeen();
			}
		}
	}

	// Function to hide welcome message
	function hideWelcomeMessage() {
		document.getElementById('welcomeMessage').style.display = 'none';
	}

var foodInput;
var autocompleteList;

// ---- Unit toggle (grams / oz) ----
var UNIT_GRAMS_PER_OZ = 28.35; // exact conversion
var preferredUnit = 'grams';

function initUnitSelector() {
    preferredUnit = RadiantStorage.nutrition.getPreferredUnit();
    updateUnitToggleButton();
    updateUnitInputPlaceholder();
}

function getPreferredUnit() {
    return preferredUnit;
}

function updateUnitToggleButton() {
    var btn = document.getElementById('unitToggleBtn');
    if (!btn) return;
    btn.textContent = preferredUnit === 'oz' ? 'oz' : 'g';
    btn.title = preferredUnit === 'oz' ? 'Using ounces' : 'Using grams';
    btn.setAttribute(
        'aria-label',
        preferredUnit === 'oz'
            ? 'Unit: ounces. Tap to switch to grams.'
            : 'Unit: grams. Tap to switch to ounces.'
    );
}

/** Convert the current input value to the new unit and update the field. */
function convertInputOnUnitChange(newUnit) {
    var gramsInput = document.querySelector('.grams');
    if (!gramsInput) return;
    var val = parseFloat(gramsInput.value);
    if (isNaN(val) || val <= 0) return; // nothing to convert
    if (newUnit === 'oz') {
        gramsInput.value = (val / UNIT_GRAMS_PER_OZ).toFixed(2);
    } else {
        gramsInput.value = Math.round(val * UNIT_GRAMS_PER_OZ);
    }
}

function setupUnitSelector() {
    var btn = document.getElementById('unitToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', function() {
        var newUnit = preferredUnit === 'oz' ? 'grams' : 'oz';
        convertInputOnUnitChange(newUnit);
        preferredUnit = newUnit;
        RadiantStorage.nutrition.setPreferredUnit(preferredUnit);
        updateUnitToggleButton();
        updateUnitInputPlaceholder();
    });
}

function updateUnitInputPlaceholder() {
    var gramsInput = document.querySelector('.grams');
    if (!gramsInput) return;
    gramsInput.placeholder = preferredUnit === 'oz' ? 'ounces' : 'grams';
    var label = document.querySelector('label[for="gramsInput"]');
    if (label) {
        label.textContent = preferredUnit === 'oz' ? 'Amount in ounces' : 'Amount in grams';
    }
}

function roundGrams(grams) {
    return Math.round(Number(grams) * 100) / 100;
}

function formatGramsDisplay(grams) {
    var n = roundGrams(grams);
    if (!isFinite(n)) return '0';
    if (n % 1 === 0) return String(n);
    return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Convert the amount field value to grams for storage and nutrition lookup. */
function inputValueToGrams(val) {
    var n = parseFloat(val);
    if (isNaN(n) || n <= 0) return NaN;
    var grams = getPreferredUnit() === 'oz' ? n * UNIT_GRAMS_PER_OZ : n;
    return roundGrams(grams);
}

/** Convert stored grams to the value shown in the amount input field. */
function gramsToInputValue(grams) {
    var n = roundGrams(grams);
    if (!isFinite(n) || n <= 0) return '';
    if (getPreferredUnit() === 'oz') {
        return (n / UNIT_GRAMS_PER_OZ).toFixed(2);
    }
    return formatGramsDisplay(n);
}

/** Return the display label for the current unit ("g" or "oz"). */
function unitLabel() {
    return preferredUnit === 'oz' ? 'oz' : 'g';
}
















async function initializeFoodList() {
    try {
        const { entries } = await loadFoodNamesAndCache();
        const fi = document.getElementById('foodInput') || document.querySelector('.food');
        const gi = document.getElementById('gramsInput') || document.querySelector('.grams');
        const ac = document.getElementById('autocompleteList');
        setupAutocomplete(entries, fi, gi, ac);
    } catch (err) {
        console.error('initializeFoodList', err);
        setupAutocomplete([]);
    }
}

function showServingBubble(description, targetElement) {
    // Create and show the bubble
    const bubble = document.createElement('div');
    bubble.className = 'serving-bubble';
    bubble.textContent = description;
    targetElement.parentNode.appendChild(bubble);
    
    // Position the bubble below the target element
    const rect = targetElement.getBoundingClientRect();
    bubble.style.top = (rect.bottom + 5) + 'px';
    bubble.style.left = rect.left + 'px';
    
    // Remove the bubble after 3 seconds
    setTimeout(() => {
        bubble.remove();
    }, 3000);
}












// Function to determine meal type based on time
function getMealType(timeStr) {
    // timeStr is in "HH:MM" format
    const [hour, minute] = timeStr.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    
    // Load user-configured meal times or use defaults
    const savedMealTimes = RadiantStorage.nutrition.getMealTimes();

    const dynamicConfig = RadiantStorage.nutrition.getDynamicMealConfig();

    // If dynamic config enabled, compute meal times for the given date (use today by default)
    let mealTimes = savedMealTimes;
    if (dynamicConfig && dynamicConfig.enabled) {
        const dateKey = RadiantStorage.nutrition.getToday();
        const dyn = computeDynamicMealTimesForDate(dateKey, dynamicConfig);
        if (dyn) mealTimes = dyn;
    }

    const breakfastStart = timeToMinutes(mealTimes.breakfast.start);
    const breakfastEnd = timeToMinutes(mealTimes.breakfast.end);
    const lunchStart = timeToMinutes(mealTimes.lunch.start);
    const lunchEnd = timeToMinutes(mealTimes.lunch.end);
    const dinnerStart = timeToMinutes(mealTimes.dinner.start);
    const dinnerEnd = timeToMinutes(mealTimes.dinner.end);

    // Check if time falls within breakfast range
    if (breakfastStart <= breakfastEnd) {
        // Normal case: start < end (e.g., 06:00-10:00)
        if (totalMinutes >= breakfastStart && totalMinutes < breakfastEnd) {
            return 'Breakfast';
        }
    } else {
        // Wraps around midnight (e.g., 22:00-06:00)
        if (totalMinutes >= breakfastStart || totalMinutes < breakfastEnd) {
            return 'Breakfast';
        }
    }

    // Check if time falls within lunch range
    if (lunchStart <= lunchEnd) {
        if (totalMinutes >= lunchStart && totalMinutes < lunchEnd) {
            return 'Lunch';
        }
    } else {
        if (totalMinutes >= lunchStart || totalMinutes < lunchEnd) {
            return 'Lunch';
        }
    }

    // Check if time falls within dinner range
    if (dinnerStart <= dinnerEnd) {
        if (totalMinutes >= dinnerStart && totalMinutes < dinnerEnd) {
            return 'Dinner';
        }
    } else {
        if (totalMinutes >= dinnerStart || totalMinutes < dinnerEnd) {
            return 'Dinner';
        }
    }

    // If time doesn't fall within any configured range, categorize as snack
    return 'Snack';
}

// Function to calculate totals for a specific meal (or all meals when mealType === 'All').
// Returns true if a food item's logged time falls within the RECENT_FOOD_MINUTES window.
// Uses directional (past-only) comparison so a manually edited future time is never "recent".
// Midnight wrap: food logged at 23:45 is still recent at 00:30 the next calendar minute.
function isRecentFood(timeAdded) {
    if (!timeAdded) return false;
    const now  = new Date();
    const nowMin  = now.getHours() * 60 + now.getMinutes();
    const itemMin = timeToMinutes(timeAdded);
    let diff = nowMin - itemMin;   // positive  → item is in the past (expected)
    if (diff < 0) diff += 1440;   // midnight wrap (e.g. now=00:30, item=23:00 → diff=90)
    return diff <= RECENT_FOOD_MINUTES;
}

// Computes per-macro totals AND recent sub-totals in a single pass over the same item set,
// so the two values are always perfectly consistent.
// Always uses the passed-in foodItems — never re-reads localStorage — so edits
// are reflected immediately without any race between storage writes and reads.
function calculateMealTotals(foodItems, mealType) {
    const items = (mealType === 'All')
        ? foodItems
        : foodItems.filter(item => getMealType(item.timeAdded) === mealType);

    const totals = items.reduce((acc, item) => {
        const recent = isRecentFood(item.timeAdded);
        return {
            protein:        acc.protein        + (item.protein  || 0),
            carbs:          acc.carbs          + (item.carbs    || 0),
            fat:            acc.fat            + (item.fat      || 0),
            calories:       acc.calories       + (item.calories || 0),
            recentProtein:  acc.recentProtein  + (recent ? (item.protein  || 0) : 0),
            recentCarbs:    acc.recentCarbs    + (recent ? (item.carbs    || 0) : 0),
            recentFat:      acc.recentFat      + (recent ? (item.fat      || 0) : 0),
            recentCalories: acc.recentCalories + (recent ? (item.calories || 0) : 0),
        };
    }, { protein: 0, carbs: 0, fat: 0, calories: 0,
         recentProtein: 0, recentCarbs: 0, recentFat: 0, recentCalories: 0 });

    return {
        protein:        Math.round(totals.protein),
        carbs:          Math.round(totals.carbs),
        fat:            Math.round(totals.fat),
        calories:       Math.round(totals.calories),
        recentProtein:  Math.round(totals.recentProtein),
        recentCarbs:    Math.round(totals.recentCarbs),
        recentFat:      Math.round(totals.recentFat),
        recentCalories: Math.round(totals.recentCalories),
    };
}

/** Items planned in one slot, or null when the slot is empty or dangling. */
function getPlannedItemsForSlot(mealPlanning, dayOfWeek, slot) {
    return MealPlanning.getSlotItems(mealPlanning, dayOfWeek, slot);
}

function foodLogItemToPlanItem(item) {
    var view = typeof quickDisplayMacrosForLogItem === 'function'
        ? quickDisplayMacrosForLogItem(item)
        : Object.assign({}, item);
    var planItem = {
        name: item.name,
        grams: item.grams,
        calories: view.calories || 0,
        protein: view.protein || 0,
        carbs: view.carbs || 0,
        fat: view.fat || 0
    };
    if (item.fdc_id != null && item.fdc_id !== '') {
        planItem.fdc_id = item.fdc_id;
    }
    if (item.nutrition_source) {
        planItem.nutrition_source = item.nutrition_source;
    }
    return planItem;
}

// ---- Save a logged meal as a reusable element ----

var mealSaveDialogState = null;

function mealItemsMatch(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every(function (item, index) {
        var other = b[index];
        return !!other &&
            item.name === other.name &&
            Number(item.grams) === Number(other.grams);
    });
}

function closeMealSaveDialog() {
    var dialog = document.getElementById('mealSaveDialog');
    if (dialog) dialog.style.display = 'none';
    mealSaveDialogState = null;
    setMealSaveError('');
}

function setMealSaveError(message) {
    var el = document.getElementById('mealSaveError');
    if (el) el.textContent = message || '';
}

function defaultMealElementName(mealType) {
    var now = new Date();
    return mealType + ' · ' + (now.getMonth() + 1) + '/' + now.getDate();
}

function openMealSaveDialog(mealType, planItems) {
    var dialog = document.getElementById('mealSaveDialog');
    if (!dialog) return;

    var mealPlanning = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    mealSaveDialogState = { mealType: mealType, planItems: planItems, mealPlanning: mealPlanning };

    var messageEl = document.getElementById('mealSaveMessage');
    if (messageEl) {
        messageEl.textContent = 'Save this ' + mealType.toLowerCase() + ' (' + planItems.length +
            ' item' + (planItems.length === 1 ? '' : 's') + ') as a reusable meal you can drop into any day and slot.';
    }
    var input = document.getElementById('mealSaveName');
    if (input) input.value = defaultMealElementName(mealType);
    setMealSaveError('');

    dialog.style.display = 'flex';
    if (input) input.focus();
}

/**
 * Create (or reuse) the element from the dialog's name, point today's slot at it,
 * and mark its items complete so nothing is left on screen twice.
 */
function submitMealSaveDialog() {
    if (!mealSaveDialogState) return;
    var input = document.getElementById('mealSaveName');
    var rawName = input ? input.value : '';
    var name = MealPlanning.normaliseElementName(rawName);
    if (!name) {
        setMealSaveError('Enter a name that is not a reserved word.');
        return;
    }

    var mealPlanning = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    var existingKey = MealPlanning.findElementByName(mealPlanning, name);
    if (existingKey) {
        var existing = MealPlanning.getElement(mealPlanning, existingKey) || { items: [] };
        var existingItems = Array.isArray(existing.items) ? existing.items : [];
        if (!mealItemsMatch(existingItems, mealSaveDialogState.planItems)) {
            var overwrite = confirm(
                'A reusable meal named "' + existingKey + '" already exists with ' +
                existingItems.length + ' item' + (existingItems.length === 1 ? '' : 's') + '.\n\n' +
                'Replace it with the ' + mealSaveDialogState.planItems.length + ' item' +
                (mealSaveDialogState.planItems.length === 1 ? '' : 's') + ' you just logged?'
            );
            if (!overwrite) return;
        }
        name = MealPlanning.putElement(mealPlanning, existingKey, mealSaveDialogState.planItems) || existingKey;
    } else {
        name = MealPlanning.putElement(mealPlanning, name, mealSaveDialogState.planItems);
        if (!name) {
            setMealSaveError('Enter a name that is not a reserved word.');
            return;
        }
    }
    MealPlanning.addElementTag(mealPlanning, name, mealSaveDialogState.mealType.toLowerCase());

    var slot = mealSaveDialogState.mealType.toLowerCase();
    var todayDayOfWeek = new Date().getDay();
    MealPlanning.setDaySlot(mealPlanning, todayDayOfWeek, slot, name);
    mealSaveDialogState.planItems.forEach(function (item) {
        MealPlanning.addSlotCompleted(mealPlanning, todayDayOfWeek, slot, item.name);
    });
    MealPlanning.save(mealPlanning);

    var savedMealType = mealSaveDialogState.mealType;
    closeMealSaveDialog();

    var foodLog = RadiantStorage.nutrition.getFoodLog();
    displayFoodItems(foodLog[today] || []);
    flashMealSaveSuccess(savedMealType);
}

function initMealSaveDialog() {
    var dialog = document.getElementById('mealSaveDialog');
    if (!dialog || dialog.dataset.wired === 'true') return;
    dialog.dataset.wired = 'true';

    var confirmBtn = document.getElementById('mealSaveConfirm');
    if (confirmBtn) confirmBtn.addEventListener('click', submitMealSaveDialog);

    var cancelBtn = document.getElementById('mealSaveCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeMealSaveDialog);

    dialog.addEventListener('click', function (e) {
        if (e.target === dialog) closeMealSaveDialog();
    });

    var input = document.getElementById('mealSaveName');
    if (input) {
        input.addEventListener('keypress', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitMealSaveDialog();
            }
        });
        input.addEventListener('input', function () {
            setMealSaveError('');
        });
    }
}

/** Entry point behind the per-meal Save button. */
function saveMealAsElement(mealType, foodItems) {
    var mealItems = foodItems.filter(function (item) {
        return getMealType(item.timeAdded) === mealType;
    });
    if (mealItems.length === 0) return;
    openMealSaveDialog(mealType, mealItems.map(foodLogItemToPlanItem));
}

var mealSaveFlashTimers = {};

function flashMealSaveSuccess(mealType) {
    if (mealSaveFlashTimers[mealType]) {
        clearTimeout(mealSaveFlashTimers[mealType]);
    }
    var container = document.querySelector('.meal-header-container[data-meal="' + mealType + '"]');
    if (!container) return;
    var saveBtn = container.querySelector('.meal-save-btn');
    if (!saveBtn) return;
    saveBtn.textContent = '✅';
    saveBtn.classList.add('meal-save-btn--success');
    mealSaveFlashTimers[mealType] = setTimeout(function() {
        delete mealSaveFlashTimers[mealType];
        var c = document.querySelector('.meal-header-container[data-meal="' + mealType + '"]');
        var btn = c && c.querySelector('.meal-save-btn');
        if (!btn) return;
        btn.textContent = 'Save';
        btn.classList.remove('meal-save-btn--success');
    }, 2000);
}

function mealPlanElementCycle(mp, slot) {
    return MealPlanning.orderElementsForTag(mp, slot);
}

function initMealPlanNavForSlot(slot) {
    if (mealPlanNavInit[slot]) return;
    mealPlanNavInit[slot] = true;
    var mp = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    var names = mealPlanElementCycle(mp, slot);
    var assigned = MealPlanning.getDaySlots(mp, new Date().getDay())[slot];
    mealPlanNavIndex[slot] = -1;
    if (!assigned) return;
    for (var i = 0; i < names.length; i++) {
        if (names[i].toLowerCase() === assigned.toLowerCase()) {
            mealPlanNavIndex[slot] = i;
            return;
        }
    }
}

function applyElementToToday(slot, elementName) {
    var mp = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    var key = elementName ? MealPlanning.findElementByName(mp, elementName) : null;
    var element = key ? MealPlanning.getElement(mp, key) : null;
    var assign = element && Array.isArray(element.items) && element.items.length > 0 ? key : null;
    var todayDayOfWeek = new Date().getDay();
    MealPlanning.setDaySlot(mp, todayDayOfWeek, slot, assign);
    if (mp.completedMeals && mp.completedMeals[todayDayOfWeek]) delete mp.completedMeals[todayDayOfWeek][slot];
    if (mp.removedMeals && mp.removedMeals[todayDayOfWeek]) delete mp.removedMeals[todayDayOfWeek][slot];
    MealPlanning.save(mp);
    var foodLog = RadiantStorage.nutrition.getFoodLog();
    displayFoodItems(foodLog[today] || []);
}

function cycleMealPlanSlot(mealType, delta) {
    var slot = mealType.toLowerCase();
    var mp = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    var names = mealPlanElementCycle(mp, slot);
    if (names.length === 0) return;
    initMealPlanNavForSlot(slot);
    var idx = mealPlanNavIndex[slot];
    var next;
    if (delta > 0) {
        next = idx === -1 ? 0 : (idx + 1) % names.length;
    } else {
        next = idx === -1 ? names.length - 1 : (idx - 1 + names.length) % names.length;
    }
    mealPlanNavIndex[slot] = next;
    applyElementToToday(slot, names[next]);
}

function ensureMealHeaderNavLabel(actions) {
    var navGroup = actions.querySelector('.meal-plan-nav');
    if (!navGroup) return null;
    var label = navGroup.querySelector('.meal-plan-nav-label');
    if (label) return label;
    label = document.createElement('span');
    label.className = 'meal-plan-nav-label';
    navGroup.insertBefore(label, navGroup.firstChild);
    return label;
}

function updateMealPlanNavControls(actions, mealType) {
    var navGroup = actions.querySelector('.meal-plan-nav');
    if (!navGroup) return;
    var slot = mealType.toLowerCase();
    var mp = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    var names = mealPlanElementCycle(mp, slot);
    initMealPlanNavForSlot(slot);
    var label = navGroup.querySelector('.meal-plan-nav-label');
    if (names.length === 0) {
        navGroup.style.display = 'none';
        if (label) label.style.display = 'none';
        return;
    }
    navGroup.style.display = '';
    if (label) label.style.display = '';
    var idx = mealPlanNavIndex[slot];
    if (label) label.textContent = idx >= 0 ? names[idx] : '';
    var prevBtn = navGroup.querySelector('.meal-plan-nav-prev');
    var nextBtn = navGroup.querySelector('.meal-plan-nav-next');
    if (prevBtn) prevBtn.title = 'Previous saved meal: ' + (idx <= 0 ? names[names.length - 1] : names[idx - 1]);
    if (nextBtn) nextBtn.title = 'Next saved meal: ' + (idx < 0 || idx >= names.length - 1 ? names[0] : names[idx + 1]);
}

function ensureMealHeaderActions(mealHeaderContainer, mealType, canSave) {
    var actions = mealHeaderContainer.querySelector('.meal-header-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'meal-header-actions';
        actions.style.cssText = 'display:flex;gap:4px;align-items:flex-start;flex-shrink:0;';

        var navGroup = document.createElement('span');
        navGroup.className = 'meal-plan-nav';

        var arrowRow = document.createElement('span');
        arrowRow.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';

        var prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'meal-plan-nav-btn meal-plan-nav-prev';
        prevBtn.textContent = '◀';
        prevBtn.title = 'Previous saved meal';
        prevBtn.addEventListener('click', function () {
            cycleMealPlanSlot(mealType, -1);
        });

        var nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'meal-plan-nav-btn meal-plan-nav-next';
        nextBtn.textContent = '▶';
        nextBtn.title = 'Next saved meal';
        nextBtn.addEventListener('click', function () {
            cycleMealPlanSlot(mealType, 1);
        });

        arrowRow.appendChild(prevBtn);
        arrowRow.appendChild(nextBtn);

        var navLabel = document.createElement('span');
        navLabel.className = 'meal-plan-nav-label';
        navGroup.appendChild(navLabel);
        navGroup.appendChild(arrowRow);

        actions.appendChild(navGroup);

        var saveBtn = document.createElement('button');
        saveBtn.className = 'meal-save-btn';
        saveBtn.textContent = 'Save';
        saveBtn.title = 'Save as a reusable meal';
        saveBtn.addEventListener('click', function() {
            var foodLog = RadiantStorage.nutrition.getFoodLog();
            var items = foodLog[today] || [];
            saveMealAsElement(mealType, items);
        });
        actions.appendChild(saveBtn);

        var toggleButton = mealHeaderContainer.querySelector('.meal-toggle-btn');
        if (toggleButton) {
            if (toggleButton.parentNode === mealHeaderContainer) {
                mealHeaderContainer.removeChild(toggleButton);
            }
            actions.appendChild(toggleButton);
        }

        // The nav label is created inside the nav group above (centered over the arrows)

        mealHeaderContainer.appendChild(actions);
    }

    var saveButton = actions.querySelector('.meal-save-btn');
    if (saveButton) {
        if (mealSaveFlashTimers[mealType]) {
            saveButton.textContent = '✅';
            saveButton.classList.add('meal-save-btn--success');
            saveButton.disabled = false;
        } else {
            saveButton.textContent = 'Save';
            saveButton.classList.remove('meal-save-btn--success');
            saveButton.disabled = !canSave;
        }
    }

    updateMealPlanNavControls(actions, mealType);
}

/**
 * Outstanding planned macros for one slot: the day's element for that slot minus
 * the items completed or removed *in that slot* (per-slot, so the same element in
 * two slots is two independent check-offs).
 */
function calculatePlannedMealTotals(mealType, mealPlanning, dayOfWeek) {
    const mealKey = mealType.toLowerCase();
    const planned = getPlannedItemsForSlot(mealPlanning, dayOfWeek, mealKey);
    if (!planned) return null;
    const completed = MealPlanning.getSlotCompleted(mealPlanning, dayOfWeek, mealKey);
    const removed = MealPlanning.getSlotRemoved(mealPlanning, dayOfWeek, mealKey);
    const active = planned.filter(item => !completed.includes(item.name) && !removed.includes(item.name));
    if (active.length === 0) return null;
    const totals = active.reduce((acc, item) => ({
        calories: acc.calories + (item.calories || 0),
        protein:  acc.protein  + (item.protein  || 0),
        carbs:    acc.carbs    + (item.carbs    || 0),
        fat:      acc.fat      + (item.fat      || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return {
        calories: Math.round(totals.calories),
        protein:  Math.round(totals.protein),
        carbs:    Math.round(totals.carbs),
        fat:      Math.round(totals.fat),
    };
}

// Function to get meal time range as a formatted string
function getMealTimeRange(mealType) {
    const savedMealTimes = RadiantStorage.nutrition.getMealTimes();

    const dynamicConfig = RadiantStorage.nutrition.getDynamicMealConfig();
    let mealTimes = savedMealTimes;
    if (dynamicConfig && dynamicConfig.enabled) {
        const dateKey = RadiantStorage.nutrition.getToday();
        const dyn = computeDynamicMealTimesForDate(dateKey, dynamicConfig);
        if (dyn) mealTimes = dyn;
    }

    function formatTimeForDisplay(timeStr) {
        const [hour, minute] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(hour, minute, 0);
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        });
    }

    switch(mealType) {
        case 'Breakfast':
            return `${formatTimeForDisplay(mealTimes.breakfast.start)} - ${formatTimeForDisplay(mealTimes.breakfast.end)}`;
        case 'Lunch':
            return `${formatTimeForDisplay(mealTimes.lunch.start)} - ${formatTimeForDisplay(mealTimes.lunch.end)}`;
        case 'Dinner':
            return `${formatTimeForDisplay(mealTimes.dinner.start)} - ${formatTimeForDisplay(mealTimes.dinner.end)}`;
        case 'Snack':
            return 'Throughout the day';
        default:
            return '';
    }
}


// Compute dynamic meal times for a given date using dynamic config
function computeDynamicMealTimesForDate(dateKey, dynamicConfig) {
    try {
        const foodLog = RadiantStorage.nutrition.getFoodLog();
        const dayFoods = foodLog[dateKey] || [];

        let firstTime = null;
        if (dayFoods.length) {
            dayFoods.forEach(f => {
                if (!f.timeAdded) return;
                if (!firstTime || f.timeAdded.localeCompare(firstTime) < 0) firstTime = f.timeAdded;
            });
        }

        if (!firstTime) return null; // no data for this date

        const bs = timeToMinutes(firstTime);
        const lunchStart = bs + Math.round((dynamicConfig.lunchAfterHours||5)*60);
        const dinnerStart = bs + Math.round((dynamicConfig.dinnerAfterHours||10)*60);
        const dinnerEnd = dinnerStart + Math.round((dynamicConfig.dinnerDurationHours||4)*60);

        return {
            breakfast: { start: minutesToTime(bs), end: minutesToTime(lunchStart) },
            lunch: { start: minutesToTime(lunchStart), end: minutesToTime(dinnerStart) },
            dinner: { start: minutesToTime(dinnerStart), end: minutesToTime(dinnerEnd) }
        };
    } catch (e) {
        console.error('Error computing dynamic meal times:', e);
        return null;
    }
}

// Function to get the current meal type based on current time
function getCurrentMealType() {
    const currentTime = formatTime(new Date());
    return getMealType(currentTime);
}

function isMealExpandedByDefault(mealType) {
    if (RadiantStorage.nutrition.getMealCollapsePreference() === 'currentMeal') {
        return mealType === getCurrentMealType();
    }
    return false;
}

function persistMealCollapsePreference() {
    var scrollRoot = document.getElementById('scrollableWindow');
    if (!scrollRoot) return;
    var anyExpanded = ['breakfast', 'lunch', 'dinner', 'snack'].some(function(m) {
        var el = scrollRoot.querySelector('.meal-items-' + m);
        return el && el.style.display !== 'none';
    });
    RadiantStorage.nutrition.saveMealCollapsePreference(anyExpanded ? 'currentMeal' : 'allCollapsed');
}

function applyMealCollapseState(mealHeaderContainer, mealItemsContainer, isExpanded) {
    mealItemsContainer.style.display = isExpanded ? 'block' : 'none';
    var toggleBtn = mealHeaderContainer && mealHeaderContainer.querySelector('.meal-toggle-btn');
    if (toggleBtn) {
        toggleBtn.textContent = isExpanded ? '▼' : '▶';
        toggleBtn.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
}

// Function to group food items by meal
function groupByMeal(foodItems) {
    const meals = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
    foodItems.forEach(item => {
        const meal = getMealType(item.timeAdded);
        meals[meal].push(item);
    });
    return meals;
}

/** Filenames from assets/character images/ (same source as profile.html). */
var nutritionPortraitManifestFiles = [];
fetch('assets/character-images-manifest.json')
    .then(function (response) {
        return response.json();
    })
    .then(function (manifest) {
        nutritionPortraitManifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
        updateNutritionProfileCharacterPortrait();
    })
    .catch(function () {
        nutritionPortraitManifestFiles = [];
        updateNutritionProfileCharacterPortrait();
    });

function nutritionPortraitUrl(filename, characterImageCustom) {
    if (filename === '__custom__') {
        return typeof characterImageCustom === 'string' ? characterImageCustom : '';
    }
    return 'assets/character images/' + encodeURIComponent(filename);
}

/** profile.html preview is 156px; nutrition portrait link is 88px */
var NUTRITION_PORTRAIT_PAN_SCALE = 88 / 156;
var NUTRITION_CHARACTER_VIEW_MIN_SCALE = 1;
var NUTRITION_CHARACTER_VIEW_MAX_SCALE = 4;

function nutritionDefaultCharacterView() {
    return { scale: 1, x: 0, y: 0 };
}

function nutritionGetCharacterView(filename, characterImageViews) {
    var key = typeof filename === 'string' ? filename.trim() : '';
    if (!key) {
        return nutritionDefaultCharacterView();
    }
    var stored = characterImageViews && characterImageViews[key];
    if (!stored || typeof stored !== 'object') {
        return nutritionDefaultCharacterView();
    }
    var scale = Number(stored.scale);
    var x = Number(stored.x);
    var y = Number(stored.y);
    return {
        scale: Number.isFinite(scale)
            ? Math.min(NUTRITION_CHARACTER_VIEW_MAX_SCALE, Math.max(NUTRITION_CHARACTER_VIEW_MIN_SCALE, scale))
            : 1,
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0
    };
}

function nutritionApplyCharacterViewToPortrait(viewport, filename, characterImageViews) {
    if (!viewport) {
        return;
    }
    var view = nutritionGetCharacterView(filename, characterImageViews);
    viewport.style.setProperty('--char-scale', String(view.scale));
    viewport.style.setProperty('--char-pan-x', (view.x * NUTRITION_PORTRAIT_PAN_SCALE) + 'px');
    viewport.style.setProperty('--char-pan-y', (view.y * NUTRITION_PORTRAIT_PAN_SCALE) + 'px');
}

function updateNutritionProfileCharacterPortrait() {
    var wrap = document.getElementById('nutritionProfileCharacter');
    var viewport = document.getElementById('nutritionProfileCharacterViewport');
    var imgEl = document.getElementById('nutritionProfileCharacterImg');
    if (!wrap || !imgEl) {
        return;
    }
    var saved = '';
    var characterImageCustom = '';
    var characterImageViews = {};
    try {
        var stats = RadiantStorage.profile.get() || {};
        saved = (stats.characterImage || '').trim();
        characterImageCustom = typeof stats.characterImageCustom === 'string' ? stats.characterImageCustom : '';
        if (stats.characterImageViews && typeof stats.characterImageViews === 'object') {
            characterImageViews = stats.characterImageViews;
        }
    } catch (e) {
        saved = '';
    }
    var effective = saved || nutritionPortraitManifestFiles[0] || '';
    if (effective === '__custom__' && !characterImageCustom) {
        effective = nutritionPortraitManifestFiles[0] || '';
    }
    if (!effective) {
        wrap.classList.add('nutrition-profile-character--hidden');
        imgEl.removeAttribute('src');
        delete imgEl.dataset.currentPortrait;
        return;
    }
    var url = nutritionPortraitUrl(effective, characterImageCustom);
    if (!url) {
        wrap.classList.add('nutrition-profile-character--hidden');
        imgEl.removeAttribute('src');
        delete imgEl.dataset.currentPortrait;
        return;
    }
    imgEl.alt = '';
    if (imgEl.dataset.currentPortrait !== url) {
        imgEl.dataset.currentPortrait = url;
        imgEl.src = url;
    }
    nutritionApplyCharacterViewToPortrait(viewport, effective, characterImageViews);
    wrap.classList.remove('nutrition-profile-character--hidden');
}

window.addEventListener('pageshow', function () {
    updateNutritionProfileCharacterPortrait();
    refreshTodayIfDateChanged();
});

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
        refreshTodayIfDateChanged();
    }
});

function updateProgressBars(totals) {
    const macros = RadiantStorage.profile.getMacros();
    const profileStatistics = RadiantStorage.profile.get();

    const proteinGoal = macros ? macros.protein : 150;
    const carbsGoal   = macros ? macros.carbs   : 200;
    const fatGoal     = macros ? macros.fat      : 100;
    let dailyCalorieGoal = 2400;
    if (profileStatistics) {
        dailyCalorieGoal = profileStatistics['dailyCaloricExpenditure'] + profileStatistics['BMR'];
    }

    // Split totals into settled (older than RECENT_FOOD_MINUTES) and recent.
    // Both come from calculateMealTotals in one pass — always consistent.
    const recent = {
        protein:  totals.recentProtein  || 0,
        carbs:    totals.recentCarbs    || 0,
        fat:      totals.recentFat      || 0,
        calories: totals.recentCalories || 0,
    };
    const settled = {
        protein:  Math.max(0, totals.protein  - recent.protein),
        carbs:    Math.max(0, totals.carbs    - recent.carbs),
        fat:      Math.max(0, totals.fat      - recent.fat),
        calories: Math.max(0, totals.calories - recent.calories),
    };

    // ---- Circular calorie ring ----
    const C = 2 * Math.PI * 45; // circumference (≈ 283)
    const settledCalPct = Math.min(settled.calories / dailyCalorieGoal, 1);
    const totalCalPct   = Math.min(totals.calories  / dailyCalorieGoal, 1);
    const settledArc    = settledCalPct * C;
    const recentArc     = Math.max(0, (totalCalPct - settledCalPct) * C);

    // Green arc = settled calories (uses existing dashoffset technique)
    const greenCircle = document.querySelector('.circular-progress-fill[data-goal="calories"]');
    if (greenCircle) {
        greenCircle.style.strokeDashoffset = C - settledArc;
    }

    // Yellow arc = recent calories.
    // Uses the same dashoffset family as the green circle — no 0-length leading dash, no dot artifact.
    // dasharray: recentArc (C-recentArc)  — one visible dash of exactly the right length
    // dashoffset: C - settledArc          — shifts the dash to start at the green arc's end
    const yellowCircle = document.querySelector('.circular-progress-recent');
    if (yellowCircle) {
        if (recentArc > 0.5) {
            yellowCircle.style.strokeDasharray  = `${recentArc} ${C - recentArc}`;
            yellowCircle.style.strokeDashoffset = `${C - settledArc}`;
        } else {
            // Mirror the green circle's hidden state: a full-length dash offset by C
            // produces a full gap — no zero-length dash, no rendering artifact.
            yellowCircle.style.strokeDasharray  = `${C} ${C}`;
            yellowCircle.style.strokeDashoffset = `${C}`;
        }
    }

    // Fraction text and accessible label
    const calorieFraction = `${totals.calories} / ${dailyCalorieGoal}`;
    const circularFraction = document.querySelector('.circular-fraction');
    if (circularFraction) circularFraction.textContent = calorieFraction;
    const caloriesRingDiv = document.querySelector('.circular-progress[data-goal="calories"]');
    if (caloriesRingDiv) {
        caloriesRingDiv.setAttribute('aria-label', `Calories: ${totals.calories} of ${dailyCalorieGoal}`);
    }
    const caloriesRingTitle = document.getElementById('caloriesRingTitle');
    if (caloriesRingTitle) {
        caloriesRingTitle.textContent = `Calories consumed: ${totals.calories} of ${dailyCalorieGoal}`;
    }

    // ---- Linear macro bars (green = settled, yellow = recent) ----
    function applyMacroBar(barEl, settledAmt, recentAmt, goal) {
        const totalAmt = settledAmt + recentAmt;
        const totalPct = Math.min((totalAmt / goal) * 100, 100);
        barEl.style.width = `${totalPct}%`;
        if (recentAmt > 0 && totalAmt > 0) {
            // settledFrac is the share of the bar element itself that is green,
            // so the gradient stop is element-relative, not goal-relative.
            const settledFrac = (settledAmt / totalAmt) * 100;
            barEl.style.background =
                `linear-gradient(to right, #55cc00 ${settledFrac}%, #ffcc00 ${settledFrac}%)`;
        } else {
            barEl.style.background = '#55cc00';
        }
    }

    applyMacroBar(document.querySelector('[data-goal="protein"]'), settled.protein, recent.protein, proteinGoal);
    document.querySelector('.progress-bar-container:nth-child(1) .fraction').textContent =
        `${totals.protein} / ${proteinGoal}`;

    applyMacroBar(document.querySelector('[data-goal="carbs"]'), settled.carbs, recent.carbs, carbsGoal);
    document.querySelector('.progress-bar-container:nth-child(2) .fraction').textContent =
        `${totals.carbs} / ${carbsGoal}`;

    applyMacroBar(document.querySelector('[data-goal="fat"]'), settled.fat, recent.fat, fatGoal);
    document.querySelector('.progress-bar-container:nth-child(3) .fraction').textContent =
        `${totals.fat} / ${fatGoal}`;

    updateNutritionProfileCharacterPortrait();
}




function formatTime(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();

    // Ensure minutes are always two digits
    minutes = minutes < 10 ? '0' + minutes : minutes;

    return hours + ':' + minutes;
}

// Helper function to convert "HH:MM" to minutes since midnight
function timeToMinutes(time) {
    var parts = time.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Helper: convert minutes since midnight to "HH:MM"
function minutesToTime(m) {
    m = ((m % 1440) + 1440) % 1440;
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

// Shift all mealTimes by offsetMinutes (can be negative). Persists to localStorage.
function shiftMealTimes(offsetMinutes) {
    var savedMealTimes = RadiantStorage.nutrition.getMealTimes();

    function shiftRange(range) {
        var s = timeToMinutes(range.start);
        var e = timeToMinutes(range.end);
        s = s + offsetMinutes;
        e = e + offsetMinutes;
        return { start: minutesToTime(s), end: minutesToTime(e) };
    }

    var newTimes = {
        breakfast: shiftRange(savedMealTimes.breakfast),
        lunch: shiftRange(savedMealTimes.lunch),
        dinner: shiftRange(savedMealTimes.dinner)
    };

    RadiantStorage.nutrition.saveMealTimes(newTimes);
    return newTimes;
}

// Set breakfast start to newStart (HH:MM) preserving breakfast duration; other meals optionally shifted by same delta
function setBreakfastStart(newStart, shiftLinked) {
    var savedMealTimes = RadiantStorage.nutrition.getMealTimes();
    var oldStart = timeToMinutes(savedMealTimes.breakfast.start);
    var oldEnd = timeToMinutes(savedMealTimes.breakfast.end);
    var duration = oldEnd - oldStart;
    var newStartM = timeToMinutes(newStart);
    var delta = newStartM - oldStart;

    var newBreakfast = { start: newStart, end: minutesToTime(newStartM + duration) };

    var newTimes = Object.assign({}, savedMealTimes);
    newTimes.breakfast = newBreakfast;

    if (shiftLinked) {
        newTimes.lunch = { start: minutesToTime(timeToMinutes(savedMealTimes.lunch.start) + delta), end: minutesToTime(timeToMinutes(savedMealTimes.lunch.end) + delta) };
        newTimes.dinner = { start: minutesToTime(timeToMinutes(savedMealTimes.dinner.start) + delta), end: minutesToTime(timeToMinutes(savedMealTimes.dinner.end) + delta) };
    }

    RadiantStorage.nutrition.saveMealTimes(newTimes);
    return newTimes;
}

// Modal logic: pending food will be stored until user chooses
var pendingFoodItem = null;

function showOffsetDialog(foodItem) {
    pendingFoodItem = foodItem;
    var hh_mm = foodItem.timeAdded;
    document.getElementById('offsetTime').textContent = hh_mm;
    var savedMealTimes = RadiantStorage.nutrition.getMealTimes();
    document.getElementById('offsetBreakfastStart').textContent = savedMealTimes.breakfast.start;
    document.getElementById('offsetDialog').style.display = 'flex';
    document.getElementById('blurOverlay').classList.add('active');
}

function hideOffsetDialog() {
    document.getElementById('offsetDialog').style.display = 'none';
    document.getElementById('blurOverlay').classList.remove('active');
    pendingFoodItem = null;
}

// Apply choice and then persist the pending food item
function applyOffsetShiftAll() {
    if (!pendingFoodItem) return hideOffsetDialog();
    var hh = timeToMinutes(pendingFoodItem.timeAdded);
    var saved = RadiantStorage.nutrition.getMealTimes();
    var breakfastStart = timeToMinutes(saved.breakfast.start);
    var offset = hh - breakfastStart;
    shiftMealTimes(offset);
    if (document.getElementById('offsetDisableDynamic').checked) {
        RadiantStorage.nutrition.saveDynamicMealConfig({ enabled: true });
    }
    finalizePendingFood();
}

function applyOffsetSetBreakfast() {
    if (!pendingFoodItem) return hideOffsetDialog();
    var newStart = pendingFoodItem.timeAdded;
    // by default shift linked windows as well
    setBreakfastStart(newStart, true);
    if (document.getElementById('offsetDisableDynamic').checked) {
        RadiantStorage.nutrition.saveDynamicMealConfig({ enabled: true });
    }
    finalizePendingFood();
}

function applyOffsetKeep() {
    // Do not change mealTimes, just persist food
    if (!pendingFoodItem) return hideOffsetDialog();
    finalizePendingFood();
}

function finalizePendingFood() {
    var foodLog = RadiantStorage.nutrition.getFoodLog();
    if (!foodLog[today]) foodLog[today] = [];
    foodLog[today].push(pendingFoodItem);
    RadiantStorage.nutrition.saveFoodLog(foodLog);
    var existingData = foodLog[today];
    pendingExpandMealType = getMealType(pendingFoodItem.timeAdded);
    displayFoodItems(existingData);
    hideOffsetDialog();
}

function initOffsetDialog() {
    var s = document.getElementById('offsetShiftAll');
    var b = document.getElementById('offsetSetBreakfast');
    var k = document.getElementById('offsetKeep');
    if (s) s.addEventListener('click', applyOffsetShiftAll);
    if (b) b.addEventListener('click', applyOffsetSetBreakfast);
    if (k) k.addEventListener('click', applyOffsetKeep);
}


/**
 * Append a food log row or merge grams into a matching row within RECENT_FOOD_MINUTES (same fdc_id or same manual name).
 * @param {object} p
 * @param {string} p.foodName
 * @param {number|null} p.fdcId
 * @param {number} p.grams
 * @param {object} p.foodItem — object to push when not merging (name, grams, timeAdded, …)
 * @param {string} [p.nutrition_source] — applied to the merged row when set
 * @param {function} [p.done] — after localStorage + displayFoodItems; also run when showing first-meal offset dialog
 */
function mergeOrAppendFoodLogItem(p) {
    var foodName = p.foodName;
    var fdcId = p.fdcId;
    var grams = p.grams;
    var foodItem = p.foodItem;
    var foodLog = RadiantStorage.nutrition.getFoodLog();
    if (!foodLog[today]) foodLog[today] = [];
    var existingData = foodLog[today];

    if (existingData.length === 0) {
        var mealType = getMealType(foodItem.timeAdded);
        if (mealType !== 'Breakfast') {
            showOffsetDialog(foodItem);
            if (p.done) p.done();
            return;
        }
    }

    var hh_mm = foodItem.timeAdded;
    var mostRecentIndex = existingData.reduce(function(mostRecentIndex, item, index) {
        var sameDb =
            fdcId != null &&
            item.fdc_id === fdcId;
        var sameManual =
            (fdcId == null) &&
            item.fdc_id == null &&
            item.name === foodName;
        if (sameDb || sameManual) {
            var currentTimeInMinutes = timeToMinutes(hh_mm);
            var itemTimeInMinutes = timeToMinutes(item.timeAdded);
            var timeDifference = Math.abs(currentTimeInMinutes - itemTimeInMinutes);
            if (timeDifference <= RECENT_FOOD_MINUTES) {
                return index;
            }
        }
        return mostRecentIndex;
    }, -1);

    function finish() {
        RadiantStorage.nutrition.saveFoodLog(foodLog);
        pendingExpandMealType = getMealType(foodItem.timeAdded);
        displayFoodItems(existingData);
        if (p.done) p.done();
    }

    if (mostRecentIndex !== -1) {
        var updatedItem = existingData[mostRecentIndex];
        updatedItem.grams = roundGrams(updatedItem.grams + grams);
        if (p.nutrition_source) {
            updatedItem.nutrition_source = p.nutrition_source;
        }
        if (fdcId != null) {
            delete updatedItem.calories;
            delete updatedItem.protein;
            delete updatedItem.carbs;
            delete updatedItem.fat;
            updatedItem.fdc_id = fdcId;
        }
        getNutritionalInfo(
            foodName,
            updatedItem.grams,
            fdcId != null ? fdcId : undefined,
            p.foodSource
        ).then(function(updatedNutrition) {
            if (fdcId == null) {
                updatedItem.calories = updatedNutrition.calories;
                updatedItem.fat = updatedNutrition.fat;
                updatedItem.protein = updatedNutrition.protein;
                updatedItem.carbs = updatedNutrition.carbs;
            }
            finish();
        });
    } else {
        existingData.push(foodItem);
        finish();
    }
}

document.getElementById('addBtn').addEventListener('click', function() {
    var foodInputEl = document.getElementById('foodInput') || document.querySelector('.food');
    var foodName = foodInputEl.value.trim();
    var grams = inputValueToGrams(document.querySelector('.grams').value);
    var rawFdc = foodInputEl.dataset.fdcId;
    var fdcId =
        rawFdc !== undefined && rawFdc !== '' && !Number.isNaN(Number(rawFdc))
            ? Number(rawFdc)
            : null;
    var foodSource =
        foodInputEl.dataset.foodSource === 'recipe' ? 'recipe' : undefined;

    if (!foodName || isNaN(grams)) {
        alert('Please enter both food name and amount.');
        return;
    }

    getNutritionalInfo(
        foodName,
        grams,
        fdcId != null ? fdcId : undefined,
        foodSource
    )
        .then(function(nutritionalInfo) {
            const hh_mm = formatTime(new Date());

            var foodItem = {
                name: foodName,
                grams: grams,
                timeAdded: hh_mm,
            };
            if (fdcId != null) {
                foodItem.fdc_id = fdcId;
            } else {
                foodItem.fdc_id = null;
                foodItem.calories = nutritionalInfo.calories;
                foodItem.fat = nutritionalInfo.fat;
                foodItem.protein = nutritionalInfo.protein;
                foodItem.carbs = nutritionalInfo.carbs;
            }

            function clearEntryFields() {
                foodInputEl.value = '';
                document.querySelector('.grams').value = '';
                delete foodInputEl.dataset.fdcId;
                delete foodInputEl.dataset.foodSource;
            }

            mergeOrAppendFoodLogItem({
                foodName: foodName,
                fdcId: fdcId,
                grams: grams,
                foodItem: foodItem,
                foodSource: foodSource,
                done: clearEntryFields,
            });
        })
        .catch(function(error) {
            console.error('Error getting nutritional info:', error);
            alert('Food not found in database. Please check the spelling.');
        });
});


function pushScannerFoodItem(payload) {
    var foodName = payload.name;
    var grams = payload.grams;
    var fdcId =
        payload.fdc_id != null && payload.fdc_id !== '' && !Number.isNaN(Number(payload.fdc_id))
            ? Number(payload.fdc_id)
            : null;

    var foodItem = {
        name: foodName,
        grams: grams,
        timeAdded: formatTime(new Date()),
    };
    if (payload.nutrition_source) {
        foodItem.nutrition_source = payload.nutrition_source;
    }
    if (fdcId != null) {
        foodItem.fdc_id = fdcId;
    } else {
        foodItem.fdc_id = null;
        foodItem.calories = payload.calories;
        foodItem.protein = payload.protein;
        foodItem.carbs = payload.carbs;
        foodItem.fat = payload.fat;
    }

    mergeOrAppendFoodLogItem({
        foodName: foodName,
        fdcId: fdcId,
        grams: grams,
        foodItem: foodItem,
        nutrition_source: payload.nutrition_source || undefined,
    });
}


function nutritionStartupPerfMark(label) {
    try {
        performance.mark('nutrition:' + label);
    } catch (e) {}
}

function nutritionStartupPerfLogSummary() {
    try {
        var marks = performance.getEntriesByType('mark').filter(function(m) {
            return String(m.name).indexOf('nutrition:') === 0;
        });
        if (marks.length) {
            console.log('[nutrition startup]', marks.map(function(e) {
                return e.name.replace(/^nutrition:/, '') + '@' + Math.round(e.startTime) + 'ms';
            }).join(', '));
        }
    } catch (e) {}
}

function patchFoodLogDomAfterEnrich(scrollableWindow, foodItems, enrichedList) {
    scrollableWindow.querySelectorAll('.list-item:not(.planned-meal-item)').forEach(function(el) {
        var item = el._radiantFoodItem;
        if (!item) return;
        var idx = foodItems.indexOf(item);
        var v = idx >= 0 ? enrichedList[idx] : null;
        if (!v) return;
        var span = el.querySelector('.small-text');
        if (span) {
            span.textContent = formatGramsDisplay(item.grams) + 'g, Calories ' + v.calories +
                ', Protein ' + v.protein + 'g, Carbs ' + v.carbs + 'g, Fat ' + v.fat + 'g';
        }
    });
}

function buildMealHeaderHtml(mealType, timeRange, loggedTotals, plannedTotals) {
    let macroLine;
    if (plannedTotals) {
        macroLine =
            `Calories ${loggedTotals.calories} / ${plannedTotals.calories}, ` +
            `Protein ${loggedTotals.protein} / ${plannedTotals.protein}g, ` +
            `Carbs ${loggedTotals.carbs} / ${plannedTotals.carbs}g, ` +
            `Fat ${loggedTotals.fat} / ${plannedTotals.fat}g`;
    } else {
        macroLine =
            `Calories ${loggedTotals.calories}, ` +
            `Protein ${loggedTotals.protein}g, ` +
            `Carbs ${loggedTotals.carbs}g, ` +
            `Fat ${loggedTotals.fat}g`;
    }
    return (
        '<span>' + escapeHtml(mealType) + ' ' + escapeHtml(timeRange) + '</span>' +
        '<br><span class="small-text">' + macroLine + '</span>'
    );
}

function updateMealHeaderCaloriesFromEnriched(scrollableWindow, enrichedList) {
    var todayDayOfWeek = new Date().getDay();
    var mealPlanning = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    scrollableWindow.querySelectorAll('.meal-header-container[data-meal]').forEach(function(container) {
        var mealType = container.dataset.meal;
        if (!mealType) return;
        var mealTotals = calculateMealTotals(enrichedList, mealType);
        var plannedTotals = calculatePlannedMealTotals(mealType, mealPlanning, todayDayOfWeek);
        var mealHeader = container.querySelector('.meal-header');
        if (!mealHeader) return;
        var timeRange = getMealTimeRange(mealType);
        mealHeader.innerHTML = buildMealHeaderHtml(mealType, timeRange, mealTotals, plannedTotals);
    });
}

async function displayFoodItems(foodItems) {
    if (!foodItems) foodItems = [];
    var generation = ++displayFoodItemsGeneration;
    var scrollableWindow = document.getElementById('scrollableWindow');
    var foodInput = document.querySelector('.food');
    var gramsInput = document.querySelector('.grams');
    var selectedMeal = document.getElementById('mealFilter').value;

    var quickList = foodItems.map(function(it) {
        return typeof quickDisplayMacrosForLogItem === 'function'
            ? quickDisplayMacrosForLogItem(it)
            : Object.assign({}, it);
    });
    function viewForItem(item) {
        var idx = foodItems.indexOf(item);
        return idx >= 0 ? quickList[idx] : item;
    }

    // --- Snapshot per-meal collapse state before any DOM changes ---
    const collapseState = {};
    ['breakfast', 'lunch', 'dinner', 'snack'].forEach(function(m) {
        const el = scrollableWindow.querySelector(`.meal-items-${m}`);
        if (el) collapseState[m] = el.style.display;
    });

    // Check for meal plan items for today
    const todayDayOfWeek = new Date().getDay();
    const mealPlanning = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());

    // Filter items based on selected meal
    let itemsToDisplay = foodItems;
    if (selectedMeal !== 'All') {
        itemsToDisplay = foodItems.filter(item => getMealType(item.timeAdded) === selectedMeal);
    }

    if (selectedMeal === 'All') {
        const meals = groupByMeal(itemsToDisplay);
        const defaultMealOrder = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
        const currentMealType = getCurrentMealType();
        const mealOrder = [currentMealType, ...defaultMealOrder.filter(meal => meal !== currentMealType)];

        // Build a set of meal keys that should be visible this render
        const visibleMeals = new Set();
        const hasAnyElements = Object.keys((mealPlanning && mealPlanning.mealElements) || {}).length > 0;

        mealOrder.forEach(mealType => {
            const hasRegularItems = meals[mealType].length > 0;
            const shouldShowSection = mealType === 'Breakfast' || mealType === 'Lunch' || mealType === 'Dinner' ||
                                     hasRegularItems || hasPlannedItemsFor(mealType, mealPlanning, todayDayOfWeek) ||
                                     (mealType === 'Snack' && hasAnyElements);
            if (shouldShowSection) visibleMeals.add(mealType);
        });

        // Remove sections that are no longer needed
        Array.from(scrollableWindow.querySelectorAll('.meal-header-container[data-meal]')).forEach(function(el) {
            if (!visibleMeals.has(el.dataset.meal)) {
                const key = el.dataset.meal.toLowerCase();
                const itemsEl = scrollableWindow.querySelector(`.meal-items-${key}`);
                if (itemsEl) itemsEl.remove();
                el.remove();
            }
        });

        // Use a document fragment to batch new section insertions
        const fragment = document.createDocumentFragment();

        mealOrder.forEach(mealType => {
            if (!visibleMeals.has(mealType)) return;

            const mealKey = mealType.toLowerCase();
            const mealTotals = calculateMealTotals(quickList, mealType);
            const timeRange = getMealTimeRange(mealType);
            const plannedTotals = calculatePlannedMealTotals(mealType, mealPlanning, todayDayOfWeek);
            const headerText = buildMealHeaderHtml(mealType, timeRange, mealTotals, plannedTotals);

            // Reuse existing header container if present, otherwise create it
            let mealHeaderContainer = scrollableWindow.querySelector(`.meal-header-container[data-meal="${mealType}"]`);
            let mealItemsContainer = scrollableWindow.querySelector(`.meal-items-${mealKey}`);

            const canSave = meals[mealType].length > 0;

            if (mealHeaderContainer) {
                // Update header text in-place (preserves toggle button and its listener)
                const mealHeader = mealHeaderContainer.querySelector('.meal-header');
                if (mealHeader) mealHeader.innerHTML = headerText;
                ensureMealHeaderActions(mealHeaderContainer, mealType, canSave);
                // Clear item children only — reuse the container element itself
                mealItemsContainer.innerHTML = '';
            } else {
                // Build new header container
                mealHeaderContainer = document.createElement('div');
                mealHeaderContainer.className = 'meal-header-container';
                mealHeaderContainer.dataset.meal = mealType;
                mealHeaderContainer.style.cssText =
                    'display:flex;justify-content:space-between;align-items:flex-start;' +
                    'background-color:var(--background-color);padding:6px 10px 6px 0;margin-top:8px;' +
                    'border-bottom:1px solid var(--border-color);font-weight:bold;' +
                    'font-size:14px;opacity:0.8;';

                const mealHeader = document.createElement('div');
                mealHeader.className = 'meal-header';
                mealHeader.style.flex = '1';
                mealHeader.innerHTML = headerText;

                const toggleButton = document.createElement('button');
                toggleButton.className = 'meal-toggle-btn';
                toggleButton.textContent = '▼';
                toggleButton.style.cssText =
                    'background:var(--button);color:var(--text-color);border:1px solid var(--border-color);' +
                    'border-radius:3px;padding:4px 8px;cursor:pointer;font-size:12px;' +
                    'min-width:30px;text-align:center;transition:background-color 0.2s;';
                toggleButton.addEventListener('click', function() {
                    toggleMealCategory(mealType, toggleButton);
                });

                mealHeaderContainer.appendChild(mealHeader);
                mealHeaderContainer.appendChild(toggleButton);
                ensureMealHeaderActions(mealHeaderContainer, mealType, canSave);

                mealItemsContainer = document.createElement('div');
                mealItemsContainer.className = `meal-items-container meal-items-${mealKey}`;

                fragment.appendChild(mealHeaderContainer);
                fragment.appendChild(mealItemsContainer);
            }

            if (pendingExpandMealType && mealType === pendingExpandMealType) {
                applyMealCollapseState(mealHeaderContainer, mealItemsContainer, true);
                pendingExpandMealType = null;
            } else if (collapseState[mealKey] !== undefined) {
                applyMealCollapseState(mealHeaderContainer, mealItemsContainer, collapseState[mealKey] !== 'none');
            } else {
                applyMealCollapseState(mealHeaderContainer, mealItemsContainer, isMealExpandedByDefault(mealType));
            }

            // Populate items into the (cleared or new) items container
            const itemFragment = document.createDocumentFragment();

            [...meals[mealType]].reverse().forEach(function(item) {
                displayFoodItem(item, foodItems, itemFragment, foodInput, gramsInput, viewForItem(item));
            });

            if (hasPlannedItemsFor(mealType, mealPlanning, todayDayOfWeek)) {
                const plannedItems = getPlannedItemsForSlot(mealPlanning, todayDayOfWeek, mealKey);
                const slotCompleted = MealPlanning.getSlotCompleted(mealPlanning, todayDayOfWeek, mealKey);
                const slotRemoved = MealPlanning.getSlotRemoved(mealPlanning, todayDayOfWeek, mealKey);
                plannedItems
                    .filter(item => !slotCompleted.includes(item.name) && !slotRemoved.includes(item.name))
                    .forEach(function(item) {
                        displayPlannedMealItem(item, itemFragment, foodInput, gramsInput, mealKey);
                    });
            }

            mealItemsContainer.appendChild(itemFragment);
        });

        // Append any newly created sections in correct order
        scrollableWindow.appendChild(fragment);

        // Re-order existing sections to match mealOrder
        mealOrder.forEach(mealType => {
            if (!visibleMeals.has(mealType)) return;
            const mealKey = mealType.toLowerCase();
            const headerEl = scrollableWindow.querySelector(`.meal-header-container[data-meal="${mealType}"]`);
            const itemsEl = scrollableWindow.querySelector(`.meal-items-${mealKey}`);
            if (headerEl) scrollableWindow.appendChild(headerEl);
            if (itemsEl) scrollableWindow.appendChild(itemsEl);
        });

    } else {
        // Filtered single-meal view — simple rebuild (no persistent state to preserve)
        scrollableWindow.innerHTML = '';
        const fragment = document.createDocumentFragment();
        itemsToDisplay.forEach(function(item) {
            displayFoodItem(item, foodItems, fragment, foodInput, gramsInput, viewForItem(item));
        });
        scrollableWindow.appendChild(fragment);
    }

    var quickTotals = calculateMealTotals(quickList, selectedMeal);
    updateProgressBars(quickTotals);

    enrichFoodLogDayItems(foodItems).then(function(enrichedList) {
        if (generation !== displayFoodItemsGeneration) return;
        patchFoodLogDomAfterEnrich(scrollableWindow, foodItems, enrichedList);
        if (selectedMeal === 'All') {
            updateMealHeaderCaloriesFromEnriched(scrollableWindow, enrichedList);
        }
        var totals = calculateMealTotals(enrichedList, selectedMeal);
        updateProgressBars(totals);
        nutritionStartupPerfMark('enrichDone');
        nutritionStartupPerfLogSummary();
    }).catch(function(err) {
        console.warn('enrichFoodLogDayItems', err);
    });
}

// Helper extracted to keep displayFoodItems readable
function hasPlannedItemsFor(mealType, mealPlanning, dayOfWeek) {
    return !!getPlannedItemsForSlot(mealPlanning, dayOfWeek, mealType.toLowerCase());
}

// ---- Undo deletion stack (max 3 entries, 10-second auto-dismiss) ----
const deletionStack = [];
const UNDO_TIMEOUT_MS = 10000;
let undoTimer = null;

function pushDeletion(item, index) {
    deletionStack.push({ item: JSON.parse(JSON.stringify(item)), index: index, date: today });
    if (deletionStack.length > 3) deletionStack.shift();
    renderUndoButton();
    clearTimeout(undoTimer);
    undoTimer = setTimeout(clearDeletionStack, UNDO_TIMEOUT_MS);
}

function clearDeletionStack() {
    deletionStack.length = 0;
    renderUndoButton();
}

function renderUndoButton() {
    const btn = document.getElementById('undoBtn');
    if (!btn) return;
    if (deletionStack.length === 0) {
        btn.style.display = 'none';
        startHintCycle();   // resume hints once undo button goes away
    } else {
        btn.style.display = 'block';
        btn.textContent = `↩ Undo deletion (${deletionStack.length})`;
        pauseHints();       // hide hints while undo button is visible
    }
}

function initUndoButton() {
    const undoBtn = document.getElementById('undoBtn');
    if (undoBtn) {
        undoBtn.addEventListener('click', function() {
            if (deletionStack.length === 0) return;
            const entry = deletionStack.pop();
            clearTimeout(undoTimer);

            var foodLog = RadiantStorage.nutrition.getFoodLog();
            if (!foodLog[entry.date]) foodLog[entry.date] = [];
            // Re-insert at original index (clamped to current length)
            const insertAt = Math.min(entry.index, foodLog[entry.date].length);
            foodLog[entry.date].splice(insertAt, 0, entry.item);
            RadiantStorage.nutrition.saveFoodLog(foodLog);

            displayFoodItems(foodLog[entry.date]);
            renderUndoButton();

            if (deletionStack.length > 0) {
                undoTimer = setTimeout(clearDeletionStack, UNDO_TIMEOUT_MS);
            }
        });
    }
}
// ---- end undo stack ----

// ---- Contextual hint cycle ----
// Hints rotate in the top-left slot (shared with the undo button).
// The cycle pauses automatically while the undo button is visible.
const HINTS = [
    'Tap ✏️ (or right-click) on a food row to edit it',
    'Delete an item to copy it to the entry field',
    'Search with multiple partial words',
    'Tap a meal header to collapse it',
    'Filter by meal type using the selector above',
    'Up to 3 recent deletions can be undone',
    'Yellow bars = eaten in the last hour',
    'Set custom meal time windows in Settings',
    'Your calorie goal is set in your profile',
    'Can\'t find a food? Try pick something similar',
    'If you had bad sleep, focus on recovery and drink enough water',
    'If you are going to be inactive, required caloric intake will be lower',
    'Taking a break from eating during the day may lower your overall calorie intake',
    'You might feel sluggish if you dont have electrolytes',
    'Create custom meal plans in the meal planner',
    'Create custom foods in the recipe builder',
    'View nutrient analysis in the nutrient analysis page',
    
];
var HINT_SHORT_DISPLAY_MS = 10000;
var HINT_EXTRA_DWELL_AFTER_SCROLL_MS = 10000;

let _hintIdx    = Math.floor(Math.random() * HINTS.length);
let _hintTimer  = null;
let _hintPaused = false;

let _hintAnimGen = 0;
let _hintActiveAnim = null;

function cancelHintAnimations() {
    _hintAnimGen++;
    if (_hintActiveAnim) {
        try { _hintActiveAnim.cancel(); } catch (ignore) {}
        _hintActiveAnim = null;
    }
}

function _fadeThenApplyHint() {
    var el = document.getElementById('hintText');
    if (!el || _hintPaused) return;
    el.style.opacity = '0';
    setTimeout(function() {
        if (_hintPaused) return;
        _applyHint();
    }, 500);
}

function queueNextHint(delayMs) {
    clearTimeout(_hintTimer);
    _hintTimer = setTimeout(function() {
        if (_hintPaused) return;
        _fadeThenApplyHint();
    }, delayMs);
}

function _scheduleHintPanOnce(gen, outer, inner, maxPx) {
    var pauseMs = 1800;
    var pxPerMs = 1 / 42; /* ~42px/sec vertical drift */
    var scrollMs = Math.max(3400, maxPx / pxPerMs);
    var totalMs = pauseMs + scrollMs + pauseMs;
    var a = pauseMs / totalMs;
    var b = (pauseMs + scrollMs) / totalMs;

    if (_hintPaused || gen !== _hintAnimGen || !outer.isConnected) return;

    inner.style.transform = 'translateY(0)';
    inner.getAnimations().forEach(function(an) {
        try { an.cancel(); } catch (ignore) {}
    });
    var anim = inner.animate([
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(0)', offset: a },
        { transform: 'translateY(' + (-maxPx) + 'px)', offset: b },
        { transform: 'translateY(' + (-maxPx) + 'px)', offset: 1 }
    ], {
        duration: totalMs,
        easing: 'linear',
        fill: 'forwards'
    });
    _hintActiveAnim = anim;
    anim.finished.then(function() {
        if (_hintPaused || gen !== _hintAnimGen) return;
        setTimeout(function() {
            if (_hintPaused || gen !== _hintAnimGen) return;
            _fadeThenApplyHint();
        }, HINT_EXTRA_DWELL_AFTER_SCROLL_MS);
    }).catch(function() {});
}

function measureAndRunHintPan() {
    clearTimeout(_hintTimer);
    _hintTimer = null;
    cancelHintAnimations();
    var gen = _hintAnimGen;
    var outer = document.getElementById('hintText');
    if (!outer || _hintPaused) return;
    var inner = outer.querySelector('.hint-scroll-inner');
    if (!inner) return;

    inner.textContent = HINTS[_hintIdx];

    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            if (gen !== _hintAnimGen || _hintPaused) return;
            var maxPx = inner.scrollHeight - outer.clientHeight;
            if (maxPx <= 2) {
                inner.style.transform = 'translateY(0)';
                inner.getAnimations().forEach(function(an) {
                    try { an.cancel(); } catch (ignore) {}
                });
                _hintIdx = (_hintIdx + 1) % HINTS.length;
                queueNextHint(HINT_SHORT_DISPLAY_MS);
                return;
            }
            _hintIdx = (_hintIdx + 1) % HINTS.length;
            _scheduleHintPanOnce(gen, outer, inner, maxPx);
        });
    });
}

function _applyHint() {
    var el = document.getElementById('hintText');
    if (!el || _hintPaused) return;
    el.style.opacity = '1';
    measureAndRunHintPan();
}

function startHintCycle() {
    _hintPaused = false;
    clearTimeout(_hintTimer);
    _hintTimer = null;
    _applyHint();
}

function pauseHints() {
    _hintPaused = true;
    clearTimeout(_hintTimer);
    cancelHintAnimations();
    var el = document.getElementById('hintText');
    if (el) el.style.opacity = '0';
}
// ---- end hint cycle ----

// ---- Inline edit modal (✏️ or right-click on a food row) ----
var editTarget = null; // { item, allFoodItems, originalTimeAdded, timeSyncGroup }

function normalizeLogTimeString(t) {
    if (!t) return '';
    var parts = String(t).split(':');
    return String(parts[0]).padStart(2, '0') + ':' + String(parts[1] != null && parts[1] !== '' ? parts[1] : '0').padStart(2, '0');
}

function logTimesDifferForEdit(orig, newTime) {
    if (!newTime) return false;
    if (!orig) return false;
    return timeToMinutes(normalizeLogTimeString(orig)) !== timeToMinutes(normalizeLogTimeString(newTime));
}

function foodItemsInTimeSyncWindow(allItems, editedItem, originalTime) {
    if (!originalTime) return [];
    var anchorM = timeToMinutes(normalizeLogTimeString(originalTime));
    return allItems.filter(function(f) {
        if (f === editedItem) return false;
        if (!f.timeAdded) return false;
        return Math.abs(timeToMinutes(normalizeLogTimeString(f.timeAdded)) - anchorM) <= EDIT_TIME_SYNC_WINDOW_MINUTES;
    });
}

function updateEditTimeSyncBlockVisibility() {
    var block = document.getElementById('editTimeSyncBlock');
    if (!block || !editTarget) {
        if (block) block.style.display = 'none';
        return;
    }
    var newT = document.getElementById('editTime').value;
    var group = editTarget.timeSyncGroup;
    var show = !!(newT && editTarget.originalTimeAdded && logTimesDifferForEdit(editTarget.originalTimeAdded, newT) && group && group.length);
    block.style.display = show ? 'block' : 'none';
}

/** @param {{ nutrition_source?: string, fdc_id?: number|null }} item @param {{ source?: string }|null|undefined} foodFromDb */
function formatNutritionDataSourceLabel(item, foodFromDb) {
    var code = item.nutrition_source || (foodFromDb && foodFromDb.source);
    if (code === 'sr_legacy') return 'USDA SR Legacy (offline)';
    if (code === 'foundation') return 'USDA Foundation Foods (offline)';
    if (code === 'branded') return 'USDA branded (offline)';
    if (code === 'off_api') return 'Open Food Facts';
    if (code === 'usda_api') return 'USDA FDC (online)';
    if (item.fdc_id != null && item.fdc_id !== '') {
        if (foodFromDb === null) return 'Food not found in local database';
        return 'USDA database';
    }
    return 'Manual entry';
}

function refreshEditDataSourceRow(item) {
    var srcEl = document.getElementById('editDataSource');
    if (!srcEl) return;
    if (item.nutrition_source) {
        srcEl.textContent = formatNutritionDataSourceLabel(item, null);
        return;
    }
    if (item.fdc_id != null && item.fdc_id !== '') {
        srcEl.textContent = 'Loading…';
        getFoodById(item.fdc_id).then(function(food) {
            if (!editTarget || editTarget.item !== item) return;
            srcEl.textContent = formatNutritionDataSourceLabel(item, food);
        });
        return;
    }
    srcEl.textContent = formatNutritionDataSourceLabel(item, null);
}

function showEditDialog(item, allFoodItems) {
    var origT = item.timeAdded ? normalizeLogTimeString(item.timeAdded) : null;
    var syncItems = foodItemsInTimeSyncWindow(allFoodItems, item, origT);
    editTarget = { item: item, allFoodItems: allFoodItems, originalTimeAdded: origT, timeSyncGroup: syncItems };

    document.getElementById('editItemTitle').textContent = 'Edit: ' + item.name;
    refreshEditDataSourceRow(item);
    document.getElementById('editGrams').value = item.grams;
    // Ensure HH:MM format (time input requires zero-padded hours)
    var timeVal = item.timeAdded ? normalizeLogTimeString(item.timeAdded) : '';
    document.getElementById('editTime').value = timeVal;

    var blurb = document.getElementById('editTimeSyncBlurb');
    var listEl = document.getElementById('editTimeSyncList');
    var syncChk = document.getElementById('editTimeSyncCheckbox');
    blurb.textContent = 'Other food logged within ' + EDIT_TIME_SYNC_WINDOW_MINUTES + ' minutes of this item:';
    listEl.textContent = '';
    syncItems.forEach(function(f) {
        var li = document.createElement('li');
        li.textContent = f.name + ' — ' + formatGramsDisplay(f.grams) + 'g';
        listEl.appendChild(li);
    });
    if (syncChk) syncChk.checked = true;

    document.getElementById('editItemDialog').style.display = 'flex';
    document.getElementById('blurOverlay').classList.add('active');
    updateEditTimeSyncBlockVisibility();
}

function hideEditDialog() {
    document.getElementById('editItemDialog').style.display = 'none';
    document.getElementById('blurOverlay').classList.remove('active');
    editTarget = null;
}

// ---- nutrient details ----
// Nutrient display metadata — only the things USDA_ID_TO_KEY can't tell us.
// Keys come from USDA_ID_TO_KEY; only non-'g' units and non-obvious labels need entries here.
var NUTRIENT_META = {
    calories:          ['kcal'],
    fat:               ['g',  'Total Fat'],
    carbohydrate:      ['g',  'Total Carbs'],
    fiber:             ['g',  'Dietary Fiber'],
    sugars:            ['g',  'Total Sugars'],
    cholesterol:       ['mg'],
    sodium:            ['mg'], calcium:    ['mg'], iron:       ['mg'],
    magnesium:         ['mg'], phosphorus: ['mg'], potassium:  ['mg'],
    zinc:              ['mg'], copper:     ['mg'],
    selenium:          ['µg'],
    vitamin_c:         ['mg'], thiamin:    ['mg', 'Thiamin (B1)'],
    riboflavin:        ['mg', 'Riboflavin (B2)'],
    niacin:            ['mg', 'Niacin (B3)'],
    vitamin_b6:        ['mg'], folate:     ['µg', 'Folate (B9)'],
    vitamin_b12:       ['µg'], vitamin_a:  ['µg'],
    vitamin_e:         ['mg'], vitamin_d:  ['µg'], vitamin_k:  ['µg'],
};
// Keys that mark the start of a new display group (order follows USDA_ID_TO_KEY)
var NUTRIENT_GROUP_AT = {
    calories:   'Calories',
    protein:    'Macronutrients',
    sodium:     'Minerals',
    vitamin_c:  'Vitamins',
    tryptophan: 'Amino Acids',
};
var DAILY_VALUES = {
    fat: 78,
    saturated_fat: 20,
    cholesterol: 300,
    sodium: 2300,
    fiber: 28,
    protein: 50,
    vitamin_d: 20,
    calcium: 1300,
    iron: 18,
    potassium: 4700,
    zinc: 11,
    magnesium: 420,
    vitamin_a: 900,
    vitamin_c: 90,
    vitamin_e: 15,
    vitamin_k: 120,
    thiamin: 1.2,
    riboflavin: 1.3,
    niacin: 16,
    vitamin_b6: 1.7,
    folate: 400,
    vitamin_b12: 2.4,
};
function _nutrientLabel(key) {
    var meta = NUTRIENT_META[key];
    if (meta && meta[1]) return meta[1];
    return key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}
function _nutrientUnit(key) {
    var meta = NUTRIENT_META[key];
    return meta ? meta[0] : 'g';
}

async function showNutrientDetails(item) {
    var modal = document.getElementById('nutrientDetailModal');
    var title = document.getElementById('nutrientDetailTitle');
    var body  = document.getElementById('nutrientDetailBody');
    var grams = item.grams || 100;
    var scale = grams / 100;

    title.textContent = item.name + ' (' + grams + 'g)';
    body.textContent = 'Loading…';
    modal.style.display = 'flex';

    var nutrients = null;
    if (item.fdc_id != null && item.fdc_id !== '') {
        var food = await getFoodById(item.fdc_id);
        if (food && food.nutrients) nutrients = food.nutrients;
    }
    if (!nutrients && item.fdc_id == null) {
        var recipeFood = await getFoodFromRecipeStore(item.name);
        if (recipeFood && recipeFood.nutrients) nutrients = recipeFood.nutrients;
    }
    // Fallback: build from inline macros
    if (!nutrients) {
        nutrients = {
            calories:     (item.calories || 0) / scale,
            protein:      (item.protein  || 0) / scale,
            fat:          (item.fat      || 0) / scale,
            carbohydrate: (item.carbs    || 0) / scale,
        };
    }

    var html = '';
    var pendingGroup = null;
    var groupHtml = '';
    function flushGroup() {
        if (groupHtml) {
            html += '<div style="margin-top:12px;"><div style="font-weight:bold;opacity:.6;font-size:0.8em;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">' +
                pendingGroup + '</div>' + groupHtml + '</div>';
        }
        groupHtml = '';
    }
    Object.values(USDA_ID_TO_KEY).forEach(function(key) {
        if (NUTRIENT_GROUP_AT[key]) { flushGroup(); pendingGroup = NUTRIENT_GROUP_AT[key]; }
        var val = nutrients[key];
        if (val == null) return;
        var scaled = Math.round(val * scale * 1000) / 1000;
        var row = '<span style="opacity:.85;">' + _nutrientLabel(key) + '</span>' +
            '<span><strong>' + scaled + '</strong> ' + _nutrientUnit(key);
        if (DAILY_VALUES[key] && scaled > 0) {
            var pct = Math.round((scaled / DAILY_VALUES[key]) * 100);
            row += ' (<span style="opacity:.6;font-size:0.9em;">' + pct + '%</span> <span style="opacity:.6;font-size:0.85em;">DV</span>)';
        }
        row += '</span>';
        groupHtml += '<div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08);padding:2px 0;">' + row + '</div>';
    });
    flushGroup();
    body.innerHTML = html || '<p style="opacity:.7;">No detailed nutrient data available for this item.</p>';
}

function initNutrientDetailModal() {
    document.getElementById('nutrientDetailClose').addEventListener('click', function() {
        document.getElementById('nutrientDetailModal').style.display = 'none';
    });
    document.getElementById('nutrientDetailModal').addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });
}
// ---- end nutrient details ----

function initEditItemDialog() {
    document.getElementById('editItemSave').addEventListener('click', function() {
        if (!editTarget) return hideEditDialog();
        var newGrams = parseFloat(document.getElementById('editGrams').value);
        var newTime  = document.getElementById('editTime').value;
        if (!newGrams || newGrams <= 0) {
            document.getElementById('editGrams').focus();
            return;
        }

        var item = editTarget.item;
        var allFoodItems = editTarget.allFoodItems;
        var origTime = editTarget.originalTimeAdded;
        var timeSyncGroup = editTarget.timeSyncGroup || [];

        var timeSyncRelevant = !!(newTime && logTimesDifferForEdit(origTime, newTime) && timeSyncGroup.length);
        var shouldSyncGroupTimes = timeSyncRelevant && document.getElementById('editTimeSyncCheckbox').checked;

        getNutritionalInfo(
                item.name,
                newGrams,
                item != null && item.fdc_id != null && item.fdc_id !== ''
                    ? item.fdc_id
                    : undefined,
                item.fdc_id == null ? 'recipe' : undefined
            )
            .then(function(nutrition) {
                item.grams = newGrams;
                if (item.fdc_id != null && item.fdc_id !== '') {
                    delete item.calories;
                    delete item.protein;
                    delete item.carbs;
                    delete item.fat;
                } else {
                    item.calories = nutrition.calories;
                    item.fat = nutrition.fat;
                    item.protein = nutrition.protein;
                    item.carbs = nutrition.carbs;
                }
                if (newTime) {
                    item.timeAdded = newTime;
                    if (shouldSyncGroupTimes) {
                        timeSyncGroup.forEach(function(f) { f.timeAdded = newTime; });
                    }
                }

                var foodLog = RadiantStorage.nutrition.getFoodLog();
                foodLog[today] = allFoodItems;
                RadiantStorage.nutrition.saveFoodLog(foodLog);
                displayFoodItems(allFoodItems);
                hideEditDialog();
            })
            .catch(function() {
                // Nutrition lookup failed — still save grams/time without re-calculating
                item.grams = newGrams;
                if (newTime) {
                    item.timeAdded = newTime;
                    if (shouldSyncGroupTimes) {
                        timeSyncGroup.forEach(function(f) { f.timeAdded = newTime; });
                    }
                }
                var foodLog = RadiantStorage.nutrition.getFoodLog();
                foodLog[today] = allFoodItems;
                RadiantStorage.nutrition.saveFoodLog(foodLog);
                displayFoodItems(allFoodItems);
                hideEditDialog();
            });
    });

    document.getElementById('editItemCancel').addEventListener('click', hideEditDialog);

    (function() {
        var t = document.getElementById('editTime');
        t.addEventListener('input', updateEditTimeSyncBlockVisibility);
        t.addEventListener('change', updateEditTimeSyncBlockVisibility);
    })();

    // Allow saving by pressing Enter when focused on any editable field in the dialog — works for touch keyboards and physical keyboard
    var editInputFields = ['editGrams', 'editTime'];
    document.getElementById('editItemDialog').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && editInputFields.includes(e.target.id)) {
            e.preventDefault();
            document.getElementById('editItemSave').click();
            return;
        }
        if (e.key === 'Escape') hideEditDialog();
    });
}
// ---- end edit modal ----

/** Grams shown after delete; `.grams` clears itself on focus, so assign value after focus(). */
function deletedGramsForInputField(grams) {
    return gramsToInputValue(grams);
}

function collapseAllFoodItemActions() {
    var expanded = document.querySelectorAll('.list-item.expanded');
    expanded.forEach(function(el) {
        el.classList.remove('expanded');
    });
}

function displayFoodItem(item, allFoodItems, scrollableWindow, foodInput, gramsInput, viewRow) {
    var v = viewRow || item;
    var listItem = document.createElement('div');
    listItem.className = 'list-item';
    listItem._radiantFoodItem = item;
    var foodEmoji = getFoodEmoji(item.name);
    listItem.innerHTML =
        (foodEmoji ? escapeHtml(foodEmoji) + ' ' : '') + escapeHtml(item.name) +
        '<br><span class="small-text">' + formatGramsDisplay(item.grams) + 'g, Calories ' + v.calories +
        ', Protein ' + v.protein + 'g, Carbs ' + v.carbs + 'g, Fat ' + v.fat + 'g</span>';

    var deleteButton = document.createElement('button');
    deleteButton.textContent = '❌';
    deleteButton.className = 'delete-btn';
    deleteButton.setAttribute('aria-label', 'Remove food item');
    deleteButton.addEventListener('click', function(e) {
        e.stopPropagation();

        var itemIndex = allFoodItems.indexOf(item);
        if (itemIndex !== -1) {
            pushDeletion(item, itemIndex);
            allFoodItems.splice(itemIndex, 1);
            var foodLog = RadiantStorage.nutrition.getFoodLog();
            foodLog[today] = allFoodItems;
            RadiantStorage.nutrition.saveFoodLog(foodLog);
            displayFoodItems(allFoodItems);
        }

        // Repopulate the input fields with the deleted food info for quick re-add
        foodInput.value = item.name;
        if (item.fdc_id != null && item.fdc_id !== '') {
            foodInput.dataset.fdcId = String(item.fdc_id);
        } else {
            delete foodInput.dataset.fdcId;
        }
        var gramsStr = deletedGramsForInputField(item.grams);
        gramsInput.focus();
        gramsInput.value = gramsStr;
        gramsInput.select();

        collapseAllFoodItemActions();
    });

    var editButton = document.createElement('button');
    editButton.textContent = '✏️';
    editButton.className = 'edit-item-btn';
    editButton.setAttribute('aria-label', 'Edit food item');
    editButton.addEventListener('click', function(e) {
        e.stopPropagation();
        showEditDialog(item, allFoodItems);
        collapseAllFoodItemActions();
    });

    var infoButton = document.createElement('button');
    infoButton.textContent = 'ℹ️';
    infoButton.className = 'info-btn';
    infoButton.setAttribute('aria-label', 'View nutrient details');
    infoButton.addEventListener('click', function(e) {
        e.stopPropagation();
        showNutrientDetails(item);
        collapseAllFoodItemActions();
    });

    var itemActions = document.createElement('div');
    itemActions.className = 'list-item-actions';
    itemActions.appendChild(deleteButton);
    itemActions.appendChild(editButton);
    itemActions.appendChild(infoButton);
    listItem.appendChild(itemActions);

    var toggleButton = document.createElement('button');
    toggleButton.className = 'toggle-actions-btn';
    toggleButton.setAttribute('aria-label', 'Toggle actions');
    toggleButton.addEventListener('click', function(e) {
        e.stopPropagation();
        listItem.classList.toggle('expanded');
    });
    listItem.appendChild(toggleButton);

    listItem.addEventListener('click', function(e) {
        foodInput.value = item.name;
        if (item.fdc_id != null && item.fdc_id !== '') {
            foodInput.dataset.fdcId = String(item.fdc_id);
        } else {
            delete foodInput.dataset.fdcId;
        }
        
        window._radiantSkipGramsClear = true;
        gramsInput.focus();
        gramsInput.select();
        
        // Fetch serving weight and description
        if (item.fdc_id != null && item.fdc_id !== '') {
            getFoodById(item.fdc_id).then(function(food) {
                if (!food) return;
                if (food.serving_weight != null) {
                    window._radiantSkipGramsClear = true;
                    gramsInput.value = gramsToInputValue(food.serving_weight);
                    gramsInput.select();
                }
                if (food.serving_description && typeof showServingBubble === 'function') {
                    showServingBubble(food.serving_description, gramsInput);
                }
            });
        } else {
            getFoodFromRecipeStore(item.name).then(function(recipeRow) {
                if (recipeRow && recipeRow.servingWeight1 != null) {
                    window._radiantSkipGramsClear = true;
                    gramsInput.value = gramsToInputValue(recipeRow.servingWeight1);
                    gramsInput.select();
                    if (typeof showServingBubble === 'function' && recipeRow.servingDescription1) {
                        showServingBubble(recipeRow.servingDescription1, gramsInput);
                    }
                    return;
                }
                fetchValueForKey(item.name, 'servingWeight1', function(value) {
                    if (value) {
                        window._radiantSkipGramsClear = true;
                        gramsInput.value = gramsToInputValue(value);
                        gramsInput.select();
                    }
                });
                fetchValueForKey(item.name, 'servingDescription1', function(description) {
                    if (typeof showServingBubble === 'function' && description) {
                        showServingBubble(description, gramsInput);
                    }
                });
            });
        }
    });

    // Right-click opens edit dialog (fine pointer only — touch/tablet keeps ✏️, no dedicated long-press)
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        listItem.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showEditDialog(item, allFoodItems);
        });
    }

    scrollableWindow.appendChild(listItem);
}

function displayPlannedMealItem(item, scrollableWindow, foodInput, gramsInput, slot) {
    var listItem = document.createElement('div');
    listItem.className = 'list-item planned-meal-item';
    listItem.style.opacity = '0.6';
    listItem.style.backgroundColor = 'rgba(255, 255, 200, 0.15)';
    listItem.style.cursor = 'pointer'; // Make it clear it's clickable
    
    var plannedEmoji = getFoodEmoji(item.name);
    listItem.innerHTML =
        (plannedEmoji ? escapeHtml(plannedEmoji) + ' ' : '') + escapeHtml(item.name) +
        '<br><span class="small-text">' + formatGramsDisplay(item.grams) + 'g, Calories ' + item.calories +
        ', Protein ' + item.protein + 'g, Carbs ' + item.carbs + 'g, Fat ' + item.fat + 'g</span>';

    // Add red X button for removal
    var removeButton = document.createElement('button');
    removeButton.textContent = '❌';
    removeButton.className = 'delete-btn';
    removeButton.style.float = 'right';
    
    removeButton.addEventListener('click', function(e) {
        e.stopPropagation();
        removePlannedMealItem(item, slot);
    });

    // Add click handler to apply the planned item
    listItem.addEventListener('click', function(e) {
        e.stopPropagation();
        applyPlannedMealItem(item, slot);
    });

    listItem.appendChild(removeButton);
    scrollableWindow.appendChild(listItem);
}

function removePlannedMealItem(item, slot) {
    const todayDayOfWeek = new Date().getDay();
    const mealPlanning = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());

    // Removal is per slot, so the same food at another slot is untouched.
    const removed = MealPlanning.addSlotRemoved(mealPlanning, todayDayOfWeek, slot, item.name);
    if (removed.indexOf(item.name) !== -1) {
        RadiantStorage.nutrition.saveMealPlanning(mealPlanning);
    }

    // Refresh the display
    const foodLog = RadiantStorage.nutrition.getFoodLog();
    const foodItems = foodLog[today] || [];
    displayFoodItems(foodItems);
}

function applyPlannedMealItem(item, slot) {
    const todayDayOfWeek = new Date().getDay();
    
    // Add the planned item to the food log
    const foodLog = RadiantStorage.nutrition.getFoodLog();
    if (!foodLog[today]) {
        foodLog[today] = [];
    }
    
    const foodItem = {
        name: item.name,
        grams: item.grams,
        timeAdded: formatTime(new Date())
    };
    if (item.fdc_id != null && item.fdc_id !== '') {
        foodItem.fdc_id = item.fdc_id;
    } else {
        foodItem.fdc_id = null;
        foodItem.calories = item.calories;
        foodItem.fat = item.fat;
        foodItem.protein = item.protein;
        foodItem.carbs = item.carbs;
    }
    if (item.nutrition_source) {
        foodItem.nutrition_source = item.nutrition_source;
    }

    foodLog[today].push(foodItem);
    RadiantStorage.nutrition.saveFoodLog(foodLog);
    
    // Mark complete in this slot only — the same element in another slot stays open.
    const mealPlanning = MealPlanning.ensureDefaults(RadiantStorage.nutrition.getMealPlanning());
    MealPlanning.addSlotCompleted(mealPlanning, todayDayOfWeek, slot, item.name);
    RadiantStorage.nutrition.saveMealPlanning(mealPlanning);

    // Refresh the display
    displayFoodItems(foodLog[today]);
}

function toggleMealCategory(mealType, button) {
    var mealKey = mealType.toLowerCase();
    var scrollRoot = document.getElementById('scrollableWindow');
    var mealItemsContainer = scrollRoot
        ? scrollRoot.querySelector('.meal-items-' + mealKey)
        : null;
    if (!mealItemsContainer) return;

    var mealHeaderContainer = scrollRoot.querySelector('.meal-header-container[data-meal="' + mealType + '"]');
    applyMealCollapseState(mealHeaderContainer, mealItemsContainer, mealItemsContainer.style.display === 'none');
    persistMealCollapsePreference();
}





document.addEventListener('DOMContentLoaded', async function() {
	console.log('IndexedDB support:', 'indexedDB' in window);
	nutritionStartupPerfMark('domReady');

	checkProfileCompletion();
	migrateOldMealPlanData();
	initMealSaveDialog();
	initOffsetDialog();
	initUndoButton();
	initNutrientDetailModal();
	initEditItemDialog();
	initUnitSelector();
	setupUnitSelector();

	document.addEventListener('click', collapseAllFoodItemActions);

	today = getTodayKey();
	RadiantStorage.nutrition.setToday(today);

	foodInput = document.querySelector('.food');
	autocompleteList = document.getElementById('autocompleteList');
	updateScrollableWindowHeight();
	window.addEventListener('resize', updateScrollableWindowHeight);
	window.addEventListener('pagehide', persistMealCollapsePreference);

	var scanBtn = document.getElementById('scanBarcodeBtn');
	if (scanBtn) {
		var updateScanButtonIcon = function(inputEl) {
			var hasText = inputEl && String(inputEl.value || '').trim().length > 0;
			scanBtn.textContent = hasText ? '🔍' : '📷';
			scanBtn.title = hasText ? 'Search food name' : 'Scan barcode';
		};
		if (foodInput) {
			foodInput.addEventListener('input', function() {
				updateScanButtonIcon(this);
			});
		}
		scanBtn.addEventListener('click', function() {
			var query = foodInput ? String(foodInput.value || '').trim() : '';
			if (query && typeof openFoodNameSearch === 'function') {
				openFoodNameSearch(query, pushScannerFoodItem);
			} else if (typeof openBarcodeScanner === 'function') {
				openBarcodeScanner(pushScannerFoodItem);
			}
		});
	}

	if (foodInput) {
		foodInput.addEventListener('focus', function() {
			this.value = '';
			updateScanButtonIcon(this);
		});
	}
	var gramsInputEl = document.querySelector('.grams');
	if (gramsInputEl) {
		gramsInputEl.addEventListener('focus', function() {
			if (window._radiantSkipGramsClear) {
				window._radiantSkipGramsClear = false;
				return;
			}
			this.value = '';
		});
		gramsInputEl.addEventListener('keypress', function(event) {
			if (event.key === 'Enter') {
				document.getElementById('addBtn').click();
			}
		});
	}

	var mealFilterEl = document.getElementById('mealFilter');
	if (mealFilterEl) {
		mealFilterEl.addEventListener('change', function() {
			var foodLog = RadiantStorage.nutrition.getFoodLog();
			displayFoodItems(foodLog[today] || []);
		});
	}

	var warmEl = document.getElementById('nutritionWarmStatus');
	function setWarm(msg) {
		if (warmEl) warmEl.textContent = msg || '';
	}

	checkAndResetDailyProgress();

	var foodLog = RadiantStorage.nutrition.getFoodLog();
	var foodItems = foodLog[today] || [];

	try {
		await displayFoodItems(foodItems);
		nutritionStartupPerfMark('firstRenderDone');

		setupHeader();
		startHintCycle();

	} catch (err) {
		console.error('nutrition page init', err);
	}

	setWarm('Loading food database…');

	setTimeout(async function() {
		try {
			if (typeof runFdcBootstrap === 'function') {
				await runFdcBootstrap();
				nutritionStartupPerfMark('bootstrapDone');
			}
		} catch (e) {
			console.warn('FDC bootstrap', e);
		}

		try {
			await initializeFoodList();
			nutritionStartupPerfMark('autocompleteReady');
		} catch (e) {
			console.warn('autocomplete init', e);
		}

		try {
			var foodLogRaw = RadiantStorage.nutrition.getFoodLog();
			setWarm('Updating food log…');
			var mig = await migrateFoodLogIfNeeded(foodLogRaw, function(done, total) {
				setWarm('Updating food log… (' + done + ' / ' + total + ')');
			});
			nutritionStartupPerfMark('migrationDone');
			if (mig.changed) {
				var fl = RadiantStorage.nutrition.getFoodLog();
				displayFoodItems(fl[today] || []);
			}
		} catch (e) {
			console.warn('foodLog migration', e);
		} finally {
			setWarm('');
		}
	}, 0);
});

	// Weekly meal plan progress reset functions
	function checkAndResetDailyProgress() {
		const userTime = RadiantStorage.profile.getUserTime() || '01:00'; // Default to 1:00 AM
		const mealPlanning = RadiantStorage.nutrition.getMealPlanning();
		const currentDate = new Date();

		if (!mealPlanning.lastReset) {
			const weekStart = getWeekStart(currentDate);
			mealPlanning.lastReset = weekStart.toISOString();
			RadiantStorage.nutrition.saveMealPlanning(mealPlanning);
			return false;
		}

		if (shouldResetWeekly(userTime, mealPlanning.lastReset, currentDate)) {
			resetAllCheckmarks();
			const updated = RadiantStorage.nutrition.getMealPlanning();
			updated.lastReset = getWeekStart(currentDate).toISOString();
			RadiantStorage.nutrition.saveMealPlanning(updated);
			return true;
		}
		return false;
	}

	function getWeekStart(date) {
		// Get the start of the week (Sunday)
		const d = new Date(date);
		const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
		const diff = d.getDate() - day; // Days to subtract to get to Sunday
		const weekStart = new Date(d.setDate(diff));
		weekStart.setHours(0, 0, 0, 0);
		return weekStart;
	}

	function shouldResetWeekly(userTime, lastResetDateString, currentDate) {
		if (!lastResetDateString) {
			return false;
		}

		// Parse userTime (format: "HH:MM")
		const [userHour, userMinute] = userTime.split(':').map(Number);
		const userTimeInMinutes = userHour * 60 + userMinute;
		
		// Get current time
		const currentHour = currentDate.getHours();
		const currentMinute = currentDate.getMinutes();
		const currentTimeInMinutes = currentHour * 60 + currentMinute;
		
		// Get the start of the current week (Sunday)
		const currentWeekStart = getWeekStart(currentDate);
		
		// Parse last reset date
		let lastResetDate;
		try {
			lastResetDate = new Date(lastResetDateString);
		} catch (e) {
			// If parsing fails, treat as old format and reset
			return true;
		}
		
		// Get the start of the week for the last reset
		const lastResetWeekStart = getWeekStart(lastResetDate);
		
		// Check if we're in a new week
		if (currentWeekStart.getTime() > lastResetWeekStart.getTime()) {
			// We're in a new week
			const currentDay = currentDate.getDay(); // 0 = Sunday
			
			// If it's Sunday, only reset if we're past the userTime
			if (currentDay === 0) {
				return currentTimeInMinutes >= userTimeInMinutes;
			}
			// If it's any other day (Monday-Saturday), reset because we're past Sunday userTime
			return true;
		}
		
		return false;
	}

	function resetAllCheckmarks() {
		// Clear completed and removed meals for all days of the week
		const mealPlanning = RadiantStorage.nutrition.getMealPlanning();
		mealPlanning.completedMeals = {};
		mealPlanning.removedMeals = {};
		RadiantStorage.nutrition.saveMealPlanning(mealPlanning);
		console.log('Weekly meal plan progress has been reset for the new week.');
	}

	// One-shot migration into the element/template shape. The legacy per-key
	// import runs first (inside the same version-guarded pass).
	function migrateOldMealPlanData() {
		try {
			if (MealPlanning.migrateToElements()) {
				console.log('Meal plan data migrated to reusable meals and day templates.');
			}
		} catch (err) {
			console.error('meal plan migration failed', err);
		}
	}
	
