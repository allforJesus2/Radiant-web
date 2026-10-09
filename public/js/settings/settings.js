        // Function to calculate localStorage size
        function calculateStorageSize() {
            return RadiantStorage.getUsageBytes();
        }

        // Function to format bytes to human readable format
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Function to update storage size display
        function updateStorageSize() {
            const size = calculateStorageSize();
            const formattedSize = formatBytes(size);
            document.getElementById('storageSize').textContent = formattedSize;
        }

        // Load and handle offline preference setting.
        // The checkbox means "Always check for updates": checked → network-first
        // (preferOffline=false), unchecked → offline/cached (preferOffline=true).
        document.addEventListener('DOMContentLoaded', function() {
            const preferOfflineCheckbox = document.getElementById('preferOfflineData');
            
            // Load current setting from localStorage
            const currentSetting = RadiantStorage.settings.getPreferOffline();
            preferOfflineCheckbox.checked = !currentSetting;
            
            // Save setting when checkbox changes and push to service worker
            preferOfflineCheckbox.addEventListener('change', function() {
                const checked = this.checked;
                const preferOffline = !checked;
                RadiantStorage.settings.setPreferOffline(preferOffline);

                // Notify the active service worker immediately so it picks up
                // the new preference without waiting for a page reload.
                if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({
                        type: 'SET_OFFLINE_PREFERENCE',
                        preferOffline: preferOffline,
                    });
                }

                const message = checked
                    ? 'The app will now check for updates whenever you\'re online.'
                    : 'The app will now load from its saved offline copy by default.';
                alert(message);
            });

            // ── App version: update / revert controls ─────────────────────
            const updateLatestBtn = document.getElementById('updateToLatest');
            const switchPreviousBtn = document.getElementById('switchToPrevious');
            const switchLatestBtn = document.getElementById('switchBackToLatest');
            const appVersionStatusEl = document.getElementById('appVersionStatus');

            async function refreshAppVersionUi() {
                if (!appVersionStatusEl) return;
                let registration = null;
                let info = null;
                try {
                    registration = await RadiantSWUpdate.getRegistration();
                    info = await RadiantSWUpdate.getVersionInfo();
                } catch (e) {
                    appVersionStatusEl.textContent = 'Service worker information unavailable.';
                    return;
                }
                const hasWaiting = !!(registration && registration.waiting);
                const reverted = !!(
                    info.previousCacheName &&
                    info.activeCacheName === info.previousCacheName
                );

                if (updateLatestBtn) {
                    updateLatestBtn.style.display = hasWaiting ? 'inline-block' : 'none';
                    updateLatestBtn.onclick = function () {
                        const worker = registration && registration.waiting;
                        if (!worker) {
                            alert('No pending update found.');
                            return;
                        }
                        // On accept, sw-update.js reloads on controllerchange.
                        RadiantSWUpdate.promptForUpdate(worker);
                    };
                }
                if (switchPreviousBtn) {
                    switchPreviousBtn.style.display =
                        info.hasPrevious && !reverted ? 'inline-block' : 'none';
                    switchPreviousBtn.onclick = async function () {
                        if (
                            !confirm(
                                'Switch back to the previous app version? Your data is not affected.'
                            )
                        ) {
                            return;
                        }
                        await RadiantSWUpdate.revert();
                        location.reload();
                    };
                }
                if (switchLatestBtn) {
                    switchLatestBtn.style.display = reverted ? 'inline-block' : 'none';
                    switchLatestBtn.onclick = async function () {
                        if (!confirm('Switch back to the latest app version?')) return;
                        await RadiantSWUpdate.useLatest();
                        location.reload();
                    };
                }

                if (reverted) {
                    appVersionStatusEl.textContent =
                        'Currently serving the previous app version.';
                } else if (hasWaiting) {
                    appVersionStatusEl.textContent =
                        'A new version is available but not installed yet. Use "Update to latest" to download it.';
                } else {
                    appVersionStatusEl.textContent = 'You are on the latest available version.';
                }
            }
            refreshAppVersionUi();

            // Initialize storage size display
            updateStorageSize();

            async function refreshFdcStatusUi() {
                const el = document.getElementById('fdcStatusText');
                if (!el || typeof getFdcStatus !== 'function') return;
                try {
                    const st = await getFdcStatus();
                    el.innerHTML =
                        '<strong>USDA foods:</strong> ' +
                        st.fdcCount +
                        '<br><strong>Legacy CSV rows:</strong> ' +
                        st.legacyCount +
                        '<br><strong>SR Legacy import:</strong> ' +
                        (st.importComplete ? 'complete' : 'pending') +
                        '<br><strong>Foundation supplement:</strong> ' +
                        (st.foundationSupplementCount != null ? st.foundationSupplementCount : 0) +
                        ' foods' +
                        ((st.core_food_version || 0) >= 2 ? ' (imported)' : ' (pending)') +
                        '<br><strong>Branded / offline barcode DB:</strong> ' +
                        (st.brandedImportComplete ? 'complete' : 'not imported');
                } catch (e) {
                    el.textContent = 'Could not read database status.';
                }
            }

            var fdcRefreshBtn = document.getElementById('fdcRefreshStatus');
            if (fdcRefreshBtn) fdcRefreshBtn.addEventListener('click', refreshFdcStatusUi);
            var fdcReimportBtn = document.getElementById('fdcReimportSr');
            if (fdcReimportBtn) fdcReimportBtn.addEventListener('click', async function() {
                if (
                    !confirm(
                        'Re-download SR Legacy and Foundation supplement from bundled files? Scanned and branded foods are kept.'
                    )
                ) {
                    return;
                }
                const busy = document.getElementById('fdcBusy');
                busy.style.display = 'block';
                busy.textContent = 'Importing SR Legacy…';
                try {
                    await importSrLegacy(
                        function (done, tot) {
                            busy.textContent = 'SR Legacy: ' + done + ' / ' + tot;
                        },
                        { force: true }
                    );
                    if (typeof importFoundationSupplement === 'function') {
                        await importFoundationSupplement(function (done, tot) {
                            busy.textContent = 'Foundation supplement: ' + done + ' / ' + tot;
                        }, { force: true });
                    }
                    if (typeof loadFoodNamesAndCache === 'function') {
                        await loadFoodNamesAndCache();
                    }
                    alert('USDA core food import finished.');
                } catch (e) {
                    alert('Import failed: ' + (e && e.message));
                }
                busy.style.display = 'none';
                refreshFdcStatusUi();
            });
            var fdcBrandedBtn = document.getElementById('fdcImportBranded');
            if (fdcBrandedBtn) fdcBrandedBtn.addEventListener('click', async function() {
                if (
                    !confirm(
                        'Import offline branded barcodes?\n\n' +
                            '• Downloads a very large dataset (roughly 200MB+); use Wi‑Fi.\n' +
                            '• Import may take several minutes; keep this tab open.\n' +
                            '• Food search may become slower after import (large local database).\n' +
                            '• You can clear USDA data later to remove it.\n\n' +
                            'Continue?'
                    )
                ) {
                    return;
                }
                const busy = document.getElementById('fdcBusy');
                busy.style.display = 'block';
                try {
                    await importBrandedFoods(function (d, t) {
                        busy.textContent =
                            'Branded import in progress — search may be slow until this finishes. ' +
                            d +
                            ' / ' +
                            (t || '?');
                    });
                    alert(
                        'Branded import finished. Offline barcode lookup is now available. ' +
                            'Food search may feel slower than before because of the larger database.'
                    );
                } catch (e) {
                    alert('Branded import failed: ' + (e && e.message));
                }
                busy.style.display = 'none';
                refreshFdcStatusUi();
            });
            var fdcClearBtn = document.getElementById('fdcClear');
            if (fdcClearBtn) fdcClearBtn.addEventListener('click', async function() {
                if (
                    !confirm(
                        'Clear all USDA data (foods + nutrient defs metadata)? Legacy CSV data is not affected.'
                    )
                ) {
                    return;
                }
                if (typeof clearFdcStores === 'function') await clearFdcStores();
                if (typeof resetDBConnection === 'function') resetDBConnection();
                alert('USDA stores cleared. Reload the nutrition page to re-import SR Legacy.');
                refreshFdcStatusUi();
            });
            var csvClearBtn = document.getElementById('csvClear');
            if (csvClearBtn) csvClearBtn.addEventListener('click', async function() {
                if (
                    !confirm(
                        'This will permanently delete all legacy CSV food data, including any custom recipes you have saved. This cannot be undone.\n\nContinue?'
                    )
                ) {
                    return;
                }
                if (typeof clearRecipeStore === 'function') await clearRecipeStore();
                alert('Legacy CSV data cleared.');
                refreshFdcStatusUi();
            });
            refreshFdcStatusUi();

            // Add event listener for refresh button
            document.getElementById('refreshStorageSize').addEventListener('click', updateStorageSize);

            // USDA API key management
            (function () {
                const keyInput = document.getElementById('usdaApiKeyInput');
                const saveBtn = document.getElementById('usdaApiKeySave');
                const showBtn = document.getElementById('usdaApiKeyShow');
                const statusEl = document.getElementById('usdaApiKeyStatus');

                const stored = RadiantStorage.settings.getUsdaApiKey();
                keyInput.value = stored;
                statusEl.textContent = stored
                    ? 'Key saved (' + stored.length + ' characters).'
                    : 'No personal key saved — using DEMO_KEY (30 lookups/hour).';

                saveBtn.addEventListener('click', function () {
                    const val = keyInput.value.trim();
                    if (val) {
                        RadiantStorage.settings.setUsdaApiKey(val);
                        statusEl.textContent = 'Key saved (' + val.length + ' characters).';
                    } else {
                        RadiantStorage.settings.setUsdaApiKey('');
                        statusEl.textContent = 'Key removed — using DEMO_KEY (30 lookups/hour).';
                    }
                });

                showBtn.addEventListener('click', function () {
                    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
                });
            })();

            // Barcode lookup source setting
            (function () {
                const sel = document.getElementById('barcodeLookupSource');
                if (!sel) return;
                sel.value = RadiantStorage.settings.getBarcodeSource();
                sel.addEventListener('change', function () {
                    RadiantStorage.settings.setBarcodeSource(sel.value);
                });
            })();

            var reloadAutocompleteBtn = document.getElementById('reloadAutocomplete');
            if (reloadAutocompleteBtn) {
                reloadAutocompleteBtn.addEventListener('click', async function () {
                    if (typeof loadFoodNamesAndCache !== 'function') {
                        alert('database-utils.js is not loaded.');
                        return;
                    }
                    const busy = document.getElementById('fdcBusy');
                    busy.style.display = 'block';
                    busy.textContent = 'Reloading autocomplete…';
                    try {
                        await loadFoodNamesAndCache();
                        alert('Food autocomplete list reloaded.');
                    } catch (e) {
                        alert('Reload failed: ' + (e && e.message ? e.message : 'error'));
                    }
                    busy.style.display = 'none';
                    refreshFdcStatusUi();
                });
            }

            var clearLsBtn = document.getElementById('clearLocalStorageAll');
            if (clearLsBtn) {
                clearLsBtn.addEventListener('click', function () {
                    if (
                        !confirm(
                            'This will permanently delete ALL app data in this browser: profile, food log, macros, meal plans, settings keys, and more.\n\nDownload a backup first if you need one. Continue?'
                        )
                    ) {
                        return;
                    }
                    RadiantStorage.clearAll();
                    alert('All localStorage data has been cleared.');
                    updateStorageSize();
                });
            }

            var clearCacheBtn = document.getElementById('clearCacheReload');
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', function () {
                    if (
                        !confirm(
                            'Clear service worker caches and reload? Your food log and profile in localStorage will NOT be deleted.'
                        )
                    ) {
                        return;
                    }
                    if ('caches' in window) {
                        caches.keys().then(function (cacheNames) {
                            return Promise.all(cacheNames.map(function (name) {
                                return caches.delete(name);
                            }));
                        }).then(function () {
                            location.reload();
                        });
                    } else {
                        location.reload();
                    }
                });
            }

            var deleteCsvDbBtn = document.getElementById('deleteCsvDb');
            if (deleteCsvDbBtn) {
                deleteCsvDbBtn.addEventListener('click', function () {
                    if (
                        !confirm(
                            'Delete the entire csvDB IndexedDB? This removes ALL USDA and legacy CSV food data. Use granular clear buttons above when possible. Continue?'
                        )
                    ) {
                        return;
                    }
                    var request = indexedDB.deleteDatabase('csvDB');
                    request.onsuccess = function () {
                        if (typeof resetDBConnection === 'function') resetDBConnection();
                        alert('IndexedDB deleted. Open the nutrition page to re-import SR Legacy.');
                        refreshFdcStatusUi();
                    };
                    request.onerror = function (event) {
                        console.error('Error deleting database:', event.target.error);
                        alert('Could not delete database. See console.');
                    };
                    request.onblocked = function () {
                        alert('Database is blocked. Close other tabs using this app and try again.');
                    };
                });
            }
        });

        document.getElementById('downloadData').addEventListener('click', async function() {
            try {
                const localData = RadiantStorage.exportAll();
                let scannedFoods = [];
                if (typeof exportScannedFoods === 'function') {
                    scannedFoods = await exportScannedFoods();
                }
                const data = RadiantStorage.backup.wrap(localData, scannedFoods);
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'radiant-backup-' + new Date().toISOString().split('T')[0] + '.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                alert('Error creating backup: ' + error.message);
            }
        });

        document.getElementById('uploadData').addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const raw = JSON.parse(e.target.result);
                    const parsed = RadiantStorage.backup.parse(raw);

                    if (!confirm('This will replace all existing data. Are you sure you want to continue?')) {
                        return;
                    }

                    RadiantStorage.importAll(parsed.localStorage);

                    if (parsed.scannedFoods.length > 0) {
                        if (typeof importScannedFoods !== 'function') {
                            throw new Error('database-utils.js is not loaded.');
                        }
                        await importScannedFoods(parsed.scannedFoods);
                    }

                    alert('Data restored successfully!');
                    window.location.reload();
                } catch (error) {
                    alert('Error loading backup file: ' + error.message);
                } finally {
                    event.target.value = '';
                }
            };
            reader.readAsText(file);
        });
