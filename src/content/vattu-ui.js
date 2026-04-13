/**
 * __EXT_EMOJI__ __EXT_NAME__ — Vật Tư UI
 * Tab "🧰 Vật tư" trong floating panel — hiển thị và điền gợi ý VT theo thuốc
 */

/* global QuyenLog, QuyenVatTuEngine, QuyenUI */
/* exported QuyenVatTuUI */

const QuyenVatTuUI = (function () {
    'use strict';

    let _container = null;
    let _lastResult = null;
    let _loading = false;
    let _fillingIdx = null; // row đang trong trạng thái điền

    // ★ Rate limiting: queue tuần tự cho VT fill
    const _fillQueue = [];
    let _fillInProgress = false;

    // ★ Safe Mode: chỉ hiện thông tin, không cho fill
    let _safeMode = false;

    // =========================================================
    // INIT
    // =========================================================
    function init(container) {
        _container = container;
        renderIdle();
        QuyenLog.info('🧰 VatTuUI initialized');

        // Load safe mode state
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.local.get('quyen_safe_mode', function (data) {
                _safeMode = data.quyen_safe_mode === true;
            });
        }

        window.addEventListener('message', function (event) {
            if (!event.data) return;
            if (event.data.type === 'QUYEN_PATIENT_SELECTED') {
                _lastResult = null;
                renderLoading('Đang tải dữ liệu thuốc...');
                setTimeout(function () { refresh(); }, 800);
            }
            if (event.data.type === 'QUYEN_VT_FILL_RESULT') {
                onFillResult(event.data);
            }
        });

        // ★ Listen safe mode toggle từ popup
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener(function (msg) {
                if (msg && msg.type === 'QUYEN_SAFE_MODE') {
                    _safeMode = msg.safeMode === true;
                    QuyenLog.info('🛡️ Safe Mode:', _safeMode ? 'BẬT' : 'TẮT');
                }
            });
        }
    }

    function onPatientChange() {
        _lastResult = null;
        renderLoading('Đang tải dữ liệu...');
        setTimeout(function () { refresh(); }, 800);
    }

    // =========================================================
    // REFRESH
    // =========================================================
    function refresh() {
        if (_loading) return;
        if (!QuyenVatTuEngine || !QuyenVatTuEngine.getCurrentPatient()) {
            renderIdle();
            return;
        }
        _loading = true;
        renderLoading('Đang đọc danh sách thuốc từ HIS...');

        QuyenVatTuEngine.analyze().then(function (result) {
            _loading = false;
            _lastResult = result;
            renderResult(result);
        }).catch(function (err) {
            _loading = false;
            renderError(err.message || 'Lỗi không xác định');
            QuyenLog.error('🧰 VatTuUI error:', err.message);
        });
    }

    // =========================================================
    // RENDER helpers
    // =========================================================
    function renderIdle() {
        if (!_container) return;
        _container.innerHTML = '<div class="quyen-vt-wrapper"><div class="quyen-vt-idle"><div style="font-size:32px;margin-bottom:8px;">🧰</div><div style="color:#aaa;font-size:12px;">Chọn bệnh nhân để xem gợi ý vật tư</div></div></div>';
    }

    function renderLoading(msg) {
        if (!_container) return;
        _container.innerHTML = '<div class="quyen-vt-wrapper"><div class="quyen-vt-loading"><div class="quyen-vt-spinner"></div><div>' + (msg || 'Đang tải...') + '</div></div></div>';
    }

    function renderError(msg) {
        if (!_container) return;
        _container.innerHTML = '<div class="quyen-vt-wrapper"><div class="quyen-vt-error"><div style="font-size:20px;margin-bottom:6px;">⚠️</div><div style="font-size:12px;color:#c62828;">' + escapeHtml(msg) + '</div><button id="quyen-vt-retry" style="margin-top:10px;background:#e91e63;color:#fff;padding:5px 14px;border-radius:7px;border:none;cursor:pointer;font-size:12px;">🔄 Thử lại</button></div></div>';
        let retryBtn = _container.querySelector('#quyen-vt-retry');
        if (retryBtn) retryBtn.addEventListener('click', refresh);
    }

    // =========================================================
    // RENDER: Result
    // =========================================================
    function renderResult(result) {
        if (!_container) return;
        let suggestedVT = result.suggestedVT;
        let existingVT  = result.existingVT;
        let drugs       = result.drugs;

        // ── Existing VT ──────────────────────────────────────
        let existingHtml = '';
        if (existingVT && existingVT.length > 0) {
            let vtMap = new Map();
            for (var ei = 0; ei < existingVT.length; ei++) {
                let eItem = existingVT[ei];
                let eKey = eItem.ma || eItem.MADICHVU || '';
                if (!vtMap.has(eKey)) {
                    vtMap.set(eKey, {
                        ma:  eKey,
                        ten: eItem.ten || eItem.TENDICHVU || eKey,
                        sl:  parseInt(eItem.sl || eItem.SOLUONG || 1, 10),
                        dvt: eItem.dvt || eItem.DVT || '',
                    });
                } else {
                    vtMap.get(eKey).sl += parseInt(eItem.sl || eItem.SOLUONG || 1, 10);
                }
            }
            let vtList = Array.from(vtMap.values());
            let existRows = vtList.map(function(item) {
                return '<div class="quyen-vt-existing-item"><span class="quyen-vt-ma">' + escapeHtml(item.ma) + '</span><span class="quyen-vt-ten">' + escapeHtml(item.ten) + '</span><span class="quyen-vt-sl-badge">' + item.sl + ' ' + escapeHtml(item.dvt) + '</span></div>';
            }).join('');
            existingHtml = '<div class="quyen-vt-section"><div class="quyen-vt-section-title">✅ Phiếu VT đang có <span class="quyen-vt-count">' + vtList.length + ' loại</span></div><div class="quyen-vt-existing-list">' + existRows + '</div></div>';
        }

        // ── Suggested VT ──────────────────────────────────────
        let suggestHtml = '';
        if (suggestedVT && suggestedVT.length > 0) {
            let ruleLabel = {
                base:    '🩺 Cơ bản',
                tmc:     '💉 Tiêm bắp/TMC',
                ttm:     '💧 Truyền dịch (TTM)',
                insulin: '🩸 Insulin',
                wound:   '🩹 Vết thương'
            };
            // Group by rule
            let grouped = {};
            for (var si = 0; si < suggestedVT.length; si++) {
                let sItem = suggestedVT[si];
                let r = sItem.rule || 'base';
                if (!grouped[r]) grouped[r] = [];
                grouped[r].push(sItem);
            }

            suggestHtml = '<div class="quyen-vt-section"><div class="quyen-vt-section-title">💡 Gợi ý theo thuốc <span class="quyen-vt-count">' + suggestedVT.length + ' loại</span></div><div class="quyen-vt-suggest-list" id="quyen-vt-suggest-list">';

            let rowIdx = 0;
            let rules = Object.keys(grouped);
            for (var ri = 0; ri < rules.length; ri++) {
                let rule = rules[ri];
                let rItems = grouped[rule];
                suggestHtml += '<div class="quyen-vt-rule-group"><div class="quyen-vt-rule-label">' + (ruleLabel[rule] || rule) + '</div>';
                for (var rii = 0; rii < rItems.length; rii++) {
                    let item = rItems[rii];
                    let isWound = (rule === 'wound');
                    let noteHtml = item.note ? '<div class="quyen-vt-note-text">ℹ️ ' + escapeHtml(item.note) + '</div>' : '';
                    suggestHtml += '<div class="quyen-vt-suggest-row' + (isWound ? ' quyen-vt-wound' : '') + '" data-idx="' + rowIdx + '" data-ma="' + escapeHtml(item.ma) + '">' +
                        '<div class="quyen-vt-row-top">' +
                            '<input type="checkbox" class="quyen-vt-check" id="quyen-vt-chk-' + rowIdx + '" data-idx="' + rowIdx + '"' + (isWound ? '' : ' checked') + '>' +
                            '<label for="quyen-vt-chk-' + rowIdx + '" class="quyen-vt-suggest-label">' +
                                '<span class="quyen-vt-ma">' + escapeHtml(item.ma) + '</span>' +
                                '<span class="quyen-vt-ten">' + escapeHtml(item.ten) + '</span>' +
                            '</label>' +
                            '<div class="quyen-vt-sl-ctrl">' +
                                '<input type="number" class="quyen-vt-sl-input" data-idx="' + rowIdx + '" value="' + item.sl + '" min="1" max="99" id="quyen-vt-sl-' + rowIdx + '">' +
                                '<span class="quyen-vt-dvt">' + escapeHtml(item.dvt) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="quyen-vt-row-bottom">' +
                            '<input type="text" class="quyen-vt-cachdung-input" id="quyen-vt-cd-' + rowIdx + '" data-idx="' + rowIdx + '" value="' + escapeHtml(item.cachdung) + '" placeholder="Cách dùng...">' +
                            '<button class="quyen-vt-fill-btn" data-idx="' + rowIdx + '" id="quyen-vt-fill-' + rowIdx + '" title="Điền vật tư này vào phiếu HIS đang mở">✚ Điền</button>' +
                        '</div>' +
                        noteHtml +
                    '</div>';
                    rowIdx++;
                }
                suggestHtml += '</div>';
            }
            suggestHtml += '</div></div>';
        } else if (drugs && drugs.length === 0) {
            suggestHtml = '<div class="quyen-vt-empty">Không tìm thấy thuốc hôm nay.<br>Có thể chưa có phiếu thuốc.</div>';
        } else {
            suggestHtml = '<div class="quyen-vt-empty">Không gợi ý thêm VT nào.<br>(BN chỉ có thuốc Uống)</div>';
        }

        let kimLuonNote = (suggestedVT && suggestedVT.some(function(v) { return v.ma === 'BO560'; })) ?
            '<div class="quyen-vt-kim-note">📌 <strong>KI306</strong> + <strong>BA365</strong>: thêm khi lắp kim luồn mới (3–4 ngày/lần)</div>' : '';

        let drugTags = '';
        if (drugs && drugs.length > 0) {
            let tagItems = drugs.slice(0, 4).map(function(d) {
                return '<span class="quyen-vt-drug-tag">' + escapeHtml(d.ten ? d.ten.split(' ')[0] : d.ma) + '</span>';
            });
            if (drugs.length > 4) tagItems.push('<span class="quyen-vt-drug-tag">+' + (drugs.length - 4) + '</span>');
            drugTags = '<div class="quyen-vt-drug-summary"><span>💊 Hôm nay: ' + drugs.length + ' thuốc — </span><span class="quyen-vt-drug-tags">' + tagItems.join('') + '</span></div>';
        }

        let actionsHtml = (suggestedVT && suggestedVT.length > 0) ?
            '<div class="quyen-vt-actions"><button class="quyen-vt-copy-btn" id="quyen-vt-copy">📋 Copy danh sách</button></div>' : '';

        _container.innerHTML = '<div class="quyen-vt-wrapper"><div class="quyen-vt-toolbar">' + drugTags + '<button class="quyen-vt-refresh-btn" id="quyen-vt-refresh" title="Đọc lại từ HIS">🔄</button></div>' + existingHtml + suggestHtml + kimLuonNote + actionsHtml + '</div>';

        // Wire events
        let refreshBtn = _container.querySelector('#quyen-vt-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);

        let copyBtn = _container.querySelector('#quyen-vt-copy');
        if (copyBtn) copyBtn.addEventListener('click', function () { copyToClipboard(suggestedVT); });

        // Wire nút Điền
        let fillBtns = _container.querySelectorAll('.quyen-vt-fill-btn');
        for (var fi = 0; fi < fillBtns.length; fi++) {
            (function(btn) {
                btn.addEventListener('click', function () {
                    let idx = parseInt(btn.getAttribute('data-idx'), 10);
                    onClickFill(idx, suggestedVT);
                });
            })(fillBtns[fi]);
        }
    }

    // =========================================================
    // CLICK ĐIỀN (★ Queue tuần tự — chống chồng fill)
    // =========================================================
    function onClickFill(idx, suggestedVT) {
        // ★ Safe Mode: chặn fill, chỉ hiện cảnh báo
        if (_safeMode) {
            showToast('🛡️ Safe Mode đang bật — tắt trong popup để sử dụng Điền', 'warning');
            return;
        }

        let item = suggestedVT && suggestedVT[idx];
        if (!item) return;

        let slInput  = _container.querySelector('#quyen-vt-sl-'   + idx);
        let cdInput  = _container.querySelector('#quyen-vt-cd-'   + idx);
        let fillBtn  = _container.querySelector('#quyen-vt-fill-' + idx);

        let sl       = slInput ? (parseInt(slInput.value, 10) || item.sl) : item.sl;
        let cachdung = cdInput ? cdInput.value.trim() : item.cachdung;

        // Nếu đang fill → đưa vào hàng đợi
        if (_fillInProgress) {
            _fillQueue.push({ idx: idx, item: item, sl: sl, cachdung: cachdung });
            if (fillBtn) { fillBtn.textContent = '🕐 Chờ'; fillBtn.disabled = true; }
            QuyenLog.info('🧰 Queue VT:', item.ma, '(đang chờ ' + _fillQueue.length + ')');
            return;
        }

        _executeFill(idx, item, sl, cachdung);
    }

    function _executeFill(idx, item, sl, cachdung) {
        let fillBtn = _container && _container.querySelector('#quyen-vt-fill-' + idx);

        _fillInProgress = true;
        _fillingIdx = idx;
        if (fillBtn) { fillBtn.textContent = '⏳'; fillBtn.disabled = true; }

        QuyenLog.info('🧰 Điền VT:', item.ma, '| SL:', sl, '| CD:', cachdung);

        window.postMessage({
            type:     'QUYEN_FILL_VT_ITEM',
            ma:       item.ma,
            ten:      item.ten,
            sl:       sl,
            cachdung: cachdung,
        }, location.origin);

        // Timeout fallback 12s — giải phóng queue nếu bridge không phản hồi
        setTimeout(function () {
            if (_fillingIdx === idx) {
                resetFillBtn(idx, '✚ Điền');
                _fillingIdx = null;
                _fillInProgress = false;
                _processNextFill();
            }
        }, 12000);
    }

    function _processNextFill() {
        if (_fillQueue.length === 0) return;
        let next = _fillQueue.shift();
        // Delay 500ms giữa các fill để HIS form reset
        setTimeout(function () {
            _executeFill(next.idx, next.item, next.sl, next.cachdung);
        }, 500);
    }

    // =========================================================
    // KẾT QUẢ ĐIỀN (★ Trigger queue tiếp theo khi hoàn thành)
    // =========================================================
    function onFillResult(data) {
        let idx = _fillingIdx;
        _fillingIdx = null;
        _fillInProgress = false;

        if (data.success) {
            resetFillBtn(idx, '✅');
            showToast('✅ Đã điền ' + (data.ma || '') + ' vào phiếu!', 'success');
            setTimeout(function () { resetFillBtn(idx, '✚ Điền'); }, 2500);
        } else {
            resetFillBtn(idx, '✚ Điền');
            showToast('❌ ' + (data.error || 'Lỗi điền VT'), 'error');
        }

        // Xử lý item tiếp theo trong queue
        _processNextFill();
    }

    function resetFillBtn(idx, label) {
        if (idx === null || idx === undefined) return;
        let btn = _container && _container.querySelector('#quyen-vt-fill-' + idx);
        if (btn) { btn.textContent = label; btn.disabled = false; }
    }

    // =========================================================
    // COPY TO CLIPBOARD
    // =========================================================
    function copyToClipboard(suggestedVT) {
        if (!suggestedVT || suggestedVT.length === 0) return;

        let checkedItems = [];
        let rows = _container ? _container.querySelectorAll('.quyen-vt-suggest-row') : [];
        for (var i = 0; i < rows.length; i++) {
            let row  = rows[i];
            let idx  = parseInt(row.getAttribute('data-idx'), 10);
            let chk  = row.querySelector('.quyen-vt-check');
            let slI  = row.querySelector('.quyen-vt-sl-input');
            let cdI  = row.querySelector('.quyen-vt-cachdung-input');
            if (chk && chk.checked) {
                let item = suggestedVT[idx];
                if (item) {
                    checkedItems.push({
                        ma: item.ma, ten: item.ten, dvt: item.dvt, huong: item.huong,
                        sl:       slI ? slI.value       : item.sl,
                        cachdung: cdI ? cdI.value.trim(): item.cachdung,
                    });
                }
            }
        }

        if (checkedItems.length === 0) { showToast('Không có VT nào được chọn!', 'warning'); return; }

        let today = new Date().toLocaleDateString('vi-VN');
        let text  = 'DANH SÁCH VẬT TƯ GỢI Ý — ' + today + '\n' + '═'.repeat(40) + '\n';
        for (var n = 0; n < checkedItems.length; n++) {
            let ci = checkedItems[n];
            text += (n + 1) + '. [' + ci.ma + '] ' + ci.ten + '\n';
            text += '   SL: ' + ci.sl + ' ' + ci.dvt + '  |  ' + ci.huong + '\n';
            if (ci.cachdung) text += '   Cách dùng: ' + ci.cachdung + '\n';
        }
        text += '─'.repeat(40) + '\nTổng: ' + checkedItems.length + ' loại\n⚠️ Kiểm tra lại trước khi lập phiếu';

        navigator.clipboard.writeText(text).then(function () {
            showToast('✅ Đã copy ' + checkedItems.length + ' VT!', 'success');
        }).catch(function () {
            let ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('✅ Đã copy!', 'success');
        });
    }

    // =========================================================
    // TOAST + UTILS
    // =========================================================
    function showToast(msg, type) {
        if (typeof QuyenUI !== 'undefined' && QuyenUI.showToast) {
            QuyenUI.showToast(msg, type);
        } else {
            let el = document.createElement('div');
            el.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#333;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;z-index:100002;';
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(function () { el.remove(); }, 2500);
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // =========================================================
    // PUBLIC
    // =========================================================
    return {
        init:            init,
        onPatientChange: onPatientChange,
        refresh:         refresh,
    };

})();
