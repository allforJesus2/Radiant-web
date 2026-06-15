/**
 * Macro scaling and nutrient math (pure functions where possible).
 */
function extractMacrosPer100g(nutrients) {
  if (!nutrients) {
    return { calories: 0, protein: 0, fat: 0, carbs: 0 };
  }
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
