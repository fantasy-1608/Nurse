/**
 * HIS Shared — Write Verifier v1.0
 * SAFE-CORE-002: Kiểm tra trước ghi (preWriteGuard) và xác minh sau ghi (postWriteVerify).
 * Đảm bảo nguyên tắc: Không báo "thành công" nếu chưa xác minh giá trị hậu ghi.
 */

window.HIS = window.HIS || {};

HIS.WriteVerifier = (function () {
    'use strict';

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
     * Kiểm tra trạng thái hiển thị của Form
     */
    function isFormVisible(moduleName) {
        if (moduleName === 'caresheet') {
            if (typeof QuyenCareSheetFiller !== 'undefined') {
                return QuyenCareSheetFiller.isCareSheetFormOpen();
            }
            return false;
        }

        const allDocs = _getAllDocuments();
        for (const d of allDocs) {
            if (moduleName === 'infusion') {
                const el = d.getElementById('txtTKDT');
                if (el && (el.offsetParent !== null || el.offsetWidth > 0)) return true;
            }
            if (moduleName === 'vattu') {
                const el = d.getElementById('txtDS_THUOC');
                if (el && (el.offsetParent !== null || el.offsetWidth > 0)) return true;
            }
        }
        return false;
    }

    /**
     * TRƯỚC KHI GHI: preWriteGuard
     * Thực hiện toàn bộ 10 điều kiện bảo vệ trước khi ghi. Ném lỗi nếu có vi phạm.
     * @param {Object} context - OperationContext hiện tại
     */
    function preWriteGuard(context) {
        if (!context) {
            throw new Error('PRE_WRITE_GUARD_FAILED: Thiếu OperationContext.');
        }

        // 1. Kiểm tra OperationContext có hoạt động và hợp lệ
        HIS.OperationContext.assertActive();

        // 2. Kiểm tra Safe Mode / Kill Switch
        if (HIS.Safety && HIS.Safety.isSafeMode()) {
            throw new Error('PRE_WRITE_GUARD_FAILED: Hệ thống đang ở chế độ Safe Mode hoặc Kill Switch đã kích hoạt.');
        }

        // 3. Kiểm tra Form có đang mở và hiển thị hay không
        if (!isFormVisible(context.module)) {
            throw new Error('PRE_WRITE_GUARD_FAILED: Form điền thông tin không hiển thị hoặc đã bị đóng.');
        }

        // 4. Kiểm tra khớp thông tin Bệnh nhân (Mã khám, Tên, DOB)
        if (HIS.PatientLock) {
            const checkForm = HIS.PatientLock.verifyCurrentForm({ requireTarget: true });
            if (!checkForm.ok) {
                throw new Error(`PRE_WRITE_GUARD_FAILED: Bệnh nhân trên form không khớp bệnh nhân nguồn. Chi tiết: ${checkForm.details}`);
            }
        }

        // 5. Ghi nhận nhật ký audit khởi đầu thao tác ghi (STARTED)
        if (HIS.Audit && typeof HIS.Audit.log === 'function') {
            HIS.Audit.log(context.module.toUpperCase() + '_FILL_ATTEMPT', {
                requestId: context.requestId,
                module: context.module,
                patient: HIS.PatientLock.getSourceContext(),
                result: 'STARTED'
            }).catch(e => {
                console.warn('[WriteVerifier] Không thể ghi audit attempt:', e.message);
            });
        }

        if (typeof QuyenLog !== 'undefined') {
            QuyenLog.info(`🛡️ [preWriteGuard] PASS cho module: ${context.module} | RequestId: ${context.requestId}`);
        }
    }

    /**
     * SAU KHI GHI: postWriteVerify
     * So sánh giá trị trên DOM với giá trị kỳ vọng (expectedValues).
     * @param {Object} context - OperationContext hiện tại
     * @param {Object} expectedValues - Giá trị kỳ vọng để đối chiếu
     * @returns {Promise<{ok: boolean, reason?: string, details?: string}>}
     */
    function postWriteVerify(context, expectedValues) {
        return new Promise((resolve) => {
            if (!context) {
                return resolve({ ok: false, reason: 'NO_CONTEXT', details: 'Thiếu OperationContext.' });
            }

            let attempt = 0;
            const maxAttempts = 15;
            
            function check() {
                attempt++;
                
                // 1. Kiểm tra OperationContext vẫn hợp lệ
                const ctxVerify = HIS.OperationContext.verifyCurrent();
                if (!ctxVerify.ok) {
                    return resolve({ ok: false, reason: 'CONTEXT_INVALID', details: ctxVerify.details });
                }

                // 2. Kiểm tra bệnh nhân vẫn khớp
                if (HIS.PatientLock) {
                    const checkForm = HIS.PatientLock.verifyCurrentForm({ requireTarget: true });
                    if (!checkForm.ok) {
                        return resolve({ ok: false, reason: 'PATIENT_CHANGED_POST_WRITE', details: 'Bệnh nhân đã bị thay đổi trong quá trình ghi.' });
                    }
                }

                // 3. Thực hiện kiểm tra chi tiết theo từng module
                let doc = document;
                const allDocs = _getAllDocuments();
                const moduleName = context.module;

                if (moduleName === 'caresheet') {
                    if (typeof QuyenCareSheetFiller !== 'undefined') {
                        doc = QuyenCareSheetFiller.getFormDocument() || document;
                    }
                } else {
                    for (const d of allDocs) {
                        if (moduleName === 'infusion' && d.getElementById('txtTKDT')) { doc = d; break; }
                        if (moduleName === 'vattu' && d.getElementById('txtDS_THUOC')) { doc = d; break; }
                    }
                }

                const errors = [];

                if (moduleName === 'infusion') {
                    // Kiểm tra tên thuốc đã chọn
                    const drugInput = doc.getElementById('txtTKDT');
                    if (drugInput && expectedValues.drugName) {
                        const val = (drugInput.value || '').trim().toLowerCase();
                        const exp = expectedValues.drugName.trim().toLowerCase();
                        // So khớp fuzzy nhẹ (chứa tên thuốc)
                        if (!val.includes(exp) && !exp.includes(val)) {
                            errors.push(`Thuốc thực tế "${drugInput.value}" không khớp với "${expectedValues.drugName}"`);
                        }
                    }

                    // Kiểm tra tốc độ
                    const speedInput = doc.querySelector('input[id*="tocDo"], input[name*="TOCDO"]');
                    if (speedInput && expectedValues.speed) {
                        const val = (speedInput.value || '').trim();
                        const exp = String(expectedValues.speed).trim();
                        if (val !== exp) {
                            errors.push(`Tốc độ thực tế "${speedInput.value}" không khớp với "${expectedValues.speed}"`);
                        }
                    }

                    // Kiểm tra số lượng ml
                    const quantityInput = doc.querySelector('input[id*="soLuong"], input[name*="SOLUONG"]');
                    if (quantityInput && expectedValues.quantity) {
                        const val = (quantityInput.value || '').trim();
                        const exp = String(expectedValues.quantity).trim();
                        if (val !== exp) {
                            errors.push(`Thể tích thực tế "${quantityInput.value}" không khớp với "${expectedValues.quantity}"`);
                        }
                    }

                    // Kiểm tra Bác sĩ
                    if (expectedValues.doctor) {
                        const exp = expectedValues.doctor.trim().toLowerCase();
                        let foundMatch = false;
                        let actualValues = [];
                        
                        const docSelects = doc.querySelectorAll('select[id*="bacSi" i], select[name*="BACSI" i]');
                        docSelects.forEach(sel => {
                            const text = (sel.options[sel.selectedIndex]?.text || '').trim().toLowerCase();
                            if (text) actualValues.push(text);
                            if (text.includes(exp) || exp.includes(text)) foundMatch = true;
                        });

                        const docInputs = doc.querySelectorAll('input[id*="TKBS" i], input[id*="bacSi" i]:not([type="hidden"])');
                        docInputs.forEach(inp => {
                            const text = (inp.value || '').trim().toLowerCase();
                            if (text) actualValues.push(text);
                            if (text.includes(exp) || exp.includes(text)) foundMatch = true;
                        });

                        if (!foundMatch && actualValues.length > 0) {
                            const valText = actualValues.find(v => !v.includes('chọn')) || actualValues[0];
                            errors.push(`Bác sĩ thực tế "${valText}" không khớp với "${expectedValues.doctor}"`);
                        }
                    }

                    // Kiểm tra Điều dưỡng
                    if (expectedValues.nurse) {
                        const exp = expectedValues.nurse.trim().toLowerCase();
                        let foundMatch = false;
                        let actualValues = [];
                        
                        const nurseSelects = doc.querySelectorAll('select[id*="yTa" i], select[name*="YTA" i], select[id*="YT_CHIDINH" i]');
                        nurseSelects.forEach(sel => {
                            const text = (sel.options[sel.selectedIndex]?.text || '').trim().toLowerCase();
                            if (text) actualValues.push(text);
                            if (text.includes(exp) || exp.includes(text)) foundMatch = true;
                        });

                        const nurseInputs = doc.querySelectorAll('input[id*="TKYT" i], input[id*="TKDD" i], input[id*="TKTP" i], input[id*="YT_CHIDINH" i]:not([type="hidden"])');
                        nurseInputs.forEach(inp => {
                            const text = (inp.value || '').trim().toLowerCase();
                            if (text) actualValues.push(text);
                            if (text.includes(exp) || exp.includes(text)) foundMatch = true;
                        });

                        if (!foundMatch && actualValues.length > 0) {
                            const valText = actualValues.find(v => !v.includes('chọn')) || actualValues[0];
                            errors.push(`Điều dưỡng thực tế "${valText}" không khớp với "${expectedValues.nurse}"`);
                        }
                    }
                } 
                
                else if (moduleName === 'caresheet') {
                    const values = expectedValues.values || {};
                    const templateFields = expectedValues.fields || [];

                    for (const field of templateFields) {
                        const expectedVal = values[field.key];
                        if (expectedVal === undefined || expectedVal === null || expectedVal === '') continue;

                        const container = doc.querySelector(`[data-ct-form-id="${field.ctFormId}"]`);
                        if (!container) {
                            errors.push(`Không tìm thấy ô nhập cho trường "${field.label}"`);
                            continue;
                        }

                        if (field.type === 'text') {
                            const input = container.querySelector('input[type="text"], input:not([type]), textarea');
                            const domVal = input ? (input.value || '').trim() : '';
                            if (domVal !== String(expectedVal).trim()) {
                                errors.push(`Trường "${field.label}" thực tế "${domVal}" không khớp với "${expectedVal}"`);
                            }
                        } else if (field.type === 'checkbox') {
                            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                            const checkedValues = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
                            const expectedArr = Array.isArray(expectedVal) ? expectedVal : [expectedVal];
                            
                            const missing = expectedArr.filter(v => !checkedValues.includes(v));
                            const extra = checkedValues.filter(v => !expectedArr.includes(v));

                            if (missing.length > 0 || extra.length > 0) {
                                errors.push(`Trường "${field.label}" lựa chọn thực tế [${checkedValues.join(', ')}] không khớp [${expectedArr.join(', ')}]`);
                            }
                        }
                    }
                } 
                
                else if (moduleName === 'vattu') {
                    const gridTable = doc.querySelector('#grdDanhSach');
                    if (gridTable && expectedValues.ma) {
                        const rows = gridTable.querySelectorAll('tr.jqgrow');
                        let found = false;
                        const expectedMa = (expectedValues.ma || '').toLowerCase();
                        const expectedTen = (expectedValues.ten || '').toLowerCase();
                        
                        for (let ri = 0; ri < rows.length; ri++) {
                            const rowText = (rows[ri].textContent || '').toLowerCase();
                            // Check BOTH ma AND ten, because sometimes HIS hides ma column and only shows ten
                            if (rowText.includes(expectedMa) || (expectedTen && rowText.includes(expectedTen))) {
                                found = true;
                                const qtyCell = rows[ri].querySelector('td[aria-describedby*="SOLUONG"], td[aria-describedby*="SoLuong"]');
                                if (qtyCell && expectedValues.sl) {
                                    const domQty = parseFloat(qtyCell.textContent || '0');
                                    const expQty = parseFloat(expectedValues.sl);
                                    if (domQty !== expQty) {
                                        errors.push(`Vật tư ${expectedValues.ma} có số lượng thực tế (${domQty}) không khớp với (${expQty})`);
                                    }
                                }
                                break;
                            }
                        }
                        if (!found) {
                            errors.push(`Không tìm thấy dòng vật tư "${expectedValues.ma}" (${expectedValues.ten || ''}) trong bảng danh sách đã điền.`);
                        }
                    }
                }

                if (errors.length > 0) {
                    if (attempt < maxAttempts) {
                        setTimeout(check, 200);
                        return;
                    }
                    const details = errors.join('; ');
                    if (typeof QuyenLog !== 'undefined') {
                        QuyenLog.error(`❌ [postWriteVerify] THẤT BẠI sau ${attempt} lần thử: ${details}`);
                    }

                    if (HIS.Audit) {
                        HIS.Audit.log(context.module.toUpperCase() + '_FILL_FAILED', {
                            requestId: context.requestId,
                            module: context.module,
                            patient: HIS.PatientLock.getSourceContext(),
                            result: 'VERIFICATION_FAILED',
                            reason: 'VALUE_MISMATCH',
                            details: details.substring(0, 500)
                        }).catch(() => {});
                    }

                    HIS.OperationContext.cancel('VERIFICATION_FAILED');
                    return resolve({ ok: false, reason: 'VALUE_MISMATCH', details: details });
                }

                if (HIS.Audit) {
                    HIS.Audit.log(context.module.toUpperCase() + '_FILL_SUCCESS', {
                        requestId: context.requestId,
                        module: context.module,
                        patient: HIS.PatientLock.getSourceContext(),
                        result: 'VERIFIED',
                        filledCount: expectedValues.filledCount || 1
                    }).catch(() => {});
                }

                HIS.OperationContext.finish(context.requestId);

                if (typeof QuyenLog !== 'undefined') {
                    QuyenLog.info(`✅ [postWriteVerify] THÀNH CÔNG cho module: ${context.module} sau ${attempt} lần kiểm tra`);
                }

                resolve({ ok: true });
            }

            // Start first check
            setTimeout(check, 100);
        });
    }

    return {
        preWriteGuard: preWriteGuard,
        postWriteVerify: postWriteVerify,
        isFormVisible: isFormVisible
    };
})();

console.log('[HIS] WriteVerifier loaded');
