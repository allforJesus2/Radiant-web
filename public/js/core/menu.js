// Centralized menu configuration and setup
const MENU_ITEMS = [
    { text: '🏠 Home', href: 'index.html' },
    { text: '📋 Notes', href: 'notes.html' },
    { text: '🍎 Nutrition', href: 'nutrition.html' },
    { text: '🍽️ Meal Plan', href: 'meal-plan.html' },
    { text: '📝 Create Meal Plan', href: 'create-meal-plan.html' },
    { text: '⏰ Meal Times', href: 'set-meal-times.html' },
    { text: '📝 Recipes', href: 'create-recipe.html' },
    { text: '🏋️‍♀️ 5/3/1 Workout', href: 'workout/531.html' },
    { text: '💤 Sleep', href: 'notes.html#sleep' },
    { text: '📊 Analysis', href: 'charts.html' },
    { text: '👤 Profile', href: 'profile.html' },
    { text: '⚙️ Settings', href: 'settings.html' },
    { text: '❌ Close Menu', action: 'close' }
];

function resolveMenuHref(href, basePath) {
    if (!href || !basePath) return href;
    return basePath + href;
}

function setupHeader(headerText = null, options = {}) {
    const basePath = options.basePath != null ? options.basePath : '';
    const showCenter = options.showCenter !== false;

    const dateHeader = document.getElementById('dateHeader');
    dateHeader.style.display = 'flex';
    dateHeader.style.justifyContent = 'space-between';
    dateHeader.style.alignItems = 'center';
    dateHeader.style.position = 'relative';

    if (showCenter) {
        const headerContainer = document.createElement('div');
        headerContainer.className = 'header-date-center';
        headerContainer.textContent =
            headerText != null && headerText !== ''
                ? headerText
                : new Date().toLocaleDateString('en-CA');
        headerContainer.style.color = 'white';
        headerContainer.style.position = 'absolute';
        headerContainer.style.left = '50%';
        headerContainer.style.transform = 'translateX(-50%)';
        headerContainer.style.opacity = '1';
        dateHeader.appendChild(headerContainer);
    }

    const menuContainer = document.createElement('div');
    menuContainer.style.position = 'relative';
    menuContainer.style.marginLeft = 'auto';

    const menuButton = document.createElement('button');
    menuButton.textContent = '☰ Menu';
    menuButton.className = 'btn';
    menuButton.id = 'mainMenuButton';
    menuButton.style.minWidth = '80px';
    menuButton.style.whiteSpace = 'nowrap';

    const popupMenu = document.createElement('div');
    popupMenu.id = 'mainMenuPopup';
    popupMenu.style.display = 'none';
    popupMenu.style.position = 'absolute';
    popupMenu.style.top = '100%';
    popupMenu.style.right = '0';
    popupMenu.style.backgroundColor = 'var(--background-color)';
    popupMenu.style.border = '1px solid var(--border-color, #444)';
    popupMenu.style.borderRadius = '5px';
    popupMenu.style.padding = '10px';
    popupMenu.style.minWidth = '200px';
    popupMenu.style.zIndex = '1000';
    popupMenu.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    popupMenu.style.textAlign = 'left';

    MENU_ITEMS.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.textContent = item.text;
        menuItem.style.padding = '12px 12px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.borderRadius = '3px';
        menuItem.style.marginBottom = '6px';
        menuItem.style.color = 'var(--text-color)';

        menuItem.addEventListener('mouseenter', function () {
            this.style.backgroundColor = 'var(--button)';
        });
        menuItem.addEventListener('mouseleave', function () {
            this.style.backgroundColor = 'transparent';
        });

        menuItem.addEventListener('click', function () {
            if (item.href) {
                window.location.href = resolveMenuHref(item.href, basePath);
            } else if (item.action === 'close') {
                popupMenu.style.display = 'none';
                const blurOverlay = document.getElementById('blurOverlay');
                if (blurOverlay) {
                    blurOverlay.classList.remove('active');
                }
                return;
            }
            popupMenu.style.display = 'none';
            const blurOverlay = document.getElementById('blurOverlay');
            if (blurOverlay) {
                blurOverlay.classList.remove('active');
            }
        });

        popupMenu.appendChild(menuItem);
    });

    menuButton.addEventListener('click', function (e) {
        e.stopPropagation();
        const isVisible = popupMenu.style.display === 'block';
        popupMenu.style.display = isVisible ? 'none' : 'block';

        const blurOverlay = document.getElementById('blurOverlay');
        if (blurOverlay) {
            if (isVisible) {
                blurOverlay.classList.remove('active');
            } else {
                blurOverlay.classList.add('active');
            }
        }
    });

    document.addEventListener('click', function (event) {
        if (!menuContainer.contains(event.target)) {
            popupMenu.style.display = 'none';
            const blurOverlay = document.getElementById('blurOverlay');
            if (blurOverlay) {
                blurOverlay.classList.remove('active');
            }
        }
    });

    menuContainer.appendChild(menuButton);
    menuContainer.appendChild(popupMenu);

    dateHeader.appendChild(menuContainer);
}
