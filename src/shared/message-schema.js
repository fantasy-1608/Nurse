/**
 * 🏥 HIS Shared — Message Schema Validation
 * Single source of truth for message validation in content scripts and page context.
 */

window.HIS = window.HIS || {};

HIS.MessageSchema = (function () {
    'use strict';

    // Type definition rules for the allowlist
    const SCHEMAS = {
        'QUYEN_BRIDGE_READY': {
            maxPayloadBytes: 1024,
            fields: {
                status: { type: 'string', pattern: /^ready$/ },
                bridgeVersion: { type: 'string' }
            }
        },
        'QUYEN_CARESHEET_SEC4_DATA': {
            maxPayloadBytes: 8192,
            fields: {
                seq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true },
                phieuId: { type: 'string', optional: true },
                patientName: { type: 'string', optional: true },
                weight: { type: 'string', optional: true },
                height: { type: 'string', optional: true },
                data: { type: 'object', optional: true },
                sec17: { type: 'object', optional: true },
                vitalsFromPrev: { type: 'object', optional: true }
            }
        },
        'QUYEN_COMBOGRID_CLICK': {
            maxPayloadBytes: 2048,
            fields: {
                marker: { type: 'string', pattern: /^quyen_(input|combo|marker)_[0-9a-zA-Z_-]+$/ },
                patientSeq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true }
            }
        },
        'QUYEN_COMBOGRID_CLICK_RESULT': {
            maxPayloadBytes: 1024,
            fields: {
                success: { type: 'boolean' },
                marker: { type: 'string', optional: true },
                error: { type: 'string', optional: true }
            }
        },
        'QUYEN_CONFIG': {
            maxPayloadBytes: 2048,
            fields: {
                config: { type: 'object' }
            }
        },
        'QUYEN_DRUG_LIST_RESULT': {
            maxPayloadBytes: 65536,
            fields: {
                drugs: { type: 'array', optional: true },
                count: { type: 'number', optional: true },
                error: { type: 'string', optional: true }
            }
        },
        'QUYEN_FILL_COMBOGRID': {
            maxPayloadBytes: 8192,
            fields: {
                tasks: { type: 'object' },
                patientSeq: { type: 'number' },
                khambenhId: { type: 'string' }
            }
        },
        'QUYEN_IFRAME_DRUGS': {
            maxPayloadBytes: 65536,
            fields: {
                drugs: { type: 'array' }
            }
        },
        'QUYEN_KEYBOARD_SELECT': {
            maxPayloadBytes: 2048,
            fields: {
                inputMarker: { type: 'string', pattern: /^quyen_(input|combo|marker)_[0-9a-zA-Z_-]+$/ },
                itemIndex: { type: 'number', min: 0, max: 200 },
                patientSeq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true }
            }
        },
        'QUYEN_KEYBOARD_SELECT_RESULT': {
            maxPayloadBytes: 1024,
            fields: {
                success: { type: 'boolean' }
            }
        },
        'QUYEN_PATIENT_INFO_RESULT': {
            maxPayloadBytes: 8192,
            fields: {
                patient: { type: 'object' }
            }
        },
        'QUYEN_PATIENT_SELECTED': {
            maxPayloadBytes: 8192,
            fields: {
                seq: { type: 'number' },
                patient: { type: 'object' },
                vitals: { type: 'object', optional: true }
            }
        },
        'QUYEN_REQ_CALL_SP': {
            maxPayloadBytes: 4096,
            fields: {
                spName: { type: 'string', pattern: /^[A-Za-z0-9._-]+$/ },
                params: { type: 'any', optional: true }
            }
        },
        'QUYEN_REQ_CARESHEET_SEC4': {
            maxPayloadBytes: 1024,
            fields: {
                seq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true }
            }
        },
        'QUYEN_REQ_DRUG_LIST': {
            maxPayloadBytes: 1024,
            fields: {
                treatmentId: { type: 'string', optional: true }
            }
        },
        'QUYEN_REQ_PATIENT_INFO': {
            maxPayloadBytes: 1024,
            fields: {
                rowId: { type: 'string' }
            }
        },
        'QUYEN_REQ_VITALS': {
            maxPayloadBytes: 1024,
            fields: {}
        },
        'QUYEN_REQ_VATTU_DATA': {
            maxPayloadBytes: 2048,
            fields: {
                khambenhId: { type: 'string', optional: true },
                benhnhanId: { type: 'string', optional: true },
                hosobenhanid: { type: 'string', optional: true }
            }
        },
        'QUYEN_VATTU_DATA_RESULT': {
            maxPayloadBytes: 65536,
            fields: {
                drugs: { type: 'array' },
                existingVT: { type: 'array' },
                diagnosis: { type: 'string', optional: true }
            }
        },
        'QUYEN_SP_RESULT': {
            maxPayloadBytes: 16384,
            fields: {
                spName: { type: 'string', pattern: /^[A-Za-z0-9._-]+$/ },
                success: { type: 'boolean', optional: true },
                result: { type: 'any', optional: true },
                error: { type: 'string', optional: true }
            }
        },
        'QUYEN_TRIGGER_CHANGE': {
            maxPayloadBytes: 2048,
            fields: {
                selector: { type: 'string', pattern: /^#[A-Za-z0-9_-]+$/ },
                value: { type: 'string' },
                patientSeq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true }
            }
        },
        'QUYEN_TRIGGER_SEARCH': {
            maxPayloadBytes: 1024,
            fields: {
                inputMarker: { type: 'string', pattern: /^quyen_(input|combo|marker)_[0-9a-zA-Z_-]+$/ }
            }
        },
        'QUYEN_TYPE_TEXT': {
            maxPayloadBytes: 2048,
            fields: {
                inputMarker: { type: 'string', pattern: /^quyen_(input|combo|marker)_[0-9a-zA-Z_-]+$/ },
                text: { type: 'string' },
                patientSeq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true }
            }
        },
        'QUYEN_VITALS_RESULT': {
            maxPayloadBytes: 2048,
            fields: {
                vitals: { type: 'object' }
            }
        },
        'QUYEN_WAKE_UP_GRID': {
            maxPayloadBytes: 1024,
            fields: {
                inputMarker: { type: 'string', pattern: /^quyen_(input|combo|marker)_[0-9a-zA-Z_-]+$/ }
            }
        },
        'QUYEN_FILL_ERROR': {
            maxPayloadBytes: 2048,
            fields: {
                error: { type: 'string' },
                details: { type: 'string', optional: true }
            }
        },
        'QUYEN_FORM_PATIENT_CONTEXT': {
            maxPayloadBytes: 1024,
            fields: {
                patientSeq: { type: 'number' },
                khambenhId: { type: 'string' }
            }
        },
        'QUYEN_FORM_FOCUSED': {
            maxPayloadBytes: 1024,
            fields: {
                tab: { type: 'string', pattern: /^(caresheet|infusion|vattu)$/ }
            }
        },
        'QUYEN_FORM_CLOSED': {
            maxPayloadBytes: 1024,
            fields: {}
        },
        'QUYEN_FILL_VT_ITEM': {
            maxPayloadBytes: 4096,
            fields: {
                patientSeq: { type: 'number' },
                khambenhId: { type: 'string' },
                ma: { type: 'string', pattern: /^[A-Z0-9._-]{1,32}$/ },
                ten: { type: 'string' },
                sl: { type: 'number', min: 1, max: 99 },
                cachdung: { type: 'string', optional: true },
                vtSource: { type: 'string', optional: true }
            }
        },
        'QUYEN_VT_FILL_RESULT': {
            maxPayloadBytes: 2048,
            fields: {
                success: { type: 'boolean' },
                ma: { type: 'string', pattern: /^[A-Z0-9._-]{1,32}$/ },
                error: { type: 'string', optional: true },
                verified: { type: 'boolean', optional: true }
            }
        },
        'QUYEN_VT_SEND_ENTER': {
            maxPayloadBytes: 1024,
            fields: {
                patientSeq: { type: 'number', optional: true },
                khambenhId: { type: 'string', optional: true }
            }
        },
        'QUYEN_VT_ENTER_RESULT': {
            maxPayloadBytes: 1024,
            fields: {
                success: { type: 'boolean' },
                error: { type: 'string', optional: true }
            }
        },
        'QUYEN_VT_PHYSICAL_ENTER_PRESSED': {
            maxPayloadBytes: 1024,
            fields: {
                ma: { type: 'string', pattern: /^[A-Z0-9._-]{1,32}$/ }
            }
        },
        'QUYEN_ROLE_BLOCK': {
            maxPayloadBytes: 1024,
            fields: {
                role: { type: 'string' },
                reason: { type: 'string', optional: true }
            }
        },
        'QUYEN_HIS_ENV': {
            maxPayloadBytes: 2048,
            fields: {
                hisVersion: { type: 'string' },
                jqVersion: { type: 'string' }
            }
        }
    };

    const ENVELOPE_KEYS = {
        _q: true,
        type: true,
        ts: true,
        source: true,
        nonce: true,
        sessionNonce: true,
        requestId: true,
        module: true,
        seq: true,
        patientSeq: true,
        khambenhId: true,
        hosobenhanid: true,
        benhnhanId: true
    };

    /**
     * Strict validation for messages
     * @param {Object} message 
     * @returns {Object} { ok: boolean, reason: string, field?: string }
     */
    function validate(message) {
        if (!message || typeof message !== 'object') {
            return { ok: false, reason: 'MESSAGE_NOT_OBJECT' };
        }
        if (message._q !== '__quyen_ext__') {
            return { ok: false, reason: 'INVALID_MARKER', field: '_q' };
        }
        if (typeof message.type !== 'string') {
            return { ok: false, reason: 'INVALID_TYPE_FIELD', field: 'type' };
        }
        const type = message.type;
        const schema = SCHEMAS[type];
        if (!schema) {
            return { ok: false, reason: 'UNKNOWN_TYPE' };
        }
        if (typeof message.ts !== 'number') {
            return { ok: false, reason: 'INVALID_TS', field: 'ts' };
        }
        if (typeof message.source !== 'string' || !/^(content|bridge|popup)$/.test(message.source)) {
            return { ok: false, reason: 'INVALID_SOURCE', field: 'source' };
        }
        if (typeof message.nonce !== 'string') {
            return { ok: false, reason: 'INVALID_NONCE', field: 'nonce' };
        }
        if (typeof message.sessionNonce !== 'string') {
            return { ok: false, reason: 'INVALID_SESSION_NONCE', field: 'sessionNonce' };
        }
        if (typeof message.requestId !== 'string') {
            return { ok: false, reason: 'INVALID_REQUEST_ID', field: 'requestId' };
        }
        if (message.hasOwnProperty('module') && typeof message.module !== 'string') {
            return { ok: false, reason: 'INVALID_MODULE', field: 'module' };
        }
        if (message.hasOwnProperty('seq') && typeof message.seq !== 'number') {
            return { ok: false, reason: 'INVALID_SEQ', field: 'seq' };
        }
        if (message.hasOwnProperty('patientSeq') && typeof message.patientSeq !== 'number') {
            return { ok: false, reason: 'INVALID_PATIENT_SEQ', field: 'patientSeq' };
        }
        if (message.hasOwnProperty('khambenhId') && typeof message.khambenhId !== 'string') {
            return { ok: false, reason: 'INVALID_KHAMBENH_ID', field: 'khambenhId' };
        }
        if (message.hasOwnProperty('hosobenhanid') && typeof message.hosobenhanid !== 'string') {
            return { ok: false, reason: 'INVALID_HOSOBENHANID', field: 'hosobenhanid' };
        }
        if (message.hasOwnProperty('benhnhanId') && typeof message.benhnhanId !== 'string') {
            return { ok: false, reason: 'INVALID_BENHNHAN_ID', field: 'benhnhanId' };
        }

        // 1. Size constraint checks
        let payloadStr;
        try {
            payloadStr = JSON.stringify(message);
        } catch (e) {
            return { ok: false, reason: 'JSON_SERIALIZATION_FAILED' };
        }
        
        // Byte length calculation compatible with both contexts and mock environments
        let payloadBytes;
        if (typeof TextEncoder !== 'undefined') {
            payloadBytes = new TextEncoder().encode(payloadStr).length;
        } else {
            payloadBytes = unescape(encodeURIComponent(payloadStr)).length;
        }

        if (payloadBytes > schema.maxPayloadBytes) {
            return { ok: false, reason: 'PAYLOAD_OVERSIZED', size: payloadBytes, max: schema.maxPayloadBytes };
        }

        // 2. Extraneous keys validation
        const keys = Object.keys(message);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (ENVELOPE_KEYS[key]) continue;
            if (!schema.fields.hasOwnProperty(key)) {
                return { ok: false, reason: 'UNKNOWN_FIELD', field: key };
            }
        }

        // 3. Expected fields checks
        const fieldSpecs = schema.fields;
        const schemaKeys = Object.keys(fieldSpecs);
        for (let i = 0; i < schemaKeys.length; i++) {
            const k = schemaKeys[i];
            const spec = fieldSpecs[k];
            const val = message[k];

            if (val === undefined || val === null) {
                if (spec.optional) continue;
                return { ok: false, reason: 'MISSING_REQUIRED_FIELD', field: k };
            }

            const expectedType = spec.type;
            const actualType = typeof val;

            if (expectedType === 'array') {
                if (!Array.isArray(val)) {
                    return { ok: false, reason: 'INVALID_TYPE', field: k, expected: 'array', got: actualType };
                }
            } else if (expectedType === 'any') {
                // accepts anything
            } else if (actualType !== expectedType) {
                return { ok: false, reason: 'INVALID_TYPE', field: k, expected: expectedType, got: actualType };
            }

            if (spec.pattern && typeof val === 'string') {
                if (!spec.pattern.test(val)) {
                    return { ok: false, reason: 'PATTERN_MISMATCH', field: k, value: val };
                }
            }

            if (expectedType === 'number') {
                if (spec.hasOwnProperty('min') && val < spec.min) return { ok: false, reason: 'VALUE_TOO_SMALL', field: k, value: val, min: spec.min };
                if (spec.hasOwnProperty('max') && val > spec.max) return { ok: false, reason: 'VALUE_TOO_LARGE', field: k, value: val, max: spec.max };
            }
        }

        return { ok: true };
    }

    return {
        validate: validate,
        SCHEMAS: SCHEMAS
    };
})();
