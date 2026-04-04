/* eslint-disable no-empty, no-prototype-builtins, no-undef, no-unused-vars, no-var, no-redeclare, prefer-const */
/**
 * __EXT_EMOJI__ __EXT_NAME__ — HIS Bridge (Injected Script)
 * Chạy trong page context để access jsonrpc, jQuery, jqGrid
 * 
 * v1.2: Đọc thuốc qua API NTU02D007.05 + AJAX interception
 * (Không parse DOM nữa — dùng API trực tiếp!)
 */
(function () {
    'use strict';

    const _$ = window['$'] || window['jQuery'];
    const _jsonrpc = window['jsonrpc'];

    const log = {
        debug: (...args) => console.log('[__EXT_EMOJI__ Bridge]', ...args),
        warn: (...args) => console.warn('[__EXT_EMOJI__ Bridge]', ...args),
        error: (...args) => console.error('[__EXT_EMOJI__ Bridge]', ...args)
    };

    log.debug('HIS Bridge v1.2 — __EXT_NAME__! __EXT_EMOJI__');

    /**
     * ★ TÌM ELEMENT CÓ MARKER XUYÊN QUA MỌI IFRAME ★
     * Bridge chạy ở TOP window, nhưng form inputs nằm trong iframe lồng nhau.
     * Hàm này quét top document + tất cả iframe.contentDocument để tìm marker.
     */
    function findMarkedElement(attrName, attrValue) {
        const selector = '[' + attrName + '="' + attrValue + '"]';
        // 1. Tìm trong top document
        let el = document.querySelector(selector);
        if (el) return el;
        // 2. Quét tất cả iframe
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            try {
                const iDoc = iframes[i].contentDocument;
                if (!iDoc) continue;
                el = iDoc.querySelector(selector);
                if (el) return el;
                // 3. Quét iframe lồng bên trong (nested level 2)
                const innerFrames = iDoc.querySelectorAll('iframe');
                for (let j = 0; j < innerFrames.length; j++) {
                    try {
                        const jDoc = innerFrames[j].contentDocument;
                        if (!jDoc) continue;
                        el = jDoc.querySelector(selector);
                        if (el) return el;
                    } catch (e2) { /* cross-origin */ }
                }
            } catch (e) { /* cross-origin */ }
        }
        return null;
    }

    // ==========================================
    // AJAX SNOOPING — Chặn API response
    // Khi HIS gọi NTU02D007.05, bắt dữ liệu thuốc
    // ==========================================
    let _capturedDrugs = [];
    let _lastTreatmentId = null; // Track BN hiện tại để phát hiện chuyển BN
    let _cachedCareSheetSec4 = null; // Cache Section 4 "Cơ quan bệnh" từ phiếu cũ
    let _cachedCareSheetSec17 = null; // Cache Section 17 "Can thiệp điều dưỡng" từ phiếu cũ
    let _cachedCareSheetWeight = ''; // Cache cân nặng từ phiếu cũ
    let _cachedPhieuId = '';          // Cache PHIEUID gần nhất
    let _isFullyAggregated = false;   // true khi cache đã aggregate 2 ngày (không phải từ AJAX snoop)
    let _lastSelectedPatientId = null;
    let _lastSelectedRowId = null;

    // CT_FORM_IDs cho Section 4 - Cơ quan bệnh + Cân nặng
    const SECTION4_IDS = ['1169', '1170', '1171', '1232'];
    const WEIGHT_CT_ID = '1248';
    const HEIGHT_CT_ID = '1317';  // Chiều cao
    // Section 17 - detect tự động qua SQL_DL chứa 'LOAD_KYHIEU_DTP'

    // ==========================================
    // PATIENT SELECTION HOOK — Tự động phát hiện chọn BN
    // ==========================================
    function setupPatientGridHook() {
        var checkGrid = setInterval(function () {
            if (!_$) return;
            const grid = _$('#grdBenhNhan');
            if (grid.length > 0 && typeof grid.jqGrid === 'function') {
                clearInterval(checkGrid);
                log.debug('👤 Patient grid found, hooking selection...');

                // Hook row click
                grid.on('click', 'tr.jqgrow', function () {
                    const rowId = _$(this).attr('id');
                    if (rowId) onPatientSelected(rowId);
                });

                // Hook jqGrid selection event
                try {
                    grid.on('jqGridSelectRow', function (_e, rowId) {
                        if (rowId) onPatientSelected(rowId);
                    });
                } catch (e) { }

                // Check if a row is already selected
                try {
                    const selRow = grid.jqGrid('getGridParam', 'selrow');
                    if (selRow) onPatientSelected(selRow);
                } catch (e) { }
            }
        }, 1000);
        setTimeout(function () { clearInterval(checkGrid); }, 30000);
    }

    function onPatientSelected(rowId) {
        // ★ FIX: Đọc rowData TRƯỚC khi dedup — so sánh KHAMBENHID thay vì rowId
        // vì rowId là jqGrid internal ID (1,2,3...) có thể TRÙNG khi grid reload
        // dẫn đến không cập nhật tên BN khi chọn BN khác cùng vị trí.
        try {
            var rowData = _$('#grdBenhNhan').jqGrid('getRowData', rowId);
        } catch (e) {
            log.error('👤 Error reading rowData:', e);
            return;
        }

        // ★ DEBUG: Log tất cả keys trong rowData để biết tên cột thực tế
        var allKeys = Object.keys(rowData);
        log.debug('👤 rowData keys:', allKeys.join(', '));

        // ★ Tìm tên BN — hỗ trợ nhiều tên cột khác nhau tùy trang HIS
        let hoTen = rowData.HOTEN || rowData.HoTen || rowData.hoten
            || rowData.TENBENHNHAN || rowData.TenBenhNhan || rowData.tenbenhnhan
            || rowData.TEN_BENH_NHAN || rowData.Ten_Benh_Nhan
            || rowData.TENBN || rowData.TenBN
            || rowData.HO_TEN || rowData.Ho_Ten
            || '';

        // ★ Fallback: quét tất cả values trong rowData tìm tên người VN
        if (!hoTen) {
            for (let ki = 0; ki < allKeys.length; ki++) {
                var val = String(rowData[allKeys[ki]] || '').trim();
                // Tên BN: chữ cái đầu viết hoa, có dấu cách, dài ≥ 5, không phải số/mã
                if (val.length >= 5 && val.length <= 50
                    && /^[A-ZÀ-Ỹ]/.test(val) && val.includes(' ')
                    && !/^\d/.test(val) && !/^[A-Z]{2,}\d/.test(val)  // loại mã như TE1878...
                    && !/^\d{2}\/\d{2}/.test(val)  // loại ngày
                ) {
                    hoTen = val;
                    log.debug('👤 Tên BN từ key "' + allKeys[ki] + '":', hoTen);
                    break;
                }
            }
        }

        // ★ Fallback cuối: đọc trực tiếp từ DOM cells trong row được chọn
        if (!hoTen) {
            try {
                const domRow = _$('#grdBenhNhan tr#' + rowId + ', #grdBenhNhan tr[id="' + rowId + '"]');
                if (domRow.length > 0) {
                    const cells = domRow.find('td');
                    cells.each(function () {
                        let cellText = _$(this).text().trim();
                        // Loại bỏ HTML tags nếu có
                        cellText = cellText.replace(/<[^>]+>/g, '').trim();
                        if (cellText.length >= 5 && cellText.length <= 50
                            && /^[A-ZÀ-Ỹ]/.test(cellText) && cellText.includes(' ')
                            && !/^\d/.test(cellText) && !/^[A-Z]{2,}\d/.test(cellText)
                            && !/^\d{2}\/\d{2}/.test(cellText)
                        ) {
                            hoTen = cellText;
                            log.debug('👤 Tên BN từ DOM cell:', hoTen);
                            return false; // break .each()
                        }
                    });
                }
            } catch (e) { log.warn('👤 DOM fallback error:', e.message); }
        }

        // Strip HTML tags nếu jqGrid trả về HTML thay vì text
        if (hoTen && hoTen.indexOf('<') >= 0) {
            const tmp = document.createElement('div');
            tmp.innerHTML = hoTen;
            hoTen = (tmp.textContent || tmp.innerText || '').trim();
        }

        const ngaySinh = rowData.NGAYSINH || rowData.NgaySinh || rowData.ngaysinh
            || rowData.NAMSINH || rowData.NamSinh || rowData.namsinh
            || rowData.NAM_SINH || rowData.NGAY_SINH
            || '';
        const gioiTinh = rowData.GIOITINH || rowData.GioiTinh || rowData.gioitinh
            || rowData.GIOI_TINH || rowData.Gioi_Tinh
            || '';
        const khambenhId = rowData.KHAMBENHID || rowData.KhamBenhID || rowData.KHAM_BENH_ID || '';
        const hosobenhanid = rowData.HOSOBENHANID || rowData.HoSoBenhAnID || rowData.HOSO_BENHAN_ID || '';

        // ★ DEDUP 2-tầng:
        //   - rowId khác → LUÔN xử lý (click row khác)
        //   - rowId giống + patientKey giống → bỏ qua (click lại cùng BN)
        //   - rowId giống + patientKey khác → xử lý (grid reload, BN mới ở cùng row)
        //   - patientKey rỗng/vô nghĩa ('|') → LUÔN xử lý (không đủ data để dedup)
        const patientKey = khambenhId || hosobenhanid || (hoTen + '|' + ngaySinh);
        const isNewRow = (rowId !== _lastSelectedRowId);
        const hasValidKey = patientKey && patientKey !== '|' && patientKey !== '|0';
        const isNewPatient = !hasValidKey || patientKey !== _lastSelectedPatientId;

        if (!isNewRow && !isNewPatient) {
            log.debug('👤 Dedup: same row + same patient, skip');
            return;
        }

        _lastSelectedRowId = rowId;
        _lastSelectedPatientId = patientKey;
        log.debug('👤 Patient selected:', rowId, '| key:', patientKey, '| name:', hoTen ? '(found)' : '(EMPTY!)');

        // Reset cache khi chuyển BN
        _cachedCareSheetSec4 = null;
        _cachedCareSheetSec17 = null;
        _cachedCareSheetWeight = '';
        _cachedPhieuId = '';
        _isFullyAggregated = false;

        // ⚠️ SAFETY: Không log tên BN, chỉ log ID
        log.debug('👤 BN selected | KB:', khambenhId, '| HSBA:', hosobenhanid);

        // Fetch vitals
        const vitals = {};
        if (khambenhId) {
            try {
                const params = JSON.stringify({ KHAMBENHID: khambenhId });
                const result = _jsonrpc.AjaxJson.ajaxCALL_SP_O('NT.006', params, 0);
                if (result) {
                    const data = (typeof result === 'string' && result.trim() !== '') ? JSON.parse(result) : result;
                    const records = Array.isArray(data) ? data : [data];
                    // Debug: log raw keys để tìm chiều cao
                    if (records[0]) {
                        var allKeys = Object.keys(records[0]);
                        log.debug('⚖️ NT.006 raw keys:', allKeys.join(', '));
                        const heightRelated = {};
                        for (let dk = 0; dk < allKeys.length; dk++) {
                            const dkey = allKeys[dk].toUpperCase();
                            if (dkey.indexOf('CHIEU') >= 0 || dkey.indexOf('CAO') >= 0 || dkey.indexOf('HEIGHT') >= 0 || dkey.indexOf('BMI') >= 0) {
                                heightRelated[allKeys[dk]] = records[0][allKeys[dk]];
                            }
                        }
                        log.debug('⚖️ Height-related fields:', JSON.stringify(heightRelated));
                    }
                    for (let i = 0; i < records.length; i++) {
                        const rec = records[i];
                        if (!rec) continue;
                        for (const k in rec) {
                            if (!rec.hasOwnProperty(k)) continue;
                            var val = rec[k];
                            if (!val || val === '0' || String(val).trim() === '') continue;
                            const uk = k.toUpperCase();
                            if (!vitals.weight && (uk === 'KHAMBENH_CANNANG' || uk === 'CANNANG' || uk === 'CAN_NANG')) vitals.weight = String(val);
                            if (!vitals.height && (uk === 'KHAMBENH_CHIEUCAO' || uk === 'CHIEUCAO' || uk === 'CHIEU_CAO')) vitals.height = String(val);
                            if (!vitals.pulse && (uk === 'KHAMBENH_MACH' || uk === 'MACH')) vitals.pulse = String(val);
                            if (!vitals.temp && (uk === 'KHAMBENH_NHIETDO' || uk === 'NHIETDO')) vitals.temp = String(val);
                        }
                    }
                }
            } catch (e) { log.warn('⚖️ NT.006 error:', e.message); }
        }

        // Fallback: lấy từ grid rowData (Scanner v3 style)
        if (!vitals.height) {
            const gridH = rowData.CHIEUCAO || rowData.ChieuCao || rowData.KHAMBENH_CHIEUCAO || '';
            if (gridH && gridH !== '0') vitals.height = String(gridH);
        }
        if (!vitals.weight) {
            const gridW = rowData.CANNANG || rowData.CanNang || rowData.KHAMBENH_CANNANG || '';
            if (gridW && gridW !== '0') vitals.weight = String(gridW);
        }

        // Fallback 2: Scan lần khám cũ (Scanner v3 style) nếu chưa có chiều cao
        if (!vitals.height && hosobenhanid && _jsonrpc) {
            try {
                log.debug('📏 Scan HSBA cũ để tìm chiều cao...');
                const hsbaParams = JSON.stringify({ HOSOBENHANID: hosobenhanid });
                const hsbaResult = _jsonrpc.AjaxJson.ajaxCALL_SP_O('NT.006.HSBA.HIS', hsbaParams, 0);
                if (hsbaResult) {
                    const hsbaData = (typeof hsbaResult === 'string' && hsbaResult.trim() !== '') ? JSON.parse(hsbaResult) : hsbaResult;
                    const hsbaRecords = Array.isArray(hsbaData) ? hsbaData : [hsbaData];
                    for (let hi = hsbaRecords.length - 1; hi >= 0; hi--) {
                        const hrec = hsbaRecords[hi];
                        if (!hrec) continue;
                        const hcc = hrec.KHAMBENH_CHIEUCAO || hrec.CHIEUCAO || '';
                        if (hcc && hcc !== '0' && String(hcc).trim() !== '') {
                            vitals.height = String(hcc);
                            log.debug('📏 Tìm thấy chiều cao từ HSBA cũ: ' + hcc + 'cm');
                            break;
                        }
                    }
                }
            } catch (e) { log.warn('📏 NT.006.HSBA.HIS error:', e.message); }
        }

        // ⚠️ SAFETY: Không log chi tiết vitals
        log.debug('👤 Vitals loaded:', Object.keys(vitals).length, 'fields');

        // Broadcast to content script
        window.postMessage({
            type: 'QUYEN_PATIENT_SELECTED',
            patient: {
                name: hoTen,
                dob: ngaySinh,
                gender: gioiTinh,
                khambenhId: khambenhId,
                hosobenhanid: hosobenhanid
            },
            vitals: vitals
        }, '*');

        // ★ Auto-fetch Section 4+17 từ phiếu cũ (delay để care sheet iframe load)
        setTimeout(function () {
            handleCareSheetSec4Request();
        }, 2000);
    }

    setupPatientGridHook();

    if (_$ && window.__QUYEN_AJAX_SNOOP !== false) {
        const originalAjax = _$.ajax;
        _$.ajax = function (options) {
            const originalSuccess = options.success;

            options.success = function (data, textStatus, jqXHR) {
                try {
                    // Kiểm tra xem response có phải từ API thuốc không
                    checkForDrugData(options, data);
                    // Kiểm tra xem response có phải từ API phiếu chăm sóc không
                    checkForCareSheetData(options, data);
                } catch (e) { }

                // Gọi callback gốc
                if (originalSuccess) originalSuccess.apply(this, arguments);
            };

            return originalAjax.apply(this, arguments);
        };

        log.debug('AJAX snooping đã bật — đang chờ bắt dữ liệu thuốc...');
    }

    /**
     * Kiểm tra và bắt dữ liệu phiếu chăm sóc (Section 4)
     * Khi HIS load phiếu cũ, API trả về array với các CT_FORM_ID
     */
    function checkForCareSheetData(options, data) {
        const urlStr = (options.url || '') + (typeof options.data === 'string' ? options.data : JSON.stringify(options.data || {}));

        if (!urlStr.includes('NTU02D204') && !urlStr.includes('NTU82D204')) return;

        // Parse response
        let items = [];
        if (data && data.result) {
            try {
                items = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
            } catch (e) { return; }
        } else if (Array.isArray(data)) {
            items = data;
        }

        if (!Array.isArray(items) || items.length === 0) return;

        // ★ Bắt cả Section 4 + Section 17 + Cân nặng + Chiều cao
        const sec4 = {};
        const sec17 = {};
        let weight = '';
        let height = '';
        let hasSec4 = false;

        // ★ Sinh hiệu từ phiếu cũ (dữ liệu thật)
        const VITAL_CT_MAP = { '1243': 'nhipTim', '1244': 'nhietDo', '1245': 'huyetAp', '1246': 'nhipTho', '1247': 'spO2' };
        const vitalsFromPrev = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const ctId = String(item.CT_FORM_ID);

            // Section 4
            if (SECTION4_IDS.indexOf(ctId) >= 0 && item.DULIEU && item.DULIEU.trim()) {
                sec4[ctId] = item.DULIEU.trim();
                hasSec4 = true;
            }

            // Section 17 — combogrid (LOAD_KYHIEU_DTP*)
            if (item.SQL_DL && String(item.SQL_DL).indexOf('LOAD_KYHIEU_DTP') >= 0 && item.DULIEU && item.DULIEU.trim()) {
                sec17[ctId] = item.DULIEU.trim();
            }

            // Cân nặng
            if (ctId === WEIGHT_CT_ID && item.DULIEU && item.DULIEU.trim()) {
                weight = item.DULIEU.trim();
            }

            // Chiều cao
            if (ctId === HEIGHT_CT_ID && item.DULIEU && item.DULIEU.trim()) {
                height = item.DULIEU.trim();
            }

            // ★ Sinh hiệu từ phiếu cũ
            if (VITAL_CT_MAP[ctId] && item.DULIEU && item.DULIEU.trim()) {
                vitalsFromPrev[VITAL_CT_MAP[ctId]] = item.DULIEU.trim();
            }
        }

        const hasSec17 = Object.keys(sec17).length > 0;

        if (hasSec4 || hasSec17 || weight) {
            if (hasSec4) _cachedCareSheetSec4 = sec4;
            if (hasSec17) _cachedCareSheetSec17 = sec17;
            if (weight) _cachedCareSheetWeight = weight;

            log.debug('📋 AJAX snoop — Sec4:', Object.keys(sec4).length, 'ô, Sec17:', Object.keys(sec17).length, 'mục');

            // ★ Auto-switch panel tab → phiếu chăm sóc
            window.postMessage({ type: 'QUYEN_FORM_FOCUSED', tab: 'caresheet' }, location.origin);

            // Gửi đầy đủ cho content script
            window.postMessage({
                type: 'QUYEN_CARESHEET_SEC4_DATA',
                data: sec4,
                sec17: sec17,
                weight: weight,
                height: height,
                vitalsFromPrev: vitalsFromPrev
            }, '*');
        }
    }

    /**
     * Kiểm tra và bắt dữ liệu thuốc từ AJAX response
     */
    function checkForDrugData(options, data) {
        // Kiểm tra URL hoặc params có chứa NTU02D007 không
        const urlStr = (options.url || '') + (typeof options.data === 'string' ? options.data : JSON.stringify(options.data || {}));

        if (urlStr.includes('NTU02D007') || urlStr.includes('PhieuTruyenDich')) {
            log.debug('🎯 BẮT ĐƯỢC API thuốc!', data);

            let rows = [];
            if (data && data.rows) rows = data.rows;
            else if (Array.isArray(data)) rows = data;
            else if (data && typeof data === 'string') {
                try { rows = JSON.parse(data).rows || []; } catch (e) { }
            }

            if (rows.length > 0) {
                _capturedDrugs = rows.map(parseDrugFromAPI);
                log.debug('💉 Đã bắt được', _capturedDrugs.length, 'thuốc:', _capturedDrugs);

                // ★ Auto-switch panel tab → dịch truyền
                window.postMessage({ type: 'QUYEN_FORM_FOCUSED', tab: 'infusion' }, location.origin);

                // Gửi ngay cho content script
                broadcastDrugs(_capturedDrugs);
            }
        }
    }

    // ==========================================
    // CARE SHEET SEC4 — Chủ động lấy data từ phiếu cũ
    // ★ v2: Tổng hợp từ 2 ngày gần nhất (ưu tiên ngày mới, fallback ngày cũ)
    // ==========================================
    function handleCareSheetSec4Request() {
        // 1. Có cache ĐÃ AGGREGATE → trả luôn
        if (_isFullyAggregated && _cachedCareSheetSec4 && Object.keys(_cachedCareSheetSec4).length > 0) {
            log.debug('📋 Trả Section 4+17 từ cache (đã aggregate):', _cachedCareSheetSec4, _cachedCareSheetSec17);
            window.postMessage({
                type: 'QUYEN_CARESHEET_SEC4_DATA',
                data: _cachedCareSheetSec4,
                sec17: _cachedCareSheetSec17 || {},
                weight: _cachedCareSheetWeight || '',
                phieuId: _cachedPhieuId || ''
            }, '*');
            return;
        }

        // 2. Tìm PHIEUIDs từ care sheet grid
        const phieuIds = findPhieuIdsFromCareSheetGrid();
        if (phieuIds.length === 0) {
            log.warn('📋 Không tìm thấy PHIEUID nào trong care sheet grid');
            window.postMessage({ type: 'QUYEN_CARESHEET_SEC4_DATA', data: {} }, location.origin);
            return;
        }

        log.debug('📋 Tìm thấy', phieuIds.length, 'phiếu:', phieuIds.join(', '));

        // 3. ★ Quét TẤT CẢ phiếu cũ (bỏ phiếu đầu = phiếu mới đang tạo)
        const startIdx = phieuIds.length > 1 ? 1 : 0;
        const maxFetch = phieuIds.length; // Không giới hạn — quét hết tất cả phiếu
        const allPhieuData = [];

        log.debug('📋 Fetch tất cả phiếu từ index', startIdx, 'đến', maxFetch - 1, '(' + (maxFetch - startIdx) + ' phiếu)');

        for (let p = startIdx; p < maxFetch; p++) {
            const items = fetchCareSheetItems(phieuIds[p]);
            if (items && items.length > 0) {
                const phieuDate = extractDateFromItems(items);
                allPhieuData.push({ phieuId: phieuIds[p], items: items, date: phieuDate });
                log.debug('📋 Phiếu', phieuIds[p], ': ngày', phieuDate || '(không rõ)', ',', items.length, 'items');
            }
        }

        if (allPhieuData.length === 0) {
            log.warn('📋 Không lấy được dữ liệu từ bất kỳ phiếu cũ nào');
            window.postMessage({ type: 'QUYEN_CARESHEET_SEC4_DATA', data: {} }, location.origin);
            return;
        }

        // 4. Aggregate từ 2 ngày gần nhất
        aggregateFromRecentDays(allPhieuData);
    }

    /**
     * ★ AGGREGATE — Tổng hợp Section 4 + 17 từ 2 ngày gần nhất
     * Ưu tiên ngày mới nhất, fallback ngày cũ hơn.
     */
    function aggregateFromRecentDays(allPhieuData) {
        // Nhóm theo ngày (YYYY-MM-DD string)
        const byDate = {};
        for (let i = 0; i < allPhieuData.length; i++) {
            var d = allPhieuData[i];
            const dateKey = d.date || 'unknown_' + i;
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push(d);
        }

        // Sắp xếp ngày giảm dần (mới nhất trước)
        const sortedDates = Object.keys(byDate).sort(function (a, b) {
            // unknown_ keys luôn đặt cuối
            if (a.indexOf('unknown') === 0) return 1;
            if (b.indexOf('unknown') === 0) return -1;
            return b.localeCompare(a);
        });

        log.debug('📋 Các ngày phiếu:', sortedDates.join(', '));

        // Lấy tối đa 5 ngày gần nhất — quét trọn tất cả phiếu của các ngày đó để fallback nếu ngày mới trống
        const recentDates = sortedDates.slice(0, 5);
        log.debug('📋 Lấy các ngày gần nhất:', recentDates.join(', '));

        // Merge: ngày mới → ngày cũ (ưu tiên ngày mới)
        const mergedSec4 = {};
        const mergedSec17 = {};
        let mergedWeight = '';
        let mergedHeight = '';
        let mergedPhieuId = '';
        const VITAL_CT_MAP2 = { '1243': 'nhipTim', '1244': 'nhietDo', '1245': 'huyetAp', '1246': 'nhipTho', '1247': 'spO2' };
        const mergedVitals = {};

        // Duyệt ngược: ngày CŨ trước → ngày MỚI sau (để ngày mới ghi đè)
        for (let di = recentDates.length - 1; di >= 0; di--) {
            const dateKey2 = recentDates[di];
            const phieus = byDate[dateKey2];

            for (let pi = 0; pi < phieus.length; pi++) {
                const phieu = phieus[pi];
                const items = phieu.items;

                for (let ii = 0; ii < items.length; ii++) {
                    const item = items[ii];
                    const ctId = String(item.CT_FORM_ID);

                    // Section 4
                    if (SECTION4_IDS.indexOf(ctId) >= 0 && item.DULIEU && item.DULIEU.trim()) {
                        mergedSec4[ctId] = item.DULIEU.trim();
                    }

                    // Section 17
                    if (item.SQL_DL && String(item.SQL_DL).indexOf('LOAD_KYHIEU_DTP') >= 0 && item.DULIEU && item.DULIEU.trim()) {
                        mergedSec17[ctId] = item.DULIEU.trim();
                    }

                    // Cân nặng
                    if (ctId === WEIGHT_CT_ID && item.DULIEU && item.DULIEU.trim()) {
                        mergedWeight = item.DULIEU.trim();
                    }

                    // Chiều cao
                    if (ctId === HEIGHT_CT_ID && item.DULIEU && item.DULIEU.trim()) {
                        mergedHeight = item.DULIEU.trim();
                    }

                    // ★ Sinh hiệu từ phiếu cũ
                    if (VITAL_CT_MAP2[ctId] && item.DULIEU && item.DULIEU.trim()) {
                        mergedVitals[VITAL_CT_MAP2[ctId]] = item.DULIEU.trim();
                    }
                }

                // Ghi nhớ phiếu mới nhất có data
                if (di === 0) mergedPhieuId = phieu.phieuId;
            }
        }

        const hasSec4 = Object.keys(mergedSec4).length > 0;
        const hasSec17 = Object.keys(mergedSec17).length > 0;

        if (hasSec4) {
            _cachedCareSheetSec4 = mergedSec4;
            log.debug('📋 ✅ Merged Section 4:', mergedSec4);
        }
        if (hasSec17) {
            _cachedCareSheetSec17 = mergedSec17;
            log.debug('📋 ✅ Merged Section 17:', mergedSec17);
        }
        if (mergedWeight) {
            _cachedCareSheetWeight = mergedWeight;
        }
        _cachedPhieuId = mergedPhieuId;
        _isFullyAggregated = true; // ★ Đánh dấu cache đã aggregate đầy đủ

        // Lấy tên bệnh nhân
        let patientName = '';
        try {
            const docs = getAllDocuments();
            for (var d = 0; d < docs.length; d++) {
                try {
                    const walker = docs[d].createTreeWalker(docs[d].body || docs[d], NodeFilter.SHOW_TEXT);
                    while (walker.nextNode()) {
                        const text = walker.currentNode.textContent || '';
                        const m = text.match(/HIS[^(]*\(([^/]+)/);
                        if (m) { patientName = m[1].trim(); break; }
                    }
                    if (patientName) break;
                } catch (e) { }
            }
        } catch (e) { }

        log.debug('📋 Tổng hợp xong: Sec4=' + Object.keys(mergedSec4).length + ' ô, Sec17=' + Object.keys(mergedSec17).length + ' mục, từ ' + recentDates.length + ' ngày');

        window.postMessage({
            type: 'QUYEN_CARESHEET_SEC4_DATA',
            data: mergedSec4,
            sec17: mergedSec17,
            weight: mergedWeight,
            height: mergedHeight,
            vitalsFromPrev: mergedVitals,
            patientName: patientName,
            phieuId: mergedPhieuId
        }, '*');
    }

    /**
     * Extract ngày từ items (NGAYTAO, NGAYSUA, NGAY)
     * Trả về string 'YYYY-MM-DD' để dễ sort
     */
    function extractDateFromItems(items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            let dateStr = item.NGAYTAO || item.NGAYSUA || item.NGAY || '';
            if (!dateStr) continue;
            dateStr = String(dateStr).trim();

            // dd/mm/yyyy → yyyy-mm-dd
            const vnMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (vnMatch) {
                return vnMatch[3] + '-' + ('0' + vnMatch[2]).slice(-2) + '-' + ('0' + vnMatch[1]).slice(-2);
            }

            // yyyy-mm-dd already
            const isoMatch = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (isoMatch) {
                return isoMatch[1] + '-' + ('0' + isoMatch[2]).slice(-2) + '-' + ('0' + isoMatch[3]).slice(-2);
            }
        }
        return '';
    }

    /**
     * Tìm tất cả PHIEUID từ care sheet grid
     * CHỈ TÌM TRONG IFRAMES (không tìm trong top document vì đó là patient grid)
     */
    function findPhieuIdsFromCareSheetGrid() {
        const phieuIds = [];

        // Tìm iframe NTU02D204 (care sheet form)
        let csIframeWin = null;
        try {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    let iUrl = '';
                    try { iUrl = iframes[i].contentWindow.location.href || ''; } catch (e) { }
                    if (iUrl.indexOf('NTU02D204') >= 0 || iUrl.indexOf('ThemPhieu') >= 0) {
                        csIframeWin = iframes[i].contentWindow;
                        log.debug('📋 ✅ Tìm thấy care sheet iframe #' + i);
                        break;
                    }
                } catch (e) { }
            }
        } catch (e) { }

        if (!csIframeWin) {
            log.warn('📋 Không tìm thấy iframe NTU02D204!');
            return phieuIds;
        }

        // STRATEGY 1: Dùng iframe jQuery + jqGrid getRowData → đọc cột PHIEUID
        try {
            const iframe$ = csIframeWin.$ || csIframeWin.jQuery;
            if (iframe$) {
                const grid = iframe$('#grdDanhSach');
                if (grid.length > 0 && typeof grid.jqGrid === 'function') {
                    const allRows = grid.jqGrid('getRowData');
                    if (allRows && allRows.length > 0) {
                        log.debug('📋 jqGrid getRowData: ' + allRows.length + ' rows');
                        for (let ri = 0; ri < allRows.length; ri++) {
                            const pid = String(allRows[ri].PHIEUID || '').trim();
                            if (/^\d{4,}$/.test(pid) && phieuIds.indexOf(pid) < 0) {
                                phieuIds.push(pid);
                            }
                        }
                        if (phieuIds.length > 0) {
                            log.debug('📋 ✅ Strategy 1 (jqGrid PHIEUID column): ' + phieuIds.join(', '));
                            return phieuIds;
                        }
                        log.debug('📋 Strategy 1: Không tìm thấy cột PHIEUID, thử column names...');
                        // Debug: log column names của row đầu
                        const colNames = Object.keys(allRows[0] || {});
                        log.debug('📋 Columns: ' + colNames.join(', '));
                    }
                } else {
                    log.debug('📋 Strategy 1: Grid #grdDanhSach không tìm thấy');
                }
            } else {
                log.debug('📋 Strategy 1: Iframe không có jQuery');
            }
        } catch (e) { log.debug('📋 Strategy 1 error: ' + e.message); }

        // STRATEGY 2: Tìm <td> có aria-describedby chứa "PHIEUID"
        try {
            const csDoc = csIframeWin.document;
            const phieuCells = csDoc.querySelectorAll('td[aria-describedby*="PHIEUID"]');
            if (phieuCells.length > 0) {
                log.debug('📋 Strategy 2: Tìm thấy ' + phieuCells.length + ' PHIEUID cells');
                for (let pc = 0; pc < phieuCells.length; pc++) {
                    const pVal = (phieuCells[pc].textContent || '').trim();
                    if (/^\d{4,}$/.test(pVal) && phieuIds.indexOf(pVal) < 0) {
                        phieuIds.push(pVal);
                    }
                }
                if (phieuIds.length > 0) {
                    log.debug('📋 ✅ Strategy 2 (aria-describedby PHIEUID): ' + phieuIds.join(', '));
                    return phieuIds;
                }
            }
        } catch (e) { log.debug('📋 Strategy 2 error: ' + e.message); }

        // STRATEGY 3: Fallback — đọc tất cả cells, lấy số >= 6 chữ số (likely PHIEUID)
        try {
            const csDoc3 = csIframeWin.document;
            const rows3 = csDoc3.querySelectorAll('#grdDanhSach tr.jqgrow, tr.jqgrow[role="row"]');
            if (rows3.length > 0) {
                log.debug('📋 Strategy 3: ' + rows3.length + ' rows');
                for (let r3 = 0; r3 < rows3.length; r3++) {
                    const cells3 = rows3[r3].querySelectorAll('td');
                    for (let c3 = 0; c3 < cells3.length; c3++) {
                        const ct = (cells3[c3].textContent || '').trim();
                        // PHIEUID thường >= 6 chữ số, skip số nhỏ
                        if (/^\d{6,}$/.test(ct) && phieuIds.indexOf(ct) < 0) {
                            phieuIds.push(ct);
                            break;
                        }
                    }
                }
                if (phieuIds.length > 0) {
                    log.debug('📋 ✅ Strategy 3 (cell text >=6 digits): ' + phieuIds.join(', '));
                    return phieuIds;
                }
            }
        } catch (e) { log.debug('📋 Strategy 3 error: ' + e.message); }

        log.warn('📋 ❌ Không tìm được PHIEUIDs!');
        return phieuIds;
    }

    // Giữ lại getAllDocuments cho các hàm khác dùng
    function findLatestPhieuIdFromDOM() {
        const ids = findPhieuIdsFromCareSheetGrid();
        return ids.length > 1 ? ids[1] : (ids.length > 0 ? ids[0] : null);
    }

    /** Thu thập tất cả documents (top + iframes, 2 levels) */
    function getAllDocuments() {
        const docs = [document];
        try {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const iDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iDoc) {
                        docs.push(iDoc);
                        // Level 2
                        const subIframes = iDoc.querySelectorAll('iframe');
                        for (let j = 0; j < subIframes.length; j++) {
                            try {
                                const sDoc = subIframes[j].contentDocument || subIframes[j].contentWindow.document;
                                if (sDoc) docs.push(sDoc);
                            } catch (e) { }
                        }
                    }
                } catch (e) { }
            }
        } catch (e) { }
        return docs;
    }

    /**
     * ★ Fetch raw items từ 1 phiếu (không broadcast)
     * Trả về array items hoặc null nếu lỗi
     */
    function fetchCareSheetItems(phieuId) {
        // Tìm iframe NTU02D204
        let csIframeWin = null;
        try {
            const iframes = document.querySelectorAll('iframe');
            for (let fi = 0; fi < iframes.length; fi++) {
                try {
                    const fUrl = iframes[fi].contentWindow.location.href || '';
                    if (fUrl.indexOf('NTU02D204') >= 0 || fUrl.indexOf('ThemPhieu') >= 0) {
                        csIframeWin = iframes[fi].contentWindow;
                        break;
                    }
                } catch (e) { }
            }
        } catch (e) { }

        if (!csIframeWin) {
            log.warn('📋 Không tìm thấy iframe NTU02D204 cho API call');
            return null;
        }

        try {
            const resultVarName = '_quyenResult_' + phieuId;
            const iframeUuid = csIframeWin.uuid || '';
            if (!iframeUuid) {
                log.warn('📋 Không tìm thấy UUID trong iframe');
                return null;
            }

            const apiBody = JSON.stringify({
                func: 'ajaxCALL_SP_O',
                params: ['NTU02D204.06', String(phieuId), 0],
                uuid: iframeUuid
            });

            const scriptCode = '(function(){try{' +
                'var x=new XMLHttpRequest();' +
                'x.open("POST","/vnpthis/RestService",false);' +
                'x.setRequestHeader("Content-Type","application/json");' +
                'x.send(' + JSON.stringify(apiBody) + ');' +
                'window["' + resultVarName + '"]=x.status===200?JSON.parse(x.responseText):{_error:"HTTP "+x.status};' +
                '}catch(e){window["' + resultVarName + '"]={_error:e.message};}})();';

            const script = csIframeWin.document.createElement('script');
            script.textContent = scriptCode;
            csIframeWin.document.body.appendChild(script);
            csIframeWin.document.body.removeChild(script);

            const rawResult = csIframeWin[resultVarName];
            delete csIframeWin[resultVarName];

            if (!rawResult || rawResult._error || (rawResult.error_code && rawResult.error_code !== 0)) {
                log.warn('📋 Phiếu', phieuId, ': lỗi hoặc không có kết quả');
                return null;
            }

            // Parse result
            let parsed = rawResult;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch (e) { }
            }
            if (parsed && parsed.result !== undefined) {
                parsed = parsed.result;
                if (typeof parsed === 'string') {
                    try { parsed = JSON.parse(parsed); } catch (e) { }
                }
            }

            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }

            log.warn('📋 Phiếu', phieuId, 'trả về rỗng');
            return null;
        } catch (e) {
            log.error('📋 Lỗi gọi API phiếu', phieuId, ':', e.message);
            return null;
        }
    }

    /**
     * Legacy wrapper — vẫn giữ cho AJAX snooping dùng
     */
    function fetchCareSheetDataById(phieuId) {
        const items = fetchCareSheetItems(phieuId);
        if (!items) return false;

        let sec4 = {}, sec17 = {}, hasData = false, weight = '', height = '';
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const ctId = String(item.CT_FORM_ID);
            if (SECTION4_IDS.indexOf(ctId) >= 0 && item.DULIEU && item.DULIEU.trim()) {
                sec4[ctId] = item.DULIEU.trim();
                hasData = true;
            }
            if (item.SQL_DL && String(item.SQL_DL).indexOf('LOAD_KYHIEU_DTP') >= 0 && item.DULIEU && item.DULIEU.trim()) {
                sec17[ctId] = item.DULIEU.trim();
            }
            if (ctId === WEIGHT_CT_ID && item.DULIEU && item.DULIEU.trim()) weight = item.DULIEU.trim();
            if (ctId === HEIGHT_CT_ID && item.DULIEU && item.DULIEU.trim()) height = item.DULIEU.trim();
        }

        if (hasData) _cachedCareSheetSec4 = sec4;
        if (weight) _cachedCareSheetWeight = weight;

        window.postMessage({
            type: 'QUYEN_CARESHEET_SEC4_DATA',
            data: sec4, sec17: sec17, weight: weight, height: height, phieuId: phieuId
        }, '*');

        return hasData;
    }

    // ==========================================
    // MESSAGE HANDLER
    // ==========================================
    window.addEventListener('message', function (event) {
        if (event.origin !== window.location.origin) return;
        if (!event.data || !event.data.type) return;

        switch (event.data.type) {
            case 'QUYEN_REQ_DRUG_LIST':
                handleDrugListRequest(event.data.requestId, event.data.treatmentId);
                break;
            case 'QUYEN_REQ_PATIENT_INFO':
                fetchPatientInfo(event.data.rowId, event.data.requestId);
                break;
            case 'QUYEN_REQ_CALL_SP':
                callSP(event.data.spName, event.data.params, event.data.requestId);
                break;
            case 'QUYEN_COMBOGRID_CLICK':
                handleComboGridClick(event.data.marker, event.data.requestId);
                break;
            case 'QUYEN_KEYBOARD_SELECT':
                handleKeyboardSelect(event.data.inputMarker, event.data.itemIndex, event.data.requestId);
                break;
            case 'QUYEN_TRIGGER_SEARCH':
                handleTriggerSearch(event.data.inputMarker);
                break;
            case 'QUYEN_TRIGGER_CHANGE':
                try {
                    if (_$) {
                        const sel = event.data.selector;
                        const val = event.data.value;
                        const $el = _$(sel);
                        if ($el.length) {
                            $el.val(val).trigger('change');
                            log.debug('TRIGGER_CHANGE: set', sel, '=', val);
                        }
                    }
                } catch (e) { log.warn('TRIGGER_CHANGE error:', e); }
                break;
            case 'QUYEN_WAKE_UP_GRID':
                handleWakeUpGrid(event.data.inputMarker);
                break;
            case 'QUYEN_TYPE_TEXT':
                handleTypeText(event.data.inputMarker, event.data.text);
                break;
            case 'QUYEN_REQ_CARESHEET_SEC4':
                handleCareSheetSec4Request();
                break;
            case 'QUYEN_REQ_VITALS':
                fetchVitalsFromHIS();
                break;
            case 'QUYEN_FILL_COMBOGRID':
                handleFillComboGrid(event.data.tasks);
                break;
        }
    });

    // ==========================================
    // COMBOGRID FILL — Set DULIEU trực tiếp vào Section 17
    // Cách 1: Paste raw value, không qua dropdown
    // Bridge truy cập iframe.contentWindow.jQuery
    // ==========================================
    function handleFillComboGrid(tasks) {
        if (!tasks || tasks.length === 0) return;

        // Tìm iframe chứa form phiếu (bắt chước logic của caresheet-filler.js để không dính iframe rác)
        let iframe = null;
        const allIframes = document.querySelectorAll('iframe');
        const candidateIframes = [];

        for (let i = 0; i < allIframes.length; i++) {
            const frm = allIframes[i];
            const isVisible = frm.offsetParent !== null;
            if (frm.id && frm.id.includes('ThemPhieu') || (frm.src && (frm.src.includes('ThemPhieu') || frm.src.includes('NTU02D204'))) || frm.id === 'divDlgThemPhieuifmView') {
                candidateIframes.push({ elm: frm, isVisible: isVisible });
            }
        }

        // Sắp xếp prioritize visible
        candidateIframes.sort((a, b) => (a.isVisible === b.isVisible) ? 0 : a.isVisible ? -1 : 1);

        if (candidateIframes.length > 0) {
            iframe = candidateIframes[0].elm;
        }

        if (!iframe || !iframe.contentWindow) {
            log.warn('🏥 Không tìm thấy iframe phiếu (hoặc iframe bị đóng)');
            return;
        }

        const _$ = iframe.contentWindow.jQuery || iframe.contentWindow.$;
        if (!_$) {
            log.warn('🏥 Iframe không có jQuery');
            return;
        }

        log.debug('🏥 Direct set Section 17, ' + tasks.length + ' fields...');

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            // txtMSCFULL_ = ô hiển thị (disabled), txtMSC_ = ô nhập code nhỏ
            const $display = _$('#txtMSCFULL_' + task.ctId);
            if (!$display.length) {
                log.warn('🏥 ⚠️ Không tìm ô txtMSCFULL_' + task.ctId);
                continue;
            }

            // Enable → set value → disable lại
            $display.prop('disabled', false);
            $display.val(task.value);
            $display.trigger('input');
            $display.trigger('change');
            $display.prop('disabled', true);

            log.debug('🏥 ✅ txtMSCFULL_' + task.ctId + ' = "' + task.value + '"');
        }

        log.debug('🏥 ✅ Section 17 hoàn tất!');
    }

    // ==========================================
    // VITALS FETCH — Lấy cân nặng/chiều cao từ HIS (NT.006)
    // Ported from VNPT_HIS_Scanner_v3
    // ==========================================
    function fetchVitalsFromHIS() {
        if (!_jsonrpc) {
            log.warn('⚖️ Không có jsonrpc');
            window.postMessage({ type: 'QUYEN_VITALS_RESULT', vitals: {} }, location.origin);
            return;
        }

        // Tìm KHAMBENHID từ URL params hoặc global vars
        const khambenhId = findCurrentKhamBenhId();
        if (!khambenhId) {
            log.warn('⚖️ Không tìm thấy KHAMBENHID');
            window.postMessage({ type: 'QUYEN_VITALS_RESULT', vitals: {} }, location.origin);
            return;
        }

        log.debug('⚖️ Fetching vitals cho KHAMBENHID:', khambenhId);

        const vitals = {};
        try {
            const params = JSON.stringify({ KHAMBENHID: khambenhId });
            const result = _jsonrpc.AjaxJson.ajaxCALL_SP_O('NT.006', params, 0);
            if (result) {
                const data = (typeof result === 'string' && result.trim() !== '') ? JSON.parse(result) : result;
                const records = Array.isArray(data) ? data : [data];
                for (let i = 0; i < records.length; i++) {
                    const rec = records[i];
                    if (!rec) continue;
                    for (const k in rec) {
                        if (!rec.hasOwnProperty(k)) continue;
                        const val = rec[k];
                        if (!val || val === '0' || String(val).trim() === '') continue;
                        const uk = k.toUpperCase();
                        if (!vitals.weight && (uk === 'KHAMBENH_CANNANG' || uk === 'CANNANG')) vitals.weight = String(val);
                        if (!vitals.height && (uk === 'KHAMBENH_CHIEUCAO' || uk === 'CHIEUCAO' || uk === 'CHIEU_CAO')) vitals.height = String(val);
                        if (!vitals.pulse && (uk === 'KHAMBENH_MACH' || uk === 'MACH')) vitals.pulse = String(val);
                        if (!vitals.temp && (uk === 'KHAMBENH_NHIETDO' || uk === 'NHIETDO')) vitals.temp = String(val);
                    }
                }
            }
        } catch (e) {
            log.error('⚖️ Lỗi gọi NT.006:', e);
        }

        log.debug('⚖️ Vitals result:', vitals);
        window.postMessage({ type: 'QUYEN_VITALS_RESULT', vitals: vitals }, location.origin);
    }

    function findCurrentKhamBenhId() {
        // Cách 1: Từ URL params
        const docs = getAllDocuments();
        for (let d = 0; d < docs.length; d++) {
            try {
                const url = docs[d].defaultView ? docs[d].defaultView.location.href : '';
                const m = url.match(/KHAMBENHID[=:](\d+)/i);
                if (m) return m[1];
            } catch (e) { }
        }

        // Cách 2: Từ global vars trong iframes
        for (let d2 = 0; d2 < docs.length; d2++) {
            try {
                const win = docs[d2].defaultView;
                if (win && win.KHAMBENHID) return String(win.KHAMBENHID);
                if (win && win.khambenhId) return String(win.khambenhId);
            } catch (e) { }
        }

        // Cách 3: Từ hidden input
        for (let d3 = 0; d3 < docs.length; d3++) {
            try {
                const inputs = docs[d3].querySelectorAll('input[type="hidden"]');
                for (let h = 0; h < inputs.length; h++) {
                    const name = (inputs[h].name || inputs[h].id || '').toUpperCase();
                    if (name.indexOf('KHAMBENHID') >= 0 && inputs[h].value) return inputs[h].value;
                }
            } catch (e) { }
        }

        // Cách 4: Từ jqGrid patient list
        if (_$) {
            try {
                const $grid = _$('#grdBenhNhan');
                if ($grid.length > 0) {
                    const selRow = $grid.jqGrid('getGridParam', 'selrow');
                    if (selRow) {
                        const rowData = $grid.jqGrid('getRowData', selRow);
                        return rowData.KHAMBENHID || rowData.KhamBenhID || '';
                    }
                }
            } catch (e) { }
        }

        return null;
    }

    // ==========================================
    // HANDLE DRUG LIST REQUEST
    // Luôn gọi API mới — không trả cache cũ (để hỗ trợ chuyển BN)
    // ==========================================
    function handleDrugListRequest(requestId, treatmentId) {
        const tid = treatmentId || getCurrentTreatmentId();

        // Nếu cùng BN và đã có cache → gửi cache
        if (tid && tid === _lastTreatmentId && _capturedDrugs.length > 0) {
            log.debug('Trả lời từ cache (cùng BN):', _capturedDrugs.length, 'thuốc');
            sendResult('QUYEN_DRUG_LIST_RESULT', { drugs: _capturedDrugs, count: _capturedDrugs.length }, requestId);
            return;
        }

        // Khác BN hoặc chưa có cache → xóa cache cũ, gọi API mới
        if (tid && tid !== _lastTreatmentId) {
            log.debug('🔄 Chuyển BN! Treatment ID cũ:', _lastTreatmentId, '→ mới:', tid);
            _capturedDrugs = [];
            _lastTreatmentId = tid;
        }

        if (tid) {
            fetchDrugsViaAPI(tid, requestId);
        } else if (_capturedDrugs.length > 0) {
            // Không tìm được ID nhưng có cache từ snooping
            sendResult('QUYEN_DRUG_LIST_RESULT', { drugs: _capturedDrugs, count: _capturedDrugs.length }, requestId);
        } else {
            const drugs = parseDrugsFromDOM();
            sendResult('QUYEN_DRUG_LIST_RESULT', { drugs, count: drugs.length }, requestId);
        }
    }

    // ==========================================
    // FETCH DRUGS VIA API (NTU02D007.05)
    // ==========================================
    function fetchDrugsViaAPI(treatmentId, requestId) {
        log.debug('Gọi API NTU02D007.05 với ID:', treatmentId);

        try {
            const uuid = _jsonrpc ? _jsonrpc.AjaxJson.uuid : '';

            const params = {
                func: "ajaxExecuteQueryPaging",
                uuid: uuid,
                params: ["NTU02D007.05"],
                options: [
                    { name: "[0]", value: String(treatmentId) }
                ]
            };

            const queryParams = new URLSearchParams({
                func: 'doComboGrid',
                postData: JSON.stringify(params),
                sidx: '',
                page: '1',
                sord: '',
                rows: '100',
                searchTerm: ''
            });

            const url = '/vnpthis/RestService?' + queryParams.toString();

            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.setRequestHeader('Accept', 'application/json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        const rows = data.rows || [];
                        log.debug('API NTU02D007.05 trả về', rows.length, 'dòng');

                        const allDrugs = rows.map(parseDrugFromAPI);

                        // Lọc chỉ giữ thuốc trong 3 ngày gần nhất
                        const recentDrugs = filterRecentDrugs(allDrugs, 3);
                        log.debug(`Thuốc: ${allDrugs.length} tổng → ${recentDrugs.length} trong 3 ngày gần`);

                        _capturedDrugs = recentDrugs;
                        sendResult('QUYEN_DRUG_LIST_RESULT', { drugs: recentDrugs, count: recentDrugs.length }, requestId);
                        broadcastDrugs(recentDrugs);
                    } catch (e) {
                        log.error('Lỗi parse API response:', e);
                        sendResult('QUYEN_DRUG_LIST_RESULT', { drugs: [], error: e.message }, requestId);
                    }
                }
            };

            xhr.send();
        } catch (e) {
            log.error('Lỗi gọi API:', e);
            sendResult('QUYEN_DRUG_LIST_RESULT', { drugs: [], error: e.message }, requestId);
        }
    }

    // ==========================================
    // GET CURRENT TREATMENT ID
    // Lấy ID điều trị của bệnh nhân đang chọn
    // ==========================================
    function getCurrentTreatmentId() {
        if (!_$) return null;

        try {
            const grid = _$('#grdBenhNhan');
            if (!grid.length) return null;

            // Lấy row đang chọn
            const selectedId = grid.jqGrid('getGridParam', 'selrow');
            if (!selectedId) return null;

            const rowData = grid.jqGrid('getRowData', selectedId);
            log.debug('Selected patient row found, extracting treatment ID...');

            // Thử các key có thể chứa treatment ID
            const tid = rowData.KHAMBENHID || rowData.KhamBenhID ||
                rowData.MADIEUTRI || rowData.MaDieuTri ||
                rowData.TIEPNHANID || rowData.TiepNhanID ||
                rowData.HOSOBENHANID || rowData.ID || '';

            log.debug('Treatment ID tìm được:', tid);
            return tid || null;
        } catch (e) {
            log.error('Lỗi lấy treatment ID:', e);
            return null;
        }
    }

    // ==========================================
    // FILTER RECENT DRUGS — chỉ giữ thuốc trong N ngày gần
    // Giảm tải cho bệnh nhân nằm viện lâu ngày
    // ==========================================
    function filterRecentDrugs(drugs, days) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        cutoff.setHours(0, 0, 0, 0); // Từ đầu ngày cách đây N ngày

        return drugs.filter(drug => {
            const dateStr = drug.prescriptionDate || '';
            if (!dateStr) return true; // Giữ lại nếu không có ngày

            const parsed = parseVietnameseDate(dateStr);
            if (!parsed) return true; // Giữ lại nếu không parse được ngày

            return parsed >= cutoff;
        });
    }

    /**
     * Parse ngày VN: "19/03/2026", "2026-03-19", "19/03/2026 07:15:00"
     */
    function parseVietnameseDate(str) {
        str = String(str).trim();

        // dd/mm/yyyy hoặc dd/mm/yyyy hh:mm:ss
        const vnMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (vnMatch) {
            return new Date(parseInt(vnMatch[3]), parseInt(vnMatch[2]) - 1, parseInt(vnMatch[1]));
        }

        // yyyy-mm-dd
        const isoMatch = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (isoMatch) {
            return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        }

        // Thử Date.parse
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    // ==========================================
    // PARSE DRUG FROM API RESPONSE
    // ==========================================
    function parseDrugFromAPI(row) {
        // Log tất cả keys để debug
        log.debug('Drug row keys:', Object.keys(row).join(', '));

        const drug = {
            name: '',
            activeIngredient: '',
            prescriptionDate: '',
            usage: '',
            quantity: '',
            concentration: '',
            doctor: '',  // Bác sĩ chỉ định
            isIV: false,
            rawData: row // Giữ raw data để debug
        };

        // Parse — thử nhiều key khác nhau
        // Tên thuốc
        drug.name = row.TENDICHVU || row.TENTHUOC || row.TenThuoc || row.TEN || '';

        // Hoạt chất
        drug.activeIngredient = row.TENHOATCHAT || row.HOATCHAT || row.HoatChat || '';

        // Ngày kê đơn
        drug.prescriptionDate = row.NGAYDICHVU || row.NGAYKEDON || row.NgayKeDon || '';

        // Cách dùng / đường dùng
        drug.usage = row.SOLO_CACHDUNG || row.CACHDUNG || row.CachDung || row.DUONGDUNG || row.DuongDung ||
            row.CACH_DUNG || row.DUONG_DUNG || '';

        // Số lượng
        drug.quantity = row.SOLUONG || row.SoLuong || row.SLKEDON || row.SL || '';

        // Nồng độ / Hàm lượng / Nồng độ-Hàm lượng (NDHL chứa "dung tích 100ml")
        drug.concentration = row.NDHL || row.NDIEN_TH_DVT || row.NONGDO || row.NongDo || row.HAMLUONG || row.HamLuong ||
            row.NONGDOHAMLUONG || '';

        // Bác sĩ chỉ định
        drug.doctor = row.FULL_NAME || row.NGUOICHIDINH || row.NguoiChiDinh || row.BACSI || row.BacSi ||
            row.BSCHIDINH || row.BSChiDinh || row.TENBACSI || row.TenBacSi ||
            row.BS_CHI_DINH || row.NGUOI_CHI_DINH || '';

        // Fuzzy search nếu chưa tìm được
        if (!drug.name || !drug.usage) {
            for (const key of Object.keys(row)) {
                const uk = key.toUpperCase();
                const val = String(row[key] || '').trim();
                if (!val || val === '0' || val === 'null') continue;

                if (!drug.name && (uk.includes('TENDICHVU') || uk.includes('TENTHUOC') || uk.includes('TEN_THUOC'))) drug.name = val;
                if (!drug.activeIngredient && (uk.includes('HOATCHAT') || uk.includes('HOAT_CHAT'))) drug.activeIngredient = val;
                if (!drug.usage && (uk.includes('CACHDUNG') || uk.includes('CACH_DUNG') || uk.includes('DUONGDUNG'))) drug.usage = val;
                if (!drug.quantity && (uk.includes('SOLUONG') || uk.includes('SO_LUONG'))) drug.quantity = val;
                if (!drug.concentration && (uk.includes('HAMLUONG') || uk.includes('NONGDO'))) drug.concentration = val;
                if (!drug.doctor && (uk.includes('NGUOICHIDINH') || uk.includes('BACSI') || uk.includes('BS_CHI_DINH') || uk.includes('TENBACSI'))) drug.doctor = val;
            }
        }

        // Check IV (truyền tĩnh mạch)
        const usageLower = (drug.usage || '').toLowerCase();
        const nameLower = (drug.name || '').toLowerCase();
        drug.isIV = ['tiêm truyền tĩnh mạch', 'truyền tĩnh mạch', 'tiêm truyền']
            .some(kw => usageLower.includes(kw));

        if (drug.doctor) log.debug('  👨‍⚕️ BS chỉ định: [REDACTED]');

        return drug;
    }

    // ==========================================
    // PARSE DRUGS FROM DOM (Fallback cuối cùng)
    // ==========================================
    function parseDrugsFromDOM() {
        const drugs = [];

        // jqGrid tách header và body ra 2 bảng riêng
        const jqContainers = document.querySelectorAll('.ui-jqgrid');
        for (const container of jqContainers) {
            if (container.querySelector('#grdBenhNhan')) continue;

            const headerDiv = container.querySelector('.ui-jqgrid-hdiv');
            const bodyDiv = container.querySelector('.ui-jqgrid-bdiv');
            if (!headerDiv || !bodyDiv) continue;

            const headers = Array.from(headerDiv.querySelectorAll('th'))
                .map(th => (th.textContent || '').trim().toLowerCase());

            const isDrugTable = headers.some(h =>
                h.includes('thuốc') || h.includes('hoạt chất') || h.includes('cách dùng')
            );
            if (!isDrugTable) continue;

            const rows = bodyDiv.querySelectorAll('tbody tr');
            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td'))
                    .map(c => (c.textContent || '').trim());
                if (cells.length < 3) continue;

                const drug = { name: '', activeIngredient: '', prescriptionDate: '', usage: '', quantity: '', concentration: '', isIV: false };
                for (let i = 0; i < headers.length && i < cells.length; i++) {
                    const h = headers[i], v = cells[i];
                    if (h.includes('tên thuốc') || h.includes('tên')) drug.name = v;
                    else if (h.includes('hoạt chất')) drug.activeIngredient = v;
                    else if (h.includes('ngày')) drug.prescriptionDate = v;
                    else if (h.includes('cách')) drug.usage = v;
                    else if (h.includes('sl')) drug.quantity = v;
                    else if (h.includes('nồng') || h.includes('hàm')) drug.concentration = v;
                }
                if (drug.name) drugs.push(drug);
            }
            if (drugs.length > 0) break;
        }

        return drugs;
    }

    // ==========================================
    // BROADCAST DRUGS — Gửi thuốc cho content script
    // ==========================================
    function broadcastDrugs(drugs) {
        window.postMessage({
            type: 'QUYEN_DRUG_LIST_RESULT',
            drugs: drugs,
            count: drugs.length,
            source: 'auto-capture'
        }, window.location.origin);
    }

    // ==========================================
    // FETCH PATIENT INFO
    // ==========================================
    function fetchPatientInfo(rowId, requestId) {
        try {
            if (!_$) { sendResult('QUYEN_PATIENT_INFO_RESULT', { patient: {} }, requestId); return; }
            const grid = _$('#grdBenhNhan');
            if (!grid.length) { sendResult('QUYEN_PATIENT_INFO_RESULT', { patient: {} }, requestId); return; }
            const rowData = grid.jqGrid('getRowData', rowId);
            sendResult('QUYEN_PATIENT_INFO_RESULT', {
                patient: { id: rowId, hoTen: rowData.HOTEN || '', khambenhId: rowData.KHAMBENHID || '' }
            }, requestId);
        } catch (e) {
            sendResult('QUYEN_PATIENT_INFO_RESULT', { patient: {} }, requestId);
        }
    }

    // ==========================================
    // KEYBOARD SELECT VIA JQUERY
    // Tìm INPUT bằng marker (INPUT ổn định, không biến mất)
    // Trigger ArrowDown + Enter bằng jQuery $.Event
    // ==========================================
    function handleKeyboardSelect(inputMarker, itemIndex, requestId) {
        if (!_$) {
            log.warn('Keyboard select: no jQuery');
            sendResult('QUYEN_KEYBOARD_SELECT_RESULT', { success: false, error: 'no jQuery' }, requestId);
            return;
        }

        try {
            const el = findMarkedElement('data-quyen-input', inputMarker);
            if (!el) {
                log.warn('Keyboard select: input not found for marker', inputMarker);
                sendResult('QUYEN_KEYBOARD_SELECT_RESULT', { success: false, error: 'input not found' }, requestId);
                return;
            }

            const $input = _$(el);
            const idx = parseInt(itemIndex) || 0;

            log.debug('Keyboard select on:', $input.attr('id'), 'itemIndex=' + idx);

            // ★ APPROACH: Tìm dropdown items trực tiếp rồi click ★
            // Tìm trong tất cả documents (main, parent, top, iframes)
            function findDropdownItems() {
                const allDocs = [];
                try { allDocs.push(document); } catch (e) { }
                try { if (window.parent && window.parent.document !== document) allDocs.push(window.parent.document); } catch (e) { }
                try { if (window.top && window.top.document !== document && window.top.document !== (window.parent && window.parent.document)) allDocs.push(window.top.document); } catch (e) { }
                // Tìm trong iframes
                for (let di = 0; di < allDocs.length; di++) {
                    try {
                        const ifs = allDocs[di].querySelectorAll('iframe');
                        for (let fi = 0; fi < ifs.length; fi++) {
                            try { if (ifs[fi].contentDocument) allDocs.push(ifs[fi].contentDocument); } catch (e) { }
                        }
                    } catch (e) { }
                }

                const items = [];
                for (let d = 0; d < allDocs.length; d++) {
                    try {
                        const found = allDocs[d].querySelectorAll('.cg-colItem, .cg-comboltem, .cg-combottem, .cg-menu-item');
                        if (found.length > 0) {
                            for (let j = 0; j < found.length; j++) items.push(found[j]);
                        }
                    } catch (e) { }
                }
                return items;
            }

            // Chờ một chút cho dropdown ổn định rồi click
            setTimeout(function () {
                const items = findDropdownItems();
                if (items.length > 0 && idx < items.length) {
                    const target = items[idx];
                    log.debug('Direct click on dropdown item[' + idx + ']:', target.textContent.substring(0, 50));

                    // Dispatch native mouse events
                    try {
                        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    } catch (e) {
                        log.warn('Native click failed, trying jQuery click...');
                    }

                    // Thử jQuery click trên item luôn
                    try {
                        let $items = null;
                        // Tìm jQuery từ document chứa dropdown item
                        const itemDoc = target.ownerDocument;
                        const itemWin = itemDoc.defaultView;
                        if (itemWin && itemWin.jQuery) {
                            $items = itemWin.jQuery(target);
                        } else if (itemWin && itemWin.$ && itemWin.$.fn) {
                            $items = itemWin.$(target);
                        } else {
                            $items = _$(target);
                        }
                        if ($items) {
                            $items.trigger('mousedown');
                            $items.trigger('mouseup');
                            $items.trigger('click');
                            log.debug('jQuery click triggered on item');
                        }
                    } catch (e) {
                        log.warn('jQuery click error:', e.message);
                    }

                    log.debug('Keyboard select done ✅ (direct click)');
                    sendResult('QUYEN_KEYBOARD_SELECT_RESULT', { success: true }, requestId);
                } else {
                    // Fallback: ArrowDown + Enter
                    log.debug('No dropdown items found, trying ArrowDown+Enter fallback...');
                    const arrowCount = idx + 1;
                    $input.trigger('focus');
                    let i = 0;
                    function pressArrowDown() {
                        if (i >= arrowCount) {
                            setTimeout(function () {
                                $input.trigger(_$.Event('keydown', { keyCode: 13, which: 13, key: 'Enter' }));
                                $input.trigger(_$.Event('keypress', { keyCode: 13, which: 13, key: 'Enter' }));
                                $input.trigger(_$.Event('keyup', { keyCode: 13, which: 13, key: 'Enter' }));
                                sendResult('QUYEN_KEYBOARD_SELECT_RESULT', { success: true }, requestId);
                            }, 80);
                            return;
                        }
                        $input.trigger(_$.Event('keydown', { keyCode: 40, which: 40, key: 'ArrowDown' }));
                        i++;
                        setTimeout(pressArrowDown, 60);
                    }
                    pressArrowDown();
                }
            }, 400);
        } catch (e) {
            log.error('Keyboard select error:', e);
            sendResult('QUYEN_KEYBOARD_SELECT_RESULT', { success: false, error: e.message }, requestId);
        }
    }

    // ==========================================
    // TRIGGER SEARCH VIA JQUERY
    // Giả lập phím Shift để kích hoạt search của HIS sau khi gán value (paste)
    // ==========================================
    function handleTriggerSearch(inputMarker) {
        if (!_$) return;
        try {
            // ★ QUAN TRỌNG: Dùng Native JS thay vì jQuery để tránh lỗi cross-frame Sizzle engine
            const el = findMarkedElement('data-quyen-input', inputMarker);
            if (el) {
                const $input = _$(el);
                $input.trigger('focus');
                // Trigger change và keyup với keyCode 16 (Shift) để đánh thức HIS search
                $input.trigger('change');
                $input.trigger(_$.Event('keydown', { keyCode: 16, which: 16, key: 'Shift' }));
                $input.trigger(_$.Event('keyup', { keyCode: 16, which: 16, key: 'Shift' }));
                log.debug('Triggered search (Shift) on input', inputMarker);
            }
        } catch (e) {
            log.error('Trigger search error:', e);
        }
    }

    // ==========================================
    // TYPE TEXT — Giả lập gõ phím bằng NATIVE EVENT từ đúng window context của iframe
    // ==========================================
    function handleTypeText(inputMarker, text) {
        try {
            const el = findMarkedElement('data-quyen-input', inputMarker);
            if (!el) {
                log.warn('Type text: element not found for', inputMarker);
                return;
            }

            // ★ LẤY WINDOW CỦA IFRAME CHỨA ELEMENT ★
            // Đây là chìa khóa: event phải được tạo từ đúng window context
            // thì jQuery handlers trong iframe mới nhận ra!
            const elWin = el.ownerDocument.defaultView || window;

            el.focus();

            let i = 0;
            function typeChar() {
                if (i >= text.length) {
                    // Gõ xong → bấm ArrowDown để ép widget mở dropdown
                    const arrowEvt = new elWin.KeyboardEvent('keydown', {
                        keyCode: 40, which: 40, key: 'ArrowDown',
                        bubbles: true, cancelable: true
                    });
                    el.dispatchEvent(arrowEvt);
                    el.dispatchEvent(new elWin.KeyboardEvent('keyup', {
                        keyCode: 40, which: 40, key: 'ArrowDown',
                        bubbles: true, cancelable: true
                    }));
                    log.debug('Type text done for', inputMarker);
                    return;
                }
                
                const char = text[i];
                const kc = char.toUpperCase().charCodeAt(0);

                // Dispatch native events từ đúng iframe window
                el.dispatchEvent(new elWin.KeyboardEvent('keydown', {
                    keyCode: kc, which: kc, key: char,
                    bubbles: true, cancelable: true
                }));
                el.dispatchEvent(new elWin.KeyboardEvent('keypress', {
                    keyCode: kc, which: kc, key: char,
                    bubbles: true, cancelable: true
                }));
                
                // Cập nhật giá trị
                el.value = el.value + char;
                el.dispatchEvent(new elWin.Event('input', { bubbles: true }));
                
                el.dispatchEvent(new elWin.KeyboardEvent('keyup', {
                    keyCode: kc, which: kc, key: char,
                    bubbles: true, cancelable: true
                }));

                i++;
                setTimeout(typeChar, 50);
            }
            typeChar();
        } catch (e) {
            log.error('Type text error:', e);
        }
    }

    // ==========================================
    // COMBOGRID CLICK VIA JQUERY (legacy backup)
    // (tránh timing issue khi ComboGrid re-render)
    // ==========================================
    function handleComboGridClick(marker, requestId) {
        if (!_$) {
            log.warn('ComboGrid click: no jQuery');
            sendResult('QUYEN_COMBOGRID_CLICK_RESULT', { success: false, error: 'no jQuery' }, requestId);
            return;
        }

        try {
            // marker giờ là itemIndex (number)
            const itemIndex = parseInt(marker);

            // Tìm TẤT CẢ ComboGrid items hiện tại (tại thời điểm bridge xử lý)
            const $allItems = _$('.cg-combottem:visible, .cg-menu-item:visible');

            log.debug('ComboGrid click: tìm thấy', $allItems.length, 'items, cần index', itemIndex);

            if ($allItems.length === 0) {
                // Thử không dùng :visible
                const $allItems2 = _$('.cg-combottem, .cg-menu-item');
                log.debug('  Retry không :visible:', $allItems2.length, 'items');
                if ($allItems2.length === 0) {
                    log.warn('ComboGrid click: không có items nào!');
                    sendResult('QUYEN_COMBOGRID_CLICK_RESULT', { success: false, error: 'no items' }, requestId);
                    return;
                }
                doComboGridClick($allItems2, itemIndex, requestId);
                return;
            }

            doComboGridClick($allItems, itemIndex, requestId);
        } catch (e) {
            log.error('ComboGrid click error:', e);
            sendResult('QUYEN_COMBOGRID_CLICK_RESULT', { success: false, error: e.message }, requestId);
        }
    }

    function doComboGridClick($items, itemIndex, requestId) {
        if (itemIndex < 0 || itemIndex >= $items.length) {
            log.warn('Invalid item index:', itemIndex, 'total:', $items.length);
            // Fallback: click first item
            itemIndex = 0;
        }

        const $item = $items.eq(itemIndex);
        log.debug('ComboGrid jQuery click on item[' + itemIndex + ']:', $item.text().substring(0, 80));

        // Click trên .cg-colitem (child) — đây là nơi user click thủ công
        let $target = $item.find('.cg-colitem').first();
        if (!$target.length) $target = $item;

        log.debug('  Target:', $target[0].className || $target[0].tagName);

        // Trigger hover trước
        $target.trigger('mouseover').trigger('mouseenter');

        // Trigger click sequence
        setTimeout(function () {
            $target.trigger('mousedown');
            setTimeout(function () {
                $target.trigger('mouseup');
                $target.trigger('click');
                log.debug('ComboGrid jQuery click done ✅');
                sendResult('QUYEN_COMBOGRID_CLICK_RESULT', { success: true }, requestId);
            }, 30);
        }, 50);
    }

    // ==========================================
    // GENERIC SP CALL
    // ==========================================
    function callSP(spName, params, requestId) {
        try {
            if (!_jsonrpc) { sendResult('QUYEN_SP_RESULT', { error: 'no jsonrpc' }, requestId); return; }
            const paramStr = (typeof params === 'object') ? JSON.stringify(params) : params;
            const result = _jsonrpc.AjaxJson.ajaxCALL_SP_O(spName, paramStr, 0);
            let finalResult = result;
            try { if (typeof result === 'string') finalResult = JSON.parse(result); } catch (e) { }
            sendResult('QUYEN_SP_RESULT', { result: finalResult, spName }, requestId);
        } catch (e) {
            sendResult('QUYEN_SP_RESULT', { error: e.message, spName }, requestId);
        }
    }

    function sendResult(type, data, requestId) {
        window.postMessage({ type, ...data, requestId }, window.location.origin);
    }

    // ★ Polling phát hiện form đang mở — URL-based với key chính xác từ HIS
    (function watchFormFocus() {
        let _lastTab = null;

        function checkHref(href) {
            if (href.indexOf('NTU02D006') >= 0) return 'infusion';   // Phiếu truyền dịch
            if (href.indexOf('NTU02D204') >= 0) return 'caresheet';   // Phiếu chăm sóc
            return null;
        }

        function scanForms() {
            const level1 = document.querySelectorAll('iframe');
            for (let i = 0; i < level1.length; i++) {
                try {
                    // Bỏ qua iframe đang bị ẩn (display:none khi jBox đóng)
                    const rect = level1[i].getBoundingClientRect();
                    if (rect.width < 10 || rect.height < 10) continue;

                    const tab = checkHref(level1[i].contentWindow.location.href || '');
                    if (tab) {
                        if (_lastTab !== tab) {
                            _lastTab = tab;
                            window.postMessage({ type: 'QUYEN_FORM_FOCUSED', tab: tab }, location.origin);
                        }
                        return;
                    }
                    // Level 2 (nested iframes)
                    const level2 = level1[i].contentDocument.querySelectorAll('iframe');
                    for (let j = 0; j < level2.length; j++) {
                        try {
                            const tab2 = checkHref(level2[j].contentWindow.location.href || '');
                            if (tab2) {
                                if (_lastTab !== tab2) {
                                    _lastTab = tab2;
                                    window.postMessage({ type: 'QUYEN_FORM_FOCUSED', tab: tab2 }, location.origin);
                                }
                                return;
                            }
                        } catch (e) { }
                    }
                } catch (e) { }
            }
            // Không còn form → thu gọn (chỉ fire khi vừa chuyển từ có → không)
            if (_lastTab !== null) {
                _lastTab = null;
                window.postMessage({ type: 'QUYEN_FORM_CLOSED' }, location.origin);
            }
        }

        // Delay 3s sau khi trang load để tránh false trigger
        setTimeout(function () { setInterval(scanForms, 1500); }, 3000);
    })();

    window.postMessage({ type: 'QUYEN_BRIDGE_READY', status: 'ready' }, window.location.origin);
})();
