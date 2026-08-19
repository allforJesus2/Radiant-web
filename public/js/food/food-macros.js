/**
 * Macro scaling and nutrient math (pure functions where possible).
 */
function extractMacrosPer100g(nutrients) {
  if (!nutrients) {
    return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }
  // Coerce to a finite number and clamp negatives to 0. USDA data can carry
  // small negative artifacts (e.g. carbohydrate "by difference" = -0.17) and
  // some foods lack an explicit energy value entirely.
  const nn = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const protein = nn(nutrients.protein);
  const fat = nn(nutrients.fat);
  const carbs = nn(
    nutrients.carbohydrate != null ? nutrients.carbohydrate : nutrients.carbs
  );
  let calories = nn(nutrients.calories);
  if (calories === 0 && (protein > 0 || fat > 0 || carbs > 0)) {
    // Derive energy via Atwater general factors (4/4/9) when the source lacks
    // an explicit energy nutrient. Also corrects legacy records whose energy
    // nutrient ids (e.g. Atwater 2047/2048) were dropped during import.
    calories = Math.round((protein * 4 + carbs * 4 + fat * 9) * 10) / 10;
  }
  return { calories, protein, fat, carbs };
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
function nutritionFromFoodRecord(food, grams) {
  const per100 = extractMacrosPer100g(food.nutrients);
  return scaleMacrosFrom100g(per100, grams);
}
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
