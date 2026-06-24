/**
 * __EXT_EMOJI__ __EXT_SHORT_NAME__ — Popup Script
 * ★ Activation lock + local rollout controls
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
    loadSafeMode();
    loadDebugMode();
    showCurrentVersion();
    showReleaseStatus();
    setupKillSwitch();
    showErrorCount();
    setupErrorExport();
    showAuditCount();
    setupAuditExport();
    setupPerfExport();
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
// ★ SAFE MODE TOGGLE
// Tắt auto-fill, chỉ hiện thông tin gợi ý
// ==========================================
function loadSafeMode() {
    chrome.storage.local.get('quyen_safe_mode', function (data) {
        const toggle = document.getElementById('safe-mode-toggle');
        if (!toggle) return;

        toggle.checked = data.quyen_safe_mode === true;

        toggle.addEventListener('change', function () {
            chrome.storage.local.set({ quyen_safe_mode: toggle.checked });

            // Notify all HIS tabs
            chrome.tabs.query({ url: '*://*.vncare.vn/*' }, function (tabs) {
                for (let i = 0; i < tabs.length; i++) {
                    chrome.tabs.sendMessage(tabs[i].id, {
                        type: 'QUYEN_SAFE_MODE',
                        safeMode: toggle.checked
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
    chrome.storage.local.get(['debugMode', 'debugModeUntil'], function (data) {
        const toggle = document.getElementById('debug-mode-toggle');
        if (!toggle) return;

        const active = data.debugMode === true && (!data.debugModeUntil || data.debugModeUntil > Date.now());
        toggle.checked = active;
        if (data.debugMode === true && !active) chrome.storage.local.set({ debugMode: false, debugModeUntil: 0 });

        toggle.addEventListener('change', function () {
            const debugUntil = toggle.checked ? Date.now() + 15 * 60 * 1000 : 0;
            chrome.storage.local.set({
                debugMode: toggle.checked,
                debugModeUntil: debugUntil
            });
        });
    });
}

// ==========================================
// LOCAL RELEASE POLICY
// ==========================================
function reasonLabel(reason) {
    const labels = {
        OK: 'Được phép chạy',
        KILL_SWITCH: 'Đã khóa khẩn cấp',
        VERSION_NOT_ALLOWED: 'Phiên bản không nằm trong allowlist',
        VERSION_EXPIRED: 'Phiên bản đã hết hạn hoạt động',
        POLICY_MISSING: 'Thiếu chính sách cấu hình (Giấy phép)',
        POLICY_INVALID_HASH: 'Mã hash bản dựng không hợp lệ',
        POLICY_INVALID_CHANNEL: 'Kênh phát hành không hợp lệ'
    };
    return labels[reason] || reason || 'Không rõ';
}

function showReleaseStatus() {
    const statusEl = document.getElementById('release-status');
    if (statusEl) {
        statusEl.style.display = 'none';
    }
}

function setupKillSwitch() {
    const toggle = document.getElementById('kill-switch-toggle');
    if (!toggle) return;

    chrome.storage.local.get('quyen_kill_switch', function (data) {
        toggle.checked = data.quyen_kill_switch === true;
    });

    toggle.addEventListener('change', function () {
        const update = { quyen_kill_switch: toggle.checked };
        if (toggle.checked) update.quyen_enabled = false;
        chrome.storage.local.set(update, function () {
            const enabledToggle = document.getElementById('toggle-enabled');
            if (enabledToggle && toggle.checked) enabledToggle.checked = false;
            showReleaseStatus();
            chrome.tabs.query({ url: '*://*.vncare.vn/*' }, function (tabs) {
                for (let i = 0; i < tabs.length; i++) {
                    chrome.tabs.sendMessage(tabs[i].id, {
                        type: 'QUYEN_RELEASE_POLICY_CHANGED'
                    }).catch(function () { /* tab not ready */ });
                    if (toggle.checked) {
                        chrome.tabs.sendMessage(tabs[i].id, {
                            type: 'QUYEN_TOGGLE_EXTENSION',
                            enabled: false
                        }).catch(function () { /* tab not ready */ });
                    }
                }
            });
        });
    });
}

// ==========================================
// ★ ERROR LOG EXPORT
// ==========================================
function showErrorCount() {
    chrome.storage.local.get('quyen_runtime_health_v1', function (data) {
        const health = data.quyen_runtime_health_v1 || {};
        const badge = document.getElementById('error-count-badge');
        if (badge && health.count > 0) {
            badge.textContent = health.count;
            badge.style.display = 'inline';
        }
    });
}

function showAuditCount() {
    chrome.storage.local.get('quyen_audit_log', function (data) {
        const entries = data.quyen_audit_log || [];
        const badge = document.getElementById('audit-count-badge');
        if (badge && entries.length > 0) {
            badge.textContent = entries.length;
            badge.style.display = 'inline';
        }
    });
}

function setupErrorExport() {
    const btn = document.getElementById('export-errors-btn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        chrome.storage.local.get('quyen_runtime_health_v1', function (data) {
            const health = data.quyen_runtime_health_v1 || {};
            const count = health.count || 0;
            btn.textContent = count > 0 ? ('Runtime đã chặn ' + count + ' lỗi') : 'Runtime ổn định';
            setTimeout(function () { btn.textContent = 'Trạng thái lỗi runtime'; }, 2000);
        });
    });
}

function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/^\s*[=\+\-@\t\r]/.test(str)) {
        return "'" + str;
    }
    if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0 || str.indexOf('\r') >= 0) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function setupAuditExport() {
    const btn = document.getElementById('export-audit-btn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        chrome.storage.local.get('quyen_audit_log', function (data) {
            const entries = data.quyen_audit_log || [];
            if (entries.length === 0) {
                btn.textContent = '✅ Chưa có audit';
                setTimeout(function () { btn.innerHTML = '📋 Xuất audit <span id="audit-count-badge" style="background:#2563eb;color:#fff;border-radius:10px;padding:0 6px;font-size:9px;margin-left:4px;display:none;">0</span>'; }, 2000);
                return;
            }

            const headers = ['Thời gian', 'Hành động', 'Module', 'PatientRef', 'ItemRef', 'RequestId', 'Phiên bản', 'Build hash', 'Kết quả', 'Lý do', 'Số mục'];
            const rows = [headers.join(',')];
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                rows.push([
                    csvEscape(e.ts),
                    csvEscape(e.action),
                    csvEscape(e.module),
                    csvEscape(e.patientRef),
                    csvEscape(e.itemRef),
                    csvEscape(e.requestId),
                    csvEscape(e.extVersion),
                    csvEscape(e.buildHash),
                    csvEscape(e.result),
                    csvEscape(e.reason),
                    csvEscape(e.filledCount || 0)
                ].join(','));
            }

            navigator.clipboard.writeText('\uFEFF' + rows.join('\n')).then(function () {
                btn.textContent = '✅ Đã copy ' + entries.length + ' audit!';
                setTimeout(function () { btn.innerHTML = '📋 Xuất audit <span id="audit-count-badge" style="background:#2563eb;color:#fff;border-radius:10px;padding:0 6px;font-size:9px;margin-left:4px;display:inline;">' + entries.length + '</span>'; }, 2000);
            });
        });
    });
}

function setupPerfExport() {
    const btn = document.getElementById('export-perf-btn');
    if (!btn) return;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PERF_TELEMETRY' }, function (res) {
                if (chrome.runtime.lastError || !res || !res.success) return;
                const entries = res.data || [];
                const badge = document.getElementById('perf-count-badge');
                if (badge && entries.length > 0) {
                    badge.textContent = entries.length;
                    badge.style.display = 'inline';
                }
            });
        }
    });

    btn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs || !tabs[0]) {
                btn.textContent = '❌ Không tìm thấy trang';
                setTimeout(function () { btn.innerHTML = '⚡ Tải báo cáo hiệu năng <span id="perf-count-badge" style="background:#10b981;color:#fff;border-radius:10px;padding:0 6px;font-size:9px;margin-left:4px;display:none;">0</span>'; }, 2000);
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PERF_TELEMETRY' }, function (res) {
                if (chrome.runtime.lastError || !res || !res.success) {
                    btn.textContent = '❌ Lỗi đọc báo cáo';
                    setTimeout(function () { btn.innerHTML = '⚡ Tải báo cáo hiệu năng <span id="perf-count-badge" style="background:#10b981;color:#fff;border-radius:10px;padding:0 6px;font-size:9px;margin-left:4px;display:none;">0</span>'; }, 2000);
                    return;
                }

                const entries = res.data || [];
                if (entries.length === 0) {
                    btn.textContent = '✅ Không có dữ liệu';
                    setTimeout(function () { btn.innerHTML = '⚡ Tải báo cáo hiệu năng <span id="perf-count-badge" style="background:#10b981;color:#fff;border-radius:10px;padding:0 6px;font-size:9px;margin-left:4px;display:none;">0</span>'; }, 2000);
                    return;
                }

                const jsonStr = JSON.stringify(entries, null, 4);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'quyen_perf_telemetry_' + Date.now() + '.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                btn.textContent = '✅ Đã tải về ' + entries.length + ' mục!';
                setTimeout(function () {
                    btn.innerHTML = '⚡ Tải báo cáo hiệu năng <span id="perf-count-badge" style="background:#10b981;color:#fff;border-radius:10px;padding:0 6px;font-size:9px;margin-left:4px;display:inline;">' + entries.length + '</span>';
                }, 2000);
            });
        });
    });
}
