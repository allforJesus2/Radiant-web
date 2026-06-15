        const ingredients = [];
        let totalWeight = 0;
        let recipeTotals = {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0
        };
        

        
        let foodList = [];

        function foodSourceFromInput(el) {
            return el && el.dataset.foodSource === 'recipe' ? 'recipe' : undefined;
        }

        function nutrientsPer100gFromFood(food) {
            if (!food) return {};
            if (food.nutrients && typeof food.nutrients === 'object') {
                return Object.assign({}, food.nutrients);
            }
            const out = {
                calories: food.calories || 0,
                protein: food.protein || 0,
                fat: food.fat || 0,
                carbohydrate:
                    food.carbohydrate != null ? food.carbohydrate : food.carbs || 0,
            };
            if (food.sugars != null) out.sugars = food.sugars;
            if (food.fiber != null) out.fiber = food.fiber;
            return out;
        }

        async function fetchFoodRecordForIngredient(name, fdcId, foodSource) {
            if (fdcId != null) return getFoodById(fdcId);
            if (foodSource === 'recipe') return getFoodFromRecipeStore(name);
            const fdc = await getFoodByName(name);
            if (fdc) return fdc;
            return getFoodFromRecipeStore(name);
        }

        function scaleNutrientsByGrams(nutrientsPer100g, grams) {
            const factor = grams / 100;
            const scaled = {};
            Object.keys(nutrientsPer100g || {}).forEach((key) => {
                const v = nutrientsPer100g[key];
                if (v == null || Number.isNaN(Number(v))) return;
                scaled[key] = v * factor;
            });
            return scaled;
        }

        function sumNutrientMaps(a, b) {
            const out = Object.assign({}, a);
            Object.keys(b || {}).forEach((key) => {
                out[key] = (out[key] || 0) + b[key];
            });
            return out;
        }

        function aggregateRecipeNutrientsPer100g() {
            if (!totalWeight) return {};
            let total = {};
            ingredients.forEach((ing) => {
                if (ing.nutrientsPer100g) {
                    total = sumNutrientMaps(
                        total,
                        scaleNutrientsByGrams(ing.nutrientsPer100g, ing.grams)
                    );
                }
            });
            const per100 = {};
            const factor = 100 / totalWeight;
            Object.keys(total).forEach((key) => {
                per100[key] = Math.round(total[key] * factor * 1000) / 1000;
            });
            return per100;
        }

        function buildRecipeData(recipeId, recipeName, servingGrams, servingDescription) {
            const per100gMacros = {
                calories: parseFloat(
                    ((recipeTotals.calories / totalWeight) * 100).toFixed(1)
                ),
                protein: parseFloat(
                    ((recipeTotals.protein / totalWeight) * 100).toFixed(1)
                ),
                carbs: parseFloat(
                    ((recipeTotals.carbs / totalWeight) * 100).toFixed(1)
                ),
                fat: parseFloat(((recipeTotals.fat / totalWeight) * 100).toFixed(1)),
            };
            const per100gNutrients = aggregateRecipeNutrientsPer100g();
            const fiber =
                per100gNutrients.fiber != null ? per100gNutrients.fiber : 0;
            const sugars =
                per100gNutrients.sugars != null ? per100gNutrients.sugars : 0;
            const carbVal =
                per100gNutrients.carbohydrate != null
                    ? per100gNutrients.carbohydrate
                    : per100gMacros.carbs;
            const netCarbs = Math.max(0, carbVal - fiber);
            return {
                id: recipeId,
                name: recipeName,
                foodGroup: 'Custom Recipe',
                calories: per100gMacros.calories,
                fat: per100gMacros.fat,
                protein: per100gMacros.protein,
                carbohydrate: per100gMacros.carbs,
                sugars: Math.round(sugars * 10) / 10,
                fiber: Math.round(fiber * 10) / 10,
                netCarbs: Math.round(netCarbs * 10) / 10,
                nutrients: per100gNutrients,
                servingWeight1: parseFloat(servingGrams),
                servingDescription1: servingDescription,
            };
        }

        document.getElementById('addIngredient').addEventListener('click', addIngredient);
        
        // Add event listener for the Enter key on the grams input
        document.querySelector('.grams').addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                addIngredient();
            }
        });

        async function addIngredient() {
            const foodInputEl = document.querySelector('.food');
            const foodName = foodInputEl.value.trim();
            const grams = parseFloat(document.querySelector('.grams').value);
            const rawFdc = foodInputEl.dataset.fdcId;
            const fdcId =
                rawFdc !== undefined && rawFdc !== '' && !Number.isNaN(Number(rawFdc))
                    ? Number(rawFdc)
                    : null;
            const foodSource = foodSourceFromInput(foodInputEl);

            if (!foodName || !grams) {
                alert('Please enter both ingredient name and grams');
                return;
            }

            try {
                const [nutrition, food] = await Promise.all([
                    getNutritionalInfo(
                        foodName,
                        grams,
                        fdcId != null ? fdcId : undefined,
                        foodSource
                    ),
                    fetchFoodRecordForIngredient(foodName, fdcId, foodSource),
                ]);
                const ing = {
                    name: foodName,
                    grams: grams,
                    calories: nutrition.calories,
                    protein: nutrition.protein,
                    carbs: nutrition.carbs,
                    fat: nutrition.fat,
                    nutrientsPer100g: nutrientsPer100gFromFood(food),
                };
                if (fdcId != null) ing.fdc_id = fdcId;
                ingredients.push(ing);

                updateIngredientsList();
                calculateAndDisplayTotals();
                clearInputs();
            } catch {
                alert('Food not found in database.');
            }
        }

        function updateIngredientsList() {
            const list = document.getElementById('ingredientsList');
            list.innerHTML = ingredients.map((ingredient, index) => `
                <div class="ingredient-item">
                    <div class="ingredient-content" onclick="editIngredientAmount(${index})">
                        ${ingredient.name} (${ingredient.grams}g)
                        <span class="small-text">
                            Cals: ${ingredient.calories.toFixed(1)}, 
                            P: ${ingredient.protein.toFixed(1)}g, 
                            C: ${ingredient.carbs.toFixed(1)}g, 
                            F: ${ingredient.fat.toFixed(1)}g
                        </span>
                    </div>
                    <button class="delete-btn" onclick="removeIngredient(${index})">❌</button>
                </div>
            `).join('');
        }

        function removeIngredient(index) {
            ingredients.splice(index, 1);
            updateIngredientsList();
            calculateAndDisplayTotals();
        }

        async function editIngredientAmount(index) {
            const ingredient = ingredients[index];
            const newAmount = prompt(`Edit amount for ${ingredient.name} (current: ${ingredient.grams}g):`, ingredient.grams);

            if (newAmount !== null && !isNaN(newAmount) && parseFloat(newAmount) > 0) {
                const newGrams = parseFloat(newAmount);
                try {
                    const [nutrition, food] = await Promise.all([
                        getNutritionalInfo(
                            ingredient.name,
                            newGrams,
                            ingredient.fdc_id != null ? ingredient.fdc_id : undefined
                        ),
                        fetchFoodRecordForIngredient(
                            ingredient.name,
                            ingredient.fdc_id,
                            undefined
                        ),
                    ]);
                    ingredients[index] = {
                        name: ingredient.name,
                        grams: newGrams,
                        calories: nutrition.calories,
                        protein: nutrition.protein,
                        carbs: nutrition.carbs,
                        fat: nutrition.fat,
                        fdc_id: ingredient.fdc_id,
                        nutrientsPer100g:
                            nutrientsPer100gFromFood(food) || ingredient.nutrientsPer100g,
                    };

                    updateIngredientsList();
                    calculateAndDisplayTotals();
                } catch (error) {
                    console.error('Error updating ingredient:', error);
                    alert('Error updating ingredient. Please try again.');
                }
            }
        }

        function calculateAndDisplayTotals() {
            if (ingredients.length === 0) {
                document.getElementById('recipeResults').innerHTML = '';
                return;
            }

            recipeTotals = ingredients.reduce((totals, ingredient) => ({
                calories: totals.calories + ingredient.calories,
                protein: totals.protein + ingredient.protein,
                carbs: totals.carbs + ingredient.carbs,
                fat: totals.fat + ingredient.fat
            }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

            totalWeight = ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0);

            displayRecipeResults();
        }

        function displayRecipeResults() {
            const per100g = {
                calories: (recipeTotals.calories / totalWeight * 100).toFixed(1),
                protein: (recipeTotals.protein / totalWeight * 100).toFixed(1),
                carbs: (recipeTotals.carbs / totalWeight * 100).toFixed(1),
                fat: (recipeTotals.fat / totalWeight * 100).toFixed(1)
            };

            const resultsDiv = document.getElementById('recipeResults');
            resultsDiv.innerHTML = `
                <div class="recipe-totals">
                    <h3>Recipe Totals (${totalWeight}g) | Per 100g:</h3>
                    <div class="nutrition-grid">
                        <div class="nutrition-item">
                            <span class="nutrition-label">Calories:</span>
                            <span class="nutrition-values">${recipeTotals.calories.toFixed(1)} | ${per100g.calories}</span>
                        </div>
                        <div class="nutrition-item">
                            <span class="nutrition-label">Protein:</span>
                            <span class="nutrition-values">${recipeTotals.protein.toFixed(1)}g | ${per100g.protein}g</span>
                        </div>
                        <div class="nutrition-item">
                            <span class="nutrition-label">Carbs:</span>
                            <span class="nutrition-values">${recipeTotals.carbs.toFixed(1)}g | ${per100g.carbs}g</span>
                        </div>
                        <div class="nutrition-item">
                            <span class="nutrition-label">Fat:</span>
                            <span class="nutrition-values">${recipeTotals.fat.toFixed(1)}g | ${per100g.fat}g</span>
                        </div>
                    </div>
                </div>
            `;
        }

        function getLocalRecipes() {
            return RadiantStorage.recipes.getBackup();
        }

        function saveLocalRecipes(recipes) {
            RadiantStorage.recipes.saveBackup(recipes);
        }

        function upsertLocalRecipe(recipeData, ingredientsList) {
            const recipes = getLocalRecipes();
            const idx = recipes.findIndex(r => r.id === recipeData.id);
            const entry = { ...recipeData, _ingredients: ingredientsList };
            if (idx >= 0) {
                recipes[idx] = entry;
            } else {
                recipes.push(entry);
            }
            saveLocalRecipes(recipes);
        }

        function removeLocalRecipe(recipeId) {
            const recipes = getLocalRecipes().filter(r => r.id !== recipeId);
            saveLocalRecipes(recipes);
        }
        // ─────────────────────────────────────────────────────────────────────

        async function saveRecipe() {
            const recipeNameInput = document.getElementById('recipeName');
            const recipeName = recipeNameInput.value.trim();

            if (!recipeName) {
                recipeNameInput.focus();
                alert('Please enter a recipe name.');
                return;
            }

            if (
                window.currentEditingRecipeId !== null &&
                window.currentEditingRecipeId !== undefined
            ) {
                updateRecipe(window.currentEditingRecipeId);
                return;
            }

            if (ingredients.length === 0) {
                alert('Please add at least one ingredient.');
                return;
            }

            const servingGrams = prompt('Enter default serving size in grams:', '100');
            if (servingGrams === null) return;

            const servingDescription = prompt(
                'Enter serving description (e.g., "1 slice", "1 cup", "100g"):',
                '100g'
            );
            if (servingDescription === null) return;

            if (!servingGrams || isNaN(servingGrams) || parseFloat(servingGrams) <= 0) {
                alert('Please enter a valid serving size in grams.');
                return;
            }

            try {
                const db = await getDB();
                const storeName = 'recipeStore';
                const ingredientsStoreName = 'recipeIngredients';

                if (!db.objectStoreNames.contains(ingredientsStoreName)) {
                    alert(
                        'Ingredients store not found. Please refresh the page and try again.'
                    );
                    return;
                }

                const tx = db.transaction(
                    [storeName, ingredientsStoreName],
                    'readwrite'
                );
                const store = tx.objectStore(storeName);
                const ingredientsStore = tx.objectStore(ingredientsStoreName);
                const existingRecipe = await idbRequest(
                    store.index('nameIndex').get(recipeName)
                );

                const recipeId = existingRecipe ? existingRecipe.id : Date.now();
                const isOverwrite = !!existingRecipe;
                const recipeData = buildRecipeData(
                    recipeId,
                    recipeName,
                    servingGrams,
                    servingDescription
                );
                const recipeIngredients = {
                    recipeId: recipeId,
                    ingredients: ingredients.map((ing) => ({
                        name: ing.name,
                        grams: ing.grams,
                        fdc_id: ing.fdc_id != null ? ing.fdc_id : undefined,
                    })),
                };

                await idbRequest(store.put(recipeData));
                await idbRequest(ingredientsStore.put(recipeIngredients));

                if (!foodList.includes(recipeName)) {
                    foodList.push(recipeName);
                }
                upsertLocalRecipe(recipeData, recipeIngredients.ingredients);

                const message = isOverwrite
                    ? `Recipe "${recipeName}" updated successfully!`
                    : `Recipe "${recipeName}" saved to database!`;
                alert(message);
                clearRecipeForm();
                loadSavedRecipes();
            } catch (e) {
                console.error('Error saving recipe:', e);
                alert('Error saving recipe. Please try again.');
            }
        }

        async function saveAsNew() {
            const recipeNameInput = document.getElementById('recipeName');
            const recipeName = recipeNameInput.value.trim();

            if (!recipeName) {
                recipeNameInput.focus();
                alert('Please enter a recipe name.');
                return;
            }

            if (ingredients.length === 0) {
                alert('Please add at least one ingredient.');
                return;
            }

            const servingGrams = prompt('Enter default serving size in grams:', '100');
            if (servingGrams === null) return;

            const servingDescription = prompt(
                'Enter serving description (e.g., "1 slice", "1 cup", "100g"):',
                '100g'
            );
            if (servingDescription === null) return;

            if (!servingGrams || isNaN(servingGrams) || parseFloat(servingGrams) <= 0) {
                alert('Please enter a valid serving size in grams.');
                return;
            }

            try {
                const db = await getDB();
                const storeName = 'recipeStore';
                const ingredientsStoreName = 'recipeIngredients';

                if (!db.objectStoreNames.contains(ingredientsStoreName)) {
                    alert(
                        'Ingredients store not found. Please refresh the page and try again.'
                    );
                    return;
                }

                const tx = db.transaction(
                    [storeName, ingredientsStoreName],
                    'readwrite'
                );
                const store = tx.objectStore(storeName);
                const ingredientsStore = tx.objectStore(ingredientsStoreName);
                const existing = await idbRequest(
                    store.index('nameIndex').get(recipeName)
                );

                if (existing) {
                    alert(
                        `A recipe named "${recipeName}" already exists. Please choose a different name to save as new.`
                    );
                    recipeNameInput.focus();
                    recipeNameInput.select();
                    return;
                }

                const recipeId = Date.now();
                const recipeData = buildRecipeData(
                    recipeId,
                    recipeName,
                    servingGrams,
                    servingDescription
                );
                const recipeIngredients = {
                    recipeId: recipeId,
                    ingredients: ingredients.map((ing) => ({
                        name: ing.name,
                        grams: ing.grams,
                        fdc_id: ing.fdc_id != null ? ing.fdc_id : undefined,
                    })),
                };

                await idbRequest(store.put(recipeData));
                await idbRequest(ingredientsStore.put(recipeIngredients));

                if (!foodList.includes(recipeName)) {
                    foodList.push(recipeName);
                }
                upsertLocalRecipe(recipeData, recipeIngredients.ingredients);
                alert(`Recipe "${recipeName}" saved as new!`);
                clearRecipeForm();
                loadSavedRecipes();
            } catch (e) {
                console.error('Error saving recipe:', e);
                alert('Error saving recipe. Please try again.');
            }
        }

        async function updateRecipe(recipeId) {
            const recipeNameInput = document.getElementById('recipeName');
            const recipeName = recipeNameInput.value.trim();

            if (!recipeName) {
                recipeNameInput.focus();
                alert('Please enter a recipe name.');
                return;
            }

            if (ingredients.length === 0) {
                alert('Please add at least one ingredient.');
                return;
            }

            const servingGrams = prompt('Enter default serving size in grams:', '100');
            if (servingGrams === null) return;

            const servingDescription = prompt(
                'Enter serving description (e.g., "1 slice", "1 cup", "100g"):',
                '100g'
            );
            if (servingDescription === null) return;

            if (!servingGrams || isNaN(servingGrams) || parseFloat(servingGrams) <= 0) {
                alert('Please enter a valid serving size in grams.');
                return;
            }

            recipeTotals = ingredients.reduce(
                (totals, ingredient) => ({
                    calories: totals.calories + ingredient.calories,
                    protein: totals.protein + ingredient.protein,
                    carbs: totals.carbs + ingredient.carbs,
                    fat: totals.fat + ingredient.fat,
                }),
                { calories: 0, protein: 0, carbs: 0, fat: 0 }
            );

            totalWeight = ingredients.reduce(
                (sum, ingredient) => sum + ingredient.grams,
                0
            );

            try {
                const db = await getDB();
                const storeName = 'recipeStore';
                const ingredientsStoreName = 'recipeIngredients';

                if (!db.objectStoreNames.contains(ingredientsStoreName)) {
                    alert(
                        'Ingredients store not found. Please refresh the page and try again.'
                    );
                    return;
                }

                const tx = db.transaction(
                    [storeName, ingredientsStoreName],
                    'readwrite'
                );
                const store = tx.objectStore(storeName);
                const ingredientsStore = tx.objectStore(ingredientsStoreName);
                const recipe = await idbRequest(store.get(recipeId));

                if (!recipe) {
                    alert('Recipe not found.');
                    return;
                }

                const recipeData = buildRecipeData(
                    recipeId,
                    recipeName,
                    servingGrams,
                    servingDescription
                );
                const recipeIngredients = {
                    recipeId: recipeId,
                    ingredients: ingredients.map((ing) => ({
                        name: ing.name,
                        grams: ing.grams,
                        fdc_id: ing.fdc_id != null ? ing.fdc_id : undefined,
                    })),
                };

                await idbRequest(store.put(recipeData));
                await idbRequest(ingredientsStore.put(recipeIngredients));

                upsertLocalRecipe(recipeData, recipeIngredients.ingredients);
                alert('Recipe updated successfully!');
                clearRecipeForm();
                loadSavedRecipes();
            } catch (e) {
                console.error('Error updating recipe:', e);
                alert('Error updating recipe. Please try again.');
            }
        }

        function clearInputs() {
            var fi = document.querySelector('.food');
            fi.value = '';
            delete fi.dataset.fdcId;
            delete fi.dataset.foodSource;
            document.querySelector('.grams').value = '';
            fi.focus();
        }

        function clearRecipeForm() {
            document.getElementById('recipeName').value = '';
            ingredients.length = 0;
            updateIngredientsList();
            document.getElementById('recipeResults').innerHTML = '';
            clearInputs();

            // Clear editing state
            window.currentEditingRecipeId = null;

            // Hide edit-mode buttons
            document.getElementById('saveRecipeBtn').style.display = 'none';
            document.getElementById('cancelEditBtn').style.display = 'none';

            // Reset totals
            recipeTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
            totalWeight = 0;
        }

        

        
        async function initializeFoodList() {
            try {
                if (typeof runFdcBootstrap === 'function') await runFdcBootstrap();
                await initFoodAutocomplete(
                    document.querySelector('.food'),
                    document.querySelector('.grams'),
                    document.getElementById('autocompleteList')
                );
            } catch (e) {
                console.error(e);
                setupAutocomplete([], document.querySelector('.food'), document.querySelector('.grams'), document.getElementById('autocompleteList'));
            }
        }
        

        

        
        async function loadSavedRecipes() {
            try {
                const db = await getDB();
                const storeName = 'recipeStore';
                const savedRecipes = [];

                await new Promise((resolve, reject) => {
                    const tx = db.transaction([storeName], 'readonly');
                    const req = tx.objectStore(storeName).openCursor();
                    req.onerror = () => reject(req.error);
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (cursor) {
                            const foodGroup = cursor.value.foodGroup || '';
                            if (foodGroup === 'Custom Recipe') {
                                savedRecipes.push({
                                    id: cursor.value.id,
                                    name: cursor.value.name || 'Unknown',
                                    calories: cursor.value.calories || 0,
                                    protein: cursor.value.protein || 0,
                                    carbs: cursor.value.carbohydrate || 0,
                                    fat: cursor.value.fat || 0,
                                });
                            }
                            cursor.continue();
                        } else {
                            resolve();
                        }
                    };
                });

                displaySavedRecipes(savedRecipes);
            } catch (e) {
                console.error('Error loading saved recipes:', e);
            }
        }
        
        // Function to display saved recipes
        function displaySavedRecipes(recipes) {
            const recipesList = document.getElementById('savedRecipesList');
            
            if (recipes.length === 0) {
                recipesList.innerHTML = '<p>No saved recipes yet. Create your first recipe!</p>';
                return;
            }
            
            recipesList.innerHTML = '';
            
            recipes.forEach(recipe => {
                const recipeItem = document.createElement('div');
                recipeItem.className = 'recipe-item';
                
                recipeItem.innerHTML = `
                    <div class="recipe-info">
                        <span class="recipe-name">${recipe.name}</span>
                        <span class="recipe-macros">
                            Cal: ${recipe.calories} | P: ${recipe.protein}g | C: ${recipe.carbs}g | F: ${recipe.fat}g
                        </span>
                    </div>
                    <div class="recipe-actions">
                        <button class="edit-recipe-btn" data-recipe-id="${recipe.id}">✏️ Edit</button>
                        <button class="delete-recipe-btn" data-recipe-id="${recipe.id}">❌ Delete</button>
                    </div>
                `;
                
                recipesList.appendChild(recipeItem);
            });
            
            // Add event listeners to "Edit Recipe" buttons
            document.querySelectorAll('.edit-recipe-btn').forEach(button => {
                button.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const recipeId = Number(this.getAttribute('data-recipe-id'));
                    editRecipe(recipeId);
                });
            });
            
            // Add event listeners to "Delete Recipe" buttons
            document.querySelectorAll('.delete-recipe-btn').forEach(button => {
                button.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const recipeId = Number(this.getAttribute('data-recipe-id'));
                    deleteRecipe(recipeId);
                });
            });
            
            // Add click event to recipe items to view recipe details
            document.querySelectorAll('.recipe-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    if (!e.target.classList.contains('delete-recipe-btn') && !e.target.classList.contains('edit-recipe-btn')) {
                        const recipeId = Number(
                            this.querySelector('.delete-recipe-btn').getAttribute('data-recipe-id')
                        );
                        viewRecipeDetails(recipeId);
                    }
                });
            });
        }
        
        async function useRecipe(recipeId) {
            try {
                const db = await getDB();
                const recipe = await idbRequest(
                    db.transaction(['recipeStore'], 'readonly').objectStore('recipeStore').get(recipeId)
                );
                if (recipe) {
                    const foodInput = document.querySelector('.food');
                    foodInput.value = recipe.name;
                    foodInput.dataset.foodSource = 'recipe';
                    delete foodInput.dataset.fdcId;
                    document.querySelector('.grams').value = recipe.servingWeight1 || 100;
                    document.querySelector('.grams').focus();
                    document.querySelector('.grams').select();
                }
            } catch (e) {
                console.error('Error loading recipe:', e);
            }
        }

        async function deleteRecipe(recipeId) {
            const confirmDelete = confirm('Are you sure you want to delete this recipe?');
            if (!confirmDelete) return;

            try {
                const db = await getDB();
                const storeName = 'recipeStore';
                const ingredientsStoreName = 'recipeIngredients';
                const storeNames = db.objectStoreNames.contains(ingredientsStoreName)
                    ? [storeName, ingredientsStoreName]
                    : [storeName];
                const tx = db.transaction(storeNames, 'readwrite');
                const store = tx.objectStore(storeName);
                const recipe = await idbRequest(store.get(recipeId));

                if (!recipe) return;

                const recipeName = recipe.name;
                await idbRequest(store.delete(recipeId));
                if (db.objectStoreNames.contains(ingredientsStoreName)) {
                    await idbRequest(
                        tx.objectStore(ingredientsStoreName).delete(recipeId)
                    );
                }

                const index = foodList.indexOf(recipeName);
                if (index > -1) foodList.splice(index, 1);
                removeLocalRecipe(recipeId);
                alert(`Recipe "${recipeName}" has been deleted.`);
                loadSavedRecipes();
            } catch (e) {
                console.error('Error deleting recipe:', e);
                alert('Error deleting recipe. Please try again.');
            }
        }

        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(function (tab) {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab-btn').forEach(function (btn) {
                btn.classList.remove('active');
            });
            document.getElementById(tabName + 'Tab').classList.add('active');
            var targetButton = document.querySelector("button[onclick=\"switchTab('" + tabName + "')\"]");
            if (targetButton) {
                targetButton.classList.add('active');
            }
        }

        async function editRecipe(recipeId) {
            try {
                const db = await getDB();
                const storeName = 'recipeStore';
                const ingredientsStoreName = 'recipeIngredients';

                if (!db.objectStoreNames.contains(ingredientsStoreName)) {
                    alert('Ingredients store not found. Please try again.');
                    return;
                }

                const tx = db.transaction(
                    [storeName, ingredientsStoreName],
                    'readonly'
                );
                const store = tx.objectStore(storeName);
                const ingredientsStore = tx.objectStore(ingredientsStoreName);
                const recipe = await idbRequest(store.get(recipeId));
                const recipeIngredients = await idbRequest(
                    ingredientsStore.get(recipeId)
                );

                if (!recipe) return;

                ingredients.length = 0;

                if (recipeIngredients && recipeIngredients.ingredients) {
                    const loaded = await Promise.all(
                        recipeIngredients.ingredients.map(async (ingredient) => {
                            const fdcId =
                                ingredient.fdc_id != null &&
                                ingredient.fdc_id !== '' &&
                                !Number.isNaN(Number(ingredient.fdc_id))
                                    ? Number(ingredient.fdc_id)
                                    : undefined;
                            try {
                                const [nutrition, food] = await Promise.all([
                                    getNutritionalInfo(
                                        ingredient.name,
                                        ingredient.grams,
                                        fdcId
                                    ),
                                    fetchFoodRecordForIngredient(
                                        ingredient.name,
                                        fdcId,
                                        undefined
                                    ),
                                ]);
                                return {
                                    name: ingredient.name,
                                    grams: ingredient.grams,
                                    calories: nutrition.calories,
                                    protein: nutrition.protein,
                                    carbs: nutrition.carbs,
                                    fat: nutrition.fat,
                                    fdc_id: fdcId,
                                    nutrientsPer100g: nutrientsPer100gFromFood(food),
                                };
                            } catch (error) {
                                console.error(
                                    'Error loading ingredient:',
                                    ingredient.name,
                                    error
                                );
                                return {
                                    name: ingredient.name,
                                    grams: ingredient.grams,
                                    calories: 0,
                                    protein: 0,
                                    carbs: 0,
                                    fat: 0,
                                    fdc_id: fdcId,
                                };
                            }
                        })
                    );
                    loaded.forEach((ing) => ingredients.push(ing));
                }

                updateIngredientsList();
                calculateAndDisplayTotals();

                window.currentEditingRecipeId = recipeId;
                document.getElementById('recipeName').value = recipe.name;
                document.getElementById('saveRecipeBtn').style.display = '';
                document.getElementById('cancelEditBtn').style.display = '';

                switchTab('create');

                alert(
                    `Recipe "${recipe.name}" loaded for editing. Make your changes and click "Save" to update.`
                );
            } catch (e) {
                console.error('Error loading recipe for edit:', e);
                alert('Error loading recipe. Please try again.');
            }
        }

        async function viewRecipeDetails(recipeId) {
            try {
                const db = await getDB();
                const recipe = await idbRequest(
                    db.transaction(['recipeStore'], 'readonly').objectStore('recipeStore').get(recipeId)
                );

                if (!recipe) return;

                const modal = document.createElement('div');
                modal.className = 'recipe-modal';

                let microHtml = '';
                if (recipe.nutrients && typeof recipe.nutrients === 'object') {
                    microHtml = '<h4 style="margin-top:12px;">Additional nutrients (per 100g)</h4><ul>';
                    Object.keys(recipe.nutrients).forEach((key) => {
                        if (
                            ['calories', 'protein', 'fat', 'carbohydrate', 'carbs'].includes(
                                key
                            )
                        ) {
                            return;
                        }
                        const val = recipe.nutrients[key];
                        if (val == null) return;
                        microHtml += `<li>${key.replace(/_/g, ' ')}: ${val}</li>`;
                    });
                    microHtml += '</ul>';
                }

                modal.innerHTML = `
                    <div class="recipe-modal-content">
                        <span class="close-modal">&times;</span>
                        <h2>${recipe.name}</h2>
                        <div class="recipe-details">
                            <h3>Nutritional Information (per 100g)</h3>
                            <p>Calories: ${recipe.calories}</p>
                            <p>Protein: ${recipe.protein}g</p>
                            <p>Carbs: ${recipe.carbohydrate}g</p>
                            <p>Fat: ${recipe.fat}g</p>
                            <p>Sugars: ${recipe.sugars != null ? recipe.sugars : 0}g</p>
                            <p>Fiber: ${recipe.fiber != null ? recipe.fiber : 0}g</p>
                            <p>Net carbs: ${recipe.netCarbs != null ? recipe.netCarbs : recipe.carbohydrate}g</p>
                            ${microHtml}
                        </div>
                    </div>
                `;

                document.body.appendChild(modal);
                modal.style.display = 'flex';

                modal.querySelector('.close-modal').addEventListener('click', function () {
                    modal.style.display = 'none';
                    setTimeout(() => modal.remove(), 300);
                });

                modal.addEventListener('click', function (e) {
                    if (e.target === modal) {
                        modal.style.display = 'none';
                        setTimeout(() => modal.remove(), 300);
                    }
                });
            } catch (e) {
                console.error('Error viewing recipe:', e);
            }
        }

        // Initialize autocomplete and load saved recipes when the page loads
        document.addEventListener('DOMContentLoaded', async function() {
            setupHeader('Create New Recipe');
            await initializeFoodList();
            loadSavedRecipes();
        });
        
