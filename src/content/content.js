/**
 * __EXT_EMOJI__ __EXT_NAME__ — Content Script Orchestrator
 * Khởi tạo extension, inject page script, và kết nối các module
 * 
 * v1.2: Fix vòng lặp vô hạn, bỏ iframe scanner
 */

/* global QuyenLog, QUYEN_CONFIG, QuyenInfusionReader, QuyenUI */

(function () {
    'use strict';

    // Runtime health only. Do not persist stack/message/path because they can contain PHI.
    function _persistError(type, msg, file, line) {
        try {
            if (typeof chrome === 'undefined' || !chrome.storage) return;
            chrome.storage.local.get('quyen_runtime_health_v1', function (data) {
                const health = data.quyen_runtime_health_v1 || {};
                chrome.storage.local.set({
                    quyen_runtime_health_v1: {
                        lastTs: new Date().toISOString(),
                        lastType: String(type || 'ERROR').substring(0, 24),
                        count: (health.count || 0) + 1
                    }
                });
            });
        } catch (e) { /* silent */ }
    }

    // ★ AUDIT FIX: Global error boundary — catch unhandled errors
    window.addEventListener('error', function (event) {
        try {
            if (typeof QuyenLog !== 'undefined') {
                QuyenLog.error('❌ [GlobalError]', event.message, '| File:', event.filename, '| Line:', event.lineno);
            } else {
                console.error('[__EXT_EMOJI__ GlobalError] runtime error captured');
            }
            _persistError('ERROR', event.message, event.filename, event.lineno);
        } catch (e) { /* prevent infinite loop */ }
    });

    window.addEventListener('unhandledrejection', function (event) {
        try {
            const reason = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown';
            if (typeof QuyenLog !== 'undefined') {
                QuyenLog.error('❌ [UnhandledPromise]', reason);
            } else {
                console.error('[__EXT_EMOJI__ UnhandledPromise] runtime promise rejection captured');
            }
            _persistError('PROMISE', reason);
        } catch (e) { /* prevent infinite loop */ }
    });

    // ★ Forward hotkey from iframes to top window
    document.addEventListener('keydown', function(e) {
        if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
            const tag = (document.activeElement || {}).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (window !== window.top) {
                try {
                    window.top.postMessage({ type: 'QUYEN_HOTKEY_TOGGLE' }, window.location.origin);
                } catch(err) {}
            }
        }
    });

    // Chỉ chạy ở top frame
    if (window !== window.top) return;

    // Khởi tạo HIS Shared Library cho Nurse
    if (typeof HIS !== 'undefined' && HIS.init) {
        HIS.init({
            name: '__EXT_NAME__',
            version: QUYEN_CONFIG.VERSION,
            prefix: 'quyen',
            emoji: '__EXT_EMOJI__'
        });
    }

    // Check URL pattern
    function isRelevantPage() {
        const url = window.location.href.toLowerCase();
        return QUYEN_CONFIG.PAGE_PATTERNS.some(p => url.includes(p.toLowerCase()));
    }

    if (!isRelevantPage()) {
        QuyenLog.info('Trang này không phải Buồng Điều Trị, tạm nghỉ __EXT_EMOJI__');
        return;
    }

    QuyenLog.info('__EXT_EMOJI__ __EXT_NAME__ v' + QUYEN_CONFIG.VERSION + ' — Đang khởi động trên trang Nội trú...');

    // ==========================================
    // INJECT PAGE SCRIPT (his-bridge.js)
    // ==========================================
    // Helper to inject script sequentially
    function injectScript(relPath, id, onload) {
        if (document.getElementById(id)) {
            if (onload) onload();
            return;
        }
        const script = document.createElement('script');
        script.id = id;
        try {
            const _chrome = /** @type {any} */ (window).chrome;
            if (_chrome && _chrome.runtime) {
                const manifestVer = _chrome.runtime.getManifest().version;
                script.src = _chrome.runtime.getURL(relPath) + '?v=' + manifestVer + '_' + Date.now();
            }
        } catch (e) {
            QuyenLog.error('Không thể inject script ' + relPath + ':', e);
            return;
        }
        if (onload) script.onload = onload;
        (document.head || document.documentElement).appendChild(script);
    }

    function injectBridgeScript() {
        const sessionNonce = HIS.Message.getSessionNonce();
        injectScript('shared/message-schema.js', 'quyen-schema-script', function () {
            const script = document.createElement('script');
            script.id = 'quyen-bridge-script';
            script.setAttribute('data-nonce', sessionNonce);
            try {
                const _chrome = /** @type {any} */ (window).chrome;
                if (_chrome && _chrome.runtime) {
                    const manifestVer = _chrome.runtime.getManifest().version;
                    script.src = _chrome.runtime.getURL('injected/his-bridge.js') + '?v=' + manifestVer + '_' + Date.now();
                }
            } catch (e) {
                QuyenLog.error('Không thể inject bridge script:', e);
                return;
            }
            script.onload = function () {
                QuyenLog.info('Bridge script injected thành công __EXT_EMOJI__');
                script.remove();
                const schemaScript = document.getElementById('quyen-schema-script');
                if (schemaScript) schemaScript.remove();
            };
            (document.head || document.documentElement).appendChild(script);
        });
    }

    // ==========================================
    // INITIALIZE
    // ==========================================
    function initModules() {
        injectBridgeScript();
        QuyenUI.init();

        QuyenInfusionReader.init(function (allDrugs, ivDrugs) {
            QuyenUI.updateDrugList(allDrugs, ivDrugs);

            // Hiện toast với format: X hôm nay / Y tổng (Z ngày)
            if (ivDrugs.length > 0) {
                const today = new Date();
                const todayStr = ('0' + today.getDate()).slice(-2) + '/' + ('0' + (today.getMonth() + 1)).slice(-2) + '/' + today.getFullYear();
                const todayCount = ivDrugs.filter(d => !d.prescriptionDate || d.prescriptionDate === todayStr).length;
                const uniqueDays = new Set(ivDrugs.filter(d => d.prescriptionDate).map(d => d.prescriptionDate)).size || 1;
                if (todayCount < ivDrugs.length) {
                    QuyenUI.showToast(`💉 ${todayCount} thuốc hôm nay / ${ivDrugs.length} tổng (${uniqueDays} ngày) __EXT_EMOJI__`);
                } else {
                    QuyenUI.showToast(`💉 Tìm thấy ${todayCount} thuốc truyền hôm nay __EXT_EMOJI__`);
                }
            } else if (allDrugs.length > 0) {
                QuyenUI.showToast(`📋 Tìm thấy ${allDrugs.length} thuốc từ y lệnh __EXT_EMOJI__`);
            }
        });

        QuyenLog.info('✅ Tất cả module đã sẵn sàng! __EXT_NAME__ __EXT_EMOJI__');
    }

    // ==========================================
    // LẮNG NGHE BLOCK ROLE TỪ CẦU NỐI BRIDGE
    // ==========================================
    window.addEventListener('message', function(event) {
        if (typeof HIS === 'undefined' || !HIS.Message || !HIS.Message.isValid(event)) return;

        if (event.data && event.data.type === 'QUYEN_ROLE_BLOCK') {
            QuyenLog.error('TỪ CHỐI TRUY CẬP: Tiện ích chỉ dành cho Điều dưỡng. Nhóm:', event.data.role);
            
            // Xóa UI panel (ID thực của giao diện là quyen-panel)
            const panel = document.getElementById('quyen-panel');
            if (panel) panel.remove();

            // Remove existing modal if already exists to avoid duplicates
            const oldModal = document.getElementById('quyen-role-blocker-modal');
            if (oldModal) oldModal.remove();

            // Create new modal overlay
            const modal = document.createElement('div');
            modal.id = 'quyen-role-blocker-modal';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            modal.style.zIndex = '999999';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.color = '#fff';
            modal.style.fontFamily = 'Arial, sans-serif';
            modal.style.padding = '20px';
            modal.style.boxSizing = 'border-box';
            
            // Inner content box
            const contentBox = document.createElement('div');
            contentBox.style.backgroundColor = '#2c3e50';
            contentBox.style.border = '2px solid #e74c3c';
            contentBox.style.borderRadius = '8px';
            contentBox.style.padding = '30px';
            contentBox.style.maxWidth = '500px';
            contentBox.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
            contentBox.style.textAlign = 'center';
            
            const title = document.createElement('h2');
            title.style.color = '#e74c3c';
            title.style.marginTop = '0';
            title.style.fontSize = '24px';
            title.innerText = 'TỪ CHỐI TRUY CẬP';
            
            const message = document.createElement('p');
            message.style.fontSize = '16px';
            message.style.lineHeight = '1.6';
            message.style.whiteSpace = 'pre-line';
            
            const reason = event.data.reason;
            const role = event.data.role || 'UNVERIFIED';
            
            if (reason === 'ROLE_MISMATCH') {
                message.innerText = `TỪ CHỐI TRUY CẬP: Tiện ích Nurse Helper chỉ dành cho Điều dưỡng.\nNhóm người dùng hiện tại: ${role} (Yêu cầu: 5).`;
            } else if (reason === 'ROLE_TIMEOUT') {
                message.innerText = `TỪ CHỐI TRUY CẬP: Không thể xác minh quyền người dùng từ VNPT HIS (Hết thời gian chờ).\nVui lòng tải lại trang và thử lại.`;
            } else {
                if (role === 'UNVERIFIED') {
                    message.innerText = `TỪ CHỐI TRUY CẬP: Không thể xác minh quyền người dùng từ VNPT HIS (Hết thời gian chờ).\nVui lòng tải lại trang và thử lại.`;
                } else {
                    message.innerText = `TỪ CHỐI TRUY CẬP: Tiện ích Nurse Helper chỉ dành cho Điều dưỡng.\nNhóm người dùng hiện tại: ${role} (Yêu cầu: 5).`;
                }
            }
            
            const button = document.createElement('button');
            button.innerText = 'Tải lại trang';
            button.style.marginTop = '20px';
            button.style.padding = '10px 20px';
            button.style.backgroundColor = '#e74c3c';
            button.style.color = '#fff';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '16px';
            button.addEventListener('click', function() {
                window.location.reload();
            });
            
            contentBox.appendChild(title);
            contentBox.appendChild(message);
            contentBox.appendChild(button);
            modal.appendChild(contentBox);
            document.body.appendChild(modal);
        }

        // ★ 3.2: Persist HIS environment info for debugging
        if (event.data && event.data.type === 'QUYEN_HIS_ENV') {
            try {
                chrome.storage.local.set({
                    quyen_his_env: {
                        hisVersion: event.data.hisVersion,
                        jqVersion: event.data.jqVersion,
                        extVersion: chrome.runtime.getManifest().version,
                        ts: new Date().toISOString()
                    }
                });
                QuyenLog.info('🏥 HIS env:', event.data.hisVersion, '| jQuery:', event.data.jqVersion);
            } catch (e) { /* silent */ }
        }
    });

    // ==========================================
    // ★ ACTIVATION GATE — Chỉ chạy khi đã kích hoạt
    // ==========================================
    let _initialized = false;

    function getCurrentVersion() {
        try {
            return chrome.runtime.getManifest().version || '';
        } catch (e) {
            return '';
        }
    }

    function normalizePolicy(policy) {
        return {
            allowedVersions: Array.isArray(policy && policy.allowedVersions) ? policy.allowedVersions.map(String) : [getCurrentVersion()],
            expiresAt: policy && policy.expiresAt ? String(policy.expiresAt) : '',
            buildHash: policy && policy.buildHash ? String(policy.buildHash) : '',
            channel: policy && policy.channel ? String(policy.channel) : 'manual'
        };
    }

    function evaluateReleasePolicy(data) {
        const version = getCurrentVersion();
        const policy = data ? data.quyen_release_policy : null;
        const killSwitch = data ? (data.quyen_kill_switch === true) : false;

        const isDev = (typeof QUYEN_CONFIG !== 'undefined' && QUYEN_CONFIG.DEBUG) || !('update_url' in chrome.runtime.getManifest());

        if (killSwitch) {
            return { ok: false, reason: 'KILL_SWITCH', policy: policy || normalizePolicy(null) };
        }

        if (!isDev) {
            // Enforce strict checks in production mode
            if (!policy) {
                return { ok: false, reason: 'POLICY_MISSING', policy: null };
            }
            if (!policy.allowedVersions || !Array.isArray(policy.allowedVersions) || policy.allowedVersions.indexOf(version) < 0) {
                return { ok: false, reason: 'VERSION_NOT_ALLOWED', policy };
            }
            if (policy.expiresAt && Date.now() > Date.parse(policy.expiresAt)) {
                return { ok: false, reason: 'VERSION_EXPIRED', policy };
            }
            const sha256Regex = /^[a-fA-F0-9]{64}$/;
            if (!policy.buildHash || !sha256Regex.test(policy.buildHash)) {
                return { ok: false, reason: 'POLICY_INVALID_HASH', policy };
            }
            if (policy.channel !== 'production') {
                return { ok: false, reason: 'POLICY_INVALID_CHANNEL', policy };
            }
            return { ok: true, reason: 'OK', policy };
        } else {
            // In developer/debug mode, allow fallbacks to standard default release policy for easier testing.
            const normPolicy = normalizePolicy(policy);
            if (normPolicy.allowedVersions.indexOf(version) < 0) {
                return { ok: false, reason: 'VERSION_NOT_ALLOWED', policy: normPolicy };
            }
            if (normPolicy.expiresAt && Date.now() > Date.parse(normPolicy.expiresAt)) {
                return { ok: false, reason: 'VERSION_EXPIRED', policy: normPolicy };
            }
            return { ok: true, reason: 'OK', policy: normPolicy };
        }
    }

    function stopForReleasePolicy(status) {
        _initialized = false;
        const panel = document.getElementById('quyen-panel');
        if (panel) panel.remove();
        QuyenLog.warn('🔒 Extension bị khóa theo release policy:', status.reason);
    }

    function withReleasePolicy(callback) {
        chrome.storage.local.get(['quyen_release_policy', 'quyen_kill_switch'], function (policyData) {
            const status = evaluateReleasePolicy(policyData || {});
            if (!status.ok) {
                stopForReleasePolicy(status);
                return;
            }
            callback(status);
        });
    }

    function bootIfActivated() {
        chrome.storage.local.get(['quyen_activated', 'quyen_enabled', 'quyen_release_policy', 'quyen_kill_switch'], function (data) {
            const releaseStatus = evaluateReleasePolicy(data || {});
            if (!releaseStatus.ok) {
                stopForReleasePolicy(releaseStatus);
                return;
            }
            if (data.quyen_activated === true && data.quyen_enabled !== false) {
                if (!_initialized) {
                    _initialized = true;
                    try {
                        initModules();
                    } catch (err) {
                        QuyenLog.error('Lỗi khởi tạo:', err);
                    }
                }
            } else if (data.quyen_enabled === false) {
                QuyenLog.info('🔒 Extension đã tắt. Mở popup để bật lại.');
            } else {
                QuyenLog.info('🔐 Extension chưa kích hoạt. Mở popup để nhập mã.');
            }
        });
    }

    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (msg && msg.type === 'GET_PERF_TELEMETRY') {
            if (typeof HIS !== 'undefined' && HIS.PerfMetrics) {
                HIS.PerfMetrics.get(function(data) {
                    sendResponse({ success: true, data: data });
                });
            } else {
                sendResponse({ success: true, data: [] });
            }
            return true;
        }
        if (msg && msg.type === 'QUYEN_ACTIVATION_CHANGED' && msg.activated === true) {
            QuyenLog.info('🔓 Đã kích hoạt! Khởi động extension...');
            if (!_initialized) {
                withReleasePolicy(function () {
                    _initialized = true;
                    try {
                        initModules();
                    } catch (err) {
                        QuyenLog.error('Lỗi khởi tạo:', err);
                    }
                });
            }
        }
        // ★ v1.2.0 BugFix: Tắt thật sự khi toggle off — không chỉ ẩn UI
        if (msg && msg.type === 'QUYEN_TOGGLE_EXTENSION' && msg.enabled === false) {
            QuyenLog.info('🔒 Extension đã tắt bởi user. Dừng các module nền.');
            _initialized = false; // Cho phép re-init khi bật lại
        }
        if (msg && msg.type === 'QUYEN_RELEASE_POLICY_CHANGED') {
            bootIfActivated();
        }
    });

    bootIfActivated();
})();
