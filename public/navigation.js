// Centralized navigation menu configuration
const NAVIGATION_MENU = [
    { step: 1, title: 'Profile', url: 'profile.html' },
    { step: 2, title: 'BMR', url: 'calculate_bmr.html' },
    { step: 3, title: 'Activity', url: 'set_activity_level.html' },
    { step: 4, title: 'Macros', url: 'set_macros.html' },
    { step: 5, title: 'Time', url: 'set_time.html' },
    { step: 6, title: 'Complete', url: 'nutrition.html' }
];

// Function to navigate to different steps
function navigateToStep(step) {
    const menuItem = NAVIGATION_MENU.find(item => item.step === step);
    if (menuItem) {
        window.location.href = menuItem.url;
    }
}

// Function to get current step from URL
function getCurrentStep() {
    const currentPage = window.location.pathname.split('/').pop();
    const menuItem = NAVIGATION_MENU.find(item => item.url === currentPage);
    return menuItem ? menuItem.step : 1;
}

// Function to render the progress indicator
function renderProgressIndicator() {
    const currentStep = getCurrentStep();
    const progressContainer = document.querySelector('.progress-indicator');
    
    if (progressContainer) {
        progressContainer.innerHTML = NAVIGATION_MENU.map(item => {
            const isActive = item.step === currentStep;
            const activeClass = isActive ? 'active' : '';
            return `<div class="step ${activeClass}" onclick="navigateToStep(${item.step})">${item.step}. ${item.title}</div>`;
        }).join('');
    }
}

// Auto-render progress indicator when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    renderProgressIndicator();
});
