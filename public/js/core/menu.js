// Centralized menu configuration and setup.
// Items are grouped; each group renders as a bordered block whose items tile
// into a responsive grid inside the popup.
const MENU_GROUPS = [
    {
        label: 'General',
        items: [
            { text: '🏠 Home', href: 'index.html' },
            { text: '📋 Notes', href: 'notes.html' },
            { text: '💤 Sleep', href: 'notes.html#sleep' },
            { text: '📊 Analysis', href: 'charts.html' },
        ],
    },
    {
        label: 'Food',
        items: [
            { text: '🍎 Nutrition', href: 'nutrition.html' },
            { text: '🍽️ Meal Plan', href: 'meal-plan.html' },
            { text: '📚 Meal Library', href: 'create-meal-plan.html' },
            { text: '⏰ Meal Times', href: 'set-meal-times.html' },
            { text: '📝 Recipes', href: 'create-recipe.html' },
        ],
    },
    {
        label: 'Training',
        items: [
            { text: '🏋️‍♀️ Strength Workout', href: 'workout/strength.html' },
            { text: '📋 Custom Workout', href: 'workout/custom-workout/workout.html' },
        ],
    },
    {
        label: 'Account',
        items: [
            { text: '👤 Profile', href: 'profile.html' },
            { text: '⚙️ Settings', href: 'settings.html' },
            { text: '🐛 Debug', href: 'debug.html' },
        ],
    },
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
    popupMenu.style.width = 'min(92vw, 440px)';
    popupMenu.style.boxSizing = 'border-box';
    popupMenu.style.maxHeight = 'min(80vh, 640px)';
    popupMenu.style.overflowY = 'auto';
    popupMenu.style.zIndex = '1000';
    popupMenu.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    popupMenu.style.textAlign = 'left';

    function setMenuOpen(isOpen) {
        popupMenu.style.display = isOpen ? 'block' : 'none';
        const blurOverlay = document.getElementById('blurOverlay');
        if (blurOverlay) {
            blurOverlay.classList.toggle('active', isOpen);
        }
        dateHeader.style.zIndex = isOpen ? '1001' : '';
    }

    function createMenuItem(item) {
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        menuItem.textContent = item.text;
        menuItem.style.padding = '10px 8px';
        menuItem.style.cursor = 'pointer';
        menuItem.style.borderRadius = '3px';
        menuItem.style.color = 'var(--text-color)';
        menuItem.style.fontSize = '0.9em';
        menuItem.style.lineHeight = '1.3';
        menuItem.style.wordBreak = 'break-word';

        menuItem.addEventListener('mouseenter', function () {
            this.style.backgroundColor = 'var(--button)';
        });
        menuItem.addEventListener('mouseleave', function () {
            this.style.backgroundColor = 'transparent';
        });

        menuItem.addEventListener('click', function () {
            if (item.href) {
                window.location.href = resolveMenuHref(item.href, basePath);
            }
            setMenuOpen(false);
        });

        return menuItem;
    }

    MENU_GROUPS.forEach(group => {
        const groupBox = document.createElement('div');
        groupBox.className = 'menu-group';
        groupBox.style.border = '1px solid var(--border-color, #444)';
        groupBox.style.borderRadius = '6px';
        groupBox.style.padding = '8px';
        groupBox.style.marginBottom = '10px';

        const groupLabel = document.createElement('div');
        groupLabel.textContent = group.label;
        groupLabel.style.fontSize = '0.72em';
        groupLabel.style.textTransform = 'uppercase';
        groupLabel.style.letterSpacing = '0.08em';
        groupLabel.style.color = 'var(--text-muted, #aaa)';
        groupLabel.style.margin = '0 0 6px 4px';
        groupBox.appendChild(groupLabel);

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
        grid.style.gap = '4px';

        group.items.forEach(item => {
            grid.appendChild(createMenuItem(item));
        });

        groupBox.appendChild(grid);
        popupMenu.appendChild(groupBox);
    });

    const closeItem = createMenuItem({ text: '❌ Close Menu' });
    closeItem.style.textAlign = 'center';
    popupMenu.appendChild(closeItem);

    menuButton.addEventListener('click', function (e) {
        e.stopPropagation();
        const isVisible = popupMenu.style.display === 'block';
        setMenuOpen(!isVisible);
    });

    document.addEventListener('click', function (event) {
        if (!menuContainer.contains(event.target)) {
            setMenuOpen(false);
        }
    });

    menuContainer.appendChild(menuButton);
    menuContainer.appendChild(popupMenu);

    dateHeader.appendChild(menuContainer);
}
