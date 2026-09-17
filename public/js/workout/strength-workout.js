        document.addEventListener('DOMContentLoaded', function() {
            // Variables
            let tmPercentage = 90;
            let upperProgression = 5;
            let lowerProgression = 5;
            let upperDayStep = 10;
            let lowerDayStep = 10;
            let maxWeek3Percentage = 95;
            let upperCycleIncrease = 5;
            let lowerCycleIncrease = 10;
            let accessoryTemplate = 'standard';
            let workoutPlan = {};
            let currentWeek = 1;
            let currentDay = 0;
            let userLevel = 1; // Initialize user level
            let bbbForeverPhase = 'leader'; // 'leader' | 'anchor' — only used when accessoryTemplate is bbb-forever
            let bbbLeaderCyclesCompleted = 0;
            const BBB_FOREVER_LEADER_CYCLES = 2;
            let amrapResults = {}; // Store AMRAP results for each exercise
            let checkedDays = {}; // Store checked days: {week: {day: 'YYYY-MM-DD'}}
            let completedTimers = {}; // Store completed rest timers: {timerId: completionCount}
            let workoutModeActive = false;
            const NOTES_FADE_MS = 300;
            let levelUpReviewActive = false;
            let levelUpReviewOld1RMs = {};
            let levelUpReviewDeltasAnimated = false;
            let levelUpDeltaAnimHandles = [];
            const LEVEL_UP_DELTA_STAGGER_MS = 200;
            const LEVEL_UP_DELTA_DURATION_MS = 500;
            const LIFT_KEYS = ['squat', 'bench', 'deadlift', 'ohp'];
            const SAVE_BUTTON_DEFAULT_TEXT = 'Save 1 Rep Maxes';
            const SAVE_BUTTON_LEVEL_UP_TEXT = 'Confirm and Level up';

            
            // Rest timer state
            let currentTimer = null;
            let timerInterval = null;
            let restTimeSettings = {
                warmup: 75,
                main: 180,
                accessory: 90
            };

            // Progression chart state
            let progressionChart = null;
            let chartUpdateTimeoutId = null;
            let chartState = { dividerSlot: 0, baselines: [] };
            let chartHiddenLifts = {};
            const CHART_SLOTS_PER_CYCLE = 48;   // 4 weeks × 4 days × 3 sets
            const CHART_DAYS_PER_WEEK = 4;
            const CHART_LIFT_DAY = { ohp: 1, deadlift: 2, bench: 3, squat: 4 };
            const CHART_LIFT_NAMES = { ohp: 'OHP', deadlift: 'Deadlift', bench: 'Bench Press', squat: 'Squat' };

            function logStrengthError(location, message, data) {
                if (typeof RadiantStorage !== 'undefined' && RadiantStorage.debug) {
                    RadiantStorage.debug.log('strength', location, message, data);
                }
            }

            const VALID_ACCESSORY_TEMPLATES = ['standard', 'bbb', 'bbb-forever', 'fsl', 'triumvirate', 'beginners'];

            function normalizestrengthWorkoutPlanInPlace(plan) {
                if (!plan || typeof plan !== 'object') return;
                if (!plan.weeks || typeof plan.weeks !== 'object') {
                    plan.weeks = {};
                }
                for (let week = 1; week <= 4; week++) {
                    if (!Array.isArray(plan.weeks[week])) {
                        plan.weeks[week] = [];
                    }
                    plan.weeks[week].forEach(day => {
                        if (!day.mainLift) {
                            day.mainLift = { name: '', warmup: [], sets: [] };
                        }
                        if (!Array.isArray(day.mainLift.warmup)) {
                            day.mainLift.warmup = [];
                        }
                        if (!Array.isArray(day.mainLift.sets)) {
                            day.mainLift.sets = [];
                        }
                        if (!Array.isArray(day.accessories)) {
                            day.accessories = [];
                        }
                    });
                }
            }

            function normalizeStrengthProfile(raw) {
                if (!raw || typeof raw !== 'object') return null;
                const profile = { ...raw };
                profile.inputs = profile.inputs && typeof profile.inputs === 'object' ? { ...profile.inputs } : {};
                ['squat', 'bench', 'deadlift', 'ohp'].forEach(key => {
                    if (profile.inputs[key] == null && raw[key] != null) {
                        profile.inputs[key] = raw[key];
                    }
                    if (profile.inputs[key] != null) {
                        profile.inputs[key] = String(profile.inputs[key]);
                    }
                });
                if (profile.accessoryTemplate === 'bbb') {
                    profile.accessoryTemplate = 'bbb-forever';
                }
                if (!VALID_ACCESSORY_TEMPLATES.includes(profile.accessoryTemplate)) {
                    profile.accessoryTemplate = 'standard';
                }
                if (profile.accessoryTemplate !== 'bbb-forever') {
                    profile.bbbForeverPhase = 'leader';
                    profile.bbbLeaderCyclesCompleted = 0;
                }
                if (profile.workoutPlan) {
                    normalizestrengthWorkoutPlanInPlace(profile.workoutPlan);
                }
                if (profile.chartPastCycles != null) {
                    profile.chartPastCycles = Math.max(0, Math.min(6, parseInt(profile.chartPastCycles, 10) || 2));
                }
                if (profile.chartFutureCycles != null) {
                    profile.chartFutureCycles = Math.max(1, Math.min(6, parseInt(profile.chartFutureCycles, 10) || 2));
                }
                return profile;
            }

            function hasAny1RMInput() {
                return ['squat', 'bench', 'deadlift', 'ohp'].some(key => {
                    const value = parseFloat(document.getElementById(`${key}-1rm`).value) || 0;
                    return value > 0;
                });
            }

            function hasWorkoutPlan() {
                return workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0;
            }

            // Load saved profile from localStorage
            function loadProfile() {
                try {
                const profile = normalizeStrengthProfile(RadiantStorage.workout.getStrengthProfile());
                if (profile) {
                    
                    // Restore input values
                    document.getElementById('squat-1rm').value = profile.inputs.squat || '';
                    document.getElementById('bench-1rm').value = profile.inputs.bench || '';
                    document.getElementById('deadlift-1rm').value = profile.inputs.deadlift || '';
                    document.getElementById('ohp-1rm').value = profile.inputs.ohp || '';
                    // Restore TM percentage
                    tmPercentage = profile.tmPercentage || 90;
                    tmOptions.forEach(option => {
                        option.classList.toggle('active', option.dataset.value === tmPercentage.toString());
                    });
                    
                    // Restore accessory template
                    accessoryTemplate = profile.accessoryTemplate || 'standard';
                    accessorySelect.value = accessoryTemplate;
                    updateBbbAccessoryInputsVisibility();
                    
                    // Restore UI state
                    currentWeek = profile.currentWeek || 1;
                    currentDay = profile.currentDay || 0;
                    
                    // Restore user level
                    userLevel = profile.userLevel || 1;
                    bbbForeverPhase = profile.bbbForeverPhase || 'leader';
                    bbbLeaderCyclesCompleted = profile.bbbLeaderCyclesCompleted || 0;
                    updateLevelDisplay();
                    
                    // Restore AMRAP results BEFORE rendering workout plan
                    amrapResults = profile.amrapResults || {};
                    
                    // Restore checked days
                    checkedDays = profile.checkedDays || {};
                    // Migrate legacy boolean values to completion date strings
                    Object.keys(checkedDays).forEach(weekKey => {
                        const weekDays = checkedDays[weekKey];
                        if (!weekDays || typeof weekDays !== 'object') return;
                        Object.keys(weekDays).forEach(dayKey => {
                            if (weekDays[dayKey] === true) {
                                weekDays[dayKey] = getLocalDateString();
                            }
                        });
                    });
                    completedTimers = profile.completedTimers || {};
                    
                    // Restore rest time settings
                    if (profile.restTimeSettings) {
                        restTimeSettings = profile.restTimeSettings;
                        const warmupRestEl = document.getElementById('warmup-rest-time');
                        const mainRestEl = document.getElementById('main-rest-time');
                        const accessoryRestEl = document.getElementById('accessory-rest-time');
                        if (warmupRestEl) warmupRestEl.value = restTimeSettings.warmup;
                        if (mainRestEl) mainRestEl.value = restTimeSettings.main;
                        if (accessoryRestEl) accessoryRestEl.value = restTimeSettings.accessory;
                        updateTimeDisplays();
                    }

                    // Restore progression settings
                    upperProgression = profile.upperProgression != null ? profile.upperProgression : 5;
                    lowerProgression = profile.lowerProgression != null ? profile.lowerProgression : 10;
                    upperDayStep = profile.upperDayStep != null ? profile.upperDayStep : 10;
                    lowerDayStep = profile.lowerDayStep != null ? profile.lowerDayStep : 10;
                    maxWeek3Percentage = profile.maxWeek3Percentage != null ? profile.maxWeek3Percentage : 95;
                    upperCycleIncrease = profile.upperCycleIncrease != null ? profile.upperCycleIncrease : 5;
                    lowerCycleIncrease = profile.lowerCycleIncrease != null ? profile.lowerCycleIncrease : 10;

                    // Restore progression chart cycle counts
                    if (profile.chartPastCycles != null) {
                        const pastEl = document.getElementById('chart-past-cycles');
                        if (pastEl) pastEl.value = profile.chartPastCycles;
                    }
                    if (profile.chartFutureCycles != null) {
                        const futureEl = document.getElementById('chart-future-cycles');
                        if (futureEl) futureEl.value = profile.chartFutureCycles;
                    }
                    
                    // Restore workout plan
                    if (profile.workoutPlan && Object.keys(profile.workoutPlan.weeks || {}).length > 0) {
                        workoutPlan = profile.workoutPlan;
                        try {
                            renderWorkoutPlan();
                        } catch (renderErr) {
                            logStrengthError('renderWorkoutPlan', renderErr.message, { phase: 'load' });
                            if (hasAny1RMInput()) {
                                generateWorkoutPlan();
                            }
                        }
                    } else if (hasAny1RMInput()) {
                        generateWorkoutPlan();
                    }
                    
                    // Update UI to show saved week/day
                    setTimeout(() => {
                        weekTabs.forEach(tab => {
                            tab.classList.toggle('active', tab.dataset.week === currentWeek.toString());
                        });
                        showWeekContent(currentWeek, currentDay);
                    }, 0);
                }
                } catch (err) {
                    logStrengthError('loadProfile', err.message, {});
                    console.error('loadProfile failed:', err);
                }
            }

            function getLeaderPhaseHintText() {
                return `Leader cycle — 5s Pro main work + BBB 5×10. After ${BBB_FOREVER_LEADER_CYCLES} completed cycles you'll be prompted to run an Anchor cycle.`;
            }

            function getAnchorPhaseHintText() {
                return `Anchor cycle — AMRAP main lifts + FSL 5×5 supplemental. Push PRs on Week 3, then you'll be prompted to return to leader phase.`;
            }

            function getPhaseHintText(phase) {
                return phase === 'anchor' ? getAnchorPhaseHintText() : getLeaderPhaseHintText();
            }

            let phaseHintPopover = null;
            let activePhaseHintAnchor = null;

            function hidePhaseHintPopover() {
                if (phaseHintPopover) {
                    phaseHintPopover.hidden = true;
                    activePhaseHintAnchor = null;
                }
            }

            function ensurePhaseHintPopover() {
                if (!phaseHintPopover) {
                    phaseHintPopover = document.createElement('div');
                    phaseHintPopover.className = 'phase-hint-popover';
                    phaseHintPopover.hidden = true;
                    phaseHintPopover.setAttribute('role', 'tooltip');
                    document.body.appendChild(phaseHintPopover);
                    document.addEventListener('click', (e) => {
                        if (
                            !phaseHintPopover.hidden
                            && !e.target.closest('.phase-hint-link')
                            && !e.target.closest('.phase-hint-popover')
                        ) {
                            hidePhaseHintPopover();
                        }
                    });
                }
                return phaseHintPopover;
            }

            function togglePhaseHintPopover(anchorEl, text) {
                const popover = ensurePhaseHintPopover();
                if (!popover.hidden && activePhaseHintAnchor === anchorEl) {
                    hidePhaseHintPopover();
                    return;
                }
                activePhaseHintAnchor = anchorEl;
                popover.textContent = text;
                popover.hidden = false;
                const rect = anchorEl.getBoundingClientRect();
                popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
                popover.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
            }

            // Update level display
            function updateLevelDisplay() {
                hidePhaseHintPopover();
                let html = `lvl: ${userLevel}`;
                if (accessoryTemplate === 'bbb-forever') {
                    if (bbbForeverPhase === 'anchor') {
                        html += ' · <span class="phase-hint-link" data-phase="anchor" tabindex="0" role="button">Anchor</span>';
                    } else {
                        html += ' · <span class="phase-hint-link" data-phase="leader" tabindex="0" role="button">Leader</span>';
                    }
                }
                levelDisplay.innerHTML = html;
            }

            function isForeverBbbLeaderPhase() {
                return accessoryTemplate === 'bbb-forever' && bbbForeverPhase === 'leader';
            }

            function isForeverBbbAnchorPhase() {
                return accessoryTemplate === 'bbb-forever' && bbbForeverPhase === 'anchor';
            }

            function resetBbbForeverPhaseState() {
                bbbForeverPhase = 'leader';
                bbbLeaderCyclesCompleted = 0;
            }

            function getEffectiveAccessoryTemplate() {
                if (isForeverBbbAnchorPhase()) return 'fsl';
                return accessoryTemplate;
            }

            function updateBbbAccessoryInputsVisibility() {
                const block = document.getElementById('bbb-accessory-inputs');
                const isBbb = accessorySelect.value === 'bbb' || accessorySelect.value === 'bbb-forever';
                if (block) {
                    block.style.display = isBbb ? 'block' : 'none';
                }
                updateBbbTemplateHelper();
                updateBbbWeightPreview();
                updateProgressionGuide();
                updateWeekTabLabels();
            }

            function getProgressionAmrapTipText() {
                if (accessoryTemplate === 'bbb-forever') {
                    if (isForeverBbbAnchorPhase()) {
                        return 'Anchor cycle — use AMRAP sets to gauge progress and set your next TM';
                    }
                    return 'Leader cycle — no AMRAP sets; increase TM by standard amounts after each 4-week cycle';
                }
                return 'Use AMRAP sets to gauge progress';
            }

            function showProgressionAdjustTip() {
                if (accessoryTemplate === 'bbb-forever' && !isForeverBbbAnchorPhase()) {
                    return false;
                }
                return true;
            }

            function getBbbTemplateHelperText() {
                if (accessorySelect.value === 'bbb-forever') {
                    if (isForeverBbbAnchorPhase()) {
                        return 'Anchor cycle: AMRAP main work + FSL 5×5 supplemental + 50–100 reps assistance. Push PRs on Week 3 top sets, then return to leader phase.';
                    }
                    const cyclesLeft = Math.max(0, BBB_FOREVER_LEADER_CYCLES - bbbLeaderCyclesCompleted);
                    const cycleNote = cyclesLeft === 1
                        ? '1 leader cycle left before Anchor prompt.'
                        : `${cyclesLeft} leader cycles left before Anchor prompt.`;
                    return `Forever BBB leader: 5s Pro main work (no AMRAP), 5×10 supplemental. One accessory per day: Pull 25–50 on Bench/OHP, Core/abs 25–50 on Squat/Deadlift. ${cycleNote}`;
                }
                if (accessorySelect.value === 'bbb') {
                    return 'Classic BBB: pressing days include Chin-ups 5×10 (bodyweight). Squat/deadlift days include ab work. Cap AMRAP at prescribed reps to preserve 5×10 quality.';
                }
                return '';
            }

            function updateProgressionGuide() {
                // Progression guide content is rendered in the setup notes modal on open.
            }

            function updateBbbTemplateHelper() {
                // BBB helper content is rendered in the setup notes modal on open.
            }

            // Save profile to localStorage
            function saveProfile() {
                const profile = {
                    inputs: {
                        squat: document.getElementById('squat-1rm').value,
                        bench: document.getElementById('bench-1rm').value,
                        deadlift: document.getElementById('deadlift-1rm').value,
                        ohp: document.getElementById('ohp-1rm').value,
                    },
                    tmPercentage,
                    upperProgression,
                    lowerProgression,
                    upperDayStep,
                    lowerDayStep,
                    maxWeek3Percentage,
                    upperCycleIncrease,
                    lowerCycleIncrease,
                    accessoryTemplate,
                    workoutPlan,
                    currentWeek,
                    currentDay,
                    userLevel, // Save user level
                    bbbForeverPhase,
                    bbbLeaderCyclesCompleted,
                    amrapResults, // Save AMRAP results
                    restTimeSettings, // Save rest time settings
                    checkedDays, // Save checked days
                    completedTimers, // Save completed rest timers
                    chartPastCycles: getChartCycleConfig().past, // Save progression chart past cycles
                    chartFutureCycles: getChartCycleConfig().future, // Save progression chart future cycles
                };
                
                RadiantStorage.workout.saveStrengthProfile(profile);
            }

            // ---------------- Progression chart ----------------
            function getChartCssVar(name, fallback) {
                const value = getComputedStyle(document.documentElement).getPropertyValue(name);
                return value && value.trim() ? value.trim() : fallback;
            }

            function chartHexToRgba(hex, alpha) {
                const clean = String(hex).trim().replace(/^#/, '');
                if (clean.length === 6 && /^[0-9a-f]{6}$/i.test(clean)) {
                    const r = parseInt(clean.slice(0, 2), 16);
                    const g = parseInt(clean.slice(2, 4), 16);
                    const b = parseInt(clean.slice(4, 6), 16);
                    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                }
                return hex;
            }

            function getChartCycleConfig() {
                const profile = normalizeStrengthProfile(RadiantStorage.workout.getStrengthProfile());
                const storedPast = profile && profile.chartPastCycles != null ? parseInt(profile.chartPastCycles, 10) : NaN;
                const storedFuture = profile && profile.chartFutureCycles != null ? parseInt(profile.chartFutureCycles, 10) : NaN;

                const pastEl = document.getElementById('chart-past-cycles');
                const futureEl = document.getElementById('chart-future-cycles');
                let past = pastEl ? parseInt(pastEl.value, 10) : NaN;
                let future = futureEl ? parseInt(futureEl.value, 10) : NaN;
                if (!Number.isFinite(past)) past = Number.isFinite(storedPast) ? storedPast : 2;
                if (!Number.isFinite(future)) future = Number.isFinite(storedFuture) ? storedFuture : 2;
                past = Math.max(0, Math.min(6, past));
                future = Math.max(1, Math.min(6, future));
                return { past, future };
            }

            function getHistoricalLevelBaselines(pastCount) {
                if (pastCount <= 0) return [];
                const history = RadiantStorage.workout.getStrength1RMHistory();
                const byLevel = new Map();
                history.forEach(entry => {
                    const level = entry.cycleLevel;
                    if (!Number.isInteger(level) || level <= 0) return;
                    if (level >= userLevel) return;
                    const existing = byLevel.get(level);
                    if (!existing || entry.ts >= existing.ts) {
                        byLevel.set(level, entry);
                    }
                });
                return Array.from(byLevel.entries())
                    .sort((a, b) => a[0] - b[0])
                    .slice(-pastCount)
                    .map(([level, entry]) => ({
                        level,
                        lifts: { ...(entry.lifts || {}) },
                    }));
            }

            function getBaseline1RMs() {
                if (levelUpReviewActive) {
                    return readLevelUpReviewNew1RMs();
                }
                return get1RMsFromInputs();
            }

            function buildTimelineBaselines() {
                const { past, future } = getChartCycleConfig();
                const historical = getHistoricalLevelBaselines(past);
                const baselines = [];

                historical.forEach(h => {
                    baselines.push({ level: h.level, lifts: { ...h.lifts } });
                });

                const currentLifts = getBaseline1RMs();
                baselines.push({ level: userLevel, lifts: { ...currentLifts } });

                const predicted = { ...currentLifts };
                for (let i = 1; i <= future; i++) {
                    const next = {};
                    LIFT_KEYS.forEach(key => {
                        const base = predicted[key] || 0;
                        if (base <= 0) {
                            next[key] = 0;
                            return;
                        }
                        next[key] = base + getProjectedCycleIncrease(key);
                    });
                    baselines.push({ level: userLevel + i, lifts: next });
                    LIFT_KEYS.forEach(key => {
                        predicted[key] = next[key];
                    });
                }

                const known = {};
                baselines.forEach(b => {
                    LIFT_KEYS.forEach(key => {
                        const value = (b.lifts && b.lifts[key]) || 0;
                        if (value > 0) {
                            known[key] = value;
                            b.lifts[key] = value;
                        } else if (known[key] != null) {
                            b.lifts[key] = known[key];
                        } else {
                            b.lifts[key] = null;
                        }
                    });
                });

                return baselines;
            }

            function buildProgressionChartData() {
                const baselines = buildTimelineBaselines();

                const includedPastLevels = baselines.findIndex(b => b.level === userLevel);
                const totalLevels = baselines.length;
                const totalSlots = totalLevels * CHART_SLOTS_PER_CYCLE;
                const dividerSlot = (includedPastLevels + 1) * CHART_SLOTS_PER_CYCLE;

                const labels = new Array(totalSlots).fill('');
                baselines.forEach((b, levelIdx) => {
                    for (let week = 1; week <= 4; week++) {
                        for (let day = 1; day <= 4; day++) {
                            const slot = levelIdx * CHART_SLOTS_PER_CYCLE + (week - 1) * 12 + (day - 1) * 3;
                            labels[slot] = `L${b.level} W${week} D${day}`;
                        }
                    }
                });

                const datasets = [];
                LIFT_KEYS.forEach(lift => {
                    const liftDay = CHART_LIFT_DAY[lift];
                    const hasLift = baselines.some(b => (b.lifts[lift] || 0) > 0);
                    if (!hasLift) return;

                    const values = new Array(totalSlots).fill(null);
                    baselines.forEach((b, levelIdx) => {
                        const base = b.lifts[lift];
                        if (!base || base <= 0) return;
                        const tm = round5(base * (tmPercentage / 100));
                        for (let week = 1; week <= 4; week++) {
                            const percentages = getLiftProgression(week, lift);
                            for (let setIdx = 0; setIdx < percentages.length; setIdx++) {
                                const slot = levelIdx * CHART_SLOTS_PER_CYCLE + (week - 1) * 12 + (liftDay - 1) * 3 + setIdx;
                                values[slot] = round5(tm * (percentages[setIdx] / 100));
                            }
                        }
                    });

                    datasets.push({
                        label: CHART_LIFT_NAMES[lift] || lift,
                        lift,
                        data: values,
                    });
                });

                return { labels, datasets, dividerSlot, baselines };
            }

            function getChartDatasetConfig(ds, liftColors) {
                return {
                    label: ds.label,
                    lift: ds.lift,
                    data: ds.data,
                    borderColor: liftColors[ds.lift],
                    backgroundColor: liftColors[ds.lift],
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    borderWidth: 1.5,
                    tension: 0.25,
                    fill: false,
                    spanGaps: false,
                    hidden: chartHiddenLifts[ds.lift] || false,
                    segment: {
                        borderDash: (ctx) => (ctx.p0DataIndex >= chartState.dividerSlot ? [6, 4] : undefined),
                    },
                };
            }

            function renderProgressionChart() {
                const canvas = document.getElementById('progression-chart');
                const wrap = document.querySelector('.progression-chart-wrap');
                const empty = document.getElementById('progression-chart-empty');

                if (typeof Chart === 'undefined') {
                    if (wrap) wrap.hidden = true;
                    if (empty) empty.hidden = false;
                    return;
                }

                const data = buildProgressionChartData();
                chartState = { dividerSlot: data.dividerSlot, baselines: data.baselines };
                const hasData = data.datasets.length > 0;

                if (wrap) wrap.hidden = !hasData;
                if (empty) empty.hidden = hasData;

                if (progressionChart) {
                    progressionChart.destroy();
                    progressionChart = null;
                }
                if (!hasData || !canvas) return;

                const ink = getChartCssVar('--ink', '#2c2416');
                const gridColor = chartHexToRgba(ink, 0.12);
                const liftColors = {
                    squat: getChartCssVar('--pencil', '#4a6741'),
                    bench: getChartCssVar('--accent', '#c0392b'),
                    deadlift: getChartCssVar('--success', '#3d6b4f'),
                    ohp: getChartCssVar('--pencil-dark', '#2d4228'),
                };

                let maxVal = 0;
                data.datasets.forEach(ds => {
                    ds.data.forEach(v => {
                        if (v != null && v > maxVal) maxVal = v;
                    });
                });
                const suggestedMax = maxVal > 0 ? Math.ceil(maxVal * 1.08) : undefined;

                const dividerPlugin = {
                    id: 'progressionPredictDivider',
                    afterDraw(chart) {
                        const { ctx, chartArea, scales } = chart;
                        if (!chartArea || !scales.x) return;
                        if (chartState.dividerSlot <= 0 || chartState.dividerSlot >= chart.data.labels.length) return;
                        const dividerX = chartArea.left
                            + (chartState.dividerSlot / chart.data.labels.length) * (chartArea.right - chartArea.left);
                        ctx.save();
                        ctx.fillStyle = chartHexToRgba(ink, 0.05);
                        ctx.fillRect(dividerX, chartArea.top, chartArea.right - dividerX, chartArea.bottom - chartArea.top);
                        ctx.strokeStyle = ink;
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(dividerX, chartArea.top);
                        ctx.lineTo(dividerX, chartArea.bottom);
                        ctx.stroke();
                        ctx.restore();
                    },
                };

                const config = {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: data.datasets.map(ds => getChartDatasetConfig(ds, liftColors)),
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: prefersReducedMotion() ? false : { duration: 400 },
                        interaction: {
                            mode: 'nearest',
                            axis: 'x',
                            intersect: false,
                        },
                        scales: {
                            x: {
                                type: 'category',
                                ticks: {
                                    autoSkip: true,
                                    maxRotation: 0,
                                    minRotation: 0,
                                    font: { size: 10 },
                                    color: ink,
                                },
                                grid: { color: gridColor },
                            },
                            y: {
                                ticks: {
                                    color: ink,
                                    callback: (value) => `${value} lbs`,
                                },
                                grid: { color: gridColor },
                                suggestedMax,
                            },
                        },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                onClick: (event, legendItem, legend) => {
                                    const chart = legend.chart;
                                    const dataset = chart.data.datasets[legendItem.datasetIndex];
                                    dataset.hidden = !dataset.hidden;
                                    chartHiddenLifts[dataset.lift] = dataset.hidden;
                                    chart.update();
                                },
                                labels: {
                                    color: ink,
                                    boxWidth: window.innerWidth < 768 ? 12 : 40,
                                },
                            },
                            tooltip: {
                                callbacks: {
                                    title(items) {
                                        if (!items.length) return '';
                                        const idx = items[0].dataIndex;
                                        const levelIdx = Math.floor(idx / CHART_SLOTS_PER_CYCLE);
                                        const within = idx % CHART_SLOTS_PER_CYCLE;
                                        const week = Math.floor(within / 12) + 1;
                                        const day = Math.floor((within % 12) / 3) + 1;
                                        const baseline = chartState.baselines[levelIdx];
                                        return `Level ${baseline ? baseline.level : '?'} · Week ${week} · Day ${day}`;
                                    },
                                    label(context) {
                                        const within = context.dataIndex % CHART_SLOTS_PER_CYCLE;
                                        const setIdx = ((within % 12) % 3) + 1;
                                        return `${context.dataset.label} Set ${setIdx}: ${context.parsed.y} lbs`;
                                    },
                                },
                            },
                        },
                    },
                    plugins: [dividerPlugin],
                };

                progressionChart = new Chart(canvas, config);
            }

            function updateProgressionChart() {
                if (!progressionChart) {
                    renderProgressionChart();
                    requestAnimationFrame(() => {
                        if (progressionChart && progressionChart.resize) {
                            progressionChart.resize();
                        }
                    });
                    return;
                }

                const data = buildProgressionChartData();
                chartState = { dividerSlot: data.dividerSlot, baselines: data.baselines };

                if (data.datasets.length === 0) {
                    progressionChart.destroy();
                    progressionChart = null;
                    const wrap = document.querySelector('.progression-chart-wrap');
                    const empty = document.getElementById('progression-chart-empty');
                    if (wrap) wrap.hidden = true;
                    if (empty) empty.hidden = false;
                    return;
                }

                const chart = progressionChart;
                chart.data.labels = data.labels;

                for (let i = chart.data.datasets.length - 1; i >= 0; i--) {
                    if (!data.datasets.some(d => d.lift === chart.data.datasets[i].lift)) {
                        chart.data.datasets.splice(i, 1);
                    }
                }

                const liftColors = {
                    squat: getChartCssVar('--pencil', '#4a6741'),
                    bench: getChartCssVar('--accent', '#c0392b'),
                    deadlift: getChartCssVar('--success', '#3d6b4f'),
                    ohp: getChartCssVar('--pencil-dark', '#2d4228'),
                };

                data.datasets.forEach(meta => {
                    let ds = chart.data.datasets.find(existing => existing.lift === meta.lift);
                    if (ds) {
                        ds.data = meta.data;
                    } else {
                        ds = getChartDatasetConfig(meta, liftColors);
                        chart.data.datasets.push(ds);
                    }
                    ds.hidden = chartHiddenLifts[meta.lift] || false;
                });

                chart.update();
                requestAnimationFrame(() => {
                    if (progressionChart && progressionChart.resize) {
                        progressionChart.resize();
                    }
                });
            }

            function scheduleProgressionChartUpdate() {
                if (chartUpdateTimeoutId) clearTimeout(chartUpdateTimeoutId);
                chartUpdateTimeoutId = setTimeout(() => {
                    chartUpdateTimeoutId = null;
                    updateProgressionChart();
                }, 200);
            }

            // ---------------- /Progression chart ----------------

            // Configuration objects
            const daysSetup = [
                { day: 1, main: "ohp", name: "Overhead Press Day" },
                { day: 2, main: "deadlift", name: "Deadlift Day" },
                { day: 3, main: "bench", name: "Bench Press Day" },
                { day: 4, main: "squat", name: "Squat Day" }
            ];

            const weekPercentages = {
                1: [
                    { reps: 5, percentage: 65 },
                    { reps: 5, percentage: 75 },
                    { reps: "5+", percentage: 85, amrap: true }
                ],
                2: [
                    { reps: 3, percentage: 70 },
                    { reps: 3, percentage: 80 },
                    { reps: "3+", percentage: 90, amrap: true }
                ],
                3: [
                    { reps: 5, percentage: 75 },
                    { reps: 3, percentage: 85 },
                    { reps: "1+", percentage: 95, amrap: true }
                ],
                4: [
                    { reps: 5, percentage: 40 },
                    { reps: 5, percentage: 50 },
                    { reps: 5, percentage: 60 }
                ]
            };

            const weekPercentages5sPro = {
                1: [
                    { reps: 5, percentage: 65 },
                    { reps: 5, percentage: 75 },
                    { reps: 5, percentage: 85 }
                ],
                2: [
                    { reps: 5, percentage: 70 },
                    { reps: 5, percentage: 80 },
                    { reps: 5, percentage: 90 }
                ],
                3: [
                    { reps: 5, percentage: 75 },
                    { reps: 5, percentage: 85 },
                    { reps: 5, percentage: 95 }
                ],
                4: [
                    { reps: 5, percentage: 40 },
                    { reps: 5, percentage: 50 },
                    { reps: 5, percentage: 60 }
                ]
            };

            function getLiftProgression(week, lift) {
                if (week === 4) {
                    return [40, 50, 60];
                }
                const isUpper = lift === 'bench' || lift === 'ohp';
                const delta = isUpper ? upperProgression : lowerProgression;
                const dayStep = isUpper ? upperDayStep : lowerDayStep;
                const defaultDelta = 5;
                const baseWeek1Set1 = maxWeek3Percentage
                    - (2 * defaultDelta + 2 * dayStep)
                    + (delta - defaultDelta);
                const weekOffset = week - 1;
                return [0, 1, 2].map(setIdx => {
                    const pct = baseWeek1Set1 + (delta * weekOffset) + (dayStep * setIdx);
                    return Math.min(Math.round(pct), maxWeek3Percentage);
                });
            }

            function getMainLiftSets(week, liftKey) {
                const isLeader = isForeverBbbLeaderPhase();
                if (isLeader && week !== 4) {
                    const pcts = getLiftProgression(week, liftKey);
                    return pcts.map(pct => ({ reps: 5, percentage: pct, amrap: false }));
                }
                const pcts = getLiftProgression(week, liftKey);
                const repSchemes = {
                    1: [5, 5, '5+'],
                    2: [3, 3, '3+'],
                    3: [5, 3, '1+']
                };
                const reps = repSchemes[week] || [5, 5, '5+'];
                return pcts.map((pct, idx) => ({
                    reps: reps[idx],
                    percentage: pct,
                    amrap: week !== 4
                }));
            }

            const coreOnlySuggestions = [
                'Ab Wheel', 'Hanging Leg Raises', 'Planks', 'Russian Twists', 'Sit-ups', 'Pallof Press'
            ];

            const foreverBbbPullExtras = ['Reverse Curls', 'Wrist Roller'];
            const foreverBbbCoreExtras = ['Standing Bag Kicks'];

            function updateWeekTabLabels() {
                for (let week = 1; week <= 4; week++) {
                    const tab = document.querySelector(`.week-tab[data-week="${week}"]`);
                    if (tab) {
                        tab.innerHTML = `Week ${week}`;
                    }
                }
                updateAllWeekCheckmarks();
            }

            const WORKOUT_NOTES_ITEMS = [
                'TM = Training Max',
                'AMRAP = As Many Reps As Possible (with good form)',
                '5s Pro: all working sets are 5 reps — stop with 1–2 reps in reserve (no AMRAP)',
                'Rest 2-3 minutes between main lift sets',
                'Rest 60-90 seconds between accessory sets',
                'Accessory work at 70-80% RPE — leave 2-3 reps in reserve',
                'Accessory work should be done at 70-80% RPE (Rate of Perceived Exertion)',
                'Leave 2-3 reps in reserve on accessory sets - focus on quality over max weight',
                'Increase weight only when you can complete all reps with good form',
                'On hard days, use the low end of assistance rep ranges (25 push, 25 pull, 0–15 core)',
                'Deload: no separate warm-up — work sets at 40/50/60% TM are your session (empty bar × 5–10 optional)',
                'Missed a day? Pick up where you left off',
                'Missed a week? Resume, repeat that week, or deload first',
                'Couldn\'t get all 5 on a main set? Stop — don\'t grind. If it keeps happening, lower that lift\'s TM ~10% in Program Setup',
                'BBB 5×10 too hard? Stay at 50% TM or cut sets until quality returns',
                'Struggling to hit prescribed AMRAP reps? Lower that lift\'s TM ~10% in Program Setup'
            ];

            const FORM_TIPS = {
                squat: {
                    items: [
                        'Toe Angle: point toes relatively straight forward — a slight 5–7 degree flare is acceptable',
                        'Tripod Foot: distribute weight evenly across three points — the heel, base of the big toe, and base of the little toe',
                        'Hip Hinge: initiate the movement by driving the hips back slightly and tilting the chest forward to engage the posterior chain',
                        'External Rotation Torque: root your feet into the floor, squeeze your glutes, and drive your knees outward so they track in line with your toes',
                        'Postural Integrity: keep a neutral spine and a locked core — descend until your thighs drop below parallel',
                        'The Ascent: drive through your heels to push straight up, ensuring your hips and chest rise at the exact same rate'
                    ]
                },
                bench: {
                    items: [
                        'The Setup: create a stable tripod by digging your upper traps and heels firmly into the ground while keeping your butt lightly grazing the bench',
                        'Lats Engagement: grip the bar tightly and try to physically "bend the bar" with your hands — this packs your shoulder blades back and down, engaging the lats',
                        'The Descent: unrack by pushing into the bar with 10–20% effort first to establish stability, then lower the bar with a slow, controlled negative to your lower sternum, keeping your elbows tucked at roughly a 45-degree angle',
                        'The Press: leg drive is initiated by pushing your heels into the floor, routing that force through your hamstrings and glutes into the upper body to propel the bar upward'
                    ]
                },
                deadlift: {
                    items: [
                        'The Setup: stand with feet inside shoulder width — position the bar directly over your mid-foot so it is touching or nearly touching your shins',
                        'The Wedge: hinge down to grab the bar, pull the "slack" out of the bar by pulling your chest up and lats down, and lengthen your arms to lock your upper back into slight thoracic extension',
                        'Floor to Knee (The Squat): push the floor away through your mid-foot — your hips and chest must rise simultaneously, maintaining the exact same back angle until the bar passes your knees',
                        'Knee to Lockout (The Hinge): once the bar clears your kneecaps, drive your hips forward and squeeze your glutes hard to stand up completely straight',
                        'The Descent: reverse the motion precisely — hinge at the hips first (like an RDL) until the bar clears your knees, then squat the weight down to the floor'
                    ]
                },
                ohp: {
                    items: [
                        'The Stance: stand with feet shoulder-width apart — grip the bar just outside your shoulders so your forearms remain perfectly vertical under the bar',
                        'The Front Rack: rest the bar on your front delts with your elbows pointing slightly forward, not flared out to the sides',
                        'The Core Brace: squeeze your glutes and brace your abs hard to lock your pelvis — this prevents your lower back from over-arching during the lift',
                        'The Bar Path: pull your chin back to clear a path, then press the bar straight up in a vertical line, keeping it over your mid-foot',
                        'The Lockout: push your head forward once the bar clears your forehead, lock your elbows out, and finish with your biceps by your ears'
                    ]
                }
            };

            const FORM_TIP_TITLES = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift', ohp: 'Overhead Press' };

            let formTipsModalLift = null;
            let formTipsModalIndex = 0;

            function getFormTips(mainLiftName) {
                const key = (mainLiftName || '').toLowerCase();
                return FORM_TIPS[key] || null;
            }

            function getFormTipItems(liftKey) {
                const tips = getFormTips(liftKey);
                return tips ? tips.items : null;
            }

            function renderFormTipModal() {
                const items = getFormTipItems(formTipsModalLift);
                const bodyEl = document.getElementById('form-tips-body');
                const counterEl = document.getElementById('form-tips-counter');
                const prevBtn = document.getElementById('form-tips-prev');
                const nextBtn = document.getElementById('form-tips-next');
                if (!items || !items.length) return;
                formTipsModalIndex = ((formTipsModalIndex % items.length) + items.length) % items.length;
                if (bodyEl) bodyEl.textContent = items[formTipsModalIndex];
                if (counterEl) counterEl.textContent = (formTipsModalIndex + 1) + ' of ' + items.length;
                if (prevBtn) prevBtn.disabled = items.length <= 1;
                if (nextBtn) nextBtn.disabled = items.length <= 1;
            }

            function openFormTipsModal(liftKey) {
                const items = getFormTipItems(liftKey);
                if (!items) return;
                formTipsModalLift = liftKey;
                formTipsModalIndex = 0;
                const titleEl = document.getElementById('form-tips-title');
                if (titleEl) titleEl.textContent = (FORM_TIP_TITLES[liftKey] || liftKey) + ' Form Tips';
                renderFormTipModal();
                const modal = document.getElementById('form-tips-modal');
                if (modal) modal.hidden = false;
            }

            function showPrevFormTip() {
                if (!formTipsModalLift) return;
                formTipsModalIndex--;
                renderFormTipModal();
            }

            function showNextFormTip() {
                if (!formTipsModalLift) return;
                formTipsModalIndex++;
                renderFormTipModal();
            }

            function hideFormTipsModal() {
                const modal = document.getElementById('form-tips-modal');
                if (modal) modal.hidden = true;
            }

            function openOtherTipsModal() {
                const modal = document.getElementById('other-tips-modal');
                const body = document.getElementById('other-tips-body');
                if (!modal || !body) return;
                body.innerHTML = WORKOUT_NOTES_ITEMS.map(item => `<li>${item}</li>`).join('');
                modal.hidden = false;
            }

            function closeOtherTipsModal() {
                const modal = document.getElementById('other-tips-modal');
                if (modal) modal.hidden = true;
            }

            window.openFormTipsModal = openFormTipsModal;
            window.openOtherTipsModal = openOtherTipsModal;

            const formTipsModal = document.getElementById('form-tips-modal');
            const closeFormTipsButton = document.getElementById('close-form-tips');
            if (closeFormTipsButton) {
                closeFormTipsButton.addEventListener('click', hideFormTipsModal);
            }
            const prevFormTipButton = document.getElementById('form-tips-prev');
            if (prevFormTipButton) {
                prevFormTipButton.addEventListener('click', showPrevFormTip);
            }
            const nextFormTipButton = document.getElementById('form-tips-next');
            if (nextFormTipButton) {
                nextFormTipButton.addEventListener('click', showNextFormTip);
            }
            if (formTipsModal) {
                formTipsModal.addEventListener('click', (e) => {
                    if (e.target === formTipsModal) hideFormTipsModal();
                });
            }
            const otherTipsModal = document.getElementById('other-tips-modal');
            const closeOtherTipsButton = document.getElementById('close-other-tips');
            if (closeOtherTipsButton) {
                closeOtherTipsButton.addEventListener('click', closeOtherTipsModal);
            }
            if (otherTipsModal) {
                otherTipsModal.addEventListener('click', (e) => {
                    if (e.target === otherTipsModal) closeOtherTipsModal();
                });
            }
            document.addEventListener('keydown', (e) => {
                if (formTipsModal && !formTipsModal.hidden) {
                    if (e.key === 'Escape') {
                        hideFormTipsModal();
                    } else if (e.key === 'ArrowLeft') {
                        showPrevFormTip();
                    } else if (e.key === 'ArrowRight') {
                        showNextFormTip();
                    }
                }
                if (otherTipsModal && !otherTipsModal.hidden) {
                    if (e.key === 'Escape') {
                        closeOtherTipsModal();
                    }
                }
            });

            function get1RMsFromInputs() {
                const lifts = {};
                LIFT_KEYS.forEach(key => {
                    lifts[key] = parseFloat(document.getElementById(`${key}-1rm`).value) || 0;
                });
                return lifts;
            }

            function getLocalDateString() {
                const d = new Date();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${d.getFullYear()}-${month}-${day}`;
            }

            const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

            function formatCompletionDate(dateStr) {
                if (!dateStr) return '';
                const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
                if (!match) return dateStr;
                const monthIndex = parseInt(match[2], 10) - 1;
                const dayNum = parseInt(match[3], 10);
                if (monthIndex < 0 || monthIndex > 11 || dayNum < 1 || dayNum > 31) return dateStr;
                return `${MONTHS[monthIndex]} ${dayNum}`;
            }

            function getDayCompletionDate(week, day) {
                const value = checkedDays[week] && checkedDays[week][day];
                return value && typeof value === 'string' ? value : '';
            }

            function getFullCompletionLabel(dateStr) {
                if (!dateStr) return '';
                const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
                if (!match) return '';
                const year = parseInt(match[1], 10);
                const monthIndex = parseInt(match[2], 10) - 1;
                const dayNum = parseInt(match[3], 10);
                if (monthIndex < 0 || monthIndex >= 11 || dayNum < 1 || dayNum > 31) return '';
                return `Completed ${MONTHS[monthIndex]} ${dayNum}, ${year}`;
            }

            function setDayTabCompletion(dayTab, dateStr) {
                if (!dayTab) return;
                if (dateStr) {
                    dayTab.classList.add('checked');
                    let dateSpan = dayTab.querySelector('.day-completion-date');
                    if (!dateSpan) {
                        dateSpan = document.createElement('span');
                        dateSpan.className = 'day-completion-date';
                        dayTab.appendChild(dateSpan);
                    }
                    dateSpan.textContent = formatCompletionDate(dateStr);
                    dayTab.dataset.completedDate = dateStr;
                    dayTab.title = getFullCompletionLabel(dateStr);
                } else {
                    dayTab.classList.remove('checked');
                    const dateSpan = dayTab.querySelector('.day-completion-date');
                    if (dateSpan) {
                        dateSpan.remove();
                    }
                    delete dayTab.dataset.completedDate;
                    dayTab.title = '';
                }
            }

            const STANDARD_UPPER_INC_LBS = 5;
            const STANDARD_LOWER_INC_LBS = 10;

            function getStandardIncrement(exercise) {
                return (exercise === 'bench' || exercise === 'ohp') ? STANDARD_UPPER_INC_LBS : STANDARD_LOWER_INC_LBS;
            }

            function getProjectedCycleIncrease(exercise) {
                return (exercise === 'bench' || exercise === 'ohp') ? upperCycleIncrease : lowerCycleIncrease;
            }

            function getAmrapDecisionKey(exercise) {
                const amrap = amrapResults[exercise];
                if (!amrap) return null;
                if (['earned', 'smart', 'aggressive', 'decrease'].includes(amrap.decision)) {
                    return amrap.decision;
                }
                const legacy = amrap.decisionText || amrap.decision || '';
                if (legacy.includes('Earned')) return 'earned';
                if (legacy.includes('Smart')) return 'smart';
                if (legacy.includes('Aggressive')) return 'aggressive';
                if (legacy.includes('Decrease')) return 'decrease';
                return null;
            }

            function computeProposed1RM(exercise, old1RM) {
                if (old1RM <= 0) return 0;
                const decision = getAmrapDecisionKey(exercise);
                if (decision) {
                    switch (decision) {
                        case 'earned':
                        case 'aggressive':
                            return old1RM + getStandardIncrement(exercise);
                        case 'smart':
                            return old1RM;
                        case 'decrease':
                            return Math.round(old1RM * 0.9);
                    }
                }
                return old1RM + getStandardIncrement(exercise);
            }

            function formatDeltaDiff(diff) {
                if (diff === 0) return '0 lbs';
                if (diff > 0) return `+${diff} lbs`;
                return `${diff} lbs`;
            }

            function format1RMDelta(oldVal, newVal) {
                return formatDeltaDiff(newVal - oldVal);
            }

            function getDeltaClass(oldVal, newVal) {
                const diff = newVal - oldVal;
                if (diff > 0) return 'delta-positive';
                if (diff < 0) return 'delta-negative';
                return 'delta-zero';
            }

            function cancelLevelUpDeltaAnimations() {
                levelUpDeltaAnimHandles.forEach(handle => {
                    if (handle.timeoutId != null) clearTimeout(handle.timeoutId);
                    if (handle.rafId != null) cancelAnimationFrame(handle.rafId);
                });
                levelUpDeltaAnimHandles = [];
            }

            function prefersReducedMotion() {
                return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            }

            function setLevelUpDeltaDisplay(deltaEl, oldVal, newVal, diff) {
                deltaEl.textContent = formatDeltaDiff(diff);
                deltaEl.className = `level-up-delta ${getDeltaClass(oldVal, newVal)}`;
            }

            function animateLevelUpReviewDeltas() {
                cancelLevelUpDeltaAnimations();

                if (prefersReducedMotion()) {
                    updateLevelUpReviewDeltas();
                    return;
                }

                const rows = [...document.querySelectorAll('.level-up-row:not([hidden])')];

                requestAnimationFrame(() => {
                    rows.forEach((row, index) => {
                        const lift = row.dataset.lift;
                        const oldVal = levelUpReviewOld1RMs[lift] || 0;
                        const input = row.querySelector('.level-up-new-input');
                        const deltaEl = row.querySelector('.level-up-delta');
                        if (!input || !deltaEl || oldVal <= 0) return;

                        const newVal = parseFloat(input.value) || 0;
                        const targetDiff = newVal - oldVal;
                        setLevelUpDeltaDisplay(deltaEl, oldVal, newVal, 0);
                        deltaEl.classList.remove('level-up-delta-landed');

                        const handle = { timeoutId: null, rafId: null };
                        levelUpDeltaAnimHandles.push(handle);

                        handle.timeoutId = setTimeout(() => {
                            handle.timeoutId = null;
                            const startTime = performance.now();

                            function tick(now) {
                                const progress = Math.min(1, (now - startTime) / LEVEL_UP_DELTA_DURATION_MS);
                                const eased = 1 - Math.pow(1 - progress, 3);
                                const currentDiff = Math.round(targetDiff * eased);
                                setLevelUpDeltaDisplay(deltaEl, oldVal, newVal, currentDiff);

                                if (progress < 1) {
                                    handle.rafId = requestAnimationFrame(tick);
                                } else {
                                    handle.rafId = null;
                                    setLevelUpDeltaDisplay(deltaEl, oldVal, newVal, targetDiff);
                                    deltaEl.classList.add('level-up-delta-landed');
                                }
                            }

                            handle.rafId = requestAnimationFrame(tick);
                        }, index * LEVEL_UP_DELTA_STAGGER_MS);
                    });
                });
            }

            function getLevelUpReviewContextText() {
                if (isForeverBbbAnchorPhase()) {
                    return 'Anchor cycle — based on Week 3 AMRAP decisions';
                }
                if (isForeverBbbLeaderPhase()) {
                    return `Leader cycle — standard increases (+${STANDARD_UPPER_INC_LBS} upper, +${STANDARD_LOWER_INC_LBS} lower)`;
                }
                const hasAmrap = LIFT_KEYS.some(key => getAmrapDecisionKey(key));
                if (hasAmrap) {
                    return 'Based on Week 3 AMRAP decisions';
                }
                return `Standard increases (+${STANDARD_UPPER_INC_LBS} upper, +${STANDARD_LOWER_INC_LBS} lower)`;
            }

            function updateLevelUpReviewDeltas() {
                cancelLevelUpDeltaAnimations();
                document.querySelectorAll('.level-up-row').forEach(row => {
                    const lift = row.dataset.lift;
                    const oldVal = levelUpReviewOld1RMs[lift] || 0;
                    const input = row.querySelector('.level-up-new-input');
                    const deltaEl = row.querySelector('.level-up-delta');
                    if (!input || !deltaEl || oldVal <= 0) return;
                    const newVal = parseFloat(input.value) || 0;
                    deltaEl.classList.remove('level-up-delta-landed');
                    setLevelUpDeltaDisplay(deltaEl, oldVal, newVal, newVal - oldVal);
                });
            }

            function populateLevelUpReviewRows(animateDeltas = false) {
                const contextEl = document.getElementById('level-up-review-context');
                if (contextEl) {
                    contextEl.textContent = getLevelUpReviewContextText();
                }
                document.querySelectorAll('.level-up-row').forEach(row => {
                    const lift = row.dataset.lift;
                    const oldVal = levelUpReviewOld1RMs[lift] || 0;
                    const oldEl = row.querySelector('.level-up-old-value');
                    const input = row.querySelector('.level-up-new-input');
                    if (oldVal <= 0) {
                        row.hidden = true;
                        return;
                    }
                    row.hidden = false;
                    if (oldEl) oldEl.textContent = `${oldVal} lbs`;
                    if (input) input.value = computeProposed1RM(lift, oldVal);
                });
                if (animateDeltas && !levelUpReviewDeltasAnimated) {
                    animateLevelUpReviewDeltas();
                    levelUpReviewDeltasAnimated = true;
                } else {
                    updateLevelUpReviewDeltas();
                }
            }

            function ensureLevelUpReviewVisible() {
                inputSection.classList.add('level-up-review-active');
                const reviewEl = document.getElementById('level-up-review');
                const cancelBtn = document.getElementById('cancel-level-up');
                if (reviewEl) reviewEl.hidden = false;
                if (cancelBtn) cancelBtn.hidden = false;
                if (saveButton) saveButton.textContent = SAVE_BUTTON_LEVEL_UP_TEXT;
            }

            function enterLevelUpReviewMode({ animateDeltas = false } = {}) {
                levelUpReviewActive = true;
                ensureLevelUpReviewVisible();
                populateLevelUpReviewRows(animateDeltas);
            }

            function exitLevelUpReviewMode() {
                cancelLevelUpDeltaAnimations();
                levelUpReviewActive = false;
                levelUpReviewOld1RMs = {};
                levelUpReviewDeltasAnimated = false;
                inputSection.classList.remove('level-up-review-active');
                const reviewEl = document.getElementById('level-up-review');
                const cancelBtn = document.getElementById('cancel-level-up');
                if (reviewEl) reviewEl.hidden = true;
                if (cancelBtn) cancelBtn.hidden = true;
                if (saveButton) saveButton.textContent = SAVE_BUTTON_DEFAULT_TEXT;
            }

            function readLevelUpReviewNew1RMs() {
                const lifts = {};
                document.querySelectorAll('.level-up-row').forEach(row => {
                    if (row.hidden) return;
                    const lift = row.dataset.lift;
                    const input = row.querySelector('.level-up-new-input');
                    lifts[lift] = parseFloat(input?.value) || 0;
                });
                return lifts;
            }

            function collectAmrapDecisionsForHistory() {
                const decisions = {};
                LIFT_KEYS.forEach(key => {
                    const decision = getAmrapDecisionKey(key);
                    if (decision) {
                        decisions[key] = decision;
                    }
                });
                return decisions;
            }

            function build1RMHistoryEntry(source, newLifts, previousLifts, extra = {}) {
                const lifts = {};
                const previous = {};
                const deltas = {};
                LIFT_KEYS.forEach(key => {
                    const n = newLifts[key] || 0;
                    const p = previousLifts[key] || 0;
                    if (n > 0) {
                        lifts[key] = n;
                        if (p > 0) previous[key] = p;
                        deltas[key] = n - p;
                    }
                });
                const entry = {
                    ts: Date.now(),
                    date: getLocalDateString(),
                    source,
                    cycleLevel: extra.cycleLevel ?? userLevel,
                    accessoryTemplate,
                    bbbForeverPhase: accessoryTemplate === 'bbb-forever' ? bbbForeverPhase : null,
                    lifts,
                    previousLifts: previous,
                    deltas,
                };
                if (extra.amrapDecisions && Object.keys(extra.amrapDecisions).length > 0) {
                    entry.amrapDecisions = extra.amrapDecisions;
                }
                return entry;
            }

            function append1RMHistory(source, newLifts, previousLifts, extra = {}) {
                RadiantStorage.workout.appendStrength1RMHistoryEntry(
                    build1RMHistoryEntry(source, newLifts, previousLifts, extra)
                );
            }

            function getPreviousLiftsFromHistory() {
                const history = RadiantStorage.workout.getStrength1RMHistory();
                if (history.length === 0) return {};
                return { ...(history[history.length - 1].lifts || {}) };
            }

            function liftsDifferFromLastHistory(newLifts) {
                const history = RadiantStorage.workout.getStrength1RMHistory();
                if (history.length === 0) return true;
                const last = history[history.length - 1];
                return LIFT_KEYS.some(key => (newLifts[key] || 0) !== (last.lifts?.[key] || 0));
            }

            function maybeAppendManualSaveHistory(newLifts) {
                if (!liftsDifferFromLastHistory(newLifts)) return;
                append1RMHistory('manual-save', newLifts, getPreviousLiftsFromHistory(), {
                    cycleLevel: userLevel,
                });
            }

            function startLevelUpReview() {
                if (!areAllAmrapSetsLogged()) {
                    alert('Please log your Week 3 AMRAP performance for all exercises before leveling up.\n\nGo to Week 3, complete your 1+ sets, and log your results.');
                    return;
                }
                levelUpReviewOld1RMs = get1RMsFromInputs();
                setActiveMainTab('setup');
                enterLevelUpReviewMode({ animateDeltas: true });
            }

            function cancelLevelUpReview() {
                exitLevelUpReviewMode();
            }

            function confirmLevelUp() {
                const newLifts = readLevelUpReviewNew1RMs();
                const hasAnyLift = LIFT_KEYS.some(key => (newLifts[key] || 0) > 0);
                if (!hasAnyLift) {
                    alert('Please enter at least one 1RM value.');
                    return;
                }

                const previousLifts = { ...levelUpReviewOld1RMs };
                LIFT_KEYS.forEach(key => {
                    const el = document.getElementById(`${key}-1rm`);
                    if (!el) return;
                    if (newLifts[key] > 0) {
                        el.value = newLifts[key];
                    }
                });

                userLevel++;
                append1RMHistory('level-up', newLifts, previousLifts, {
                    cycleLevel: userLevel,
                    amrapDecisions: collectAmrapDecisionsForHistory(),
                });

                const phaseTransition = handleBbbForeverPhaseTransition();
                updateLevelDisplay();
                updateBbbTemplateHelper();
                updateProgressionGuide();

                amrapResults = {};
                checkedDays = {};
                completedTimers = {};
                currentWeek = 1;
                currentDay = 0;

                generateWorkoutPlan();
                updateWeekTabLabels();
                weekTabs.forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.week === '1');
                });

                exitLevelUpReviewMode();
                setActiveMainTab('workout');
                saveProfile();
                updateProgressionChart();

                let phaseMessage = '';
                if (phaseTransition === 'started-anchor') {
                    phaseMessage = ' You\'re now on an Anchor cycle — log Week 3 AMRAP sets to guide progression.';
                } else if (phaseTransition === 'returned-leader') {
                    phaseMessage = ' You\'re back on Forever BBB leader cycles.';
                } else if (phaseTransition === 'leader-continued') {
                    phaseMessage = ' Staying on leader phase for another block.';
                } else if (phaseTransition === 'anchor-continued') {
                    phaseMessage = ' Running another anchor cycle.';
                }
                alert(`Congratulations! You've leveled up to Level ${userLevel}! Your lift weights have been updated and a new cycle has been generated.${phaseMessage}`);
            }

            function levelUp() {
                startLevelUpReview();
            }

            function usesForeverBbbMainWork() {
                return isForeverBbbLeaderPhase();
            }

            function skipsAmrapGate() {
                return isForeverBbbLeaderPhase();
            }

            const accessoryExercises = {
                standard: {
                    ohp: {
                        push: ["Dips", "Incline Dumbbell Press", "Pushups", "Dumbbell Press"],
                        pull: ["Chin-ups", "Barbell Rows", "Face Pulls", "Cable Rows"],
                        core: ["Ab Wheel", "Hanging Leg Raises", "Planks", "Russian Twists"]
                    },
                    deadlift: {
                        push: ["Push-ups", "Dumbbell Bench Press", "Dips", "Incline Press"],
                        pull: ["Lat Pulldowns", "Face Pulls", "Dumbbell Rows", "Pull-ups"],
                        legs: ["Bulgarian Split Squats", "Lunges", "Leg Curls", "Step-ups"]
                    },
                    bench: {
                        push: ["Close-grip Bench", "Tricep Extensions", "Dips", "Dumbbell Press"],
                        pull: ["Barbell Rows", "Pull-ups", "Face Pulls", "Cable Rows"],
                        core: ["Russian Twists", "Sit-ups", "Planks", "Ab Wheel"]
                    },
                    squat: {
                        push: ["Shoulder Press", "Push-ups", "Tricep Extensions", "Dips"],
                        pull: ["Cable Rows", "Bicep Curls", "Lat Pulldowns", "Face Pulls"],
                        legs: ["Lunges", "Leg Raises", "Glute Bridges", "Bulgarian Split Squats"]
                    }
                },
                bbb: {
                    ohp: { main: "OHP", secondary: "Bench Press" },
                    deadlift: { main: "Deadlift", secondary: "Squat" },
                    bench: { main: "Bench Press", secondary: "OHP" },
                    squat: { main: "Squat", secondary: "Deadlift" }
                },
                fsl: {
                    ohp: { main: "OHP", accessories: ["Dips", "Rows", "Ab Work"] },
                    deadlift: { main: "Deadlift", accessories: ["Leg Curls", "Pulldowns", "Planks"] },
                    bench: { main: "Bench Press", accessories: ["Triceps", "Pull-ups", "Core"] },
                    squat: { main: "Squat", accessories: ["Lunges", "Rows", "Ab Work"] }
                },
                triumvirate: {
                    ohp: {
                        accessories: [
                            { name: "Dips", sets: 5, reps: "10-15" },
                            { name: "Chin-ups", sets: 5, reps: "10-15" }
                        ]
                    },
                    deadlift: {
                        accessories: [
                            { name: "Hanging Leg Raises", sets: 5, reps: "10-15" },
                            { name: "Good Mornings", sets: 5, reps: "10-15" }
                        ]
                    },
                    bench: {
                        accessories: [
                            { name: "Dumbbell Rows", sets: 5, reps: "10-15" },
                            { name: "Incline Dumbbell Press", sets: 5, reps: "10-15" }
                        ]
                    },
                    squat: {
                        accessories: [
                            { name: "Leg Curls", sets: 5, reps: "10-15" },
                            { name: "Ab Wheel", sets: 5, reps: "10-15" }
                        ]
                    }
                },
                beginners: {
                    ohp: {
                        mainFSL: true,
                        accessories: {
                            push: ["Dips", "Push-ups", "Dumbbell Bench", "Incline Press"],
                            pull: ["Chin-ups", "Barbell Rows", "Face Pulls", "Cable Rows"],
                            legs: ["Ab Wheel", "Hanging Leg Raises", "Planks", "Russian Twists"]
                        }
                    },
                    deadlift: {
                        mainFSL: true,
                        accessories: {
                            push: ["Push-ups", "Dips", "Tricep Extensions", "Dumbbell Press"],
                            pull: ["Pull-ups", "Inverted Rows", "Face Pulls", "Lat Pulldowns"],
                            legs: ["Lunges", "Step-ups", "Ab Work", "Bulgarian Split Squats"]
                        }
                    },
                    bench: {
                        mainFSL: true,
                        accessories: {
                            push: ["Dips", "Incline Press", "Lateral Raises", "Close-grip Bench"],
                            pull: ["Pull-ups", "DB Rows", "Face Pulls", "Barbell Rows"],
                            legs: ["Hanging Leg Raises", "Ab Wheel", "Planks", "Sit-ups"]
                        }
                    },
                    squat: {
                        mainFSL: true,
                        accessories: {
                            push: ["Dips", "Push-ups", "DB Press", "Shoulder Press"],
                            pull: ["Pull-ups", "Barbell Rows", "Face Pulls", "Bicep Curls"],
                            legs: ["Leg Curls", "Back Raises", "Ab Work", "Glute Bridges"]
                        }
                    }
                }
            };

            // DOM elements — support legacy cached HTML that still has #generate-button
            const saveButton = document.getElementById('save-button') || document.getElementById('generate-button');
            const weekTabs = document.querySelectorAll('.week-tab');
            const mainTabs = document.querySelectorAll('.main-tab');
            const inputSection = document.querySelector('.input-section');
            const resultSection = document.querySelector('.result-section');
            const tmOptions = document.querySelectorAll('.toggle-option');
            const accessorySelect = document.getElementById('accessory-template');
            const levelDisplay = document.getElementById('level-display');
            levelDisplay.addEventListener('click', (e) => {
                const link = e.target.closest('.phase-hint-link');
                if (link) {
                    e.stopPropagation();
                    togglePhaseHintPopover(link, getPhaseHintText(link.dataset.phase));
                }
            });
            levelDisplay.addEventListener('keydown', (e) => {
                const link = e.target.closest('.phase-hint-link');
                if (link && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    togglePhaseHintPopover(link, getPhaseHintText(link.dataset.phase));
                }
            });
            const exitWorkoutModeButton = document.getElementById('exit-workout-mode');
            const workoutModeBar = document.getElementById('workout-mode-bar');
            const workoutModeTitle = document.getElementById('workout-mode-title');

            function setActiveMainTab(tabType) {
                mainTabs.forEach(t => {
                    t.classList.toggle('active', t.dataset.tab === tabType);
                });
                if (tabType === 'setup') {
                    inputSection.classList.add('active');
                    resultSection.classList.remove('active');
                    if (levelUpReviewActive) {
                        ensureLevelUpReviewVisible();
                    }
                    updateProgressionChart();
                } else {
                    inputSection.classList.remove('active');
                    resultSection.classList.add('active');
                }
            }

            function renderWorkoutItem(timerType, timerId, label, detail, options = {}) {
                const classes = ['workout-item'];
                if (options.amrap) classes.push('amrap');
                if (options.extraClass) classes.push(options.extraClass);
                const suggestionsHtml = options.suggestions?.length
                    ? `<span class="workout-item-suggestions"><em>Suggestions:</em> ${options.suggestions.join(', ')}</span>`
                    : '';
                const noteHtml = options.note
                    ? `<span class="workout-item-suggestions"><em>${options.note}</em></span>`
                    : '';
                const notesBlock = suggestionsHtml || noteHtml
                    ? `<div class="set-detail-notes">${suggestionsHtml}${noteHtml}</div>`
                    : '';

                if (options.setDetail) {
                    const { reps, weight, percentage, amrap } = options.setDetail;
                    const repText = amrap
                        ? `${reps} AMRAP`
                        : `${reps} reps`;
                    classes.push('workout-item-set-row');
                    return `
                    <div class="${classes.join(' ')}">
                        <span class="set-detail-set workout-item-label">${label}</span>
                        <span class="set-detail-cell set-detail-reps">${repText}</span>
                        <span class="set-detail-cell set-detail-weight">${weight} Lbs</span>
                        <span class="set-detail-cell set-detail-tm">${percentage}% TM</span>
                        <button type="button" class="rest-timer-btn set-detail-timer" data-timer-type="${timerType}" data-timer-id="${timerId}" title="Start rest timer">⏰</button>
                        ${notesBlock}
                    </div>`;
                }

                return `
                    <div class="${classes.join(' ')}">
                        <div class="workout-item-body">
                            <span class="workout-item-label">${label}</span>
                            <span class="workout-item-detail">${detail}</span>
                            ${suggestionsHtml}${noteHtml}
                        </div>
                        <button type="button" class="rest-timer-btn" data-timer-type="${timerType}" data-timer-id="${timerId}" title="Start rest timer">⏰</button>
                    </div>`;
            }

            function getOrderedTimerButtonsForActiveDay() {
                const activeDay = document.querySelector('.week-content.active .day-content.active');
                if (!activeDay) return [];
                return Array.from(activeDay.querySelectorAll('.rest-timer-btn'));
            }

            function scrollToWorkoutItem(element) {
                if (!element) return;
                element.classList.add('workout-item-focus');
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => element.classList.remove('workout-item-focus'), 2500);
            }

            function scrollToFirstIncompleteItem() {
                const buttons = getOrderedTimerButtonsForActiveDay();
                const next = buttons.find(btn => !btn.classList.contains('complete'));
                const target = next
                    ? next.closest('.workout-item')
                    : buttons[0]?.closest('.workout-item');
                scrollToWorkoutItem(target);
            }

            function scrollToNextWorkoutItem(completedTimerId) {
                if (!workoutModeActive) return;
                const buttons = getOrderedTimerButtonsForActiveDay();
                const currentIndex = buttons.findIndex(btn => btn.dataset.timerId === completedTimerId);
                if (currentIndex === -1) return;
                for (let i = currentIndex + 1; i < buttons.length; i++) {
                    const item = buttons[i].closest('.workout-item');
                    if (item) {
                        scrollToWorkoutItem(item);
                        return;
                    }
                }
            }

            function updateWorkoutModeTitle() {
                if (!workoutModeTitle) return;
                const day = workoutPlan.weeks?.[currentWeek]?.[currentDay];
                workoutModeTitle.textContent = day
                    ? `Week ${currentWeek} · ${day.name}`
                    : 'Workout';
            }

            function enterWorkoutMode(week, dayIndex) {
                if (!workoutPlan.weeks || Object.keys(workoutPlan.weeks).length === 0) return;
                currentWeek = week;
                currentDay = dayIndex;
                showWeekContent(week, dayIndex);
                workoutModeActive = true;
                document.body.classList.add('workout-mode');
                if (workoutModeBar) workoutModeBar.style.display = 'flex';
                setActiveMainTab('workout');
                updateWorkoutModeTitle();
                requestAnimationFrame(() => scrollToFirstIncompleteItem());
            }

            function exitWorkoutMode() {
                workoutModeActive = false;
                document.body.classList.remove('workout-mode');
                if (workoutModeBar) workoutModeBar.style.display = 'none';
            }

            if (exitWorkoutModeButton) {
                exitWorkoutModeButton.addEventListener('click', exitWorkoutMode);
            }

            document.addEventListener('click', function(e) {
                const beginBtn = e.target.closest('.begin-workout-btn');
                if (beginBtn) {
                    enterWorkoutMode(
                        parseInt(beginBtn.dataset.week, 10),
                        parseInt(beginBtn.dataset.day, 10)
                    );
                    return;
                }

                const completeExitBtn = e.target.closest('.complete-exit-workout-btn');
                if (completeExitBtn) {
                    exitWorkoutMode();
                    return;
                }

                const resetBtn = e.target.closest('.reset-day-btn');
                if (!resetBtn) return;
                const week = parseInt(resetBtn.dataset.week, 10);
                const dayIndex = parseInt(resetBtn.dataset.day, 10);
                const day = workoutPlan.weeks?.[week]?.[dayIndex];
                if (!day) return;
                if (!confirm(`Reset all checkmarks for Week ${week}, ${day.name}?`)) return;
                resetDayCheckmarks(week, dayIndex);
            });

            // Main tab switching (for mobile)
            mainTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    setActiveMainTab(tab.dataset.tab);
                });
            });
            
            // Quiz elements
            const quizButton = document.getElementById('quiz-button');
            const quizModal = document.getElementById('quiz-modal');
            const closeQuiz = document.getElementById('close-quiz');
            const questionText = document.getElementById('question-text');
            const questionContent = document.getElementById('question-content');
            const quizOptions = document.getElementById('quiz-options');
            const progressFill = document.getElementById('progress-fill');
            const progressText = document.getElementById('progress-text');
            const prevButton = document.getElementById('prev-question');
            const nextButton = document.getElementById('next-question');
            
            // Quiz data and state
            let currentQuestion = 0;
            let quizAnswers = [];
            
            const quizData = [
                {
                    question: "What's your primary training goal?",
                    options: [
                        { text: "Build muscle mass and size", scores: { 'bbb-forever': 6, standard: 2, fsl: 1, triumvirate: 1, beginners: 1 } },
                        { text: "Increase strength and power", scores: { fsl: 3, standard: 2, 'bbb-forever': 1, triumvirate: 2, beginners: 2 } },
                        { text: "General fitness and conditioning", scores: { standard: 3, triumvirate: 2, fsl: 1, 'bbb-forever': 2, beginners: 2 } },
                        { text: "I'm new to Strength and need structure", scores: { beginners: 3, standard: 2, fsl: 1, 'bbb-forever': 1, triumvirate: 1 } }
                    ]
                },
                {
                    question: "How much time do you have for accessory work?",
                    options: [
                        { text: "30+ minutes - I want maximum volume", scores: { 'bbb-forever': 6, beginners: 2, standard: 2, fsl: 1, triumvirate: 1 } },
                        { text: "20-30 minutes - moderate volume", scores: { standard: 3, fsl: 2, triumvirate: 2, 'bbb-forever': 3, beginners: 1 } },
                        { text: "15-20 minutes - focused work", scores: { triumvirate: 3, fsl: 2, standard: 1, 'bbb-forever': 2, beginners: 1 } },
                        { text: "10-15 minutes - minimal but effective", scores: { fsl: 3, triumvirate: 2, standard: 1, 'bbb-forever': 1, beginners: 1 } }
                    ]
                },
                {
                    question: "What's your experience level with Strength?",
                    options: [
                        { text: "Complete beginner to Strength", scores: { beginners: 3, standard: 2, fsl: 1, 'bbb-forever': 1, triumvirate: 1 } },
                        { text: "Some experience, still learning", scores: { standard: 3, fsl: 2, beginners: 2, 'bbb-forever': 2, triumvirate: 1 } },
                        { text: "Intermediate - comfortable with the program", scores: { fsl: 3, 'bbb-forever': 4, standard: 2, triumvirate: 2, beginners: 1 } },
                        { text: "Advanced - ready for challenging variations", scores: { 'bbb-forever': 5, fsl: 2, triumvirate: 2, standard: 1, beginners: 1 } }
                    ]
                },
                {
                    question: "How do you prefer to structure your accessory work?",
                    options: [
                        { text: "Same movement as main lift (more volume)", scores: { 'bbb-forever': 6, fsl: 2, standard: 1, triumvirate: 1, beginners: 1 } },
                        { text: "Related movements at same intensity", scores: { fsl: 3, standard: 2, 'bbb-forever': 2, triumvirate: 1, beginners: 2 } },
                        { text: "Variety of movements for balance", scores: { standard: 3, 'bbb-forever': 3, triumvirate: 2, fsl: 1, beginners: 2 } },
                        { text: "Minimal, focused movements", scores: { triumvirate: 3, fsl: 2, standard: 1, 'bbb-forever': 1, beginners: 1 } }
                    ]
                },
                {
                    question: "What's your recovery capacity?",
                    options: [
                        { text: "Excellent - I recover quickly", scores: { 'bbb-forever': 5, beginners: 2, standard: 2, fsl: 1, triumvirate: 1 } },
                        { text: "Good - moderate volume works well", scores: { standard: 3, fsl: 2, triumvirate: 2, 'bbb-forever': 3, beginners: 1 } },
                        { text: "Average - need to manage fatigue", scores: { fsl: 3, 'bbb-forever': 4, triumvirate: 2, standard: 2, beginners: 1 } },
                        { text: "Limited - prefer lower volume", scores: { triumvirate: 3, fsl: 2, standard: 1, 'bbb-forever': 2, beginners: 1 } }
                    ]
                }
            ];
            
            function handleSave1RMs() {
                const newLifts = get1RMsFromInputs();

                if (newLifts.squat === 0 && newLifts.bench === 0 && newLifts.deadlift === 0 && newLifts.ohp === 0) {
                    alert('Please enter at least one 1RM value.');
                    return;
                }

                const isFirstSave = !hasWorkoutPlan();

                if (!isFirstSave && !confirm('Save your 1RM values and update your workout plan?')) {
                    return;
                }

                try {
                    generateWorkoutPlan({ navigateToStart: isFirstSave });
                    updateBbbWeightPreview();
                    maybeAppendManualSaveHistory(newLifts);
                    saveProfile();

                    if (isFirstSave) {
                        setTimeout(() => {
                            currentWeek = 1;
                            currentDay = 0;
                            weekTabs.forEach(tab => {
                                tab.classList.toggle('active', tab.dataset.week === '1');
                            });
                            showWeekContent(1, 0);
                            setActiveMainTab('workout');
                            showFirstPlanCongratulations();
                        }, 0);
                    } else {
                        alert('Workout plan saved.');
                    }
                } catch (err) {
                    logStrengthError('handleSave1RMs', err.message, {});
                    console.error('Save failed:', err);
                    alert('Could not save workout plan. Try refreshing the page.');
                }
            }

            const firstPlanModal = document.getElementById('first-plan-modal');
            const closeFirstPlanButton = document.getElementById('close-first-plan');

            function showFirstPlanCongratulations() {
                if (!firstPlanModal) return;
                firstPlanModal.hidden = false;
            }

            function hideFirstPlanCongratulations() {
                if (!firstPlanModal) return;
                firstPlanModal.hidden = true;
            }

            if (closeFirstPlanButton) {
                closeFirstPlanButton.addEventListener('click', hideFirstPlanCongratulations);
            }

            if (firstPlanModal) {
                firstPlanModal.addEventListener('click', (e) => {
                    if (e.target === firstPlanModal) {
                        hideFirstPlanCongratulations();
                    }
                });
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && firstPlanModal && !firstPlanModal.hidden) {
                    hideFirstPlanCongratulations();
                }
            });

            function handleSaveButtonClick() {
                if (levelUpReviewActive) {
                    confirmLevelUp();
                } else {
                    handleSave1RMs();
                }
            }

            // Event listeners
            if (saveButton) {
                saveButton.addEventListener('click', handleSaveButtonClick);
            } else {
                logStrengthError('init', 'No save or generate button found in DOM', {});
            }

            const cancelLevelUpButton = document.getElementById('cancel-level-up');
            if (cancelLevelUpButton) {
                cancelLevelUpButton.addEventListener('click', cancelLevelUpReview);
            }

            const levelUpReviewEl = document.getElementById('level-up-review');
            if (levelUpReviewEl) {
                levelUpReviewEl.addEventListener('input', (e) => {
                    if (e.target.classList.contains('level-up-new-input')) {
                        updateLevelUpReviewDeltas();
                        updateProgressionChart();
                    }
                });
            }
            
            weekTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    weekTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentWeek = parseInt(tab.dataset.week);
                    showWeekContent(currentWeek, currentDay);
                    saveProfile();
                });
            });
            
            tmOptions.forEach(option => {
                option.addEventListener('click', () => {
                    tmOptions.forEach(o => o.classList.remove('active'));
                    option.classList.add('active');
                    tmPercentage = parseInt(option.dataset.value);
                    updateBbbWeightPreview();
                    updateProgressionChart();
                    if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                        generateWorkoutPlan();
                    }
                    saveProfile();
                });
            });

            const upperProgressionInput = document.getElementById('upper-progression');
            const upperProgressionRange = document.getElementById('upper-progression-range');
            const lowerProgressionInput = document.getElementById('lower-progression');
            const lowerProgressionRange = document.getElementById('lower-progression-range');
            const upperDayStepInput = document.getElementById('upper-day-step');
            const upperDayStepRange = document.getElementById('upper-day-step-range');
            const lowerDayStepInput = document.getElementById('lower-day-step');
            const lowerDayStepRange = document.getElementById('lower-day-step-range');
            const maxWeek3Input = document.getElementById('max-week3-percentage');
            const maxWeek3Range = document.getElementById('max-week3-range');
            const upperCycleIncreaseInput = document.getElementById('upper-cycle-increase');
            const upperCycleIncreaseRange = document.getElementById('upper-cycle-increase-range');
            const lowerCycleIncreaseInput = document.getElementById('lower-cycle-increase');
            const lowerCycleIncreaseRange = document.getElementById('lower-cycle-increase-range');

            function syncProgressionInputs() {
                if (upperProgressionInput && upperProgressionRange) {
                    upperProgressionRange.value = upperProgression;
                    upperProgressionInput.value = upperProgression;
                }
                if (lowerProgressionInput && lowerProgressionRange) {
                    lowerProgressionRange.value = lowerProgression;
                    lowerProgressionInput.value = lowerProgression;
                }
                if (upperDayStepInput && upperDayStepRange) {
                    upperDayStepRange.value = upperDayStep;
                    upperDayStepInput.value = upperDayStep;
                }
                if (lowerDayStepInput && lowerDayStepRange) {
                    lowerDayStepRange.value = lowerDayStep;
                    lowerDayStepInput.value = lowerDayStep;
                }
                if (maxWeek3Input && maxWeek3Range) {
                    maxWeek3Range.value = maxWeek3Percentage;
                    maxWeek3Input.value = maxWeek3Percentage;
                }
                if (upperCycleIncreaseInput && upperCycleIncreaseRange) {
                    upperCycleIncreaseRange.value = upperCycleIncrease;
                    upperCycleIncreaseInput.value = upperCycleIncrease;
                }
                if (lowerCycleIncreaseInput && lowerCycleIncreaseRange) {
                    lowerCycleIncreaseRange.value = lowerCycleIncrease;
                    lowerCycleIncreaseInput.value = lowerCycleIncrease;
                }
                const cycleIncUpper = document.getElementById('cycle-inc-upper');
                const cycleIncLower = document.getElementById('cycle-inc-lower');
                if (cycleIncUpper) cycleIncUpper.textContent = upperCycleIncrease;
                if (cycleIncLower) cycleIncLower.textContent = lowerCycleIncrease;
            }

            function setUpperProgression(val) {
                upperProgression = Math.max(0, Math.min(15, parseInt(val, 10) || 0));
                syncProgressionInputs();
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                updateProgressionChart();
                saveProfile();
            }

            function setLowerProgression(val) {
                lowerProgression = Math.max(0, Math.min(15, parseInt(val, 10) || 0));
                syncProgressionInputs();
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                updateProgressionChart();
                saveProfile();
            }

            function setUpperDayStep(val) {
                upperDayStep = Math.max(0, Math.min(20, parseInt(val, 10) || 10));
                syncProgressionInputs();
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                updateProgressionChart();
                saveProfile();
            }

            function setLowerDayStep(val) {
                lowerDayStep = Math.max(0, Math.min(20, parseInt(val, 10) || 10));
                syncProgressionInputs();
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                updateProgressionChart();
                saveProfile();
            }

            function setMaxWeek3Percentage(val) {
                maxWeek3Percentage = Math.max(85, Math.min(100, parseInt(val, 10) || 95));
                syncProgressionInputs();
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                updateProgressionChart();
                saveProfile();
            }

            function setUpperCycleIncrease(val) {
                upperCycleIncrease = Math.max(0, Math.min(30, parseInt(val, 10) || 5));
                syncProgressionInputs();
                updateProgressionChart();
                saveProfile();
            }

            function setLowerCycleIncrease(val) {
                lowerCycleIncrease = Math.max(0, Math.min(30, parseInt(val, 10) || 10));
                syncProgressionInputs();
                updateProgressionChart();
                saveProfile();
            }

            if (upperProgressionRange) {
                upperProgressionRange.addEventListener('input', () => setUpperProgression(upperProgressionRange.value));
            }
            if (upperProgressionInput) {
                upperProgressionInput.addEventListener('change', () => setUpperProgression(upperProgressionInput.value));
            }
            if (lowerProgressionRange) {
                lowerProgressionRange.addEventListener('input', () => setLowerProgression(lowerProgressionRange.value));
            }
            if (lowerProgressionInput) {
                lowerProgressionInput.addEventListener('change', () => setLowerProgression(lowerProgressionInput.value));
            }
            if (upperDayStepRange) {
                upperDayStepRange.addEventListener('input', () => setUpperDayStep(upperDayStepRange.value));
            }
            if (upperDayStepInput) {
                upperDayStepInput.addEventListener('change', () => setUpperDayStep(upperDayStepInput.value));
            }
            if (lowerDayStepRange) {
                lowerDayStepRange.addEventListener('input', () => setLowerDayStep(lowerDayStepRange.value));
            }
            if (lowerDayStepInput) {
                lowerDayStepInput.addEventListener('change', () => setLowerDayStep(lowerDayStepInput.value));
            }
            if (maxWeek3Range) {
                maxWeek3Range.addEventListener('input', () => setMaxWeek3Percentage(maxWeek3Range.value));
            }
            if (maxWeek3Input) {
                maxWeek3Input.addEventListener('change', () => setMaxWeek3Percentage(maxWeek3Input.value));
            }
            if (upperCycleIncreaseRange) {
                upperCycleIncreaseRange.addEventListener('input', () => setUpperCycleIncrease(upperCycleIncreaseRange.value));
            }
            if (upperCycleIncreaseInput) {
                upperCycleIncreaseInput.addEventListener('change', () => setUpperCycleIncrease(upperCycleIncreaseInput.value));
            }
            if (lowerCycleIncreaseRange) {
                lowerCycleIncreaseRange.addEventListener('input', () => setLowerCycleIncrease(lowerCycleIncreaseRange.value));
            }
            if (lowerCycleIncreaseInput) {
                lowerCycleIncreaseInput.addEventListener('change', () => setLowerCycleIncrease(lowerCycleIncreaseInput.value));
            }
            
            accessorySelect.addEventListener('change', () => {
                const previousTemplate = accessoryTemplate;
                accessoryTemplate = accessorySelect.value;
                if (accessoryTemplate === 'bbb-forever' && previousTemplate !== 'bbb-forever') {
                    resetBbbForeverPhaseState();
                } else if (accessoryTemplate !== 'bbb-forever') {
                    resetBbbForeverPhaseState();
                }
                updateBbbAccessoryInputsVisibility();
                updateLevelDisplay();
                
                // If workout plan already exists, regenerate it with new accessory template
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                
                saveProfile();
            });

            // Progression chart: live update on 1RM input
            ['squat-1rm', 'bench-1rm', 'deadlift-1rm', 'ohp-1rm'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', scheduleProgressionChartUpdate);
                }
            });

            // Progression chart: cycle count inputs
            function handleChartRangeChange() {
                const { past, future } = getChartCycleConfig();
                const pastEl = document.getElementById('chart-past-cycles');
                const futureEl = document.getElementById('chart-future-cycles');
                if (pastEl) pastEl.value = past;
                if (futureEl) futureEl.value = future;
                saveProfile();
                updateProgressionChart();
            }
            const chartPastCyclesEl = document.getElementById('chart-past-cycles');
            const chartFutureCyclesEl = document.getElementById('chart-future-cycles');
            if (chartPastCyclesEl) chartPastCyclesEl.addEventListener('change', handleChartRangeChange);
            if (chartFutureCyclesEl) chartFutureCyclesEl.addEventListener('change', handleChartRangeChange);

            // Long press handler for day tabs (mobile)
            let longPressTimer = null;
            let longPressTarget = null;
            let longPressCompleted = false;
            const longPressCompletedElements = new WeakSet();
            
            document.addEventListener('touchstart', function(e) {
                const dayTab = e.target.closest('.day-tab');
                if (dayTab) {
                    longPressTarget = dayTab;
                    longPressCompleted = false;
                    longPressTimer = setTimeout(() => {
                        toggleDayCheckmark(longPressTarget);
                        longPressCompleted = true;
                        longPressCompletedElements.add(longPressTarget);
                        // Temporarily disable pointer events to prevent click
                        longPressTarget.style.pointerEvents = 'none';
                        longPressTimer = null;
                        // Re-enable pointer events and clear flags after click would have fired
                        setTimeout(() => {
                            if (longPressTarget) {
                                longPressTarget.style.pointerEvents = '';
                            }
                            longPressCompleted = false;
                            longPressCompletedElements.delete(longPressTarget);
                        }, 300);
                    }, 500); // 500ms for long press
                }
            });
            
            document.addEventListener('touchend', function(e) {
                const dayTab = e.target.closest('.day-tab');
                // If long press completed, prevent click
                if (dayTab && (longPressCompleted || longPressCompletedElements.has(dayTab))) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return;
                }
                // Cancel long press timer if still running
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                longPressTarget = null;
                longPressCompleted = false;
            });
            
            document.addEventListener('touchmove', function(e) {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                    longPressTarget = null;
                    longPressCompleted = false;
                }
            });
            
            // Add event delegation for day tabs with profile saving
            document.addEventListener('click', function(e) {
                const dayTab = e.target.closest('.day-tab');
                if (dayTab) {
                    // Prevent click if it was triggered by a long press
                    if (longPressCompleted || longPressCompletedElements.has(dayTab)) {
                        return;
                    }
                    const weekContent = dayTab.closest('.week-content');
                    const day = parseInt(dayTab.dataset.day);

                    // Tap active day again to toggle checkmark
                    if (dayTab.classList.contains('active')) {
                        toggleDayCheckmark(dayTab);
                        saveProfile();
                        return;
                    }

                    currentDay = day;
                    showDayContent(weekContent, currentDay);
                    saveProfile();
                }
            });
            
            // Right click handler for day tabs (desktop)
            document.addEventListener('contextmenu', function(e) {
                if (e.target.classList.contains('day-tab')) {
                    e.preventDefault();
                    toggleDayCheckmark(e.target);
                }
            });
            
            // Function to toggle day checkmark
            function toggleDayCheckmark(dayTab) {
                const week = parseInt(dayTab.dataset.week);
                const day = parseInt(dayTab.dataset.day);
                
                // Initialize week object if it doesn't exist
                if (!checkedDays[week]) {
                    checkedDays[week] = {};
                }
                
                // Toggle checkmark
                if (checkedDays[week][day]) {
                    delete checkedDays[week][day];
                    setDayTabCompletion(dayTab, '');
                } else {
                    checkedDays[week][day] = getLocalDateString();
                    setDayTabCompletion(dayTab, checkedDays[week][day]);
                }
                
                // Update week checkmark
                updateWeekCheckmark(week);
                
                // Save profile
                saveProfile();
            }

            function areAllMainLiftsComplete(week, day) {
                const mainButtons = document.querySelectorAll(
                    `.rest-timer-btn[data-timer-type="main"][data-timer-id^="main-${week}-${day}-"]`
                );
                if (mainButtons.length === 0) {
                    return false;
                }
                return Array.from(mainButtons).every(btn => btn.classList.contains('complete'));
            }

            function checkDayIfAllMainLiftsComplete(week, day) {
                if (!areAllMainLiftsComplete(week, day)) {
                    return;
                }

                if (!checkedDays[week]) {
                    checkedDays[week] = {};
                }
                if (checkedDays[week][day]) {
                    return;
                }

                checkedDays[week][day] = getLocalDateString();
                const dayTab = document.querySelector(`.day-tab[data-week="${week}"][data-day="${day}"]`);
                if (dayTab) {
                    setDayTabCompletion(dayTab, checkedDays[week][day]);
                }
                updateWeekCheckmark(week);
            }

            function uncheckDayIfMainLiftsIncomplete(week, day) {
                if (areAllMainLiftsComplete(week, day)) {
                    return;
                }

                if (!checkedDays[week]?.[day]) {
                    return;
                }

                delete checkedDays[week][day];
                const dayTab = document.querySelector(`.day-tab[data-week="${week}"][data-day="${day}"]`);
                if (dayTab) {
                    setDayTabCompletion(dayTab, '');
                }
                updateWeekCheckmark(week);
            }
            
            // Function to update week checkmark based on all days being checked
            function updateWeekCheckmark(week) {
                if (!workoutPlan.weeks || !workoutPlan.weeks[week]) {
                    return;
                }
                
                const weekTab = document.querySelector(`.week-tab[data-week="${week}"]`);
                if (!weekTab) {
                    return;
                }
                
                const daysInWeek = workoutPlan.weeks[week].length;
                const checkedCount = checkedDays[week] ? Object.keys(checkedDays[week]).length : 0;
                
                if (checkedCount === daysInWeek && daysInWeek > 0) {
                    weekTab.classList.add('checked');
                    let checkmark = weekTab.querySelector('.checkmark');
                    if (!checkmark) {
                        checkmark = document.createElement('span');
                        checkmark.className = 'checkmark';
                        checkmark.textContent = '✓';
                        weekTab.appendChild(checkmark);
                    }
                } else {
                    weekTab.classList.remove('checked');
                    const checkmark = weekTab.querySelector('.checkmark');
                    if (checkmark) {
                        checkmark.remove();
                    }
                }
            }
            
            // Function to update all week checkmarks
            function updateAllWeekCheckmarks() {
                if (!workoutPlan.weeks) {
                    return;
                }
                
                Object.keys(workoutPlan.weeks).forEach(week => {
                    updateWeekCheckmark(parseInt(week));
                });
            }

            // Load saved profile on page load
            loadProfile();
            syncProgressionInputs();
            setActiveMainTab(hasWorkoutPlan() ? 'workout' : 'setup');
            updateProgressionChart();
            
            // Rest Timer Functions
            function formatTime(seconds) {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            
            function playBeep() {
                // Create beep sound using Web Audio API
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    oscillator.frequency.value = 800;
                    oscillator.type = 'sine';
                    
                    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                    
                    oscillator.start(audioContext.currentTime);
                    oscillator.stop(audioContext.currentTime + 0.5);
                    
                    // Play second beep after a short delay
                    setTimeout(() => {
                        const oscillator2 = audioContext.createOscillator();
                        const gainNode2 = audioContext.createGain();
                        
                        oscillator2.connect(gainNode2);
                        gainNode2.connect(audioContext.destination);
                        
                        oscillator2.frequency.value = 800;
                        oscillator2.type = 'sine';
                        
                        gainNode2.gain.setValueAtTime(0.3, audioContext.currentTime);
                        gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                        
                        oscillator2.start(audioContext.currentTime);
                        oscillator2.stop(audioContext.currentTime + 0.5);
                    }, 200);
                } catch (e) {
                    console.error('Could not play beep sound:', e);
                }
            }
            
            function stopTimer() {
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                if (currentTimer) {
                    const btn = getTimerButton(currentTimer.id);
                    if (btn) {
                        btn.classList.remove('active');
                    }
                }
                currentTimer = null;
                const display = document.getElementById('rest-timer-display');
                if (display) {
                    display.style.display = 'none';
                    display.classList.remove('active');
                }
            }
            
            function startTimer(timerId, timerType, options = {}) {
                // Stop any existing timer
                stopTimer();
                
                // Get rest time based on type
                let restTime = restTimeSettings.main;
                if (timerType === 'warmup') {
                    restTime = restTimeSettings.warmup;
                } else if (timerType === 'accessory') {
                    restTime = restTimeSettings.accessory;
                }
                
                // Find the button
                const btn = getTimerButton(timerId);
                if (!btn) return;
                
                const existingCount = options.completionCount != null
                    ? options.completionCount.toString()
                    : (btn.dataset.completionCount || '0');
                
                // Show clock emoji while timer is active (will restore count when done)
                btn.textContent = '⏰';
                btn.classList.remove('complete');
                btn.classList.add('active');
                currentTimer = {
                    id: timerId,
                    timeLeft: restTime,
                    type: timerType,
                    existingCount,
                    skipIncrementOnComplete: !!options.skipIncrementOnComplete
                };
                
                // Show timer display
                const display = document.getElementById('rest-timer-display');
                display.style.display = 'block';
                display.classList.add('active');
                display.textContent = formatTime(restTime);
                
                // Start countdown
                timerInterval = setInterval(() => {
                    if (!currentTimer) {
                        clearInterval(timerInterval);
                        return;
                    }
                    
                    currentTimer.timeLeft--;
                    display.textContent = formatTime(currentTimer.timeLeft);
                    
                    if (currentTimer.timeLeft <= 0) {
                        // Store values before stopTimer() sets currentTimer to null
                        const completedTimerId = currentTimer.id;
                        const completedTimerType = currentTimer.type;
                        const existingCount = currentTimer.existingCount || '0';
                        const skipIncrementOnComplete = currentTimer.skipIncrementOnComplete;
                        const timerBtn = getTimerButton(completedTimerId);
                        
                        stopTimer();
                        
                        if (timerBtn) {
                            let completionCount;
                            if (skipIncrementOnComplete) {
                                completionCount = parseInt(existingCount, 10);
                            } else {
                                completionCount = parseInt(existingCount || timerBtn.dataset.completionCount || '0', 10) + 1;
                            }
                            applyTimerButtonState(timerBtn, completionCount);
                            completedTimers[completedTimerId] = completionCount;

                            if (completedTimerType === 'main') {
                                const match = completedTimerId.match(/^main-(\d+)-(\d+)-\d+$/);
                                if (match) {
                                    checkDayIfAllMainLiftsComplete(parseInt(match[1], 10), parseInt(match[2], 10));
                                }
                            }

                            saveProfile();
                        }
                        
                        // Play beep
                        playBeep();
                        scrollToNextWorkoutItem(completedTimerId);
                    }
                }, 1000);
            }
            
            function getTimerButton(timerId) {
                return document.querySelector(`.rest-timer-btn[data-timer-id="${timerId}"]`);
            }

            function applyTimerButtonState(btn, completionCount) {
                const count = parseInt(completionCount, 10) || 0;
                const item = btn.closest('.workout-item');

                if (count <= 0) {
                    btn.textContent = '⏰';
                    btn.classList.remove('complete', 'active');
                    btn.dataset.completionCount = '0';
                    if (item) item.classList.remove('complete');
                    return;
                }

                btn.dataset.completionCount = count.toString();
                btn.textContent = count === 1 ? '✓' : `✓${count}`;
                btn.classList.remove('active');
                btn.classList.add('complete');
                if (item) item.classList.add('complete');
            }

            function repeatCompletedTimer(btn) {
                const timerId = btn.dataset.timerId;
                const timerType = btn.dataset.timerType;
                const count = parseInt(btn.dataset.completionCount || '1', 10);
                const nextCount = count + 1;

                completedTimers[timerId] = nextCount;
                applyTimerButtonState(btn, nextCount);
                saveProfile();
                startTimer(timerId, timerType, {
                    skipIncrementOnComplete: true,
                    completionCount: nextCount
                });
            }

            function revertTimerButton(btn) {
                const timerId = btn.dataset.timerId;
                const timerType = btn.dataset.timerType;

                if (currentTimer && currentTimer.id === timerId) {
                    stopTimer();
                }

                delete completedTimers[timerId];
                applyTimerButtonState(btn, 0);

                if (timerType === 'main') {
                    const match = timerId.match(/^main-(\d+)-(\d+)-\d+$/);
                    if (match) {
                        uncheckDayIfMainLiftsIncomplete(parseInt(match[1], 10), parseInt(match[2], 10));
                    }
                }
            }

            function applyCompletedTimers() {
                Object.entries(completedTimers).forEach(([timerId, count]) => {
                    const btn = getTimerButton(timerId);
                    if (btn) {
                        applyTimerButtonState(btn, count);
                    }
                });
            }

            function syncDayCheckmarksFromCompletedTimers() {
                if (!workoutPlan.weeks) {
                    return;
                }

                Object.keys(workoutPlan.weeks).forEach(weekKey => {
                    const week = parseInt(weekKey, 10);
                    workoutPlan.weeks[week].forEach((_, dayIndex) => {
                        checkDayIfAllMainLiftsComplete(week, dayIndex);
                    });
                });
            }

            function resetAllCheckmarks() {
                completedTimers = {};
                const allButtons = document.querySelectorAll('.rest-timer-btn');
                allButtons.forEach(btn => applyTimerButtonState(btn, 0));
            }

            function isTimerForDay(timerId, week, dayIndex) {
                const prefix = `(?:warmup|main|accessory)-${week}-${dayIndex}-`;
                return new RegExp(`^${prefix}\\d+$`).test(timerId);
            }

            function resetDayCheckmarks(week, dayIndex) {
                if (currentTimer && isTimerForDay(currentTimer.id, week, dayIndex)) {
                    stopTimer();
                }

                Object.keys(completedTimers).forEach(timerId => {
                    if (isTimerForDay(timerId, week, dayIndex)) {
                        delete completedTimers[timerId];
                    }
                });

                if (checkedDays[week]?.[dayIndex]) {
                    delete checkedDays[week][dayIndex];
                    const dayTab = document.querySelector(`.day-tab[data-week="${week}"][data-day="${dayIndex}"]`);
                    if (dayTab) setDayTabCompletion(dayTab, '');
                }
                updateWeekCheckmark(week);

                const dayContent = document.querySelector(
                    `.week-content[data-week="${week}"] .day-content[data-day="${dayIndex}"]`
                );
                if (dayContent) {
                    dayContent.querySelectorAll('.rest-timer-btn').forEach(btn => applyTimerButtonState(btn, 0));
                }

                saveProfile();
            }
            
            function updateTimeDisplays() {
                const warmupDisplay = document.getElementById('warmup-time-display');
                const mainDisplay = document.getElementById('main-time-display');
                const accessoryDisplay = document.getElementById('accessory-time-display');
                
                if (warmupDisplay) {
                    warmupDisplay.textContent = formatTime(restTimeSettings.warmup);
                }
                if (mainDisplay) {
                    mainDisplay.textContent = formatTime(restTimeSettings.main);
                }
                if (accessoryDisplay) {
                    accessoryDisplay.textContent = formatTime(restTimeSettings.accessory);
                }
            }
            
            // Event listeners for rest timer buttons
            document.addEventListener('click', function(e) {
                if (e.target.classList.contains('rest-timer-btn')) {
                    const timerId = e.target.dataset.timerId;
                    const timerType = e.target.dataset.timerType;

                    if (e.target.classList.contains('complete') || e.target.textContent.includes('✓')) {
                        repeatCompletedTimer(e.target);
                        return;
                    }
                    
                    startTimer(timerId, timerType);
                }
            });
            
            // Event listeners for rest time settings
            const warmupRestInput = document.getElementById('warmup-rest-time');
            const mainRestInput = document.getElementById('main-rest-time');
            const accessoryRestInput = document.getElementById('accessory-rest-time');
            
            if (warmupRestInput) {
                warmupRestInput.addEventListener('input', function() {
                    restTimeSettings.warmup = parseInt(this.value) || 75;
                    updateTimeDisplays();
                    saveProfile();
                });
            }
            
            if (mainRestInput) {
                mainRestInput.addEventListener('input', function() {
                    restTimeSettings.main = parseInt(this.value) || 180;
                    updateTimeDisplays();
                    saveProfile();
                });
            }
            
            if (accessoryRestInput) {
                accessoryRestInput.addEventListener('input', function() {
                    restTimeSettings.accessory = parseInt(this.value) || 90;
                    updateTimeDisplays();
                    saveProfile();
                });
            }
            
            // Initialize time displays
            updateTimeDisplays();
            
            // Helper functions
            function round5(num) {
                return Math.round(num / 5) * 5;
            }

            function getBbbWeights(exerciseTM) {
                return {
                    fifty: round5(exerciseTM * 0.5),
                    sixty: round5(exerciseTM * 0.6)
                };
            }

            function formatBbbWeightLine(exerciseTM, deload) {
                const { fifty, sixty } = getBbbWeights(exerciseTM);
                if (deload) {
                    return `3 sets of 10 @ ${fifty} lbs (50% TM, deload — may skip entirely)`;
                }
                return `5 sets of 10 @ ${fifty} lbs (50% TM) or ${sixty} lbs (60% TM)`;
            }

            function updateBbbWeightPreview() {
                const preview = document.getElementById('bbb-weight-preview');
                if (!preview) return;
                if (accessorySelect.value !== 'bbb' && accessorySelect.value !== 'bbb-forever') {
                    preview.innerHTML = '';
                    return;
                }
                const lifts = [
                    { key: 'squat', label: 'Squat' },
                    { key: 'bench', label: 'Bench' },
                    { key: 'deadlift', label: 'Deadlift' },
                    { key: 'ohp', label: 'OHP' }
                ];
                const lines = [];
                lifts.forEach(({ key, label }) => {
                    const oneRM = parseFloat(document.getElementById(`${key}-1rm`).value) || 0;
                    if (oneRM <= 0) return;
                    const tm = round5(oneRM * (tmPercentage / 100));
                    const { fifty, sixty } = getBbbWeights(tm);
                    lines.push(`${label}: ${fifty} lbs (50%) / ${sixty} lbs (60%)`);
                });
                preview.innerHTML = lines.length
                    ? lines.map(l => `<div>${l}</div>`).join('')
                    : '<div>Enter 1RMs and save to see calculated BBB weights.</div>';
            }
            
            function generateWarmupSets(exerciseTM, week) {
                if (week === 4) {
                    return [];
                }
                return [
                    { reps: 5, weight: round5(exerciseTM * 0.4), percentage: 40 },
                    { reps: 5, weight: round5(exerciseTM * 0.5), percentage: 50 },
                    { reps: 3, weight: round5(exerciseTM * 0.6), percentage: 60 }
                ];
            }
            
            function calculateWorkingWeight(oneRM, tmPercent, weekPercent) {
                const trainingMax = oneRM * (tmPercent / 100);
                return round5(trainingMax * (weekPercent / 100));
            }
            
            // Main function to generate workout plan
            function generateWorkoutPlan(options = {}) {
                const savedWeek = currentWeek;
                const savedDay = currentDay;
                const navigateToStart = options.navigateToStart === true;
                
                // Get 1RM values
                const squat1RM = parseFloat(document.getElementById('squat-1rm').value) || 0;
                const bench1RM = parseFloat(document.getElementById('bench-1rm').value) || 0;
                const deadlift1RM = parseFloat(document.getElementById('deadlift-1rm').value) || 0;
                const ohp1RM = parseFloat(document.getElementById('ohp-1rm').value) || 0;
                
                if (squat1RM === 0 && bench1RM === 0 && deadlift1RM === 0 && ohp1RM === 0) {
                    alert('Please enter at least one 1RM value.');
                    return;
                }
                
                // Calculate Training Maxes
                const squatTM = squat1RM * (tmPercentage / 100);
                const benchTM = bench1RM * (tmPercentage / 100);
                const deadliftTM = deadlift1RM * (tmPercentage / 100);
                const ohpTM = ohp1RM * (tmPercentage / 100);
                
                // Week percentages
                // Create workout plan structure
                workoutPlan = {
                    weeks: {},
                    trainingMaxes: {
                        squat: round5(squatTM),
                        bench: round5(benchTM),
                        deadlift: round5(deadliftTM),
                        ohp: round5(ohpTM)
                    }
                };
                
                // Generate workout plan for each week
                for (let week = 1; week <= 4; week++) {
                    workoutPlan.weeks[week] = [];
                    
                    daysSetup.forEach(daySetup => {
                        const { day, main, name } = daySetup;
                        const exerciseTM = workoutPlan.trainingMaxes[main];
                        
                        if (exerciseTM === 0) return; // Skip if no 1RM entered
                        
                        const dayPlan = {
                            day,
                            name,
                            mainLift: { 
                                name: main.charAt(0).toUpperCase() + main.slice(1),
                                tm: exerciseTM,
                                warmup: generateWarmupSets(exerciseTM, week),
                                sets: []
                            },
                            accessories: []
                        };
                        
                        // Add main lift sets based on week percentages
                        getMainLiftSets(week, main).forEach(set => {
                            dayPlan.mainLift.sets.push({
                                reps: set.reps,
                                weight: round5(exerciseTM * (set.percentage / 100)),
                                percentage: set.percentage,
                                amrap: set.amrap || false
                            });
                        });
                        
                        // Add accessories based on template
                        const effectiveTemplate = getEffectiveAccessoryTemplate();
                        if (effectiveTemplate === 'standard') {
                            const exercises = accessoryExercises.standard[main];
                            const accessoryReps = week === 4 ? '10-25 total reps (deload - may skip entirely)' : '25-50 total reps';
                            
                            // Select exercise based on day (0-3 index, cycling through 4 exercises)
                            const exerciseIndex = (day - 1) % 4;
                            
                            dayPlan.accessories = [
                                { type: 'Push', exercise: exercises.push[exerciseIndex], reps: accessoryReps },
                                { type: 'Pull', exercise: exercises.pull[exerciseIndex], reps: accessoryReps },
                                { type: exercises.core ? 'Core' : 'Legs', exercise: (exercises.core || exercises.legs)[exerciseIndex], reps: accessoryReps }
                            ];
                        } else if (effectiveTemplate === 'bbb') {
                            const bbbExercise = accessoryExercises.bbb[main];
                            const bbbWeights = getBbbWeights(exerciseTM);
                            
                            // Reduce BBB volume during deload week
                            const deload = week === 4;
                            const bbbSetsDetail = formatBbbWeightLine(exerciseTM, deload);
                            const isPressingDay = (main === 'ohp' || main === 'bench');
                            
                            const bbbBase = {
                                type: 'Boring But Big',
                                exercise: bbbExercise.main,
                                setsDetail: bbbSetsDetail,
                                weight50: bbbWeights.fifty,
                                weight60: bbbWeights.sixty
                            };
                            
                            if (isPressingDay) {
                                const chinSets = deload ? '3 sets × 10 reps (deload)' : '5 sets × 10 reps';
                                dayPlan.accessories = [
                                    bbbBase,
                                    { type: 'Chinups', exercise: 'Chin-ups', sets: chinSets,
                                      note: 'You can substitute Barbell Curls or Shrugs for the lat work. Additional suggestions: Reverse Curls, Wrist Roller' }
                                ];
                            } else {
                                const abSuggestions = [
                                    'Ab Wheel Rollouts', 'Standing Bag Kicks', 'Planks', 'Dragon Flags', 'Russian Twists'
                                ];
                                const abSets = deload ? '10–25 total reps (deload)' : '25–50 total reps';
                                dayPlan.accessories = [
                                    bbbBase,
                                    { type: 'AbWork', sets: abSets, suggestions: abSuggestions }
                                ];
                            }
                        } else if (effectiveTemplate === 'bbb-forever') {
                            const deload = week === 4;
                            const exerciseIndex = (day - 1) % 4;
                            const exercises = accessoryExercises.standard[main];
                            const isPressingDay = (main === 'bench' || main === 'ohp');
                            const accessoryReps = deload ? '10–25 total reps (deload - may skip entirely)' : '25–50 total reps';

                            const bbbBlock = {
                                type: 'Boring But Big',
                                exercise: main.charAt(0).toUpperCase() + main.slice(1),
                                setsDetail: formatBbbWeightLine(exerciseTM, deload),
                                weight50: getBbbWeights(exerciseTM).fifty,
                                weight60: getBbbWeights(exerciseTM).sixty
                            };

                            if (isPressingDay) {
                                const pullSuggestions = [...exercises.pull, ...foreverBbbPullExtras];
                                dayPlan.accessories = [
                                    bbbBlock,
                                    {
                                        type: 'Pull',
                                        exercise: exercises.pull[exerciseIndex],
                                        reps: accessoryReps,
                                        suggestions: pullSuggestions,
                                        note: 'Your one accessory for the day — main + BBB already cover pressing. Superset with the BBB sets to save time.'
                                    }
                                ];
                            } else {
                                const coreSuggestions = [...(exercises.core || coreOnlySuggestions), ...foreverBbbCoreExtras];
                                dayPlan.accessories = [
                                    bbbBlock,
                                    {
                                        type: 'Core',
                                        exercise: coreSuggestions[exerciseIndex % coreSuggestions.length],
                                        reps: accessoryReps,
                                        suggestions: coreSuggestions,
                                        note: main === 'deadlift'
                                            ? 'Avoid back extensions/good mornings — deadlift + BBB already hammers the lower back. Stick to ab-focused work.'
                                            : 'Ab-focused — squat + BBB already provide the lower-body/lower-back stimulus.'
                                    }
                                ];
                            }
                        } else if (effectiveTemplate === 'fsl') {
                            // First set last - use first working set weight for 5x5
                            const fslWeight = round5(exerciseTM * (getLiftProgression(week, main)[0] / 100));
                            const fslExercises = accessoryExercises.fsl[main];
                            
                            // Reduce FSL volume during deload week
                            const fslSets = week === 4 ? '1-2 sets of 5 reps (deload - may skip entirely)' : '5 sets of 5 reps';
                            const supplementalReps = week === 4 ? 'Optional - consider skipping' : '50-100 total reps';
                            
                            dayPlan.accessories = [
                                {
                                    type: 'First Set Last',
                                    exercise: fslExercises.main,
                                    sets: fslSets,
                                    weight: fslWeight
                                },
                                {
                                    type: 'Supplemental Work',
                                    exercises: fslExercises.accessories,
                                    reps: supplementalReps
                                }
                            ];
                        } else if (effectiveTemplate === 'triumvirate') {
                            const triumvirateExercises = accessoryExercises.triumvirate[main];
                            
                            // Reduce Triumvirate volume during deload week
                            if (week === 4) {
                                // Show only first accessory with reduced sets
                                dayPlan.accessories = [
                                    {
                                        name: triumvirateExercises.accessories[0].name,
                                        sets: '2-3 sets of 10-15 reps (deload - may skip entirely)',
                                        reps: '10-15'
                                    }
                                ];
                            } else {
                                dayPlan.accessories = triumvirateExercises.accessories;
                            }
                        } else if (effectiveTemplate === 'beginners') {
                            // First set last - use first working set weight for 5x5
                            const fslWeight = round5(exerciseTM * (getLiftProgression(week, main)[0] / 100));
                            const beginnerExercises = accessoryExercises.beginners[main];
                            
                            dayPlan.fslWeight = fslWeight; // Store for rendering
                            
                            // Reduce Beginners template volume during deload week
                            const accessoryReps = week === 4 ? '25-50 total reps (deload - may skip entirely)' : '50-100 total reps';
                            const fslSets = week === 4 ? 'Skip FSL during deload' : '5 sets of 5 reps';
                            
                            // Select exercise based on day (0-3 index, cycling through 4 exercises)
                            const exerciseIndex = (day - 1) % 4;
                            
                            // Ensure the accessories property has properly structured data
                            try {
                                dayPlan.accessories = [
                                    {
                                        type: 'First Set Last',
                                        exercise: main.charAt(0).toUpperCase() + main.slice(1),
                                        sets: fslSets,
                                        weight: fslWeight
                                    },
                                    {
                                        type: 'Push',
                                        exercise: (beginnerExercises.accessories.push || ['Push exercises'])[exerciseIndex],
                                        reps: accessoryReps
                                    },
                                    {
                                        type: 'Pull',
                                        exercise: (beginnerExercises.accessories.pull || ['Pull exercises'])[exerciseIndex],
                                        reps: accessoryReps
                                    },
                                    {
                                        type: 'Legs/Core',
                                        exercise: (beginnerExercises.accessories.legs || ['Legs/Core exercises'])[exerciseIndex],
                                        reps: accessoryReps
                                    }
                                ];
                            } catch (error) {
                                // Fallback if there's any issue with the data structure
                                console.error('Error setting up accessories for beginners template:', error);
                                dayPlan.accessories = [
                                    { type: 'First Set Last', exercise: main.charAt(0).toUpperCase() + main.slice(1), sets: fslSets, weight: fslWeight },
                                    { type: 'Push', exercise: 'Push exercises', reps: accessoryReps },
                                    { type: 'Pull', exercise: 'Pull exercises', reps: accessoryReps },
                                    { type: 'Legs/Core', exercise: 'Legs/Core exercises', reps: accessoryReps }
                                ];
                            }
                        }
                        
                        workoutPlan.weeks[week].push(dayPlan);
                    });
                }
                
                // Render workout plan
                renderWorkoutPlan();
                
                // Restore the UI state if we had a previous workout plan, otherwise show week 1
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    setTimeout(() => {
                        if (navigateToStart) {
                            weekTabs.forEach(tab => {
                                tab.classList.toggle('active', tab.dataset.week === '1');
                            });
                            currentWeek = 1;
                            currentDay = 0;
                            showWeekContent(1, 0);
                        } else {
                            weekTabs.forEach(tab => {
                                tab.classList.toggle('active', tab.dataset.week === savedWeek.toString());
                            });
                            currentWeek = savedWeek;
                            showWeekContent(savedWeek, savedDay);
                        }
                    }, 0);
                } else {
                    // Show week 1 by default for new workout plans
                    currentWeek = 1;
                    currentDay = 0;
                    showWeekContent(1, 0);
                }
                updateWeekTabLabels();
                updateBbbWeightPreview();
            }
            
            // Function to safely join an array or return a default string
            function safeJoin(arr, separator, defaultText) {
                if (Array.isArray(arr) && arr.length > 0) {
                    return arr.join(separator);
                }
                return defaultText || 'Not specified';
            }
            
            // Check if all AMRAP sets have been logged
            function areAllAmrapSetsLogged() {
                if (skipsAmrapGate()) {
                    return true;
                }
                // Get the exercises that have 1RM values (are being used)
                const exercises = [];
                if (parseFloat(document.getElementById('squat-1rm').value) > 0) exercises.push('squat');
                if (parseFloat(document.getElementById('bench-1rm').value) > 0) exercises.push('bench');
                if (parseFloat(document.getElementById('deadlift-1rm').value) > 0) exercises.push('deadlift');
                if (parseFloat(document.getElementById('ohp-1rm').value) > 0) exercises.push('ohp');
                
                // Check if all exercises have logged AMRAP results
                return exercises.every(exercise => amrapResults[exercise] && amrapResults[exercise].reps !== undefined);
            }
            
            // Generate level up buttons with validation
            function generateLevelUpButtons() {
                const allLogged = areAllAmrapSetsLogged();
                const missingExercises = [];
                
                // Find which exercises are missing AMRAP logs
                ['squat', 'bench', 'deadlift', 'ohp'].forEach(exercise => {
                    const has1RM = parseFloat(document.getElementById(`${exercise}-1rm`).value) > 0;
                    const hasLogged = amrapResults[exercise] && amrapResults[exercise].reps !== undefined;
                    if (has1RM && !hasLogged) {
                        missingExercises.push(exercise.toUpperCase());
                    }
                });
                
                let html = '';
                
                if (allLogged || skipsAmrapGate()) {
                    html += '<button id="level-up-button" class="level-up-button" style="width: 100%; margin-top: 1rem;">LEVEL UP! (Complete Cycle & Increase Weights)</button>';
                } else {
                    html += '<button id="level-up-button" class="level-up-button" disabled style="opacity: 0.5; cursor: not-allowed; width: 100%; margin-top: 1rem;">LEVEL UP! (Log Week 3 AMRAP Sets First)</button>';
                    html += `<div class="notes" style="margin-top: 1rem; background-color: #fff3e1; border-left-color: #ff9800;">
                        <p><strong>⚠️ Cannot Level Up Yet</strong></p>
                        <p>Please log your Week 3 AMRAP performance for: <strong>${missingExercises.join(', ')}</strong></p>
                        <p>Go to Week 3, complete your 1+ sets, and log your results to unlock progression.</p>
                    </div>`;
                }
                
                return html;
            }
            
            // Function to render workout plan
            function renderWorkoutPlan() {
                const resultsContainer = document.getElementById('workout-results');
                
                if (!workoutPlan.weeks || Object.keys(workoutPlan.weeks).length === 0) {
                    resultsContainer.innerHTML = '<p>Enter your 1-rep max values in Program Setup and click Save to create your personalized Strength program.</p>';
                    return;
                }
                
                let html = '';
                
                // Create HTML for each week
                for (let week = 1; week <= 4; week++) {
                    const weekDays = workoutPlan.weeks[week];
                    
                    html += `<div class="week-content ${week === 1 ? 'active' : ''}" data-week="${week}">`;
                    
                    if (!weekDays || weekDays.length === 0) {
                        html += '<p>Please enter at least one 1RM value to generate workout days.</p>';
                    } else {
                        // Add day tabs
                        html += '<div class="day-tabs">';
                        workoutPlan.weeks[week].forEach((day, dayIndex) => {
                            const isChecked = checkedDays[week] && checkedDays[week][dayIndex];
                            const completionDate = getDayCompletionDate(week, dayIndex);
                            html += `<div class="day-tab ${dayIndex === 0 ? 'active' : ''} ${isChecked ? 'checked' : ''}" data-week="${week}" data-day="${dayIndex}"${isChecked ? ` data-completed-date="${completionDate}" title="${getFullCompletionLabel(completionDate)}"` : ''}>Day ${day.day}<span class="checkmark">✓</span>${isChecked ? `<span class="day-completion-date">${formatCompletionDate(completionDate)}</span>` : ''}</div>`;
                        });
                        html += '</div>';
                        html += '<p class="day-checkmark-hint">💡 tap active day again to mark as complete</p>';
                        
                        // Add day content container
                        html += '<div class="day-contents">';
                        workoutPlan.weeks[week].forEach((day, dayIndex) => {
                            const isLastDayOfCycle = (week === 4 && dayIndex === workoutPlan.weeks[week].length - 1);
                            html += `
                            <div class="day-content ${dayIndex === 0 ? 'active' : ''}" data-day="${dayIndex}">
                                <div class="day-card">
                                    <div class="day-header"><span>Day ${day.day}: ${day.name}</span><div class="day-tips-row">
                                        <button type="button" class="day-tips-btn"
                                                onclick="openFormTipsModal('${day.mainLift.name.toLowerCase()}')">Form Tips</button>
                                        <button type="button" class="day-tips-btn" onclick="openOtherTipsModal()">Other Tips</button>
                                    </div></div>

                                    <button type="button" class="begin-workout-btn" data-week="${week}" data-day="${dayIndex}">Begin Workout</button>
                                    
                                    

                                    ${(day.mainLift.warmup || []).length > 0 ? `
                                    <div class="warm-up-section workout-section">
                                        <h4>Warm-up Sets</h4>
                                        <div class="workout-stack set-stack">
                                            ${day.mainLift.warmup.map((set, warmupIndex) => renderWorkoutItem(
                                                'warmup',
                                                `warmup-${week}-${dayIndex}-${warmupIndex}`,
                                                `Set ${warmupIndex + 1}`,
                                                '',
                                                {
                                                    setDetail: {
                                                        reps: set.reps,
                                                        weight: set.weight,
                                                        percentage: set.percentage ?? [40, 50, 60][warmupIndex]
                                                    }
                                                }
                                            )).join('')}
                                        </div>
                                    </div>` : (week === 4 ? `
                                    <div class="warm-up-section workout-section">
                                        <p style="font-size:0.9rem; color:#666; margin:0.5rem 0;">Deload: no separate warm-up — work sets at 40/50/60% TM are your session.</p>
                                    </div>` : '')}
                                    
                                    <div class="workout-section">
                                        <h4>Main Lift: ${day.mainLift.name}</h4>
                                        <div class="workout-stack set-stack">`;
                            
                            day.mainLift.sets.forEach((set, index) => {
                                html += renderWorkoutItem(
                                    'main',
                                    `main-${week}-${dayIndex}-${index}`,
                                    `Set ${index + 1}`,
                                    '',
                                    {
                                        amrap: set.amrap,
                                        setDetail: {
                                            reps: set.reps,
                                            weight: set.weight,
                                            percentage: set.percentage,
                                            amrap: set.amrap
                                        }
                                    }
                                );
                            });
                            
                            html += `
                                        </div>
                                    </div>`;
                            
                            // Add AMRAP logging section for Week 3 only (not Forever BBB)
                            if (week === 3 && !skipsAmrapGate()) {
                                const exerciseName = day.mainLift.name.toLowerCase();
                                const amrapData = amrapResults[exerciseName] || {};
                                const hasLogged = amrapData.reps !== undefined;
                                
                                html += `
                                    <div class="amrap-logging">
                                        <h4>📊 Log Your Performance</h4>
                                        <p style="margin-bottom: 1rem; font-size: 0.95rem;">
                                            Your performance on this 1+ set determines your progression for the next cycle.
                                        </p>`;
                                
                                if (hasLogged) {
                                    html += `
                                        <div class="amrap-status logged">
                                            <strong>✓ Logged:</strong> ${amrapData.reps} reps completed | 
                                            <strong>Decision:</strong> ${amrapData.decisionText || amrapData.decision}
                                        </div>
                                        <button id="amrap-undo-${exerciseName}" class="amrap-submit-btn" style="background-color: var(--accent);">
                                            Undo Decision
                                        </button>`;
                                } else {
                                    html += `
                                        <div class="amrap-input-group">
                                            <label for="amrap-reps-${exerciseName}">Reps completed on 1+ set:</label>
                                            <input type="number" id="amrap-reps-${exerciseName}" min="0" max="20" placeholder="0">
                                        </div>
                                        
                                        <div id="amrap-recommendations-${exerciseName}" class="amrap-recommendations" style="display: none;">
                                            <!-- Options will be populated by JavaScript -->
                                        </div>
                                        
                                        <button id="amrap-submit-${exerciseName}" class="amrap-submit-btn" style="display: none;">
                                            Apply Progression Decision
                                        </button>`;
                                }
                                
                                html += `
                                    </div>`;
                            }
                            
                            html += `
                                    <div class="accessory-section workout-section">
                                        <h4>Accessory Work${isForeverBbbAnchorPhase() ? ' (Anchor — FSL)' : ''}</h4>
                                        <div class="workout-stack">`;
                            
                            const renderTemplate = getEffectiveAccessoryTemplate();
                            if (renderTemplate === 'standard') {
                                day.accessories.forEach((accessory, accIndex) => {
                                    html += renderWorkoutItem(
                                        'accessory',
                                        `accessory-${week}-${dayIndex}-${accIndex}`,
                                        `${accessory.type}: ${accessory.exercise}`,
                                        accessory.reps
                                    );
                                });
                            } else if (renderTemplate === 'bbb') {
                                day.accessories.forEach((acc, accIndex) => {
                                    if (acc.type === 'Boring But Big') {
                                        html += renderWorkoutItem(
                                            'accessory',
                                            `accessory-${week}-${dayIndex}-${accIndex}`,
                                            `${acc.type}: ${acc.exercise}`,
                                            acc.setsDetail
                                        );
                                    } else if (acc.type === 'Chinups') {
                                        html += renderWorkoutItem(
                                            'accessory',
                                            `accessory-${week}-${dayIndex}-${accIndex}`,
                                            acc.exercise,
                                            `${acc.sets} (bodyweight)`,
                                            { note: acc.note }
                                        );
                                    } else if (acc.type === 'AbWork') {
                                        html += renderWorkoutItem(
                                            'accessory',
                                            `accessory-${week}-${dayIndex}-${accIndex}`,
                                            'Ab Work',
                                            acc.sets,
                                            { suggestions: acc.suggestions }
                                        );
                                    }
                                });
                            } else if (renderTemplate === 'bbb-forever') {
                                day.accessories.forEach((acc, accIndex) => {
                                    if (acc.type === 'Boring But Big') {
                                        html += renderWorkoutItem(
                                            'accessory',
                                            `accessory-${week}-${dayIndex}-${accIndex}`,
                                            `${acc.type}: ${acc.exercise}`,
                                            acc.setsDetail
                                        );
                                    } else {
                                        html += renderWorkoutItem(
                                            'accessory',
                                            `accessory-${week}-${dayIndex}-${accIndex}`,
                                            `${acc.type}: ${acc.exercise}`,
                                            acc.reps,
                                            { suggestions: acc.suggestions, note: acc.note }
                                        );
                                    }
                                });
                            } else if (renderTemplate === 'fsl') {
                                html += renderWorkoutItem(
                                    'accessory',
                                    `accessory-${week}-${dayIndex}-0`,
                                    `${day.accessories[0].type}: ${day.accessories[0].exercise}`,
                                    `${day.accessories[0].sets} @ ${day.accessories[0].weight} lbs`
                                );
                                html += renderWorkoutItem(
                                    'accessory',
                                    `accessory-${week}-${dayIndex}-1`,
                                    `${day.accessories[1].type}: ${safeJoin(day.accessories[1].exercises, ', ')}`,
                                    day.accessories[1].reps
                                );
                            } else if (renderTemplate === 'triumvirate') {
                                day.accessories.forEach((accessory, accIndex) => {
                                    html += renderWorkoutItem(
                                        'accessory',
                                        `accessory-${week}-${dayIndex}-${accIndex}`,
                                        accessory.name,
                                        `${accessory.sets} sets of ${accessory.reps} reps`
                                    );
                                });
                            } else if (renderTemplate === 'beginners') {
                                const fslAccessory = day.accessories.find(acc => acc.type === 'First Set Last');
                                let accIndex = 0;
                                if (fslAccessory) {
                                    html += renderWorkoutItem(
                                        'accessory',
                                        `accessory-${week}-${dayIndex}-${accIndex++}`,
                                        `First Set Last: ${fslAccessory.exercise}`,
                                        `${fslAccessory.sets}${fslAccessory.weight ? ' @ ' + fslAccessory.weight + ' lbs' : ''}`
                                    );
                                }
                                const otherAccessories = day.accessories.filter(acc => acc.type !== 'First Set Last');
                                otherAccessories.forEach(accessory => {
                                    html += renderWorkoutItem(
                                        'accessory',
                                        `accessory-${week}-${dayIndex}-${accIndex++}`,
                                        `${accessory.type}: ${accessory.exercise}`,
                                        accessory.reps
                                    );
                                });
                            }
                            
                            html += `
                                        </div>
                                    </div>
                                    
                                    <button type="button" class="complete-exit-workout-btn" data-week="${week}" data-day="${dayIndex}">Complete / Exit</button>
                                    <button type="button" class="reset-day-btn" data-week="${week}" data-day="${dayIndex}">Reset Day</button>
                                    
                                    ${isLastDayOfCycle ? generateLevelUpButtons() : ''}
                                </div>
                            </div>`;
                        });
                        html += '</div>'; // Close day-contents
                    }
                    
                    html += '</div>'; // Close week-content
                }
                
                resultsContainer.innerHTML = html;
                
                applyCompletedTimers();
                syncDayCheckmarksFromCompletedTimers();

                updateWeekTabLabels();
                
                // Add event listeners for level up button
                const levelUpButton = document.getElementById('level-up-button');
                if (levelUpButton) {
                    levelUpButton.addEventListener('click', levelUp);
                }
                
                // Add event listeners for AMRAP logging
                setupAmrapListeners();

                if (workoutModeActive) {
                    document.body.classList.add('workout-mode');
                    if (workoutModeBar) workoutModeBar.style.display = 'flex';
                    updateWorkoutModeTitle();
                }
            }
            
            // Function to show specific week content
            function showWeekContent(weekNum, dayIndex) {
                currentWeek = weekNum;
                document.querySelectorAll('.week-content').forEach(content => {
                    content.classList.toggle('active', content.dataset.week === weekNum.toString());
                });

                const activeWeek = document.querySelector(`.week-content[data-week="${weekNum}"]`);
                if (!activeWeek) return;

                const dayCount = activeWeek.querySelectorAll('.day-tab').length;
                if (dayCount === 0) return;

                const day = dayIndex !== undefined
                    ? Math.min(Math.max(0, dayIndex), dayCount - 1)
                    : Math.min(currentDay, dayCount - 1);
                currentDay = day;
                showDayContent(activeWeek, currentDay);
            }
            
            // Function to show specific day content
            function showDayContent(weekElement, dayIndex) {
                const dayTabs = weekElement.querySelectorAll('.day-tab');
                const dayContents = weekElement.querySelectorAll('.day-content');
                
                dayTabs.forEach(tab => {
                    tab.classList.toggle('active', tab.dataset.day === dayIndex.toString());
                });
                
                dayContents.forEach(content => {
                    content.classList.toggle('active', content.dataset.day === dayIndex.toString());
                });

                if (workoutModeActive) {
                    updateWorkoutModeTitle();
                    requestAnimationFrame(() => scrollToFirstIncompleteItem());
                }
            }

            // Template explanations
            const explanations = {
                'standard': 'The Standard template focuses on balanced development with 25-50 reps each of pushing, pulling, and core exercises. This provides a well-rounded approach to assistance work that complements the main lifts without excessive fatigue.',

                'bbb-forever': 'Forever BBB alternates Leader and Anchor cycles. Leaders use 5s Pro main work (no AMRAP) plus 5×10 supplemental at 50–60% TM, with one accessory per day: Pull 25–50 on Bench/OHP, Core/abs 25–50 on Squat/Deadlift. After 2 leader cycles you\'ll be prompted to run an Anchor cycle: AMRAP main lifts, FSL 5×5 supplemental, and 50–100 reps assistance — then return to leaders.',

                'fsl': 'First Set Last (FSL) uses the weight from your first work set (the 5 reps set) for 5 additional sets of 5 reps. This provides additional volume at a moderate intensity, helping to build strength and reinforce technique without excessive fatigue.',

                'triumvirate': 'The Triumvirate template prescribes two assistance exercises per main lift, each performed for 5 sets of 10-15 reps. This focused approach targets specific muscle groups that support your main lifts, providing balanced development with moderate volume.',

                'beginners': 'Strength for Beginners combines FSL work (5 sets of 5 reps at your first set weight) with specific push, pull, and single-leg/core accessories (50 reps each). This template is designed to build a foundation of strength and work capacity for those new to the program.'
            };

            const BBB_SUPPLEMENTAL_NOTE = '5×10 supplemental: 50% or 60% TM — start at 50%, move to 60% when 5×10 feels manageable.';
            const BBB_AMRAP_VS_5S_PRO_NOTE = 'AMRAP is not required for muscle growth on BBB — the 5×10 block (~50 reps at 50–60% TM) is the size stimulus. Forever BBB uses 5s Pro (no AMRAP) so you finish those sets with quality. Save AMRAP for a later Anchor cycle (e.g. FSL).';
            const TRAINING_MAX_NOTE = 'Typically, 85–90% of 1RM as your Training Max.';

            function renderSetupNotesBody() {
                const body = document.getElementById('setup-notes-body');
                if (!body) return;

                const progressionItems = [
                    'After each 4-week cycle:',
                    `Increase upper body lifts (Bench, OHP) by ${STANDARD_UPPER_INC_LBS} lbs`,
                    `Increase lower body lifts (Squat, Deadlift) by ${STANDARD_LOWER_INC_LBS} lbs`,
                    getProgressionAmrapTipText(),
                ];
                if (showProgressionAdjustTip()) {
                    progressionItems.push('Adjust slower if AMRAP sets are challenging');
                }

                const selectedTemplate = accessorySelect.value;
                const templateExplanation = explanations[selectedTemplate] || '';
                const bbbHelperText = getBbbTemplateHelperText();
                const showBbbSection = selectedTemplate === 'bbb-forever' || selectedTemplate === 'bbb';

                let html = `
                    <section class="setup-notes-section">
                        <h4>Progression Guide</h4>
                        <ul class="setup-notes-list">
                            ${progressionItems.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </section>
                    <section class="setup-notes-section">
                        <h4>Training Max</h4>
                        <p>${TRAINING_MAX_NOTE}</p>
                    </section>
                    <section class="setup-notes-section">
                        <h4>Accessory Template</h4>
                        <p>${templateExplanation}</p>
                    </section>`;

                if (showBbbSection) {
                    html += `
                    <section class="setup-notes-section">
                        <h4>Boring But Big</h4>
                        <p>${BBB_SUPPLEMENTAL_NOTE}</p>`;
                    if (bbbHelperText) {
                        html += `<p>${bbbHelperText}</p>`;
                    }
                    html += `
                        <p><strong>AMRAP vs 5s Pro?</strong> ${BBB_AMRAP_VS_5S_PRO_NOTE}</p>
                    </section>`;
                }

                body.innerHTML = html;
            }

            const setupNotesModal = document.getElementById('setup-notes-modal');
            const setupNotesButton = document.getElementById('setup-notes-button');
            const closeSetupNotesButton = document.getElementById('close-setup-notes');

            function showSetupNotesModal() {
                if (!setupNotesModal) return;
                renderSetupNotesBody();
                setupNotesModal.hidden = false;
            }

            function hideSetupNotesModal() {
                if (!setupNotesModal) return;
                setupNotesModal.hidden = true;
            }

            if (setupNotesButton) {
                setupNotesButton.addEventListener('click', showSetupNotesModal);
            }

            if (closeSetupNotesButton) {
                closeSetupNotesButton.addEventListener('click', hideSetupNotesModal);
            }

            if (setupNotesModal) {
                setupNotesModal.addEventListener('click', (e) => {
                    if (e.target === setupNotesModal) {
                        hideSetupNotesModal();
                    }
                });
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && setupNotesModal && !setupNotesModal.hidden) {
                    hideSetupNotesModal();
                }
            });
            
            // Quiz functionality
            function showQuiz() {
                quizModal.style.display = 'flex';
                currentQuestion = 0;
                quizAnswers = [];
                displayQuestion();
            }
            
            function hideQuiz() {
                quizModal.style.display = 'none';
            }
            
            function displayQuestion() {
                const question = quizData[currentQuestion];
                questionText.textContent = `Question ${currentQuestion + 1} of ${quizData.length}`;
                questionContent.textContent = question.question;
                
                // Clear previous options
                quizOptions.innerHTML = '';
                
                // Add new options
                question.options.forEach((option, index) => {
                    const optionElement = document.createElement('div');
                    optionElement.className = 'quiz-option';
                    optionElement.textContent = option.text;
                    optionElement.dataset.index = index;
                    
                    // Check if this option was previously selected
                    if (quizAnswers[currentQuestion] === index) {
                        optionElement.classList.add('selected');
                    }
                    
                    optionElement.addEventListener('click', () => {
                        // Remove selection from other options
                        quizOptions.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
                        // Add selection to clicked option
                        optionElement.classList.add('selected');
                        // Store answer
                        quizAnswers[currentQuestion] = index;
                        // Enable next button
                        nextButton.disabled = false;
                    });
                    
                    quizOptions.appendChild(optionElement);
                });
                
                // Update progress
                const progress = ((currentQuestion + 1) / quizData.length) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${currentQuestion + 1}/${quizData.length}`;
                
                // Update navigation buttons
                prevButton.disabled = currentQuestion === 0;
                nextButton.disabled = quizAnswers[currentQuestion] === undefined;
                
                // Update next button text
                if (currentQuestion === quizData.length - 1) {
                    nextButton.textContent = 'Get My Recommendation';
                } else {
                    nextButton.textContent = 'Next';
                }
            }
            
            function calculateRecommendation() {
                const scores = { standard: 0, 'bbb-forever': 0, fsl: 0, triumvirate: 0, beginners: 0 };
                
                // Calculate total scores
                quizAnswers.forEach((answerIndex, questionIndex) => {
                    const option = quizData[questionIndex].options[answerIndex];
                    Object.keys(scores).forEach(template => {
                        scores[template] += option.scores[template];
                    });
                });
                
                // Find the template with the highest score
                const recommendation = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
                
                return recommendation;
            }
            
            function showRecommendation() {
                const recommendation = calculateRecommendation();
                const templateNames = {
                    standard: 'Standard Template',
                    'bbb-forever': 'Forever BBB (Leader/Anchor cycles)',
                    fsl: 'First Set Last (FSL)',
                    triumvirate: 'Triumvirate',
                    beginners: 'Strength for Beginners'
                };
                
                // Update the select dropdown
                accessorySelect.value = recommendation;
                accessoryTemplate = recommendation;

                updateBbbAccessoryInputsVisibility();
                
                // If workout plan exists, regenerate it
                if (workoutPlan.weeks && Object.keys(workoutPlan.weeks).length > 0) {
                    generateWorkoutPlan();
                }
                
                // Save profile
                saveProfile();
                
                // Hide quiz
                hideQuiz();
                
                // Show success message
                alert(`Based on your answers, we recommend the ${templateNames[recommendation]}! Your workout plan has been updated.`);
            }
            
            // Quiz event listeners
            if (quizButton) quizButton.addEventListener('click', showQuiz);
            if (closeQuiz) closeQuiz.addEventListener('click', hideQuiz);
            
            // Close quiz when clicking outside
            if (quizModal) quizModal.addEventListener('click', (e) => {
                if (e.target === quizModal) {
                    hideQuiz();
                }
            });
            
            if (prevButton) prevButton.addEventListener('click', () => {
                if (currentQuestion > 0) {
                    currentQuestion--;
                    displayQuestion();
                }
            });
            
            if (nextButton) nextButton.addEventListener('click', () => {
                if (currentQuestion < quizData.length - 1) {
                    currentQuestion++;
                    displayQuestion();
                } else {
                    showRecommendation();
                }
            });

            // Setup AMRAP logging event listeners
            function setupAmrapListeners() {
                const exercises = ['squat', 'bench', 'deadlift', 'ohp'];
                
                exercises.forEach(exercise => {
                    const repsInput = document.getElementById(`amrap-reps-${exercise}`);
                    if (repsInput) {
                        repsInput.addEventListener('input', () => {
                            const reps = parseInt(repsInput.value);
                            if (reps >= 0) {
                                showAmrapOptions(exercise, reps);
                            } else {
                                hideAmrapOptions(exercise);
                            }
                        });
                    }
                    
                    // Setup undo button if it exists
                    const undoBtn = document.getElementById(`amrap-undo-${exercise}`);
                    if (undoBtn) {
                        undoBtn.addEventListener('click', () => {
                            undoAmrapDecision(exercise);
                        });
                    }
                });
            }
            
            // Show AMRAP progression options based on reps
            function showAmrapOptions(exercise, reps) {
                const recommendationsDiv = document.getElementById(`amrap-recommendations-${exercise}`);
                const submitBtn = document.getElementById(`amrap-submit-${exercise}`);
                
                if (!recommendationsDiv || !submitBtn) return;
                
                let optionsHtml = '<p style="margin-bottom: 0.75rem; font-weight: 600;">Choose your progression:</p>';
                
                if (reps >= 5) {
                    // 5+ reps: Earned the increase
                    const isUpperBody = exercise === 'bench' || exercise === 'ohp';
                    const increase = isUpperBody ? 5 : 10;
                    
                    optionsHtml += `
                        <div class="amrap-option recommended" onclick="selectAmrapOption('${exercise}', 'earned', ${increase})">
                            <input type="radio" name="amrap-${exercise}" value="earned">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    ✅ Earned Increase (+${increase} lbs)
                                    <span class="recommendation-badge badge-recommended">RECOMMENDED</span>
                                </div>
                                <div class="amrap-option-description">
                                    Perfect! Your TM is set correctly. Add ${increase} lbs for next cycle.
                                </div>
                            </div>
                        </div>`;
                } else if (reps >= 2 && reps <= 4) {
                    // 2-4 reps: Warning zone
                    const isUpperBody = exercise === 'bench' || exercise === 'ohp';
                    const increase = isUpperBody ? 5 : 10;
                    
                    optionsHtml += `
                        <div class="amrap-option warning" onclick="selectAmrapOption('${exercise}', 'smart', 0)">
                            <input type="radio" name="amrap-${exercise}" value="smart">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    🟡 Smart: Keep Same Weight (0 lbs)
                                    <span class="recommendation-badge badge-recommended">RECOMMENDED</span>
                                </div>
                                <div class="amrap-option-description">
                                    Your TM is getting heavy. Repeat the cycle with the same weight and beat your reps.
                                </div>
                            </div>
                        </div>
                        <div class="amrap-option warning" onclick="selectAmrapOption('${exercise}', 'aggressive', ${increase})">
                            <input type="radio" name="amrap-${exercise}" value="aggressive">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    ⚡ Aggressive: Add Weight (+${increase} lbs)
                                    <span class="recommendation-badge badge-warning">RISKY</span>
                                </div>
                                <div class="amrap-option-description">
                                    Warning: Next cycle will be very difficult. Only choose if you're confident.
                                </div>
                            </div>
                        </div>`;
                } else if (reps >= 0 && reps <= 1) {
                    // 0-1 rep: Failed - must decrease
                    optionsHtml += `
                        <div class="amrap-option danger" onclick="selectAmrapOption('${exercise}', 'decrease', -10)">
                            <input type="radio" name="amrap-${exercise}" value="decrease">
                            <div class="amrap-option-content">
                                <div class="amrap-option-title">
                                    🔴 Decrease TM (-10%)
                                    <span class="recommendation-badge badge-danger">REQUIRED</span>
                                </div>
                                <div class="amrap-option-description">
                                    Your TM is too high. You must lower it by 10% before starting the next cycle.
                                </div>
                            </div>
                        </div>`;
                }
                
                recommendationsDiv.innerHTML = optionsHtml;
                recommendationsDiv.style.display = 'block';
                // No need to show submit button - decision applies automatically
                submitBtn.style.display = 'none';
            }
            
            // Hide AMRAP options
            function hideAmrapOptions(exercise) {
                const recommendationsDiv = document.getElementById(`amrap-recommendations-${exercise}`);
                const submitBtn = document.getElementById(`amrap-submit-${exercise}`);
                
                if (recommendationsDiv) recommendationsDiv.style.display = 'none';
                if (submitBtn) submitBtn.style.display = 'none';
            }
            
            // Global variable to track selected option
            let selectedAmrapOptions = {};
            
            // Select AMRAP option
            function selectAmrapOption(exercise, decision, weightChange) {
                selectedAmrapOptions[exercise] = { decision, weightChange };
                
                // Update UI to show selection
                const recommendationsDiv = document.getElementById(`amrap-recommendations-${exercise}`);
                if (recommendationsDiv) {
                    const allOptions = recommendationsDiv.querySelectorAll('.amrap-option');
                    allOptions.forEach(opt => opt.classList.remove('selected'));
                    
                    const selectedOption = Array.from(allOptions).find(opt => 
                        opt.querySelector(`input[value="${decision}"]`)
                    );
                    if (selectedOption) {
                        selectedOption.classList.add('selected');
                        selectedOption.querySelector('input').checked = true;
                    }
                }
                
                // Automatically apply the decision when radio button is selected
                applyAmrapDecision(exercise);
            }
            
            // Make selectAmrapOption globally available
            window.selectAmrapOption = selectAmrapOption;
            
            // Undo AMRAP decision
            function undoAmrapDecision(exercise) {
                const amrapData = amrapResults[exercise];
                
                if (!amrapData || amrapData.reps === undefined) {
                    alert('No AMRAP decision to undo.');
                    return;
                }
                
                if (!confirm(`Undo AMRAP decision for ${exercise.toUpperCase()}?\n\nThis will clear your logged performance.`)) {
                    return;
                }
                
                delete amrapResults[exercise];
                saveProfile();
                updateAmrapUI(exercise);
                updateLevelUpButtonStatus();
            }
            
            // Apply AMRAP decision
            function applyAmrapDecision(exercise) {
                const repsInput = document.getElementById(`amrap-reps-${exercise}`);
                const selectedOption = selectedAmrapOptions[exercise];
                
                if (!repsInput || !selectedOption) return;
                
                const reps = parseInt(repsInput.value);
                const { decision } = selectedOption;
                
                const decisionText = decision === 'earned'
                    ? `Earned +${getStandardIncrement(exercise)}lbs`
                    : decision === 'smart'
                        ? 'Keep same weight (Smart)'
                        : decision === 'aggressive'
                            ? `Add +${getStandardIncrement(exercise)}lbs (Aggressive)`
                            : 'Decrease TM by 10%';
                
                amrapResults[exercise] = {
                    reps,
                    decision,
                    decisionText,
                };
                
                saveProfile();
                updateAmrapUI(exercise);
                updateLevelUpButtonStatus();
            }
            
            // Update level up button status
            function updateLevelUpButtonStatus() {
                const levelUpButton = document.getElementById('level-up-button');
                if (!levelUpButton) return; // Button not visible (not on Week 4 last day)
                
                const allLogged = areAllAmrapSetsLogged();
                const missingExercises = [];
                
                // Find which exercises are missing AMRAP logs
                ['squat', 'bench', 'deadlift', 'ohp'].forEach(exercise => {
                    const has1RM = parseFloat(document.getElementById(`${exercise}-1rm`).value) > 0;
                    const hasLogged = amrapResults[exercise] && amrapResults[exercise].reps !== undefined;
                    if (has1RM && !hasLogged) {
                        missingExercises.push(exercise.toUpperCase());
                    }
                });
                
                // Find the warning message div (next sibling)
                let warningDiv = levelUpButton.nextElementSibling;
                if (warningDiv && !warningDiv.classList.contains('notes')) {
                    warningDiv = null;
                }
                
                if (allLogged) {
                    // Enable button
                    levelUpButton.disabled = false;
                    levelUpButton.style.opacity = '1';
                    levelUpButton.style.cursor = 'pointer';
                    levelUpButton.textContent = 'LEVEL UP! (Complete Cycle & Increase Weights)';
                    
                    // Remove warning message if it exists
                    if (warningDiv && warningDiv.querySelector('strong')?.textContent === '⚠️ Cannot Level Up Yet') {
                        warningDiv.remove();
                    }
                } else {
                    // Disable button
                    levelUpButton.disabled = true;
                    levelUpButton.style.opacity = '0.5';
                    levelUpButton.style.cursor = 'not-allowed';
                    levelUpButton.textContent = 'LEVEL UP! (Log Week 3 AMRAP Sets First)';
                    
                    // Add or update warning message
                    if (!warningDiv || !warningDiv.querySelector('strong')?.textContent.includes('Cannot Level Up Yet')) {
                        const newWarning = document.createElement('div');
                        newWarning.className = 'notes';
                        newWarning.style.marginTop = '1rem';
                        newWarning.style.backgroundColor = '#fff3e1';
                        newWarning.style.borderLeftColor = '#ff9800';
                        newWarning.innerHTML = `
                            <p><strong>⚠️ Cannot Level Up Yet</strong></p>
                            <p>Please log your Week 3 AMRAP performance for: <strong>${missingExercises.join(', ')}</strong></p>
                            <p>Go to Week 3, complete your 1+ sets, and log your results to unlock progression.</p>
                        `;
                        levelUpButton.parentElement.appendChild(newWarning);
                    } else if (warningDiv) {
                        // Update existing warning with current missing exercises
                        warningDiv.innerHTML = `
                            <p><strong>⚠️ Cannot Level Up Yet</strong></p>
                            <p>Please log your Week 3 AMRAP performance for: <strong>${missingExercises.join(', ')}</strong></p>
                            <p>Go to Week 3, complete your 1+ sets, and log your results to unlock progression.</p>
                        `;
                    }
                }
            }
            
            // Update AMRAP UI for a specific exercise
            function updateAmrapUI(exercise) {
                const amrapData = amrapResults[exercise] || {};
                const hasLogged = amrapData.reps !== undefined;
                
                // Find the amrap-logging container directly by class and exercise name pattern
                const allAmrapContainers = document.querySelectorAll('.amrap-logging');
                let amrapContainer = null;
                
                // Find the container that has elements with this exercise name in their IDs
                for (let container of allAmrapContainers) {
                    const inputField = container.querySelector(`#amrap-reps-${exercise}`);
                    const undoBtn = container.querySelector(`#amrap-undo-${exercise}`);
                    const submitBtn = container.querySelector(`#amrap-submit-${exercise}`);
                    
                    if (inputField || undoBtn || submitBtn) {
                        amrapContainer = container;
                        break;
                    }
                }
                
                if (!amrapContainer) return;
                
                // Build new HTML content
                let html = `
                    <h4>📊 Log Your Performance</h4>
                    <p style="margin-bottom: 1rem; font-size: 0.95rem;">
                        Your performance on this 1+ set determines your progression for the next cycle.
                    </p>`;
                
                if (hasLogged) {
                    html += `
                        <div class="amrap-status logged">
                            <strong>✓ Logged:</strong> ${amrapData.reps} reps completed | 
                            <strong>Decision:</strong> ${amrapData.decisionText || amrapData.decision}
                        </div>
                        <button id="amrap-undo-${exercise}" class="amrap-submit-btn" style="background-color: var(--accent);">
                            Undo Decision
                        </button>`;
                } else {
                    html += `
                        <div class="amrap-input-group">
                            <label for="amrap-reps-${exercise}">Reps completed on 1+ set:</label>
                            <input type="number" id="amrap-reps-${exercise}" min="0" max="20" placeholder="0">
                        </div>
                        
                        <div id="amrap-recommendations-${exercise}" class="amrap-recommendations" style="display: none;">
                            <!-- Options will be populated by JavaScript -->
                        </div>
                        
                        <button id="amrap-submit-${exercise}" class="amrap-submit-btn" style="display: none;">
                            Apply Progression Decision
                        </button>`;
                }
                
                // Update the container HTML
                amrapContainer.innerHTML = html;
                
                // Re-attach event listeners for this specific exercise
                const repsInput = document.getElementById(`amrap-reps-${exercise}`);
                if (repsInput) {
                    repsInput.addEventListener('input', () => {
                        const reps = parseInt(repsInput.value);
                        if (reps >= 0) {
                            showAmrapOptions(exercise, reps);
                        } else {
                            hideAmrapOptions(exercise);
                        }
                    });
                }
                
                // Setup undo button if it exists
                const undoBtn = document.getElementById(`amrap-undo-${exercise}`);
                if (undoBtn) {
                    undoBtn.addEventListener('click', () => {
                        undoAmrapDecision(exercise);
                    });
                }
            }
            
            function handleBbbForeverPhaseTransition() {
                if (accessoryTemplate !== 'bbb-forever') return null;

                if (bbbForeverPhase === 'leader') {
                    bbbLeaderCyclesCompleted++;
                    if (bbbLeaderCyclesCompleted >= BBB_FOREVER_LEADER_CYCLES) {
                        const startAnchor = confirm(
                            'You\'ve completed 2 Forever BBB leader cycles.\n\n' +
                            'Start an Anchor cycle?\n' +
                            '• Main lifts: AMRAP top sets (5+/3+/1+)\n' +
                            '• Supplemental: FSL 5×5 (lower volume than BBB)\n' +
                            '• Assistance: 50–100 total reps\n\n' +
                            'Click OK to start Anchor, or Cancel to run another leader cycle.'
                        );
                        bbbLeaderCyclesCompleted = 0;
                        if (startAnchor) {
                            bbbForeverPhase = 'anchor';
                            return 'started-anchor';
                        }
                        return 'leader-continued';
                    }
                    return 'leader';
                }

                const returnLeader = confirm(
                    'Anchor cycle complete.\n\n' +
                    'Return to Forever BBB leader phase?\n' +
                    '• Main lifts: 5s Pro (no AMRAP)\n' +
                    '• Supplemental: BBB 5×10\n\n' +
                    'Click OK to resume leaders, or Cancel to run another anchor cycle.'
                );
                if (returnLeader) {
                    bbbForeverPhase = 'leader';
                    bbbLeaderCyclesCompleted = 0;
                    return 'returned-leader';
                }
                return 'anchor-continued';
            }
        });
