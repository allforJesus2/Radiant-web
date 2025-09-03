# Radiant Web Application - Menu Tree

This document outlines the complete navigation structure and menu hierarchy of the Radiant web application, a comprehensive health and fitness tracking platform.

## Main Navigation (Home Page - index.html)

The application's main dashboard provides access to all core features through a centralized menu:

```
🏠 HOME (index.html)
├── 🍎 Nutrition → checkProfileAndNavigate()
├── 🏋️‍♀️ Exercise → workout/531.html
├── 💤 Sleep → sleep.html
├── 👤 Profile → profile.html
├── 📊 Analysis → charts.html
└── ⚙️ Settings → settings.html
```

## Detailed Menu Structure

### 1. 🍎 Nutrition Module
**Entry Point:** `nutrition.html` (with profile validation)

#### Nutrition Settings Panel
- **Fetch and Store CSV Data** - Food database management
- **Meal Times** → `set_meal_times.html`
- **Create Recipe** → `create-recipe.html`
- **Clear Local Storage** - Data management
- **Profile** → `profile.html`
- **Nutrient Analysis** - Food analysis tools
- **Debug** → `debug.html`
- **Delete 'csvDB' IndexedDB** - Database management
- **Download Food Data** - Export functionality
- **Upload Custom Food Database** - Import functionality

#### Navigation Links in Nutrition
- **Recipes** → `create-recipe.html`
- **Home** → `index.html`

### 2. 🏋️‍♀️ Exercise Module
**Entry Point:** `workout/531.html`

#### Workout Navigation Bar
```
Home | Today's Workout | Workout Routines | Schedule
```

#### Exercise Sub-Menu Structure
```
🏋️‍♀️ EXERCISE
├── 📅 Today's Workout (workout.html)
│   ├── Home → index.html
│   ├── Today's Workout → workout.html
│   ├── Workout Routines → workout_routine.html
│   └── Schedule → set_workout_day.html
├── 🏃‍♂️ Workout Programs
│   ├── 5/3/1 Program → workout/531.html
│   └── GZCL Program → workout/gzcl.html
├── 📋 Workout Routines → workout_routine.html
├── ✏️ Edit Workout Routine → edit_workout_routine.html
├── 📅 Set Workout Schedule → set_workout_day.html
└── 🎯 Five-Three-One Routine → five-three-one/exersize-routine.html
```

### 3. 👤 Profile Setup Flow
**Progressive Configuration System**

#### Profile Setup Steps (navigation.js)
```
PROFILE SETUP WIZARD
├── Step 1: Profile → profile.html
├── Step 2: BMR → calculate_bmr.html
├── Step 3: Activity → set_activity_level.html
├── Step 4: Macros → set_macros.html
├── Step 5: Time → set_time.html
└── Step 6: Complete → nutrition.html
```

#### Profile Page Actions
- **Save Profile**
- **Download Profile**
- **Upload Profile**
- **NEXT: Set BMR** → Continues to BMR calculation

### 4. 📊 Analysis Module
**Entry Point:** `charts.html`
- Data visualization and analytics
- Health metrics tracking
- Progress monitoring

### 5. 💤 Sleep Module
**Entry Point:** `sleep.html`
- Sleep tracking functionality
- Sleep pattern analysis

### 6. ⚙️ Settings Module
**Entry Point:** `settings.html`

#### Settings Options
```
⚙️ SETTINGS
├── 📥 Download All Data - Backup functionality
├── 📤 Upload Data - Restore functionality
└── 🏠 Home → index.html
```

## Navigation Features

### Smart Profile Navigation
The nutrition button implements intelligent routing:
- **Profile Complete**: Direct access to `nutrition.html`
- **Profile Incomplete**: User choice between profile setup or skip to nutrition

### Daily Verse Feature
The home page displays random Bible verses for daily inspiration.

### Progressive Web App (PWA)
- Service worker implementation for offline functionality
- Automatic updates with user confirmation

### Data Management
- Local storage for user data
- IndexedDB for food database
- Import/export functionality across modules

## File Structure Summary

```
📁 public/
├── 🏠 index.html (Main Dashboard)
├── 🍎 nutrition.html (Nutrition Tracking)
├── 👤 profile.html (User Profile)
├── 📊 charts.html (Analytics)
├── 💤 sleep.html (Sleep Tracking)
├── ⚙️ settings.html (App Settings)
├── 🔍 debug.html (Debug Tools)
├── 📝 create-recipe.html (Recipe Creation)
├── 📁 workout/
│   ├── 531.html (5/3/1 Program)
│   └── gzcl.html (GZCL Program)
├── 🏋️‍♀️ workout.html (Today's Workout)
├── 📋 workout_routine.html (Routine Management)
├── ✏️ edit_workout_routine.html (Routine Editor)
├── 📅 set_workout_day.html (Schedule)
├── 📁 five-three-one/
│   └── exersize-routine.html
├── 🔧 Profile Setup Pages:
│   ├── calculate_bmr.html
│   ├── set_activity_level.html
│   ├── set_macros.html
│   ├── set_time.html
│   └── set_meal_times.html
├── 🎨 Styling & Scripts:
│   ├── dark-theme.css
│   ├── navigation.css
│   ├── navigation.js
│   └── service-worker.js
└── 📁 assets/
    └── FoodData.csv
```

## Key Navigation Patterns

1. **Centralized Dashboard**: All main features accessible from home page
2. **Progressive Setup**: Guided profile configuration with step tracking
3. **Context-Aware Navigation**: Smart routing based on profile completion
4. **Consistent Navigation Bars**: Uniform navigation across workout modules
5. **Breadcrumb Support**: Clear path indication in multi-step processes
6. **Home Button Access**: Consistent return-to-home functionality across all pages

This menu structure provides a comprehensive fitness and health tracking experience with intuitive navigation and progressive user onboarding.
