/**
 * __EXT_EMOJI__ __EXT_NAME__ — Vật Tư Engine
 * Đọc danh sách thuốc từ HIS → áp dụng 5 quy luật → gợi ý VT cần dùng
 *
 * Quy luật rút ra từ dữ liệu thực tế 5 bệnh nhân (12/04/2026):
 *   Rule 1 – Base    : Bất kỳ thuốc Tiêm → GA2501 + KI318
 *   Rule 2 – TMC/IM  : Thuốc đường Tiêm (không TTM) → BO535 (+ BO534 nếu nhỏ)
 *   Rule 3 – TTM     : Thuốc Tiêm truyền → BO560 × số chai + NA148
 *   Rule 4 – Insulin : TH2937/THUOC2911/Actrapid → BO517 + QU176
 *   Rule 5 – Wound   : Tên chứa "vết thương"/"chấn thương" → UR69/BA360 (gợi ý nhẹ)
 */

/* global QuyenLog */
/* exported QuyenVatTuEngine */

const QuyenVatTuEngine = (function () {
    'use strict';

    // =========================================================
    // PATIENT STATE
    // =========================================================
    let _currentPatient = null; // { name, khambenhId, benhnhanId, hosobenhanid }

    window.addEventListener('message', function (event) {
        if (!event.data || event.data.type !== 'QUYEN_PATIENT_SELECTED') return;
        const p = event.data.patient || {};
        _currentPatient = {
            name:          p.name          || '',
            khambenhId:    p.khambenhId    || '',
            benhnhanId:    p.benhnhanId    || '',
            hosobenhanid:  p.hosobenhanid  || ''
        };
        QuyenLog.info('🧰 VatTuEngine: BN mới →', _currentPatient.khambenhId);
    });

    // =========================================================
    // VT CATALOGUE — Thông tin VT để tra cứu tên/dvt
    // =========================================================
    const VT_INFO = {
        'GA2501': { ten: 'Găng tay cao su Y tế chưa tiệt trùng', dvt: 'Đôi' },
        'KI318':  { ten: 'Kim tiêm sử dụng một lần',              dvt: 'Cái' },
        'BO535':  { ten: 'Bơm tiêm 10ml Banapha',                 dvt: 'Cái' },
        'BO534':  { ten: 'Bơm tiêm 5ml Banapha',                  dvt: 'Cái' },
        'BO527':  { ten: 'Bơm tiêm 20ml Banapha',                 dvt: 'Cái' },
        'BO560':  { ten: 'Bộ dây truyền dịch UVERDA/UVD-3',       dvt: 'Bộ'  },
        'NA148':  { ten: 'Nắp đậy kim luồn tĩnh mạch',           dvt: 'Cái' },
        'KI306':  { ten: 'Kim luồn TM có cổng tiêm Nufix',        dvt: 'Cái' },
        'BA365':  { ten: 'Băng dính cá nhân (VĐ)',                dvt: 'Miếng'},
        'BO517':  { ten: 'Bơm tiêm Insulin 1ml',                  dvt: 'Cái' },
        'QU176':  { ten: 'Que thử đường huyết cá nhân',           dvt: 'Test' },
        'UR69':   { ten: 'Urgotul Ag/Silver 10x12cm',             dvt: 'Miếng'},
        'BA360':  { ten: 'Băng keo lụa y tế RITASILK 2.5cm×5m',  dvt: 'Cuộn' },
    };

    // Mã insulin (drug mã cụ thể)
    const INSULIN_CODES = new Set(['TH2937', 'THUOC2911', 'THUOC2912', 'ACTRAPID']);

    // Keyword nhỏ: Bơm tiêm 5ml dùng khi thuốc volume nhỏ, pha TB
    const SMALL_VOLUME_KEYWORDS = ['nước cất', 'gentamicin', 'tobramycin', 'netilmicin'];

    // =========================================================
    // RULE ENGINE
    // =========================================================
    /**
     * Áp dụng 5 quy luật lên danh sách thuốc
     * @param {Array} drugs  - [{ ma, ten, duong }] — deduplicated bởi mã
     * @param {string} [diagnosis] - Chẩn đoán BN (nếu có)
     * @returns {Array} suggestedVT - [{ ma, ten, sl, dvt, huong, rule, note }]
     */
    function applyRules(drugs, diagnosis) {
        const result = [];
        diagnosis = (diagnosis || '').toLowerCase();

        // Phân loại thuốc theo đường dùng
        const hasInjection = drugs.some(d => {
            const duong = (d.duong || '').toLowerCase();
            return duong.includes('tiêm');
        });
        const hasTTM = drugs.some(d => {
            const duong = (d.duong || '').toLowerCase();
            return duong.includes('truyền');
        });
        const hasTMC = drugs.some(d => {
            const duong = (d.duong || '').toLowerCase();
            return duong.includes('tiêm') && !duong.includes('truyền');
        });
        const hasSmallDrug = drugs.some(d => {
            const tenLow = (d.ten || '').toLowerCase();
            return SMALL_VOLUME_KEYWORDS.some(kw => tenLow.includes(kw));
        });
        const hasInsulin = drugs.some(d => INSULIN_CODES.has((d.ma || '').toUpperCase()));
        const ttmCount = drugs.filter(d => (d.duong || '').toLowerCase().includes('truyền')).length;
        const hasWound = /vết thương|chấn thương|gãy xương|viêm|phẫu thuật|mổ/.test(diagnosis);

        function add(ma, sl, huong, rule, note) {
            const info = VT_INFO[ma] || { ten: ma, dvt: '?' };
            result.push({ ma, ten: info.ten, sl, dvt: info.dvt, huong, rule, note: note || '' });
        }

        // ── RULE 1: Base — bất kỳ thuốc tiêm ───────────────────────────────
        if (hasInjection) {
            add('GA2501', 2, 'Mang tay',   'base', '');
            add('KI318',  2, 'Pha thuốc',  'base', '');
        }

        // ── RULE 2: Thuốc TMC/IM ────────────────────────────────────────────
        if (hasTMC) {
            add('BO535', 2, 'TMC', 'tmc', '');
            if (hasSmallDrug) {
                add('BO534', 1, 'Pha TB nhỏ', 'tmc', 'Nước cất hoặc kháng sinh nhỏ');
            }
        }

        // ── RULE 3: Thuốc Tiêm truyền (TTM) ────────────────────────────────
        if (hasTTM) {
            const sl = Math.max(ttmCount, 1);
            add('BO560', sl, 'TTM',    'ttm', `${sl} chai truyền`);
            add('NA148', 1,  'Chặn KL', 'ttm', '');
        }

        // ── RULE 4: Insulin ─────────────────────────────────────────────────
        if (hasInsulin) {
            add('BO517', 2, 'TDD', 'insulin', '');
            add('QU176', 3, 'Xét nghiệm ĐH', 'insulin', '');
        }

        // ── RULE 5: Vết thương (gợi ý nhẹ) ─────────────────────────────────
        if (hasWound) {
            add('UR69',  1, 'Băng vết thương', 'wound', 'Chỉ gợi ý — tùy loại vết thương');
            add('BA360', 1, 'Cố định băng',    'wound', '');
        }

        return result;
    }

    // =========================================================
    // DEDUP DRUGS — lấy unique theo mã + đường dùng
    // =========================================================
    function dedupDrugs(drugs) {
        const seen = new Map();
        for (const d of drugs) {
            const key = (d.ma || '').toUpperCase() + '|' + (d.duong || '').toLowerCase();
            if (!seen.has(key)) seen.set(key, d);
        }
        return [...seen.values()];
    }

    // =========================================================
    // FETCH DATA — gọi bridge để lấy danh sách thuốc + VT
    // =========================================================
    function fetchData(patientOverride) {
        const patient = patientOverride || _currentPatient;
        if (!patient || !patient.khambenhId) {
            return Promise.reject(new Error('Chưa có bệnh nhân (khambenhId trống)'));
        }

        return new Promise(function (resolve, reject) {
            const timeout = setTimeout(function () {
                window.removeEventListener('message', onResult);
                reject(new Error('Timeout khi đợi bridge VT data'));
            }, 15000);

            function onResult(event) {
                if (!event.data || event.data.type !== 'QUYEN_VATTU_DATA_RESULT') return;
                clearTimeout(timeout);
                window.removeEventListener('message', onResult);
                resolve(event.data);
            }

            window.addEventListener('message', onResult);
            window.postMessage({
                type: 'QUYEN_REQ_VATTU_DATA',
                khambenhId:   patient.khambenhId,
                benhnhanId:   patient.benhnhanId,
                hosobenhanid: patient.hosobenhanid
            }, location.origin);
        });
    }

    // =========================================================
    // ANALYZE — public API
    // =========================================================
    /**
     * Phân tích dữ liệu từ HIS và trả về gợi ý VT
     * @param {Object} [patientOverride] - Bỏ qua _currentPatient nếu cần
     * @returns {Promise<{ suggestedVT, existingVT, drugs, raw }>}
     */
    function analyze(patientOverride) {
        QuyenLog.info('🧰 VatTuEngine.analyze() bắt đầu...');
        return fetchData(patientOverride).then(function (data) {
            const rawDrugs    = data.drugs     || [];
            const existingVT  = data.existingVT || [];
            const drugs       = dedupDrugs(rawDrugs);
            const suggestedVT = applyRules(drugs, data.diagnosis || '');

            QuyenLog.info('🧰 Phân tích xong | Thuốc:', drugs.length, '| Gợi ý VT:', suggestedVT.length, '| VT hiện có:', existingVT.length);
            return { suggestedVT, existingVT, drugs, raw: data };
        });
    }

    // =========================================================
    // PUBLIC
    // =========================================================
    return {
        analyze:            analyze,
        getCurrentPatient:  function () { return _currentPatient; },
        applyRules:         applyRules,  // export để test độc lập
    };

})();
