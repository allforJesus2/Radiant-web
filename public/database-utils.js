// Shared database utility functions for IndexedDB operations

// Function to handle database migration from old versions
function handleDatabaseMigration(db, oldVersion, newVersion) {
    console.log(`Setting up database structure for version ${newVersion}`);
    
    try {
        // Always ensure the main store exists
        if (!db.objectStoreNames.contains('csvStore')) {
            const objectStore = db.createObjectStore('csvStore', { keyPath: 'id' });
            objectStore.createIndex('nameIndex', 'name', { unique: true });
            console.log('Created csvStore with nameIndex');
        }
        
        // Always ensure the recipe ingredients store exists
        if (!db.objectStoreNames.contains('recipeIngredients')) {
            db.createObjectStore('recipeIngredients', { keyPath: 'recipeId' });
            console.log('Created recipeIngredients store');
        }
    } catch (error) {
        console.error('Error in database migration:', error);
        // Don't throw the error, just log it
    }
}



// Function to fetch a specific value for a given food item based on the header key
function fetchValueForKey(foodName, headerKey, callback) {
    const dbName = 'csvDB';
    const storeName = 'csvStore';
    console.log('Fetching value for food:', foodName, 'headerKey:', headerKey);

    const dbRequest = indexedDB.open(dbName);

    dbRequest.onerror = function(event) {
        console.error('Database error:', event.target.error);
    };

    dbRequest.onsuccess = function(event) {
        console.log('Database opened successfully');
        const db = event.target.result;
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        // Use the index for fast lookup instead of cursor scanning
        const index = store.index('nameIndex');
        const request = index.get(foodName);
        
        request.onsuccess = function(event) {
            if (request.result) {
                // Found the food item instantly!
                let value;
                if (headerKey === 'calories') value = request.result.calories;
                else if (headerKey === 'fat') value = request.result.fat;
                else if (headerKey === 'protein') value = request.result.protein;
                else if (headerKey === 'carbohydrate') value = request.result.carbohydrate;
                else if (headerKey === 'servingWeight1') value = request.result.servingWeight1;
                else if (headerKey === 'servingDescription1') value = request.result.servingDescription1;
                else value = 0; // Default value if header key not found
                
                console.log('Found food item, value for', headerKey, ':', value);
                callback(value);
            } else {
                console.log('Food item not found:', foodName);
                callback(0); // Return 0 if not found
            }
        };
        
        request.onerror = function(event) {
            console.error('Index lookup error:', event.target.error);
            callback(0);
        };
    };
}

// Optimized function that gets all nutritional data in one database query
function getNutritionalInfo(foodName, grams) {
    return new Promise((resolve, reject) => {
        const dbName = 'csvDB';
        const storeName = 'csvStore';
        
        const dbRequest = indexedDB.open(dbName);
        
        dbRequest.onerror = function(event) {
            reject(event.target.error);
        };
        
        dbRequest.onsuccess = function(event) {
            const db = event.target.result;
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            // Use the index for fast lookup
            const index = store.index('nameIndex');
            const request = index.get(foodName);
            
            request.onsuccess = function(event) {
                if (request.result) {
                    const foodItem = request.result;
                    
                    // Calculate all nutritional values at once using new structure
                    const nutritionalInfo = {
                        calories: parseFloat(((grams / 100) * foodItem.calories).toFixed(1)),
                        fat: parseFloat(((grams / 100) * foodItem.fat).toFixed(1)),
                        protein: parseFloat(((grams / 100) * foodItem.protein).toFixed(1)),
                        carbs: parseFloat(((grams / 100) * foodItem.carbohydrate).toFixed(1))
                    };
                    
                    resolve(nutritionalInfo);
                } else {
                    reject(new Error('Food not found'));
                }
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        };
    });
}

// Setup autocomplete functionality
function setupAutocomplete(foodList) {
    var foodInput = document.querySelector('.food');
    var autocompleteList = document.getElementById('autocompleteList');
    var gramsInput = document.querySelector('.grams');

    foodInput.addEventListener('input', function() {
        var userInput = this.value;

        if (userInput.length > 1) {
            // Split the user input into words
            var inputWords = userInput.toLowerCase().split(' ');

            var filteredFoods = foodList.filter(function(food) {
                // Convert the food item to lowercase for case-insensitive comparison
                var foodLowerCase = food.toLowerCase();

                // Check if all words in the user input are present in the food item
                return inputWords.every(function(word) {
                    return foodLowerCase.includes(word);
                });
            });

            while (autocompleteList.firstChild) {
                autocompleteList.removeChild(autocompleteList.firstChild);
            }

            filteredFoods.forEach(function(food) {
                var listItem = document.createElement('div');
                listItem.textContent = food;
                listItem.addEventListener('click', function() {
                    foodInput.value = this.textContent;
                    autocompleteList.innerHTML = '';
                    
                    // Focus and select grams input immediately after selection
                    gramsInput.focus();
                    gramsInput.select();
                    
                    // Fetch both serving weight and description
                    fetchValueForKey(this.textContent, 'servingWeight1', function(value) {
                        gramsInput.value = value;
                        gramsInput.select();
                    });
                    
                    fetchValueForKey(this.textContent, 'servingDescription1', function(description) {
                        if (typeof showServingBubble === 'function') {
                            showServingBubble(description, gramsInput);
                        }
                    });
                });

                autocompleteList.appendChild(listItem);
            });
        } else {
            autocompleteList.innerHTML = '';
        }
    });
}
