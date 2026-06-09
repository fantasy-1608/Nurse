/**
 * HIS Shared — Fill Tracker v2.0
 * UX-001: General UI State Machine
 * Định nghĩa trạng thái và luật chuyển trạng thái chuẩn hóa.
 */

window.HIS = window.HIS || {};

HIS.FillTracker = (function () {
    'use strict';

    // ==========================================
    // STATES
    // ==========================================
    const STATE = {
        IDLE: 'IDLE',               // Sẵn sàng nhận lệnh
        READY: 'READY',             // Bệnh nhân hợp lệ, sẵn sàng điền
        PREPARING: 'PREPARING',     // Chạy pre-write guard & tạo Context
        WRITING: 'WRITING',         // Đang gửi message và điền DOM
        VERIFYING: 'VERIFYING',     // Đang đối chiếu giá trị hậu ghi
        VERIFIED: 'VERIFIED',       // Đã đối chiếu trùng khớp hoàn toàn (Thành công)
        BLOCKED: 'BLOCKED',         // Bị chặn do vi phạm an toàn / sai thông tin
        ERROR: 'ERROR',             // Lỗi kỹ thuật / Exception
        CANCELLED: 'CANCELLED',     // Người dùng hủy / đổi bệnh nhân đột ngột
        TIMEOUT: 'TIMEOUT'          // Quá hạn thời gian điền (>15-30s)
    };

    let _state = STATE.IDLE;
    let _startTime = 0;
    let _timeoutTimer = null;
    let _requestId = 0;
    let _activeOperation = null;
    let _steps = [];
    let _listeners = [];
    const _timeoutMs = 30000;

    // ==========================================
    // TRANSITIONS
    // ==========================================
    function transitionTo(newState, detail = '') {
        const oldState = _state;

        // Định nghĩa các luật chuyển đổi hợp lệ (State Transition Matrix)
        const allowedTransitions = {
            [STATE.IDLE]: [STATE.READY, STATE.PREPARING, STATE.BLOCKED, STATE.ERROR],
            [STATE.READY]: [STATE.PREPARING, STATE.IDLE, STATE.BLOCKED],
            [STATE.PREPARING]: [STATE.WRITING, STATE.BLOCKED, STATE.CANCELLED, STATE.ERROR],
            [STATE.WRITING]: [STATE.VERIFYING, STATE.CANCELLED, STATE.TIMEOUT, STATE.ERROR],
            [STATE.VERIFYING]: [STATE.VERIFIED, STATE.BLOCKED, STATE.CANCELLED, STATE.TIMEOUT, STATE.ERROR],
            [STATE.VERIFIED]: [STATE.IDLE, STATE.READY],
            [STATE.BLOCKED]: [STATE.IDLE, STATE.READY, STATE.PREPARING],
            [STATE.ERROR]: [STATE.IDLE, STATE.READY],
            [STATE.CANCELLED]: [STATE.IDLE, STATE.READY],
            [STATE.TIMEOUT]: [STATE.IDLE, STATE.READY]
        };

        if (oldState !== newState) {
            const allowed = allowedTransitions[oldState] || [];
            if (!allowed.includes(newState)) {
                console.warn(`[FillTracker] Invalid transition requested: ${oldState} -> ${newState}. Direct transition forced.`);
            }
            
            _state = newState;
            _steps.push({ step: newState, time: _elapsed(), detail: detail });
            _notifyListeners(newState, detail);

            // Log performance metrics on terminal states
            const terminalStates = [STATE.VERIFIED, STATE.BLOCKED, STATE.ERROR, STATE.CANCELLED, STATE.TIMEOUT];
            if (terminalStates.includes(newState)) {
                if (typeof HIS !== 'undefined' && HIS.PerfMetrics && typeof HIS.PerfMetrics.log === 'function') {
                    const elapsed = _elapsed();
                    const moduleName = _activeOperation ? (_activeOperation.module || _activeOperation.name) : 'unknown';
                    
                    let fallbackUsed = false;
                    if (detail && typeof detail === 'string' && detail.toLowerCase().includes('fallback')) {
                        fallbackUsed = true;
                    } else if (_activeOperation && _activeOperation.fallbackUsed) {
                        fallbackUsed = true;
                    }

                    let staleDropped = false;
                    if (detail && typeof detail === 'string' && detail.toLowerCase().includes('stale')) {
                        staleDropped = true;
                    }

                    HIS.PerfMetrics.log({
                        module: moduleName,
                        step: oldState + ' -> ' + newState,
                        durationMs: elapsed,
                        result: newState,
                        fallbackUsed: fallbackUsed,
                        timeout: newState === STATE.TIMEOUT,
                        staleDropped: staleDropped,
                        ts: new Date().toISOString()
                    });
                }
            }
        }
    }

    function start(operation) {
        if (_timeoutTimer) clearTimeout(_timeoutTimer);
        
        _requestId++;
        _startTime = Date.now();
        _activeOperation = operation;
        _steps = [{ step: STATE.PREPARING, time: 0, detail: operation ? operation.name : '?' }];
        
        _state = STATE.PREPARING;
        _notifyListeners(STATE.PREPARING, operation ? operation.name : '');

        // Khởi động bộ đếm giờ tự động quá hạn
        _timeoutTimer = setTimeout(function () {
            if (_isActive()) {
                transitionTo(STATE.TIMEOUT, `Quá ${_timeoutMs / 1000}s`);
            }
        }, _timeoutMs);

        return _requestId;
    }

    // Helper tương thích ngược với v1.0
    function advance(stepName, detail) {
        if (!_isActive()) return;
        _steps.push({ step: stepName, time: _elapsed(), detail: detail || '' });
        _notifyListeners(_state, stepName + ': ' + (detail || 'OK'));
    }

    function complete(detail) {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        transitionTo(STATE.VERIFIED, detail || 'Xác minh thành công');
    }

    function error(reason) {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        transitionTo(STATE.ERROR, reason || 'Gặp sự cố');
    }

    function block(reason) {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        transitionTo(STATE.BLOCKED, reason || 'Bị chặn');
    }

    function cancel(reason) {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        transitionTo(STATE.CANCELLED, reason || 'Hủy bỏ');
    }

    function reset() {
        if (_timeoutTimer) { clearTimeout(_timeoutTimer); _timeoutTimer = null; }
        _state = STATE.IDLE;
        _activeOperation = null;
        _startTime = 0;
        _steps = [];
        _notifyListeners(STATE.IDLE, 'Reset');
    }

    function getStatus() {
        return {
            state: _state,
            operation: _activeOperation ? _activeOperation.name : null,
            elapsed: _isActive() ? _elapsed() : (_steps.length > 0 ? _steps[_steps.length - 1].time : 0),
            steps: _steps.slice(),
            requestId: _requestId,
            isActive: _isActive()
        };
    }

    function isActive() {
        return _isActive();
    }

    function onChange(callback) {
        if (_listeners.length >= 10) {
            _listeners.shift();
        }
        _listeners.push(callback);
        return function () {
            _listeners = _listeners.filter(function (cb) { return cb !== callback; });
        };
    }

    function _isActive() {
        return _state === STATE.PREPARING || _state === STATE.WRITING || _state === STATE.VERIFYING;
    }

    function _elapsed() {
        return _startTime ? Date.now() - _startTime : 0;
    }

    function _notifyListeners(state, detail) {
        const status = getStatus();
        for (let i = 0; i < _listeners.length; i++) {
            try { _listeners[i](state, detail, status); } catch (e) { console.debug("[HIS] catch:", e.message || e); }
        }
    }

    return {
        STATE: STATE,
        start: start,
        advance: advance,
        complete: complete,
        error: error,
        block: block,
        cancel: cancel,
        reset: reset,
        getStatus: getStatus,
        isActive: isActive,
        onChange: onChange,
        transitionTo: transitionTo
    };
})();

console.log('[HIS] FillTracker v2.0 loaded');
