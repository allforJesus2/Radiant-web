/**
 * Shared meal-planning storage helpers and formatting.
 *
 * Model:
 * - A **meal element** is an uncategorised, reusable bag of food items, keyed by its
 *   display name (there is no separate id — the key *is* the name).
 * - A **day** is exactly four slots (breakfast/lunch/dinner/snack), each holding one
 *   element name or null. Any element may fill any slot.
 * - `mealPlanDays` is the plan's rotation **array**: index 0 = "Day 1" (today's
 *   column). Today always maps to index 0 via `rotationIndexForDateKey`; each
 *   later calendar date maps to the next entry (wrapping) by offset from today.
 * - A **template** is a named day: the same four-slot shape as a rotation entry.
 *
 * removedMeals are per slot (flat, current-day only), so skipping "Rice" at lunch
 * never hides "Rice" at dinner; the app's day rollover clears the whole map.
 */
const MealPlanning = {
    /** Bump when the `meal_planning` shape changes; guards the one-shot migration. */
    SCHEMA_VERSION: 4,

    /** Fixed epoch for `localDayNumber`, in whole days since this local midnight. */
    ROTATION_EPOCH_YEAR: 1970,
    ROTATION_EPOCH_MONTH: 0, // January
    ROTATION_EPOCH_DAY: 1,

    /** Hard cap on the rotation length (matches the persisted day-count clamp). */
    MAX_DAY_COUNT: 14,

    CATEGORIES: ['breakfast', 'lunch', 'dinner', 'snack'],
    CATEGORY_EMOJIS: {
        breakfast: '🌅',
        lunch: '☀️',
        dinner: '🌙',
        snack: '🍎',
    },

    /**
     * Elements are keyed by name on a plain object, so inherited Object.prototype
     * keys resolve truthy (`mp.mealElements['toString']`) even when no such element
     * exists. Such names are rejected on every write path.
     */
    RESERVED_ELEMENT_NAMES: [
        '__proto__',
        'constructor',
        'prototype',
        'tostring',
        'valueof',
        'hasownproperty',
        'isprototypeof',
        'propertyisenumerable',
        'tolocalestring',
    ],

    load() {
        return RadiantStorage.nutrition.getMealPlanning();
    },

    save(mealPlanning) {
        RadiantStorage.nutrition.saveMealPlanning(mealPlanning);
    },

    ensureDefaults(mealPlanning) {
        if (!mealPlanning) mealPlanning = {};
        if (!mealPlanning.mealElements) mealPlanning.mealElements = {};
        if (!mealPlanning.mealTemplates) mealPlanning.mealTemplates = {};
        if (!Array.isArray(mealPlanning.mealPlanDays)) {
            // Legacy weekday-keyed object or missing: the rotation array starts empty;
            // migration seeds it with the persisted day count.
            mealPlanning.mealPlanDays = [];
        }
        if (!mealPlanning.mealPlans) mealPlanning.mealPlans = {};
        if (!mealPlanning.removedMeals || typeof mealPlanning.removedMeals !== 'object') {
            mealPlanning.removedMeals = {};
        }
        delete mealPlanning.completedMeals;
        delete mealPlanning.lastReset;
        return mealPlanning;
    },

    // ---- names -----------------------------------------------------------

    /** Case-insensitive blocklist check; the list itself is stored lowercased. */
    isReservedElementName(name) {
        return this.RESERVED_ELEMENT_NAMES.indexOf(String(name).trim().toLowerCase()) !== -1;
    },

    /**
     * Trim a user-supplied element/template name. Returns null when the name is
     * empty or reserved (a stored name is never trimmed on read).
     */
    normaliseElementName(name) {
        var trimmed = String(name == null ? '' : name).trim();
        if (!trimmed) return null;
        if (this.isReservedElementName(trimmed)) return null;
        return trimmed;
    },

    /** Case-insensitive resolve of `name` to the stored element key, or null. */
    findElementByName(mealPlanning, name) {
        if (!name) return null;
        var elements = (mealPlanning && mealPlanning.mealElements) || {};
        var wanted = String(name).trim().toLowerCase();
        var keys = Object.keys(elements);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === wanted) return keys[i];
        }
        return null;
    },

    /** Own-property guarded element lookup; never returns an inherited function. */
    getElement(mealPlanning, name) {
        if (!name) return null;
        var elements = (mealPlanning && mealPlanning.mealElements) || {};
        var key = this.findElementByName(mealPlanning, name) || name;
        return Object.prototype.hasOwnProperty.call(elements, key) ? elements[key] : null;
    },

    listElementNames(mealPlanning) {
        var elements = (mealPlanning && mealPlanning.mealElements) || {};
        return Object.keys(elements).sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
        });
    },

    // ---- tags ------------------------------------------------------------

    /** Tags are lowercased meal-type names; only the four categories are valid. */
    getElementTags(mealPlanning, name) {
        var key = this.findElementByName(mealPlanning, name);
        if (!key) return [];
        var element = (mealPlanning && mealPlanning.mealElements) || {};
        var tags = Object.prototype.hasOwnProperty.call(element, key) ? element[key].tags : null;
        return Array.isArray(tags) ? tags.slice() : [];
    },

    addElementTag(mealPlanning, name, tag) {
        var key = this.findElementByName(mealPlanning, name);
        if (!key) return false;
        tag = String(tag == null ? '' : tag).trim().toLowerCase();
        if (this.CATEGORIES.indexOf(tag) === -1) return false;
        var element = mealPlanning.mealElements[key];
        if (!element) return false;
        if (!Array.isArray(element.tags)) element.tags = [];
        if (element.tags.indexOf(tag) === -1) element.tags.push(tag);
        this.save(mealPlanning);
        return true;
    },

    removeElementTag(mealPlanning, name, tag) {
        var key = this.findElementByName(mealPlanning, name);
        if (!key) return false;
        var element = mealPlanning.mealElements[key];
        if (!element || !Array.isArray(element.tags)) return false;
        tag = String(tag == null ? '' : tag).trim().toLowerCase();
        var index = element.tags.indexOf(tag);
        if (index === -1) return false;
        element.tags.splice(index, 1);
        this.save(mealPlanning);
        return true;
    },

    /**
     * Element names for one slot's carousel: only elements carrying the matching
     * tag, name-sorted.
     */
    orderElementsForTag(mealPlanning, tag) {
        var tagWanted = String(tag == null ? '' : tag).trim().toLowerCase();
        var names = this.listElementNames(mealPlanning);
        var tagged = [];
        names.forEach(function (name) {
            var element = mealPlanning.mealElements[name] || {};
            var tags = Array.isArray(element.tags) ? element.tags : [];
            if (tags.indexOf(tagWanted) !== -1) tagged.push(name);
        });
        return tagged;
    },

    listTemplateNames(mealPlanning) {
        var templates = (mealPlanning && mealPlanning.mealTemplates) || {};
        return Object.keys(templates).sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
        });
    },

    // ---- rotation --------------------------------------------------------

    /**
     * Whole local days between the fixed epoch and the local midnight of `dateKey`.
     * Both instants are local midnights, so consecutive dates differ by exactly one
     * day and `Math.round` absorbs any DST skew. A pure function of the date string:
     * deterministic across sessions on the same device.
     */
    localDayNumber(dateKey) {
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
        var year, month, day;
        if (match) {
            year = parseInt(match[1], 10);
            month = parseInt(match[2], 10) - 1;
            day = parseInt(match[3], 10);
        } else {
            var parsed = new Date(dateKey);
            if (isNaN(parsed.getTime())) return 0;
            year = parsed.getFullYear();
            month = parsed.getMonth();
            day = parsed.getDate();
        }
        var midnight = new Date(year, month, day);
        var epoch = new Date(this.ROTATION_EPOCH_YEAR, this.ROTATION_EPOCH_MONTH, this.ROTATION_EPOCH_DAY);
        return Math.round((midnight.getTime() - epoch.getTime()) / 86400000);
    },

    /** Positive modulo: the result is always in [0, n). */
    positiveMod(a, n) {
        return ((a % n) + n) % n;
    },

    /** The app's canonical today (already rolls over on the nutrition page). */
    getTodayDateKey() {
        return RadiantStorage.nutrition.getToday() ||
            new Date().toLocaleDateString('en-CA');
    },

    /** Current rotation length (number of day plans). */
    getDayCount(mealPlanning) {
        var days = (mealPlanning && mealPlanning.mealPlanDays) || [];
        return Array.isArray(days) ? days.length : 0;
    },

    /**
     * Resize the rotation array: pad with empty days or truncate the tail.
     * Clamped to 0..14. Returns the new length.
     */
    setDayCount(mealPlanning, n) {
        this.ensureDefaults(mealPlanning);
        n = Math.max(0, Math.min(this.MAX_DAY_COUNT, Math.round(Number(n)) || 0));
        var days = Array.isArray(mealPlanning.mealPlanDays) ? mealPlanning.mealPlanDays : [];
        var self = this;
        days = days.map(function (entry) {
            return self.normaliseDay(entry);
        });
        while (days.length < n) days.push(this.emptyDay());
        days.length = Math.min(days.length, n);
        mealPlanning.mealPlanDays = days;
        this.save(mealPlanning);
        return days.length;
    },

    /**
     * Rotation index for a calendar date: `(localDayNumber(dateKey) -
     * localDayNumber(today)) mod N`, so today always maps to index 0 ("Day 1")
     * and a resize of the rotation never re-phases existing days. Returns -1
     * when there is no plan at all (N === 0).
     */
    rotationIndexForDateKey(mealPlanning, dateKey) {
        var n = this.getDayCount(mealPlanning);
        if (n === 0) return -1;
        var today = this.getTodayDateKey();
        return this.positiveMod(this.localDayNumber(dateKey) - this.localDayNumber(today), n);
    },

    /** Normalised (4-slot, string-or-null) view of one rotation entry. */
    normaliseDay(raw) {
        var slots = this.emptyDay();
        if (!raw || typeof raw !== 'object') return slots;
        this.CATEGORIES.forEach(function (category) {
            var name = raw[category];
            slots[category] = typeof name === 'string' && name ? name : null;
        });
        return slots;
    },

    // ---- slots -----------------------------------------------------------

    emptyDay() {
        return { breakfast: null, lunch: null, dinner: null, snack: null };
    },

    /** Normalised (4-slot, string-or-null) view of one rotation entry by index. */
    getDaySlots(mealPlanning, index) {
        var days = (mealPlanning && mealPlanning.mealPlanDays) || [];
        var raw = Array.isArray(days) ? days[Number(index)] : null;
        return this.normaliseDay(raw);
    },

    /** Point one slot of a rotation entry at an element (or null) and save once. */
    setDaySlot(mealPlanning, index, category, elementName) {
        this.ensureDefaults(mealPlanning);
        index = Number(index);
        if (!isFinite(index) || index < 0) return null;
        var days = Array.isArray(mealPlanning.mealPlanDays) ? mealPlanning.mealPlanDays : [];
        while (days.length <= index) days.push(this.emptyDay());
        var slots = this.getDaySlots(mealPlanning, index);
        slots[category] = elementName || null;
        days[index] = slots;
        mealPlanning.mealPlanDays = days;
        this.save(mealPlanning);
        return slots;
    },

    /** Items planned in one slot, or null when the slot is empty/dangling. */
    getSlotItems(mealPlanning, index, category) {
        var slots = this.getDaySlots(mealPlanning, index);
        var element = this.getElement(mealPlanning, slots[category]);
        if (!element || !Array.isArray(element.items) || element.items.length === 0) return null;
        return element.items;
    },

    // ---- removed state (current day only, flat per slot) -----------------

    getSlotRemoved(mealPlanning, category) {
        var removed = (mealPlanning && mealPlanning.removedMeals) || {};
        var list = removed[category];
        return Array.isArray(list) ? list : [];
    },

    /** Skip an item in one slot only. Mutation only — callers save. */
    addSlotRemoved(mealPlanning, category, itemName) {
        this.ensureDefaults(mealPlanning);
        if (!mealPlanning.removedMeals || typeof mealPlanning.removedMeals !== 'object') {
            mealPlanning.removedMeals = {};
        }
        if (!Array.isArray(mealPlanning.removedMeals[category])) {
            mealPlanning.removedMeals[category] = [];
        }
        var list = mealPlanning.removedMeals[category];
        if (list.indexOf(itemName) === -1) list.push(itemName);
        return list;
    },

    /** Drop all skip state when the calendar day rolls over. Saves once. */
    clearRemovedMeals(mealPlanning) {
        this.ensureDefaults(mealPlanning);
        mealPlanning.removedMeals = {};
        this.save(mealPlanning);
    },

    // ---- elements --------------------------------------------------------

    /**
     * Create or overwrite an element. A name that differs only by case resolves to
     * the stored key, so the original display name survives. Returns the stored
     * key, or null when the name is empty/reserved.
     */
    putElement(mealPlanning, name, items) {
        this.ensureDefaults(mealPlanning);
        var key = this.normaliseElementName(name);
        if (!key) return null;
        var existingKey = this.findElementByName(mealPlanning, key);
        var preservedTags = null;
        if (existingKey) {
            key = existingKey;
            var current = mealPlanning.mealElements[key];
            if (current && Array.isArray(current.tags) && current.tags.length > 0) {
                preservedTags = current.tags.slice();
            }
        }
        var element = {
            items: (items || []).map(function (item) {
                return JSON.parse(JSON.stringify(item));
            }),
        };
        if (preservedTags) element.tags = preservedTags;
        mealPlanning.mealElements[key] = element;
        this.save(mealPlanning);
        return key;
    },

    /** Days and templates currently pointing at `name`. */
    countElementReferences(mealPlanning, name) {
        var key = this.findElementByName(mealPlanning, name);
        if (!key) return { days: 0, templates: 0, total: 0 };
        var self = this;
        var days = (Array.isArray(mealPlanning.mealPlanDays) ? mealPlanning.mealPlanDays : [])
            .filter(function (entry, index) {
                var slots = self.getDaySlots(mealPlanning, index);
                return self.CATEGORIES.some(function (category) {
                    return slots[category] === key;
                });
            });
        var templates = Object.keys((mealPlanning && mealPlanning.mealTemplates) || {}).filter(function (name2) {
            var template = mealPlanning.mealTemplates[name2];
            if (!template) return false;
            return self.CATEGORIES.some(function (category) {
                return template[category] === key;
            });
        });
        return { days: days.length, templates: templates.length, total: days.length + templates.length };
    },

    /**
     * Rename an element and rewrite every day + template reference in one save.
     * The only path that writes a name change, so dangling refs are unreachable.
     */
    renameElement(mealPlanning, oldName, newName) {
        this.ensureDefaults(mealPlanning);
        var oldKey = this.findElementByName(mealPlanning, oldName);
        var newKey = this.normaliseElementName(newName);
        if (!oldKey) return null;
        if (!newKey) return null;
        if (newKey !== oldKey && this.findElementByName(mealPlanning, newKey)) return null;

        var element = mealPlanning.mealElements[oldKey];
        delete mealPlanning.mealElements[oldKey];
        mealPlanning.mealElements[newKey] = element;

        var self = this;
        var days = Array.isArray(mealPlanning.mealPlanDays) ? mealPlanning.mealPlanDays : [];
        for (var i = 0; i < days.length; i++) {
            var slots = self.getDaySlots(mealPlanning, i);
            self.CATEGORIES.forEach(function (category) {
                if (slots[category] === oldKey) slots[category] = newKey;
            });
            days[i] = slots;
        }
        Object.keys(mealPlanning.mealTemplates).forEach(function (templateName) {
            var template = self.emptyDay();
            var raw = mealPlanning.mealTemplates[templateName] || {};
            self.CATEGORIES.forEach(function (category) {
                template[category] = raw[category] === oldKey ? newKey : (raw[category] || null);
            });
            mealPlanning.mealTemplates[templateName] = template;
        });

        this.save(mealPlanning);
        return newKey;
    },

    /**
     * Delete an element. Does not clear references by itself — callers warn with
     * `countElementReferences` first; affected slots then render as empty.
     */
    deleteElement(mealPlanning, name) {
        var key = this.findElementByName(mealPlanning, name);
        if (!key) return null;
        var referrers = this.countElementReferences(mealPlanning, key);
        delete mealPlanning.mealElements[key];
        this.save(mealPlanning);
        return { name: key, referrers: referrers };
    },

    // ---- templates -------------------------------------------------------

    /** Create or overwrite a template. Case-only name variants reuse the stored key. */
    putTemplate(mealPlanning, name, slots) {
        this.ensureDefaults(mealPlanning);
        var key = this.normaliseElementName(name);
        if (!key) return null;
        var existingKey = this.findTemplateByName(mealPlanning, key);
        if (existingKey) key = existingKey;
        var template = this.emptyDay();
        var raw = slots || {};
        this.CATEGORIES.forEach(function (category) {
            template[category] = raw[category] || null;
        });
        mealPlanning.mealTemplates[key] = template;
        this.save(mealPlanning);
        return key;
    },

    findTemplateByName(mealPlanning, name) {
        if (!name) return null;
        var templates = (mealPlanning && mealPlanning.mealTemplates) || {};
        var wanted = String(name).trim().toLowerCase();
        var keys = Object.keys(templates);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === wanted) return keys[i];
        }
        return null;
    },

    getTemplate(mealPlanning, name) {
        var key = this.findTemplateByName(mealPlanning, name);
        if (!key) return null;
        var template = this.emptyDay();
        var raw = mealPlanning.mealTemplates[key] || {};
        this.CATEGORIES.forEach(function (category) {
            template[category] = raw[category] || null;
        });
        return template;
    },

    deleteTemplate(mealPlanning, name) {
        var key = this.findTemplateByName(mealPlanning, name);
        if (!key) return null;
        delete mealPlanning.mealTemplates[key];
        this.save(mealPlanning);
        return key;
    },

    /**
     * Copy a template's four slots onto a rotation entry. Slots holding an element
     * with no items are cleared rather than assigned (a placeholder renders nothing).
     */
    applyTemplate(mealPlanning, index, templateName) {
        var template = this.getTemplate(mealPlanning, templateName);
        if (!template) return null;
        this.ensureDefaults(mealPlanning);
        index = Number(index);
        if (!isFinite(index) || index < 0) return null;
        var self = this;
        var slots = this.emptyDay();
        this.CATEGORIES.forEach(function (category) {
            var name = template[category];
            var element = name ? self.getElement(mealPlanning, name) : null;
            if (!element || !Array.isArray(element.items) || element.items.length === 0) {
                slots[category] = null;
                return;
            }
            slots[category] = self.findElementByName(mealPlanning, name);
        });
        var days = Array.isArray(mealPlanning.mealPlanDays) ? mealPlanning.mealPlanDays : [];
        while (days.length <= index) days.push(this.emptyDay());
        days[index] = slots;
        mealPlanning.mealPlanDays = days;
        this.save(mealPlanning);
        return slots;
    },

    // ---- migration -------------------------------------------------------

    /**
     * One-shot conversion into the rotation shape.
     *
     * Reusable meals (`mealElements`) and templates (`mealTemplates`) are kept;
     * legacy weekday-keyed `mealPlanDays` assignments and dow-keyed `removedMeals`
     * are discarded. Legacy `mealPlans` still fold into elements/templates so the
     * pre-elements reusable meals survive.
     *
     * A backup of the untouched original is written first and the old `mealPlans`
     * field is left in place, so nothing is lost if the result looks wrong.
     * Returns true when a migration was performed.
     */
    migrateToElements() {
        var stored = RadiantStorage.getJSON(RadiantStorage.KEYS.MEAL_PLANNING, null);
        if (stored && stored.schemaVersion === this.SCHEMA_VERSION) return false;

        var mealPlanning = this.ensureDefaults(stored ? JSON.parse(JSON.stringify(stored)) : {});
        this.importLegacyKeys(mealPlanning);

        var legacyPlans = mealPlanning.mealPlans || {};
        var self = this;

        // Keep existing reusable assets; reset the rotation shape entirely.
        mealPlanning.mealElements = (mealPlanning.mealElements && typeof mealPlanning.mealElements === 'object')
            ? mealPlanning.mealElements : {};
        mealPlanning.mealTemplates = (mealPlanning.mealTemplates && typeof mealPlanning.mealTemplates === 'object')
            ? mealPlanning.mealTemplates : {};
        mealPlanning.removedMeals = {};

        // Fresh rotation at the persisted day count, all-empty.
        var count = RadiantStorage.nutrition.getMealPlanDayCount();
        mealPlanning.mealPlanDays = [];
        for (var i = 0; i < count; i++) mealPlanning.mealPlanDays.push(this.emptyDay());

        var planNames = Object.keys(legacyPlans);
        planNames.forEach(function (planName) {
            var plan = legacyPlans[planName];
            if (!plan || typeof plan !== 'object') return;
            var slots = self.emptyDay();
            self.CATEGORIES.forEach(function (category) {
                var items = Array.isArray(plan[category]) ? plan[category] : [];
                if (items.length === 0) return;
                var elementName = self.migrationElementName(planName, category);
                mealPlanning.mealElements[elementName] = {
                    items: JSON.parse(JSON.stringify(items)),
                    tags: [category],
                };
                slots[category] = elementName;
            });
            if (!self.isReservedElementName(planName)) {
                mealPlanning.mealTemplates[planName] = slots;
            }
        });

        mealPlanning.schemaVersion = this.SCHEMA_VERSION;

        if (stored) {
            try {
                RadiantStorage.nutrition.saveMealPlanningBackup(stored);
            } catch (_) {
                // Quota/serialisation failure must not block the migration itself.
            }
        }

        // Backfill: tag existing elements by their rotation-slot assignment. The
        // fresh array holds only empty days, so this stays a no-op for new plans
        // but keeps one consistent tagging pass for any future shape.
        this.CATEGORIES.forEach(function (category) {
            for (var day = 0; day < mealPlanning.mealPlanDays.length; day++) {
                var slots = self.getDaySlots(mealPlanning, day);
                var elementName = slots[category];
                if (elementName) {
                    var key = self.findElementByName(mealPlanning, elementName);
                    if (key) {
                        var element = mealPlanning.mealElements[key];
                        if (element) {
                            if (!Array.isArray(element.tags)) element.tags = [];
                            if (element.tags.indexOf(category) === -1) {
                                element.tags.push(category);
                            }
                        }
                    }
                }
            }
        });

        RadiantStorage.nutrition.saveMealPlanning(mealPlanning);
        return true;
    },

    /** `"Plan · Slot"`, de-duplicated and never a reserved name. */
    migrationElementName(planName, category) {
        var label = this.CATEGORY_EMOJIS[category] ? category.charAt(0).toUpperCase() + category.slice(1) : category;
        var candidate = String(planName).trim() + ' · ' + label;
        if (!this.isReservedElementName(candidate)) return candidate;
        return 'Meal ' + label;
    },

    /**
     * Fold the pre-consolidation per-key storage (`mealPlans`, `mealPlan_day_3`,
     * `completedMeals_day_3`, ...) into the consolidated object, then drop the
     * legacy keys. Legacy per-day assignments and progression values are detected
     * (so they are removed) but their values are discarded — the rotation array
     * never inherits the weekday shape. Idempotent: legacy keys are removed once
     * consumed.
     */
    importLegacyKeys(mealPlanning) {
        var hasOldData = RadiantStorage.nutrition.getLegacyKey('mealPlans') ||
            RadiantStorage.nutrition.getLegacyKey('lastMealPlanReset') ||
            RadiantStorage.nutrition.getLegacyKey('mealPlan_day_0') ||
            RadiantStorage.nutrition.getLegacyKey('completedMeals_day_0') ||
            RadiantStorage.nutrition.getLegacyKey('removedMeals_day_0');
        if (!hasOldData) return false;

        this.ensureDefaults(mealPlanning);

        var oldMealPlans = RadiantStorage.nutrition.getLegacyJSON('mealPlans', {});
        if (oldMealPlans && typeof oldMealPlans === 'object') {
            Object.keys(oldMealPlans).forEach(function (planName) {
                mealPlanning.mealPlans[planName] = oldMealPlans[planName];
            });
        }

        RadiantStorage.nutrition.removeLegacyKey('mealPlans');
        RadiantStorage.nutrition.removeLegacyKey('lastMealPlanReset');
        for (var d = 0; d < 7; d++) {
            RadiantStorage.nutrition.removeLegacyKey('mealPlan_day_' + d);
            RadiantStorage.nutrition.removeLegacyKey('completedMeals_day_' + d);
            RadiantStorage.nutrition.removeLegacyKey('removedMeals_day_' + d);
        }
        return true;
    },

    // ---- formatting ------------------------------------------------------

    formatTotals(calories, protein, carbs, fat) {
        return (
            Math.round(calories) + ' cal, ' +
            Math.round(protein) + 'g protein, ' +
            Math.round(carbs) + 'g carbs, ' +
            Math.round(fat) + 'g fat'
        );
    },

    formatTotalsSpan(calories, protein, carbs, fat) {
        return '<span style="font-size: 0.8em; color: #888;">Total: ' +
            this.formatTotals(calories, protein, carbs, fat) + '</span>';
    },
};