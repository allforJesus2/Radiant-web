/**
 * User recipe IndexedDB (recipeStore).
 */
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
function valueFromRecipeRow(recipeRow, headerKey) {
  if (!recipeRow) return headerKey === 'servingDescription1' ? '' : 0;
  if (headerKey === 'calories') return recipeRow.calories || 0;
  if (headerKey === 'fat') return recipeRow.fat || 0;
  if (headerKey === 'protein') return recipeRow.protein || 0;
  if (headerKey === 'carbohydrate') return recipeRow.carbohydrate || 0;
  if (headerKey === 'servingWeight1') return recipeRow.servingWeight1 || 0;
  if (headerKey === 'servingDescription1') return recipeRow.servingDescription1 || '';
  return 0;
}
/** @deprecated callback style; prefer async */
function fetchValueForKey(foodName, headerKey, callback, foodSource) {
  fetchValueForKeyAsync(foodName, headerKey, foodSource)
    .then((v) => callback(v))
    .catch(() => callback(0));
}

async function fetchValueForKeyAsync(foodName, headerKey, foodSource) {
  if (foodSource === 'recipe') {
    const csv = await getFoodFromRecipeStore(foodName);
    return valueFromRecipeRow(csv, headerKey);
  }
  const recipeRow = await getFoodFromRecipeStore(foodName);
  if (recipeRow) {
    return valueFromRecipeRow(recipeRow, headerKey);
  }
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
  return headerKey === 'servingDescription1' ? '' : 0;
}
