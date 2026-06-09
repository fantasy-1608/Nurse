/**
 * HIS Shared — OperationContext v1.0
 * SAFE-CORE-001: Quản lý ngữ cảnh nghiệp vụ ghi dữ liệu lâm sàng.
 * Đảm bảo tính nguyên tử (atomicity) và fail-closed của thao tác ghi.
 */

window.HIS = window.HIS || {};

HIS.OperationContext = (function () {
    'use strict';

    let _activeContext = null;

    // Helper: Tạo chuỗi ngẫu nhiên tránh trùng lặp
    function uuid(prefix) {
        return (prefix || '') + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    }

    // Helper: Trả về tất cả documents (chính và iframe) để quét fingerprint
    function _getAllDocuments() {
        if (typeof HIS !== 'undefined' && HIS.DocCache) {
            return HIS.DocCache.getAll();
        }
        const docs = [document];
        try {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const iDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iDoc) {
                        docs.push(iDoc);
                        const subIframes = iDoc.querySelectorAll('iframe');
                        for (let j = 0; j < subIframes.length; j++) {
                            try {
                                const sDoc = subIframes[j].contentDocument || subIframes[j].contentWindow.document;
                                if (sDoc) docs.push(sDoc);
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    /**
     * Tạo vân tay (fingerprint) của form hiện tại để phát hiện thay đổi layout/tab/bệnh nhân
     */
    function getFormFingerprint(moduleName) {
        let doc = document;
        const allDocs = _getAllDocuments();
        
        if (moduleName === 'caresheet') {
            if (typeof QuyenCareSheetFiller !== 'undefined') {
                doc = QuyenCareSheetFiller.getFormDocument() || document;
            }
        } else {
            for (const d of allDocs) {
                if (moduleName === 'infusion' && d.getElementById('txtTKDT')) {
                    doc = d;
                    break;
                }
                if (moduleName === 'vattu' && d.getElementById('txtDS_THUOC')) {
                    doc = d;
                    break;
                }
            }
        }

        // Lấy tên bệnh nhân đang hiển thị trên DOM tại thời điểm hiện tại
        let domPatientName = '';
        try {
            if (HIS.PatientLock && typeof HIS.PatientLock.readTargetFromDOM === 'function') {
                const target = HIS.PatientLock.readTargetFromDOM();
                if (target) {
                    domPatientName = target.name || '';
                }
            }
        } catch (e) {}

        // Thay vì đếm số lượng ô input (rất dễ bị sai lệch khi ComboGrid/DatePicker tạo element tạm),
        // Ta chỉ cần kiểm tra xem form chính có còn hiển thị hay không.
        let isAlive = 0;
        try {
            if (moduleName === 'infusion') {
                const el = doc.getElementById('txtTKDT');
                if (el && (el.offsetWidth > 0 || el.offsetParent !== null)) isAlive = 1;
            } else if (moduleName === 'vattu') {
                const el = doc.getElementById('txtDS_THUOC');
                if (el && (el.offsetWidth > 0 || el.offsetParent !== null)) isAlive = 1;
            } else if (moduleName === 'caresheet') {
                isAlive = 1; // Assuming caresheet is alive if we got doc
            }
        } catch (e) {}

        return [moduleName, domPatientName, isAlive].join('|');
    }

    /**
     * Khởi tạo OperationContext mới trước khi ghi
     * @param {string} moduleName - 'infusion' | 'caresheet' | 'vattu'
     * @param {Object} [options] - override properties
     * @returns {Object} context
     */
    function create(moduleName, options = {}) {
        if (typeof HIS !== 'undefined' && HIS.DocCache) {
            HIS.DocCache.invalidate();
        }
        // Hủy context đang hoạt động cũ (nếu có) trước khi tạo mới
        if (_activeContext) {
            cancel('SUPERSEDED_BY_NEW_CONTEXT');
        }

        const sourcePatient = (HIS.PatientLock && typeof HIS.PatientLock.getSourceContext === 'function')
             ? HIS.PatientLock.getSourceContext()
             : null;

        const patientSeq = options.patientSeq || (sourcePatient && (sourcePatient.seq || sourcePatient.patientSeq)) || 0;
        const khambenhId = options.khambenhId || (sourcePatient && sourcePatient.khambenhId) || '';
        const hosobenhanid = options.hosobenhanid || (sourcePatient && sourcePatient.hosobenhanid) || '';
        const benhnhanId = options.benhnhanId || (sourcePatient && sourcePatient.benhnhanId) || '';

        // RULE: Thiếu patientSeq hoặc khambenhId -> chặn thao tác ghi ngay lập tức
        if (!patientSeq || !khambenhId) {
            if (typeof QuyenLog !== 'undefined') {
                QuyenLog.error(`❌ OperationContext.create BLOCKED: Thiếu patientSeq (${patientSeq}) hoặc khambenhId (${khambenhId})`);
            }
            throw new Error('MISSING_MANDATORY_PATIENT_CONTEXT');
        }

        const fingerprint = getFormFingerprint(moduleName);

        const context = {
            operationId: uuid('op_'),
            requestId: uuid('req_'),
            module: moduleName,
            patientSeq: patientSeq,
            khambenhId: khambenhId,
            hosobenhanid: hosobenhanid,
            benhnhanId: benhnhanId,
            formFingerprint: fingerprint,
            formType: moduleName,
            startedAt: new Date().toISOString(),
            cancelToken: { cancelled: false }
        };

        _activeContext = context;

        if (typeof QuyenLog !== 'undefined') {
            QuyenLog.info(`🔒 Khởi tạo OperationContext thành công | ID: ${context.operationId} | Module: ${moduleName} | PatientSeq: ${patientSeq}`);
        }

        return context;
    }

    /**
     * Xác minh context hiện tại có hợp lệ để tiếp tục ghi hay không
     * @returns {{ok: boolean, reason?: string, details?: string}}
     */
    function verifyCurrent() {
        if (!_activeContext) {
            return { ok: false, reason: 'NO_ACTIVE_CONTEXT', details: 'Không có OperationContext hoạt động.' };
        }

        const context = _activeContext;

        // 1. Kiểm tra cancel token
        if (context.cancelToken && context.cancelToken.cancelled) {
            return { ok: false, reason: 'CANCELLED', details: `Thao tác ghi đã bị hủy. Lý do: ${context.cancelReason || 'Không rõ'}` };
        }

        // 2. Kiểm tra quá hạn context (Timeout) - Giới hạn 60 giây
        const elapsed = Date.now() - Date.parse(context.startedAt);
        if (elapsed > 60000) {
            return { ok: false, reason: 'TIMEOUT', details: `Thao tác ghi quá thời gian cho phép (${Math.round(elapsed / 1000)}s > 60s).` };
        }

        // 3. Kiểm tra thông tin bệnh nhân trên grid đã đổi hay chưa
        const currentSource = (HIS.PatientLock && typeof HIS.PatientLock.getSourceContext === 'function')
             ? HIS.PatientLock.getSourceContext()
             : null;

        if (!currentSource) {
            return { ok: false, reason: 'NO_SOURCE_PATIENT', details: 'Bệnh nhân nguồn không còn được chọn.' };
        }

        const currentSeq = currentSource.seq || currentSource.patientSeq || 0;
        if (String(currentSeq) !== String(context.patientSeq)) {
            return { ok: false, reason: 'PATIENT_CHANGED', details: `Bệnh nhân đã bị thay đổi trên danh sách (${currentSeq} != ${context.patientSeq}).` };
        }

        if (String(currentSource.khambenhId || '') !== String(context.khambenhId)) {
            return { ok: false, reason: 'KHAMBENH_CHANGED', details: `Mã khám bệnh đã thay đổi (${currentSource.khambenhId} != ${context.khambenhId}).` };
        }

        // 4. Kiểm tra vân tay form (formFingerprint)
        const currentFingerprint = getFormFingerprint(context.module);
        if (currentFingerprint !== context.formFingerprint) {
            return { ok: false, reason: 'FORM_FINGERPRINT_CHANGED', details: 'Cấu trúc hoặc bệnh nhân trên form đã thay đổi đột ngột (Form switched/closed).' };
        }

        return { ok: true };
    }

    /**
     * Xác minh nghiêm ngặt. Ném lỗi nếu không hoạt động hoặc không hợp lệ.
     */
    function assertActive() {
        const check = verifyCurrent();
        if (!check.ok) {
            throw new Error(`OPERATION_CONTEXT_VIOLATION: ${check.reason} (${check.details})`);
        }
    }

    /**
     * Hủy bỏ context hiện tại
     * @param {string} reason - Lý do hủy
     * @returns {boolean}
     */
    function cancel(reason) {
        if (typeof HIS !== 'undefined' && HIS.DocCache) {
            HIS.DocCache.invalidate();
        }
        if (_activeContext) {
            _activeContext.cancelToken.cancelled = true;
            _activeContext.cancelReason = reason;
            if (typeof QuyenLog !== 'undefined') {
                QuyenLog.warn(`⚠️ OperationContext bị hủy! Lý do: ${reason}`);
            }
            return true;
        }
        return false;
    }

    /**
     * Hoàn tất context. Yêu cầu đúng requestId của response.
     * @param {string} requestId
     * @returns {boolean}
     */
    function finish(requestId) {
        if (typeof HIS !== 'undefined' && HIS.DocCache) {
            HIS.DocCache.invalidate();
        }
        if (!_activeContext) return false;
        
        // RULE: Mọi response thiếu requestId hoặc sai requestId -> chặn hoàn tất
        if (!requestId || _activeContext.requestId !== requestId) {
            if (typeof QuyenLog !== 'undefined') {
                QuyenLog.error(`❌ OperationContext.finish BLOCKED: Response requestId (${requestId}) không khớp với context requestId (${_activeContext.requestId})`);
            }
            return false;
        }

        _activeContext = null;
        if (typeof QuyenLog !== 'undefined') {
            QuyenLog.info(`🔓 Hoàn tất OperationContext thành công.`);
        }
        return true;
    }

    function getActive() {
        return _activeContext ? Object.assign({}, _activeContext) : null;
    }

    return {
        create: create,
        verifyCurrent: verifyCurrent,
        assertActive: assertActive,
        cancel: cancel,
        finish: finish,
        getActive: getActive,
        getFormFingerprint: getFormFingerprint
    };
})();

console.log('[HIS] OperationContext loaded');
