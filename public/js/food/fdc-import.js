/**
 * SR Legacy auto-import + optional branded chunk import (Settings only).
 */
function syncSrLegacyImportFlag() {
  if (typeof RadiantStorage !== 'undefined') {
    RadiantStorage.nutrition.markSrLegacyImported(null);
  }
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
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['fdcStore'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('fdcStore').clear();
    });
    nutritionCache.clear();
    await mergeFdcMeta({
      importComplete: false,
      srLegacyCount: 0,
    });
  }

  const res = await fetch('assets/processed/fdc_sr_legacy.ndjson');
  if (!res.ok) {
    throw new Error('SR Legacy data not found (fdc_sr_legacy.ndjson).');
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

  await mergeFdcMeta({
    importComplete: true,
    srLegacyCount: total,
    timestamp: new Date().toISOString(),
  });
  if (typeof RadiantStorage !== 'undefined') {
    RadiantStorage.nutrition.markSrLegacyImported(RadiantStorage.SR_LEGACY_PORTION_VERSION);
  }
  // Autocomplete cache: nutrition/create-recipe call initializeFoodList;
  // settings SR re-import calls loadFoodNamesAndCache explicitly after import.
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

    // Fast path for normal page loads: if SR legacy is already imported,
    // skip the expensive import checks/cache warmup and return immediately.
    if (meta.importComplete && !force) {
      syncSrLegacyImportFlag();
      return;
    }

    await importSrLegacy(null, { force });
  } catch (e) {
    console.warn('FDC bootstrap:', e);
  }
}
