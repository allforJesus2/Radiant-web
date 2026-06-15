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

console.log('All tests passed.');
