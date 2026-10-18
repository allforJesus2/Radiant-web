let mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());

document.addEventListener('DOMContentLoaded', function () {
    MealPlanning.migrateToElements();
    // Re-read after migration so the module-level object never writes pre-migration data back.
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    setupHeader('🍽️ Meal Planning');
    renderDayColumns();
    setupEventListeners();
});

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

/** Local-midnight date for a "YYYY-MM-DD" key (matches storage's en-CA dates). */
function dateFromKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
    if (match) {
        return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }
    const parsed = new Date(dateKey);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Local-midnight date `i` days after `date`. */
function addLocalDays(date, i) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
}

function dateKeyOf(date) {
    return date.toLocaleDateString('en-CA');
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatColumnDate(date) {
    return WEEKDAY_SHORT[date.getDay()] + ' ' + (date.getMonth() + 1) + '/' + date.getDate();
}

function buildColumn(i, date, dateKey) {
    const column = document.createElement('div');
    column.className = 'day-column';
    column.dataset.date = dateKey;

    const h3 = document.createElement('h3');
    h3.textContent = 'Day ' + (i + 1) + ' · ' + formatColumnDate(date) + (i === 0 ? ' (Today)' : '');
    column.appendChild(h3);

    const selector = document.createElement('div');
    selector.className = 'meal-plan-selector';

    MealPlanning.CATEGORIES.forEach(function (category) {
        const row = document.createElement('div');
        row.className = 'slot-row';
        const label = document.createElement('span');
        label.className = 'slot-label';
        label.textContent = MealPlanning.CATEGORY_EMOJIS[category] + ' ' +
            category.charAt(0).toUpperCase() + category.slice(1);
        const dropdown = document.createElement('select');
        dropdown.className = 'slot-dropdown';
        dropdown.dataset.slot = category;
        row.appendChild(label);
        row.appendChild(dropdown);
        const editLink = document.createElement('a');
        editLink.className = 'slot-edit-link';
        editLink.href = 'create-meal-plan.html#meals';
        editLink.title = 'Edit reusable meals';
        editLink.textContent = '✏️';
        row.appendChild(editLink);
        selector.appendChild(row);
    });

    const templateRow = document.createElement('div');
    templateRow.className = 'template-row';
    const templateDropdown = document.createElement('select');
    templateDropdown.className = 'template-dropdown';
    templateDropdown.innerHTML = '<option value="">Apply template…</option>';
    MealPlanning.listTemplateNames(mealPlanning).forEach(function (templateName) {
        const option = document.createElement('option');
        option.value = templateName;
        option.textContent = templateName;
        templateDropdown.appendChild(option);
    });
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn template-apply-btn';
    applyBtn.textContent = 'Apply';
    templateRow.appendChild(templateDropdown);
    templateRow.appendChild(applyBtn);
    selector.appendChild(templateRow);
    column.appendChild(selector);

    const dayMeals = document.createElement('div');
    dayMeals.className = 'day-meals';
    column.appendChild(dayMeals);

    return column;
}

/** Rotation index for a column, recomputed at event time (the array may resize). */
function rotationIndexForColumn(column) {
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    return MealPlanning.rotationIndexForDateKey(mealPlanning, column.dataset.date);
}

function renderDayColumns() {
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    const n = RadiantStorage.nutrition.getMealPlanDayCount();
    const grid = document.querySelector('.week-grid');
    if (!grid) return;
    grid.style.setProperty('--day-count', String(n));
    grid.innerHTML = '';

    const today = dateFromKey(MealPlanning.getTodayDateKey());

    for (let i = 0; i < n; i++) {
        const date = addLocalDays(today, i);
        const dateKey = dateKeyOf(date);
        const column = buildColumn(i, date, dateKey);
        grid.appendChild(column);

        const slots = MealPlanning.getDaySlots(mealPlanning, MealPlanning.rotationIndexForDateKey(mealPlanning, dateKey));
        column.querySelectorAll('.slot-dropdown').forEach(function (dropdown) {
            fillElementOptions(dropdown);
            dropdown.value = slots[dropdown.dataset.slot] || '';
            const editLink = dropdown.parentElement.querySelector('.slot-edit-link');
            if (!editLink) return;
            const value = dropdown.value;
            editLink.href = 'create-meal-plan.html' +
                (value ? '?element=' + encodeURIComponent(value) : '') + '#meals';
        });

        displayDayMeals(column.querySelector('.day-meals'),
            MealPlanning.rotationIndexForDateKey(mealPlanning, dateKey));
    }

    updateDayCountLabel();
}

function displayDayMeals(dayMealsContainer, index) {
    if (!dayMealsContainer) return;
    dayMealsContainer.innerHTML = '';

    const slots = MealPlanning.getDaySlots(mealPlanning, index);

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

        let categoryTotalCalories = 0;
        let categoryTotalProtein = 0;
        let categoryTotalCarbs = 0;
        let categoryTotalFat = 0;

        items.forEach(function (item) {
            categoryTotalCalories += item.calories || 0;
            categoryTotalProtein += item.protein || 0;
            categoryTotalCarbs += item.carbs || 0;
            categoryTotalFat += item.fat || 0;
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
            nameEl.appendChild(document.createTextNode(elementName));
            const editLink = document.createElement('a');
            editLink.className = 'edit-element-link';
            editLink.href = 'create-meal-plan.html#meals';
            editLink.title = 'Edit in library';
            editLink.textContent = '✏️';
            nameEl.appendChild(editLink);
            categoryHeader.appendChild(nameEl);
        }
        categoryHeader.style.marginTop = '10px';
        categoryHeader.style.marginBottom = '5px';
        categoryHeader.style.color = 'var(--text-color)';
        dayMealsContainer.appendChild(categoryHeader);

        items.forEach(function (item) {
            const mealItem = document.createElement('div');
            mealItem.className = 'meal-item';

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

function updateDayCountLabel() {
    const label = document.getElementById('dayCountLabel');
    if (!label) return;
    const n = RadiantStorage.nutrition.getMealPlanDayCount();
    label.textContent = n + ' day' + (n === 1 ? '' : 's');
}

function changeDayCount(delta) {
    const current = RadiantStorage.nutrition.getMealPlanDayCount();
    const next = Math.max(1, Math.min(14, current + delta));
    if (next === current) return;
    RadiantStorage.nutrition.setMealPlanDayCount(next);
    mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    MealPlanning.setDayCount(mealPlanning, next);
    renderDayColumns();
}

function setupEventListeners() {
    const grid = document.querySelector('.week-grid');
    if (!grid) return;

    // Columns regenerate (and the array may resize), so delegation on the grid
    // replaces one-shot bindings over node lists captured at DOMContentLoaded.
    grid.addEventListener('change', function (e) {
        const dropdown = e.target.closest('.slot-dropdown');
        if (!dropdown) return;
        const column = dropdown.closest('.day-column');
        if (!column) return;
        const index = rotationIndexForColumn(column);
        const slot = dropdown.dataset.slot;
        MealPlanning.setDaySlot(mealPlanning, index, slot, dropdown.value || null);
        displayDayMeals(column.querySelector('.day-meals'), index);
    });

    grid.addEventListener('click', function (e) {
        const button = e.target.closest('.template-apply-btn');
        if (!button) return;
        const column = button.closest('.day-column');
        if (!column) return;
        const templateDropdown = column.querySelector('.template-dropdown');
        const templateName = templateDropdown ? templateDropdown.value : '';
        if (!templateName) {
            alert('Pick a template first.');
            return;
        }
        const index = rotationIndexForColumn(column);
        MealPlanning.applyTemplate(mealPlanning, index, templateName);
        renderDayColumns();
    });

    const minus = document.getElementById('dayCountMinus');
    const plus = document.getElementById('dayCountPlus');
    if (minus) minus.addEventListener('click', function () { changeDayCount(-1); });
    if (plus) plus.addEventListener('click', function () { changeDayCount(1); });
}