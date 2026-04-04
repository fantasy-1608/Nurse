/**
 * __EXT_EMOJI__ __EXT_SHORT_NAME__ — Popup Script (minimal)
 * 2 toggles: Bật/tắt extension + Debug mode
 */

document.addEventListener('DOMContentLoaded', function () {
    loadEnabledState();
    loadDebugMode();
});

// ==========================================
// EXTENSION ENABLED TOGGLE
// ==========================================
function loadEnabledState() {
    chrome.storage.local.get('quyen_enabled', function (data) {
        const toggle = document.getElementById('toggle-enabled');
        if (!toggle) return;

        // Default: enabled
        toggle.checked = data.quyen_enabled !== false;

        toggle.addEventListener('change', function () {
            chrome.storage.local.set({ quyen_enabled: toggle.checked });

            // Notify all tabs
            chrome.tabs.query({ url: '*://*.vncare.vn/*' }, function (tabs) {
                for (let i = 0; i < tabs.length; i++) {
                    chrome.tabs.sendMessage(tabs[i].id, {
                        type: 'QUYEN_TOGGLE_EXTENSION',
                        enabled: toggle.checked
                    }).catch(function () { /* tab not ready */ });
                }
            });
        });
    });
}

// ==========================================
// DEBUG MODE TOGGLE
// ==========================================
function loadDebugMode() {
    chrome.storage.local.get('debugMode', function (data) {
        const toggle = document.getElementById('debug-mode-toggle');
        if (!toggle) return;

        toggle.checked = data.debugMode === true;

        toggle.addEventListener('change', function () {
            chrome.storage.local.set({ debugMode: toggle.checked });
        });
    });
}


