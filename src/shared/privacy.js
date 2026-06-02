/**
 * HIS Shared — Privacy helpers
 * Central redaction and pseudonym helpers for logs, audit and exports.
 */

window.HIS = window.HIS || {};

HIS.Privacy = (function () {
    'use strict';

    var REDACTED = '[REDACTED]';
    var _salt = '';

    var SENSITIVE_KEYS = {
        name: true,
        hoTen: true,
        HOTEN: true,
        patient: true,
        patientName: true,
        dob: true,
        ngaySinh: true,
        NGAYSINH: true,
        khambenhId: true,
        KHAMBENHID: true,
        hosobenhanid: true,
        HOSOBENHANID: true,
        benhnhanId: true,
        BENHNHANID: true,
        doctor: true,
        doctorName: true,
        bacSi: true,
        drug: true,
        drugName: true,
        medicine: true,
        item: true,
        itemName: true,
        ten: true,
        cachdung: true,
        token: true,
        apiKey: true,
        password: true
    };

    var PATTERNS = [
        { regex: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, replacement: '[DOB]' },
        { regex: /\b\d{4}-\d{1,2}-\d{1,2}\b/g, replacement: '[DATE]' },
        { regex: /\b\d{6,}\b/g, replacement: '[ID]' },
        { regex: /\b[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+){1,5}\b/g, replacement: '[NAME]' }
    ];

    function redactString(value) {
        var text = String(value || '');
        for (var i = 0; i < PATTERNS.length; i++) {
            text = text.replace(PATTERNS[i].regex, PATTERNS[i].replacement);
        }
        return text;
    }

    function redact(value, depth) {
        depth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (depth > 4) return REDACTED;

        if (Array.isArray(value)) {
            return value.map(function (item) { return redact(item, depth + 1); });
        }

        if (typeof value === 'object') {
            var out = {};
            var keys = Object.keys(value);
            for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (SENSITIVE_KEYS[key] || /name|hoten|ngaysinh|dob|khambenh|hosobenh|benhnhan|doctor|bacsi|drug|thuoc|medicine|vattu|item|cachdung|token|password|apikey/i.test(key)) {
                    out[key] = REDACTED;
                } else {
                    out[key] = redact(value[key], depth + 1);
                }
            }
            return out;
        }

        return REDACTED;
    }

    function redactArgs(args) {
        return Array.prototype.slice.call(args || []).map(function (arg) {
            return redact(arg);
        });
    }

    function stableHash(input) {
        var str = String(input || '');
        if (!str) return '';
        var h1 = 0x811c9dc5;
        for (var i = 0; i < str.length; i++) {
            h1 ^= str.charCodeAt(i);
            h1 += (h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24);
        }
        return ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
    }

    function patientFingerprint(patient) {
        if (!patient || typeof patient !== 'object') return '';
        if (!_salt) return '';
        var key = [
            _salt,
            patient.khambenhId || '',
            patient.hosobenhanid || '',
            patient.benhnhanId || '',
            patient.dob || '',
            patient.name || ''
        ].join('|');
        return key.replace(/\|/g, '') ? 'pt_' + stableHash(key) : '';
    }

    function sanitizeAuditDetail(detail) {
        detail = detail || {};
        var source = detail.patient || detail.sourcePatient || detail.source || null;
        var out = redact(detail);

        delete out.patient;
        delete out.sourcePatient;
        delete out.source;
        delete out.drug;
        delete out.drugName;
        delete out.medicine;
        delete out.item;
        delete out.itemName;
        delete out.ten;
        delete out.ma;
        delete out.cachdung;
        delete out.doctor;
        delete out.doctorName;

        out.patientRef = detail.patientRef || patientFingerprint(source);
        out.itemRef = detail.itemRef || (_salt && (detail.drug || detail.item || detail.ma) ? 'it_' + stableHash([_salt, detail.drug || '', detail.item || '', detail.ma || ''].join('|')) : '');
        return out;
    }

    function migrateLegacyStorage() {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get('quyen_privacy_migrated_v2', function (data) {
                    if (data && data.quyen_privacy_migrated_v2 === true) return;
                    chrome.storage.local.remove([
                        'quyen_error_log',
                        'quyen_audit_log',
                        'quyen_stats',
                        'geminiApiKey',
                        'geminiApiKey_encrypted'
                    ], function () {
                        chrome.storage.local.set({ quyen_privacy_migrated_v2: true });
                    });
                });
            }
            try { localStorage.removeItem('quyen_stats'); } catch (e) { /* ignore */ }
        } catch (e) { /* ignore */ }
    }

    function _makeSalt() {
        try {
            if (window.crypto && window.crypto.getRandomValues) {
                var bytes = new Uint8Array(16);
                window.crypto.getRandomValues(bytes);
                return Array.prototype.map.call(bytes, function (b) {
                    return ('0' + b.toString(16)).slice(-2);
                }).join('');
            }
        } catch (e) { /* ignore */ }
        return 'salt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    }

    function initSalt() {
        try {
            if (!_salt) _salt = _makeSalt();
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
            chrome.storage.local.get('quyen_privacy_salt_v1', function (data) {
                if (data && data.quyen_privacy_salt_v1) {
                    _salt = String(data.quyen_privacy_salt_v1);
                    return;
                }
                var salt = _makeSalt();
                chrome.storage.local.set({ quyen_privacy_salt_v1: salt }, function () {
                    _salt = salt;
                });
            });
        } catch (e) { /* extension APIs may be unavailable in tests */ }
    }

    return {
        redact: redact,
        redactString: redactString,
        redactArgs: redactArgs,
        sanitizeAuditDetail: sanitizeAuditDetail,
        patientFingerprint: patientFingerprint,
        stableHash: stableHash,
        initSalt: initSalt,
        migrateLegacyStorage: migrateLegacyStorage
    };
})();

HIS.Privacy.initSalt();
HIS.Privacy.migrateLegacyStorage();

console.log('[HIS] Privacy helpers loaded');
