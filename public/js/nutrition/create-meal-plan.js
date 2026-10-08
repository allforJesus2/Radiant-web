/**
 * Meal library: reusable meal elements + day templates.
 *
 * Element rename/delete always routes through the MealPlanning helpers so
 * reference rewriting and referrer warnings can't be bypassed from the UI.
 */
let currentElementName = null;

document.addEventListener('DOMContentLoaded', function () {
    MealPlanning.migrateToElements();
    setupHeader('📚 Meal Library');
    initFoodAutocomplete(
        document.getElementById('mealPlanFood'),
        document.getElementById('mealPlanGrams'),
        document.getElementById('autocompleteList')
    );
    setupEventListeners();
    loadLibrary();
});

function loadLibrary() {
    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    refreshElementDropdown(mealPlanning);
    refreshTemplateSlotSelects(mealPlanning);
    refreshTemplateList(mealPlanning);
    displayElementItems(mealPlanning);
    refreshElementTagControls();
}

function refreshElementTagControls() {
    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var tags = currentElementName ? MealPlanning.getElementTags(mealPlanning, currentElementName) : [];
    document.querySelectorAll('input[data-element-tag]').forEach(function (checkbox) {
        checkbox.checked = tags.indexOf(checkbox.dataset.elementTag) !== -1;
        checkbox.disabled = !currentElementName;
    });
}

function onElementTagChange(checkbox) {
    if (!currentElementName) return;
    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var tag = checkbox.dataset.elementTag;
    if (checkbox.checked) {
        MealPlanning.addElementTag(mealPlanning, currentElementName, tag);
    } else {
        MealPlanning.removeElementTag(mealPlanning, currentElementName, tag);
    }
    refreshElementTagControls();
}

function refreshElementDropdown(mealPlanning) {
    var dropdown = document.getElementById('elementSelect');
    dropdown.innerHTML = '';
    var names = MealPlanning.listElementNames(mealPlanning);
    if (names.length === 0) {
        var empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'No reusable meals yet...';
        dropdown.appendChild(empty);
        currentElementName = null;
        return;
    }
    names.forEach(function (name) {
        var option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        dropdown.appendChild(option);
    });
    if (MealPlanning.findElementByName(mealPlanning, currentElementName)) {
        dropdown.value = MealPlanning.findElementByName(mealPlanning, currentElementName);
    } else {
        currentElementName = names[0];
        dropdown.value = names[0];
    }
}

function refreshTemplateSlotSelects(mealPlanning) {
    document.querySelectorAll('.template-slot-select').forEach(function (select) {
        var previous = select.value;
        select.innerHTML = '';
        var none = document.createElement('option');
        none.value = '';
        none.textContent = '— none —';
        select.appendChild(none);
        MealPlanning.listElementNames(mealPlanning).forEach(function (name) {
            var option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        select.value = MealPlanning.findElementByName(mealPlanning, previous) || '';
    });
}

function refreshTemplateList(mealPlanning) {
    var container = document.getElementById('templateList');
    container.innerHTML = '';
    var names = MealPlanning.listTemplateNames(mealPlanning);
    if (names.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'small-text';
        empty.textContent = 'No templates yet.';
        container.appendChild(empty);
        return;
    }
    names.forEach(function (templateName) {
        var template = MealPlanning.getTemplate(mealPlanning, templateName);
        var row = document.createElement('div');
        row.className = 'template-list-item';

        var label = document.createElement('div');
        label.innerHTML = '<strong>' + escapeLibraryHtml(templateName) + '</strong><br>';
        var summary = document.createElement('span');
        summary.className = 'small-text';
        summary.textContent = MealPlanning.CATEGORIES.map(function (category) {
            var name = template[category];
            return MealPlanning.CATEGORY_EMOJIS[category] + ' ' +
                category.charAt(0).toUpperCase() + category.slice(1) + ': ' +
                (name || 'none');
        }).join(' · ');
        label.appendChild(summary);
        row.appendChild(label);

        var actions = document.createElement('div');
        actions.className = 'meal-plan-actions';

        var loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.className = 'btn';
        loadBtn.textContent = 'Edit';
        loadBtn.addEventListener('click', function () {
            loadTemplateIntoForm(template);
        });
        actions.appendChild(loadBtn);

        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn';
        deleteBtn.style.backgroundColor = '#dc3545';
        deleteBtn.style.color = 'white';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', function () {
            if (!confirm('Delete the template "' + templateName + '"? Days already using it keep their current slots.')) return;
            MealPlanning.deleteTemplate(MealPlanning.load(), templateName);
            loadLibrary();
        });
        actions.appendChild(deleteBtn);

        row.appendChild(actions);
        container.appendChild(row);
    });
}

function loadTemplateIntoForm(template) {
    var input = document.getElementById('newTemplateName');
    input.value = '';
    document.querySelectorAll('.template-slot-select').forEach(function (select) {
        select.value = template[select.dataset.slot] || '';
    });
}

function escapeLibraryHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function displayElementItems(mealPlanning) {
    var container = document.getElementById('elementItems');
    container.innerHTML = '';
    var totalsHeader = document.getElementById('elementTotalsHeader');

    var element = currentElementName ? MealPlanning.getElement(mealPlanning, currentElementName) : null;
    var items = element && Array.isArray(element.items) ? element.items : [];

    var totalCalories = 0;
    var totalProtein = 0;
    var totalCarbs = 0;
    var totalFat = 0;

    items.forEach(function (item, index) {
        var itemDiv = document.createElement('div');
        itemDiv.className = 'meal-plan-item';

        var removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function () {
            removeElementItem(index);
        });
        itemDiv.appendChild(makeItemDetail(item));
        itemDiv.appendChild(removeBtn);
        container.appendChild(itemDiv);

        totalCalories += item.calories || 0;
        totalProtein += item.protein || 0;
        totalCarbs += item.carbs || 0;
        totalFat += item.fat || 0;
    });

    if (items.length === 0) {
        var placeholder = document.createElement('p');
        placeholder.className = 'small-text';
        placeholder.textContent = currentElementName
            ? 'This meal has no foods yet.'
            : 'Create or pick a reusable meal, then add foods to it.';
        container.appendChild(placeholder);
    }

    totalsHeader.innerHTML = '📊 ' + (currentElementName ? escapeLibraryHtml(currentElementName) : 'Meal') + ' — ' +
        MealPlanning.formatTotalsSpan(totalCalories, totalProtein, totalCarbs, totalFat);
}

function makeItemDetail(item) {
    var detail = document.createElement('div');
    detail.innerHTML = '<strong>' + escapeLibraryHtml(item.name) + '</strong> - ' + item.grams + 'g';
    var small = document.createElement('span');
    small.className = 'small-text';
    small.textContent = MealPlanning.formatTotals(
        item.calories || 0, item.protein || 0, item.carbs || 0, item.fat || 0);
    detail.appendChild(document.createElement('br'));
    detail.appendChild(small);
    return detail;
}

function setLibraryError(id, message) {
    var el = document.getElementById(id);
    if (el) el.textContent = message || '';
}

function createElementFromInput() {
    setLibraryError('elementNameError', '');
    var input = document.getElementById('newElementName');
    var raw = input.value;
    var name = MealPlanning.normaliseElementName(raw);
    if (!name) {
        setLibraryError('elementNameError', MealPlanning.isReservedElementName(String(raw).trim())
            ? 'That name is reserved. Pick another one.'
            : 'Enter a name for the reusable meal.');
        return;
    }

    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var existing = MealPlanning.findElementByName(mealPlanning, name);
    if (existing) {
        setLibraryError('elementNameError', 'A reusable meal named "' + existing + '" already exists.');
        return;
    }

    MealPlanning.putElement(mealPlanning, name, []);
    currentElementName = name;
    input.value = '';
    loadLibrary();
}

function renameSelectedElement() {
    setLibraryError('elementNameError', '');
    if (!currentElementName) {
        setLibraryError('elementNameError', 'Pick a reusable meal first.');
        return;
    }
    var input = prompt('Rename "' + currentElementName + '" to:', currentElementName);
    if (input === null) return;

    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var newName = MealPlanning.renameElement(mealPlanning, currentElementName, input);
    if (!newName) {
        var trimmed = MealPlanning.normaliseElementName(input);
        if (!trimmed) {
            setLibraryError('elementNameError', 'That name is reserved or empty. Pick another one.');
        } else if (MealPlanning.findElementByName(mealPlanning, trimmed)) {
            setLibraryError('elementNameError', 'A reusable meal named "' + trimmed + '" already exists.');
        } else {
            setLibraryError('elementNameError', 'Could not rename "' + currentElementName + '".');
        }
        return;
    }
    currentElementName = newName;
    loadLibrary();
}

function deleteSelectedElement() {
    setLibraryError('elementNameError', '');
    if (!currentElementName) {
        setLibraryError('elementNameError', 'Pick a reusable meal first.');
        return;
    }

    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var referrers = MealPlanning.countElementReferences(mealPlanning, currentElementName);
    var warning = 'Delete the reusable meal "' + currentElementName + '"?';
    if (referrers.total > 0) {
        var parts = [];
        if (referrers.days > 0) parts.push(referrers.days + ' day' + (referrers.days === 1 ? '' : 's'));
        if (referrers.templates > 0) parts.push(referrers.templates + ' template' + (referrers.templates === 1 ? '' : 's'));
        warning += '\n\nIt is used by ' + parts.join(' and ') +
            '. Those slots will show no meal after deleting.';
    }
    if (!confirm(warning)) return;

    MealPlanning.deleteElement(mealPlanning, currentElementName);
    currentElementName = null;
    loadLibrary();
}

function addFoodToSelectedElement() {
    var foodInput = document.getElementById('mealPlanFood');
    var foodName = foodInput.value;
    var grams = parseFloat(document.getElementById('mealPlanGrams').value);
    var fdcId = foodInput.dataset.fdcId;
    var foodSource = foodInput.dataset.foodSource;

    if (!currentElementName) {
        setLibraryError('elementNameError', 'Pick a reusable meal first.');
        return;
    }
    if (!foodName || !grams) {
        alert('Please enter both food name and grams.');
        return;
    }

    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var element = MealPlanning.getElement(mealPlanning, currentElementName);
    if (!element) {
        setLibraryError('elementNameError', 'That reusable meal no longer exists.');
        return;
    }

    getNutritionalInfo(
        foodName,
        grams,
        fdcId != null ? fdcId : undefined,
        foodSource === 'recipe' ? 'recipe' : undefined
    )
        .then(function (nutritionalInfo) {
            var latest = MealPlanning.ensureDefaults(MealPlanning.load());
            var latestElement = MealPlanning.getElement(latest, currentElementName);
            if (!latestElement) {
                setLibraryError('elementNameError', 'That reusable meal no longer exists.');
                return;
            }
            var items = Array.isArray(latestElement.items) ? latestElement.items : [];
            items.push({
                name: foodName,
                grams: grams,
                calories: nutritionalInfo.calories,
                fat: nutritionalInfo.fat,
                protein: nutritionalInfo.protein,
                carbs: nutritionalInfo.carbs,
            });
            MealPlanning.putElement(latest, currentElementName, items);
            foodInput.value = '';
            delete foodInput.dataset.fdcId;
            delete foodInput.dataset.foodSource;
            document.getElementById('mealPlanGrams').value = '';
            document.getElementById('autocompleteList').style.display = 'none';
            loadLibrary();
        })
        .catch(function (error) {
            console.error('Error getting nutritional info:', error);
            alert('Food not found in database. Please check the spelling.');
        });
}

function removeElementItem(index) {
    if (!currentElementName) return;
    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    var element = MealPlanning.getElement(mealPlanning, currentElementName);
    if (!element) return;
    var items = Array.isArray(element.items) ? JSON.parse(JSON.stringify(element.items)) : [];
    items.splice(index, 1);
    MealPlanning.putElement(mealPlanning, currentElementName, items);
    loadLibrary();
}

function createTemplateFromForm() {
    setLibraryError('templateNameError', '');
    var input = document.getElementById('newTemplateName');
    var name = MealPlanning.normaliseElementName(input.value);
    if (!name) {
        setLibraryError('templateNameError', MealPlanning.isReservedElementName(String(input.value).trim())
            ? 'That name is reserved. Pick another one.'
            : 'Enter a name for the template.');
        return;
    }

    var mealPlanning = MealPlanning.ensureDefaults(MealPlanning.load());
    if (MealPlanning.findTemplateByName(mealPlanning, name)) {
        setLibraryError('templateNameError', 'A template named "' + name + '" already exists.');
        return;
    }

    var slots = MealPlanning.emptyDay();
    document.querySelectorAll('.template-slot-select').forEach(function (select) {
        slots[select.dataset.slot] = select.value || null;
    });

    var hasAny = MealPlanning.CATEGORIES.some(function (category) { return !!slots[category]; });
    if (!hasAny) {
        setLibraryError('templateNameError', 'Pick at least one reusable meal for this template.');
        return;
    }

    MealPlanning.putTemplate(mealPlanning, name, slots);
    input.value = '';
    document.querySelectorAll('.template-slot-select').forEach(function (select) { select.value = ''; });
    loadLibrary();
}

function setupEventListeners() {
    document.getElementById('createElementBtn').addEventListener('click', createElementFromInput);
    document.getElementById('renameElementBtn').addEventListener('click', renameSelectedElement);
    document.getElementById('deleteElementBtn').addEventListener('click', deleteSelectedElement);
    document.getElementById('addMealItem').addEventListener('click', addFoodToSelectedElement);
    document.getElementById('createTemplateBtn').addEventListener('click', createTemplateFromForm);

    var nameInput = document.getElementById('newElementName');
    nameInput.addEventListener('keypress', function (event) {
        if (event.key === 'Enter') createElementFromInput();
    });
    nameInput.addEventListener('input', function () { setLibraryError('elementNameError', ''); });

    var templateInput = document.getElementById('newTemplateName');
    templateInput.addEventListener('keypress', function (event) {
        if (event.key === 'Enter') createTemplateFromForm();
    });
    templateInput.addEventListener('input', function () { setLibraryError('templateNameError', ''); });

    document.getElementById('elementSelect').addEventListener('change', function () {
        currentElementName = this.value || null;
        setLibraryError('elementNameError', '');
        displayElementItems(MealPlanning.ensureDefaults(MealPlanning.load()));
        refreshElementTagControls();
    });

    document.querySelectorAll('input[data-element-tag]').forEach(function (checkbox) {
        checkbox.addEventListener('change', function () {
            onElementTagChange(checkbox);
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