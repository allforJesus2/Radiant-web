#!/usr/bin/env node
/**
 * USDA FoodData Central (FDC) preprocessor — build-time only.
 *
 * Reads large USDA CSV dumps from fdc-source/ (gitignored; download from
 * https://fdc.nal.usda.gov/download-datasets/) and writes compact NDJSON/JSON
 * into public/assets/processed/ for the browser to import via fdc-import.js.
 *
 * Default outputs (npm run preprocess):
 *   fdc_nutrient_defs.json       — nutrient id → name/unit for detail UI
 *   fdc_sr_legacy.ndjson         — ~7.8k SR Legacy foods (source: sr_legacy)
 *   fdc_foundation_supplement.ndjson — Foundation foods not already in SR (NDB dedup)
 *   fdc_core_manifest.json       — row counts + core_food_version for import gating
 *
 * Optional branded build (npm run preprocess:branded — NOT part of npm run deploy):
 *   fdc_branded_manifest.json + fdc_branded_chunk_NNN.ndjson
 *
 * Branded is a separate, opt-in user import in Settings (fdc-import.js).
 * Normal deploy only ships core foods (~8k rows). Branded is millions of rows
 * (~hundreds of MB on disk); users download it only if they click
 * "Import branded / offline barcodes". It is stored in IndexedDB, not the
 * service worker cache (service-worker.js bypasses assets/processed/).
 *
 * Only run preprocess:branded if you intend to host the chunk files and want
 * the Settings import button to succeed in production.
 *
 * Nutrient keys and portion heuristics are shared with the app:
 *   public/js/food/usda-id-to-key.js, scripts/portion-select.js
 *
 * Acronyms (USDA):
 *   FDC — FoodData Central (USDA's unified food/nutrient database)
 *   NDB — Nutrient Database number; legacy 4–5 digit id from the old National
 *         Nutrient Database. Still present on SR Legacy and Foundation rows so
 *         the same staple (e.g. "apple, raw") can be matched across datasets.
 *   FDP — Food Distribution Program; USDA commodity foods sometimes append
 *         "(includes foods for USDA's food distribution program)" to the name.
 *         We strip that suffix for cleaner search/display (see stripFdcUsdaFdpSuffix).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const FDC_SOURCE = path.join(ROOT, 'fdc-source');
const OUT = path.join(ASSETS, 'processed');
const SR_DIR = path.join(FDC_SOURCE, 'FoodData_Central_sr_legacy_food_csv_2018-04');
const BR_DIR = path.join(FDC_SOURCE, 'FoodData_Central_branded_food_csv_2025-12-18');
// Preferred Foundation folder name; resolveFoundationDir() falls back to any
// FoodData_Central_foundation_food_csv_* under fdc-source/ (e.g. symlink).
const FOUNDATION_DIR = path.join(
  FDC_SOURCE,
  'FoodData_Central_foundation_food_csv_2025-12-18'
);
/** Must stay in sync with CORE_FOOD_DATA_VERSION in public/js/food/fdc-import.js */
const CORE_FOOD_DATA_VERSION = 2;
const USDA_ID_TO_KEY = require(path.join(ROOT, 'public', 'js', 'food', 'usda-id-to-key.js'));
const { pickBestPortion } = require('./portion-select');

const WANT_IDS = new Set(Object.keys(USDA_ID_TO_KEY));
const ID_TO_KEY = USDA_ID_TO_KEY;

/**
 * Branded output is split into multiple NDJSON files of this many foods each.
 * 50_000 keeps each chunk ~tens of MB so the browser can fetch/import one file
 * at a time without holding the full ~millions-row branded corpus in memory.
 */
const CHUNK_ROWS = 50000;
const NUTRIENT_DEFS_VERSION = 1;

/** Minimal RFC-style CSV parser (USDA files quote fields with embedded commas). */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function ensureOutDir() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
}

/** FDP (Food Distribution Program) boilerplate USDA adds to some commodity names. */
const USDA_FDP_NAME_SUFFIX =
  /\s*\(includes foods for usda['\u2019]s food distribution program\)\s*$/i;

/** Remove FDP parenthetical; mirrors database-utils.js for consistent display names. */
function stripFdcUsdaFdpSuffix(name) {
  if (name == null || name === '') return name;
  return String(name).replace(USDA_FDP_NAME_SUFFIX, '').trim();
}

function readNutrientCsvForDefs() {
  const pBr = path.join(BR_DIR, 'nutrient.csv');
  const pSr = path.join(SR_DIR, 'nutrient.csv');
  const p = fs.existsSync(pBr) ? pBr : pSr;
  if (!fs.existsSync(p)) throw new Error('nutrient.csv not found in branded or sr_legacy folder');
  const text = fs.readFileSync(p, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const definitions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 5) continue;
    definitions.push({
      nutrient_id: String(cols[0]).replace(/^"|"$/g, ''),
      name: cols[1],
      unit_name: cols[2],
      nutrient_nbr: cols[3],
      rank: cols[4],
    });
  }
  return { definitions, path: p };
}

function writeNutrientDefs() {
  const { definitions } = readNutrientCsvForDefs();
  ensureOutDir();
  const outPath = path.join(OUT, 'fdc_nutrient_defs.json');
  fs.writeFileSync(outPath, JSON.stringify({ definitions, version: NUTRIENT_DEFS_VERSION }), 'utf8');
  console.log('Wrote', outPath, definitions.length, 'nutrient definitions');
}

function resolveFoundationDir() {
  if (fs.existsSync(FOUNDATION_DIR)) return FOUNDATION_DIR;
  const entries = fs.existsSync(FDC_SOURCE)
    ? fs.readdirSync(FDC_SOURCE).filter((name) =>
        /^FoodData_Central_foundation_food_csv_/i.test(name)
      )
    : [];
  if (!entries.length) return null;
  entries.sort();
  return path.join(FDC_SOURCE, entries[entries.length - 1]);
}

/**
 * Load all NDB (Nutrient Database) numbers from SR Legacy.
 * NDB is the shared legacy key: if Foundation food X has the same NDB as an
 * SR Legacy row, they are the same staple — we skip X in the foundation supplement
 * so search does not list duplicates.
 */
async function loadSrLegacyNdbSet() {
  const ndbPath = path.join(SR_DIR, 'sr_legacy_food.csv');
  if (!fs.existsSync(ndbPath)) {
    throw new Error('sr_legacy_food.csv missing in SR Legacy folder');
  }
  const ndbs = new Set();
  for await (const line of streamCsvLines(ndbPath)) {
    const c = parseCsvLine(line);
    if (c.length < 2) continue;
    const ndb = String(c[1] || '').replace(/^"|"$/g, '').trim();
    if (ndb) ndbs.add(ndb);
  }
  return ndbs;
}

/**
 * Shared SR Legacy / Foundation pipeline: CSV tables → one NDJSON line per food.
 * Output shape matches fdcStore records (nutrients per 100g, serving_weight in grams).
 */
async function buildFoodNdjsonFromDir({
  dir,
  dataType,
  source,
  outPath,
  shouldIncludeFood,
}) {
  const catPath = path.join(dir, 'food_category.csv');
  const foodPath = path.join(dir, 'food.csv');
  const portionPath = path.join(dir, 'food_portion.csv');
  const nutPath = path.join(dir, 'food_nutrient.csv');

  const categories = new Map();
  for await (const line of streamCsvLines(catPath)) {
    const c = parseCsvLine(line);
    if (c.length >= 3) categories.set(c[0], c[2]);
  }

  const foods = new Map();
  for await (const line of streamCsvLines(foodPath)) {
    const c = parseCsvLine(line);
    if (c.length < 5) continue;
    if (c[1] !== dataType) continue;
    const fdcId = c[0];
    const meta = {
      fdc_id: parseInt(fdcId, 10),
      name: c[2],
      food_category_id: c[3],
    };
    if (shouldIncludeFood && !(await shouldIncludeFood(meta, fdcId))) continue;
    foods.set(fdcId, meta);
  }

  const portionCandidates = new Map();
  for await (const line of streamCsvLines(portionPath)) {
    const c = parseCsvLine(line);
    if (c.length < 9) continue;
    const fdcId = c[1];
    if (!foods.has(fdcId)) continue;
    const seq = parseInt(c[2] || '999999', 10) || 999999;
    const gw = parseFloat(c[7]);
    if (!gw || gw <= 0) continue;
    const desc =
      (c[5] || '').replace(/^"|"$/g, '') +
      (c[6] && c[6] !== '""' ? ' ' + c[6].replace(/^"|"$/g, '') : '');
    const row = {
      seq,
      gram_weight: gw,
      portion_description: desc.trim() || 'serving',
    };
    if (!portionCandidates.has(fdcId)) portionCandidates.set(fdcId, []);
    portionCandidates.get(fdcId).push(row);
  }

  const nutrientByFdc = new Map();
  for (const id of foods.keys()) nutrientByFdc.set(id, {});

  // food_nutrient.csv is the largest file — stream line-by-line, keep only WANT_IDS
  let nutLines = 0;
  for await (const line of streamCsvLines(nutPath)) {
    nutLines++;
    // Progress heartbeat only (SR Legacy file is smaller than branded's).
    if (nutLines % 200000 === 0) console.log('  food_nutrient…', nutLines);
    const c = parseCsvLine(line);
    if (c.length < 4) continue;
    const fdcId = c[1];
    const nid = c[2];
    if (!foods.has(fdcId) || !WANT_IDS.has(nid)) continue;
    const key = ID_TO_KEY[nid];
    if (!key) continue;
    const amt = parseFloat(c[3]);
    if (Number.isNaN(amt)) continue;
    nutrientByFdc.get(fdcId)[key] = amt;
  }

  const portions = new Map();
  for (const [fdcId, candidates] of portionCandidates) {
    const kcal = (nutrientByFdc.get(fdcId) || {}).calories || 0;
    portions.set(fdcId, pickBestPortion(candidates, { kcalPer100g: kcal }));
  }

  ensureOutDir();
  const ws = fs.createWriteStream(outPath, { encoding: 'utf8' });
  let count = 0;
  for (const [fdcIdStr, meta] of foods) {
    const nutrients = nutrientByFdc.get(fdcIdStr) || {};
    const grp = categories.get(meta.food_category_id) || '';
    const por = portions.get(fdcIdStr);
    const rawName = meta.name || '';
    const displayName = stripFdcUsdaFdpSuffix(rawName);
    const row = {
      fdc_id: meta.fdc_id,
      name: displayName,
      name_lc: String(displayName || '').toLowerCase(),
      food_group: grp,
      serving_weight: por ? por.gram_weight : 100,
      serving_description: por ? por.portion_description : '100 g',
      gtin_upc: '',
      source,
      nutrients,
    };
    ws.write(JSON.stringify(row) + '\n');
    count++;
  }
  ws.end();
  await new Promise((res, rej) => {
    ws.on('finish', res);
    ws.on('error', rej);
  });
  return count;
}

/** Stream CSV rows without loading whole files into memory (food_nutrient is GB-scale for branded). */
async function* streamCsvLines(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    if (!line.trim()) continue;
    yield line;
  }
}

async function buildSrLegacy() {
  const outPath = path.join(OUT, 'fdc_sr_legacy.ndjson');
  const count = await buildFoodNdjsonFromDir({
    dir: SR_DIR,
    dataType: 'sr_legacy_food',
    source: 'sr_legacy',
    outPath,
  });
  console.log('Wrote', outPath, count, 'foods');
  return count;
}

/**
 * Additive Foundation Foods only: skip any Foundation row whose NDB already
 * exists in SR Legacy so autocomplete does not show duplicate staples.
 */
async function buildFoundationSupplement(srNdbSet) {
  const foundationDir = resolveFoundationDir();
  if (!foundationDir) {
    console.log('Foundation folder missing — skipping supplement');
    return 0;
  }

  const ndbByFdc = new Map();
  const ffPath = path.join(foundationDir, 'foundation_food.csv');
  if (!fs.existsSync(ffPath)) {
    throw new Error('foundation_food.csv missing in ' + foundationDir);
  }
  for await (const line of streamCsvLines(ffPath)) {
    const c = parseCsvLine(line);
    if (c.length < 2) continue;
    const fdcId = c[0];
    const ndb = String(c[1] || '').replace(/^"|"$/g, '').trim();
    ndbByFdc.set(fdcId, ndb);
  }

  const outPath = path.join(OUT, 'fdc_foundation_supplement.ndjson');
  const count = await buildFoodNdjsonFromDir({
    dir: foundationDir,
    dataType: 'foundation_food',
    source: 'foundation',
    outPath,
    shouldIncludeFood: async (_meta, fdcId) => {
      const ndb = ndbByFdc.get(fdcId) || '';
      if (!ndb) return false;
      return !srNdbSet.has(ndb);
    },
  });
  console.log('Wrote', outPath, count, 'foods');
  return count;
}

/** Imported by fdc-import.js to decide when to run foundation supplement upgrade. */
function writeCoreManifest(srLegacyCount, foundationSupplementCount) {
  ensureOutDir();
  const manifest = {
    version: CORE_FOOD_DATA_VERSION,
    sr_legacy: srLegacyCount,
    foundation_supplement: foundationSupplementCount,
    generated: new Date().toISOString(),
  };
  const outPath = path.join(OUT, 'fdc_core_manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 0), 'utf8');
  console.log('Wrote', outPath);
}

/**
 * Optional offline barcode corpus (~millions of UPC rows).
 * Long-running: reads multi-GB branded CSVs from fdc-source/.
 * Output is chunked (CHUNK_ROWS) for browser streaming import.
 * Not included in default preprocess or deploy — users opt in via Settings.
 */
async function buildBranded() {
  const bfPath = path.join(BR_DIR, 'branded_food.csv');
  const foodPath = path.join(BR_DIR, 'food.csv');
  const nutPath = path.join(BR_DIR, 'food_nutrient.csv');

  console.log('Building branded UPC map…');
  const brandedMeta = new Map();
  for await (const line of streamCsvLines(bfPath)) {
    const c = parseCsvLine(line);
    if (c.length < 20) continue;
    const fdcId = c[0];
    const gtin = (c[4] || '').replace(/^"|"$/g, '').trim();
    if (!gtin) continue;
    brandedMeta.set(fdcId, {
      gtin_upc: gtin,
      brand_owner: (c[1] || '').replace(/^"|"$/g, '').trim(),
      serving_size: c[7],
      serving_size_unit: c[8],
      household_serving_fulltext: c[9],
      branded_food_category: c[10] || '',
    });
  }
  console.log('  UPC foods:', brandedMeta.size);

  console.log('Resolving food descriptions…');
  let foodLines = 0;
  for await (const line of streamCsvLines(foodPath)) {
    foodLines++;
    if (foodLines % 500000 === 0) console.log('  food.csv…', foodLines);
    const c = parseCsvLine(line);
    if (c.length < 4) continue;
    const fdcId = c[0];
    if (!brandedMeta.has(fdcId)) continue;
    brandedMeta.get(fdcId).description = c[2];
  }

  const nutrientByFdc = new Map();
  for (const id of brandedMeta.keys()) nutrientByFdc.set(id, {});

  console.log('Streaming food_nutrient.csv (large)…');
  let nutLines = 0;
  for await (const line of streamCsvLines(nutPath)) {
    nutLines++;
    // Branded food_nutrient.csv has tens of millions of rows — log every 3M lines
    // so a long preprocess run shows steady progress (not a silent hang).
    if (nutLines % 3000000 === 0) console.log('  food_nutrient…', nutLines);
    const c = parseCsvLine(line);
    if (c.length < 4) continue;
    const fdcId = c[1];
    const nid = c[2];
    if (!brandedMeta.has(fdcId) || !WANT_IDS.has(nid)) continue;
    const key = ID_TO_KEY[nid];
    const amt = parseFloat(c[3]);
    if (Number.isNaN(amt)) continue;
    nutrientByFdc.get(fdcId)[key] = amt;
  }

  ensureOutDir();
  const chunks = [];
  let chunkIdx = 0;
  let chunkRows = [];
  let totalRows = 0;

  function flushChunk() {
    if (!chunkRows.length) return;
    chunkIdx++;
    const name = `fdc_branded_chunk_${String(chunkIdx).padStart(3, '0')}.ndjson`;
    const p = path.join(OUT, name);
    fs.writeFileSync(p, chunkRows.join(''), 'utf8');
    chunks.push(name);
    console.log('  wrote', name, chunkRows.length);
    chunkRows = [];
  }

  for (const [fdcIdStr, meta] of brandedMeta) {
    const nutrients = nutrientByFdc.get(fdcIdStr) || {};
    const sw = parseFloat(meta.serving_size) || 100;
    const servingWeight = sw > 0 ? sw : 100;
    const desc = meta.household_serving_fulltext || `${meta.serving_size} ${meta.serving_size_unit}`.trim();
    const rawDesc = meta.description || 'Unknown';
    const displayName = stripFdcUsdaFdpSuffix(rawDesc);
    const row = {
      fdc_id: parseInt(fdcIdStr, 10),
      name: displayName,
      name_lc: String(displayName || '').toLowerCase(),
      brand_owner: meta.brand_owner || '',
      food_group: meta.branded_food_category || 'Branded',
      serving_weight: servingWeight > 0 ? servingWeight : 100,
      serving_description: desc || 'serving',
      gtin_upc: meta.gtin_upc,
      source: 'branded',
      nutrients,
    };
    chunkRows.push(JSON.stringify(row) + '\n');
    totalRows++;
    // When a chunk reaches CHUNK_ROWS (50_000), write fdc_branded_chunk_NNN.ndjson.
    if (chunkRows.length >= CHUNK_ROWS) flushChunk();
  }
  flushChunk();

  const manifest = {
    chunks,
    totalRows,
    generated: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'fdc_branded_manifest.json'), JSON.stringify(manifest, null, 0), 'utf8');
  console.log('Wrote manifest', manifest.chunks.length, 'chunks,', totalRows, 'rows');
}

async function main() {
  const withBranded = process.argv.includes('--branded');
  console.log('FDC preprocess — branded:', withBranded);
  if (!fs.existsSync(SR_DIR)) throw new Error('SR Legacy folder missing: ' + SR_DIR);

  writeNutrientDefs();
  const srLegacyCount = await buildSrLegacy();
  const srNdbSet = await loadSrLegacyNdbSet();
  const foundationSupplementCount = await buildFoundationSupplement(srNdbSet);
  writeCoreManifest(srLegacyCount, foundationSupplementCount);

  if (withBranded) {
    console.log(
      'NOTE: Branded output is optional. Users import it manually in Settings; ' +
        'it is large and slows food search after import. Not cached by the service worker.'
    );
    if (!fs.existsSync(BR_DIR)) throw new Error('Branded folder missing: ' + BR_DIR);
    await buildBranded();
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
