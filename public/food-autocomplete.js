/**
 * Reusable food autocomplete widget (uses database-utils search pipeline).
 * Requires: database-utils.js loaded first.
 */

function showServingBubble(description, targetElement) {
    if (!description || !targetElement) return;
    const bubble = document.createElement('div');
    bubble.className = 'serving-bubble';
    bubble.textContent = description;
    targetElement.parentNode.appendChild(bubble);
    const rect = targetElement.getBoundingClientRect();
    bubble.style.top = (rect.bottom + 5) + 'px';
    bubble.style.left = rect.left + 'px';
    setTimeout(function () {
        bubble.remove();
    }, 3000);
}

/**
 * @param {Array<string|{name:string,fdc_id?:number|null,source?:string}>} foodList
 * @param {HTMLInputElement} [foodInput]
 * @param {HTMLInputElement} [gramsInput]
 * @param {HTMLElement} [listEl]
 */
function setupAutocomplete(foodList, foodInput, gramsInput, listEl) {
    let entries = [];
    if (
        foodList &&
        foodList.length &&
        typeof foodList[0] === 'object' &&
        foodList[0].name
    ) {
        entries = foodList;
    } else if (Array.isArray(foodList)) {
        entries = foodList.map(function (n) {
            return {
                name: typeof n === 'string' ? n : n.name,
                fdc_id: typeof n === 'object' && n && 'fdc_id' in n ? n.fdc_id : null,
                source: typeof n === 'object' && n && n.source ? n.source : 'legacy',
            };
        });
    }

    const inputEl =
        foodInput && foodInput.nodeType === 1
            ? foodInput
            : document.querySelector('.food');
    const gramsEl =
        gramsInput && gramsInput.nodeType === 1
            ? gramsInput
            : document.querySelector('.grams');
    const ac =
        listEl && listEl.nodeType === 1
            ? listEl
            : document.getElementById('autocompleteList');
    let debounceTimer = null;
    let currentMatches = [];
    let highlightedIndex = 0;

    function setListVisible(visible) {
        if (!ac) return;
        ac.style.display = visible ? 'block' : 'none';
    }

    function fillServingHints(entry) {
        if (entry.fdc_id != null && entry.fdc_id !== '') {
            getFoodById(entry.fdc_id).then(function (food) {
                if (!food || !gramsEl) return;
                if (food.serving_weight != null) {
                    gramsEl.value = typeof gramsToInputValue === 'function'
                        ? gramsToInputValue(food.serving_weight)
                        : food.serving_weight;
                    gramsEl.select();
                }
                if (food.serving_description) {
                    showServingBubble(food.serving_description, gramsEl);
                }
            });
        } else if (entry.source === 'recipe') {
            getFoodFromRecipeStore(entry.name).then(function (recipeRow) {
                if (!recipeRow || !gramsEl) return;
                if (recipeRow.servingWeight1 != null) {
                    window._radiantSkipGramsClear = true;
                    gramsEl.value = typeof gramsToInputValue === 'function'
                        ? gramsToInputValue(recipeRow.servingWeight1)
                        : recipeRow.servingWeight1;
                    gramsEl.select();
                }
                if (recipeRow.servingDescription1) {
                    showServingBubble(recipeRow.servingDescription1, gramsEl);
                }
            });
        } else {
            fetchValueForKey(entry.name, 'servingWeight1', function (value) {
                if (value && gramsEl) {
                    window._radiantSkipGramsClear = true;
                    gramsEl.value = typeof gramsToInputValue === 'function'
                        ? gramsToInputValue(value)
                        : value;
                    gramsEl.select();
                }
            });
            fetchValueForKey(entry.name, 'servingDescription1', function (description) {
                if (description) {
                    showServingBubble(description, gramsEl);
                }
            });
        }
    }

    function selectEntry(entry) {
        recordFoodSelection(entry);
        inputEl.value = entry.name;
        if (entry.fdc_id != null && entry.fdc_id !== '') {
            inputEl.dataset.fdcId = String(entry.fdc_id);
        } else {
            delete inputEl.dataset.fdcId;
        }
        if (entry.source === 'recipe') {
            inputEl.dataset.foodSource = 'recipe';
        } else {
            delete inputEl.dataset.foodSource;
        }
        if (ac) {
            ac.innerHTML = '';
            setListVisible(false);
        }
        currentMatches = [];
        highlightedIndex = 0;
        window._radiantSkipGramsClear = true;
        if (gramsEl) {
            gramsEl.focus();
            gramsEl.select();
        }
        fillServingHints(entry);
    }

    function setHighlightedIndex(index) {
        if (!ac || index < 0 || index >= currentMatches.length) return;
        highlightedIndex = index;
        ac.querySelectorAll('div').forEach(function (item, i) {
            item.classList.toggle('autocomplete-highlighted', i === index);
        });
    }

    function renderList(matches) {
        if (!ac) return;
        currentMatches = matches;
        highlightedIndex = 0;
        while (ac.firstChild) ac.removeChild(ac.firstChild);
        if (!matches.length) {
            setListVisible(false);
            return;
        }
        setListVisible(true);
        matches.forEach(function (entry, index) {
            const div = document.createElement('div');
            if (index === 0) {
                div.classList.add('autocomplete-highlighted');
            }
            const emoji = typeof getFoodEmoji === 'function' ? getFoodEmoji(entry.name) : '';
            div.textContent = emoji ? emoji + ' ' + entry.name : entry.name;
            if (entry.fdc_id != null && entry.fdc_id !== '') {
                div.dataset.fdcId = String(entry.fdc_id);
            }
            div.addEventListener('mouseenter', function () {
                setHighlightedIndex(index);
            });
            div.addEventListener('click', function () {
                selectEntry(entry);
            });
            ac.appendChild(div);
        });
    }

    inputEl.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || !currentMatches.length) return;
        event.preventDefault();
        selectEntry(currentMatches[highlightedIndex]);
    });

    inputEl.addEventListener('input', function () {
        const userInput = this.value;
        if (debounceTimer) clearTimeout(debounceTimer);

        if (userInput.length <= 1) {
            currentMatches = [];
            highlightedIndex = 0;
            if (ac) {
                ac.innerHTML = '';
                setListVisible(false);
            }
            delete inputEl.dataset.fdcId;
            delete inputEl.dataset.foodSource;
            return;
        }

        debounceTimer = setTimeout(async function () {
            const words = userInput.toLowerCase().split(/\s+/).filter(Boolean);

            if (_fdcCount > ARRAY_MODE_MAX_FOODS && (await getFdcMeta()).brandedImportComplete) {
                const fdcFound = await searchFoodsByPrefix(userInput, AUTOCOMPLETE_LIMIT);
                const customFound = await searchCustomRecipesByPrefix(userInput, AUTOCOMPLETE_LIMIT);
                const seen = new Set();
                const merged = [];
                customFound.forEach(function (e) {
                    const k = e.name.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        merged.push(e);
                    }
                });
                fdcFound.forEach(function (e) {
                    const k = e.name.toLowerCase();
                    if (!seen.has(k)) {
                        seen.add(k);
                        merged.push(e);
                    }
                });
                renderList(merged.slice(0, AUTOCOMPLETE_LIMIT));
                return;
            }

            const filtered = entries.filter(function (e) {
                const lower = e.name.toLowerCase();
                return words.every(function (w) {
                    return lower.includes(w);
                });
            });
            renderList(
                sortFoodAutocompleteMatches(filtered, userInput).slice(0, AUTOCOMPLETE_LIMIT)
            );
        }, 250);
    });
}

/** Bootstrap autocomplete from IndexedDB food cache. */
async function initFoodAutocomplete(foodInput, gramsInput, listEl) {
    try {
        const result = await loadFoodNamesAndCache();
        setupAutocomplete(result.entries, foodInput, gramsInput, listEl);
    } catch (e) {
        console.error('Food autocomplete init failed:', e);
        setupAutocomplete([], foodInput, gramsInput, listEl);
    }
}
