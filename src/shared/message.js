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
    const SOURCES = { content: true, bridge: true, popup: true };
    const RESERVED_KEYS = { _q: true, type: true, ts: true, source: true, nonce: true };

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
        'QUYEN_FORM_CLOSED',
        'QUYEN_REQ_VATTU_DATA',
        'QUYEN_VATTU_DATA_RESULT',
        'QUYEN_FILL_VT_ITEM',
        'QUYEN_VT_FILL_RESULT',
        'QUYEN_VT_SEND_ENTER',
        'QUYEN_VT_ENTER_RESULT',
        'QUYEN_VT_PHYSICAL_ENTER_PRESSED',
        'QUYEN_ROLE_BLOCK',
        'QUYEN_HIS_ENV'
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
    function _makeRequestId(type) {
        return String(type || 'msg').toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    function send(type, payload) {
        if (!_allowedSet[type]) {
            if (HIS.Logger) HIS.Logger.warn('Message', 'Blocked unknown message type:', type);
            return false;
        }

        payload = (payload && typeof payload === 'object') ? payload : {};
        const envelope = {
            _q: MARKER,
            type: type,
            ts: Date.now(),
            source: payload.source || 'content',
            requestId: payload.requestId || _makeRequestId(type),
            module: payload.module || '',
            nonce: Math.random().toString(36).slice(2, 12)
        };

        const keys = Object.keys(payload);
        for (let i = 0; i < keys.length; i++) {
            if (RESERVED_KEYS[keys[i]]) continue;
            envelope[keys[i]] = payload[keys[i]];
        }

        const target = _expectedOrigin || (window.location && window.location.origin) || '';
        if (!target) return false;
        window.postMessage(envelope, target);
        return envelope.requestId;
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

            // 2. Envelope hợp lệ?
            if (!isValid(event)) return;

            // 3. Type match?
            let matched = false;
            for (let i = 0; i < types.length; i++) {
                if (event.data.type === types[i]) { matched = true; break; }
            }
            if (!matched) return;

            // 4. Call
            try { callback(event.data, event); } catch (e) { console.error('[HIS.Message] Listener error for type=' + event.data.type + ':', e); }
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

        if (event.data._q !== MARKER) {
            if (HIS.Logger) HIS.Logger.warn('Message', 'Blocked legacy message without marker:', event.data.type);
            return false;
        }

        if (event.data.source && !SOURCES[event.data.source]) return false;
        if (event.data.ts && Math.abs(Date.now() - Number(event.data.ts)) > 5 * 60 * 1000) return false;

        return true;
    }

    /**
     * Target origin cho postMessage (thay '*')
     */
    function getTargetOrigin() {
        return _expectedOrigin || (window.location && window.location.origin) || '';
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
