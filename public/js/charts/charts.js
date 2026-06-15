        let calorieChart = null;
        let macroChart = null;
        let sleepChart = null;
        let distributionChart = null;  // Add new chart variable

        function formatDate(dateStr) {
            // Add one day to account for timezone issues
            const date = new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000);
            return date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
        }

        async function enrichFullFoodLog(foodLog) {
            const out = {};
            for (const day of Object.keys(foodLog)) {
                const items = foodLog[day];
                if (!Array.isArray(items)) {
                    out[day] = items;
                    continue;
                }
                out[day] = await enrichFoodLogDayItems(items);
            }
            return out;
        }

        function calculateDailyTotals(foods) {
            return {
                calories: Math.round(foods.reduce((sum, food) => sum + food.calories, 0)),
                protein: Math.round(foods.reduce((sum, food) => sum + food.protein, 0)),
                carbs: Math.round(foods.reduce((sum, food) => sum + food.carbs, 0)),
                fat: Math.round(foods.reduce((sum, food) => sum + food.fat, 0))
            };
        }

        function populateDateSelectors(foodLog) {
            // Convert dates and add one day to account for timezone issues
            const dates = Object.keys(foodLog).map(date => 
                new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
            );
            const years = [...new Set(dates.map(date => date.getFullYear()))].sort();
            const yearSelect = document.getElementById('yearSelect');
            const monthSelect = document.getElementById('monthSelect');
            const daySelect = document.getElementById('daySelect');
            
            // Populate years
            yearSelect.innerHTML = years.map(year => 
                `<option value="${year}">${year}</option>`
            ).join('');

            function updateMonths() {
                const selectedYear = parseInt(yearSelect.value);
                const months = [...new Set(dates
                    .filter(date => date.getFullYear() === selectedYear)
                    .map(date => date.getMonth())
                )].sort();

                monthSelect.innerHTML = months.map(month => 
                    `<option value="${month}">${new Date(2000, month).toLocaleString('default', { month: 'long' })}</option>`
                ).join('');
                
                updateDays();
            }

            function updateDays() {
                const selectedYear = parseInt(yearSelect.value);
                const selectedMonth = parseInt(monthSelect.value);
                const days = [...new Set(dates
                    .filter(date => 
                        date.getFullYear() === selectedYear && 
                        date.getMonth() === selectedMonth
                    )
                    .map(date => date.getDate())
                )].sort((a, b) => a - b);

                daySelect.innerHTML = days.map(day => 
                    `<option value="${day}">${day}</option>`
                ).join('');

                // Update view with selected date
                const selectedDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(days[0]).padStart(2, '0')}`;
                updateView(selectedDate);
            }

            yearSelect.onchange = updateMonths;
            monthSelect.onchange = updateDays;
            daySelect.onchange = () => {
                const selectedDate = `${yearSelect.value}-${String(parseInt(monthSelect.value) + 1).padStart(2, '0')}-${String(daySelect.value).padStart(2, '0')}`;
                updateView(selectedDate);
            };

            // Initial population
            updateMonths();
        }

        function createDailyBreakdown(foods) {
            const breakdown = document.getElementById('dailyBreakdown');
            const totals = calculateDailyTotals(foods);
            
            const html = `
                <div class="summary-box">
                    <h3>Daily Totals</h3>
                    <table class="food-table" style="margin-top: 8px;">
                        <thead>
                            <tr>
                                <th>Calories</th>
                                <th>Protein</th>
                                <th>Carbs</th>
                                <th>Fat</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${totals.calories} kcal</td>
                                <td>${totals.protein}g</td>
                                <td>${totals.carbs}g</td>
                                <td>${totals.fat}g</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <table class="food-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Food</th>
                            <th>Amount</th>
                            <th>Calories</th>
                            <th>Protein</th>
                            <th>Carbs</th>
                            <th>Fat</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${foods.sort((a, b) => a.timeAdded.localeCompare(b.timeAdded))
                            .map(food => `
                                <tr>
                                    <td>${food.timeAdded}</td>
                                    <td>${food.name}</td>
                                    <td>${food.grams}g</td>
                                    <td>${Math.round(food.calories)}</td>
                                    <td>${Math.round(food.protein)}g</td>
                                    <td>${Math.round(food.carbs)}g</td>
                                    <td>${Math.round(food.fat)}g</td>
                                </tr>
                            `).join('')}
                    </tbody>
                </table>
            `;
            
            breakdown.innerHTML = html;
        }

        function getSleepData() {
            try {
                const sleepData = RadiantStorage.notes.getSleep();
                return sleepData;
            } catch (e) {
                console.error('Error loading sleep data:', e);
                return {};
            }
        }

        function destroyCharts() {
            if (calorieChart) {
                calorieChart.destroy();
                calorieChart = null;
            }
            if (macroChart) {
                macroChart.destroy();
                macroChart = null;
            }
            if (sleepChart) {
                sleepChart.destroy();
                sleepChart = null;
            }
            if (distributionChart) {
                distributionChart.destroy();
                distributionChart = null;
            }
        }

        function createCharts(foodLog) {
            destroyCharts();

            const dates = Object.keys(foodLog).sort();
            const chartData = dates.map(date => ({
                date: formatDate(date),
                ...calculateDailyTotals(foodLog[date])
            }));

            const chartOptions = {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: window.innerWidth < 768 ? 1.2 : 2,
                plugins: {
                    legend: {
                        labels: {
                            color: '#fff',
                            boxWidth: window.innerWidth < 768 ? 12 : 40
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: { color: '#fff' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    },
                    x: {
                        ticks: { color: '#fff' },
                        grid: { color: 'rgba(255,255,255,0.1)' }
                    }
                }
            };

            const calorieCtx = document.getElementById('calorieChart').getContext('2d');
            calorieChart = new Chart(calorieCtx, {
                type: 'line',
                data: {
                    labels: chartData.map(d => d.date),
                    datasets: [{
                        label: 'Calories',
                        data: chartData.map(d => d.calories),
                        borderColor: '#ff7300',
                        tension: 0.1
                    }]
                },
                options: chartOptions
            });

            const macroCtx = document.getElementById('macroChart').getContext('2d');
            macroChart = new Chart(macroCtx, {
                type: 'line',
                data: {
                    labels: chartData.map(d => d.date),
                    datasets: [{
                        label: 'Protein',
                        data: chartData.map(d => d.protein),
                        borderColor: '#8884d8',
                        tension: 0.1
                    }, {
                        label: 'Carbs',
                        data: chartData.map(d => d.carbs),
                        borderColor: '#82ca9d',
                        tension: 0.1
                    }, {
                        label: 'Fat',
                        data: chartData.map(d => d.fat),
                        borderColor: '#ff0000',
                        tension: 0.1
                    }]
                },
                options: chartOptions
            });

            // Create sleep chart
            const sleepData = getSleepData();
            const sleepCtx = document.getElementById('sleepChart').getContext('2d');
            
            // Get sleep ratings for the same dates as food data
            const sleepRatings = dates.map(date => {
                const rating = sleepData[date];
                return rating ? parseInt(rating) : null;
            });

            // Sleep quality labels
            const sleepLabels = {
                1: 'Ugh X(',
                2: 'eh :(',
                3: 'meh',
                4: 'Good-nuf',
                5: 'between goodnuf and excellent',
                6: 'Excellent',
                7: 'Dreambaby'
            };

            sleepChart = new Chart(sleepCtx, {
                type: 'line',
                data: {
                    labels: chartData.map(d => d.date),
                    datasets: [{
                        label: 'Sleep Quality',
                        data: sleepRatings,
                        borderColor: '#9c27b0',
                        backgroundColor: 'rgba(156, 39, 176, 0.1)',
                        tension: 0.1,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: window.innerWidth < 768 ? 1.2 : 2,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#fff',
                                boxWidth: window.innerWidth < 768 ? 12 : 40
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const rating = context.parsed.y;
                                    if (rating === null) return 'No sleep data';
                                    return `Sleep: ${sleepLabels[rating] || rating}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 0.5,
                            max: 7.5,
                            ticks: { 
                                color: '#fff',
                                callback: function(value) {
                                    return sleepLabels[value] || value;
                                },
                                maxTicksLimit: 7
                            },
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            title: {
                                display: true,
                                text: 'Sleep Quality',
                                color: '#fff'
                            }
                        },
                        x: {
                            ticks: { color: '#fff' },
                            grid: { color: 'rgba(255,255,255,0.1)' }
                        }
                    }
                }
            });

            // Modified distribution chart creation
            const distributionCtx = document.getElementById('distributionChart').getContext('2d');
            const range = document.getElementById('distributionRange').value;
            
            // Process data for distribution chart
            const timeSlots = Array.from({length: 24}, (_, i) => `${String(i).padStart(2, '0')}:00`);
            const allDates = Object.keys(foodLog).sort();
            const recentDates = range === 'all' ? 
                allDates : 
                allDates.slice(-parseInt(range));
            
            const distributionData = recentDates.map(date => {
                const hourlyCalories = new Array(24).fill(0);
                
                foodLog[date].forEach(food => {
                    const hour = parseInt(food.timeAdded.split(':')[0]);
                    hourlyCalories[hour] += food.calories;
                });
                
                return hourlyCalories;
            });

            // Find max calories for color scaling
            const maxCalories = Math.max(...distributionData.flat());

            distributionChart = new Chart(distributionCtx, {
                type: 'scatter',
                data: {
                    datasets: distributionData.flatMap((dayData, dateIndex) => 
                        dayData.map((calories, hour) => ({
                            x: hour,
                            y: dateIndex,
                            calories: calories
                        }))
                    ).map(point => ({
                        data: [{
                            x: point.x,
                            y: point.y
                        }],
                        backgroundColor: `rgba(255, 115, 0, ${point.calories / maxCalories})`,
                        pointRadius: parseInt(document.getElementById('dotSize').value),
                        pointStyle: 'rect'
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: window.innerWidth < 768 ? 1 : 2,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const dataPoint = Math.round(distributionData[context.raw.y][context.raw.x]);
                                    const time = `${String(context.raw.x).padStart(2, '0')}:00`;
                                    return `Time: ${time}, Calories: ${dataPoint}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: -0.5,
                            max: recentDates.length - 0.5,
                            ticks: {
                                color: '#fff',
                                callback: function(value) {
                                    return value >= 0 && value < recentDates.length ? 
                                        formatDate(recentDates[value]) : '';
                                },
                                maxRotation: 45,
                                minRotation: 45
                            },
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            title: {
                                display: true,
                                text: 'Date',
                                color: '#fff'
                            }
                        },
                        x: {
                            min: -0.5,
                            max: 23.5,
                            ticks: { 
                                color: '#fff',
                                callback: function(value) {
                                    return window.innerWidth < 768 ? 
                                        `${String(value)}h` : 
                                        `${String(value).padStart(2, '0')}:00`;
                                }
                            },
                            grid: { color: 'rgba(255,255,255,0.1)' },
                            title: {
                                display: true,
                                text: 'Time of Day',
                                color: '#fff'
                            }
                        }
                    }
                }
            });
        }

        function updateView(date) {
            createDailyBreakdown(foodLog[date]);
            updateFoodTotals();
        }

        function exportData() {
            const dataStr = JSON.stringify(RadiantStorage.getRaw(RadiantStorage.KEYS.FOOD_LOG));
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `nutrition-data_${dateStr}.json`;
            
            const element = document.createElement('a');
            element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr));
            element.setAttribute('download', filename);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }

        function importData(input) {
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data) throw new Error('Invalid data format');
                    
                    RadiantStorage.nutrition.saveFoodLog(data);
                    alert('Data imported successfully! Reloading...');
                    setTimeout(() => location.reload(), 1000);
                } catch (error) {
                    alert('Error importing data: ' + error.message);
                }
            };
            reader.readAsText(file);
        }

        // Add new function to update distribution chart
        function updateDistributionChart() {
            createCharts(window.foodLog);
        }

        function handleFoodTotalsRangeChange() {
            const rangeSelect = document.getElementById('foodTotalsRange');
            const customInput = document.getElementById('customDaysInput');
            
            customInput.style.display = rangeSelect.value === 'custom' ? 'block' : 'none';
            updateFoodTotals();
        }

        function updateFoodTotals() {
            const rangeSelect = document.getElementById('foodTotalsRange');
            const customInput = document.getElementById('customDaysInput');
            
            let daysToShow;
            if (rangeSelect.value === 'custom') {
                daysToShow = parseInt(customInput.value) || 7; // Default to 7 if invalid
            } else {
                daysToShow = parseInt(rangeSelect.value);
            }

            const dates = Object.keys(window.foodLog).sort();
            const recentDays = dates.slice(-daysToShow);
            const foodTotals = {};

            // Compile food totals
            recentDays.forEach(date => {
                window.foodLog[date].forEach(food => {
                    if (!foodTotals[food.name]) {
                        foodTotals[food.name] = {
                            grams: 0,
                            calories: 0,
                            count: 0
                        };
                    }
                    foodTotals[food.name].grams += food.grams;
                    foodTotals[food.name].calories += food.calories;
                    foodTotals[food.name].count += 1;
                });
            });

            // Sort by total calories
            const sortedFoods = Object.entries(foodTotals)
                .sort(([,a], [,b]) => b.calories - a.calories);

            // Update table
            const tbody = document.getElementById('foodTotalsBody');
            tbody.innerHTML = sortedFoods.map(([name, data]) => `
                <tr>
                    <td>${name}</td>
                    <td>${Math.round(data.grams)}g</td>
                    <td>${data.count}</td>
                    <td>${Math.round(data.calories)} kcal</td>
                </tr>
            `).join('');
        }

        document.addEventListener('DOMContentLoaded', async function() {
            setupHeader('Nutrition Analysis');
            try {
                await loadFoodNamesAndCache();
            } catch (e) {
                console.warn('charts cache', e);
            }
            try {
                const logStr = RadiantStorage.getRaw(RadiantStorage.KEYS.FOOD_LOG);
                window.foodLog = JSON.parse(logStr);
                if (!window.foodLog) throw new Error('No food log found');
                await migrateFoodLogIfNeeded(window.foodLog);
                window.foodLog = RadiantStorage.nutrition.getFoodLog();
                window.foodLog = await enrichFullFoodLog(window.foodLog);
            } catch (e) {
                console.error('Error loading food log:', e);
                window.foodLog = {
                    "2024-12-25": [
                        {"name": "Oatmeal", "grams": 200, "calories": 340, "fat": 6.5, "protein": 12, "carbs": 62, "timeAdded": "8:30"},
                        {"name": "Blueberries", "grams": 150, "calories": 85, "fat": 0.5, "protein": 1.1, "carbs": 21, "timeAdded": "8:35"}
                    ],
                    "2024-12-26": [
                        {"name": "Greek Yogurt", "grams": 200, "calories": 130, "fat": 0.7, "protein": 22, "carbs": 9, "timeAdded": "7:15"},
                        {"name": "Almonds", "grams": 30, "calories": 180, "fat": 15, "protein": 6, "carbs": 6, "timeAdded": "10:30"}
                    ]
                };
            }

            createCharts(window.foodLog);
            updateFoodTotals();
            populateDateSelectors(window.foodLog);
        });
