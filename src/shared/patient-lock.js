/**
 * HIS Shared — Patient Identity Lock v1.0
 * SAFETY (Sprint B): Đảm bảo không ghi nhầm bệnh nhân khi fill form.
 * Fail-closed: không đọc được context → BLOCK.
 *
 * Cách dùng:
 *   HIS.PatientLock.setSourceContext({ name, khambenhId, hosobenhanid, dob });
 *   var result = HIS.PatientLock.verify(targetContext);
 *   if (!result.ok) { BLOCK }
 */

window.HIS = window.HIS || {};

HIS.PatientLock = (function () {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    let _source = null; // BN đang chọn trên grid (nguồn)
    let _targetHint = null; // BN đang hiển trên form (được set bởi UI modules)
    let _lockActive = false;
    const _onChangeCallbacks = [];

    // ==========================================
    // NORMALIZE — chuẩn hóa text để so sánh
    // ==========================================
    function normalize(str) {
        if (!str) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ')         // nhiều space → 1
            .replace(new RegExp('[—–\\-/\\\\|]+', 'g'), ' ') // dấu gạch → space
            .replace(/\s+/g, ' ')
            .trim();
    }

    function removeAccents(str) {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    }

    /** So sánh tên BN (fuzzy — chấp nhận thiếu đệm) */
    function namesMatch(a, b) {
        const na = normalize(a);
        const nb = normalize(b);
        if (!na || !nb) return false;
        if (na === nb) return true;

        // Một bên chứa bên kia (VD: "NGUYỄN THỊ MỸ LỆ" vs "Nguyễn Thị Mỹ Lệ — 63 tuổi — Nữ")
        if (na.includes(nb) || nb.includes(na)) return true;
        
        // Bỏ dấu tiếng Việt để so sánh (VD: NGUYÊN == NGUYỄN)
        const naNoA = removeAccents(na);
        const nbNoA = removeAccents(nb);
        if (naNoA === nbNoA || naNoA.includes(nbNoA) || nbNoA.includes(naNoA)) return true;

        // So sánh từ: ≥70% từ khớp
        const wordsA = na.split(' ').filter(w => w.length > 1);
        const wordsB = nb.split(' ').filter(w => w.length > 1);
        if (wordsA.length === 0 || wordsB.length === 0) return false;

        const matched = wordsA.filter(w => wordsB.includes(w));
        const ratio = matched.length / Math.max(wordsA.length, wordsB.length);
        if (ratio >= 0.7) return true;
        
        const wNoA = naNoA.split(' ').filter(w => w.length > 1);
        const wNoB = nbNoA.split(' ').filter(w => w.length > 1);
        const matchedNoA = wNoA.filter(w => wNoB.includes(w));
        return (matchedNoA.length / Math.max(wNoA.length, wNoB.length)) >= 0.7;
    }

    /** So sánh ID (exact, sau khi trim) */
    function idsMatch(a, b) {
        const sa = String(a || '').trim();
        const sb = String(b || '').trim();
        if (!sa || !sb) return false;
        return sa === sb;
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Cập nhật BN nguồn (khi chọn BN trên grid)
     * @param {Object} patient - { name, khambenhId, hosobenhanid, dob, gender }
     */
    function setSourceContext(patient) {
        if (!patient) {
            _source = null;
            _lockActive = false;
            _targetHint = null;  // ★ FIX: Clear hint khi clear source
            _fireChange();
            return;
        }
        _source = {
            name: patient.name || '',
            khambenhId: patient.khambenhId || '',
            hosobenhanid: patient.hosobenhanid || '',
            dob: patient.dob || '',
            gender: patient.gender || ''
        };
        _lockActive = true;
        _targetHint = null;  // ★ FIX: Clear hint cũ khi đổi source — tránh merge dữ liệu BN cũ
        _fireChange();

        if (typeof HIS !== 'undefined' && HIS.Logger) {
            HIS.Logger.info('PatientLock', '🔒 Source context locked.');
        }
    }

    /**
     * Xóa context khi chuyển BN / đóng form
     */
    function clearSourceContext() {
        _source = null;
        _targetHint = null;
        _lockActive = false;
        _fireChange();
    }

    /**
     * Lấy BN nguồn hiện tại
     */
    function getSourceContext() {
        return _source ? Object.assign({}, _source) : null;
    }

    /**
     * Kiểm tra BN có được set chưa
     */
    function hasSource() {
        return _source !== null && _lockActive;
    }

    /**
     * Set target hint (từ UI module khi đã parse được BN từ form/title)
     * Dùng làm fallback khi readTargetFromDOM không truy cập được iframe
     */
    function setTargetHint(context) {
        if (!context) { _targetHint = null; return; }
        // Merge: giữ lại fields đầy đủ hơn từ hint cũ
        if (_targetHint) {
            // Chỉ ghi đè nếu data mới dài hơn hoặc cũ trống
            const merged = {};
            const keys = ['name', 'khambenhId', 'hosobenhanid', 'dob', 'gender'];
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const oldVal = _targetHint[k] || '';
                const newVal = (context[k] || '').toString();
                merged[k] = (newVal.length >= oldVal.length) ? newVal : oldVal;
            }
            _targetHint = merged;
        } else {
            _targetHint = {
                name: context.name || '',
                khambenhId: context.khambenhId || '',
                hosobenhanid: context.hosobenhanid || '',
                dob: context.dob || '',
                gender: context.gender || ''
            };
        }
    }

    /**
     * ★ VERIFY — So sánh source vs target
     * @param {Object|null} targetContext - { name, khambenhId, hosobenhanid, dob }
     *   Nếu null/thiếu → fail-closed
     * @returns {{ ok: boolean, reason: string, details: string }}
     */
    function verify(targetContext) {
        // 1. Không có source → BLOCK
        if (!_source || !_lockActive) {
            return {
                ok: false,
                reason: 'NO_SOURCE',
                details: 'Chưa chọn bệnh nhân. Hãy chọn BN trên danh sách trước.'
            };
        }

        // 2. Không có target → fail-closed BLOCK
        if (!targetContext) {
            return {
                ok: false,
                reason: 'NO_TARGET',
                details: 'Không đọc được thông tin BN trên form. Vui lòng kiểm tra lại.'
            };
        }

        // 3. Ưu tiên 1: Kiểm tra theo Mã BN (khambenhId) hoặc Mã BA (hosobenhanid)
        let hasIdMatch = false;
        let hasIdMismatch = false;

        if (_source.khambenhId && targetContext.khambenhId) {
            if (idsMatch(_source.khambenhId, targetContext.khambenhId)) {
                hasIdMatch = true;
            } else {
                hasIdMismatch = true;
            }
        }

        if (_source.hosobenhanid && targetContext.hosobenhanid) {
            if (idsMatch(_source.hosobenhanid, targetContext.hosobenhanid)) {
                hasIdMatch = true;
            } else {
                hasIdMismatch = true;
            }
        }

        if (hasIdMatch && !hasIdMismatch) {
            // Đã khớp ID chính xác -> không cần check tên nữa (Bỏ qua sai sót đánh máy)
            return {
                ok: true,
                reason: 'ID_MATCH',
                details: 'BN khớp (Xác nhận qua Mã BN/Mã BA).'
            };
        }

        if (hasIdMismatch) {
            return {
                ok: false,
                reason: 'ID_MISMATCH',
                details: '⚠️ BN KHÔNG KHỚP! Trường sai: Mã BN/Mã BA. Tạm khóa an toàn!'
            };
        }

        // 4. Ưu tiên 2 (Fallback): Nếu DOM target không có ID, so sánh Tên & Ngày sinh
        let matchCount = 0;
        let checkCount = 0;
        const mismatchFields = [];

        // Check name
        if (_source.name && targetContext.name) {
            checkCount++;
            if (namesMatch(_source.name, targetContext.name)) {
                matchCount++;
            } else {
                mismatchFields.push('name');
            }
        }

        // Check DOB (hỗ trợ so sánh năm sinh khi chỉ có năm)
        if (_source.dob && targetContext.dob) {
            checkCount++;
            const srcDob = normalize(_source.dob);
            const tgtDob = normalize(targetContext.dob);
            if (srcDob === tgtDob || srcDob.includes(tgtDob) || tgtDob.includes(srcDob)) {
                matchCount++;
            } else {
                mismatchFields.push('dob');
            }
        }

        // Đánh giá fallback
        // Fail-closed: nếu không có ID thì phải có tối thiểu 2 trường fallback (name + dob)
        if (checkCount < 2) {
            return {
                ok: false,
                reason: 'INSUFFICIENT_DATA',
                details: 'Không đủ thông tin để xác nhận BN. Cần ít nhất Tên + Ngày sinh khi thiếu Mã BN/Mã BA.'
            };
        }

        if (mismatchFields.length > 0) {
            return {
                ok: false,
                reason: 'CTX_MISMATCH',
                details: '⚠️ BN KHÔNG KHỚP! Trường sai: ' + mismatchFields.join(', ') + '. Kiểm tra lại đúng BN chưa?'
            };
        }

        return {
            ok: true,
            reason: 'MATCH',
            details: 'BN khớp (' + matchCount + '/' + checkCount + ' trường fallback).'
        };
    }

    // ==========================================
    // CHANGE CALLBACKS
    // ==========================================
    function onChange(callback) {
        if (typeof callback === 'function') {
            _onChangeCallbacks.push(callback);
        }
    }

    function _fireChange() {
        for (let i = 0; i < _onChangeCallbacks.length; i++) {
            try { _onChangeCallbacks[i](_source, _lockActive); } catch (e) { /* ignore */ }
        }
    }

    // ==========================================
    // EXTRACT TARGET CONTEXT FROM DOM
    // Đọc thông tin BN từ form/iframe hiện tại
    // ==========================================

    /**
     * ★ FIX v4: Kiểm tra text node có nằm trong element visible hay không
     * Quét ngược lên parent chain, kiểm tra display/visibility/opacity.
     * VNPT HIS ẩn tab bằng CSS (display:none, visibility:hidden) trên DIV,
     * không phải bằng iframe — nên phải check từng text node.
     */
    function _isNodeVisible(textNode) {
        let el = textNode.parentElement;
        if (!el) return true;
        try {
            const win = el.ownerDocument && el.ownerDocument.defaultView;
            if (!win) return true; // Không có window → assume visible
            // Đi ngược lên tối đa 15 cấp (đủ cho HIS tab nesting)
            let depth = 0;
            while (el && depth < 15) {
                // Fast check: inline style
                if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) {
                    return false;
                }
                // Computed style check (chính xác hơn, bắt cả CSS class)
                try {
                    const cs = win.getComputedStyle(el);
                    if (cs.display === 'none' || cs.visibility === 'hidden') {
                        return false;
                    }
                } catch (e) { /* ignore */ }
                el = el.parentElement;
                depth++;
            }
        } catch (e) { /* cross-origin or error */ }
        return true;
    }

    /**
     * ★ Đọc thông tin BN từ form đang mở
     * Tìm trong title bars, headers, iframes
     * ★ FIX v4: Chỉ lấy text từ VISIBLE elements — bỏ qua tab ẩn
     * @returns {Object|null} { name, khambenhId, hosobenhanid, dob }
     */
    function readTargetFromDOM() {
        const docs = _getAllDocuments();
        const candidates = [];

        function toSafeStr(v) {
            return String(v || '').trim();
        }

        function pushCandidate(source, ctx) {
            const c = {
                source: source,
                name: toSafeStr(ctx.name),
                dob: toSafeStr(ctx.dob),
                khambenhId: toSafeStr(ctx.khambenhId),
                hosobenhanid: toSafeStr(ctx.hosobenhanid)
            };
            if (!c.name && !c.dob && !c.khambenhId && !c.hosobenhanid) return;
            candidates.push(c);
        }

        for (let d = 0; d < docs.length; d++) {
            try {
                const doc = docs[d];
                let careName = '', careDob = '';
                const careGender = '';
                let infName = '', infDob = '', infHsba = '';

                // Pattern 1 & 2: Quét text nodes — CHỈ lấy từ elements đang visible
                const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                    const text = walker.currentNode.textContent || '';

                    // Pattern 1: Care sheet title — "HIS-Thêm phiếu (TRẦN THỊ NHƯ Ý/ 2001/ Nữ)"
                    const csMatch = text.match(/(?:HIS|Tạo Phiếu)[^(]*\(([^/)]+)\s*\/\s*([^/)]+)?\s*\//i);
                    if (csMatch && !careName) {
                        // ★ FIX v4: Kiểm tra visibility trước khi chấp nhận
                        if (!_isNodeVisible(walker.currentNode)) continue;
                        careName = (csMatch[1] || '').trim();
                        careDob = (csMatch[2] || '').trim();
                    }

                    // Pattern 2: Header — "2603171231 | NGUYỄN THỊ MỸ LỆ | 01/01/1963"
                    const infMatch = text.match(/(\d{10})\s*\|\s*([A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ\s]+)\s*\|\s*(\d{2}\/\d{2}\/\d{4})/);
                    if (infMatch) {
                        // ★ FIX v4: Kiểm tra visibility trước khi chấp nhận
                        if (!_isNodeVisible(walker.currentNode)) continue;
                        if (!infHsba) infHsba = infMatch[1].trim();
                        if (!infName) infName = infMatch[2].trim();
                        if (!infDob) infDob = infMatch[3].trim();
                    }
                }

                if (careName || careDob || careGender) {
                    pushCandidate('care_title', {
                        name: careName,
                        dob: careDob,
                        gender: careGender
                    });
                }
                if (infName || infDob || infHsba) {
                    pushCandidate('infusion_header', {
                        name: infName,
                        dob: infDob,
                        hosobenhanid: infHsba
                    });
                }

                // Pattern 3: jqGrid selected row — lấy KHAMBENHID từ rowData
                // Lưu ý: Pattern này chỉ hoạt động trong page context (his-bridge),
                // KHÔNG hoạt động trong content script (isolated world, không có jQuery)
                try {
                    const grid = doc.querySelector('#grdBenhNhan');
                    if (grid) {
                        const jq = doc.defaultView && (doc.defaultView.jQuery || doc.defaultView.$);
                        if (jq && typeof jq(grid).jqGrid === 'function') {
                            const selRow = jq(grid).jqGrid('getGridParam', 'selrow');
                            if (selRow) {
                                const rd = jq(grid).jqGrid('getRowData', selRow);
                                if (rd) {
                                    pushCandidate('grid_selected', {
                                        khambenhId: rd.KHAMBENHID || rd.KhamBenhID || rd.MABENHNHAN || '',
                                        hosobenhanid: rd.HOSOBENHANID || rd.HoSoBenhAnID || rd.MABENHAN || '',
                                        name: rd.HOTEN || rd.HoTen || rd.TENBENHNHAN || '',
                                        dob: rd.NGAYSINH || rd.NgaySinh || ''
                                    });
                                }
                            }
                        }
                    }
                } catch (e) { /* grid not available */ }

            } catch (e) { /* cross-origin or other error */ }
        }

        if (candidates.length === 0) {
            return null; // Fail-closed
        }

        // ★ FIX v3: Grid luôn phản ánh BN hiện tại.
        // Nếu grid candidate tồn tại VÀ care_title/infusion_header có tên KHÁC grid → loại bỏ stale iframe.
        const gridCandidate = candidates.filter(function(c) { return c.source === 'grid_selected'; })[0];
        let filtered = candidates;
        if (gridCandidate && gridCandidate.name) {
            filtered = candidates.filter(function(c) {
                if (c.source === 'grid_selected') return true;
                // Giữ care_title/infusion_header chỉ khi tên khớp với grid (= cùng BN)
                if (c.source === 'care_title' || c.source === 'infusion_header') {
                    if (c.name && !namesMatch(c.name, gridCandidate.name)) {
                        return false; // Stale iframe — loại bỏ
                    }
                }
                return true;
            });
        }

        // Scoring: ưu tiên grid_selected (luôn chính xác) > care_title > infusion_header
        function scoreCandidate(c) {
            let score = 0;
            if (c.source === 'grid_selected') score += 200;
            if (c.source === 'care_title' || c.source === 'infusion_header') score += 50;
            if (c.khambenhId) score += 40;
            if (c.hosobenhanid) score += 40;
            if (c.name) score += 10;
            if (c.dob) score += 10;
            return score;
        }
        filtered.sort(function (a, b) { return scoreCandidate(b) - scoreCandidate(a); });
        const best = filtered[0];
        return {
            name: best.name || '',
            khambenhId: best.khambenhId || '',
            hosobenhanid: best.hosobenhanid || '',
            dob: best.dob || ''
        };
    }

    /** Collect all documents (top + iframes, 2 levels) */
    function _getAllDocuments() {
        const docs = [document];
        try {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                // Bỏ qua iframe ẩn (background tabs) - Cập nhật cách bắt vị trí cực mạnh
                const rect = iframes[i].getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0 || iframes[i].style.visibility === 'hidden' || iframes[i].style.display === 'none') continue;

                try {
                    const iDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iDoc) {
                        docs.push(iDoc);
                        const subIframes = iDoc.querySelectorAll('iframe');
                        for (let j = 0; j < subIframes.length; j++) {
                            const subRect = subIframes[j].getBoundingClientRect();
                            if (subRect.width === 0 || subRect.height === 0 || subIframes[j].style.visibility === 'hidden' || subIframes[j].style.display === 'none') continue;
                            try {
                                const sDoc = subIframes[j].contentDocument || subIframes[j].contentWindow.document;
                                if (sDoc) docs.push(sDoc);
                            } catch (e) { /* cross-origin */ }
                        }
                    }
                } catch (e) { /* cross-origin */ }
            }
        } catch (e) { /* access denied */ }
        return docs;
    }

    /**
     * CONVENIENCE: verify against current DOM (với fallback targetHint)
     * ★ FIX v3: Nếu không đọc được target (không có form nào mở), trả OK luôn
     * vì không có gì để so sánh. Chỉ cảnh báo khi THỰC SỰ đọc được form khác BN.
     */
    function verifyCurrentForm() {
        let target = readTargetFromDOM();
        // Fallback: dùng targetHint từ UI module nếu DOM reading thất bại
        if (!target && _targetHint) {
            target = _targetHint;
        }
        // ★ FIX v3: Nếu hoàn toàn không có target → không có form nào mở
        // → Không có gì để mismatch → trả OK (thay vì fail-closed gây false alarm)
        if (!target) {
            return {
                ok: true,
                reason: 'NO_FORM',
                details: 'Không có form nào đang mở. BN từ danh sách được chấp nhận.'
            };
        }
        // ★ FIX v3: Nếu target khớp với source (đang chọn trong danh sách), short-circuit OK
        if (_source && target.name && namesMatch(target.name, _source.name)) {
            return { ok: true, reason: 'MATCH_SHORT_CIRCUIT', details: 'BN khớp (short-circuit).' };
        }
        // Merge có điều kiện: chỉ merge hint khi cùng BN theo tên, tránh trộn context chéo BN
        if (target && _targetHint) {
            const targetHasAnyId = !!(target.khambenhId || target.hosobenhanid);
            const canMerge = (!target.name && !targetHasAnyId)
                || (!targetHasAnyId && !!target.name && !!_targetHint.name && namesMatch(target.name, _targetHint.name));
            if (canMerge) {
                if (!target.name && _targetHint.name) target.name = _targetHint.name;
                if (!target.khambenhId && _targetHint.khambenhId) target.khambenhId = _targetHint.khambenhId;
                if (!target.hosobenhanid && _targetHint.hosobenhanid) target.hosobenhanid = _targetHint.hosobenhanid;
                if (!target.dob && _targetHint.dob) target.dob = _targetHint.dob;
            }
        }
        return verify(target);
    }

    // ==========================================
    // EXPOSE
    // ==========================================
    return {
        setSourceContext,
        clearSourceContext,
        getSourceContext,
        hasSource,
        setTargetHint,
        verify,
        verifyCurrentForm,
        readTargetFromDOM,
        onChange
    };
})();

console.log('[HIS] 🔒 PatientLock v1.0 loaded');
