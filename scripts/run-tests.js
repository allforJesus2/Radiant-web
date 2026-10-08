#!/usr/bin/env node
/**
 * Unit tests for pure logic modules (no DOM). Run: npm test
 */
const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadScript(relativePath, context) {
    const code = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    vm.runInNewContext(code + '\n;if (typeof RadiantStorage !== "undefined") this.RadiantStorage = RadiantStorage;', context, { filename: relativePath });
}

// --- food-macros.js ---
(function testFoodMacros() {
    const ctx = {};
    loadScript('public/js/food/food-macros.js', ctx);

    const per100 = ctx.extractMacrosPer100g({
        calories: 200,
        protein: 10,
        fat: 5,
        carbohydrate: 20,
    });
    assert.strictEqual(per100.calories, 200);
    assert.strictEqual(per100.carbs, 20);

    const scaled = ctx.scaleMacrosFrom100g(per100, 150);
    assert.strictEqual(scaled.calories, 300);
    assert.strictEqual(scaled.protein, 15);
})();

// --- storage.js (RadiantStorage with mock localStorage) ---
(function testRadiantStorage() {
    const store = {};
    const localStorage = {
        getItem(k) { return store[k] != null ? store[k] : null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; },
        clear() { Object.keys(store).forEach((k) => delete store[k]); },
        get length() { return Object.keys(store).length; },
        key(i) { return Object.keys(store)[i] || null; },
    };

    const ctx = { localStorage };
    loadScript('public/js/core/storage.js', ctx);
    const RS = ctx.RadiantStorage;

    assert.strictEqual(RS.nutrition.getPreferredUnit(), 'grams');
    RS.nutrition.setPreferredUnit('oz');
    assert.strictEqual(RS.nutrition.getPreferredUnit(), 'oz');

    assert.strictEqual(RS.profile.isComplete(), false);
    RS.profile.save({ name: 'Test' });
    RS.profile.saveUserTime('06:00');
    RS.profile.saveMacros({ protein: 150 });
    assert.strictEqual(RS.profile.isComplete(), true);

    RS.setRaw('foo', 'bar');
    const exported = RS.exportAll();
    assert.strictEqual(exported.foo, 'bar');
    RS.clearAll();
    RS.importAll(exported);
    assert.strictEqual(RS.getRaw('foo'), 'bar');
})();

// --- normalizeUpc (fdc-search.js needs RadiantStorage mock) ---
(function testNormalizeUpc() {
    const store = {};
    const localStorage = {
        getItem() { return null; },
        setItem(k, v) { store[k] = v; },
        removeItem(k) { delete store[k]; },
        clear() { Object.keys(store).forEach((k) => delete store[k]); },
        get length() { return 0; },
        key() { return null; },
    };
    const ctx = {
        localStorage,
        RadiantStorage: {
            nutrition: {
                getRecentFoodSelections: () => [],
                saveRecentFoodSelections: () => {},
            },
        },
        indexedDB: {},
    };
    loadScript('public/js/food/fdc-search.js', ctx);
    assert.strictEqual(ctx.normalizeUpc('0123-456-7890'), '01234567890');
    assert.strictEqual(ctx.normalizeUpc(null), '');
})();

// --- portion-select.js ---
(function testPortionSelect() {
    const { pickBestPortion } = require('./portion-select');

    function row(seq, gw, desc) {
        return { seq, gram_weight: gw, portion_description: desc };
    }

    const cases = [
        {
            name: 'Pie 167522',
            kcal: 290,
            candidates: [
                row(1, 131, 'pie 1 pie (1/8 of 9" pie)'),
                row(2, 137, 'slice'),
                row(3, 1137, 'pie'),
                row(4, 28.35, 'oz'),
            ],
            wantGw: 131,
        },
        {
            name: 'Almonds 170567',
            kcal: 579,
            candidates: [
                row(1, 143, 'cup, whole'),
                row(5, 28.35, 'oz (23 whole kernels)'),
                row(6, 1.2, 'almond'),
            ],
            wantGw: 28.35,
        },
        {
            name: 'Banana 173944',
            kcal: 89,
            candidates: [
                row(1, 225, 'cup, mashed'),
                row(5, 118, 'medium (7" to 7-7/8" long)'),
                row(8, 126, 'NLEA serving'),
            ],
            wantGw: 126,
        },
        {
            name: 'Cucumber 168409',
            kcal: 15,
            candidates: [
                row(1, 52, 'cup slices'),
                row(2, 301, 'cucumber (8-1/4")'),
            ],
            wantGw: 301,
        },
        {
            name: 'Tostada 167525',
            kcal: 474,
            candidates: [
                row(1, 12.3, 'piece'),
                row(2, 37, 'pieces (mean serving weight, aggregated over brands)'),
            ],
            wantGw: 37,
        },
        {
            name: 'Single candidate',
            kcal: 100,
            candidates: [row(1, 34, 'serving')],
            wantGw: 34,
        },
    ];

    for (const c of cases) {
        const w = pickBestPortion(c.candidates, { kcalPer100g: c.kcal });
        assert.strictEqual(
            w.gram_weight,
            c.wantGw,
            c.name + ' expected ' + c.wantGw + 'g got ' + w.gram_weight
        );
    }
})();

// --- MealPlanning: elements, templates, per-slot completion, migration ---
(function testMealPlanning() {
    function makeLocalStorage() {
        const store = {};
        return {
            getItem(k) { return store[k] != null ? store[k] : null; },
            setItem(k, v) { store[k] = String(v); },
            removeItem(k) { delete store[k]; },
            clear() { Object.keys(store).forEach((k) => delete store[k]); },
            get length() { return Object.keys(store).length; },
            key(i) { return Object.keys(store)[i] || null; },
            _store: store,
        };
    }

    function makeContext(seed) {
        const localStorage = makeLocalStorage();
        if (seed) Object.keys(seed).forEach((k) => { localStorage.setItem(k, seed[k]); });
        const ctx = { localStorage };
        loadScript('public/js/core/storage.js', ctx);
        const mpCode = fs.readFileSync(
            path.join(__dirname, '..', 'public/js/nutrition/meal-plan.js'), 'utf8');
        vm.runInNewContext(mpCode + '\n;this.MealPlanning = MealPlanning;', ctx, {
            filename: 'public/js/nutrition/meal-plan.js',
        });
        return ctx;
    }

    function food(name, grams, calories) {
        return { name, grams, calories, protein: 10, carbs: 20, fat: 5 };
    }

    // Values built inside the vm realm have a foreign Array prototype, so compare
    // by JSON shape rather than by deep-strict identity.
    function sameList(actual, expected, message) {
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);
    }

    // -- names --
    (function testNames() {
        const ctx = makeContext();
        const MP = ctx.MealPlanning;

        assert.strictEqual(MP.normaliseElementName('  Oats Bowl  '), 'Oats Bowl');
        assert.strictEqual(MP.normaliseElementName('   '), null);
        for (const reserved of ['toString', 'constructor', '__proto__', 'valueOf', 'prototype']) {
            assert.strictEqual(MP.normaliseElementName(reserved), null, reserved + ' must be rejected');
            assert.strictEqual(MP.putElement(MP.ensureDefaults({}), reserved, []), null);
        }

        const mp = MP.ensureDefaults({});
        MP.putElement(mp, 'Chicken Curry Meal', [food('Chicken', 150, 300)]);
        // Case-only variants resolve to the stored key instead of duplicating.
        assert.strictEqual(MP.findElementByName(mp, 'chicken curry meal'), 'Chicken Curry Meal');
        assert.strictEqual(MP.findElementByName(mp, ' chicken curry meal '), 'Chicken Curry Meal');
        sameList(MP.listElementNames(mp), ['Chicken Curry Meal']);
        // Guarded lookups never resolve inherited Object.prototype keys.
        assert.strictEqual(MP.getElement(mp, 'toString'), null);
        assert.strictEqual(MP.findElementByName(mp, 'toString'), null);
        // "Chicken Curry" and "Chicken Curry " are one element.
        assert.strictEqual(MP.putElement(mp, 'chicken curry meal', [food('Chicken', 150, 300)]),
            'Chicken Curry Meal');
        assert.strictEqual(MP.listElementNames(mp).length, 1);
    })();

    // -- rename / delete rewrite references --
    (function testRenameDelete() {
        const ctx = makeContext();
        const MP = ctx.MealPlanning;
        const mp = MP.ensureDefaults({});

        MP.putElement(mp, 'Oats Bowl', [food('Oats', 60, 150)]);
        MP.putElement(mp, 'Toast', [food('Toast', 40, 100)]);
        MP.setDaySlot(mp, 1, 'breakfast', 'Oats Bowl');
        MP.setDaySlot(mp, 3, 'breakfast', 'Oats Bowl');
        MP.setDaySlot(mp, 5, 'snack', 'Oats Bowl');
        MP.putTemplate(mp, 'Lean Day', { breakfast: 'Oats Bowl', snack: 'Oats Bowl' });

        const referrers = MP.countElementReferences(mp, 'Oats Bowl');
        assert.strictEqual(referrers.days, 3);
        assert.strictEqual(referrers.templates, 1);

        assert.strictEqual(MP.renameElement(mp, 'Oats Bowl', 'Morning Oats'), 'Morning Oats');
        assert.strictEqual(MP.getElement(mp, 'Oats Bowl'), null);
        for (const dow of [1, 3, 5]) {
            assert.ok(MP.getSlotItems(mp, dow, 'breakfast') || MP.getSlotItems(mp, dow, 'snack'),
                'day ' + dow + ' must still resolve an element');
            const slots = MP.getDaySlots(mp, dow);
            assert.ok(slots.breakfast === 'Morning Oats' || slots.snack === 'Morning Oats');
        }
        assert.strictEqual(MP.getTemplate(mp, 'Lean Day').breakfast, 'Morning Oats');
        assert.strictEqual(MP.getTemplate(mp, 'Lean Day').snack, 'Morning Oats');

        // Renaming onto an existing name or a reserved name is refused.
        assert.strictEqual(MP.renameElement(mp, 'Morning Oats', 'Toast'), null);
        assert.strictEqual(MP.renameElement(mp, 'Morning Oats', 'toString'), null);

        const deleted = MP.deleteElement(mp, 'Morning Oats');
        assert.strictEqual(deleted.referrers.days, 3);
        // Dangling references render as empty slots rather than throwing.
        assert.strictEqual(MP.getSlotItems(mp, 1, 'breakfast'), null);
        assert.strictEqual(MP.getDaySlots(mp, 1).breakfast, 'Morning Oats');
    })();

    // -- per-slot completion is independent --
    (function testPerSlotCompletion() {
        const ctx = makeContext();
        const MP = ctx.MealPlanning;
        const mp = MP.ensureDefaults({});

        MP.putElement(mp, 'Rice Bowl', [food('Rice', 200, 260)]);
        MP.setDaySlot(mp, 2, 'lunch', 'Rice Bowl');
        MP.setDaySlot(mp, 2, 'dinner', 'Rice Bowl');

        MP.addSlotCompleted(mp, 2, 'lunch', 'Rice');
        sameList(MP.getSlotCompleted(mp, 2, 'lunch'), ['Rice']);
        sameList(MP.getSlotCompleted(mp, 2, 'dinner'), [],
            'completing Rice at lunch must not complete Rice at dinner');
        MP.addSlotRemoved(mp, 2, 'dinner', 'Rice');
        sameList(MP.getSlotRemoved(mp, 2, 'lunch'), []);
        sameList(MP.getSlotRemoved(mp, 2, 'dinner'), ['Rice']);

        assert.strictEqual(MP.removeSlotCompleted(mp, 2, 'lunch', 'Rice'), true);
        assert.strictEqual(MP.removeSlotCompleted(mp, 2, 'lunch', 'Rice'), false);
    })();

    // -- templates --
    (function testTemplates() {
        const ctx = makeContext();
        const MP = ctx.MealPlanning;
        const mp = MP.ensureDefaults({});

        MP.putElement(mp, 'Oats Bowl', [food('Oats', 60, 150)]);
        MP.putElement(mp, 'Empty Meal', []);
        MP.putElement(mp, 'Curry', [food('Curry', 200, 500)]);
        MP.putTemplate(mp, 'Lean Day', {
            breakfast: 'Oats Bowl',
            lunch: 'Curry',
            dinner: 'Empty Meal',
        });

        const slots = MP.applyTemplate(mp, 4, 'Lean Day');
        assert.strictEqual(slots.breakfast, 'Oats Bowl');
        assert.strictEqual(slots.lunch, 'Curry');
        assert.strictEqual(slots.dinner, null, 'an element with no items is skipped');
        assert.strictEqual(slots.snack, null);

        // Template name reuse is case-insensitive and overwrites in place.
        MP.putTemplate(mp, 'lean day', { snack: 'Curry' });
        sameList(MP.listTemplateNames(mp), ['Lean Day']);
        assert.strictEqual(MP.getTemplate(mp, 'LEAN DAY').snack, 'Curry');
        assert.strictEqual(MP.deleteTemplate(mp, 'lean day'), 'Lean Day');
        sameList(MP.listTemplateNames(mp), []);
    })();

    // -- one-shot migration from the old plan shape --
    (function testMigration() {
        const legacy = {
            mealPlans: {
                'Lean Day': {
                    breakfast: [food('Oats', 60, 150)],
                    lunch: [food('Chicken Curry Meal', 300, 600)],
                    dinner: [],
                    snack: [],
                },
                'Heavy Day': {
                    breakfast: [food('Toast', 80, 200)],
                    lunch: [food('Rice Bowl', 250, 520)],
                    dinner: [food('Steak', 300, 700)],
                    snack: [],
                },
            },
            mealPlanDays: { 1: 'Lean Day', 5: 'Heavy Day' },
            // Flat per-day lists: "Rice" belongs to lunch only here.
            completedMeals: { 1: ['Oats'] },
            removedMeals: { 5: ['Rice Bowl'] },
            lastReset: '2024-01-01T00:00:00.000Z',
        };
        const ctx = makeContext({ meal_planning: JSON.stringify(legacy) });
        const MP = ctx.MealPlanning;

        assert.strictEqual(MP.migrateToElements(), true);
        const mp = ctx.RadiantStorage.nutrition.getMealPlanning();

        assert.strictEqual(mp.schemaVersion, MP.SCHEMA_VERSION);
        assert.strictEqual(mp.lastReset, '2024-01-01T00:00:00.000Z');
        assert.ok(mp.mealElements['Lean Day · Breakfast'], 'elements named "Plan · Slot"');
        assert.ok(mp.mealElements['Lean Day · Lunch']);
        assert.ok(mp.mealElements['Heavy Day · Dinner']);
        assert.strictEqual(Object.keys(mp.mealElements).length, 5, 'only non-empty slots make elements');

        // Both assigned days resolve to all four slots.
        const monday = MP.getDaySlots(mp, 1);
        assert.strictEqual(monday.breakfast, 'Lean Day · Breakfast');
        assert.strictEqual(monday.lunch, 'Lean Day · Lunch');
        assert.strictEqual(monday.dinner, null);
        assert.strictEqual(monday.snack, null);
        assert.strictEqual(MP.getDaySlots(mp, 5).dinner, 'Heavy Day · Dinner');
        sameList(MP.getDaySlots(mp, 3), MP.emptyDay());

        // A registered template per plan.
        sameList(MP.listTemplateNames(mp), ['Heavy Day', 'Lean Day']);
        assert.strictEqual(MP.getTemplate(mp, 'Lean Day').lunch, 'Lean Day · Lunch');

        // Completion is attributed to the slot whose element holds the item.
        sameList(MP.getSlotCompleted(mp, 1, 'breakfast'), ['Oats']);
        sameList(MP.getSlotCompleted(mp, 1, 'lunch'), []);
        sameList(MP.getSlotRemoved(mp, 5, 'lunch'), ['Rice Bowl']);
        sameList(MP.getSlotRemoved(mp, 5, 'dinner'), []);

        // The untouched original is kept as a backup, and migration runs once.
        const backup = ctx.RadiantStorage.nutrition.getMealPlanningBackup();
        sameList(backup.mealPlanDays, { 1: 'Lean Day', 5: 'Heavy Day' });
        sameList(backup.completedMeals, { 1: ['Oats'] });
        assert.ok(backup.mealPlans['Heavy Day'], 'legacy plans survive in the backup');
        assert.strictEqual(MP.migrateToElements(), false, 'guarded by schemaVersion');
    })();

    // -- legacy per-key import folds into the migration --
    (function testLegacyKeyImport() {
        const ctx = makeContext({
            mealPlans: JSON.stringify({ 'Lean Day': { breakfast: [food('Oats', 60, 150)], lunch: [], dinner: [], snack: [] } }),
            mealPlan_day_1: 'Lean Day',
            completedMeals_day_1: JSON.stringify(['Oats']),
            lastMealPlanReset: '2024-02-02T00:00:00.000Z',
        });
        const MP = ctx.MealPlanning;
        ctx.RadiantStorage.nutrition.saveMealPlanning(MP.ensureDefaults({}));

        assert.strictEqual(MP.migrateToElements(), true);
        const mp = ctx.RadiantStorage.nutrition.getMealPlanning();
        assert.strictEqual(mp.lastReset, '2024-02-02T00:00:00.000Z');
        assert.strictEqual(MP.getDaySlots(mp, 1).breakfast, 'Lean Day · Breakfast');
        sameList(MP.getSlotCompleted(mp, 1, 'breakfast'), ['Oats']);
        assert.strictEqual(ctx.localStorage.getItem('mealPlans'), null, 'legacy keys removed');
    })();

    // -- an empty profile migrates without errors --
    (function testEmptyProfile() {
        const ctx = makeContext();
        const MP = ctx.MealPlanning;
        assert.strictEqual(MP.migrateToElements(), true);
        const mp = ctx.RadiantStorage.nutrition.getMealPlanning();
        sameList(MP.listElementNames(mp), []);
        sameList(MP.listTemplateNames(mp), []);
        assert.strictEqual(ctx.RadiantStorage.nutrition.getMealPlanningBackup(), null);
    })();
})();

console.log('All tests passed.');
