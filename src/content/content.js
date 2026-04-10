/**
 * __EXT_EMOJI__ __EXT_NAME__ — Content Script Orchestrator
 * Khởi tạo extension, inject page script, và kết nối các module
 * 
 * v1.2: Fix vòng lặp vô hạn, bỏ iframe scanner
 */

/* global QuyenLog, QUYEN_CONFIG, QuyenInfusionReader, QuyenUI */

(function () {
    'use strict';

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
    function injectBridgeScript() {
        const id = 'quyen-bridge-script';
        if (document.getElementById(id)) return;

        const script = document.createElement('script');
        script.id = id;

        try {
            const _chrome = /** @type {any} */ (window).chrome;
            if (_chrome && _chrome.runtime) {
                script.src = _chrome.runtime.getURL('injected/his-bridge.js');
            }
        } catch (e) {
            QuyenLog.error('Không thể inject bridge script:', e);
            return;
        }

        script.onload = function () {
            QuyenLog.info('Bridge script injected thành công __EXT_EMOJI__');
            /** @type {HTMLElement} */ (script).remove();
        };

        (document.head || document.documentElement).appendChild(script);
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
    // ★ ACTIVATION GATE — Chỉ chạy khi đã kích hoạt
    // ==========================================
    let _initialized = false;

    function bootIfActivated() {
        chrome.storage.local.get(['quyen_activated', 'quyen_enabled'], function (data) {
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

    chrome.runtime.onMessage.addListener(function (msg) {
        if (msg && msg.type === 'QUYEN_ACTIVATION_CHANGED' && msg.activated === true) {
            QuyenLog.info('🔓 Đã kích hoạt! Khởi động extension...');
            if (!_initialized) {
                _initialized = true;
                try {
                    initModules();
                } catch (err) {
                    QuyenLog.error('Lỗi khởi tạo:', err);
                }
            }
        }
        // ★ v1.2.0 BugFix: Tắt thật sự khi toggle off — không chỉ ẩn UI
        if (msg && msg.type === 'QUYEN_TOGGLE_EXTENSION' && msg.enabled === false) {
            QuyenLog.info('🔒 Extension đã tắt bởi user. Dừng các module nền.');
            _initialized = false; // Cho phép re-init khi bật lại
        }
    });

    bootIfActivated();
})();
