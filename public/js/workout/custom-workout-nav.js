const CUSTOM_WORKOUT_TABS = [
    { id: 'today', label: "Today's Workout", href: 'workout.html' },
    { id: 'routines', label: 'Routines', href: 'workout-routine.html' },
    { id: 'schedule', label: 'Schedule', href: 'set-workout-day.html' },
];

function renderCustomWorkoutNav(activeTab) {
    const container = document.getElementById('customWorkoutNav');
    if (!container) return;

    const tabsEl = document.createElement('nav');
    tabsEl.className = 'custom-workout-tabs';
    tabsEl.setAttribute('aria-label', 'Custom workout sections');

    CUSTOM_WORKOUT_TABS.forEach(function (tab) {
        if (tab.id === activeTab) {
            const span = document.createElement('span');
            span.className = 'custom-workout-tab active';
            span.textContent = tab.label;
            span.setAttribute('aria-current', 'page');
            tabsEl.appendChild(span);
        } else {
            const link = document.createElement('a');
            link.className = 'custom-workout-tab';
            link.href = tab.href;
            link.textContent = tab.label;
            tabsEl.appendChild(link);
        }
    });

    container.appendChild(tabsEl);
}
