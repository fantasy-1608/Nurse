/**
 * HIS Shared — Fill Tracker v1.0 (Sprint D)
 * State tracking wrapper cho fill operations.
 * Không thay đổi flow bên trong, chỉ BỌC NGOÀI để:
 * - Theo dõi trạng thái (IDLE/FILLING/DONE/ERROR/TIMEOUT)
 * - Auto-timeout khi fill stuck > 15s
 * - Cho phép cancel từ UI
 * - Emit events cho progress indicator
 */

window.HIS = window.HIS || {};

HIS.FillTracker = (function () {
    'use strict';

    // ==========================================
    // STATES
    // ==========================================
    const STATE = {
        IDLE: 'IDLE',
        FILLING: 'FILLING',
        DRUG_SELECTED: 'DRUG_SELECTED',
        SPEED_FILLED: 'SPEED_FILLED',
        DOCTOR_SELECTED: 'DOCTOR_SELECTED',
        NURSE_SELECTED: 'NURSE_SELECTED',
        DONE: 'DONE',
        ERROR: 'ERROR',
        TIMEOUT: 'TIMEOUT',
        CANCELLED: 'CANCELLED'
    };

    let _state = STATE.IDLE;
    let _startTime = 0;
    let _timeoutTimer = null;
    let _requestId = 0;
    let _currentDrug = null;
    let _steps = [];         // Log của từng bước
    let _listeners = [];     // onChange callbacks
    const _timeoutMs = 30000;  // ★ BUG-05: 30 giây (tăng từ 15s vì 3 ComboGrid có thể tốn 22s trên server chậm)

    // ==========================================
    // START — bắt đầu fill session mới
    // ==========================================
    function start(drug) {
        // Cancel session cũ nếu có
        if (_state === STATE.FILLING || _state === STATE.DRUG_SELECTED || 
            _state === STATE.SPEED_FILLED || _state === STATE.DOCTOR_SELECTED) {
            _notifyListeners(STATE.CANCELLED, 'Hủy do fill mới');
        }

        _requestId++;
        _state = STATE.FILLING;
        _startTime = Date.now();
        _currentDrug = drug;
        _steps = [{ step: 'START', time: 0, detail: drug ? drug.name : '?' }];

        // Auto-timeout
        if (_timeoutTimer) clearTimeout(_timeoutTimer);
        _timeoutTimer = setTimeout(function () {
            if (_isActive()) {
                _state = STATE.TIMEOUT;
                _steps.push({ step: 'TIMEOUT', time: _elapsed(), detail: 'Quá ' + (_timeoutMs / 1000) + 's' });
                _notifyListeners(STATE.TIMEOUT, 'Fill quá thời gian (' + (_timeoutMs / 1000) + 's)');
            }
        }, _timeoutMs);

        _notifyListeners(STATE.FILLING, drug ? drug.name : '');
        return _requestId;
    }

    // ==========================================
    // ADVANCE — ghi nhận tiến trình
    // ==========================================
    function advance(stepName, detail) {
        if (!_isActive()) return;

        const stepMap = {
            'drug': STATE.DRUG_SELECTED,
            'speed': STATE.SPEED_FILLED,
            'doctor': STATE.DOCTOR_SELECTED,
            'nurse': STATE.NURSE_SELECTED
        };

        if (stepMap[stepName]) {
            _state = stepMap[stepName];
        }

        _steps.push({ step: stepName, time: _elapsed(), detail: detail || '' });
        _notifyListeners(_state, stepName + ': ' + (detail || 'OK'));
    }

    // ==========================================
    // COMPLETE — fill xong thành công
    // ==========================================
    function complete(detail) {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        _state = STATE.DONE;
        _steps.push({ step: 'DONE', time: _elapsed(), detail: detail || '' });
        _notifyListeners(STATE.DONE, detail || 'Hoàn tất');
    }

    // ==========================================
    // ERROR — fill thất bại
    // ==========================================
    function error(reason) {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        _state = STATE.ERROR;
        _steps.push({ step: 'ERROR', time: _elapsed(), detail: reason || '' });
        _notifyListeners(STATE.ERROR, reason || 'Lỗi');
    }

    // ==========================================
    // CANCEL — user bấm hủy
    // ==========================================
    function cancel() {
        if (!_isActive()) return false;
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        _state = STATE.CANCELLED;
        _steps.push({ step: 'CANCELLED', time: _elapsed(), detail: 'User cancel' });
        _notifyListeners(STATE.CANCELLED, 'Đã hủy');
        return true;
    }

    // ==========================================
    // STATUS — truy vấn trạng thái
    // ==========================================
    function getStatus() {
        return {
            state: _state,
            drug: _currentDrug ? _currentDrug.name : null,
            elapsed: _isActive() ? _elapsed() : (_steps.length > 0 ? _steps[_steps.length - 1].time : 0),
            steps: _steps.slice(),
            requestId: _requestId,
            isActive: _isActive()
        };
    }

    function isActive() {
        return _isActive();
    }

    // ==========================================
    // LISTENERS — onChange callbacks
    // ==========================================
    function onChange(callback) {
        // ★ BUG-19: Giới hạn số listener để tránh leak
        if (_listeners.length >= 10) {
            console.warn('[HIS] FillTracker: Too many listeners (' + _listeners.length + '), removing oldest');
            _listeners.shift();
        }
        _listeners.push(callback);
        return function () {
            _listeners = _listeners.filter(function (cb) { return cb !== callback; });
        };
    }

    // ==========================================
    // PRIVATE
    // ==========================================
    function _isActive() {
        return _state === STATE.FILLING || _state === STATE.DRUG_SELECTED ||
               _state === STATE.SPEED_FILLED || _state === STATE.DOCTOR_SELECTED ||
               _state === STATE.NURSE_SELECTED;
    }

    function _elapsed() {
        return _startTime ? Date.now() - _startTime : 0;
    }

    function _notifyListeners(state, detail) {
        for (let i = 0; i < _listeners.length; i++) {
            try { _listeners[i](state, detail, getStatus()); } catch (e) { console.debug("[HIS] catch:", e.message || e); }
        }
    }

    // ==========================================
    // EXPOSE
    // ==========================================
    return {
        STATE: STATE,
        start: start,
        advance: advance,
        complete: complete,
        error: error,
        cancel: cancel,
        getStatus: getStatus,
        isActive: isActive,
        onChange: onChange
    };
})();

console.log('[HIS] 📊 FillTracker v1.0 loaded');
