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

    function utf8Encode(str) {
        var codePoints = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x80) {
                codePoints.push(c);
            } else if (c < 0x800) {
                codePoints.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
            } else if (c < 0xd800 || c >= 0xe000) {
                codePoints.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
            } else {
                i++;
                c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
                codePoints.push(
                    0xf0 | (c >> 18),
                    0x80 | ((c >> 12) & 0x3f),
                    0x80 | ((c >> 6) & 0x3f),
                    0x80 | (c & 0x3f)
                );
            }
        }
        return codePoints;
    }

    function sha256Bytes(bytes) {
        var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
        var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

        var k = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        var l = bytes.length;
        bytes.push(0x80);
        while ((bytes.length + 8) % 64 !== 0) {
            bytes.push(0x00);
        }
        var bits = l * 8;
        var bitsHigh = Math.floor(bits / 0x100000000);
        var bitsLow = bits % 0x100000000;
        bytes.push(
            (bitsHigh >>> 24) & 0xff,
            (bitsHigh >>> 16) & 0xff,
            (bitsHigh >>> 8) & 0xff,
            bitsHigh & 0xff,
            (bitsLow >>> 24) & 0xff,
            (bitsLow >>> 16) & 0xff,
            (bitsLow >>> 8) & 0xff,
            bitsLow & 0xff
        );

        var w = new Array(64);
        for (var i = 0; i < bytes.length; i += 64) {
            for (var t = 0; t < 16; t++) {
                w[t] = (bytes[i + t * 4] << 24) |
                       (bytes[i + t * 4 + 1] << 16) |
                       (bytes[i + t * 4 + 2] << 8) |
                       (bytes[i + t * 4 + 3]);
            }
            for (var t = 16; t < 64; t++) {
                var s0 = (rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3));
                var s1 = (rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10));
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
            }

            var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

            for (var t = 0; t < 64; t++) {
                var s1_e = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25));
                var ch = ((e & f) ^ (~e & g));
                var temp1 = (h + s1_e + ch + k[t] + w[t]) | 0;
                var s0_a = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22));
                var maj = ((a & b) ^ (a & c) ^ (b & c));
                var temp2 = (s0_a + maj) | 0;

                h = g;
                g = f;
                f = e;
                e = (d + temp1) | 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) | 0;
            }

            h0 = (h0 + a) | 0;
            h1 = (h1 + b) | 0;
            h2 = (h2 + c) | 0;
            h3 = (h3 + d) | 0;
            h4 = (h4 + e) | 0;
            h5 = (h5 + f) | 0;
            h6 = (h6 + g) | 0;
            h7 = (h7 + h) | 0;
        }

        return [h0, h1, h2, h3, h4, h5, h6, h7];

        function rotr(x, n) {
            return (x >>> n) | (x << (32 - n));
        }
    }

    function hex(words) {
        var str = '';
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            str += ('00000000' + (w >>> 0).toString(16)).slice(-8);
        }
        return str;
    }

    function hmacSha256(keyStr, msgStr) {
        var keyBytes = utf8Encode(keyStr);
        var msgBytes = utf8Encode(msgStr);

        var blockBytes = 64;
        if (keyBytes.length > blockBytes) {
            var hashWords = sha256Bytes(keyBytes);
            keyBytes = [];
            for (var i = 0; i < 8; i++) {
                var w = hashWords[i];
                keyBytes.push(
                    (w >>> 24) & 0xff,
                    (w >>> 16) & 0xff,
                    (w >>> 8) & 0xff,
                    w & 0xff
                );
            }
        }
        while (keyBytes.length < blockBytes) {
            keyBytes.push(0);
        }

        var ipad = new Array(blockBytes);
        var opad = new Array(blockBytes);
        for (var i = 0; i < blockBytes; i++) {
            ipad[i] = keyBytes[i] ^ 0x36;
            opad[i] = keyBytes[i] ^ 0x5c;
        }

        var innerMsg = ipad.concat(msgBytes);
        var innerHashWords = sha256Bytes(innerMsg);
        var innerHashBytes = [];
        for (var i = 0; i < 8; i++) {
            var w = innerHashWords[i];
            innerHashBytes.push(
                (w >>> 24) & 0xff,
                (w >>> 16) & 0xff,
                (w >>> 8) & 0xff,
                w & 0xff
            );
        }

        var outerMsg = opad.concat(innerHashBytes);
        return hex(sha256Bytes(outerMsg));
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
            patient.khambenhId || '',
            patient.hosobenhanid || '',
            patient.benhnhanId || '',
            patient.dob || '',
            patient.name || ''
        ].join('|').replace(/\|/g, '');
        return key ? 'pt_' + hmacSha256(_salt, key) : '';
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
        out.itemRef = detail.itemRef || (_salt && (detail.drug || detail.item || detail.ma) ? 'it_' + hmacSha256(_salt, [detail.drug || '', detail.item || '', detail.ma || ''].join('|')) : '');
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

    var _initSaltPromise = null;
    function initSalt() {
        if (_initSaltPromise) return _initSaltPromise;
        _initSaltPromise = new Promise(function (resolve) {
            try {
                if (!_salt) _salt = _makeSalt();
                if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
                    resolve();
                    return;
                }
                chrome.storage.local.get('quyen_privacy_salt_v1', function (data) {
                    if (data && data.quyen_privacy_salt_v1) {
                        _salt = String(data.quyen_privacy_salt_v1);
                        resolve();
                        return;
                    }
                    var salt = _makeSalt();
                    chrome.storage.local.set({ quyen_privacy_salt_v1: salt }, function () {
                        _salt = salt;
                        resolve();
                    });
                });
            } catch (e) {
                /* extension APIs may be unavailable in tests */
                resolve();
            }
        });
        return _initSaltPromise;
    }

    return {
        redact: redact,
        redactString: redactString,
        redactArgs: redactArgs,
        sanitizeAuditDetail: sanitizeAuditDetail,
        patientFingerprint: patientFingerprint,
        stableHash: stableHash,
        hmacSha256: hmacSha256,
        initSalt: initSalt,
        migrateLegacyStorage: migrateLegacyStorage
    };
})();

HIS.Privacy.initSalt();
HIS.Privacy.migrateLegacyStorage();

console.log('[HIS] Privacy helpers loaded');
