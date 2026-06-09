/**
 * __EXT_EMOJI__ __EXT_NAME__ — Infusion Filler
 * Tự động điền form truyền dịch
 * 
 * v5.0: 
 * - ComboGrid autocomplete cho cả 3 trường: Thuốc, BS, Y tá
 * - Reusable comboGridAutoSelect() — giải pháp chuẩn cho HIS ComboGrid widget
 * - Sequential flow: Drug → Speed/Qty → Doctor → Nurse
 * - Iframe-aware: dùng _formDoc cho tất cả DOM queries
 */

/* global QuyenLog, MouseEvent, QuyenUI */
/* exported QuyenInfusionFiller */

const QuyenInfusionFiller = (function () {

    // Module-level state
    let _currentParsedInfo = null;
    let _currentDrug = null;
    let _formDoc = null;  // Document chứa form (có thể là iframe doc)
    let _formRoot = null;  // ★ Element gốc chứa form (để tránh tìm nhầm form cũ)
    let _fillSessionId = 0;  // ★ Session ID để cancel stale callbacks
    let _cachedDocs = null;  // ★ BUG-20: Cache getAllDocuments per session
    let _cachedDocsSessionId = 0;
    let _activeTimeouts = [];
    let _activeContext = null;
    let _fillStartTime = 0;

    function safeSetTimeout(fn, delay) {
        const id = setTimeout(function () {
            _activeTimeouts = _activeTimeouts.filter(function (t) { return t !== id; });
            fn();
        }, delay);
        _activeTimeouts.push(id);
        return id;
    }

    function clearAllTimers() {
        QuyenLog.info(`  🧹 Clearing ${_activeTimeouts.length} active timers`);
        _activeTimeouts.forEach(function (id) {
            clearTimeout(id);
        });
        _activeTimeouts = [];
    }

    function clearInputMarkers() {
        try {
            const docs = getAllDocuments();
            docs.forEach(function (d) {
                try {
                    const markedInputs = d.querySelectorAll('[data-quyen-input]');
                    markedInputs.forEach(function (el) {
                        el.removeAttribute('data-quyen-input');
                        QuyenLog.info('  🧹 Removed data-quyen-input marker from element:', el.id || el.name || 'input');
                    });
                } catch (e) { /* ignore */ }
            });
        } catch (e) { /* ignore */ }
    }

    function cancel(reason) {
        reason = reason || 'USER_CANCEL';
        QuyenLog.info(`🛑 QuyenInfusionFiller.cancel called with reason: ${reason}`);
        _fillSessionId++;
        clearAllTimers();
        clearInputMarkers();
        _currentDrug = null;
        _currentParsedInfo = null;
        _formDoc = null;
        _formRoot = null;

        if (_fillStartTime > 0) {
            const durationMs = Date.now() - _fillStartTime;
            _fillStartTime = 0;
            if (typeof HIS !== 'undefined' && HIS.PerfMetrics) {
                HIS.PerfMetrics.log({
                    module: 'infusion',
                    step: 'fillForm',
                    durationMs: durationMs,
                    result: 'cancelled',
                    fallbackUsed: false,
                    timeout: reason === 'TIMEOUT',
                    staleDropped: reason === 'STALE' || reason === 'USER_CANCEL' || reason === 'CANCEL'
                });
            }
        }

        if (typeof HIS !== 'undefined') {
            HIS.OperationContext.cancel(reason || 'USER_CANCEL');
            _activeContext = null;
            if (HIS.FillTracker) {
                HIS.FillTracker.cancel(reason);
            }
        }
        return true;
    }

    // ==========================================
    // ROMAN NUMERAL → ARABIC
    // ==========================================
    const ROMAN_MAP = {
        'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000
    };

    function romanToArabic(roman) {
        roman = roman.toUpperCase().trim();
        let result = 0;
        for (let i = 0; i < roman.length; i++) {
            const curr = ROMAN_MAP[roman[i]] || 0;
            const next = ROMAN_MAP[roman[i + 1]] || 0;
            result += (curr < next) ? -curr : curr;
        }
        return result;
    }

    function arabicToRoman(num) {
        num = parseInt(num);
        if (num <= 0 || num > 3999) return String(num);
        const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
        const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
        let result = '';
        for (let i = 0; i < vals.length; i++) {
            while (num >= vals[i]) {
                result += syms[i];
                num -= vals[i];
            }
        }
        return result;
    }

    // ★ Tùy chọn hiển thị tốc độ: La Mã hoặc Ả Rập
    let _useRomanSpeed = false;

    function setUseRomanSpeed(val) { _useRomanSpeed = !!val; }
    function getUseRomanSpeed() { return _useRomanSpeed; }

    // ==========================================
    // ★ COMBOGRID AUTO-SELECT — Reusable ★
    // Giải pháp chuẩn cho HIS ComboGrid widget:
    //   1. Focus + clear input
    //   2. Gõ từng ký tự (mô phỏng user)
    //   3. Chờ .cg-combottem xuất hiện
    //   4. Tìm row khớp matchTexts
    //   5. Click row → callback
    // ==========================================



    /**
     * @param {Object} options
     * @param {Document} options.doc - Document context (iframe hoặc main)
     * @param {HTMLInputElement} options.inputEl - Input element để gõ
     * @param {string} options.searchTerm - Text để gõ (3-5 ký tự đầu)
     * @param {string[]} options.matchTexts - Mảng text để so khớp trong dropdown
     * @param {function(boolean):void} options.onComplete - Callback khi xong
     * @param {string} [options.label] - Tên field cho logging
     */
    function comboGridAutoSelect(options) {
        const { doc, inputEl, searchTerm, matchTexts, onComplete, label } = options;
        const fieldName = label || 'ComboGrid';

        QuyenLog.info(`  🔍 [${fieldName}] Gõ "${searchTerm}"...`);

        // Bước 1: Focus + clear
        inputEl.focus();
        inputEl.click();
        inputEl.value = '';
        triggerEvent(inputEl, 'input');

        // Bước 2: Gõ từng ký tự
        typeTextSlowly(inputEl, searchTerm, function () {
            QuyenLog.info(`  ⌨️ [${fieldName}] Đã gõ xong, chờ dropdown...`);

            // Bước 3: Chờ ComboGrid dropdown → xác định index → ArrowDown + Enter
            waitForComboGrid(doc, inputEl, matchTexts, fieldName, 0, function (found, err) {
                setTimeout(function() {
                    try { inputEl.blur(); } catch(e) {}
                }, 100);
                if (onComplete) onComplete(found, err);
            });
        });
    }

    /**
     * Chờ ComboGrid dropdown xuất hiện, tìm best match index,
     * rồi dùng jQuery ArrowDown + Enter trên INPUT
     */
    const latencyHistory = [];
    function getP95Latency() {
        if (latencyHistory.length === 0) return 150;
        const sorted = [...latencyHistory].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.95);
        return sorted[idx] || 150;
    }

    function observeElement(searchDocs, targetSelector, callback, timeoutMs) {
        let finished = false;
        let timeoutId = null;
        let backupPollId = null;
        const observers = [];

        function cleanup() {
            if (finished) return;
            finished = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (backupPollId) clearInterval(backupPollId);
            observers.forEach(obs => {
                try { obs.disconnect(); } catch(e) {}
            });
        }

        function check() {
            if (finished) return;
            let foundItems = [];
            for (let i = 0; i < searchDocs.length; i++) {
                try {
                    const doc = searchDocs[i];
                    const items = doc.querySelectorAll(targetSelector);
                    if (items.length > 0) {
                        foundItems = foundItems.concat(Array.from(items));
                    }
                } catch (e) {}
            }
            if (foundItems.length > 0) {
                cleanup();
                callback(foundItems);
                return true;
            }
            return false;
        }

        if (check()) return cleanup;

        for (let i = 0; i < searchDocs.length; i++) {
            try {
                const doc = searchDocs[i];
                const targetNode = doc.body || doc.documentElement;
                if (!targetNode) continue;
                
                const observer = new MutationObserver(() => {
                    check();
                });
                observer.observe(targetNode, { childList: true, subtree: false });
                observers.push(observer);
            } catch (e) {}
        }

        backupPollId = setInterval(check, 500);

        timeoutId = setTimeout(() => {
            if (finished) return;
            if (!check()) {
                cleanup();
                callback([], new Error('Timeout waiting for selector: ' + targetSelector));
            }
        }, timeoutMs || 10000);

        return cleanup;
    }

    function waitForComboGrid(doc, inputEl, matchTexts, fieldName, attempt, callback) {
        const startTime = Date.now();
        const searchDocs = [doc];
        try {
            if (window.parent && window.parent.document) searchDocs.push(window.parent.document);
            if (window.top && window.top.document) searchDocs.push(window.top.document);
        } catch (e) {}

        const p95 = getP95Latency();
        const timeoutMs = Math.min(10000, Math.max(5000, p95 * 3));

        const cleanup = observeElement(searchDocs, '.cg-colItem, .cg-comboltem, .cg-combottem, .cg-menu-item', function (items, err) {
            if (err || !items || items.length === 0) {
                QuyenLog.warn(`  ⏰ [${fieldName}] Dropdown không xuất hiện hoặc bị timeout`);
                if (callback) callback(false);
                return;
            }

            const elapsed = Date.now() - startTime;
            latencyHistory.push(elapsed);
            if (latencyHistory.length > 20) latencyHistory.shift();

            if (typeof HIS !== 'undefined' && HIS.PerfMetrics) {
                HIS.PerfMetrics.record('observe', '.cg-colItem, .cg-comboltem, .cg-combottem, .cg-menu-item', elapsed);
            }

            QuyenLog.info(`  ✅ [${fieldName}] ComboGrid dropdown! (${items.length} items)`);

            // Log items
            items.forEach(function (item, i) {
                if (i < 5) {
                    const cells = item.querySelectorAll('.cg-DivItem');
                    const texts = Array.from(cells)
                        .filter(function (c) { return c.style.display !== 'none' && c.offsetWidth > 0; })
                        .map(function (c) { return c.textContent.trim(); });
                    QuyenLog.info(`    [${i}] ${texts.join(' | ')}`);
                }
            });

            // Tìm best match index
            const bestIndex = findBestMatchIndex(items, matchTexts, fieldName);

            if (bestIndex === -1) {
                if (callback) callback(false, 'DRUG_NOT_FOUND');
                return;
            }
            if (bestIndex === -2) {
                if (callback) callback(false, 'AMBIGUOUS_MATCH');
                return;
            }

            // Capture thể tích từ item text (nếu là Thuốc)
            if (_currentParsedInfo && !_currentParsedInfo.quantityML && fieldName === 'Thuốc' && bestIndex < items.length) {
                captureQuantityFromItem(items[bestIndex]);
            }

            // ★ DIRECT CLICK APPROACH — Click item trực tiếp từ content script ★
            const targetItem = items[bestIndex];
            QuyenLog.info(`  🖱️ [${fieldName}] Direct click item[${bestIndex}]: "${targetItem.textContent.substring(0, 50)}"`);

            // Approach 1: Click trên .cg-DivItem bên trong (click target thực sự)
            const innerDivs = targetItem.querySelectorAll('.cg-DivItem');
            let clickTarget = targetItem;
            for (let ci = 0; ci < innerDivs.length; ci++) {
                if (innerDivs[ci].offsetWidth > 0 && innerDivs[ci].style.display !== 'none') {
                    clickTarget = innerDivs[ci];
                    break;
                }
            }

            // Native mouse events
            clickTarget.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

            // Approach 2: jQuery click từ window chứa dropdown
            try {
                const itemWin = (targetItem.ownerDocument && targetItem.ownerDocument.defaultView) || window;
                const jq = itemWin.jQuery || itemWin.$ || (window.parent && window.parent.jQuery) || (window.top && window.top.jQuery);
                if (jq) {
                    jq(clickTarget).trigger('mousedown').trigger('mouseup').trigger('click');
                    jq(targetItem).trigger('mousedown').trigger('mouseup').trigger('click');
                    QuyenLog.info(`  🖱️ [${fieldName}] jQuery click triggered`);
                }
            } catch (e) { /* ignore */ }

            // Approach 3: Fallback — bridge keyboard select
            safeSetTimeout(function () {
                selectByKeyboard(inputEl, bestIndex, fieldName, callback);
            }, 200);
        }, timeoutMs);
    }

    /**
     * Tìm index của item khớp nhất
     */
    function findBestMatchIndex(items, matchTexts, fieldName) {
        const matchLower = matchTexts.map(function (t) { return t.toLowerCase().trim(); });
        let bestIndex = -1;
        let bestScore = -1;
        let secondBestScore = -1;

        for (let idx = 0; idx < items.length; idx++) {
            const itemText = (items[idx].textContent || '').toLowerCase();
            let score = 0;

            for (const mt of matchLower) {
                if (!mt) continue;
                if (itemText === mt) { score = 100; break; }
                if (itemText.includes(mt)) score = Math.max(score, 50 + mt.length);
                const words = mt.split(/\s+/).filter(function (w) { return w.length > 1; });
                const matched = words.filter(function (w) { return itemText.includes(w); });
                if (matched.length > 0) score = Math.max(score, 10 + (matched.length / words.length) * 30);
            }

            if (score > bestScore) {
                secondBestScore = bestScore;
                bestScore = score;
                bestIndex = idx;
            } else if (score > secondBestScore) {
                secondBestScore = score;
            }
        }

        // Ngưỡng an toàn tối thiểu (score >= 15)
        if (bestScore < 15) {
            QuyenLog.warn(`  ⚠️ [${fieldName}] Không tìm thấy thuốc khớp (bestScore=${bestScore} < 15)`);
            return -1;
        }

        // Kiểm tra trùng lặp/nhập nhằng (difference < 10)
        if (secondBestScore >= 15 && (bestScore - secondBestScore) < 10) {
            QuyenLog.warn(`  ⚠️ [${fieldName}] Trùng lặp/nhập nhằng thuốc (bestScore=${bestScore}, secondBestScore=${secondBestScore})`);
            return -2; // Báo lỗi AMBIGUOUS_MATCH
        }

        QuyenLog.info(`  🎯 [${fieldName}] Best match: item[${bestIndex}] (score=${bestScore})`);
        return bestIndex;
    }

    function captureQuantityFromItem(item) {
        const itemText = (item.textContent || '');
        const dungTichMatch = itemText.match(/dung\s*t[iíì]ch\s*(\d+)\s*ml/i);
        if (dungTichMatch && parseInt(dungTichMatch[1]) >= 5) {
            _currentParsedInfo.quantityML = dungTichMatch[1];
            QuyenLog.info(`  💧 Thể tích: ${_currentParsedInfo.quantityML}ml`);
            return;
        }
        const mlMatches = itemText.match(/(\d+)\s*ml/gi);
        if (mlMatches) {
            for (const m of mlMatches) {
                const val = parseInt(m);
                if (val >= 50 && val <= 2000) {
                    _currentParsedInfo.quantityML = String(val);
                    QuyenLog.info(`  💧 Thể tích: ${_currentParsedInfo.quantityML}ml`);
                    break;
                }
            }
        }
    }

    /**
     * ★ CHỌN BẰNG KEYBOARD — ArrowDown + Enter via BRIDGE ★
     * 
     * CSP chặn inline script → dùng bridge (his-bridge.js)
     * Bridge tìm INPUT bằng data-attribute marker (INPUT ổn định, không biến mất)
     * Bridge dùng jQuery $.Event('keydown') để trigger ArrowDown + Enter
     */
    function selectByKeyboard(inputEl, itemIndex, fieldName, callback) {
        // Đánh dấu input — INPUT luôn tồn tại (không biến mất như dropdown items)
        const inputMarker = 'quyen_input_' + Date.now();
        inputEl.setAttribute('data-quyen-input', inputMarker);

        QuyenLog.info(`  ⌨️ [${fieldName}] Bridge keyboard select item[${itemIndex}] (ArrowDown×${itemIndex + 1} + Enter)`);

        // Gửi cho bridge — bridge tìm INPUT bằng marker, dùng jQuery trigger
        postToBridge({
            type: 'QUYEN_KEYBOARD_SELECT',
            inputMarker: inputMarker,
            itemIndex: itemIndex,
            requestId: 'kb_' + Date.now()
        });

        // Chờ bridge xử lý keyboard + widget update
        const waitTime = 300 + (itemIndex + 1) * 80 + 300;
        safeSetTimeout(function () {
            try { inputEl.removeAttribute('data-quyen-input'); } catch (e) { /* ignore */ }
            QuyenLog.info(`  ✅ [${fieldName}] ComboGrid selection hoàn tất`);
            if (callback) {
                safeSetTimeout(function () { callback(true); }, 300);
            }
        }, Math.max(waitTime, 800));
    }

    // ==========================================
    // FILL FORM — Entry point
    // ==========================================
    function fillForm(drug) {
        _fillStartTime = Date.now();
        // ★ TĂNG SESSION ID — cancel mọi callback cũ ★
        _fillSessionId++;
        const mySession = _fillSessionId;
        QuyenLog.info(`📝 Đang điền form cho: ${drug.name} (session #${mySession})`);

        // ★ SPRINT D: FillTracker start
        if (typeof HIS !== 'undefined' && HIS.FillTracker) {
            HIS.FillTracker.start(drug);
        }

        let context;
        try {
            context = HIS.OperationContext.create('infusion');
            HIS.WriteVerifier.preWriteGuard(context);
        } catch (err) {
            if (typeof HIS !== 'undefined' && HIS.FillTracker) {
                HIS.FillTracker.block(err.message);
            }
            QuyenLog.error(`[preWriteGuard] blocked: ${err.message}`);
            return { success: false, error: err.message };
        }

        _activeContext = context;
        if (typeof HIS !== 'undefined' && HIS.FillTracker) {
            HIS.FillTracker.transitionTo(HIS.FillTracker.STATE.WRITING);
        }

        // ★ RESET STATE trước khi điền form mới ★
        _formDoc = null;
        _formRoot = null;
        _currentDrug = null;
        _currentParsedInfo = null;
        _cachedDocs = null;  // ★ BUG-20: Reset cache
        _cachedDocsSessionId = mySession;

        const searchInput = findDrugSearchInput();
        if (searchInput) {
            return doFillForm(searchInput, drug, mySession);
        }

        QuyenLog.info('⏳ Ô tìm kiếm thuốc chưa xuất hiện, đang chờ...');
        waitAndFill(drug, 0, mySession);
        return { success: true, filledCount: 1, drug: drug.name, pending: true };
    }

    function doFillForm(searchInput, drug, sessionId) {
        // ★ CHECK SESSION — nếu bị cancel thì dừng
        if (sessionId !== _fillSessionId) {
            QuyenLog.warn(`  ⛔ Session #${sessionId} đã bị cancel (current: #${_fillSessionId})`);
            return { success: false, error: 'cancelled' };
        }
        // ★ LƯU DOCUMENT + FORM ROOT CONTEXT ★
        _formDoc = searchInput.ownerDocument || document;
        // Tìm container gốc của form (tránh nhầm form cũ ẩn)
        _formRoot = searchInput.closest('div[id*="divDlg"], div[id*="Dlg"], .jboxContent, .ui-dialog-content, div[class*="phieu"], form')
            || searchInput.closest('div[style*="display: block"], div[style*="visibility: visible"]')
            || searchInput.closest('table')?.parentElement
            || _formDoc;
        QuyenLog.info(`  📄 Form context: ${_formDoc === document ? 'main' : 'IFRAME'}, root: ${_formRoot.tagName}#${_formRoot.id || '?'}`);

        _currentDrug = drug;
        const parsedInfo = parseUsageInfo(drug);
        _currentParsedInfo = parsedInfo;
        QuyenLog.info('📊 Thông tin trích xuất:', parsedInfo);

        // Bắt đầu flow: Drug → Speed/Qty → Doctor → Nurse
        // ★ BUG-01: Truyền sessionId xuyên suốt async chain
        startDrugSelection(searchInput, drug, parsedInfo, sessionId);

        return { success: true, filledCount: 1, drug: drug.name };
    }

    function waitAndFill(drug, attempt, sessionId) {
        if (sessionId !== _fillSessionId) return; // ★ Cancel stale
        if (attempt > 15) {
            QuyenLog.warn('❌ Đã chờ 3 giây nhưng vẫn không tìm thấy form truyền dịch (chưa mở phiếu?)');
            // Thông báo lội lên UI
            HIS.Message.send('QUYEN_FILL_ERROR', {
                reason: 'FORM_NOT_FOUND',
                drugName: drug ? drug.name : '',
                module: 'infusion'
            });
            return;
        }
        safeSetTimeout(function () {
            if (sessionId !== _fillSessionId) return; // ★ Cancel stale
            const searchInput = findDrugSearchInput();
            if (searchInput) {
                QuyenLog.info('✅ Đã tìm thấy ô tìm kiếm sau ' + (attempt * 200) + 'ms');
                doFillForm(searchInput, drug, sessionId);
            } else {
                waitAndFill(drug, attempt + 1, sessionId);
            }
        }, 200);
    }

    // ==========================================
    // STEP 1: DRUG SELECTION (ComboGrid)
    // ==========================================
    function startDrugSelection(searchInput, drug, parsedInfo, sessionId) {
        // ★ BUG-01: Check session trước khi bắt đầu
        if (sessionId !== _fillSessionId) {
            QuyenLog.warn('  ⛔ startDrugSelection cancelled — stale session #' + sessionId);
            return;
        }
        const searchTerm = getSearchTerm(drug.name);

        // matchTexts: tên thuốc + ngày
        const matchTexts = [drug.name];
        if (drug.prescriptionDate) {
            matchTexts.push(drug.prescriptionDate);
        }

        comboGridAutoSelect({
            target: 'THUOC',
            doc: _formDoc,
            inputEl: searchInput,
            ma: drug.ma || '',
            ten: drug.name || searchTerm,
            searchTerm: searchTerm,
            matchTexts: matchTexts,
            label: 'Thuốc',
            sessionId: sessionId,
            onComplete: function (success, err) {
                // ★ BUG-01: Check session sau mỗi bước async
                if (sessionId !== _fillSessionId) {
                    QuyenLog.warn('  ⛔ Drug selection callback cancelled — stale session #' + sessionId);
                    return;
                }
                if (!success) {
                    QuyenLog.error('  ❌ Drug selection failed: ' + (err || 'unknown error'));
                    if (typeof HIS !== 'undefined' && HIS.FillTracker) {
                        HIS.FillTracker.error(err || 'DRUG_NOT_FOUND');
                    }
                    return;
                }
                QuyenLog.info('  ✅ Thuốc đã chọn, chờ form update...');
                // ★ SPRINT D: advance
                if (typeof HIS !== 'undefined' && HIS.FillTracker) HIS.FillTracker.advance('drug', drug.name);
                safeSetTimeout(function () {
                    if (sessionId !== _fillSessionId) return; // ★ BUG-01
                    // ★ Cleanup tên thuốc: xóa "x2 Túi", "x1 Chai" etc.
                    cleanupDrugName(searchInput, parsedInfo);
                    fillSpeedAndQuantity(parsedInfo, sessionId);
                }, 300);  // ★ tối ưu: 800→300ms
            }
        });
    }

    /**
     * Xóa "xN Túi/Chai/Lọ/Ống" khỏi tên thuốc sau khi chọn,
     * đồng thời extract thể tích nếu chưa có
     */
    function cleanupDrugName(searchInput, parsedInfo) {
        const doc = _formDoc || document;
        // Tìm ô hiển thị tên thuốc (có thể là input hoặc span)
        let drugDisplay = searchInput;
        // Tìm ô chứa text thuốc dài (readonly input hoặc display field)
        const allInputs = doc.querySelectorAll('input[type="text"], input:not([type])');
        for (let i = 0; i < allInputs.length; i++) {
            const val = allInputs[i].value || '';
            if (val.length > 20 && /dung\s*t[iíì]ch/i.test(val)) {
                drugDisplay = allInputs[i];
                break;
            }
        }

        const oldVal = drugDisplay.value || '';
        if (!oldVal) return;

        // Extract thể tích trước khi xóa
        if (!parsedInfo.quantityML) {
            const volMatch = oldVal.match(/dung\s*t[iíì]ch\s*(\d+)\s*ml/i);
            if (volMatch && parseInt(volMatch[1]) >= 5) {
                parsedInfo.quantityML = volMatch[1];
                QuyenLog.info(`  💧 Thể tích từ tên thuốc: ${parsedInfo.quantityML}ml`);
            }
        }

        // Xóa "xN Túi/Chai/Lọ/Ống/Gói"
        const cleaned = oldVal.replace(/\s*x\d+\s*(Túi|Chai|Lọ|Ống|Gói|túi|chai|lọ|ống|gói)/gi, '').trim();
        if (cleaned !== oldVal) {
            drugDisplay.value = cleaned;
            triggerEvent(drugDisplay, 'input');
            triggerEvent(drugDisplay, 'change');
            QuyenLog.info(`  ✂️ Tên thuốc: "${oldVal}" → "${cleaned}"`);
        }
    }

    // ==========================================
    // STEP 2: FILL SPEED + QUANTITY (direct input)
    // ==========================================
    function fillSpeedAndQuantity(parsedInfo, sessionId) {
        // ★ BUG-01: Check session trước khi điền
        if (sessionId !== undefined && sessionId !== _fillSessionId) {
            QuyenLog.warn('  ⛔ fillSpeedAndQuantity cancelled — stale session #' + sessionId);
            return;
        }
        QuyenLog.info('  📋 Điền Số lượng + Tốc độ:', parsedInfo);
        const doc = _formDoc || document;

        // Tốc độ (giọt/phút) — ★ LUÔN điền số La Mã (C, XXX, LX …)
        if (parsedInfo.speedDrops) {
            let speedInput = findInput([
                'txtTOCDO_NHOGIOT', 'TOCDO_NHOGIOT', 'TOCDO', 'tocDo',
                'tocdo', 'TOCDOTRUYEN', 'TOCDO_TRUYEN'
            ], doc);
            if (!speedInput) speedInput = findFieldByLabel(['tốc độ'], doc);
            if (speedInput) {
                // ★ Luôn La Mã — số lượng (ml) luôn Ả Rập (bên dưới)
                const speedValue = arabicToRoman(parseInt(parsedInfo.speedDrops));
                QuyenLog.info(`  ✅ Tốc độ: ${speedValue} (La Mã ← ${parsedInfo.speedDrops} giọt/phút)`);
                setInputValue(speedInput, speedValue);
            } else {
                QuyenLog.warn('  ⚠️ Không tìm thấy ô Tốc độ');
            }
        }

        // Số lượng (ml)
        QuyenLog.info(`  📋 quantityML parsed: "${parsedInfo.quantityML}"`);
        if (parsedInfo.quantityML) {
            let qtyInput = findInput([
                'txtSO_LUONG', 'SO_LUONG', 'SOLUONG', 'soLuong',
                'soluong', 'SOLUONGTRUYEN', 'SO_LUONG_TRUYEN',
                'txtSOLUONG', 'txtSoLuong', 'SOLUONG_ML'
            ], doc);
            if (!qtyInput) qtyInput = findFieldByLabel(['số lượng', 'lượng (ml)', 'ml'], doc);
            // Fallback: tìm #txtSO_LUONG VISIBLE trong TẤT CẢ documents
            if (!qtyInput) {
                const allDocs = getAllDocuments();
                for (let d = 0; d < allDocs.length; d++) {
                    try {
                        const allQty = allDocs[d].querySelectorAll('#txtSO_LUONG, input[id*="SO_LUONG"]');
                        for (let q = 0; q < allQty.length; q++) {
                            if (allQty[q].offsetParent !== null || allQty[q].offsetWidth > 0) {
                                qtyInput = allQty[q];
                                QuyenLog.info('  🔍 Tìm thấy #txtSO_LUONG VISIBLE trong frame');
                                break;
                            }
                        }
                        if (qtyInput) break;
                    } catch (e) { /* ignore */ }
                }
            }
            if (qtyInput) {
                setInputValue(qtyInput, parsedInfo.quantityML);
                QuyenLog.info(`  ✅ Số lượng: ${parsedInfo.quantityML} ml`);
            } else {
                QuyenLog.warn('  ⚠️ Không tìm thấy ô Số lượng');
                logAllInputs(doc);
            }
        } else {
            QuyenLog.warn('  ⚠️ quantityML trống — không có thể tích để điền');
        }

        // ★ Đồng bộ TG bắt đầu = TG tạo phiếu
        syncStartTime(doc);

        // ★ SEQUENTIAL: Doctor → Nurse (không chạy song song vì HIS chỉ hiện 1 dropdown) ★
        safeSetTimeout(function () {
            // ★ BUG-01: Check session trước mỗi bước async
            if (sessionId !== undefined && sessionId !== _fillSessionId) {
                QuyenLog.warn('  ⛔ Doctor step cancelled — stale session #' + sessionId);
                return;
            }
            startDoctorSelection(function () {
                safeSetTimeout(function () {
                    // ★ BUG-01: Check session trước nurse step
                    if (sessionId !== undefined && sessionId !== _fillSessionId) {
                        QuyenLog.warn('  ⛔ Nurse step cancelled — stale session #' + sessionId);
                        return;
                    }
                    startNurseSelection(function () {
                        QuyenLog.info('__EXT_EMOJI__ Hoàn tất điền form! __EXT_NAME__ __EXT_EMOJI__');
                        showCompletionEffect(_currentDrug ? _currentDrug.name : 'thuốc');

                        if (typeof HIS !== 'undefined' && HIS.FillTracker) {
                            HIS.FillTracker.transitionTo(HIS.FillTracker.STATE.VERIFYING);
                        }

                        const expected = {
                            drugName: _currentDrug.name,
                            speed: _currentParsedInfo.speed,
                            quantity: _currentParsedInfo.quantityML,
                            doctor: _currentDrug.doctor || getDoctorFromPrescriptionTable(_currentDrug.prescriptionDate),
                            nurse: getLoggedInUserName() || ''
                        };

                        HIS.WriteVerifier.postWriteVerify(_activeContext, expected).then(res => {
                            const durationMs = _fillStartTime > 0 ? (Date.now() - _fillStartTime) : 0;
                            _fillStartTime = 0;
                            if (typeof HIS !== 'undefined' && HIS.PerfMetrics) {
                                HIS.PerfMetrics.log({
                                    module: 'infusion',
                                    step: 'fillForm',
                                    durationMs: durationMs,
                                    result: res.ok ? 'success' : 'failed',
                                    fallbackUsed: false,
                                    timeout: false,
                                    staleDropped: false
                                });
                            }
                            if (res.ok) {
                                if (typeof HIS !== 'undefined' && HIS.FillTracker) HIS.FillTracker.complete(_currentDrug.name);
                            } else {
                                if (typeof HIS !== 'undefined' && HIS.FillTracker) HIS.FillTracker.block(res.details);
                            }
                        }).catch(err => {
                            const durationMs = _fillStartTime > 0 ? (Date.now() - _fillStartTime) : 0;
                            _fillStartTime = 0;
                            if (typeof HIS !== 'undefined' && HIS.PerfMetrics) {
                                HIS.PerfMetrics.log({
                                    module: 'infusion',
                                    step: 'fillForm',
                                    durationMs: durationMs,
                                    result: 'failed',
                                    fallbackUsed: false,
                                    timeout: false,
                                    staleDropped: false
                                });
                            }
                            if (typeof HIS !== 'undefined' && HIS.FillTracker) HIS.FillTracker.block(err.message);
                        });
                    });
                }, 200);  // ★ tối ưu: 500→200ms
            });
        }, 200);  // ★ tối ưu: 500→200ms
    }

    // ==========================================
    // ★ ĐỒNG BỘ THỜI GIAN: TG bắt đầu = TG tạo phiếu
    // ==========================================
    function syncStartTime(doc) {
        // ★ FIX: Ưu tiên tìm trong _formRoot/_formDoc (form hiện tại) — tránh nhầm form cũ ẩn
        let tgTaoPhieu = null;
        let tgBatDau = null;

        // Hàm helper: tìm element VISIBLE theo ID
        function findVisibleById(root, id) {
            if (!root) return null;
            try {
                // querySelectorAll để tìm TẤT CẢ rồi lọc VISIBLE
                const els = root.querySelectorAll('#' + id);
                for (let i = 0; i < els.length; i++) {
                    if (els[i].offsetParent !== null || els[i].offsetWidth > 0) return els[i];
                }
                // Fallback: getElementById (trường hợp chỉ 1)
                const el = (root.getElementById ? root.getElementById(id) : root.querySelector('#' + id));
                if (el) return el;
            } catch (e) { /* ignore */ }
            return null;
        }

        // Bước 1: Tìm trong _formRoot (container chứa form hiện tại — chính xác nhất)
        if (_formRoot) {
            tgTaoPhieu = findVisibleById(_formRoot, 'txtTG_TAOPHIEU');
            tgBatDau = findVisibleById(_formRoot, 'txtTG_BATDAU');
        }

        // Bước 2: Tìm trong _formDoc (iframe document chứa form)
        if ((!tgTaoPhieu || !tgBatDau) && _formDoc) {
            if (!tgTaoPhieu) tgTaoPhieu = findVisibleById(_formDoc, 'txtTG_TAOPHIEU');
            if (!tgBatDau) tgBatDau = findVisibleById(_formDoc, 'txtTG_BATDAU');
        }

        // Bước 3: Fallback — scan tất cả documents, ưu tiên VISIBLE
        if (!tgTaoPhieu || !tgBatDau) {
            const allDocs = getAllDocuments();
            for (let d = 0; d < allDocs.length; d++) {
                try {
                    if (!tgTaoPhieu) tgTaoPhieu = findVisibleById(allDocs[d], 'txtTG_TAOPHIEU');
                    if (!tgBatDau) tgBatDau = findVisibleById(allDocs[d], 'txtTG_BATDAU');
                } catch (e) { /* ignore */ }
                if (tgTaoPhieu && tgBatDau) break;
            }
        }

        if (!tgTaoPhieu || !tgBatDau) {
            QuyenLog.info('  ⏰ Không tìm thấy ô TG tạo phiếu hoặc TG bắt đầu');
            return;
        }

        const tgValue = tgTaoPhieu.value || '';
        if (!tgValue) {
            QuyenLog.info('  ⏰ TG tạo phiếu trống');
            return;
        }

        // Copy TG tạo phiếu → TG bắt đầu (TG kết thúc do HIS tự tính)
        setInputValue(tgBatDau, tgValue);
        QuyenLog.info('  ⏰ TG bắt đầu = TG tạo phiếu: ' + tgValue);
    }

    // ==========================================
    // STEP 3: DOCTOR SELECTION (ComboGrid)
    // ==========================================
    function startDoctorSelection(onComplete) {
        const doc = _formDoc || document;
        const drug = _currentDrug;

        // Lấy tên BS từ API hoặc bảng phiếu thuốc
        let doctorName = (drug && drug.doctor) ? drug.doctor : '';
        if (!doctorName && drug) {
            doctorName = getDoctorFromPrescriptionTable(drug.prescriptionDate);
        }

        if (!doctorName) {
            QuyenLog.warn('  ⚠️ Không tìm được tên BS chỉ định');
            if (onComplete) onComplete();
            return;
        }

        QuyenLog.info(`  👨‍⚕️ BS chỉ định: ${doctorName}`);

        // Tìm text input cho BS (ComboGrid input, KHÔNG phải select)
        const doctorInput = findComboGridInput(doc, [
            'txtTKBS', 'TKBS', 'timBS', 'searchBS'
        ], ['bác sĩ chỉ định', 'bác sỹ chỉ định', 'bs chỉ định']);

        if (!doctorInput) {
            QuyenLog.warn('  ⚠️ Không tìm thấy ô tìm kiếm BS');
            logAllInputs(doc);
            if (onComplete) onComplete();
            return;
        }

        // Tạo search term: lấy 2-3 từ cuối tên (VD: "Lê Ngọc Đức" → "Ngọc Đức" hoặc "ngọc đức")  
        const searchTerm = getNameSearchTerm(doctorName);

        comboGridAutoSelect({
            target: 'YTA',
            doc: doc,
            inputEl: doctorInput,
            ma: '',
            ten: doctorName,
            searchTerm: searchTerm,
            matchTexts: [doctorName],
            label: 'BS chỉ định',
            sessionId: null, // BS không phụ thuộc session fill chính
            onComplete: function (success) {
                if (success) {
                    QuyenLog.info(`  ✅ BS chỉ định đã chọn: ${doctorName}`);
                } else {
                    QuyenLog.warn(`  ⚠️ Không thể tự động chọn BS: ${doctorName}`);
                }
                if (onComplete) onComplete();
            }
        });
    }

    // ==========================================
    // STEP 4: NURSE SELECTION (ComboGrid)
    // ==========================================
    function startNurseSelection(onComplete) {
        const doc = _formDoc || document;

        // Lấy tên người đăng nhập (luôn từ footer)
        const userName = getLoggedInUserName();
        if (!userName) {
            QuyenLog.warn('  ⚠️ Không tìm thấy tên người dùng');
            if (onComplete) onComplete();
            return;
        }

        QuyenLog.info(`  👤 Người dùng (Y tá): ${userName}`);

        // ★ ƯU TIÊN 1: Tìm select#cboYT_CHIDINH trong _formRoot trước ★
        let nurseSelect = null;
        if (_formRoot && _formRoot.querySelector) {
            nurseSelect = _formRoot.querySelector('select#cboYT_CHIDINH, select[id*="cboYT"]');
        }
        if (!nurseSelect) {
            const selectDocs = getAllDocuments();
            for (let d = 0; d < selectDocs.length; d++) {
                try {
                    // Tìm ALL selects và lấy cái VISIBLE
                    const allSels = selectDocs[d].querySelectorAll('select#cboYT_CHIDINH, select[id*="cboYT"]');
                    for (let s = 0; s < allSels.length; s++) {
                        if (allSels[s].offsetParent !== null || allSels[s].offsetWidth > 0) {
                            nurseSelect = allSels[s];
                            break;
                        }
                    }
                    if (nurseSelect) break;
                } catch (e) { /* ignore */ }
            }
        }

        if (nurseSelect) {
            QuyenLog.info('  🔎 Tìm thấy select#cboYT_CHIDINH');
            // Tìm option chứa tên người dùng
            const options = nurseSelect.options;
            const nameLower = userName.toLowerCase();
            let found = false;
            for (let i = 0; i < options.length; i++) {
                const optText = (options[i].text || '').toLowerCase();
                if (optText.includes(nameLower) || nameLower.includes(optText.trim())) {
                    nurseSelect.selectedIndex = i;
                    nurseSelect.value = options[i].value;
                    // Native change event
                    triggerEvent(nurseSelect, 'change');
                    // ★ jQuery change (HIS dùng jQuery UI → cần jQuery trigger)
                    try {
                        const selWin = (nurseSelect.ownerDocument && nurseSelect.ownerDocument.defaultView) || window;
                        const jq = selWin.jQuery || selWin.$ || (window.parent && window.parent.jQuery) || (window.top && window.top.jQuery);
                        if (jq) {
                            jq(nurseSelect).trigger('change');
                            QuyenLog.info('  🔧 jQuery change triggered (content script)');
                        }
                    } catch (e) { /* ignore */ }
                    // ★ Luôn gửi qua bridge để chắc chắn
                    postToBridge({
                        type: 'QUYEN_TRIGGER_CHANGE',
                        selector: '#cboYT_CHIDINH',
                        value: options[i].value,
                        requestId: 'nurse_' + Date.now()
                    });
                    QuyenLog.info(`  ✅ Y tá đã chọn: ${options[i].text} (select dropdown)`);
                    found = true;
                    break;
                }
            }
            if (!found) {
                QuyenLog.warn(`  ⚠️ Không tìm thấy "${userName}" trong dropdown Y tá`);
            }
            if (onComplete) onComplete();
            return;
        }

        // ★ Fallback: ComboGrid input ★
        const nurseInput = findComboGridInput(doc, [
            'txtTKTP', 'TKTP', 'txtTKYT', 'TKYT', 'txtTKDD', 'TKDD',
            'timYT', 'searchYT', 'timDD', 'searchDD'
        ], ['y tá', 'điều dưỡng', 'y tá (điều dưỡng)']);

        if (!nurseInput) {
            QuyenLog.warn('  ⚠️ Không tìm thấy ô tìm kiếm Y tá');
            if (onComplete) onComplete();
            return;
        }

        const searchTerm = getNameSearchTerm(userName);
        comboGridAutoSelect({
            target: 'YTA',
            doc: doc,
            inputEl: nurseInput,
            ma: '',
            ten: userName,
            searchTerm: searchTerm,
            matchTexts: [userName],
            label: 'Y tá',
            sessionId: null, // Y tá không có sessionId của fill drug
            onComplete: function (success) {
                if (success) {
                    QuyenLog.info(`  ✅ Y tá đã chọn: ${userName}`);
                }
                if (onComplete) onComplete();
            }
        });
    }

    // ==========================================
    // FIND COMBOGRID INPUT — Tìm text input cho ComboGrid
    // Khác với select — đây là input[type=text] dùng để search
    // ==========================================
    function findComboGridInput(doc, idPatterns, labelTexts) {
        doc = doc || _formDoc || document;

        // Cách 1: Tìm theo ID patterns
        for (const p of idPatterns) {
            const el = doc.querySelector(
                `input[id*="${p}" i]:not([type="hidden"]):not([type="button"]):not([type="checkbox"])`
            );
            if (el) {
                QuyenLog.info(`  🔎 Tìm thấy ComboGrid input: id="${el.id}" (by pattern "${p}")`);
                return el;
            }
        }

        // Cách 2: Tìm input gần label
        for (const lt of labelTexts) {
            const allLabels = doc.querySelectorAll('td, label, span, div');
            for (const lbl of allLabels) {
                const text = (lbl.textContent || '').trim().toLowerCase();
                if (text.length > 100) continue;
                if (!text.includes(lt)) continue;

                // Tìm input trong cùng row nhưng BỎ QUA select, hidden, checkbox
                const row = lbl.closest('tr');
                if (row) {
                    // Tìm input text gần label (không phải select, không phải hidden)
                    const inputs = row.querySelectorAll(
                        'input[type="text"]:not([type="hidden"]), input:not([type])'
                    );
                    for (const inp of inputs) {
                        // Bỏ qua input đã có value dài (có thể là display field)
                        if (inp.offsetParent !== null || inp.offsetWidth > 0) {
                            QuyenLog.info(`  🔎 Tìm thấy ComboGrid input gần label "${lt}": id="${inp.id}"`);
                            return inp;
                        }
                    }
                }

                // Tìm trong td kế bên
                const nextTd = lbl.closest('td')?.nextElementSibling;
                if (nextTd) {
                    const inp = nextTd.querySelector(
                        'input[type="text"]:not([type="hidden"]), input:not([type])'
                    );
                    if (inp) {
                        QuyenLog.info(`  🔎 Tìm thấy ComboGrid input trong td kế bên: id="${inp.id}"`);
                        return inp;
                    }
                }
            }
        }

        return null;
    }

    // ==========================================
    // FIND DRUG SEARCH INPUT
    // ==========================================
    function findDrugSearchInput() {
        // ★ Tìm trong TẤT CẢ frame, kiểm tra isConnected + VISIBLE
        const allDocs = getAllDocuments();
        for (let d = 0; d < allDocs.length; d++) {
            try {
                const el = allDocs[d].getElementById('txtTKDT');
                if (el && el.isConnected !== false && (el.offsetParent !== null || el.offsetWidth > 0)) {
                    QuyenLog.info(`  🔎 Tìm thấy #txtTKDT VISIBLE (doc ${d})`);
                    return el;
                }
            } catch (e) { /* ignore */ }
        }

        let el = document.getElementById('txtTKDT');
        if (el && (el.offsetParent !== null || el.offsetWidth > 0)) {
            QuyenLog.info('  🔎 Tìm thấy #txtTKDT trực tiếp');
            return el;
        }

        const selectors = [
            'input[id*="txtTKDT"]', 'input[id*="TKDT"]',
            'input[id*="tenDich"]', 'input[id*="TENDICH"]',
            'input[name*="TKDT"]', 'input[name*="tenDich"]',
            '.ui-widget input[id*="TKDT"]', '.ui-widget input[id*="txtTK"]',
        ];

        for (const sel of selectors) {
            el = document.querySelector(sel);
            // ★ BUG-13: Kiểm tra visibility cho fallback selectors
            if (el && (el.offsetParent !== null || el.offsetWidth > 0)) {
                QuyenLog.info(`  🔎 Tìm thấy qua selector: ${sel}`);
                return el;
            }
        }

        // Tìm trong iframes
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc) continue;

                el = iframeDoc.getElementById('txtTKDT');
                if (el) {
                    QuyenLog.info('  🔎 Tìm thấy #txtTKDT trong iframe!');
                    return el;
                }

                for (const sel of selectors) {
                    el = iframeDoc.querySelector(sel);
                    if (el) {
                        QuyenLog.info(`  🔎 Tìm thấy trong iframe qua: ${sel}`);
                        return el;
                    }
                }

                // ★ Tìm iframe lồng bên trong (jBox modal có thể tạo nested iframe)
                const innerFrames = iframeDoc.querySelectorAll('iframe');
                for (const inner of innerFrames) {
                    try {
                        const innerDoc = inner.contentDocument || inner.contentWindow.document;
                        if (!innerDoc) continue;
                        el = innerDoc.getElementById('txtTKDT');
                        if (el) {
                            QuyenLog.info('  🔎 Tìm thấy #txtTKDT trong nested iframe!');
                            return el;
                        }
                        for (const sel of selectors) {
                            el = innerDoc.querySelector(sel);
                            if (el) {
                                QuyenLog.info(`  🔎 Tìm thấy trong nested iframe qua: ${sel}`);
                                return el;
                            }
                        }
                    } catch (e2) { /* Cross-origin */ }
                }
            } catch (e) {
                // Cross-origin iframe → bỏ qua
            }
        }

        // Tìm input gần label "Tên dịch truyền"
        const labels = document.querySelectorAll('td, label, span, div');
        for (const lbl of labels) {
            const text = (lbl.textContent || '').trim().toLowerCase();
            if (text.includes('tên dịch truyền') || text === 'tên dịch truyền/hàm lượng (*)') {
                const nextTd = lbl.closest('td')?.nextElementSibling;
                if (nextTd) {
                    el = nextTd.querySelector('input:not([type="hidden"])');
                    if (el) return el;
                }
                const row = lbl.closest('tr');
                if (row) {
                    el = row.querySelector('input:not([type="hidden"])');
                    if (el) return el;
                }
            }
        }

        return null;
    }

    // ==========================================
    // PARSE USAGE INFO
    // ==========================================
    function parseUsageInfo(drug) {
        const usage = drug.usage || '';
        const concentration = drug.concentration || '';
        const drugName = drug.name || '';
        const allText = `${usage} ${concentration} ${drugName}`;

        const result = {
            speedDrops: '',
            speed: '',
            quantityML: '',
            duration: '',
            quantity: ''
        };

        QuyenLog.info(`  📊 Parse dữ liệu:`);
        QuyenLog.info(`    usage: "${usage}"`);
        QuyenLog.info(`    concentration: "${concentration}"`);
        QuyenLog.info(`    drugName: "${drugName}"`);

        // ===== 1. TỐC ĐỘ (giọt/phút) =====
        // Số La Mã: "C g/p" = 100, "XXX g/ph" = 30, "LX g/phút" = 60
        // ★ Fix: thêm g/p (rút gọn) vào regex — dùng \b để tránh nhầm g/phan, g/pham
        const speedRomanMatch = allText.match(/([IVXLCDM]+)\s*(g\/phút|g\/ph|g\/p\b|giọt\/phút|giọt\/ph|giọt\/p\b)/i);
        if (speedRomanMatch) {
            const arabic = romanToArabic(speedRomanMatch[1]);
            if (arabic > 0 && arabic <= 200) {
                result.speedDrops = String(arabic);
                result.speed = String(arabic);
                QuyenLog.info(`  ⚡ Tốc độ: ${speedRomanMatch[1]} (La Mã) → ${arabic} giọt/phút`);
            }
        }

        // Fallback: số thường (vd: "30 g/p", "60 giọt/phút")
        // ★ Fix: thêm \b để tránh match nhầm, thứ tự dài → ngắn
        if (!result.speedDrops) {
            const speedNumMatch = allText.match(/(\d+)\s*(giọt|g)\s*\/\s*(phút|ph|p)\b/i);
            if (speedNumMatch) {
                result.speedDrops = speedNumMatch[1];
                result.speed = speedNumMatch[1];
                QuyenLog.info(`  ⚡ Tốc độ: ${result.speedDrops} giọt/phút`);
            }
        }

        if (!result.speedDrops) {
            QuyenLog.warn('  ⚠️ Không tìm thấy tốc độ giọt/phút');
        }

        // ===== 2. SỐ LƯỢNG ML =====
        // ★ Ưu tiên cao nhất: lấy trực tiếp từ NDHL trong rawData
        if (!result.quantityML && drug.rawData) {
            const ndhl = drug.rawData.NDHL || drug.rawData.Ndhl || drug.rawData.ndhl || '';
            if (ndhl) {
                QuyenLog.info(`  📦 NDHL raw: "${ndhl}"`);
                const ndhlMatch = ndhl.match(/dung\s*t[iíì]ch\s*(\d+)\s*ml/i);
                if (ndhlMatch && parseInt(ndhlMatch[1]) >= 5) {
                    result.quantityML = ndhlMatch[1];
                    QuyenLog.info(`  💧 Thể tích: ${result.quantityML}ml (từ NDHL trực tiếp)`);
                }
            }
        }

        // "dung tích XXXml" từ allText (concentration + usage + drugName)
        if (!result.quantityML) {
            const dungTichMatch = allText.match(/dung\s*t[iíì]ch\s*(\d+)\s*ml/i);
            if (dungTichMatch && parseInt(dungTichMatch[1]) >= 5) {
                result.quantityML = dungTichMatch[1];
                QuyenLog.info(`  💧 Thể tích: ${result.quantityML}ml (từ "dung tích" trong allText)`);
            }
        }

        // Fallback: XXXml standalone (50-2000ml, loại trừ mg/ml)
        if (!result.quantityML) {
            const matches = allText.match(/\b(\d+)\s*ml\b/gi);
            if (matches) {
                for (const m of matches) {
                    const val = parseInt(m);
                    if (val >= 50 && val <= 2000) {
                        result.quantityML = String(val);
                        QuyenLog.info(`  💧 Thể tích: ${result.quantityML}ml`);
                        break;
                    }
                }
            }
        }

        // Fallback: rawData
        if (!result.quantityML && drug.rawData) {
            const raw = drug.rawData;
            const val = raw.DUNGTICH || raw.DungTich || raw.THETICH || raw.TheTich || '';
            if (val) {
                const parsed = parseInt(String(val));
                if (parsed >= 5) {
                    result.quantityML = String(parsed);
                    QuyenLog.info(`  💧 Thể tích: ${result.quantityML}ml (từ rawData)`);
                }
            }
        }

        if (!result.quantityML) {
            QuyenLog.warn('  ⚠️ Không tìm thấy thể tích (ml)');
        }

        // ===== 3. THỜI GIAN =====
        const durationMatch = usage.match(/(\d+)\s*h\s*$/i) || usage.match(/\/(\d+)\s*h/i);
        if (durationMatch) result.duration = durationMatch[1];

        // ===== 4. SỐ LƯỢNG =====
        result.quantity = drug.quantity || '';

        return result;
    }

    // ==========================================
    // GET DOCTOR FROM PRESCRIPTION TABLE
    // Tìm trên MAIN document (bảng ngoài iframe)
    // ==========================================
    function getDoctorFromPrescriptionTable(prescriptionDate) {
        if (!prescriptionDate) return '';
        const datePatterns = getDatePatterns(prescriptionDate);
        if (datePatterns.length === 0) return '';

        const allRows = document.querySelectorAll('tr.jqgrow, tr.jqgrow_even, tr[role="row"]');

        for (const row of allRows) {
            if (row.closest('#grdBenhNhan')) continue;

            // Tìm cell ngày
            let dateMatch = false;
            const dateCells = row.querySelectorAll('td[aria-describedby*="NGAY"], td[aria-describedby*="Ngay"]');
            for (const cell of dateCells) {
                const cellText = (cell.textContent || '').trim().toLowerCase();
                for (const dp of datePatterns) {
                    if (cellText.includes(dp)) { dateMatch = true; break; }
                }
                if (dateMatch) break;
            }

            if (!dateMatch) {
                const allCells = row.querySelectorAll('td');
                for (const cell of allCells) {
                    const cellText = (cell.textContent || '').trim().toLowerCase();
                    for (const dp of datePatterns) {
                        if (cellText.includes(dp)) { dateMatch = true; break; }
                    }
                    if (dateMatch) break;
                }
            }

            if (!dateMatch) continue;

            // Tìm cell BS
            const doctorCell = row.querySelector('td[aria-describedby*="NGUOICHIDINH"], td[aria-describedby*="BACSI"], td[aria-describedby*="FULL_NAME"]');
            if (doctorCell) {
                const name = (doctorCell.textContent || doctorCell.title || '').trim();
                if (name && name.length > 1) {
                    QuyenLog.info(`  🔍 BS từ bảng phiếu thuốc: "${name}"`);
                    return name;
                }
            }

            // Fallback: cell có tên người VN
            const cells = row.querySelectorAll('td');
            for (const cell of cells) {
                const t = (cell.textContent || '').trim();
                if (t.length >= 5 && t.length <= 40 && /^[A-Z\u00C0-\u1EF9]/.test(t) && t.includes(' ') && !t.match(/^\d/)) {
                    QuyenLog.info(`  🔍 BS (fallback): "${t}"`);
                    return t;
                }
            }
        }

        return '';
    }

    // ==========================================
    // GET LOGGED IN USER NAME
    // Luôn tìm trên main document (footer)
    // ==========================================
    function getLoggedInUserName() {
        // Tìm trong TẤT CẢ documents (footer ở top/parent)
        const docsToSearch = [];
        try { docsToSearch.push(document); } catch (e) { /* ignore */ }
        try { if (window.parent && window.parent.document !== document) docsToSearch.push(window.parent.document); } catch (e) { /* ignore */ }
        try { if (window.top && window.top.document !== document && window.top.document !== (window.parent && window.parent.document)) docsToSearch.push(window.top.document); } catch (e) { /* ignore */ }

        for (const searchDoc of docsToSearch) {
            try {
                // Ưu tiên: tìm span.footer-content-fullname
                const fullnameEl = searchDoc.querySelector('.footer-content-fullname, [id*="footer-content-fullname"]');
                if (fullnameEl) {
                    const name = (fullnameEl.textContent || '').trim();
                    if (name.length >= 2 && name.includes(' ')) {
                        QuyenLog.info(`  👤 Tên đăng nhập từ footer: "${name}"`);
                        return name;
                    }
                }

                // Fallback: regex "Người dùng: Tên"
                const candidates = searchDoc.querySelectorAll(
                    'td, span, div, footer, [class*="footer"], [id*="footer"]'
                );
                let bestMatch = null;
                let bestLength = Infinity;
                for (const el of candidates) {
                    const text = el.textContent || '';
                    if (text.length > 500) continue;
                    const match = text.match(/Người\s*dùng[:\s]+([^-\n\r]+)/i);
                    if (match && text.length < bestLength) {
                        const n = match[1].trim();
                        if (n.length >= 2 && n.length <= 50 && n.includes(' ')) {
                            bestMatch = n;
                            bestLength = text.length;
                        }
                    }
                }
                if (bestMatch) return bestMatch;
            } catch (e) { /* cross-origin */ }
        }

        return null;
    }

    // ==========================================
    // DATE PATTERNS
    // ==========================================
    function getDatePatterns(prescriptionDate) {
        if (!prescriptionDate) return [];
        const patterns = [];
        const dateStr = String(prescriptionDate).trim();
        patterns.push(dateStr.toLowerCase());

        let day, month;
        const dmy = dateStr.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        const ymd = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);

        if (dmy) { day = dmy[1]; month = dmy[2]; }
        else if (ymd) { day = ymd[3]; month = ymd[2]; }

        if (day && month) {
            patterns.push(`${day}/${month}`);
            patterns.push(`${parseInt(day)}/${parseInt(month)}`);
            patterns.push(`${day.padStart(2, '0')}/${month.padStart(2, '0')}`);
        }

        return patterns;
    }

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    /**
     * Gửi message tới Bridge.
     * Bridge CHỈ chạy ở TOP WINDOW (do content.js dòng 14: if (window !== window.top) return).
     * ★ BUG-03: Gửi lên window.top để bridge nhận được từ iframe context.
     * Dùng '*' vì cross-origin iframe không thể biết target origin.
     */
    function postToBridge(msg) {
        if (typeof HIS !== 'undefined' && HIS.Message && msg && msg.type) {
            HIS.Message.send(msg.type, Object.assign({ module: 'infusion' }, msg));
            return;
        }
        window.postMessage(msg, location.origin);
    }

    /** 
     * Thay vì dán chữ (làm hỏng state của EasyUI ComboGrid), 
     * ta uỷ quyền toàn bộ việc "Gõ chữ y như người thật" cho Bridge.
     * Bridge sẽ phát ra đầy đủ event keydown, keypress, keyup bằng jQuery
     * để đảm bảo HIS nhận diện đúng 100% và tự động search.
     */
    function typeTextSlowly(input, text, callback) {
        const inputMarker = 'quyen_input_' + Date.now();
        input.setAttribute('data-quyen-input', inputMarker);

        postToBridge({
            type: 'QUYEN_TYPE_TEXT',
            inputMarker: inputMarker,
            text: text
        });

        // Mỗi ký tự tốn 40ms, cộng thêm 200ms overhead. 
        // Trong lúc đó waitForComboGrid cũng đang chạy song song để đón lõng.
        const estTime = Math.max(200, text.length * 50 + 200);
        setTimeout(function () {
            try { input.removeAttribute('data-quyen-input'); } catch (e) { /* ignore */ }
            if (callback) callback();
        }, estTime);
    }

    /** Search term cho tên thuốc: 5 ký tự đầu */
    function getSearchTerm(drugName) {
        const clean = drugName.replace(/\s*\d+\s*(mg|ml|g|mcg|%)\/?.*$/i, '').trim();
        // ★ BUG-11: Trim kết quả để tránh trailing space khi cắt giữa từ
        return (clean.length > 5 ? clean.substring(0, 5) : clean).trim();
    }

    /** Search term cho tên người: lấy tên + họ lót cuối
     *  VD: "Lê Ngọc Đức" → "ngọc đức"
     *      "Võ Thanh Quyên" → "thanh quyên"
     *      "Huỳnh Trung Anh" → "trung anh"
     */
    function getNameSearchTerm(fullName) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length >= 3) {
            // Lấy 2 từ cuối (tên + đệm cuối)
            return parts.slice(-2).join(' ').toLowerCase();
        } else if (parts.length === 2) {
            return parts[1].toLowerCase();
        }
        return fullName.toLowerCase();
    }

    /** Tìm input by ID/name patterns */
    /** Lấy tất cả documents (main + parent + top + iframes) — ★ BUG-20: cached per session */
    function getAllDocuments() {
        // ★ BUG-20: Cache kết quả trong cùng session, tránh scan lại 5+ lần
        if (_cachedDocs && _cachedDocsSessionId === _fillSessionId) {
            return _cachedDocs;
        }
        const docs = new Set();
        try { docs.add(document); } catch (e) { /* ignore */ }
        try { if (window.parent && window.parent.document) docs.add(window.parent.document); } catch (e) { /* ignore */ }
        try { if (window.top && window.top.document) docs.add(window.top.document); } catch (e) { /* ignore */ }
        // Scan iframes
        for (const d of [...docs]) {
            try {
                const ifs = d.querySelectorAll('iframe');
                for (let i = 0; i < ifs.length; i++) {
                    try { if (ifs[i].contentDocument) docs.add(ifs[i].contentDocument); } catch (e) { /* ignore */ }
                }
            } catch (e) { /* ignore */ }
        }
        _cachedDocs = [...docs];
        _cachedDocsSessionId = _fillSessionId;
        return _cachedDocs;
    }

    function findInput(patterns, doc) {
        // ★ Ưu tiên tìm trong _formRoot (đúng form hiện tại, tránh form cũ)
        const searchRoots = [];
        if (_formRoot && _formRoot !== _formDoc) searchRoots.push(_formRoot);
        searchRoots.push(doc || _formDoc || document);

        for (const root of searchRoots) {
            for (const p of patterns) {
                const all = root.querySelectorAll(
                    `input[id*="${p}" i]:not([type="hidden"]):not([type="button"]):not([type="checkbox"]), ` +
                    `input[name*="${p}" i]:not([type="hidden"]):not([type="button"]):not([type="checkbox"])`
                );
                for (let k = 0; k < all.length; k++) {
                    if (all[k].offsetParent !== null || all[k].offsetWidth > 0) return all[k];
                }
            }
            // Nếu tìm thấy trong _formRoot thì dừng, không cần fallback
            if (root === _formRoot) continue;
        }
        return null;
    }

    /** Tìm input gần label */
    function findFieldByLabel(labelTexts, doc) {
        doc = doc || _formDoc || document;
        const allLabels = doc.querySelectorAll('td, label, span, div');
        for (const lbl of allLabels) {
            const text = (lbl.textContent || '').trim().toLowerCase();
            if (text.length > 100) continue;
            if (!labelTexts.some(function (lt) { return text.includes(lt); })) continue;

            const row = lbl.closest('tr');
            if (row) {
                const inp = row.querySelector('input:not([type="hidden"]):not([type="button"]):not([type="checkbox"])');
                if (inp && (inp.offsetParent !== null || inp.offsetWidth > 0)) {
                    QuyenLog.info(`  🔎 Input "${labelTexts[0]}" trong row: id="${inp.id}"`);
                    return inp;
                }
            }

            const nextTd = lbl.closest('td')?.nextElementSibling;
            if (nextTd) {
                const inp = nextTd.querySelector('input:not([type="hidden"])');
                if (inp && (inp.offsetParent !== null || inp.offsetWidth > 0)) {
                    QuyenLog.info(`  🔎 Input "${labelTexts[0]}" trong td kế bên: id="${inp.id}"`);
                    return inp;
                }
            }
        }
        return null;
    }

    /** Log tất cả input trên form (debug) */
    function logAllInputs(doc) {
        const inputs = doc.querySelectorAll('input:not([type="hidden"])');
        QuyenLog.info(`  🔍 Debug: ${inputs.length} input fields trên form:`);
        inputs.forEach(function (inp, i) {
            if (inp.id || inp.name) {
                QuyenLog.info(`    input[${i}]: id="${inp.id}" name="${inp.name}" type="${inp.type || 'text'}"`);
            }
        });
    }

    function injectOverlayStyles(doc) {
        if (!doc || typeof doc.createElement !== 'function') return;
        if (doc.getElementById('quyen-badge-styles')) return;
        const style = doc.createElement('style');
        style.id = 'quyen-badge-styles';
        style.textContent = `
            input[data-quyen-source="nt006"]:focus {
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='65' height='18'><rect width='65' height='18' rx='4' fill='%2328a745'/><text x='6' y='13' fill='white' font-family='sans-serif' font-size='9' font-weight='bold'>NT.006</text></svg>") !important;
                background-position: right 6px center !important;
                background-repeat: no-repeat !important;
                padding-right: 75px !important;
            }
            input[data-quyen-source="prev"]:focus {
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='18'><rect width='140' height='18' rx='4' fill='%23ffeeba'/><text x='6' y='13' fill='%23333' font-family='sans-serif' font-size='9' font-weight='bold'>Phiếu cũ — cần xác nhận</text></svg>") !important;
                background-position: right 6px center !important;
                background-repeat: no-repeat !important;
                padding-right: 150px !important;
            }
            input[data-quyen-source="suggestion"]:focus {
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='130' height='18'><rect width='130' height='18' rx='4' fill='%23e2e3e5'/><text x='6' y='13' fill='%23666' font-family='sans-serif' font-size='9' font-weight='bold'>Gợi ý — chưa xác nhận</text></svg>") !important;
                background-position: right 6px center !important;
                background-repeat: no-repeat !important;
                padding-right: 140px !important;
            }
            input[data-quyen-source="manual"]:focus {
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='70' height='18'><rect width='70' height='18' rx='4' fill='%23007bff'/><text x='6' y='13' fill='white' font-family='sans-serif' font-size='9' font-weight='bold'>Nhập tay</text></svg>") !important;
                background-position: right 6px center !important;
                background-repeat: no-repeat !important;
                padding-right: 80px !important;
            }
        `;
        (doc.head || doc.body || doc.documentElement).appendChild(style);
    }

    function setInputValue(input, value) {
        input.focus();
        input.value = value;
        input.setAttribute('data-quyen-source', 'suggestion');
        if (!(input.dataset && input.dataset.hasQuyenSourceListener) && input.getAttribute('data-has-quyen-source-listener') !== 'true') {
            if (input.dataset) input.dataset.hasQuyenSourceListener = 'true';
            input.setAttribute('data-has-quyen-source-listener', 'true');
            input.addEventListener('input', function () {
                input.setAttribute('data-quyen-source', 'manual');
            });
        }
        injectOverlayStyles(input.ownerDocument);
        triggerEvent(input, 'input');
        triggerEvent(input, 'change');
        triggerEvent(input, 'blur');
    }

    function triggerEvent(el, name) {
        el.dispatchEvent(new Event(name, { bubbles: true, cancelable: true }));
    }

    // ==========================================
    // COMPLETION EFFECT — Hiệu ứng hoàn thành
    // ==========================================
    function showCompletionEffect(drugName) {
        // ★ Toast banner ★
        const toast = document.createElement('div');
        toast.className = 'quyen-infusion-toast';
        // ★ BUG-06: Escape HTML trong tên thuốc để chống XSS
        const safeName = document.createElement('span');
        safeName.textContent = drugName;
        toast.innerHTML = `<span class="quyen-toast-icon">✅</span> Đã điền "<b>${safeName.innerHTML}</b>" thành công`;
        document.body.appendChild(toast);
        requestAnimationFrame(function () {
            toast.classList.add('quyen-toast-show');
        });
        setTimeout(function () {
            toast.classList.remove('quyen-toast-show');
            toast.classList.add('quyen-toast-hide');
            setTimeout(function () { toast.remove(); }, 600);
        }, 4000);

        // Operation count feedback
        if (typeof QUYEN_CONFIG !== 'undefined' && QUYEN_CONFIG.UI_MODE === 'production') {
            return;
        }
        const fillBtn = document.querySelector('.quyen-btn-fill-all, .quyen-btn-fill');
        if (fillBtn) {
            const rect = fillBtn.getBoundingClientRect();
            const merit = document.createElement('div');
            merit.className = 'quyen-merit-float';
            merit.textContent = '+1 thao tác';
            merit.style.left = rect.left + rect.width / 2 + 'px';
            merit.style.top = rect.top + 'px';
            document.body.appendChild(merit);
            requestAnimationFrame(function () {
                merit.classList.add('quyen-merit-animate');
            });
            setTimeout(function () { merit.remove(); }, 3000);
            
            // ★ TRIGGER THE GOLD FLASH IN THE CENTER
            if (typeof QuyenUI !== 'undefined' && typeof QuyenUI.triggerGoldFlash === 'function') {
                QuyenUI.triggerGoldFlash();
            }
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        fillForm,
        cancel,
        romanToArabic,
        arabicToRoman,
        setUseRomanSpeed,
        getUseRomanSpeed,
        parseUsageInfo
    };
})();
