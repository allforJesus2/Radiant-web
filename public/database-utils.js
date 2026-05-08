/**
 * IndexedDB layer (v3): fdcStore, nutrientStore, fdcMeta, csvStore fallback, recipeIngredients.
 */
const DB_NAME = 'csvDB';
const DB_VERSION = 4;
const META_KEY = 'status';
const ARRAY_MODE_MAX_FOODS = 50000;
const AUTOCOMPLETE_LIMIT = 30;

const nutritionCache = new Map();
let dbPromise = null;
let autocompleteQueryId = 0;

let _autocompleteEntries = [];
let _fdcCount = 0;

/** SR Legacy trailing note from USDA Food Distribution Program — strip for display/storage. */
const USDA_FDP_NAME_SUFFIX =
  /\s*\(includes foods for usda['\u2019]s food distribution program\)\s*$/i;

/**
 * @param {string|null|undefined} name
 * @returns {string}
 */
function normalizeFdcFoodName(name) {
  if (name == null || name === '') return '';
  return String(name).replace(USDA_FDP_NAME_SUFFIX, '').trim();
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function extractMacrosPer100g(nutrients) {
  if (!nutrients) {
    return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }
  return {
    calories: nutrients.calories || 0,
    protein: nutrients.protein || 0,
    fat: nutrients.fat || 0,
    carbs:
      nutrients.carbohydrate != null
        ? nutrients.carbohydrate
        : nutrients.carbs || 0,
  };
}

function scaleMacrosFrom100g(per100, grams) {
  const g = Number(grams);
  if (!Number.isFinite(g) || g <= 0) {
    return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }
  const f = g / 100;
  return {
    calories: Math.round(per100.calories * f * 10) / 10,
    protein: Math.round(per100.protein * f * 10) / 10,
    fat: Math.round(per100.fat * f * 10) / 10,
    carbs: Math.round(per100.carbs * f * 10) / 10,
  };
}

function normalizeUpc(raw) {
  if (raw == null) return '';
  const d = String(raw).replace(/\D/g, '');
  return d;
}

/**
 * @returns {Promise<IDBDatabase>}
 */
function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = openDatabaseRequest();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const { oldVersion } = ev;
      try {
        if (!db.objectStoreNames.contains('csvStore')) {
          const os = db.createObjectStore('csvStore', { keyPath: 'id' });
          os.createIndex('nameIndex', 'name', { unique: true });
        }
        if (!db.objectStoreNames.contains('recipeIngredients')) {
            db.createObjectStore('recipeIngredients', { keyPath: 'recipeId' });
        }
        if (!db.objectStoreNames.contains('fdcStore')) {
          const f = db.createObjectStore('fdcStore', { keyPath: 'fdc_id' });
          f.createIndex('nameIndex', 'name', { unique: false });
          f.createIndex('nameLcIndex', 'name_lc', { unique: false });
          f.createIndex('gtinUpcIndex', 'gtin_upc', { unique: false });
        }
        if (oldVersion > 0 && oldVersion < 4 && db.objectStoreNames.contains('fdcStore')) {
          const st = ev.target.transaction.objectStore('fdcStore');
          if (!st.indexNames.contains('nameLcIndex')) {
            st.createIndex('nameLcIndex', 'name_lc', { unique: false });
          }
        }
        if (!db.objectStoreNames.contains('nutrientStore')) {
          db.createObjectStore('nutrientStore', { keyPath: 'nutrient_id' });
        }
        if (!db.objectStoreNames.contains('fdcMeta')) {
          db.createObjectStore('fdcMeta', { keyPath: 'key' });
        }
        if (oldVersion > 0 && oldVersion < 3) {
          console.log('Database upgraded to v3');
        }
      } catch (e) {
        reject(e);
      }
    };
  });
  return dbPromise;
}

function openDatabaseRequest() {
  return indexedDB.open(DB_NAME, DB_VERSION);
}

let nutrientDefMemory = new Map();

async function countStore(storeName) {
  const db = await getDB();
  const tx = db.transaction([storeName], 'readonly');
  return idbRequest(tx.objectStore(storeName).count());
}

function pickPreferredFood(matches) {
  if (!matches || !matches.length) return null;
  let best = matches[0];
  for (let i = 1; i < matches.length; i++) {
    const cur = matches[i];
    const curBr = cur.source === 'branded';
    const bestBr = best.source === 'branded';
    if (curBr && !bestBr) best = cur;
  }
  return best;
}

/**
 * @param {number} fdc_id
 * @returns {Promise<object|null>}
 */
async function getFoodById(fdc_id) {
  const id = Number(fdc_id);
  if (!Number.isFinite(id)) return null;
  const db = await getDB();
  const tx = db.transaction(['fdcStore'], 'readonly');
  return idbRequest(tx.objectStore('fdcStore').get(id));
}

/**
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function getFoodByName(name) {
  if (!name) return null;
  const raw = String(name).trim();
  const db = await getDB();
  const tx = db.transaction(['fdcStore'], 'readonly');
  const ix = tx.objectStore('fdcStore').index('nameIndex');
  const nameKeys = new Set([raw, normalizeFdcFoodName(raw)].filter(Boolean));
  for (const key of nameKeys) {
    const exact = await idbRequest(ix.getAll(key));
    if (exact && exact.length) {
      return pickPreferredFood(exact);
    }
  }
  const n = await countStore('fdcStore');
  if (n > ARRAY_MODE_MAX_FOODS) return null;
  const wantCanon = normalizeFdcFoodName(raw).toLowerCase();
  const rawLower = raw.toLowerCase();
  return new Promise((resolve, reject) => {
    const tx2 = db.transaction(['fdcStore'], 'readonly');
    const req = tx2.objectStore('fdcStore').openCursor();
    const matches = [];
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        const nm = String(c.value.name || '');
        if (
          nm.toLowerCase() === rawLower ||
          normalizeFdcFoodName(nm).toLowerCase() === wantCanon
        ) {
          matches.push(c.value);
        }
        c.continue();
      } else {
        resolve(matches.length ? pickPreferredFood(matches) : null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function getFoodFromCsvStore(name) {
  if (!name) return null;
  const db = await getDB();
  if (!db.objectStoreNames.contains('csvStore')) return null;
  const tx = db.transaction(['csvStore'], 'readonly');
  const st = tx.objectStore('csvStore');
  if (!st.indexNames.contains('nameIndex')) return null;
  const ix = st.index('nameIndex');
  return idbRequest(ix.get(name));
}

/**
 * Local USDA barcode lookup — only after branded import (caller checks meta).
 * @param {string} upc
 * @returns {Promise<object|null>}
 */
async function lookupByBarcode(upc) {
  const normalized = normalizeUpc(upc);
  if (!normalized || normalized.length < 8) return null;
  const meta = await getFdcMeta();
  if (!meta.brandedImportComplete) return null;

  const db = await getDB();
  const tx = db.transaction(['fdcStore'], 'readonly');
  const ix = tx.objectStore('fdcStore').index('gtinUpcIndex');
  const hits = await idbRequest(ix.getAll(normalized));
  if (hits && hits.length) return pickPreferredFood(hits);
  const padded = normalized.length < 14 ? normalized.padStart(14, '0') : normalized;
  if (padded !== normalized) {
    const hits2 = await idbRequest(ix.getAll(padded));
    if (hits2 && hits2.length) return pickPreferredFood(hits2);
  }
  return null;
}

async function getNutrientById(nutrient_id) {
  const id = String(nutrient_id);
  if (nutrientDefMemory.has(id)) return nutrientDefMemory.get(id);
  const db = await getDB();
  if (!db.objectStoreNames.contains('nutrientStore')) return null;
  const tx = db.transaction(['nutrientStore'], 'readonly');
  const row = await idbRequest(tx.objectStore('nutrientStore').get(id));
  if (row) nutrientDefMemory.set(id, row);
  return row || null;
}

async function ensureNutrientDefsLoaded() {
  await getDB();
  const meta = await getFdcMeta();
  const r = await fetch('assets/processed/fdc_nutrient_defs.json');
  if (!r.ok) throw new Error('fdc_nutrient_defs.json not found');
  const json = await r.json();
  const defs = json.definitions || [];
  const fileVer = json.version || 0;
  if (meta.nutrient_defs_version === fileVer && (await countStore('nutrientStore')) > 0) {
    return;
  }
  await putNutrientDefsBatch(defs);
  await mergeFdcMeta({ nutrient_defs_version: fileVer });
}

async function putNutrientDefsBatch(defs) {
  const db = await getDB();
  const batch = 500;
  nutrientDefMemory = new Map();
  for (let i = 0; i < defs.length; i += batch) {
    const slice = defs.slice(i, i + batch);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['nutrientStore'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const s = tx.objectStore('nutrientStore');
      slice.forEach((d) => {
        const id = String(d.nutrient_id != null ? d.nutrient_id : d.id);
        s.put({
          nutrient_id: id,
          name: d.name,
          unit_name: d.unit_name,
          nutrient_nbr: d.nutrient_nbr,
          rank: d.rank,
        });
      });
    });
  }
}

async function putFoodBatch(records) {
  const db = await getDB();
  const batch = 500;
  for (let i = 0; i < records.length; i += batch) {
    const slice = records.slice(i, i + batch);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['fdcStore'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const s = tx.objectStore('fdcStore');
      slice.forEach((rec) => {
        if (rec.name != null && rec.name !== '') {
          rec.name = normalizeFdcFoodName(rec.name);
          rec.name_lc = String(rec.name).toLowerCase();
        } else if (rec.name_lc == null && rec.name) {
          rec.name_lc = String(rec.name).toLowerCase();
        }
        s.put(rec);
        nutritionCache.set(rec.fdc_id, extractMacrosPer100g(rec.nutrients));
        // Keep in-memory autocomplete list in sync (array mode only).
        // Cursor mode queries IDB directly so it doesn't need this.
        if (_autocompleteEntries.length > 0) {
          const ln = String(rec.name || '').toLowerCase();
          const src = rec.source || 'sr_legacy';
          const existingIdx = _autocompleteEntries.findIndex(
            (e) => String(e.name).toLowerCase() === ln
          );
          const entry = { name: rec.name, fdc_id: rec.fdc_id, source: src };
          if (existingIdx === -1) {
            _autocompleteEntries.push(entry);
          } else if (src === 'branded' && _autocompleteEntries[existingIdx].source !== 'branded') {
            _autocompleteEntries[existingIdx] = entry;
          }
        }
      });
    });
  }
}

async function mergeFdcMeta(partial) {
  const cur = await getFdcMeta();
  const next = Object.assign({}, cur, partial, { key: META_KEY });
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['fdcMeta'], 'readwrite');
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error);
    tx.objectStore('fdcMeta').put(next);
  });
}

/**
 * @returns {Promise<object>}
 */
async function getFdcMeta() {
  const db = await getDB();
  if (!db.objectStoreNames.contains('fdcMeta')) {
    return defaultMeta();
  }
  const tx = db.transaction(['fdcMeta'], 'readonly');
  const row = await idbRequest(tx.objectStore('fdcMeta').get(META_KEY));
  return row ? Object.assign(defaultMeta(), row) : defaultMeta();
}

function defaultMeta() {
  return {
    key: META_KEY,
    importComplete: false,
    brandedImportComplete: false,
    nutrient_defs_version: 0,
    timestamp: null,
    srLegacyCount: 0,
    brandedCount: 0,
  };
}

async function clearCsvStore() {
  const db = await getDB();
  if (!db.objectStoreNames.contains('csvStore')) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['csvStore'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('csvStore').clear();
  });
  _autocompleteEntries = _autocompleteEntries.filter((e) => e.source !== 'csv');
}

async function clearFdcStores() {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['fdcStore', 'nutrientStore', 'fdcMeta'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('fdcStore').clear();
    tx.objectStore('nutrientStore').clear();
    tx.objectStore('fdcMeta').clear();
  });
  nutritionCache.clear();
  _autocompleteEntries = [];
  _fdcCount = 0;
}

/**
 * @returns {Promise<{ fdcCount: number, legacyCount: number } & object>}
 */
async function getFdcStatus() {
  const db = await getDB();
  const meta = await getFdcMeta();
  let fdcCount = 0;
  let legacyCount = 0;
  if (db.objectStoreNames.contains('fdcStore')) {
    fdcCount = await countStore('fdcStore');
  }
  if (db.objectStoreNames.contains('csvStore')) {
    legacyCount = await countStore('csvStore');
  }
  return Object.assign({}, meta, {
    fdcCount,
    legacyCount,
    lastImport: meta.timestamp,
  });
}

/**
 * Populate nutritionCache (array mode) or skip full scan (cursor mode).
 * @returns {Promise<{ entries: Array<{name:string, fdc_id:number|null, source:string}>, fdcCount: number, useCursorMode: boolean }>}
 */
async function loadFoodNamesAndCache() {
  const db = await getDB();
  const meta = await getFdcMeta();
  _fdcCount = await countStore('fdcStore');
  const useCursorMode =
    _fdcCount > ARRAY_MODE_MAX_FOODS && meta.brandedImportComplete;

  if (useCursorMode) {
    nutritionCache.clear();
    _autocompleteEntries = [];
    return {
      entries: [],
      fdcCount: _fdcCount,
      useCursorMode: true,
    };
  }

  nutritionCache.clear();
  const byName = new Map();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['fdcStore'], 'readonly');
    const s = tx.objectStore('fdcStore');
    const req = s.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        const rec = c.value;
        nutritionCache.set(rec.fdc_id, extractMacrosPer100g(rec.nutrients));
        const ln = String(rec.name).toLowerCase();
        const prev = byName.get(ln);
        const src = rec.source || 'sr_legacy';
        if (!prev || (src === 'branded' && prev.source !== 'branded')) {
          byName.set(ln, {
            name: rec.name,
            fdc_id: rec.fdc_id,
            source: src,
          });
        }
        c.continue();
      } else resolve();
    };
    req.onerror = () => reject(req.error);
  });

  const fdcNamesLower = new Set(byName.keys());
  _autocompleteEntries = Array.from(byName.values());

  if (db.objectStoreNames.contains('csvStore')) {
    const tx = db.transaction(['csvStore'], 'readonly');
    const st = tx.objectStore('csvStore');
    if (st.indexNames.contains('nameIndex')) {
      await new Promise((resolve, reject) => {
        const req = st.openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (c) {
            const row = c.value;
            const nm = row.name;
            if (nm && !fdcNamesLower.has(String(nm).toLowerCase())) {
              _autocompleteEntries.push({
                name: nm,
                fdc_id: null,
                source: 'csv',
              });
              fdcNamesLower.add(String(nm).toLowerCase());
            }
            c.continue();
          } else resolve();
        };
        req.onerror = () => reject(req.error);
      });
    }
  }

  return {
    entries: _autocompleteEntries,
    fdcCount: _fdcCount,
    useCursorMode: false,
  };
}

/**
 * Rank autocomplete rows so plain foods (e.g. "Apples, raw…") beat substring
 * matches ("…and apples…"), before slicing to limit.
 * @param {{name:string, fdc_id?:number|null, source?:string}} entry
 * @param {string} userInput
 * @returns {number}
 */
function foodAutocompleteRank(entry, userInput) {
  const q = String(userInput).toLowerCase().trim().replace(/\s+/g, ' ');
  const nm = String(entry.name).toLowerCase();
  if (!q) return 0;

  let rank = 0;

  if (nm === q) rank += 1_000_000;
  else if (nm.startsWith(q)) {
    const next = nm.charAt(q.length);
    if (!next || /[,\s(/]/.test(next)) rank += 920_000;
    else rank += 650_000;
  } else {
    const pos = nm.indexOf(q);
    if (pos !== -1) rank += 420_000 - pos * 2_500;
    else {
      const words = q.split(' ').filter(Boolean);
      if (words.length && words.every((w) => nm.includes(w))) {
        const firstPos = nm.indexOf(words[0]);
        rank += 250_000 - firstPos * 2_000;
      }
    }
  }

  rank -= Math.min(nm.length, 180);

  const src = entry.source || '';
  if (src === 'branded') rank -= 40;

  return rank;
}

/**
 * @param {Array<{name:string, fdc_id?:number|null, source?:string}>} matches
 * @param {string} userInput
 * @returns {Array<{name:string, fdc_id?:number|null, source?:string}>}
 */
function sortFoodAutocompleteMatches(matches, userInput) {
  const q = String(userInput || '');
  return matches.slice().sort((a, b) => {
    const d = foodAutocompleteRank(b, q) - foodAutocompleteRank(a, q);
    if (d !== 0) return d;
    return String(a.name).localeCompare(String(b.name));
  });
}

/**
 * Prefix / word filter search for large corpora.
 * @param {string} userInput
 * @param {number} limit
 * @returns {Promise<Array<{name:string, fdc_id:number, source:string}>>}
 */
async function searchFoodsByPrefix(userInput, limit = AUTOCOMPLETE_LIMIT) {
  const myId = ++autocompleteQueryId;
  const words = String(userInput)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const prefix = words[0];
  const db = await getDB();
  const seen = new Map();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['fdcStore'], 'readonly');
    const store = tx.objectStore('fdcStore');
    const idxName = store.indexNames.contains('nameLcIndex')
      ? 'nameLcIndex'
      : 'nameIndex';
    const ix = store.index(idxName);
    const keyPrefix = idxName === 'nameLcIndex' ? prefix.toLowerCase() : prefix;
    const range = IDBKeyRange.bound(keyPrefix, keyPrefix + '\uffff');
    const req = ix.openCursor(range);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      if (myId !== autocompleteQueryId) {
        resolve([]);
        return;
      }
      const c = req.result;
      if (!c) {
        resolve(
          sortFoodAutocompleteMatches(Array.from(seen.values()), userInput).slice(
            0,
            limit
          )
        );
        return;
      }
      const rec = c.value;
      const nm = String(rec.name).toLowerCase();
      if (words.every((w) => nm.includes(w))) {
        const src = rec.source || 'sr_legacy';
        const prev = seen.get(nm);
        if (!prev || (src === 'branded' && prev.source !== 'branded')) {
          seen.set(nm, {
            name: rec.name,
            fdc_id: rec.fdc_id,
            source: src,
          });
        }
      }
      c.continue();
    };
  });
}

/** @deprecated callback style; prefer async */
function fetchValueForKey(foodName, headerKey, callback) {
  fetchValueForKeyAsync(foodName, headerKey)
    .then((v) => callback(v))
    .catch(() => callback(0));
}

async function fetchValueForKeyAsync(foodName, headerKey) {
  const fdc = await getFoodByName(foodName);
  if (fdc) {
    if (headerKey === 'servingWeight1') {
      return fdc.serving_weight != null ? fdc.serving_weight : 100;
    }
    if (headerKey === 'servingDescription1') {
      return fdc.serving_description || '';
    }
    if (headerKey === 'calories')
      return (fdc.nutrients && fdc.nutrients.calories) || 0;
    if (headerKey === 'fat') return (fdc.nutrients && fdc.nutrients.fat) || 0;
    if (headerKey === 'protein')
      return (fdc.nutrients && fdc.nutrients.protein) || 0;
    if (headerKey === 'carbohydrate')
      return (
        (fdc.nutrients &&
          (fdc.nutrients.carbohydrate != null
            ? fdc.nutrients.carbohydrate
            : fdc.nutrients.carbs)) ||
        0
      );
  }
  const csv = await getFoodFromCsvStore(foodName);
  if (!csv) return headerKey === 'servingDescription1' ? '' : 0;
  if (headerKey === 'calories') return csv.calories || 0;
  if (headerKey === 'fat') return csv.fat || 0;
  if (headerKey === 'protein') return csv.protein || 0;
  if (headerKey === 'carbohydrate') return csv.carbohydrate || 0;
  if (headerKey === 'servingWeight1') return csv.servingWeight1 || 0;
  if (headerKey === 'servingDescription1') return csv.servingDescription1 || '';
  return 0;
}

/**
 * @param {string|number} nameOrId food name or fdc_id when second arg is grams only
 * @param {number} grams
 * @param {number|null|undefined} explicitFdcId optional fdc_id from autocomplete
 * @returns {Promise<{calories:number, protein:number, fat:number, carbs:number}>}
 */
async function getNutritionalInfo(nameOrId, grams, explicitFdcId) {
  const g = Number(grams);
  let food = null;
  if (
    explicitFdcId != null &&
    explicitFdcId !== '' &&
    !Number.isNaN(Number(explicitFdcId))
  ) {
    food = await getFoodById(Number(explicitFdcId));
  } else if (
    typeof nameOrId === 'number' &&
    Number.isFinite(nameOrId) &&
    !explicitFdcId
  ) {
    food = await getFoodById(nameOrId);
  }
  if (!food && nameOrId != null) {
    food = await getFoodByName(String(nameOrId));
  }
  if (!food) {
    food = await getFoodFromCsvStore(String(nameOrId));
    if (food) {
      return {
        calories: Math.round(((g / 100) * (food.calories || 0)) * 10) / 10,
        protein: Math.round(((g / 100) * (food.protein || 0)) * 10) / 10,
        fat: Math.round(((g / 100) * (food.fat || 0)) * 10) / 10,
        carbs: Math.round(((g / 100) * (food.carbohydrate || 0)) * 10) / 10,
      };
    }
    throw new Error('Food not found');
  }
  let per100 = nutritionCache.get(food.fdc_id);
  if (!per100 && food.nutrients) {
    per100 = extractMacrosPer100g(food.nutrients);
    nutritionCache.set(food.fdc_id, per100);
  }
  if (!per100) per100 = extractMacrosPer100g(food.nutrients);
  return scaleMacrosFrom100g(per100, g);
}

function nutritionFromFoodRecord(food, grams) {
  const per100 = extractMacrosPer100g(food.nutrients);
  return scaleMacrosFrom100g(per100, grams);
}

/**
 * Sync helpers for charts: attach macros onto item copies when possible.
 * @param {object} item food log row
 * @returns {Promise<object>}
 */
async function enrichFoodLogItemForDisplay(item) {
  const out = Object.assign({}, item);
  if (item.fdc_id != null && item.fdc_id !== '') {
    let per100 = nutritionCache.get(Number(item.fdc_id));
    if (!per100) {
      const food = await getFoodById(item.fdc_id);
      if (food) {
        per100 = extractMacrosPer100g(food.nutrients);
        nutritionCache.set(food.fdc_id, per100);
      }
    }
    if (per100) {
      const s = scaleMacrosFrom100g(per100, item.grams);
      out.calories = s.calories;
      out.protein = s.protein;
      out.carbs = s.carbs;
      out.fat = s.fat;
      return out;
    }
  }
  if (item.calories != null) {
    out.calories = item.calories;
    out.protein = item.protein || 0;
    out.carbs = item.carbs || 0;
    out.fat = item.fat || 0;
    return out;
  }
  try {
    const n = await getNutritionalInfo(
      item.name,
      item.grams,
      item.fdc_id != null ? item.fdc_id : undefined
    );
    out.calories = n.calories;
    out.protein = n.protein;
    out.carbs = n.carbs;
    out.fat = n.fat;
    return out;
  } catch {
    out.calories = 0;
    out.protein = 0;
    out.carbs = 0;
    out.fat = 0;
    return out;
  }
}

async function enrichFoodLogDayItems(items) {
  const arr = Array.isArray(items) ? items : [];
  return Promise.all(arr.map((i) => enrichFoodLogItemForDisplay(i)));
}

/** Bump when migrateFoodLogIfNeeded logic changes so users re-run migration once. */
const FOOD_LOG_MIGRATION_VERSION = 1;

/**
 * Synchronous best-effort macros for first paint (no IndexedDB).
 * Uses stored flat macros or nutritionCache hit for fdc_id rows; otherwise zeros.
 * @param {object} item food log row
 * @returns {object} shallow copy with calories, protein, carbs, fat
 */
function quickDisplayMacrosForLogItem(item) {
  const out = Object.assign({}, item);
  const g = Number(item.grams);
  const grams = Number.isFinite(g) && g > 0 ? g : 0;
  if (item.calories != null) {
    out.calories = item.calories;
    out.protein = item.protein || 0;
    out.carbs = item.carbs || 0;
    out.fat = item.fat || 0;
    return out;
  }
  if (item.fdc_id != null && item.fdc_id !== '') {
    let per100 = nutritionCache.get(Number(item.fdc_id));
    if (per100) {
      const s = scaleMacrosFrom100g(per100, grams);
      out.calories = s.calories;
      out.protein = s.protein;
      out.carbs = s.carbs;
      out.fat = s.fat;
      return out;
    }
  }
  out.calories = 0;
  out.protein = 0;
  out.carbs = 0;
  out.fat = 0;
  return out;
}

/**
 * Migrate legacy flat nutrition fields to fdc_id + trim; returns new object.
 * @param {object} foodLog
 * @returns {Promise<object>}
 */
async function migrateFoodLogIfNeeded(foodLog) {
  const storedVer = localStorage.getItem('foodLogMigrationVersion');
  if (storedVer === String(FOOD_LOG_MIGRATION_VERSION)) {
    const log = foodLog && typeof foodLog === 'object' ? foodLog : {};
    return { log, changed: false };
  }

  const log = foodLog && typeof foodLog === 'object' ? foodLog : {};
  let changed = false;
  const out = {};
  for (const day of Object.keys(log)) {
    const list = Array.isArray(log[day]) ? log[day] : [];
    const nextList = [];
    for (const item of list) {
      const row = Object.assign({}, item);
      if ('fdc_id' in row && row.fdc_id !== undefined) {
        if (row.calories != null && row.fdc_id != null) {
          delete row.calories;
          delete row.protein;
          delete row.carbs;
          delete row.fat;
          changed = true;
        }
        nextList.push(row);
        continue;
      }
      if (row.calories != null || row.protein != null) {
        const hit = await getFoodByName(String(row.name || ''));
        if (hit) {
          row.fdc_id = hit.fdc_id;
          delete row.calories;
          delete row.protein;
          delete row.carbs;
          delete row.fat;
        } else {
          row.fdc_id = null;
        }
        changed = true;
      }
      nextList.push(row);
    }
    out[day] = nextList;
  }
  if (changed) {
    localStorage.setItem('foodLog', JSON.stringify(out));
  }
  localStorage.setItem('foodLogMigrationVersion', String(FOOD_LOG_MIGRATION_VERSION));
  return { log: out, changed };
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
    entries = foodList.map((n) => ({
      name: typeof n === 'string' ? n : n.name,
      fdc_id:
        typeof n === 'object' && n && 'fdc_id' in n ? n.fdc_id : null,
      source:
        typeof n === 'object' && n && n.source ? n.source : 'legacy',
    }));
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

  function fillServingHints(entry) {
    if (entry.fdc_id != null && entry.fdc_id !== '') {
      getFoodById(entry.fdc_id).then((food) => {
        if (!food || !gramsEl) return;
        if (food.serving_weight != null) {
          gramsEl.value = food.serving_weight;
          gramsEl.select();
        }
        if (typeof showServingBubble === 'function' && food.serving_description) {
          showServingBubble(food.serving_description, gramsEl);
        }
      });
    } else {
      fetchValueForKey(entry.name, 'servingWeight1', function (value) {
        if (value && gramsEl) {
          gramsEl.value = value;
          gramsEl.select();
        }
      });
      fetchValueForKey(entry.name, 'servingDescription1', function (description) {
        if (typeof showServingBubble === 'function' && description) {
          showServingBubble(description, gramsEl);
        }
      });
    }
  }

  function renderList(matches) {
    while (ac.firstChild) ac.removeChild(ac.firstChild);
    matches.forEach((entry) => {
      const div = document.createElement('div');
      div.textContent = entry.name;
      if (entry.fdc_id != null && entry.fdc_id !== '') {
        div.dataset.fdcId = String(entry.fdc_id);
      }
      div.addEventListener('click', function () {
        inputEl.value = entry.name;
        if (entry.fdc_id != null && entry.fdc_id !== '') {
          inputEl.dataset.fdcId = String(entry.fdc_id);
        } else {
          delete inputEl.dataset.fdcId;
        }
        ac.innerHTML = '';
        gramsEl.focus();
        gramsEl.select();
        fillServingHints(entry);
      });
      ac.appendChild(div);
    });
  }

  inputEl.addEventListener('input', function () {
    const userInput = this.value;
    if (debounceTimer) clearTimeout(debounceTimer);

    if (userInput.length <= 1) {
      ac.innerHTML = '';
      delete inputEl.dataset.fdcId;
      return;
    }

    debounceTimer = setTimeout(async function () {
      const words = userInput.toLowerCase().split(/\s+/).filter(Boolean);

      if (_fdcCount > ARRAY_MODE_MAX_FOODS && (await getFdcMeta()).brandedImportComplete) {
        const found = await searchFoodsByPrefix(userInput, AUTOCOMPLETE_LIMIT);
        renderList(found);
        return;
      }

      const filtered = entries.filter((e) => {
        const lower = e.name.toLowerCase();
        return words.every((w) => lower.includes(w));
      });
      renderList(
        sortFoodAutocompleteMatches(filtered, userInput).slice(0, AUTOCOMPLETE_LIMIT)
      );
    }, 250);
  });
}

function resetDBConnection() {
  dbPromise = null;
}

function loadFoodNames() {
  return loadFoodNamesAndCache().then((r) =>
    r.entries.map((e) => e.name)
  );
}
