let calorieChart = null;
let macroChart = null;
let sleepChart = null;
let distributionChart = null;
let foodLog = null;
let resizeTimer = null;

const SLEEP_LABELS = {
    1: 'Ugh X(',
    2: 'eh :(',
    3: 'meh',
    4: 'Good-nuf',
    5: 'between goodnuf and excellent',
    6: 'Excellent',
    7: 'Dreambaby'
};

function parseLocalDate(dateStr) {
    if (typeof dateStr !== 'string') return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m - 1, d);
}

function formatDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDate(dateStr) {
    const date = parseLocalDate(dateStr);
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

function getChartTheme() {
    const style = getComputedStyle(document.documentElement);
    const text = style.getPropertyValue('--text').trim() || '#fff';
    return {
        text,
        grid: 'rgba(255,255,255,0.1)',
        legendBoxWidth: window.innerWidth < 768 ? 12 : 40
    };
}

function chartAspectRatio() {
    return window.innerWidth < 768 ? 1.2 : 2;
}

function distributionAspectRatio() {
    return window.innerWidth < 768 ? 1 : 2;
}

function baseChartOptions() {
    const theme = getChartTheme();
    return {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: chartAspectRatio(),
        plugins: {
            legend: {
                labels: {
                    color: theme.text,
                    boxWidth: theme.legendBoxWidth
                }
            }
        },
        scales: {
            y: {
                ticks: { color: theme.text },
                grid: { color: theme.grid }
            },
            x: {
                ticks: { color: theme.text },
                grid: { color: theme.grid }
            }
        }
    };
}

async function enrichFullFoodLog(log) {
    const out = {};
    for (const day of Object.keys(log)) {
        const items = log[day];
        if (!Array.isArray(items)) {
            out[day] = items;
            continue;
        }
        out[day] = await enrichFoodLogDayItems(items);
    }
    return out;
}

function getFoodLogDates() {
    if (!foodLog) return [];
    return Object.keys(foodLog).sort();
}

function getFoodsForDate(date) {
    const items = foodLog[date];
    return Array.isArray(items) ? items : [];
}

function calculateDailyTotals(foods) {
    if (!Array.isArray(foods) || foods.length === 0) {
        return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    return {
        calories: Math.round(foods.reduce((sum, food) => sum + food.calories, 0)),
        protein: Math.round(foods.reduce((sum, food) => sum + food.protein, 0)),
        carbs: Math.round(foods.reduce((sum, food) => sum + food.carbs, 0)),
        fat: Math.round(foods.reduce((sum, food) => sum + food.fat, 0))
    };
}

function getDateRange(fromDateStr, toDateStr) {
    const dates = [];
    const end = parseLocalDate(toDateStr);
    const cur = parseLocalDate(fromDateStr);
    while (cur <= end) {
        dates.push(formatDateKey(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

function getTrendRangeValue() {
    const el = document.getElementById('trendRange');
    return el ? el.value : '30';
}

function getTrendWindowBounds(range) {
    const allDates = getFoodLogDates();
    const sleepData = getSleepData();
    const sleepDates = Object.keys(sleepData);
    const combined = [...new Set([...allDates, ...sleepDates])].sort();

    if (combined.length === 0) return null;

    if (range === 'all') {
        return { start: combined[0], end: combined[combined.length - 1] };
    }

    const days = parseInt(range, 10);
    const endDate = allDates.length > 0
        ? allDates[allDates.length - 1]
        : sleepDates.sort()[sleepDates.length - 1];
    const end = parseLocalDate(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return { start: formatDateKey(start), end: endDate };
}

function getChartDateRange(range) {
    const bounds = getTrendWindowBounds(range);
    if (!bounds) return [];
    return getDateRange(bounds.start, bounds.end);
}

function buildNutritionTrendData(range) {
    const trendDates = getChartDateRange(range);
    return trendDates.map(date => {
        const foods = getFoodsForDate(date);
        const label = formatDate(date);
        if (foods.length === 0) {
            return { date: label, calories: null, protein: null, carbs: null, fat: null };
        }
        return { date: label, ...calculateDailyTotals(foods) };
    });
}

function destroyChartInstance(chart) {
    if (chart) chart.destroy();
}

function destroyCalorieChart() {
    destroyChartInstance(calorieChart);
    calorieChart = null;
}

function destroyMacroChart() {
    destroyChartInstance(macroChart);
    macroChart = null;
}

function destroySleepChart() {
    destroyChartInstance(sleepChart);
    sleepChart = null;
}

function destroyDistributionChart() {
    destroyChartInstance(distributionChart);
    distributionChart = null;
}

function destroyCharts() {
    destroyCalorieChart();
    destroyMacroChart();
    destroySleepChart();
    destroyDistributionChart();
}

function createCalorieChart() {
    destroyCalorieChart();
    const chartData = buildNutritionTrendData(getTrendRangeValue());
    const options = baseChartOptions();

    calorieChart = new Chart(document.getElementById('calorieChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartData.map(d => d.date),
            datasets: [{
                label: 'Calories',
                data: chartData.map(d => d.calories),
                borderColor: '#ff7300',
                tension: 0.1,
                spanGaps: true
            }]
        },
        options
    });
}

function createMacroChart() {
    destroyMacroChart();
    const chartData = buildNutritionTrendData(getTrendRangeValue());
    const options = baseChartOptions();

    macroChart = new Chart(document.getElementById('macroChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: chartData.map(d => d.date),
            datasets: [{
                label: 'Protein',
                data: chartData.map(d => d.protein),
                borderColor: '#8884d8',
                tension: 0.1,
                spanGaps: true
            }, {
                label: 'Carbs',
                data: chartData.map(d => d.carbs),
                borderColor: '#82ca9d',
                tension: 0.1,
                spanGaps: true
            }, {
                label: 'Fat',
                data: chartData.map(d => d.fat),
                borderColor: '#ff0000',
                tension: 0.1,
                spanGaps: true
            }]
        },
        options
    });
}

function createSleepChart() {
    destroySleepChart();
    const sleepData = getSleepData();
    const range = getTrendRangeValue();
    const trendDates = getChartDateRange(range);

    const sleepDateLabels = trendDates.map(date => formatDate(date));
    const sleepRatings = trendDates.map(date => {
        const dayData = sleepData[date];
        const rating = dayData && dayData.sleepRating != null
            ? parseInt(dayData.sleepRating, 10)
            : null;
        return Number.isFinite(rating) ? rating : null;
    });

    const theme = getChartTheme();

    sleepChart = new Chart(document.getElementById('sleepChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: sleepDateLabels,
            datasets: [{
                label: 'Sleep Quality',
                data: sleepRatings,
                borderColor: '#9c27b0',
                backgroundColor: 'rgba(156, 39, 176, 0.1)',
                tension: 0.1,
                pointRadius: 6,
                pointHoverRadius: 8,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: chartAspectRatio(),
            plugins: {
                legend: {
                    labels: {
                        color: theme.text,
                        boxWidth: theme.legendBoxWidth
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const rating = context.parsed.y;
                            if (rating === null) return 'No sleep data';
                            return `Sleep: ${SLEEP_LABELS[rating] || rating}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0.5,
                    max: 7.5,
                    ticks: {
                        color: theme.text,
                        callback(value) {
                            return SLEEP_LABELS[value] || value;
                        },
                        maxTicksLimit: 7
                    },
                    grid: { color: theme.grid },
                    title: {
                        display: true,
                        text: 'Sleep Quality',
                        color: theme.text
                    }
                },
                x: {
                    ticks: { color: theme.text },
                    grid: { color: theme.grid }
                }
            }
        }
    });
}

function buildDistributionData(recentDates) {
    return recentDates.map(date => {
        const hourlyCalories = new Array(24).fill(0);
        getFoodsForDate(date).forEach(food => {
            const hour = parseInt(food.timeAdded.split(':')[0], 10);
            if (hour >= 0 && hour < 24) {
                hourlyCalories[hour] += food.calories;
            }
        });
        return hourlyCalories;
    });
}

function createDistributionChart() {
    destroyDistributionChart();

    const range = document.getElementById('distributionRange').value;
    const allDates = getFoodLogDates();
    const recentDates = range === 'all'
        ? allDates
        : allDates.slice(-parseInt(range, 10));

    const distributionData = buildDistributionData(recentDates);
    const maxCalories = Math.max(1, ...distributionData.flat());
    const dotSize = parseInt(document.getElementById('dotSize').value, 10);

    const points = [];
    const backgroundColors = [];

    distributionData.forEach((dayData, dateIndex) => {
        dayData.forEach((calories, hour) => {
            if (calories <= 0) return;
            points.push({ x: hour, y: dateIndex, calories });
            backgroundColors.push(`rgba(255, 115, 0, ${calories / maxCalories})`);
        });
    });

    const theme = getChartTheme();

    distributionChart = new Chart(document.getElementById('distributionChart').getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                data: points,
                backgroundColor: backgroundColors,
                pointRadius: dotSize,
                pointStyle: 'rect'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: distributionAspectRatio(),
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const point = context.raw;
                            const time = `${String(point.x).padStart(2, '0')}:00`;
                            return `Time: ${time}, Calories: ${Math.round(point.calories)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: -0.5,
                    max: Math.max(recentDates.length - 0.5, 0.5),
                    afterBuildTicks(scale) {
                        scale.ticks = recentDates.map((_, index) => ({ value: index }));
                    },
                    ticks: {
                        color: theme.text,
                        callback(value) {
                            const index = Math.round(value);
                            return Number.isInteger(index) && index >= 0 && index < recentDates.length
                                ? formatDate(recentDates[index])
                                : '';
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: { color: theme.grid },
                    title: {
                        display: true,
                        text: 'Date',
                        color: theme.text
                    }
                },
                x: {
                    min: -0.5,
                    max: 23.5,
                    ticks: {
                        color: theme.text,
                        callback(value) {
                            return window.innerWidth < 768
                                ? `${String(value)}h`
                                : `${String(value).padStart(2, '0')}:00`;
                        }
                    },
                    grid: { color: theme.grid },
                    title: {
                        display: true,
                        text: 'Time of Day',
                        color: theme.text
                    }
                }
            }
        }
    });
}

function tryCreateChart(label, createFn) {
    try {
        createFn();
    } catch (e) {
        console.error(`Error creating ${label} chart:`, e);
    }
}

function createCharts() {
    tryCreateChart('calorie', createCalorieChart);
    tryCreateChart('macro', createMacroChart);
    tryCreateChart('sleep', createSleepChart);
    tryCreateChart('distribution', createDistributionChart);
}

function updateTrendCharts() {
    tryCreateChart('calorie', createCalorieChart);
    tryCreateChart('macro', createMacroChart);
    tryCreateChart('sleep', createSleepChart);
}

function updateDistributionChart() {
    tryCreateChart('distribution', createDistributionChart);
}

function populateDateSelectors(log) {
    const dateKeys = Object.keys(log).sort();
    const parsedDates = dateKeys.map(parseLocalDate);
    const newestKey = dateKeys[dateKeys.length - 1];
    const newest = parseLocalDate(newestKey);

    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    const daySelect = document.getElementById('daySelect');

    const years = [...new Set(parsedDates.map(d => d.getFullYear()))].sort();
    yearSelect.innerHTML = years.map(year =>
        `<option value="${year}">${year}</option>`
    ).join('');

    function buildSelectedDate() {
        return `${yearSelect.value}-${String(parseInt(monthSelect.value, 10) + 1).padStart(2, '0')}-${String(daySelect.value).padStart(2, '0')}`;
    }

    function updateDays(preferNewest) {
        const selectedYear = parseInt(yearSelect.value, 10);
        const selectedMonth = parseInt(monthSelect.value, 10);
        const days = [...new Set(parsedDates
            .filter(date =>
                date.getFullYear() === selectedYear &&
                date.getMonth() === selectedMonth
            )
            .map(date => date.getDate())
        )].sort((a, b) => a - b);

        daySelect.innerHTML = days.map(day =>
            `<option value="${day}">${day}</option>`
        ).join('');

        if (preferNewest && selectedYear === newest.getFullYear() && selectedMonth === newest.getMonth()) {
            daySelect.value = newest.getDate();
        }

        updateView(buildSelectedDate());
    }

    function updateMonths(preferNewest) {
        const selectedYear = parseInt(yearSelect.value, 10);
        const months = [...new Set(parsedDates
            .filter(date => date.getFullYear() === selectedYear)
            .map(date => date.getMonth())
        )].sort();

        monthSelect.innerHTML = months.map(month =>
            `<option value="${month}">${new Date(2000, month).toLocaleString('default', { month: 'long' })}</option>`
        ).join('');

        if (preferNewest && selectedYear === newest.getFullYear()) {
            monthSelect.value = newest.getMonth();
        }

        updateDays(preferNewest);
    }

    yearSelect.addEventListener('change', () => updateMonths(false));
    monthSelect.addEventListener('change', () => updateDays(false));
    daySelect.addEventListener('change', () => updateView(buildSelectedDate()));

    yearSelect.value = newest.getFullYear();
    updateMonths(true);
}

function createDailyBreakdown(foods) {
    const breakdown = document.getElementById('dailyBreakdown');
    if (!Array.isArray(foods) || foods.length === 0) {
        breakdown.innerHTML = '<p class="empty-day-message">No food logged for this day.</p>';
        return;
    }

    const totals = calculateDailyTotals(foods);
    const sortedFoods = [...foods].sort((a, b) => a.timeAdded.localeCompare(b.timeAdded));

    breakdown.innerHTML = `
        <div class="summary-box">
            <h3>Daily Totals</h3>
            <div class="table-scroll">
                <table class="food-table summary-table">
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
        </div>
        <div class="table-scroll">
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
                    ${sortedFoods.map(food => `
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
        </div>
    `;
}

function getSleepData() {
    try {
        return RadiantStorage.notes.getSleep();
    } catch (e) {
        console.error('Error loading sleep data:', e);
        return {};
    }
}

function updateView(date) {
    createDailyBreakdown(getFoodsForDate(date));
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

function handleFoodTotalsRangeChange() {
    const rangeSelect = document.getElementById('foodTotalsRange');
    const customInput = document.getElementById('customDaysInput');

    customInput.classList.toggle('is-hidden', rangeSelect.value !== 'custom');
    updateFoodTotals();
}

function updateFoodTotals() {
    const rangeSelect = document.getElementById('foodTotalsRange');
    const customInput = document.getElementById('customDaysInput');

    let daysToShow;
    if (rangeSelect.value === 'custom') {
        daysToShow = parseInt(customInput.value, 10) || 7;
    } else {
        daysToShow = parseInt(rangeSelect.value, 10);
    }

    const dates = getFoodLogDates();
    const recentDays = dates.slice(-daysToShow);
    const foodTotals = {};

    recentDays.forEach(date => {
        getFoodsForDate(date).forEach(food => {
            if (!foodTotals[food.name]) {
                foodTotals[food.name] = { grams: 0, calories: 0, count: 0 };
            }
            foodTotals[food.name].grams += food.grams;
            foodTotals[food.name].calories += food.calories;
            foodTotals[food.name].count += 1;
        });
    });

    const sortedFoods = Object.entries(foodTotals)
        .sort(([, a], [, b]) => b.calories - a.calories);

    document.getElementById('foodTotalsBody').innerHTML = sortedFoods.map(([name, data]) => `
        <tr>
            <td>${name}</td>
            <td>${Math.round(data.grams)}g</td>
            <td>${data.count}</td>
            <td>${Math.round(data.calories)} kcal</td>
        </tr>
    `).join('');
}

function setLoadingStatus(text, pct) {
    const textEl = document.getElementById('chartsLoadingText');
    const barEl = document.getElementById('chartsLoadingBar');
    if (textEl) textEl.textContent = text;
    if (barEl && pct != null) barEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function hideLoadingStatus() {
    const loadingEl = document.getElementById('chartsLoading');
    const contentEl = document.getElementById('chartsContent');
    if (loadingEl) loadingEl.classList.add('is-hidden');
    if (contentEl) contentEl.classList.remove('is-hidden');
}

function handleChartsResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const ratio = chartAspectRatio();
        const distRatio = distributionAspectRatio();
        const theme = getChartTheme();

        [calorieChart, macroChart, sleepChart].forEach(chart => {
            if (!chart) return;
            chart.options.aspectRatio = ratio;
            if (chart.options.plugins && chart.options.plugins.legend) {
                chart.options.plugins.legend.labels.boxWidth = theme.legendBoxWidth;
            }
            chart.update('none');
        });

        if (distributionChart) {
            distributionChart.options.aspectRatio = distRatio;
            distributionChart.update('none');
        }
    }, 150);
}

function wireChartsEvents() {
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importInput').addEventListener('change', function() {
        importData(this);
    });
    document.getElementById('trendRange').addEventListener('change', updateTrendCharts);
    document.getElementById('dotSize').addEventListener('change', updateDistributionChart);
    document.getElementById('distributionRange').addEventListener('change', updateDistributionChart);
    document.getElementById('foodTotalsRange').addEventListener('change', handleFoodTotalsRangeChange);
    document.getElementById('customDaysInput').addEventListener('change', updateFoodTotals);
    window.addEventListener('resize', handleChartsResize);
}

document.addEventListener('DOMContentLoaded', async function() {
    setupHeader('Nutrition Analysis');
    wireChartsEvents();
    setLoadingStatus('Loading food database…', 0);

    try {
        await loadFoodNamesAndCache();
    } catch (e) {
        console.warn('charts cache', e);
    }

    try {
        const logStr = RadiantStorage.getRaw(RadiantStorage.KEYS.FOOD_LOG);
        foodLog = JSON.parse(logStr);
        if (!foodLog) throw new Error('No food log found');

        setLoadingStatus('Updating food log…', 0);
        await migrateFoodLogIfNeeded(foodLog, function(done, total) {
            const pct = total > 0 ? (done / total) * 100 : 100;
            setLoadingStatus('Updating food log… (' + done + ' / ' + total + ')', pct);
        });

        setLoadingStatus('Loading charts…', 100);
        foodLog = RadiantStorage.nutrition.getFoodLog();
        foodLog = await enrichFullFoodLog(foodLog);
    } catch (e) {
        console.error('Error loading food log:', e);
        foodLog = {
            '2024-12-25': [
                { name: 'Oatmeal', grams: 200, calories: 340, fat: 6.5, protein: 12, carbs: 62, timeAdded: '8:30' },
                { name: 'Blueberries', grams: 150, calories: 85, fat: 0.5, protein: 1.1, carbs: 21, timeAdded: '8:35' }
            ],
            '2024-12-26': [
                { name: 'Greek Yogurt', grams: 200, calories: 130, fat: 0.7, protein: 22, carbs: 9, timeAdded: '7:15' },
                { name: 'Almonds', grams: 30, calories: 180, fat: 15, protein: 6, carbs: 6, timeAdded: '10:30' }
            ]
        };
    }

    window.foodLog = foodLog;
    hideLoadingStatus();
    populateDateSelectors(foodLog);
    updateFoodTotals();
    createCharts();
});
