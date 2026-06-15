/**
 * Food log schema migration.
 */
const FOOD_LOG_MIGRATION_VERSION = 1;

async function migrateFoodLogIfNeeded(foodLog) {
  const storedVer = RadiantStorage.nutrition.getFoodLogMigrationVersion();
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
    RadiantStorage.nutrition.saveFoodLog(out);
  }
  RadiantStorage.nutrition.setFoodLogMigrationVersion(FOOD_LOG_MIGRATION_VERSION);
  return { log: out, changed };
}
