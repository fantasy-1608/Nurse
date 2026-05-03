/**
 * __EXT_EMOJI__ __EXT_NAME__ — Demo Engine
 * Read-only advance payment reminder for the Demo tab.
 */

/* global QuyenLog */
/* exported QuyenDemoEngine */

const QuyenDemoEngine = (function () {
    'use strict';

    const LOW_DAYS = 2;
    const CRITICAL_DAYS = 1;
    const TARGET_BUFFER_DAYS = 3;
    const ROUND_TO = 100000;

    let _currentPatient = null;
    let _seq = 0;

    function setPatient(patient, vitals, seq) {
        _currentPatient = normalizePatient(patient || {});
        _seq = seq || Date.now();
    }

    function getCurrentPatient() {
        if (_currentPatient && _currentPatient.khambenhId) return _currentPatient;

        try {
            if (typeof QuyenVatTuEngine !== 'undefined' && QuyenVatTuEngine.getCurrentPatient) {
                const vtPatient = normalizePatient(QuyenVatTuEngine.getCurrentPatient() || {});
                if (vtPatient && vtPatient.khambenhId) {
                    _currentPatient = vtPatient;
                    return _currentPatient;
                }
            }
        } catch (e) {
            QuyenLog.warn('Demo: không lấy được BN từ VatTuEngine:', e.message || e);
        }

        try {
            if (typeof HIS !== 'undefined' && HIS.PatientLock && HIS.PatientLock.getSourceContext) {
                const lockedPatient = normalizePatient(HIS.PatientLock.getSourceContext() || {});
                if (lockedPatient && lockedPatient.khambenhId) {
                    _currentPatient = lockedPatient;
                    return _currentPatient;
                }
            }
        } catch (e2) {
            QuyenLog.warn('Demo: không lấy được BN từ PatientLock:', e2.message || e2);
        }

        return _currentPatient;
    }

    function normalizePatient(patient) {
        return {
            name: patient.name || patient.hoTen || patient.TENBENHNHAN || '',
            khambenhId: patient.khambenhId || patient.KHAMBENHID || '',
            benhnhanId: patient.benhnhanId || patient.BENHNHANID || '',
            hosobenhanid: patient.hosobenhanid || patient.HOSOBENHANID || '',
            maBHYT: patient.maBHYT || patient.maBhyt || patient.MA_BHYT || '',
            doiTuongId: patient.doiTuongId || patient.DOITUONGBENHNHANID || '',
            doiTuong: patient.doiTuong || patient.TENDOITUONGBENHNHAN || '',
            soNgayDieuTri: patient.soNgayDieuTri || patient.SONGAYDIEUTRI || '',
            thoiGianVaoVien: patient.thoiGianVaoVien || patient.THOIGIANVAOVIEN || '',
            financeCore: patient.financeCore || patient.TONGTIENDICHVUCORE || ''
        };
    }

    function toNumber(value) {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number') return isFinite(value) ? value : 0;
        const cleaned = String(value).replace(/[^\d.-]/g, '');
        const n = Number(cleaned);
        return isFinite(n) ? n : 0;
    }

    function roundMoney(value) {
        if (!value || value <= 0) return 0;
        return Math.ceil(value / ROUND_TO) * ROUND_TO;
    }

    function parseDateTime(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;

        const vn = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
        if (vn) {
            return new Date(
                parseInt(vn[3], 10),
                parseInt(vn[2], 10) - 1,
                parseInt(vn[1], 10),
                parseInt(vn[4] || '0', 10),
                parseInt(vn[5] || '0', 10)
            );
        }

        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
    }

    function getTreatmentDays(patient, now) {
        const fromPatient = toNumber(patient.soNgayDieuTri);
        if (fromPatient > 0) return Math.max(1, fromPatient);

        const start = parseDateTime(patient.thoiGianVaoVien);
        if (!start) return 1;

        const diffDays = Math.ceil(((now || new Date()).getTime() - start.getTime()) / 86400000);
        return Math.max(1, diffDays);
    }

    function hasBHYT(patient, detail05) {
        if (patient.maBHYT) return true;
        if (String(patient.doiTuongId) === '1') return true;
        if (String(patient.doiTuong || '').toLowerCase().indexOf('bhyt') >= 0) return true;
        if (detail05 && (toNumber(detail05.TYLE_BHYT) > 0 || toNumber(detail05.TYLE_THE) > 0)) return true;
        return false;
    }

    function firstRow(raw) {
        if (!raw) return {};
        if (Array.isArray(raw)) return raw[0] || {};
        if (raw.result) return firstRow(raw.result);
        return raw;
    }

    function parseCoreString(core) {
        const parts = String(core || '').split(';').map(toNumber);
        if (parts.length < 11) return {};
        return {
            tongTienDichVu: parts[0],
            bnTra: parts[1],
            tamUng: parts[4],
            chenhLech: parts[8],
            tienPhaiNop: parts[10]
        };
    }

    function buildUnavailable(patient, reason) {
        return {
            patient: patient,
            status: 'unavailable',
            severity: 'unknown',
            title: 'Chưa đọc được viện phí',
            message: reason || 'Chưa có đủ dữ liệu để nhắc ứng tiền.',
            metrics: [],
            recommendation: '',
            raw: {}
        };
    }

    function analyzeAdvancePayment(patient, payload, now) {
        patient = normalizePatient(patient || {});
        const detail05 = firstRow(payload && payload.detail05);
        const detail06 = firstRow(payload && payload.detail06);
        const core = parseCoreString(patient.financeCore || (payload && payload.financeCore));

        const treatmentDays = getTreatmentDays(patient, now);
        if (payload && payload.patientContext) {
            patient = normalizePatient(Object.assign({}, patient, payload.patientContext));
        }

        const insured = hasBHYT(patient, detail05);

        const totalCost = toNumber(detail05.TONGTIENDV || detail06.TONGTIENDV || core.tongTienDichVu || detail06.VIENPHI);
        const insurancePaid = toNumber(detail05.BHYT_THANHTOAN || detail06.BHYT_THANHTOAN);
        const discount = toNumber(detail05.MIENGIAMDV || detail06.MIENGIAM);
        const paid = toNumber(detail05.DANOP || detail06.DANOP);
        const advanceTotal = toNumber(detail06.TAMUNG || detail05.CON_TAMUNG_BD || core.tamUng);
        const patientPay = toNumber(detail05.BNTRA || detail05.T_BNTT || detail06.BNTRA || core.bnTra) ||
            (totalCost > 0 ? Math.max(0, totalCost - insurancePaid - discount) : toNumber(detail06.VIENPHI));
        const detailChenhLech = toNumber(detail06.CHENHLECH);
        const coreChenhLech = toNumber(core.chenhLech);
        const refundAmount = Math.max(
            toNumber(detail06.HOANUNG),
            toNumber(detail06.HOAN_UNG),
            toNumber(detail05.HOANUNG),
            toNumber(detail05.HOAN_UNG)
        );
        const amountDue = Math.max(
            refundAmount > 0 ? 0 : toNumber(detail06.TIEN_PHAINOP),
            toNumber(detail05.CHUADONG_GK),
            toNumber(core.tienPhaiNop),
            detailChenhLech < 0 ? Math.abs(detailChenhLech) : 0,
            coreChenhLech < 0 ? Math.abs(coreChenhLech) : 0
        );
        const advanceLeftFromDetail = toNumber(detail05.TAMUNG_CONLAI);
        const advanceLeft = refundAmount > 0
            ? refundAmount
            : (advanceLeftFromDetail > 0 ? advanceLeftFromDetail : (advanceTotal > 0 ? Math.max(0, advanceTotal - patientPay) : 0));
        const avgPerDay = treatmentDays > 0 ? patientPay / treatmentDays : 0;
        const avgTotalPerDay = treatmentDays > 0 ? totalCost / treatmentDays : 0;
        const daysLeft = avgPerDay > 0 ? advanceLeft / avgPerDay : null;
        const neededForBuffer = avgPerDay > 0 ? Math.max(0, (avgPerDay * TARGET_BUFFER_DAYS) - Math.max(advanceLeft, 0)) : 0;
        const suggestedAdvance = roundMoney(Math.max(neededForBuffer, amountDue > 0 && !insured ? amountDue : 0));

        let severity = 'ok';
        let status = 'ok';
        let title = 'Tạm ứng còn ổn';
        let message = 'Tiền ứng hiện còn đủ theo mức sử dụng hiện tại.';

        if (!patient.khambenhId) {
            return buildUnavailable(patient, 'Chưa chọn bệnh nhân.');
        }

        if (advanceTotal > 0 && totalCost <= 0 && patientPay <= 0 && amountDue <= 0) {
            return {
                patient: patient,
                status: 'partial_advance_only',
                severity: 'unknown',
                title: 'Mới đọc được tạm ứng',
                message: 'Chưa có tổng chi phí hoặc phần bệnh nhân trả nên chưa dự đoán được số ngày còn đủ.',
                insured: insured,
                treatmentDays: treatmentDays,
                daysLeft: null,
                suggestedAdvance: 0,
                metrics: [
                    { label: 'Tạm ứng', value: advanceTotal, type: 'money' },
                    { label: 'Tạm ứng còn', value: advanceTotal, type: 'money' },
                    { label: 'Còn đủ', value: null, type: 'days' }
                ],
                recommendation: 'Mở thông tin viện phí hoặc chờ API viện phí trả tổng chi phí để tính nhắc ứng thêm.',
                raw: {
                    detail05: detail05,
                    detail06: detail06,
                    core: core,
                    amountDue: amountDue,
                    advanceTotal: advanceTotal,
                    totalCost: totalCost,
                    insurancePaid: insurancePaid,
                    patientPay: patientPay,
                    paid: paid,
                    partial: true
                }
            };
        }

        const hasFeeData = totalCost > 0 || patientPay > 0 || advanceTotal > 0 || amountDue > 0;
        if (!hasFeeData) {
            return buildUnavailable(patient, 'API viện phí chưa trả dữ liệu chi tiết.');
        }

        if (advanceTotal <= 0 && advanceLeft <= 0 && patientPay > 0) {
            return buildUnavailable(patient, 'Đã đọc được chi phí nhưng chưa đọc được số tiền tạm ứng.');
        }

        if (!insured && amountDue > 0 && advanceLeft <= 0) {
            severity = 'danger';
            status = 'no_insurance_debt';
            title = 'Không BHYT, còn nợ viện phí';
            message = 'Bệnh nhân không có BHYT và còn khoản phải nộp. Nên nhắc người nhà kiểm tra viện phí.';
        } else if (advanceLeft <= 0 && (patientPay > 0 || amountDue > 0)) {
            severity = 'danger';
            status = 'out_of_advance';
            title = 'Đã hết tiền ứng';
            message = 'Tiền ứng còn lại không đủ bù chi phí hiện tại.';
        } else if (daysLeft !== null && daysLeft < CRITICAL_DAYS) {
            severity = 'danger';
            status = 'critical';
            title = 'Sắp hết tiền ứng';
            message = 'Dự đoán tiền ứng còn dưới 1 ngày theo mức sử dụng hiện tại.';
        } else if (daysLeft !== null && daysLeft < LOW_DAYS) {
            severity = 'warning';
            status = 'low';
            title = 'Nên chuẩn bị ứng thêm';
            message = 'Dự đoán tiền ứng còn dưới 2 ngày.';
        }

        const recommendation = suggestedAdvance > 0
            ? 'Gợi ý nhắc ứng thêm khoảng ' + formatMoney(suggestedAdvance) + ' để đủ khoảng ' + TARGET_BUFFER_DAYS + ' ngày.'
            : 'Chưa cần nhắc ứng thêm nếu số liệu viện phí trên HIS đã chính xác.';

        return {
            patient: patient,
            status: status,
            severity: severity,
            title: title,
            message: message,
            insured: insured,
            treatmentDays: treatmentDays,
            daysLeft: daysLeft,
            suggestedAdvance: suggestedAdvance,
            metrics: [
                { label: 'Tổng chi phí', value: totalCost, type: 'money' },
                { label: 'BH trả', value: insurancePaid, type: 'money' },
                { label: 'BN trả', value: patientPay, type: 'money' },
                { label: 'Tạm ứng', value: advanceTotal, type: 'money' },
                { label: 'Tạm ứng còn', value: advanceLeft, type: 'money' },
                { label: 'Đã nộp', value: paid, type: 'money' },
                { label: 'TB BN/ngày', value: avgPerDay, type: 'money' },
                { label: 'TB tổng/ngày', value: avgTotalPerDay, type: 'money' },
                { label: 'Còn đủ', value: daysLeft, type: 'days' }
            ],
            recommendation: recommendation,
            raw: {
                detail05: detail05,
                detail06: detail06,
                core: core,
                amountDue: amountDue,
                advanceTotal: advanceTotal,
                totalCost: totalCost,
                insurancePaid: insurancePaid,
                patientPay: patientPay,
                paid: paid,
                avgPerDay: avgPerDay,
                avgTotalPerDay: avgTotalPerDay
            }
        };
    }

    function formatMoney(value) {
        const n = Math.round(toNumber(value));
        return n.toLocaleString('vi-VN') + 'đ';
    }

    function requestAdvancePayment(patient) {
        return new Promise(function (resolve) {
            if (typeof HIS === 'undefined' || !HIS.Message || typeof HIS.Message.listen !== 'function' || typeof HIS.Message.send !== 'function') {
                resolve({ error: 'Message bus chưa sẵn sàng.' });
                return;
            }

            const requestId = 'advance_' + Date.now() + '_' + Math.random();
            let cleanup = null;
            const timer = setTimeout(function () {
                if (cleanup) cleanup();
                resolve({ error: 'Không đọc được viện phí trong thời gian chờ.' });
            }, 10000);

            cleanup = HIS.Message.listen('QUYEN_ADVANCE_PAYMENT_RESULT', function (data) {
                if (data.requestId !== requestId) return;
                clearTimeout(timer);
                cleanup();
                resolve(data);
            });

            HIS.Message.send('QUYEN_REQ_ADVANCE_PAYMENT', {
                requestId: requestId,
                seq: _seq,
                khambenhId: patient.khambenhId || '',
                benhnhanId: patient.benhnhanId || '',
                hosobenhanid: patient.hosobenhanid || '',
                financeCore: patient.financeCore || ''
            });
        });
    }

    async function summarize() {
        let patient = getCurrentPatient();
        if (!patient || !patient.khambenhId) {
            return buildUnavailable(patient, 'Hãy chọn bệnh nhân trên HIS để xem nhắc tạm ứng.');
        }

        const payload = await requestAdvancePayment(patient);
        if (payload && payload.error) {
            return buildUnavailable(patient, payload.error);
        }

        return analyzeAdvancePayment(patient, payload || {});
    }

    return {
        setPatient: setPatient,
        getCurrentPatient: getCurrentPatient,
        summarize: summarize,
        analyzeAdvancePayment: analyzeAdvancePayment,
        formatMoney: formatMoney
    };
})();
