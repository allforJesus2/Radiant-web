/**
 * Shared workout item HTML rendering (531-style markup).
 */
function renderWorkoutItem(timerType, timerId, label, detail, options) {
    options = options || {};
    const classes = ['workout-item'];
    if (options.amrap) classes.push('amrap');
    if (options.extraClass) classes.push(options.extraClass);

    const suggestionsHtml = options.suggestions && options.suggestions.length
        ? `<span class="workout-item-suggestions"><em>Suggestions:</em> ${options.suggestions.join(', ')}</span>`
        : '';
    const noteHtml = options.note
        ? `<span class="workout-item-suggestions"><em>${options.note}</em></span>`
        : '';
    const notesBlock = suggestionsHtml || noteHtml
        ? `<div class="set-detail-notes">${suggestionsHtml}${noteHtml}</div>`
        : '';

    if (options.setDetail) {
        const sd = options.setDetail;
        const repText = sd.amrap ? `${sd.reps} AMRAP` : `${sd.reps} reps`;
        const weightText = sd.weight != null && sd.weight !== '' ? `${sd.weight}` : '—';
        const fourthCell = sd.meta != null
            ? `<span class="set-detail-cell set-detail-meta">${sd.meta}</span>`
            : `<span class="set-detail-cell set-detail-tm">${sd.percentage}% TM</span>`;

        classes.push('workout-item-set-row');
        const restAttr = sd.restSeconds != null ? ` data-rest-seconds="${sd.restSeconds}"` : '';
        return `
            <div class="${classes.join(' ')}">
                <span class="set-detail-set workout-item-label">${label}</span>
                <span class="set-detail-cell set-detail-reps">${repText}</span>
                <span class="set-detail-cell set-detail-weight">${weightText}</span>
                ${fourthCell}
                <button type="button" class="rest-timer-btn set-detail-timer" data-timer-type="${timerType}" data-timer-id="${timerId}"${restAttr} title="Start rest timer">⏰</button>
                ${notesBlock}
            </div>`;
    }

    const restAttr = options.restSeconds != null ? ` data-rest-seconds="${options.restSeconds}"` : '';
    return `
        <div class="${classes.join(' ')}">
            <div class="workout-item-body">
                <span class="workout-item-label">${label}</span>
                <span class="workout-item-detail">${detail}</span>
                ${suggestionsHtml}${noteHtml}
            </div>
            <button type="button" class="rest-timer-btn" data-timer-type="${timerType}" data-timer-id="${timerId}"${restAttr} title="Start rest timer">⏰</button>
        </div>`;
}

function renderCustomExercise(exercise, exerciseIndex, dayKey) {
    const name = exercise.name || 'Exercise';
    const sets = exercise.sets || 3;
    const reps = exercise.reps || '-';
    const weightUnit = exercise.weightUnit || 'lbs';
    const weight = exercise.weight;
    const restSeconds = exercise.restTime || 90;
    const time = exercise.time;
    const timeUnit = exercise.timeUnit || 'sec';
    const isTimeBased = time && !weight && !reps;
    const isStrength = !isTimeBased;

    let badges = '';
    if (exercise.amrap) badges += ' <span class="badge badge-amrap">AMRAP</span>';
    if (exercise.progression && exercise.progression.enabled) {
        badges += ` <span class="badge badge-progression">+${exercise.progression.increment}${weightUnit}</span>`;
    }

    let notes = [];
    if (exercise.oneRepMax) notes.push(`1RM: ${exercise.oneRepMax}${weightUnit}`);
    if (exercise.rpe) notes.push(`RPE: ${exercise.rpe}`);
    if (exercise.notes) notes.push(exercise.notes);
    const notesHtml = notes.length
        ? `<div class="exercise-notes">${notes.join(' • ')}</div>`
        : '';

    let itemsHtml = '';

    if (isStrength) {
        const weightLabel = weight ? `${weight} ${weightUnit}` : '—';
        for (let s = 0; s < sets; s++) {
            const timerId = `custom-${dayKey}-ex${exerciseIndex}-set${s}`;
            itemsHtml += renderWorkoutItem('main', timerId, `Set ${s + 1}`, '', {
                amrap: exercise.amrap,
                setDetail: {
                    reps: reps,
                    weight: weightLabel,
                    meta: `${restSeconds}s rest`,
                    amrap: exercise.amrap,
                    restSeconds: restSeconds
                }
            });
        }
    } else {
        const timeLabel = timeUnit === 'min' ? `${time} min` : `${time} sec`;
        const detail = sets > 1 ? `${sets} sets × ${timeLabel}` : timeLabel;
        const timerId = `custom-${dayKey}-ex${exerciseIndex}`;
        itemsHtml += renderWorkoutItem('main', timerId, name, detail, {
            restSeconds: restSeconds
        });
    }

    const stackClass = isStrength ? 'workout-stack set-stack custom-set-stack' : 'workout-stack';

    return `
        <div class="workout-section">
            <h4>${name}${badges}</h4>
            <div class="${stackClass}">${itemsHtml}</div>
            ${notesHtml}
        </div>`;
}
