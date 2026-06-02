/**
 * HIS Shared — Safety controls
 * Global Safe Mode and audit guard for clinical autofill flows.
 */

window.HIS = window.HIS || {};

HIS.Safety = (function () {
    'use strict';

    var _safeMode = false;
    var _killSwitch = false;
    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['quyen_safe_mode', 'quyen_kill_switch'], function (data) {
                    _safeMode = data && data.quyen_safe_mode === true;
                    _killSwitch = data && data.quyen_kill_switch === true;
                });
                if (chrome.storage.onChanged) {
                    chrome.storage.onChanged.addListener(function (changes, area) {
                        if (area === 'local' && changes.quyen_safe_mode) {
                            _safeMode = changes.quyen_safe_mode.newValue === true;
                        }
                        if (area === 'local' && changes.quyen_kill_switch) {
                            _killSwitch = changes.quyen_kill_switch.newValue === true;
                        }
                    });
                }
            }
        } catch (e) { /* extension APIs may be unavailable in tests */ }
    }

    function isSafeMode() {
        return _safeMode === true || _killSwitch === true;
    }

    function setSafeModeForTest(value) {
        _safeMode = value === true;
    }

    function getSourcePatient() {
        try {
            if (HIS.PatientLock && HIS.PatientLock.getSourceContext) {
                return HIS.PatientLock.getSourceContext();
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function audit(action, detail) {
        if (!HIS.Audit || typeof HIS.Audit.log !== 'function') {
            return Promise.reject(new Error('AUDIT_UNAVAILABLE'));
        }
        return HIS.Audit.log(action, detail || {});
    }

    function guardAutoFill(action, detail) {
        detail = Object.assign({
            module: 'unknown',
            patient: getSourcePatient()
        }, detail || {});

        if (isSafeMode()) {
            return audit(action + '_BLOCKED', Object.assign({}, detail, {
                result: 'BLOCKED',
                reason: _killSwitch ? 'KILL_SWITCH' : 'SAFE_MODE'
            })).catch(function () {
                return null;
            }).then(function () {
                throw new Error(_killSwitch ? 'KILL_SWITCH' : 'SAFE_MODE');
            });
        }

        return audit(action, Object.assign({}, detail, {
            result: 'STARTED'
        }));
    }

    function auditResult(action, detail) {
        return audit(action, Object.assign({
            patient: getSourcePatient()
        }, detail || {})).catch(function (err) {
            if (HIS.Logger) HIS.Logger.warn('Safety', 'Audit result failed:', err && err.message ? err.message : err);
        });
    }

    init();

    return {
        init: init,
        isSafeMode: isSafeMode,
        setSafeModeForTest: setSafeModeForTest,
        guardAutoFill: guardAutoFill,
        auditResult: auditResult
    };
})();

console.log('[HIS] Safety controls loaded');
