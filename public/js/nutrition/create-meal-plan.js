const CUSTOM_PLAN_NAME = MealPlanning.CUSTOM_PLAN_NAME;
let isCustomPlanReadOnly = false;
let currentMealPlanItems = MealPlanning.emptyPlan();

function updateCustomPlanUi(selectedPlan) {
    const isCustom = selectedPlan === CUSTOM_PLAN_NAME;
    isCustomPlanReadOnly = isCustom;
    document.getElementById('saveMealPlanBtn').style.display = isCustom ? 'none' : 'inline-block';
    document.getElementById('saveAsMealPlanBtn').style.display = isCustom ? 'inline-block' : 'none';
    document.getElementById('deleteMealPlanBtn').style.display = (selectedPlan && !isCustom) ? 'block' : 'none';
    document.getElementById('newMealPlanName').style.display = (isCustom || !selectedPlan) ? 'block' : 'none';
    document.getElementById('newMealPlanName').placeholder = isCustom
        ? 'New plan name for Save as...'
        : 'New meal plan name...';
    const addSection = document.querySelector('.add-meal-item-section');
    if (addSection) {
        addSection.style.display = isCustom ? 'none' : 'block';
    }
    displayMealPlanItems();
}

document.addEventListener('DOMContentLoaded', function () {
    setupHeader('🍽️ Create meal plan');
    initFoodAutocomplete(
        document.getElementById('mealPlanFood'),
        document.getElementById('mealPlanGrams'),
        document.getElementById('autocompleteList')
    );
    loadExistingMealPlans();
    setupEventListeners();
    updateCustomPlanUi('');
});

function loadExistingMealPlans() {
    const mealPlanning = MealPlanning.ensureCustomPlanExists(MealPlanning.load());
    MealPlanning.save(mealPlanning);
    const dropdown = document.getElementById('mealPlanName');
    dropdown.innerHTML = '<option value="">Create new meal plan...</option>';
    Object.keys(mealPlanning.mealPlans).forEach(function (planName) {
        const option = document.createElement('option');
        option.value = planName;
        option.textContent = planName;
        dropdown.appendChild(option);
    });
}

function loadMealPlanData(planName) {
    const mealPlanning = MealPlanning.load();
    if (mealPlanning.mealPlans[planName]) {
        const loadedPlan = JSON.parse(JSON.stringify(mealPlanning.mealPlans[planName]));
        currentMealPlanItems = MealPlanning.emptyPlan();
        MealPlanning.CATEGORIES.forEach(function (cat) {
            currentMealPlanItems[cat] = loadedPlan[cat] || [];
        });
        displayMealPlanItems();
    }
}

function setupEventListeners() {
    document.getElementById('mealPlanName').addEventListener('change', function () {
        const selectedPlan = this.value;
        if (selectedPlan) {
            loadMealPlanData(selectedPlan);
        } else {
            currentMealPlanItems = MealPlanning.emptyPlan();
        }
        updateCustomPlanUi(selectedPlan);
    });

    document.getElementById('newMealPlanName').style.display = 'block';

    document.getElementById('addMealItem').addEventListener('click', function () {
        const foodInput = document.getElementById('mealPlanFood');
        const foodName = foodInput.value;
        const grams = parseFloat(document.getElementById('mealPlanGrams').value);
        const category = document.getElementById('mealCategory').value;
        const fdcId = foodInput.dataset.fdcId;
        const foodSource = foodInput.dataset.foodSource;

        if (!foodName || !grams) {
            alert('Please enter both food name and grams.');
            return;
        }

        getNutritionalInfo(
            foodName,
            grams,
            fdcId != null ? fdcId : undefined,
            foodSource === 'recipe' ? 'recipe' : undefined
        )
            .then(function (nutritionalInfo) {
                currentMealPlanItems[category].push({
                    name: foodName,
                    grams: grams,
                    calories: nutritionalInfo.calories,
                    fat: nutritionalInfo.fat,
                    protein: nutritionalInfo.protein,
                    carbs: nutritionalInfo.carbs,
                });
                displayMealPlanItems();
                foodInput.value = '';
                delete foodInput.dataset.fdcId;
                delete foodInput.dataset.foodSource;
                document.getElementById('mealPlanGrams').value = '';
                document.getElementById('autocompleteList').style.display = 'none';
            })
            .catch(function (error) {
                console.error('Error getting nutritional info:', error);
                alert('Food not found in database. Please check the spelling.');
            });
    });

    document.getElementById('mealPlanGrams').addEventListener('keypress', function (event) {
        if (event.key === 'Enter') {
            document.getElementById('addMealItem').click();
        }
    });

    document.getElementById('mealPlanFood').addEventListener('focus', function () {
        this.value = '';
    });
    document.getElementById('mealPlanGrams').addEventListener('focus', function () {
        this.value = '';
    });
}

function displayMealPlanItems() {
    let dailyTotalCalories = 0;
    let dailyTotalProtein = 0;
    let dailyTotalCarbs = 0;
    let dailyTotalFat = 0;

    MealPlanning.CATEGORIES.forEach(function (category) {
        const container = document.getElementById(category + 'Items');
        container.innerHTML = '';

        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        currentMealPlanItems[category].forEach(function (item, index) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'meal-plan-item';
            const removeBtnHtml = isCustomPlanReadOnly
                ? ''
                : '<button class="remove-btn" onclick="removeMealPlanItem(\'' + category + '\', ' + index + ')">×</button>';
            itemDiv.innerHTML =
                '<div><strong>' + item.name + '</strong> - ' + item.grams + 'g<br>' +
                '<span class="small-text">' + item.calories + ' cal, ' + item.protein + 'g protein, ' +
                item.carbs + 'g carbs, ' + item.fat + 'g fat</span></div>' + removeBtnHtml;
            container.appendChild(itemDiv);

            totalCalories += item.calories;
            totalProtein += item.protein;
            totalCarbs += item.carbs;
            totalFat += item.fat;
        });

        dailyTotalCalories += totalCalories;
        dailyTotalProtein += totalProtein;
        dailyTotalCarbs += totalCarbs;
        dailyTotalFat += totalFat;

        const headerElement = document.getElementById(category + 'Header');
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        headerElement.innerHTML =
            MealPlanning.CATEGORY_EMOJIS[category] + ' ' + categoryName + ' -- ' +
            MealPlanning.formatTotalsSpan(totalCalories, totalProtein, totalCarbs, totalFat);
    });

    document.getElementById('dailyTotalsHeader').innerHTML =
        '📊 Daily Total -- ' +
        MealPlanning.formatTotalsSpan(dailyTotalCalories, dailyTotalProtein, dailyTotalCarbs, dailyTotalFat);
}

function removeMealPlanItem(category, index) {
    if (isCustomPlanReadOnly) return;
    currentMealPlanItems[category].splice(index, 1);
    displayMealPlanItems();
}

function saveMealPlan() {
    const selectedPlan = document.getElementById('mealPlanName').value;
    const newPlanName = document.getElementById('newMealPlanName').value.trim();

    if (selectedPlan === CUSTOM_PLAN_NAME) {
        alert('Custom is updated from the nutrition page. Use Save as new plan to copy it.');
        return;
    }

    let planName;
    if (selectedPlan) {
        planName = selectedPlan;
    } else if (newPlanName) {
        planName = newPlanName;
    } else {
        alert('Please select an existing meal plan or enter a new meal plan name.');
        return;
    }

    if (MealPlanning.isReservedPlanName(planName)) {
        alert('Custom is a reserved name. Choose a different name or use Save as to copy the Custom plan.');
        return;
    }

    const totalItems = MealPlanning.CATEGORIES.reduce(function (sum, cat) {
        return sum + currentMealPlanItems[cat].length;
    }, 0);

    if (totalItems === 0) {
        alert('Please add at least one food item to the meal plan.');
        return;
    }

    const mealPlanning = MealPlanning.load();
    mealPlanning.mealPlans[planName] = JSON.parse(JSON.stringify(currentMealPlanItems));
    MealPlanning.save(mealPlanning);

    alert('Meal plan "' + planName + '" saved successfully!');
    window.location.href = 'meal-plan.html';
}

function saveMealPlanAsCopy() {
    const selectedPlan = document.getElementById('mealPlanName').value;
    const newPlanName = document.getElementById('newMealPlanName').value.trim();

    if (selectedPlan !== CUSTOM_PLAN_NAME) {
        alert('Select the Custom plan to use Save as.');
        return;
    }
    if (!newPlanName) {
        alert('Enter a name for the new meal plan.');
        return;
    }
    if (MealPlanning.isReservedPlanName(newPlanName)) {
        alert('Custom is a reserved name. Choose a different name.');
        return;
    }

    const mealPlanning = MealPlanning.ensureCustomPlanExists(MealPlanning.load());

    if (mealPlanning.mealPlans[newPlanName]) {
        alert('A meal plan named "' + newPlanName + '" already exists. Choose a different name.');
        return;
    }

    const custom = mealPlanning.mealPlans[CUSTOM_PLAN_NAME];
    if (!MealPlanning.customPlanHasItems(custom)) {
        alert('Custom plan is empty. Save meals on the nutrition page first.');
        return;
    }

    mealPlanning.mealPlans[newPlanName] = JSON.parse(JSON.stringify(custom));
    MealPlanning.save(mealPlanning);

    alert('Meal plan "' + newPlanName + '" created from Custom.');
    window.location.href = 'meal-plan.html';
}

function deleteMealPlan() {
    const selectedPlan = document.getElementById('mealPlanName').value;

    if (!selectedPlan) {
        alert('Please select a meal plan to delete.');
        return;
    }
    if (selectedPlan === CUSTOM_PLAN_NAME) {
        alert('The Custom meal plan cannot be deleted.');
        return;
    }

    if (confirm('Are you sure you want to delete the meal plan "' + selectedPlan + '"? This action cannot be undone.')) {
        const mealPlanning = MealPlanning.load();
        delete mealPlanning.mealPlans[selectedPlan];
        MealPlanning.save(mealPlanning);

        alert('Meal plan "' + selectedPlan + '" deleted successfully!');
        document.getElementById('mealPlanName').value = '';
        document.getElementById('newMealPlanName').style.display = 'block';
        document.getElementById('deleteMealPlanBtn').style.display = 'none';
        currentMealPlanItems = MealPlanning.emptyPlan();
        displayMealPlanItems();
        loadExistingMealPlans();
    }
}
