let mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());

document.addEventListener('DOMContentLoaded', function () {
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

function loadWeekMealPlans() {
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());

    for (let i = 0; i < 7; i++) {
        const dayColumn = document.querySelector('[data-day="' + i + '"]');
        const dropdown = dayColumn.querySelector('.meal-plan-dropdown');
        const dayMeals = dayColumn.querySelector('.day-meals');

        dropdown.innerHTML = '<option value="">No meal plan</option>';
        Object.keys(mealPlanning.mealPlans).forEach(function (planName) {
            const option = document.createElement('option');
            option.value = planName;
            option.textContent = planName;
            dropdown.appendChild(option);
        });

        const dayMealPlan = mealPlanning.mealPlanDays[i];
        if (dayMealPlan) {
            dropdown.value = dayMealPlan;
            displayDayMeals(dayMeals, dayMealPlan, i);
        } else {
            dayMeals.innerHTML = '';
        }
    }
}

function displayDayMeals(dayMealsContainer, mealPlanName, dayOfWeek) {
    if (!mealPlanName || !mealPlanning.mealPlans[mealPlanName]) {
        dayMealsContainer.innerHTML = '';
        return;
    }

    const mealPlan = mealPlanning.mealPlans[mealPlanName];
    const completedItems = mealPlanning.completedMeals[dayOfWeek] || [];
    const removedItems = mealPlanning.removedMeals[dayOfWeek] || [];

    dayMealsContainer.innerHTML = '';

    let dailyTotalCalories = 0;
    let dailyTotalProtein = 0;
    let dailyTotalCarbs = 0;
    let dailyTotalFat = 0;

    MealPlanning.CATEGORIES.forEach(function (category) {
        if (!mealPlan[category] || !mealPlan[category].length) return;

        let categoryTotalCalories = 0;
        let categoryTotalProtein = 0;
        let categoryTotalCarbs = 0;
        let categoryTotalFat = 0;

        mealPlan[category].forEach(function (item) {
            if (!removedItems.includes(item.name)) {
                categoryTotalCalories += item.calories;
                categoryTotalProtein += item.protein;
                categoryTotalCarbs += item.carbs;
                categoryTotalFat += item.fat;
            }
        });

        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'meal-category-header';
        categoryHeader.innerHTML =
            '<strong>' + MealPlanning.CATEGORY_EMOJIS[category] + ' ' +
            category.charAt(0).toUpperCase() + category.slice(1) + ' -- ' +
            MealPlanning.formatTotalsSpan(categoryTotalCalories, categoryTotalProtein, categoryTotalCarbs, categoryTotalFat) +
            '</strong>';
        categoryHeader.style.marginTop = '10px';
        categoryHeader.style.marginBottom = '5px';
        categoryHeader.style.color = 'var(--text-color)';
        dayMealsContainer.appendChild(categoryHeader);

        mealPlan[category].forEach(function (item) {
            const mealItem = document.createElement('div');
            mealItem.className = 'meal-item';
            const isCompleted = completedItems.includes(item.name);
            const isRemoved = removedItems.includes(item.name);

            if (isCompleted) mealItem.classList.add('completed');
            else if (isRemoved) mealItem.classList.add('removed');

            const mealEmoji = typeof getFoodEmoji === 'function' ? getFoodEmoji(item.name) : '';
            mealItem.innerHTML =
                '<div><strong>' + (mealEmoji ? mealEmoji + ' ' : '') + item.name + '</strong><br>' +
                '<span class="small-text">' + item.grams + 'g - ' + item.calories + ' cal, ' +
                item.protein + 'g protein, ' + item.carbs + 'g carbs, ' + item.fat + 'g fat</span></div>' +
                '<button class="check-btn ' + (isCompleted ? 'completed' : '') + '" ' +
                (isCompleted ? 'onclick="uncheckMealItem(\'' + item.name.replace(/'/g, "\\'") + '\', ' + dayOfWeek + ', this)"' : 'disabled') +
                '>' + (isCompleted ? '✓' : (isRemoved ? '❌' : '○')) + '</button>';

            dayMealsContainer.appendChild(mealItem);
        });

        dailyTotalCalories += categoryTotalCalories;
        dailyTotalProtein += categoryTotalProtein;
        dailyTotalCarbs += categoryTotalCarbs;
        dailyTotalFat += categoryTotalFat;
    });

    if (dailyTotalCalories > 0) {
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

function uncheckMealItem(foodName, dayOfWeek, button) {
    const completedItems = mealPlanning.completedMeals[dayOfWeek] || [];
    const mealItem = button.parentElement;
    const index = completedItems.indexOf(foodName);
    if (index > -1) {
        completedItems.splice(index, 1);
        mealPlanning.completedMeals[dayOfWeek] = completedItems;
        MealPlanning.save(mealPlanning);
        mealItem.classList.remove('completed');
        button.classList.remove('completed');
        button.textContent = '○';
        button.disabled = true;
        button.removeAttribute('onclick');
    }
}

function setupEventListeners() {
    document.querySelectorAll('.meal-plan-dropdown').forEach(function (dropdown) {
        dropdown.addEventListener('change', function () {
            const dayColumn = this.closest('.day-column');
            const dayIndex = parseInt(dayColumn.dataset.day, 10);
            const selectedPlan = this.value;
            const dayMeals = dayColumn.querySelector('.day-meals');

            if (selectedPlan) {
                mealPlanning.mealPlanDays[dayIndex] = selectedPlan;
                MealPlanning.save(mealPlanning);
                displayDayMeals(dayMeals, selectedPlan, dayIndex);
            } else {
                delete mealPlanning.mealPlanDays[dayIndex];
                MealPlanning.save(mealPlanning);
                dayMeals.innerHTML = '';
            }
        });
    });
}
