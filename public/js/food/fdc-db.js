/**
 * IndexedDB: fdcStore, nutrientStore, fdcMeta, connection management.
 */
const DB_NAME = 'csvDB';
const DB_VERSION = 5;
const META_KEY = 'status';
const ARRAY_MODE_MAX_FOODS = 50000;

const nutritionCache = new Map();
let dbPromise = null;
let nutrientDefMemory = new Map();
let _autocompleteEntries = [];
let _fdcCount = 0;

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
    req.onsuccess = () => {
      const db = req.result;
      // Close this connection cleanly if another tab/context opens a newer DB version,
      // so it isn't blocked waiting for us.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onblocked = () => {
      // Another tab has the DB open at an older version and hasn't closed yet.
      // Reject immediately so callers get a fast, actionable error instead of hanging forever.
      dbPromise = null;
      reject(new Error('IndexedDB upgrade blocked by another open tab — close other tabs running this app and reload, or use Settings → Delete IndexedDB to recover'));
    };
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      const { oldVersion } = ev;
      try {
        if (
          oldVersion > 0 &&
          oldVersion < 5 &&
          db.objectStoreNames.contains('csvStore')
        ) {
          const tx = ev.target.transaction;
          const oldStore = tx.objectStore('csvStore');
          const newStore = db.createObjectStore('recipeStore', { keyPath: 'id' });
          newStore.createIndex('nameIndex', 'name', { unique: true });
          oldStore.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              newStore.put(cursor.value);
              cursor.continue();
            }
          };
        } else if (
          !db.objectStoreNames.contains('recipeStore') &&
          !db.objectStoreNames.contains('csvStore')
        ) {
          const os = db.createObjectStore('recipeStore', { keyPath: 'id' });
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

async function getFoodFromRecipeStore(name) {
  if (!name) return null;
  const db = await getDB();
  if (!db.objectStoreNames.contains('recipeStore')) return null;
  const tx = db.transaction(['recipeStore'], 'readonly');
  const st = tx.objectStore('recipeStore');
  if (!st.indexNames.contains('nameIndex')) return null;
  const ix = st.index('nameIndex');
  return idbRequest(ix.get(name));
}

/**
 * Local fdcStore barcode lookup by GTIN/UPC (offline branded import, USDA SR,
 * or any item previously saved from the scanner).
 * @param {string} upc
 * @returns {Promise<object|null>}
 */
async function lookupByBarcode(upc) {
  const normalized = normalizeUpc(upc);
  if (!normalized || normalized.length < 8) return null;

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

async function clearRecipeStore() {
  const db = await getDB();
  if (!db.objectStoreNames.contains('recipeStore')) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['recipeStore'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('recipeStore').clear();
  });
  _autocompleteEntries = _autocompleteEntries.filter((e) => e.source !== 'recipe');
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
async function getFdcStatus() {
  const db = await getDB();
  const meta = await getFdcMeta();
  let fdcCount = 0;
  let legacyCount = 0;
  if (db.objectStoreNames.contains('fdcStore')) {
    fdcCount = await countStore('fdcStore');
  }
  if (db.objectStoreNames.contains('recipeStore')) {
    legacyCount = await countStore('recipeStore');
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

  if (db.objectStoreNames.contains('recipeStore')) {
    const tx = db.transaction(['recipeStore'], 'readonly');
    const st = tx.objectStore('recipeStore');
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
                source: 'recipe',
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
async function getNutritionalInfo(nameOrId, grams, explicitFdcId, foodSource) {
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
  if (!food && nameOrId != null && foodSource === 'recipe') {
    food = await getFoodFromRecipeStore(String(nameOrId));
  }
  if (!food && nameOrId != null && foodSource !== 'recipe') {
    food = await getFoodByName(String(nameOrId));
  }
  if (!food) {
    food = await getFoodFromRecipeStore(String(nameOrId));
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
      item.fdc_id != null ? item.fdc_id : undefined,
      item.fdc_id == null ? 'recipe' : undefined
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
function resetDBConnection() {
  dbPromise = null;
}

function loadFoodNames() {
  return loadFoodNamesAndCache().then((r) =>
    r.entries.map((e) => e.name)
  );
}
