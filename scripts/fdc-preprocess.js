#!/usr/bin/env node
/**
 * USDA FDC preprocessor — SR Legacy + optional Branded (UPC-only).
 * Default: fdc_nutrient_defs.json + fdc_sr_legacy.ndjson
 * With --branded: also fdc_branded_manifest.json + fdc_branded_chunk_NNN.ndjson
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const OUT = path.join(ASSETS, 'processed');
const SR_DIR = path.join(ASSETS, 'FoodData_Central_sr_legacy_food_csv_2018-04');
const BR_DIR = path.join(ASSETS, 'FoodData_Central_branded_food_csv_2025-12-18');
const USDA_ID_TO_KEY = require(path.join(ROOT, 'public', 'usda-id-to-key.js'));

const WANT_IDS = new Set(Object.keys(USDA_ID_TO_KEY));
const ID_TO_KEY = USDA_ID_TO_KEY;

const CHUNK_ROWS = 50000;
const NUTRIENT_DEFS_VERSION = 1;

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

/** Match `database-utils.js` — SR Legacy FDP parenthetical on some descriptions. */
const USDA_FDP_NAME_SUFFIX =
  /\s*\(includes foods for usda['\u2019]s food distribution program\)\s*$/i;

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
  const catPath = path.join(SR_DIR, 'food_category.csv');
  const foodPath = path.join(SR_DIR, 'food.csv');
  const portionPath = path.join(SR_DIR, 'food_portion.csv');
  const nutPath = path.join(SR_DIR, 'food_nutrient.csv');

  const categories = new Map();
  for await (const line of streamCsvLines(catPath)) {
    const c = parseCsvLine(line);
    if (c.length >= 3) categories.set(c[0], c[2]);
  }

  const foods = new Map();
  for await (const line of streamCsvLines(foodPath)) {
    const c = parseCsvLine(line);
    if (c.length < 5) continue;
    if (c[1] !== 'sr_legacy_food') continue;
    const fdcId = c[0];
    foods.set(fdcId, {
      fdc_id: parseInt(fdcId, 10),
      name: c[2],
      food_category_id: c[3],
    });
  }

  const portions = new Map();
  for await (const line of streamCsvLines(portionPath)) {
    const c = parseCsvLine(line);
    if (c.length < 9) continue;
    const fdcId = c[1];
    if (!foods.has(fdcId)) continue;
    const seq = parseInt(c[2] || '999999', 10) || 999999;
    const gw = parseFloat(c[7]);
    if (!gw || gw <= 0) continue;
    const desc = (c[5] || '').replace(/^"|"$/g, '') + ((c[6] && c[6] !== '""') ? ' ' + c[6].replace(/^"|"$/g, '') : '');
    const prev = portions.get(fdcId);
    if (!prev || seq < prev.seq) portions.set(fdcId, { seq, gram_weight: gw, portion_description: desc.trim() || 'serving' });
  }

  const nutrientByFdc = new Map();
  for (const id of foods.keys()) nutrientByFdc.set(id, {});

  let nutLines = 0;
  for await (const line of streamCsvLines(nutPath)) {
    nutLines++;
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
    const bag = nutrientByFdc.get(fdcId);
    bag[key] = amt;
  }

  ensureOutDir();
  const outPath = path.join(OUT, 'fdc_sr_legacy.ndjson');
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
      source: 'sr_legacy',
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
  console.log('Wrote', outPath, count, 'foods');
}

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
  await buildSrLegacy();

  if (withBranded) {
    if (!fs.existsSync(BR_DIR)) throw new Error('Branded folder missing: ' + BR_DIR);
    await buildBranded();
  }

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
