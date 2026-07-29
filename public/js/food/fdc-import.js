/**
 * SR Legacy auto-import + Foundation supplement + optional branded chunk import.
 */
const CORE_FOOD_DATA_VERSION = 2;

function syncSrLegacyImportFlag() {
  if (typeof RadiantStorage !== 'undefined') {
    RadiantStorage.nutrition.markSrLegacyImported(null);
  }
}

async function importNdjsonFile(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Food data not found (' + url + ').');
  }
  const text = await res.text();
  const lines = text.split(/\n/).filter((l) => l.trim());
  const total = lines.length;
  let batch = [];
  let done = 0;

  for (let i = 0; i < lines.length; i++) {
    const row = JSON.parse(lines[i]);
    if (row.name_lc == null && row.name) {
      row.name_lc = String(row.name).toLowerCase();
    }
    batch.push(row);
    if (batch.length >= 500) {
      await putFoodBatch(batch);
      batch = [];
      done += 500;
      if (typeof onProgress === 'function') {
        onProgress(Math.min(done, total), total);
      }
    }
  }
  if (batch.length) {
    await putFoodBatch(batch);
  }
  if (typeof onProgress === 'function') {
    onProgress(total, total);
  }
  return total;
}

async function importSrLegacy(onProgress, opts) {
  const force = opts && opts.force;
  await getDB();
  await ensureNutrientDefsLoaded();

  if (!force) {
    const meta = await getFdcMeta();
    const n = await countStore('fdcStore');
    if (meta.importComplete && n > 500) {
      syncSrLegacyImportFlag();
      return;
    }
  } else {
    await deleteFoodsBySources(['sr_legacy']);
    nutritionCache.clear();
    await mergeFdcMeta({
      importComplete: false,
      srLegacyCount: 0,
    });
  }

  const total = await importNdjsonFile(
    'assets/processed/fdc_sr_legacy.ndjson',
    onProgress
  );

  await mergeFdcMeta({
    importComplete: true,
    srLegacyCount: total,
    timestamp: new Date().toISOString(),
  });
  if (typeof RadiantStorage !== 'undefined') {
    RadiantStorage.nutrition.markSrLegacyImported(RadiantStorage.SR_LEGACY_PORTION_VERSION);
  }
}

async function importFoundationSupplement(onProgress, opts) {
  const force = opts && opts.force;
  await getDB();
  await ensureNutrientDefsLoaded();

  const meta = await getFdcMeta();
  const coreVersion = meta.core_food_version || 0;
  if (!force && coreVersion >= CORE_FOOD_DATA_VERSION) {
    return;
  }

  const manRes = await fetch('assets/processed/fdc_core_manifest.json');
  if (!manRes.ok) {
    console.warn('Foundation supplement manifest not found — skipping');
    return;
  }
  const manifest = await manRes.json();

  await deleteFoodsBySources(['foundation']);

  const total = await importNdjsonFile(
    'assets/processed/fdc_foundation_supplement.ndjson',
    onProgress
  );

  await mergeFdcMeta({
    core_food_version: manifest.version || CORE_FOOD_DATA_VERSION,
    foundationSupplementCount: total,
    timestamp: new Date().toISOString(),
  });
  if (typeof RadiantStorage !== 'undefined' && total > 0) {
    RadiantStorage.setRaw(RadiantStorage.KEYS.FOUNDATION_SUPPLEMENT_READY, 'true');
  }
}

/**
 * @param {(done:number, total:number) => void} [onProgress]
 */
async function importBrandedFoods(onProgress) {
  const meta = await getFdcMeta();
  if (!meta.importComplete) {
    await importSrLegacy(null, {});
  }

  const lowMem = (navigator.deviceMemory || 4) <= 2;
  if (lowMem) {
    const est = await navigator.storage.estimate();
    const free = est.quota - est.usage;
    if (free < 200 * 1024 * 1024) {
      const ok = confirm(
        'This device has limited free storage. Branded import needs roughly 200MB. Continue anyway?'
      );
      if (!ok) return;
    }
  }

  const manRes = await fetch('assets/processed/fdc_branded_manifest.json');
  if (!manRes.ok) {
    throw new Error('Branded foods are not deployed (no fdc_branded_manifest.json).');
  }
  const manifest = await manRes.json();
  const chunks = manifest.chunks || [];
  const totalRows = manifest.totalRows || 0;
  let done = 0;

  for (let c = 0; c < chunks.length; c++) {
    const chunkUrl = 'assets/processed/' + chunks[c];
    const r = await fetch(chunkUrl);
    if (!r.ok) continue;

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let batch = [];

    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      if (streamDone) {
        buf += dec.decode();
        break;
      }
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const row = JSON.parse(line);
        if (row.name_lc == null && row.name) {
          row.name_lc = String(row.name).toLowerCase();
        }
        batch.push(row);
        if (batch.length >= 500) {
          await putFoodBatch(batch);
          batch = [];
          done += 500;
          if (typeof onProgress === 'function') onProgress(done, totalRows);
        }
      }
    }
    if (buf.trim()) {
      const row = JSON.parse(buf.trim());
      if (row.name_lc == null && row.name) {
        row.name_lc = String(row.name).toLowerCase();
      }
      batch.push(row);
    }
    if (batch.length) {
      await putFoodBatch(batch);
      done += batch.length;
      batch = [];
      if (typeof onProgress === 'function') onProgress(done, totalRows);
    }
  }

  await mergeFdcMeta({
    brandedImportComplete: true,
    brandedCount: totalRows,
    timestamp: new Date().toISOString(),
  });
  await loadFoodNamesAndCache();
}

async function runFdcBootstrap(opts) {
  try {
    await getDB();
    const force = !!(opts && opts.force);
    const meta = await getFdcMeta();
    const needsFoundation =
      (meta.core_food_version || 0) < CORE_FOOD_DATA_VERSION;

    if (meta.importComplete && !force && !needsFoundation) {
      syncSrLegacyImportFlag();
      return;
    }

    if (!meta.importComplete || force) {
      await importSrLegacy(null, { force });
    } else {
      syncSrLegacyImportFlag();
    }

    if (needsFoundation || force) {
      await importFoundationSupplement(null, { force: needsFoundation || force });
      if (typeof loadFoodNamesAndCache === 'function') {
        await loadFoodNamesAndCache();
      }
    }
  } catch (e) {
    console.warn('FDC bootstrap:', e);
  }
}
