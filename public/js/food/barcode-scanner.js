/**
 * Barcode scan → local USDA (if branded import done) or USDA API fallback → confirm → callback.
 * Online USDA fallback does not write into fdcStore.
 */
(function () {
  let zxingReaderPromise = null;
  const USDA_ID_TO_KEY = window.USDA_ID_TO_KEY || {};

  function loadZXing() {
    if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
      return Promise.resolve(window.ZXing);
    }
    if (zxingReaderPromise) return zxingReaderPromise;
    zxingReaderPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/zxing/index.min.js';
      s.async = true;
      s.onload = () => resolve(window.ZXing);
      s.onerror = () => reject(new Error('ZXing load failed'));
      document.head.appendChild(s);
    });
    return zxingReaderPromise;
  }

  const normalizeUpc =
    typeof window.normalizeUpc === 'function'
      ? window.normalizeUpc
      : function (raw) {
          return String(raw || '').replace(/\D/g, '');
        };

  /**
   * Appends brand to a food name only when the brand isn't already present in it.
   * e.g. "FROSTED FLAKES" + "Kellogg's" → "FROSTED FLAKES · Kellogg's"
   *      "Kellogg's FROSTED FLAKES" + "Kellogg's" → "Kellogg's FROSTED FLAKES"
   */
  function nameWithBrand(name, brand) {
    const n = String(name || '').trim() || 'Unknown product';
    const b = String(brand || '').trim();
    if (!b || n.toLowerCase().includes(b.toLowerCase())) return n;
    return n + ' · ' + b;
  }

  /** Resolved key for api.nal.usda.gov. Official docs allow literal DEMO_KEY for exploration (stricter rate limits). */
  function getUsdaApiKey() {
    const fromWindow =
      typeof window !== 'undefined' && typeof window.USDA_FDC_API_KEY === 'string'
        ? window.USDA_FDC_API_KEY
        : '';
    const fromStorage = RadiantStorage.settings.getUsdaApiKey();
    const key = String(fromWindow || fromStorage).trim();
    return key || 'DEMO_KEY';
  }

  function numberOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function mapUsdaFoodNutrients(foodNutrients) {
    if (!Object.keys(USDA_ID_TO_KEY).length) {
      throw new Error('USDA nutrient map missing. Load usda-id-to-key.js.');
    }
    const out = {};
    if (!Array.isArray(foodNutrients)) return out;
    for (let i = 0; i < foodNutrients.length; i++) {
      const row = foodNutrients[i] || {};
      const nutrientId =
        row.nutrientId != null
          ? Number(row.nutrientId)
          : row.nutrient && row.nutrient.id != null
            ? Number(row.nutrient.id)
            : null;
      if (!nutrientId || !USDA_ID_TO_KEY[nutrientId]) continue;
      const amt = numberOrNull(row.value != null ? row.value : row.amount);
      if (amt == null) continue;
      out[USDA_ID_TO_KEY[nutrientId]] = amt;
    }
    return out;
  }

  function chooseBestUsdaFood(foods, code) {
    if (!Array.isArray(foods) || foods.length === 0) return null;
    const normalized = normalizeUpc(code);
    const padded = normalized.length < 14 ? normalized.padStart(14, '0') : normalized;
    const exact = foods.find((f) => {
      const gtin = normalizeUpc(f && f.gtinUpc);
      return gtin === normalized || gtin === padded;
    });
    return exact || foods[0];
  }

  async function fetchUsdaByBarcode(code) {
    const apiKey = getUsdaApiKey();
    const url =
      'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey);
    const body = {
      query: String(code),
      dataType: ['Branded'],
      pageSize: 25,
      requireAllWords: false,
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      throw new Error('USDA API request failed (' + r.status + ')');
    }
    const data = await r.json();
    const food = chooseBestUsdaFood(data && data.foods, code);
    if (!food) return null;

    const nutrients = mapUsdaFoodNutrients(food.foodNutrients);
    const servingSize = numberOrNull(food.servingSize);
    const servingUnit = String(food.servingSizeUnit || '').toLowerCase();
    const defaultGrams =
      servingSize != null && servingSize > 0 && servingUnit.startsWith('g')
        ? servingSize
        : 100;
    const fdcId = food.fdcId ? Number(food.fdcId) : null;
    const displayName = nameWithBrand(food.description || food.lowercaseDescription, food.brandOwner);

    return {
      name: displayName,
      source: 'usda_api',
      fdc_id: fdcId,
      sourceLabel: 'USDA API',
      defaultGrams,
      nutrients,
      per100: extractMacrosForScanner(nutrients),
      fdcRecord: fdcId ? {
        fdc_id: fdcId,
        name: displayName,
        name_lc: displayName.toLowerCase(),
        gtin_upc: normalizeUpc(food.gtinUpc || code),
        brand_owner: food.brandOwner || '',
        source: 'usda_api',
        serving_weight: defaultGrams,
        serving_description: food.householdServingFullText || '',
        nutrients,
      } : null,
    };
  }

  // OFF nutriments are all in grams/100g; multipliers convert to USDA schema units.
  const OFF_NUTRIENT_MAP = [
    // g stays g (macros)
    ['energy-kcal_100g',         'calories',           1      ],
    ['proteins_100g',            'protein',            1      ],
    ['fat_100g',                 'fat',                1      ],
    ['carbohydrates_100g',       'carbohydrate',       1      ],
    ['fiber_100g',               'fiber',              1      ],
    ['sugars_100g',              'sugars',             1      ],
    ['saturated-fat_100g',       'saturated_fat',      1      ],
    ['trans-fat_100g',           'trans_fat',          1      ],
    ['monounsaturated-fat_100g', 'monounsaturated_fat',1      ],
    ['polyunsaturated-fat_100g', 'polyunsaturated_fat',1      ],
    // g → mg (×1000)
    ['cholesterol_100g',         'cholesterol',        1000   ],
    ['sodium_100g',              'sodium',             1000   ],
    ['calcium_100g',             'calcium',            1000   ],
    ['iron_100g',                'iron',               1000   ],
    ['magnesium_100g',           'magnesium',          1000   ],
    ['phosphorus_100g',          'phosphorus',         1000   ],
    ['potassium_100g',           'potassium',          1000   ],
    ['zinc_100g',                'zinc',               1000   ],
    ['copper_100g',              'copper',             1000   ],
    ['vitamin-c_100g',           'vitamin_c',          1000   ],
    ['thiamin_100g',             'thiamin',            1000   ],
    ['riboflavin_100g',          'riboflavin',         1000   ],
    ['vitamin-pp_100g',          'niacin',             1000   ],
    ['vitamin-b6_100g',          'vitamin_b6',         1000   ],
    ['vitamin-e_100g',           'vitamin_e',          1000   ],
    // g → µg (×1,000,000)
    ['folates_100g',             'folate',             1e6    ],
    ['vitamin-b12_100g',         'vitamin_b12',        1e6    ],
    ['vitamin-a_100g',           'vitamin_a',          1e6    ],
    ['vitamin-d_100g',           'vitamin_d',          1e6    ],
    ['vitamin-k_100g',           'vitamin_k',          1e6    ],
    ['selenium_100g',            'selenium',           1e6    ],
    // amino acids (g stays g, present in detailed records only)
    ['tryptophan_100g',          'tryptophan',         1      ],
    ['threonine_100g',           'threonine',          1      ],
    ['isoleucine_100g',          'isoleucine',         1      ],
    ['leucine_100g',             'leucine',            1      ],
    ['lysine_100g',              'lysine',             1      ],
    ['methionine_100g',          'methionine',         1      ],
    ['phenylalanine_100g',       'phenylalanine',      1      ],
    ['valine_100g',              'valine',             1      ],
    ['histidine_100g',           'histidine',          1      ],
    ['arginine_100g',            'arginine',           1      ],
    ['alanine_100g',             'alanine',            1      ],
    ['aspartic-acid_100g',       'aspartic_acid',      1      ],
    ['glutamic-acid_100g',       'glutamic_acid',      1      ],
    ['glycine_100g',             'glycine',            1      ],
    ['proline_100g',             'proline',            1      ],
    ['serine_100g',              'serine',             1      ],
  ];

  function mapOffNutrients(nutriments) {
    const out = {};
    if (!nutriments) return out;
    for (let i = 0; i < OFF_NUTRIENT_MAP.length; i++) {
      const field = OFF_NUTRIENT_MAP[i][0];
      const key   = OFF_NUTRIENT_MAP[i][1];
      const mult  = OFF_NUTRIENT_MAP[i][2];
      const raw = nutriments[field];
      if (raw == null) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      out[key] = Math.round(n * mult * 10000) / 10000;
    }
    return out;
  }

  async function fetchOffByBarcode(code) {
    const url =
      'https://world.openfoodfacts.org/api/v2/product/' +
      encodeURIComponent(code) +
      '.json?fields=product_name,product_name_en,brands,serving_quantity,serving_size,nutriments';
    const r = await fetch(url);
    if (!r.ok) throw new Error('Open Food Facts request failed (' + r.status + ')');
    const data = await r.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const n = p.nutriments || {};
    if (!n['energy-kcal_100g']) return null;

    const nutrients = mapOffNutrients(n);
    const servingGrams = numberOrNull(p.serving_quantity) || 100;
    const brand = String(p.brands || '').split(',')[0].trim();
    const displayName = nameWithBrand(p.product_name_en || p.product_name || 'Unknown product', brand);
    // Use the numeric barcode as fdc_id — EAN-13/UPC-A fit safely in JS float;
    // USDA FDC IDs are 6–7 digits so no collision with a 12–13 digit barcode.
    const syntheticId = Number(code) || null;

    return {
      name: displayName,
      source: 'off_api',
      fdc_id: syntheticId,
      sourceLabel: 'Open Food Facts',
      defaultGrams: servingGrams,
      nutrients,
      per100: extractMacrosForScanner(nutrients),
      fdcRecord: syntheticId ? {
        fdc_id: syntheticId,
        name: displayName,
        name_lc: displayName.toLowerCase(),
        gtin_upc: code,
        brand_owner: brand,
        source: 'off_api',
        serving_weight: servingGrams,
        serving_description: String(p.serving_size || ''),
        nutrients,
      } : null,
    };
  }

  /**
   * Online USDA word search (Branded only).
   * @returns {Promise<Array<{name:string, fdc_id:number|null, sourceLabel:string, source:string, defaultGrams:number, per100:object, fdcRecord:object|null}>>}
   */
  async function searchUsdaFoods(query) {
    const apiKey = getUsdaApiKey();
    const url =
      'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey);
    const body = {
      query: String(query),
      dataType: ['Branded'],
      pageSize: 25,
      requireAllWords: false,
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('USDA API request failed (' + r.status + ')');
    const data = await r.json();
    const foods = Array.isArray(data && data.foods) ? data.foods : [];
    const results = [];
    for (let i = 0; i < foods.length; i++) {
      const food = foods[i] || {};
      const nutrients = mapUsdaFoodNutrients(food.foodNutrients);
      if (!nutrients.calories) continue;
      const servingSize = numberOrNull(food.servingSize);
      const servingUnit = String(food.servingSizeUnit || '').toLowerCase();
      const defaultGrams =
        servingSize != null && servingSize > 0 && servingUnit.startsWith('g')
          ? servingSize
          : 100;
      const fdcId = food.fdcId ? Number(food.fdcId) : null;
      const displayName = nameWithBrand(food.description || food.lowercaseDescription, food.brandOwner);
      results.push({
        name: displayName,
        source: 'usda_api',
        fdc_id: fdcId,
        sourceLabel: 'USDA API',
        defaultGrams,
        per100: extractMacrosForScanner(nutrients),
        fdcRecord: fdcId ? {
          fdc_id: fdcId,
          name: displayName,
          name_lc: displayName.toLowerCase(),
          gtin_upc: normalizeUpc(food.gtinUpc || ''),
          brand_owner: food.brandOwner || '',
          source: 'usda_api',
          serving_weight: defaultGrams,
          serving_description: food.householdServingFullText || '',
          nutrients,
        } : null,
      });
    }
    return results;
  }

  /**
   * Online Open Food Facts word search.
   * Products lacking energy/calorie data are skipped so every result has macros.
   * @returns {Promise<Array<{name:string, fdc_id:number|null, sourceLabel:string, source:string, defaultGrams:number, per100:object, fdcRecord:object|null}>>}
   */
  async function searchOffFoods(query, limit = 25) {
    const url =
      'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_terms=' +
      encodeURIComponent(query) +
      '&page_size=' +
      limit +
      '&fields=product_name,product_name_en,brands,code,nutriments,serving_quantity,serving_size,nutrition_data';
    const r = await fetch(url);
    if (!r.ok) throw new Error('Open Food Facts request failed (' + r.status + ')');
    const data = await r.json();
    const products = Array.isArray(data && data.products) ? data.products : [];
    const results = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i] || {};
      const nutriments = p.nutriments || {};
      if (!nutriments['energy-kcal_100g']) continue;
      const brand = String(p.brands || '').split(',')[0].trim();
      const displayName = nameWithBrand(p.product_name_en || p.product_name || 'Unknown product', brand);
      // Use the numeric barcode as fdc_id — EAN-13/UPC-A fit safely in JS float;
      // USDA FDC IDs are 6–7 digits so no collision with a 12–13 digit barcode.
      const syntheticId = Number(p.code) || null;
      const defaultGrams = numberOrNull(p.serving_quantity) || 100;
      const nutrients = mapOffNutrients(nutriments);
      results.push({
        name: displayName,
        source: 'off_api',
        fdc_id: syntheticId,
        sourceLabel: 'Open Food Facts',
        defaultGrams,
        per100: extractMacrosForScanner(nutrients),
        fdcRecord: syntheticId ? {
          fdc_id: syntheticId,
          name: displayName,
          name_lc: displayName.toLowerCase(),
          gtin_upc: String(p.code || ''),
          brand_owner: brand,
          source: 'off_api',
          serving_weight: defaultGrams,
          serving_description: String(p.serving_size || ''),
          nutrients,
        } : null,
      });
    }
    return results;
  }

  /**
   * Word search routed by the given active source ('usda' or 'off').
   * Unknown sources fall back to USDA as a safe default.
   * Errors from the failing source are logged to the console and re-thrown
   * so the caller can show a UI notification.
   * @param {string} query
   * @param {string} source
   * @returns {Promise<Array>}
   */
  async function searchFoodsOnline(query, source) {
    const useOff = source === 'off';
    try {
      return useOff ? await searchOffFoods(query) : await searchUsdaFoods(query);
    } catch (e) {
      console.error('[barcode scanner] ' + (useOff ? 'Open Food Facts' : 'USDA') + ' search failed:', e);
      throw e;
    }
  }

  function getBarcodeSourceSetting() {
    return RadiantStorage.settings.getBarcodeSource();
  }

  let _activeSearchSource = null;

  function defaultSearchSourceFromSetting() {
    const s = getBarcodeSourceSetting();
    return s === 'usda' || s === 'both' ? 'usda' : 'off';
  }

  function activeSearchSource() {
    return _activeSearchSource || defaultSearchSourceFromSetting();
  }

  function otherSearchSource(src) {
    return src === 'usda' ? 'off' : 'usda';
  }

  function renderSourceTabs(container, active, onSelect) {
    if (!container) return;
    container.innerHTML = '';
    const tabs = [
      { src: 'usda', label: 'USDA' },
      { src: 'off', label: 'Open Food Facts' },
    ];
    tabs.forEach(function (tab) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = tab.src === active;
      btn.textContent = tab.label;
      btn.style.cssText =
        'flex:1;padding:8px 10px;font-size:0.9em;cursor:pointer;box-sizing:border-box;' +
        'border:1px solid var(--border-color,#444);border-bottom:2px solid ' +
        (isActive ? 'var(--accent,#4c9aff)' : 'transparent') + ';' +
        'background:' + (isActive ? 'var(--accent-dim,rgba(76,154,255,.18))' : 'var(--button,#333)') + ';' +
        'color:var(--text-color,#fff);opacity:' + (isActive ? '1' : '0.75') + ';';
      btn.addEventListener('click', function () { onSelect(tab.src); });
      container.appendChild(btn);
    });
  }

  function scalePer100(per100, grams) {
    const g = Number(grams) || 100;
    const f = g / 100;
    return {
      calories: Math.round(per100.calories * f * 10) / 10,
      protein: Math.round(per100.protein * f * 10) / 10,
      fat: Math.round(per100.fat * f * 10) / 10,
      carbs: Math.round(per100.carbs * f * 10) / 10,
    };
  }

  function ensureModal() {
    let el = document.getElementById('barcode-scanner-root');
    if (el && (!el.querySelector('#barcode-manual') || !el.querySelector('#barcode-save-label') || !el.querySelector('#food-search-panel') || !el.querySelector('#food-search-tabs') || !el.querySelector('#barcode-source-tabs'))) {
      el.remove();
      el = null;
    }
    if (el) return el;
    el = document.createElement('div');
    el.id = 'barcode-scanner-root';
    el.innerHTML = `
      <div class="barcode-backdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9998;align-items:center;justify-content:center;flex-direction:column;">
        <div class="barcode-panel" style="background:var(--button,#333);color:var(--text-color,#fff);padding:16px;border-radius:8px;max-width:min(480px,95vw);width:100%;box-sizing:border-box;">
          <h3 style="margin:0 0 12px;">Scan barcode</h3>
          <div id="barcode-source-tabs" style="display:flex;gap:8px;margin-bottom:12px;"></div>
          <video id="barcode-video" playsinline muted style="width:100%;max-height:240px;background:#000;border-radius:6px;"></video>
          <canvas id="barcode-canvas" style="display:none;"></canvas>
          <p id="barcode-hint" style="margin:10px 0;font-size:0.9em;opacity:.85;">Point camera at barcode</p>
          <label for="barcode-manual" style="display:block;margin:12px 0 4px;font-size:0.9em;">Or type barcode</label>
          <div style="display:flex;gap:8px;align-items:stretch;">
            <input type="text" id="barcode-manual" class="btn" inputmode="numeric" autocomplete="off" placeholder="UPC / EAN" style="flex:1;min-width:0;box-sizing:border-box;padding:8px;">
            <button type="button" class="btn" id="barcode-manual-submit">Look up</button>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
            <button type="button" class="btn" id="barcode-cancel">Cancel</button>
          </div>
        </div>
      </div>
      <div id="barcode-confirm" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;">
        <div style="background:var(--button,#333);color:var(--text-color,#fff);padding:16px;border-radius:8px;max-width:420px;width:100%;">
          <h3 id="barcode-confirm-title" style="margin-top:0;">Add food?</h3>
          <p id="barcode-confirm-meta" style="font-size:0.9em;opacity:.9;"></p>
          <label style="display:block;margin:12px 0 4px;">Grams</label>
          <input type="number" id="barcode-confirm-grams" class="btn" inputmode="numeric" style="width:100%;box-sizing:border-box;padding:8px;">
          <label id="barcode-save-label" style="display:none;margin-top:12px;align-items:flex-start;gap:8px;cursor:pointer;font-size:0.9em;line-height:1.35;">
            <input type="checkbox" id="barcode-save-to-db" checked style="margin-top:3px;flex-shrink:0;">
            <span>Save item to local food database (enables name search and full nutrients)</span>
          </label>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button type="button" class="btn" id="barcode-confirm-back">Back</button>
            <button type="button" class="btn" id="barcode-confirm-add">Add</button>
          </div>
        </div>
      </div>
      <div id="food-search-panel" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;">
        <div style="background:var(--button,#333);color:var(--text-color,#fff);padding:16px;border-radius:8px;max-width:480px;width:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <h3 style="margin:0;font-size:1em;">Search results</h3>
            <button type="button" class="btn" id="food-search-close">Close</button>
          </div>
          <div id="food-search-tabs" style="display:flex;gap:8px;margin-bottom:8px;"></div>
          <p id="food-search-status" style="margin:0 0 8px;font-size:0.9em;opacity:.85;">Searching…</p>
          <div id="food-search-results" style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;"></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  let activeStream = null;
  let activeRafId = null;

  function stopActiveScannerStream() {
    if (activeRafId) {
      cancelAnimationFrame(activeRafId);
      activeRafId = null;
    }
    if (activeStream) {
      activeStream.getTracks().forEach(function (t) { t.stop(); });
      activeStream = null;
    }
  }

  function hideAllScannerPanels(root) {
    if (!root) return;
    const backdrop = root.querySelector('.barcode-backdrop');
    const searchPanel = root.querySelector('#food-search-panel');
    if (backdrop) backdrop.style.display = 'none';
    if (searchPanel) searchPanel.style.display = 'none';
  }

  function showConfirmDialog(root, onConfirm, payload, onBack) {
    hideAllScannerPanels(root);
    const confirmEl = root.querySelector('#barcode-confirm');
    const gramsInput = root.querySelector('#barcode-confirm-grams');
    const title = root.querySelector('#barcode-confirm-title');
    const meta = root.querySelector('#barcode-confirm-meta');
    const saveLabel = root.querySelector('#barcode-save-label');
    const saveCheckbox = root.querySelector('#barcode-save-to-db');
    title.textContent = payload.name;
    const srcLabel = payload.sourceLabel || (payload.fdc_id ? 'USDA FDC #' + payload.fdc_id : 'Online lookup');
    meta.textContent = srcLabel + ' · ' + payload.calories + ' kcal / ' + (gramsInput.value || payload.defaultGrams) + 'g';
    gramsInput.value = payload.defaultGrams || 100;

    // Show the save checkbox only for online-lookup items (local DB items are already stored)
    if (saveLabel) {
      saveLabel.style.display = payload.fdcRecord ? 'flex' : 'none';
      if (saveCheckbox) saveCheckbox.checked = true;
    }

    confirmEl.style.display = 'flex';

    const addBtn = root.querySelector('#barcode-confirm-add');
    const backBtn = root.querySelector('#barcode-confirm-back');

    function updateMeta() {
      const g = parseFloat(gramsInput.value) || 100;
      const sc = payload.rescale(g);
      const label = payload.sourceLabel || (payload.fdc_id ? 'USDA FDC #' + payload.fdc_id : 'Online lookup');
      meta.textContent = label + ' · ' + sc.calories + ' kcal, P ' + sc.protein + 'g, C ' + sc.carbs + 'g, F ' + sc.fat + 'g (' + g + 'g)';
    }
    gramsInput.oninput = updateMeta;
    updateMeta();

    const cleanup = () => {
      addBtn.onclick = null;
      backBtn.onclick = null;
      gramsInput.oninput = null;
      if (saveLabel) saveLabel.style.display = 'none';
      confirmEl.style.display = 'none';
    };

    backBtn.onclick = () => {
      cleanup();
      if (typeof onBack === 'function') onBack();
    };

    addBtn.onclick = () => {
      const g = parseFloat(gramsInput.value) || 100;
      const sc = payload.rescale(g);
      const shouldSave = saveCheckbox ? saveCheckbox.checked : false;
      if (shouldSave && payload.fdcRecord && typeof putFoodBatch === 'function') {
        putFoodBatch([payload.fdcRecord]).catch(() => {});
      }
      cleanup();
      onConfirm({
        name: payload.name,
        grams: g,
        fdc_id: shouldSave && payload.fdcRecord ? payload.fdc_id : null,
        calories: sc.calories,
        protein: sc.protein,
        carbs: sc.carbs,
        fat: sc.fat,
        nutrition_source:
          payload.nutrition_source ||
          (payload.fdcRecord && payload.fdcRecord.source) ||
          null,
        fromOnlineLookup: !payload.fdc_id,
      });
    };
  }

  async function decodeWithZXing(video) {
    const ZX = await loadZXing();
    const reader = new ZX.BrowserMultiFormatReader();
    try {
      const result = await reader.decodeFromVideoElement(video);
      return result.getText();
    } finally {
      reader.reset();
    }
  }

  /**
   * @param {(payload: { name: string, grams: number, fdc_id?: number|null, calories: number, protein: number, carbs: number, fat: number }) => void} onConfirm
   */
  window.openBarcodeScanner = function (onConfirm) {
    const root = ensureModal();
    const backdrop = root.querySelector('.barcode-backdrop');
    const confirmEl = root.querySelector('#barcode-confirm');
    const video = root.querySelector('#barcode-video');
    const hint = root.querySelector('#barcode-hint');
    const cancelBtn = root.querySelector('#barcode-cancel');

    let closed = false;

    function closeScan() {
      closed = true;
      stopActiveScannerStream();
      video.srcObject = null;
      backdrop.style.display = 'none';
    }

    function showConfirm(payload) {
      closeScan();
      showConfirmDialog(root, onConfirm, payload, function () {
        window.openBarcodeScanner(onConfirm);
      });
    }

    backdrop.style.display = 'flex';
    hint.textContent = 'Starting camera…';

    const tabsEl = root.querySelector('#barcode-source-tabs');
    function renderBarcodeTabs() {
      renderSourceTabs(tabsEl, activeSearchSource(), function (src) {
        if (_activeSearchSource === src) return;
        _activeSearchSource = src;
        renderBarcodeTabs();
        hint.textContent = src === 'off' ? 'Searching in Open Food Facts…' : 'Searching in USDA…';
      });
    }
    renderBarcodeTabs();

    cancelBtn.onclick = () => {
      closeScan();
    };

    const manualInput = root.querySelector('#barcode-manual');
    const manualSubmit = root.querySelector('#barcode-manual-submit');
    if (manualInput) manualInput.value = '';

    async function handleCode(raw) {
      if (closed) return;
      const code = normalizeUpc(raw);
      if (code.length < 8) {
        hint.textContent = 'Invalid code (need at least 8 digits)';
        return;
      }
      closeScan();

      let food = await lookupByBarcode(code);

      if (food) {
        const per100 = extractMacrosForScanner(food.nutrients);
        const defG = food.serving_weight > 0 ? food.serving_weight : 100;
        showConfirm({
          name: nameWithBrand(food.name, food.brand_owner),
          fdc_id: food.fdc_id,
          nutrition_source: food.source,
          defaultGrams: defG,
          rescale: (g) => scaleFromPer100(per100, g),
        });
        return;
      }

      // Online lookup — query only the active tab's source
      const src = activeSearchSource();
      const sourceLabel = src === 'off' ? 'Open Food Facts' : 'USDA';

      function confirmFromResult(result) {
        showConfirm({
          name: result.name,
          fdc_id: result.fdc_id,
          sourceLabel: result.sourceLabel,
          nutrition_source: result.source,
          defaultGrams: result.defaultGrams,
          fdcRecord: result.fdcRecord,
          rescale: (g) => scalePer100(result.per100, g),
        });
      }

      function notFound() {
        closed = false;
        backdrop.style.display = 'flex';
        hint.textContent = 'Not found in ' + sourceLabel + '. Switch the tab above and press Look up to retry.';
        if (manualInput) manualInput.value = code;
      }

      try {
        const result = src === 'off' ? await fetchOffByBarcode(code) : await fetchUsdaByBarcode(code);
        if (!result) { notFound(); return; }
        confirmFromResult(result);
      } catch (e) {
        alert('Online lookup failed: ' + (e && e.message));
      }
    }

    if (manualSubmit && manualInput) {
      manualSubmit.onclick = () => {
        handleCode(manualInput.value);
      };
      manualInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCode(manualInput.value);
        }
      };
    }

    (async () => {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        video.srcObject = activeStream;
        await video.play();
      } catch (e) {
        hint.textContent =
          'Camera unavailable: ' +
          (e && e.message) +
          '. You can type the barcode below.';
        return;
      }

      hint.textContent = 'Point camera at barcode';

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['upc_a', 'upc_e', 'ean_13', 'ean_8'] });
        const tick = async () => {
          if (closed) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length) {
              const raw = codes[0].rawValue;
              await handleCode(raw);
              return;
            }
          } catch (_) {}
          activeRafId = requestAnimationFrame(tick);
        };
        activeRafId = requestAnimationFrame(tick);
      } else {
        try {
          const raw = await decodeWithZXing(video);
          if (!closed) await handleCode(raw);
        } catch (e) {
          if (!closed) hint.textContent = 'Scan: ' + (e && e.message);
        }
      }
    })();
  };

  /**
   * Open the online name-search popup.
   * @param {string} query
   * @param {(payload: object) => void} onConfirm
   */
  window.openFoodNameSearch = function (query, onConfirm) {
    const root = ensureModal();
    const panel = root.querySelector('#food-search-panel');
    const resultsEl = root.querySelector('#food-search-results');
    const statusEl = root.querySelector('#food-search-status');
    const closeBtn = root.querySelector('#food-search-close');
    const tabsEl = root.querySelector('#food-search-tabs');

    // Hide scanner + confirm panels and stop any running camera
    const backdrop = root.querySelector('.barcode-backdrop');
    const confirmEl = root.querySelector('#barcode-confirm');
    stopActiveScannerStream();
    if (backdrop) backdrop.style.display = 'none';
    if (confirmEl) confirmEl.style.display = 'none';

    const trimmedQuery = String(query || '').trim();
    let searchId = 0;
    const resultsCache = {};

    function renderResults(results) {
      resultsEl.innerHTML = '';
      if (!results.length) {
        if (statusEl) statusEl.textContent = 'No results. Try a different search.';
        return;
      }
      if (statusEl) {
        statusEl.textContent = results.length + ' result' + (results.length === 1 ? '' : 's');
      }
      results.forEach(function (result) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'btn food-search-result';
        row.style.cssText =
          'text-align:left;justify-content:flex-start;padding:8px 10px;font-size:0.95em;' +
          'cursor:pointer;border:1px solid var(--border-color,#444);width:100%;box-sizing:border-box;';
        row.textContent = (result.sourceLabel || 'Online') + ' · ' + result.name;
        row.addEventListener('click', function () {
          showConfirmDialog(root, onConfirm, {
            name: result.name,
            fdc_id: result.fdc_id,
            sourceLabel: result.sourceLabel,
            nutrition_source: result.source,
            defaultGrams: result.defaultGrams,
            fdcRecord: result.fdcRecord,
            rescale: function (g) { return scalePer100(result.per100, g); },
          }, function () {
            window.openFoodNameSearch(trimmedQuery, onConfirm);
          });
        });
        resultsEl.appendChild(row);
      });
    }

    function renderTabs() {
      renderSourceTabs(tabsEl, activeSearchSource(), function (src) {
        if (_activeSearchSource === src) return;
        _activeSearchSource = src;
        renderTabs();
        if (!trimmedQuery) return;
        if (resultsCache[src]) {
          renderResults(resultsCache[src]);
        } else {
          runSearch();
        }
      });
    }
    renderTabs();

    function runSearch() {
      panel.style.display = 'flex';
      if (statusEl) statusEl.textContent = 'Searching…';
      resultsEl.innerHTML = '';

      const src = activeSearchSource();
      const myId = ++searchId;
      searchFoodsOnline(trimmedQuery, src)
        .then(function (results) {
          if (myId !== searchId) return;
          if (panel.style.display === 'none') return;
          console.info(
            '[barcode scanner] Search for "' + trimmedQuery + '" returned ' +
            (results ? results.length : 0) + ' result(s).'
          );
          var cached = results || [];
          resultsCache[src] = cached;
          renderResults(cached);
        })
        .catch(function (err) {
          if (myId !== searchId) return;
          if (panel.style.display === 'none') return;
          console.error('[barcode scanner] Search failed for "' + trimmedQuery + '":', err);
          if (statusEl) statusEl.textContent = 'Search failed: ' + (err && err.message);
          resultsEl.innerHTML = '';
        });
    }

    if (!trimmedQuery) {
      panel.style.display = 'flex';
      if (statusEl) statusEl.textContent = 'Type a food name to search.';
      return;
    }

    runSearch();

    closeBtn.onclick = function () {
      panel.style.display = 'none';
      searchId++;
    };
  };

  function extractMacrosForScanner(nutrients) {
    if (!nutrients) return { calories: 0, protein: 0, fat: 0, carbs: 0 };
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

  function scaleFromPer100(per100, grams) {
    const g = Number(grams) || 100;
    const f = g / 100;
    return {
      calories: Math.round(per100.calories * f * 10) / 10,
      protein: Math.round(per100.protein * f * 10) / 10,
      fat: Math.round(per100.fat * f * 10) / 10,
      carbs: Math.round(per100.carbs * f * 10) / 10,
    };
  }
})();
