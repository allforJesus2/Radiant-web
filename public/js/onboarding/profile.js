    const CHARACTER_FOLDER = 'assets/character images/';
    const CUSTOM_CHARACTER_KEY = '__custom__';
    const MIN_SCALE = 1, MAX_SCALE = 4;
    let characterManifestFiles = [];
    let characterImageViews = {};
    let customCharacterDataUrl = '';
    let didDrag = false;

    const el = id => document.getElementById(id);
    function charUrl(f) {
        if (f === CUSTOM_CHARACTER_KEY) return customCharacterDataUrl || '';
        return CHARACTER_FOLDER + encodeURIComponent(f);
    }
    function currentChar() {
        const v = el('characterImageFilename').value.trim();
        if (v === CUSTOM_CHARACTER_KEY && customCharacterDataUrl) return CUSTOM_CHARACTER_KEY;
        return v || characterManifestFiles[0] || '';
    }
    function clamp(s) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)); }

    function getView(file) {
        const v = characterImageViews[file] || {};
        return { scale: clamp(+v.scale || 1), x: +v.x || 0, y: +v.y || 0 };
    }

    function applyView(file) {
        const vp = el('characterPreviewViewport');
        if (!vp || !file) return;
        const v = getView(file);
        vp.style.setProperty('--char-scale', v.scale);
        vp.style.setProperty('--char-pan-x', v.x + 'px');
        vp.style.setProperty('--char-pan-y', v.y + 'px');
    }

    function saveView(file, v) {
        if (!file) return;
        characterImageViews[file] = { scale: clamp(v.scale), x: v.x, y: v.y };
        applyView(file);
        persistCharacterImage();
    }

    function syncPreview() {
        const file = currentChar(), has = !!file;
        el('characterPreviewToggle').classList.toggle('is-empty', !has);
        el('characterPreviewHint')?.classList.toggle('is-hidden', !has);
        el('characterChangeBtn')?.classList.toggle('is-hidden', !has);
        document.querySelectorAll('#characterImageGrid button.is-selected').forEach(b => b.classList.remove('is-selected'));
        if (has) {
            el('characterPreviewImg').src = charUrl(file);
            el('characterPreviewImg').alt = 'Profile character';
            applyView(file);
            document.querySelector(`#characterImageGrid button[data-character-file="${CSS.escape(file)}"]`)?.classList.add('is-selected');
        } else {
            el('characterPreviewImg').removeAttribute('src');
            el('characterPreviewImg').alt = '';
        }
    }

    function initZoomPan() {
        const vp = el('characterPreviewViewport'), btn = el('characterPreviewToggle');
        if (!vp || !btn) return;
        let ptrs = new Map(), dragStart = null, pinchStart = null;

        btn.addEventListener('click', e => {
            if (didDrag) { e.preventDefault(); e.stopPropagation(); didDrag = false; return; }
            if (btn.classList.contains('is-empty')) toggleCharacterPicker();
        });
        btn.addEventListener('dblclick', e => {
            if (!btn.classList.contains('is-empty')) { e.preventDefault(); saveView(currentChar(), { scale: 1, x: 0, y: 0 }); }
        });
        vp.addEventListener('wheel', e => {
            e.preventDefault();
            const f = currentChar(), v = getView(f);
            saveView(f, { ...v, scale: clamp(v.scale + (e.deltaY > 0 ? -0.08 : 0.08)) });
        }, { passive: false });
        vp.addEventListener('pointerdown', e => {
            if (btn.classList.contains('is-empty')) return;
            vp.setPointerCapture(e.pointerId);
            ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (ptrs.size === 1) {
                dragStart = { x: e.clientX, y: e.clientY, view: getView(currentChar()) };
                didDrag = false;
            } else if (ptrs.size === 2) {
                const [a, b] = Array.from(ptrs.values());
                pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: getView(currentChar()) };
                dragStart = null;
            }
        });
        vp.addEventListener('pointermove', e => {
            if (!ptrs.has(e.pointerId)) return;
            ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const f = currentChar();
            if (ptrs.size >= 2 && pinchStart) {
                const [a, b] = Array.from(ptrs.values());
                saveView(f, { ...pinchStart.view, scale: clamp(pinchStart.view.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist) });
                didDrag = true; vp.classList.add('is-dragging'); return;
            }
            if (ptrs.size === 1 && dragStart) {
                const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { didDrag = true; vp.classList.add('is-dragging'); }
                saveView(f, { scale: dragStart.view.scale, x: dragStart.view.x + dx, y: dragStart.view.y + dy });
            }
        });
        function endPtr(e) {
            ptrs.delete(e.pointerId);
            if (ptrs.size < 2) pinchStart = null;
            if (ptrs.size === 0) {
                dragStart = null; vp.classList.remove('is-dragging');
                try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
            } else if (ptrs.size === 1) {
                const pos = Array.from(ptrs.values())[0];
                dragStart = { x: pos.x, y: pos.y, view: getView(currentChar()) };
            }
        }
        vp.addEventListener('pointerup', endPtr);
        vp.addEventListener('pointercancel', endPtr);
    }

    function setCharacterPickerOpen(open) {
        el('characterOptionsPanel').classList.toggle('is-open', !!open);
        el('characterPreviewToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
        syncPreview();
    }

    function toggleCharacterPicker() {
        setCharacterPickerOpen(!el('characterOptionsPanel').classList.contains('is-open'));
    }

    function persistCharacterImage() {
        const file = currentChar();
        if (!file) return;
        let prev = RadiantStorage.profile.get() || {};
        if (typeof prev !== 'object') prev = {};
        prev.characterImage = file;
        prev.characterImageViews = characterImageViews;
        if (file === CUSTOM_CHARACTER_KEY) prev.characterImageCustom = customCharacterDataUrl;
        else delete prev.characterImageCustom;
        RadiantStorage.profile.save(prev);
    }

    function setCharacterSelection(filename) {
        el('characterImageFilename').value = String(filename || '').trim();
        customCharacterDataUrl = '';
        syncPreview();
        setCharacterPickerOpen(false);
        persistCharacterImage();
    }

    function setCustomCharacterImage(dataUrl) {
        el('characterImageFilename').value = CUSTOM_CHARACTER_KEY;
        customCharacterDataUrl = dataUrl;
        syncPreview();
        setCharacterPickerOpen(false);
        persistCharacterImage();
    }

    function processImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const max = 512;
                let { width, height } = img;
                if (width > max || height > max) {
                    const ratio = Math.min(max / width, max / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                setCustomCharacterImage(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => alert('Could not load that image.');
            img.src = reader.result;
        };
        reader.onerror = () => alert('Could not read that file.');
        reader.readAsDataURL(file);
    }

    function openCharacterImageUpload() {
        const input = el('characterImageUpload');
        if (!input) return;
        input.value = '';
        input.click();
    }

    async function loadCharacterImageGrid() {
        const grid = el('characterImageGrid');
        grid.innerHTML = '';
        try {
            const manifest = await fetch('assets/character-images-manifest.json').then(r => { if (!r.ok) throw new Error(); return r.json(); });
            characterManifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
            characterManifestFiles.forEach(filename => {
                const li = document.createElement('li');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.dataset.characterFile = filename;
                btn.setAttribute('aria-label', filename);
                btn.setAttribute('role', 'option');
                const thumb = document.createElement('img');
                thumb.alt = ''; thumb.src = charUrl(filename);
                thumb.loading = 'lazy'; thumb.decoding = 'async';
                btn.appendChild(thumb); li.appendChild(btn); grid.appendChild(li);
            });
            grid.addEventListener('click', e => {
                const btn = e.target.closest('button[data-character-file]');
                if (btn && grid.contains(btn)) setCharacterSelection(btn.dataset.characterFile);
            });
        } catch (err) {
            characterManifestFiles = [];
            console.warn('Character manifest failed to load:', err);
        }
    }

    function prepopulateForm() {
        let data = RadiantStorage.profile.get() || {};
        if (data.characterImageViews && typeof data.characterImageViews === 'object') {
            characterImageViews = data.characterImageViews;
        }
        customCharacterDataUrl = typeof data.characterImageCustom === 'string' ? data.characterImageCustom : '';
        if (data.gender) {
            el('gender').value = data.gender;
            el('age').value = data.age;
            let heightUnit = data.heightUnit || 'cm';
            if (heightUnit === 'ft-in') {
                const totalInches = data.height / 2.54;
                el('heightFeet').value = Math.floor(totalInches / 12);
                el('heightInches').value = Math.round(totalInches % 12);
            } else {
                el('height').value = heightUnit === 'in' ? (data.height / 2.54).toFixed(2) : data.height;
                if (heightUnit === 'in') heightUnit = 'cm';
            }
            el('heightUnit').value = heightUnit;
            toggleHeightInput();
            const isLbs = data.weightUnit === 'lbs';
            el('weight').value = isLbs ? (data.weight / 0.453592).toFixed(2) : data.weight;
            el('weightUnit').value = isLbs ? 'lbs' : 'kg';
            el('bodyFatPercent').value = data.bodyFatPercent;
        }
        el('characterImageFilename').value = (data.characterImage || '').trim();
        syncPreview();
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupHeader('Profile Statistics');
        initZoomPan();
        el('characterChangeBtn')?.addEventListener('click', toggleCharacterPicker);
        el('characterUploadBtn')?.addEventListener('click', openCharacterImageUpload);
        el('characterImageUpload')?.addEventListener('change', e => {
            processImageFile(e.target.files?.[0]);
        });
        document.addEventListener('click', e => {
            const panel = el('characterOptionsPanel'), host = document.querySelector('.character-picker');
            if (panel.classList.contains('is-open') && host && !host.contains(e.target)) setCharacterPickerOpen(false);
        });
        loadCharacterImageGrid().then(prepopulateForm);
        el('profileForm').addEventListener('submit', e => { e.preventDefault(); saveProfileData(); });
    });

    function saveProfileData() {
        const heightUnit = el('heightUnit').value;
        const height = heightUnit === 'ft-in'
            ? (((parseFloat(el('heightFeet').value) || 0) * 12 + (parseFloat(el('heightInches').value) || 0)) * 2.54).toFixed(2)
            : parseFloat(el('height').value).toFixed(2);
        const weightUnit = el('weightUnit').value;
        const weight = weightUnit === 'lbs' ? (el('weight').value * 0.453592).toFixed(2) : el('weight').value;
        const profileData = {
            gender: el('gender').value, age: el('age').value,
            height, weight, bodyFatPercent: el('bodyFatPercent').value,
            heightUnit, weightUnit, characterImage: currentChar(), characterImageViews,
            ...(currentChar() === CUSTOM_CHARACTER_KEY ? { characterImageCustom: customCharacterDataUrl } : {})
        };
        if (profileData.characterImage !== CUSTOM_CHARACTER_KEY) delete profileData.characterImageCustom;
        let existing = RadiantStorage.profile.get() || {};
        const merged = Object.assign(existing, profileData);
        if (merged.characterImage !== CUSTOM_CHARACTER_KEY) delete merged.characterImageCustom;
        RadiantStorage.profile.save(merged);
        let wbf = RadiantStorage.profile.getWeightAndBodyFat();
        wbf[new Date().toISOString().split('T')[0]] = { weight, bodyFatPercent: el('bodyFatPercent').value };
        RadiantStorage.profile.saveWeightAndBodyFat(wbf);
    }

    function toggleHeightInput() {
        const isFt = el('heightUnit').value === 'ft-in';
        el('feetInchesGroup').style.display = isFt ? 'flex' : 'none';
        el('metricGroup').style.display = isFt ? 'none' : 'flex';
    }

    function validateAndNavigate() {
        const heightUnit = el('heightUnit').value;
        const heightValid = heightUnit === 'ft-in' ? el('heightFeet').value && el('heightInches').value : el('height').value;
        if (!el('gender').value || !el('age').value || !heightValid || !el('weight').value || !el('bodyFatPercent').value) {
            alert('Please fill in all required fields before proceeding.');
            return;
        }
        saveProfileData();
        window.location.href = 'calculate-bmr.html';
    }

