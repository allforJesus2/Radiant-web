/**
 * Shared meal-planning storage helpers and formatting.
 *
 * Model:
 * - A **meal element** is an uncategorised, reusable bag of food items, keyed by its
 *   display name (there is no separate id — the key *is* the name).
 * - A **day** is exactly four slots (breakfast/lunch/dinner/snack), each holding one
 *   element name or null. Any element may fill any slot.
 * - A **template** is a named day: the same four-slot shape as `mealPlanDays`.
 *
 * completedMeals / removedMeals are per slot, so completing "Rice" at lunch never
 * marks "Rice" at dinner complete.
 */
const MealPlanning = {
    /** Bump when the `meal_planning` shape changes; guards the one-shot migration. */
    SCHEMA_VERSION: 2,

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
        if (!mealPlanning.completedMeals) mealPlanning.completedMeals = {};
        if (!mealPlanning.removedMeals) mealPlanning.removedMeals = {};
        if (!mealPlanning.mealPlanDays) mealPlanning.mealPlanDays = {};
        if (!mealPlanning.mealPlans) mealPlanning.mealPlans = {};
        if (!mealPlanning.lastReset) mealPlanning.lastReset = null;
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
     * Element names for one slot's carousel: names tagged with `tag` first
     * (name-sorted), then the rest (name-sorted). Untagged meals stay reachable.
     */
    orderElementsForTag(mealPlanning, tag) {
        var tagWanted = String(tag == null ? '' : tag).trim().toLowerCase();
        var names = this.listElementNames(mealPlanning);
        var tagged = [];
        var rest = [];
        names.forEach(function (name) {
            var element = mealPlanning.mealElements[name] || {};
            var tags = element.tags || [];
            if (Array.isArray(tags) && tags.indexOf(tagWanted) !== -1) tagged.push(name);
            else rest.push(name);
        });
        return tagged.concat(rest);
    },

    listTemplateNames(mealPlanning) {
        var templates = (mealPlanning && mealPlanning.mealTemplates) || {};
        return Object.keys(templates).sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
        });
    },

    // ---- slots -----------------------------------------------------------

    emptyDay() {
        return { breakfast: null, lunch: null, dinner: null, snack: null };
    },

    /** Normalised (4-slot, string-or-null) view of one day's assignment. */
    getDaySlots(mealPlanning, dayOfWeek) {
        var days = (mealPlanning && mealPlanning.mealPlanDays) || {};
        var raw = days[dayOfWeek];
        var slots = this.emptyDay();
        if (!raw || typeof raw !== 'object') return slots;
        this.CATEGORIES.forEach(function (category) {
            var name = raw[category];
            slots[category] = typeof name === 'string' && name ? name : null;
        });
        return slots;
    },

    /** Point one slot at an element (or null to clear it) and save once. */
    setDaySlot(mealPlanning, dayOfWeek, category, elementName) {
        this.ensureDefaults(mealPlanning);
        var slots = this.getDaySlots(mealPlanning, dayOfWeek);
        slots[category] = elementName || null;
        mealPlanning.mealPlanDays[dayOfWeek] = slots;
        this.save(mealPlanning);
        return slots;
    },

    /** Items planned in one slot, or null when the slot is empty/dangling. */
    getSlotItems(mealPlanning, dayOfWeek, category) {
        var slots = this.getDaySlots(mealPlanning, dayOfWeek);
        var element = this.getElement(mealPlanning, slots[category]);
        if (!element || !Array.isArray(element.items) || element.items.length === 0) return null;
        return element.items;
    },

    getSlotCompleted(mealPlanning, dayOfWeek, category) {
        var completed = (mealPlanning && mealPlanning.completedMeals) || {};
        var day = completed[dayOfWeek];
        var list = day && day[category];
        return Array.isArray(list) ? list : [];
    },

    getSlotRemoved(mealPlanning, dayOfWeek, category) {
        var removed = (mealPlanning && mealPlanning.removedMeals) || {};
        var day = removed[dayOfWeek];
        var list = day && day[category];
        return Array.isArray(list) ? list : [];
    },

    /** Mark an item complete in one slot only. */
    addSlotCompleted(mealPlanning, dayOfWeek, category, itemName) {
        this.ensureDefaults(mealPlanning);
        if (!mealPlanning.completedMeals[dayOfWeek]) mealPlanning.completedMeals[dayOfWeek] = {};
        if (!Array.isArray(mealPlanning.completedMeals[dayOfWeek][category])) {
            mealPlanning.completedMeals[dayOfWeek][category] = [];
        }
        var list = mealPlanning.completedMeals[dayOfWeek][category];
        if (list.indexOf(itemName) === -1) list.push(itemName);
        return list;
    },

    removeSlotCompleted(mealPlanning, dayOfWeek, category, itemName) {
        var list = this.getSlotCompleted(mealPlanning, dayOfWeek, category);
        var index = list.indexOf(itemName);
        if (index === -1) return false;
        list.splice(index, 1);
        this.save(mealPlanning);
        return true;
    },

    addSlotRemoved(mealPlanning, dayOfWeek, category, itemName) {
        this.ensureDefaults(mealPlanning);
        if (!mealPlanning.removedMeals[dayOfWeek]) mealPlanning.removedMeals[dayOfWeek] = {};
        if (!Array.isArray(mealPlanning.removedMeals[dayOfWeek][category])) {
            mealPlanning.removedMeals[dayOfWeek][category] = [];
        }
        var list = mealPlanning.removedMeals[dayOfWeek][category];
        if (list.indexOf(itemName) === -1) list.push(itemName);
        return list;
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
        var days = Object.keys((mealPlanning && mealPlanning.mealPlanDays) || {}).filter(function (dow) {
            var slots = self.getDaySlots(mealPlanning, dow);
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
        Object.keys(mealPlanning.mealPlanDays).forEach(function (dow) {
            var slots = self.getDaySlots(mealPlanning, dow);
            self.CATEGORIES.forEach(function (category) {
                if (slots[category] === oldKey) slots[category] = newKey;
            });
            mealPlanning.mealPlanDays[dow] = slots;
        });
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
     * Copy a template's four slots onto a day. Slots holding an element with no
     * items are cleared rather than assigned (a placeholder renders nothing).
     */
    applyTemplate(mealPlanning, dayOfWeek, templateName) {
        var template = this.getTemplate(mealPlanning, templateName);
        if (!template) return null;
        this.ensureDefaults(mealPlanning);
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
        mealPlanning.mealPlanDays[dayOfWeek] = slots;
        this.save(mealPlanning);
        return slots;
    },

    // ---- migration -------------------------------------------------------

    /**
     * One-shot conversion of the old plan shape (plan-name per day, flat per-day
     * completion lists) into elements + templates + per-slot completion.
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
        var legacyCompleted = mealPlanning.completedMeals || {};
        var legacyRemoved = mealPlanning.removedMeals || {};
        // Legacy day assignments are plan names; capture them before the reset.
        var legacyDays = mealPlanning.mealPlanDays || {};

        mealPlanning.mealElements = {};
        mealPlanning.mealTemplates = {};
        mealPlanning.mealPlanDays = {};
        mealPlanning.completedMeals = {};
        mealPlanning.removedMeals = {};

        var planNames = Object.keys(legacyPlans);
        var perSlotForPlan = {};

        planNames.forEach(function (planName) {
            var plan = legacyPlans[planName];
            if (!plan || typeof plan !== 'object') return;
            var slots = self.emptyDay();
            self.CATEGORIES.forEach(function (category) {
                var items = Array.isArray(plan[category]) ? plan[category] : [];
                if (items.length === 0) return;
                var elementName = self.migrationElementName(planName, category);
                mealPlanning.mealElements[elementName] = { items: JSON.parse(JSON.stringify(items)) };
                slots[category] = elementName;
            });
            perSlotForPlan[planName] = slots;
            if (!self.isReservedElementName(planName)) {
                mealPlanning.mealTemplates[planName] = slots;
            }
        });

        var daySlots = {};
        for (var day = 0; day < 7; day++) {
            var assigned = legacyDays[day];
            var slots = Object.prototype.hasOwnProperty.call(perSlotForPlan, assigned)
                ? perSlotForPlan[assigned]
                : this.emptyDay();
            daySlots[day] = Object.assign({}, slots);
        }
        mealPlanning.mealPlanDays = daySlots;

        for (var d = 0; d < 7; d++) {
            var slotsForDay = daySlots[d];
            var completedNames = Array.isArray(legacyCompleted[d]) ? legacyCompleted[d] : [];
            var removedNames = Array.isArray(legacyRemoved[d]) ? legacyRemoved[d] : [];
            var completedBySlot = {};
            var removedBySlot = {};
            self.CATEGORIES.forEach(function (category) {
                var elementName = slotsForDay[category];
                var element = elementName ? mealPlanning.mealElements[elementName] : null;
                var itemNames = element && Array.isArray(element.items)
                    ? element.items.map(function (item) { return item && item.name; })
                    : [];
                // A name can occur in more than one slot; attribute it to each.
                completedBySlot[category] = completedNames.filter(function (name) {
                    return itemNames.indexOf(name) !== -1;
                });
                removedBySlot[category] = removedNames.filter(function (name) {
                    return itemNames.indexOf(name) !== -1;
                });
            });
            mealPlanning.completedMeals[d] = completedBySlot;
            mealPlanning.removedMeals[d] = removedBySlot;
        }

        mealPlanning.schemaVersion = this.SCHEMA_VERSION;

        if (stored) {
            try {
                RadiantStorage.nutrition.saveMealPlanningBackup(stored);
            } catch (_) {
                // Quota/serialisation failure must not block the migration itself.
            }
        }

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
     * legacy keys. Idempotent: legacy keys are removed once consumed.
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

        for (var day = 0; day < 7; day++) {
            var dayMealPlan = RadiantStorage.nutrition.getLegacyKey('mealPlan_day_' + day);
            if (dayMealPlan) mealPlanning.mealPlanDays[day] = dayMealPlan;

            var completedMeals = RadiantStorage.nutrition.getLegacyJSON('completedMeals_day_' + day, []);
            if (Array.isArray(completedMeals) && completedMeals.length > 0) {
                mealPlanning.completedMeals[day] = completedMeals;
            }

            var removedMeals = RadiantStorage.nutrition.getLegacyJSON('removedMeals_day_' + day, []);
            if (Array.isArray(removedMeals) && removedMeals.length > 0) {
                mealPlanning.removedMeals[day] = removedMeals;
            }
        }

        var lastReset = RadiantStorage.nutrition.getLegacyKey('lastMealPlanReset');
        if (lastReset) mealPlanning.lastReset = lastReset;

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

    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        const weekStart = new Date(d.setDate(diff));
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    },

    shouldResetWeekly(userTime, lastResetDateString, currentDate) {
        if (!lastResetDateString) return false;

        const parts = userTime.split(':').map(Number);
        const userTimeInMinutes = parts[0] * 60 + parts[1];
        const currentTimeInMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
        const currentWeekStart = this.getWeekStart(currentDate);

        let lastResetDate;
        try {
            lastResetDate = new Date(lastResetDateString);
        } catch (_) {
            return true;
        }

        const lastResetWeekStart = this.getWeekStart(lastResetDate);
        if (currentWeekStart.getTime() <= lastResetWeekStart.getTime()) return false;

        if (currentDate.getDay() === 0) {
            return currentTimeInMinutes >= userTimeInMinutes;
        }
        return true;
    },
};