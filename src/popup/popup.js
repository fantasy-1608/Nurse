/**
 * __EXT_EMOJI__ __EXT_SHORT_NAME__ — Popup Script
 * ★ Activation lock + 2 toggles + Auto-update notification
 */

// ★ SHA-256 hash của mã kích hoạt (không lưu plaintext)
const ACTIVATION_HASH = '801a8fb8103d1d51d7eda9bbcc8d1aa145e17bffe59edd61a0c896445eb563bc';

document.addEventListener('DOMContentLoaded', function () {
    checkActivation();
});

// ==========================================
// ★ ACTIVATION SYSTEM
// ==========================================
async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

function checkActivation() {
    chrome.storage.local.get('quyen_activated', function (data) {
        if (data.quyen_activated === true) {
            showMainUI();
        } else {
            showActivationScreen();
        }
    });
}

function showActivationScreen() {
    document.getElementById('activation-screen').style.display = 'block';
    document.getElementById('main-popup').style.display = 'none';

    const input = document.getElementById('activation-input');
    const btn = document.getElementById('activation-btn');
    const error = document.getElementById('activation-error');
    const eulaCheckbox = document.getElementById('eula-checkbox');

    eulaCheckbox.addEventListener('change', function () {
        btn.disabled = !this.checked;
    });

    btn.addEventListener('click', function () { tryActivate(); });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') tryActivate();
    });

    async function tryActivate() {
        const code = input.value.trim();
        if (!code) {
            input.classList.add('shake');
            setTimeout(function () { input.classList.remove('shake'); }, 500);
            return;
        }

        btn.textContent = '⏳ Đang kiểm tra...';
        btn.disabled = true;

        const hash = await sha256(code);

        if (hash === ACTIVATION_HASH) {
            // ✅ Kích hoạt thành công
            chrome.storage.local.set({ quyen_activated: true }, function () {
                btn.textContent = '✅ Thành công!';
                btn.style.background = 'linear-gradient(135deg, #4CAF50, #8BC34A)';

                // Notify tất cả tab để enable extension
                chrome.tabs.query({ url: '*://*.vncare.vn/*' }, function (tabs) {
                    for (let i = 0; i < tabs.length; i++) {
                        chrome.tabs.sendMessage(tabs[i].id, {
                            type: 'QUYEN_ACTIVATION_CHANGED',
                            activated: true
                        }).catch(function () { });
                    }
                });

                setTimeout(function () {
                    showMainUI();
                }, 800);
            });
        } else {
            // ❌ Sai mã
            error.classList.add('show');
            input.classList.add('shake');
            input.value = '';
            btn.textContent = '🔓 Kích hoạt';
            btn.disabled = false;
            setTimeout(function () {
                input.classList.remove('shake');
            }, 500);
            setTimeout(function () {
                error.classList.remove('show');
            }, 3000);
        }
    }
}

function showMainUI() {
    document.getElementById('activation-screen').style.display = 'none';
    document.getElementById('main-popup').style.display = 'block';

    loadEnabledState();
    loadDebugMode();
    showCurrentVersion();
    checkUpdateStatus();
    setupUpdateButton();
}

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
