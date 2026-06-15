/**
 * FDC name search, ranking, recent selections, autocomplete, UPC normalize.
 */
const AUTOCOMPLETE_LIMIT = 30;
let autocompleteQueryId = 0;

// ---- Recent food selection boost ----
const RECENT_SELECTIONS_MAX = 50;
let _recentSelections = null; // lazy-loaded cache

function _loadRecentSelections() {
  if (_recentSelections) return _recentSelections;
  _recentSelections = RadiantStorage.nutrition.getRecentFoodSelections();
  return _recentSelections;
}

function _selectionKey(entry) {
  return entry.fdc_id != null
    ? `fdc:${entry.fdc_id}`
    : `name:${String(entry.name).toLowerCase()}`;
}

function recordFoodSelection(entry) {
  const key = _selectionKey(entry);
  const list = _loadRecentSelections().filter((s) => s !== key);
  list.unshift(key);
  _recentSelections = list.slice(0, RECENT_SELECTIONS_MAX);
  try {
    RadiantStorage.nutrition.saveRecentFoodSelections(_recentSelections);
  } catch { /* storage full — ignore */ }
}

function _recentSelectionBoost(entry) {
  const list = _loadRecentSelections();
  const idx = list.indexOf(_selectionKey(entry));
  if (idx === -1) return 0;
  // Most recent (idx 0) → +300k, fades to 0 at RECENT_SELECTIONS_MAX
  return Math.round(300_000 * (1 - idx / RECENT_SELECTIONS_MAX));
}
function normalizeUpc(raw) {
  if (raw == null) return '';
  const d = String(raw).replace(/\D/g, '');
  return d;
}
function foodAutocompleteRank(entry, userInput) {
  const q = String(userInput).toLowerCase().trim().replace(/\s+/g, ' ');
  const nm = String(entry.name).toLowerCase();
  if (!q) return 0;

  let rank = 0;

  if (nm === q) rank += 1_000_000;
  else if (nm.startsWith(q)) {
    const next = nm.charAt(q.length);
    if (!next || /[,(/]/.test(next)) {
      rank += 920_000;
    } else {
      // Reward how much of the lead word the query covers.
      // "app" in "apples," (lead word len 6) → coverage 0.50 → +100k
      // "app" in "applebee's," (lead word len 10) → coverage 0.30 → +60k
      const rest = nm.slice(q.length);
      const delimIdx = rest.search(/[,(]/);
      const leadWordEnd = delimIdx === -1 ? nm.length : q.length + delimIdx;
      const coverage = q.length / leadWordEnd;
      rank += 650_000 + Math.round(coverage * 200_000);
    }
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

  rank += _recentSelectionBoost(entry);

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
/**
 * Prefix search for custom recipes in recipeStore (foodGroup === 'Custom Recipe').
 * @param {string} userInput
 * @param {number} limit
 * @returns {Promise<Array<{name:string, fdc_id:null, source:string}>>}
 */
async function searchCustomRecipesByPrefix(userInput, limit = AUTOCOMPLETE_LIMIT) {
  const words = String(userInput)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return [];

  const db = await getDB();
  if (!db.objectStoreNames.contains('recipeStore')) return [];

  const matches = [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['recipeStore'], 'readonly');
    const req = tx.objectStore('recipeStore').openCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const c = req.result;
      if (!c) {
        resolve(
          sortFoodAutocompleteMatches(matches, userInput).slice(0, limit)
        );
        return;
      }
      const row = c.value;
      if ((row.foodGroup || '') === 'Custom Recipe' && row.name) {
        const nm = String(row.name).toLowerCase();
        if (words.every((w) => nm.includes(w))) {
          matches.push({
            name: row.name,
            fdc_id: null,
            source: 'recipe',
          });
        }
      }
      c.continue();
    };
  });
}

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
