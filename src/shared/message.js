/**
 * HIS Shared — Message Bus v1.0  (Sprint C)
 * Envelope + origin validation + type allowlist cho postMessage bus.
 *
 * Sử dụng:
 *   HIS.Message.send('QUYEN_DRUG_LIST_RESULT', { drugs: [...] });
 *   HIS.Message.listen('QUYEN_DRUG_LIST_RESULT', function(payload) { ... });
 */

window.HIS = window.HIS || {};

HIS.Message = (function () {
    'use strict';

    // ==========================================
    // MARKER — phân biệt message của extension với bên ngoài
    // ==========================================
    const MARKER = '__quyen_ext__';

    // ==========================================
    // ALLOWLIST — chỉ chấp nhận message types đã đăng ký
    // ==========================================
    const ALLOWED_TYPES = [
        'QUYEN_BRIDGE_READY',
        'QUYEN_CARESHEET_SEC4_DATA',
        'QUYEN_COMBOGRID_CLICK',
        'QUYEN_COMBOGRID_CLICK_RESULT',
        'QUYEN_CONFIG',
        'QUYEN_DRUG_LIST_RESULT',
        'QUYEN_FILL_COMBOGRID',
        'QUYEN_IFRAME_DRUGS',
        'QUYEN_KEYBOARD_SELECT',
        'QUYEN_KEYBOARD_SELECT_RESULT',
        'QUYEN_PATIENT_INFO_RESULT',
        'QUYEN_PATIENT_SELECTED',
        'QUYEN_REQ_CALL_SP',
        'QUYEN_REQ_CARESHEET_SEC4',
        'QUYEN_REQ_DRUG_LIST',
        'QUYEN_REQ_PATIENT_INFO',
        'QUYEN_REQ_VITALS',
        'QUYEN_SP_RESULT',
        'QUYEN_TRIGGER_CHANGE',
        'QUYEN_TRIGGER_SEARCH',
        'QUYEN_TYPE_TEXT',
        'QUYEN_VITALS_RESULT',
        'QUYEN_WAKE_UP_GRID',
        'QUYEN_FILL_ERROR',
        'QUYEN_FORM_PATIENT_CONTEXT',
        'QUYEN_FORM_FOCUSED',
        'QUYEN_FORM_CLOSED'
    ];

    // Set for O(1) lookup
    const _allowedSet = {};
    for (let i = 0; i < ALLOWED_TYPES.length; i++) {
        _allowedSet[ALLOWED_TYPES[i]] = true;
    }

    // ==========================================
    // EXPECTED ORIGIN — tính 1 lần khi load
    // ==========================================
    let _expectedOrigin = '';
    try {
        _expectedOrigin = location.origin || (location.protocol + '//' + location.host);
    } catch (e) { /* ignore */ }

    // ==========================================
    // SEND — đóng envelope + gửi với origin
    // ==========================================

    /**
     * Gửi message qua postMessage với envelope an toàn
     * @param {string} type - QUYEN_* message type
     * @param {Object} payload - dữ liệu gửi kèm
     */
    function send(type, payload) {
        const envelope = {
            _q: MARKER,
            type: type,
            ts: Date.now()
        };

        // Merge payload vào envelope (tương thích code cũ đọc event.data.xxx)
        if (payload && typeof payload === 'object') {
            const keys = Object.keys(payload);
            for (let i = 0; i < keys.length; i++) {
                envelope[keys[i]] = payload[keys[i]];
            }
        }

        // Dùng location.origin thay vì '*'
        const target = _expectedOrigin || '*';
        window.postMessage(envelope, target);
    }

    // ==========================================
    // LISTEN — auto-filter origin + validate
    // ==========================================

    /**
     * Đăng ký listener cho message type cụ thể
     * Tự động filter origin và validate envelope
     * @param {string|string[]} types - type hoặc array of types
     * @param {Function} callback - callback(data, event)
     * @returns {Function} cleanup function để remove listener
     */
    function listen(types, callback) {
        if (typeof types === 'string') types = [types];

        function handler(event) {
            // 1. Origin check
            if (_expectedOrigin && event.origin !== _expectedOrigin) return;

            // 2. Có data?
            if (!event.data || !event.data.type) return;

            // 3. Type match?
            let matched = false;
            for (let i = 0; i < types.length; i++) {
                if (event.data.type === types[i]) { matched = true; break; }
            }
            if (!matched) return;

            // 4. Call
            try { callback(event.data, event); } catch (e) { /* ignore */ }
        }

        window.addEventListener('message', handler);
        return function () { window.removeEventListener('message', handler); };
    }

    // ==========================================
    // VALIDATE — kiểm tra message hợp lệ (dùng cho code cũ)
    // ==========================================

    /**
     * Validate incoming message event
     * ★ BUG-21: Cũng verify _q marker để chống giả mạo từ script khác
     */
    function isValid(event) {
        if (!event || !event.data || !event.data.type) return false;
        // Origin check
        if (_expectedOrigin && event.origin && event.origin !== _expectedOrigin) return false;
        // Type in allowlist
        if (!_allowedSet[event.data.type]) return false;

        // New envelope path (ưu tiên): message có marker chuẩn
        if (event.data._q === MARKER) return true;

        // Legacy bridge path:
        // his-bridge.js (page context) vẫn gửi postMessage raw, không có _q.
        // Chỉ chấp nhận nếu là QUYEN_* và phát từ chính window hiện tại.
        const isLegacyType = typeof event.data.type === 'string' && event.data.type.indexOf('QUYEN_') === 0;
        const sameWindowSource = !event.source || event.source === window;
        if (isLegacyType && sameWindowSource) return true;

        return false;
    }

    /**
     * Target origin cho postMessage (thay '*')
     */
    function getTargetOrigin() {
        return _expectedOrigin || '*';
    }

    // ==========================================
    // EXPOSE
    // ==========================================
    return {
        send: send,
        listen: listen,
        isValid: isValid,
        getTargetOrigin: getTargetOrigin,
        MARKER: MARKER,
        TYPES: _allowedSet
    };
})();

console.log('[HIS] 📨 Message Bus v1.0 loaded');
