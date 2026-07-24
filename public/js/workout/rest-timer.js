/**
 * Shared rest timer for custom workout pages.
 */
const RestTimer = (function () {
    let displayEl = null;
    let timerInterval = null;
    let currentTimer = null;
    let onCompleteCallback = null;
    let defaultRestSeconds = 90;

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
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

    function getRestSeconds(btn) {
        const fromBtn = parseInt(btn.dataset.restSeconds, 10);
        if (Number.isFinite(fromBtn) && fromBtn > 0) return fromBtn;
        return defaultRestSeconds;
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (currentTimer) {
            const btn = document.querySelector(`.rest-timer-btn[data-timer-id="${currentTimer.id}"]`);
            if (btn) btn.classList.remove('active');
        }
        currentTimer = null;
        if (displayEl) {
            displayEl.classList.remove('active');
        }
    }

    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) {
            /* audio optional */
        }
    }

    function startTimer(timerId, timerType, btn, options) {
        options = options || {};
        stopTimer();

        const restTime = getRestSeconds(btn);
        btn.textContent = '⏰';
        btn.classList.remove('complete');
        btn.classList.add('active');

        currentTimer = {
            id: timerId,
            type: timerType,
            timeLeft: restTime,
            btn: btn,
            skipIncrement: !!options.skipIncrementOnComplete,
            existingCount: options.completionCount != null
                ? parseInt(options.completionCount, 10)
                : parseInt(btn.dataset.completionCount || '0', 10)
        };

        if (displayEl) {
            displayEl.classList.add('active');
            displayEl.textContent = formatTime(restTime);
        }

        timerInterval = setInterval(function () {
            if (!currentTimer) return;
            currentTimer.timeLeft--;
            if (displayEl) displayEl.textContent = formatTime(currentTimer.timeLeft);

            if (currentTimer.timeLeft <= 0) {
                const completedId = currentTimer.id;
                const completedBtn = currentTimer.btn;
                const skipIncrement = currentTimer.skipIncrement;
                const existingCount = currentTimer.existingCount;
                stopTimer();

                let completionCount;
                if (skipIncrement) {
                    completionCount = existingCount;
                } else {
                    completionCount = existingCount + 1;
                }
                applyTimerButtonState(completedBtn, completionCount);
                if (onCompleteCallback) {
                    onCompleteCallback(completedId, completionCount);
                }
                playBeep();
            }
        }, 1000);
    }

    function repeatTimer(btn) {
        const timerId = btn.dataset.timerId;
        const timerType = btn.dataset.timerType || 'main';
        const count = parseInt(btn.dataset.completionCount || '1', 10);
        const nextCount = count + 1;
        applyTimerButtonState(btn, nextCount);
        if (onCompleteCallback) {
            onCompleteCallback(timerId, nextCount);
        }
        startTimer(timerId, timerType, btn, {
            skipIncrementOnComplete: true,
            completionCount: nextCount
        });
    }

    function init(options) {
        options = options || {};
        displayEl = document.getElementById(options.displayId || 'rest-timer-display');
        onCompleteCallback = options.onComplete || null;
        defaultRestSeconds = options.defaultRestSeconds || 90;

        document.addEventListener('click', function (e) {
            const btn = e.target.closest('.rest-timer-btn');
            if (!btn) return;

            if (btn.classList.contains('complete') || (btn.textContent && btn.textContent.includes('✓'))) {
                repeatTimer(btn);
                return;
            }

            startTimer(btn.dataset.timerId, btn.dataset.timerType || 'main', btn);
        });
    }

    function restoreButtonStates(completionState) {
        if (!completionState) return;
        Object.keys(completionState).forEach(function (timerId) {
            const btn = document.querySelector(`.rest-timer-btn[data-timer-id="${timerId}"]`);
            if (btn) applyTimerButtonState(btn, completionState[timerId]);
        });
    }

    return {
        init: init,
        formatTime: formatTime,
        applyTimerButtonState: applyTimerButtonState,
        restoreButtonStates: restoreButtonStates,
        stopTimer: stopTimer
    };
})();
