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

console.log('All tests passed.');
