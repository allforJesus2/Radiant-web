let mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());

document.addEventListener('DOMContentLoaded', function () {
    MealPlanning.migrateToElements();
    // Re-read after migration so the module-level object never writes pre-migration data back.
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    setupHeader('🍽️ Meal Planning');
    checkAndResetDailyProgress();
    loadWeekMealPlans();
    setupEventListeners();
});

function checkAndResetDailyProgress() {
    const userTime = RadiantStorage.profile.getUserTime() || '01:00';
    const currentDate = new Date();

    if (!mealPlanning.lastReset) {
        mealPlanning.lastReset = MealPlanning.getWeekStart(currentDate).toISOString();
        MealPlanning.save(mealPlanning);
        return;
    }

    if (MealPlanning.shouldResetWeekly(userTime, mealPlanning.lastReset, currentDate)) {
        resetAllCheckmarks();
        mealPlanning.lastReset = MealPlanning.getWeekStart(currentDate).toISOString();
        MealPlanning.save(mealPlanning);
        loadWeekMealPlans();
    }
}

function resetAllCheckmarks() {
    mealPlanning.completedMeals = {};
    mealPlanning.removedMeals = {};
    MealPlanning.save(mealPlanning);
}

function resetMealPlanProgress() {
    if (confirm('Are you sure you want to reset all meal plan progress? This will clear all completed and removed meals for the entire week.')) {
        resetAllCheckmarks();
        loadWeekMealPlans();
        alert('Meal plan progress has been reset successfully!');
    }
}

/** Every element is offered in every slot; the slot only supplies presentation. */
function fillElementOptions(select) {
    select.innerHTML = '';
    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = '— none —';
    select.appendChild(noneOption);
    MealPlanning.listElementNames(mealPlanning).forEach(function (name) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

function loadWeekMealPlans() {
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());

    for (let i = 0; i < 7; i++) {
        const dayColumn = document.querySelector('[data-day="' + i + '"]');
        if (!dayColumn) continue;
        const dayMeals = dayColumn.querySelector('.day-meals');
        const slots = MealPlanning.getDaySlots(mealPlanning, i);

        dayColumn.querySelectorAll('.slot-dropdown').forEach(function (dropdown) {
            fillElementOptions(dropdown);
            dropdown.value = slots[dropdown.dataset.slot] || '';
        });

        const templateDropdown = dayColumn.querySelector('.template-dropdown');
        if (templateDropdown) {
            templateDropdown.innerHTML = '<option value="">Apply template…</option>';
            MealPlanning.listTemplateNames(mealPlanning).forEach(function (templateName) {
                const option = document.createElement('option');
                option.value = templateName;
                option.textContent = templateName;
                templateDropdown.appendChild(option);
            });
        }

        displayDayMeals(dayMeals, i);
    }
}

function displayDayMeals(dayMealsContainer, dayOfWeek) {
    if (!dayMealsContainer) return;
    dayMealsContainer.innerHTML = '';

    const slots = MealPlanning.getDaySlots(mealPlanning, dayOfWeek);

    let dailyTotalCalories = 0;
    let dailyTotalProtein = 0;
    let dailyTotalCarbs = 0;
    let dailyTotalFat = 0;
    let hasAnySlot = false;

    MealPlanning.CATEGORIES.forEach(function (category) {
        const elementName = slots[category];
        const element = elementName ? MealPlanning.getElement(mealPlanning, elementName) : null;
        const items = element && Array.isArray(element.items) ? element.items : [];
        // A slot naming a deleted element renders as an empty slot, never throws.
        if (items.length === 0) return;
        hasAnySlot = true;

        const completedItems = MealPlanning.getSlotCompleted(mealPlanning, dayOfWeek, category);
        const removedItems = MealPlanning.getSlotRemoved(mealPlanning, dayOfWeek, category);

        let categoryTotalCalories = 0;
        let categoryTotalProtein = 0;
        let categoryTotalCarbs = 0;
        let categoryTotalFat = 0;

        items.forEach(function (item) {
            if (!removedItems.includes(item.name)) {
                categoryTotalCalories += item.calories || 0;
                categoryTotalProtein += item.protein || 0;
                categoryTotalCarbs += item.carbs || 0;
                categoryTotalFat += item.fat || 0;
            }
        });

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'meal-category-header';
        categoryHeader.innerHTML =
            '<strong>' + MealPlanning.CATEGORY_EMOJIS[category] + ' ' +
            category.charAt(0).toUpperCase() + category.slice(1) + ' — ' +
            MealPlanning.formatTotalsSpan(categoryTotalCalories, categoryTotalProtein, categoryTotalCarbs, categoryTotalFat) +
            '</strong>';
        if (elementName) {
            const nameEl = document.createElement('div');
            nameEl.className = 'small-text slot-element-name';
            nameEl.textContent = elementName;
            categoryHeader.appendChild(nameEl);
        }
        categoryHeader.style.marginTop = '10px';
        categoryHeader.style.marginBottom = '5px';
        categoryHeader.style.color = 'var(--text-color)';
        dayMealsContainer.appendChild(categoryHeader);

        items.forEach(function (item) {
            const mealItem = document.createElement('div');
            mealItem.className = 'meal-item';
            const isCompleted = completedItems.includes(item.name);
            const isRemoved = removedItems.includes(item.name);

            if (isCompleted) mealItem.classList.add('completed');
            else if (isRemoved) mealItem.classList.add('removed');

            const mealEmoji = typeof getFoodEmoji === 'function' ? getFoodEmoji(item.name) : '';

            const detail = document.createElement('div');
            detail.innerHTML = '<strong>' + (mealEmoji ? mealEmoji + ' ' : '') + item.name + '</strong>';
            const smallText = document.createElement('span');
            smallText.className = 'small-text';
            smallText.textContent = item.grams + 'g - ' + MealPlanning.formatTotals(
                item.calories || 0, item.protein || 0, item.carbs || 0, item.fat || 0);
            detail.appendChild(document.createElement('br'));
            detail.appendChild(smallText);
            mealItem.appendChild(detail);

            const checkBtn = document.createElement('button');
            checkBtn.className = 'check-btn ' + (isCompleted ? 'completed' : '');
            checkBtn.textContent = isCompleted ? '✓' : (isRemoved ? '❌' : '○');
            if (isCompleted) {
                checkBtn.addEventListener('click', function () {
                    uncheckMealItem(item.name, dayOfWeek, category, checkBtn);
                });
            } else {
                checkBtn.disabled = true;
            }
            mealItem.appendChild(checkBtn);

            dayMealsContainer.appendChild(mealItem);
        });

        dailyTotalCalories += categoryTotalCalories;
        dailyTotalProtein += categoryTotalProtein;
        dailyTotalCarbs += categoryTotalCarbs;
        dailyTotalFat += categoryTotalFat;
    });

    if (hasAnySlot && dailyTotalCalories > 0) {
        const dailyTotals = document.createElement('div');
        dailyTotals.className = 'daily-totals';
        dailyTotals.innerHTML = '<strong>Daily Total: ' +
            MealPlanning.formatTotals(dailyTotalCalories, dailyTotalProtein, dailyTotalCarbs, dailyTotalFat) +
            '</strong>';
        dailyTotals.style.background = 'var(--button)';
        dailyTotals.style.border = '1px solid var(--border-color, #444)';
        dailyTotals.style.borderRadius = '5px';
        dailyTotals.style.padding = '10px';
        dailyTotals.style.marginTop = '15px';
        dailyTotals.style.textAlign = 'center';
        dailyTotals.style.color = 'var(--text-color)';
        dailyTotals.style.fontSize = '0.9em';
        dayMealsContainer.appendChild(dailyTotals);
    }
}

function uncheckMealItem(foodName, dayOfWeek, slot, button) {
    if (!MealPlanning.removeSlotCompleted(mealPlanning, dayOfWeek, slot, foodName)) return;
    const mealItem = button.parentElement;
    // Replacing the button also drops its click handler.
    const reset = button.cloneNode(true);
    reset.className = 'check-btn';
    reset.textContent = '○';
    reset.disabled = true;
    mealItem.replaceChild(reset, button);
    mealItem.classList.remove('completed');
}

function setupEventListeners() {
    document.querySelectorAll('.slot-dropdown').forEach(function (dropdown) {
        dropdown.addEventListener('change', function () {
            const dayColumn = this.closest('.day-column');
            const dayIndex = parseInt(dayColumn.dataset.day, 10);
            const slot = this.dataset.slot;
            const dayMeals = dayColumn.querySelector('.day-meals');

            MealPlanning.setDaySlot(mealPlanning, dayIndex, slot, this.value || null);
            displayDayMeals(dayMeals, dayIndex);
        });
    });

    document.querySelectorAll('.template-apply-btn').forEach(function (button) {
        button.addEventListener('click', function () {
            const dayColumn = this.closest('.day-column');
            const dayIndex = parseInt(dayColumn.dataset.day, 10);
            const templateDropdown = dayColumn.querySelector('.template-dropdown');
            const templateName = templateDropdown ? templateDropdown.value : '';
            if (!templateName) {
                alert('Pick a template first.');
                return;
            }
            MealPlanning.applyTemplate(mealPlanning, dayIndex, templateName);
            loadWeekMealPlans();
        });
    });
}