/**
 * __EXT_EMOJI__ __EXT_SHORT_NAME__ — Popup Script
 * 2 toggles: Bật/tắt extension + Debug mode
 * + Auto-update notification
 */

document.addEventListener('DOMContentLoaded', function () {
    loadEnabledState();
    loadDebugMode();
    showCurrentVersion();
    checkUpdateStatus();
    setupUpdateButton();
});

// ==========================================
// CURRENT VERSION
// ==========================================
function showCurrentVersion() {
    const versionEl = document.getElementById('version-display');
    if (versionEl) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = 'v' + manifest.version;
    }
}

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

// ==========================================
// UPDATE NOTIFICATION
// ==========================================
function checkUpdateStatus() {
    chrome.storage.local.get('quyen_update', function (data) {
        const updateInfo = data.quyen_update;
        if (!updateInfo || !updateInfo.hasUpdate) return;

        showUpdateBanner(updateInfo);
    });
}

function showUpdateBanner(info) {
    const banner = document.getElementById('update-banner');
    const desc = document.getElementById('update-desc');
    const btn = document.getElementById('update-btn');
    if (!banner || !desc || !btn) return;

    desc.textContent = 'v' + info.currentVersion + ' → v' + info.latestVersion;
    btn.href = info.releaseUrl || info.downloadUrl || '#';
    banner.classList.add('show');
}

function setupUpdateButton() {
    const checkBtn = document.getElementById('check-update-btn');
    if (!checkBtn) return;

    checkBtn.addEventListener('click', function () {
        checkBtn.textContent = '⏳ Đang kiểm tra...';
        checkBtn.style.pointerEvents = 'none';

        chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' }, function (response) {
            if (chrome.runtime.lastError) {
                checkBtn.textContent = '❌ Lỗi kết nối';
                setTimeout(function () {
                    checkBtn.textContent = '🔄 Kiểm tra cập nhật';
                    checkBtn.style.pointerEvents = '';
                }, 2000);
                return;
            }

            if (response && response.hasUpdate) {
                showUpdateBanner(response);
                checkBtn.textContent = '🆕 Có bản mới!';
            } else {
                checkBtn.textContent = '✅ Đã là bản mới nhất';
            }

            setTimeout(function () {
                checkBtn.textContent = '🔄 Kiểm tra cập nhật';
                checkBtn.style.pointerEvents = '';
            }, 3000);
        });
    });
}
