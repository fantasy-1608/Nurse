/**
 * __EXT_EMOJI__ __EXT_NAME__ — Vật Tư UI
 * Tab "🧰 Vật tư" trong floating panel — hiển thị và điền gợi ý VT theo thuốc
 */

/* global QuyenLog, QuyenVatTuEngine */
/* exported QuyenVatTuUI */

const QuyenVatTuUI = (function () {
    'use strict';

    let _container = null;
    let _lastResult = null;
    let _loading = false;
    let _fillingIdx = null; // row đang trong trạng thái điền

    // =========================================================
    // INIT
    // =========================================================
    function init(container) {
        _container = container;
        renderIdle();
        QuyenLog.info('🧰 VatTuUI initialized');

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
        var retryBtn = _container.querySelector('#quyen-vt-retry');
        if (retryBtn) retryBtn.addEventListener('click', refresh);
    }

    // =========================================================
    // RENDER: Result
    // =========================================================
    function renderResult(result) {
        if (!_container) return;
        var suggestedVT = result.suggestedVT;
        var existingVT  = result.existingVT;
        var drugs       = result.drugs;

        // ── Existing VT ──────────────────────────────────────
        var existingHtml = '';
        if (existingVT && existingVT.length > 0) {
            var vtMap = new Map();
            for (var ei = 0; ei < existingVT.length; ei++) {
                var eItem = existingVT[ei];
                var eKey = eItem.ma || eItem.MADICHVU || '';
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
            var vtList = Array.from(vtMap.values());
            var existRows = vtList.map(function(item) {
                return '<div class="quyen-vt-existing-item"><span class="quyen-vt-ma">' + escapeHtml(item.ma) + '</span><span class="quyen-vt-ten">' + escapeHtml(item.ten) + '</span><span class="quyen-vt-sl-badge">' + item.sl + ' ' + escapeHtml(item.dvt) + '</span></div>';
            }).join('');
            existingHtml = '<div class="quyen-vt-section"><div class="quyen-vt-section-title">✅ Phiếu VT đang có <span class="quyen-vt-count">' + vtList.length + ' loại</span></div><div class="quyen-vt-existing-list">' + existRows + '</div></div>';
        }

        // ── Suggested VT ──────────────────────────────────────
        var suggestHtml = '';
        if (suggestedVT && suggestedVT.length > 0) {
            var ruleLabel = {
                base:    '🩺 Cơ bản',
                tmc:     '💉 Tiêm bắp/TMC',
                ttm:     '💧 Truyền dịch (TTM)',
                insulin: '🩸 Insulin',
                wound:   '🩹 Vết thương'
            };
            // Group by rule
            var grouped = {};
            for (var si = 0; si < suggestedVT.length; si++) {
                var sItem = suggestedVT[si];
                var r = sItem.rule || 'base';
                if (!grouped[r]) grouped[r] = [];
                grouped[r].push(sItem);
            }

            suggestHtml = '<div class="quyen-vt-section"><div class="quyen-vt-section-title">💡 Gợi ý theo thuốc <span class="quyen-vt-count">' + suggestedVT.length + ' loại</span></div><div class="quyen-vt-suggest-list" id="quyen-vt-suggest-list">';

            var rowIdx = 0;
            var rules = Object.keys(grouped);
            for (var ri = 0; ri < rules.length; ri++) {
                var rule = rules[ri];
                var rItems = grouped[rule];
                suggestHtml += '<div class="quyen-vt-rule-group"><div class="quyen-vt-rule-label">' + (ruleLabel[rule] || rule) + '</div>';
                for (var rii = 0; rii < rItems.length; rii++) {
                    var item = rItems[rii];
                    var isWound = (rule === 'wound');
                    var noteHtml = item.note ? '<div class="quyen-vt-note-text">ℹ️ ' + escapeHtml(item.note) + '</div>' : '';
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

        var kimLuonNote = (suggestedVT && suggestedVT.some(function(v) { return v.ma === 'BO560'; })) ?
            '<div class="quyen-vt-kim-note">📌 <strong>KI306</strong> + <strong>BA365</strong>: thêm khi lắp kim luồn mới (3–4 ngày/lần)</div>' : '';

        var drugTags = '';
        if (drugs && drugs.length > 0) {
            var tagItems = drugs.slice(0, 4).map(function(d) {
                return '<span class="quyen-vt-drug-tag">' + escapeHtml(d.ten ? d.ten.split(' ')[0] : d.ma) + '</span>';
            });
            if (drugs.length > 4) tagItems.push('<span class="quyen-vt-drug-tag">+' + (drugs.length - 4) + '</span>');
            drugTags = '<div class="quyen-vt-drug-summary"><span>💊 Hôm nay: ' + drugs.length + ' thuốc — </span><span class="quyen-vt-drug-tags">' + tagItems.join('') + '</span></div>';
        }

        var actionsHtml = (suggestedVT && suggestedVT.length > 0) ?
            '<div class="quyen-vt-actions"><button class="quyen-vt-copy-btn" id="quyen-vt-copy">📋 Copy danh sách</button></div>' : '';

        _container.innerHTML = '<div class="quyen-vt-wrapper"><div class="quyen-vt-toolbar">' + drugTags + '<button class="quyen-vt-refresh-btn" id="quyen-vt-refresh" title="Đọc lại từ HIS">🔄</button></div>' + existingHtml + suggestHtml + kimLuonNote + actionsHtml + '</div>';

        // Wire events
        var refreshBtn = _container.querySelector('#quyen-vt-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);

        var copyBtn = _container.querySelector('#quyen-vt-copy');
        if (copyBtn) copyBtn.addEventListener('click', function () { copyToClipboard(suggestedVT); });

        // Wire nút Điền
        var fillBtns = _container.querySelectorAll('.quyen-vt-fill-btn');
        for (var fi = 0; fi < fillBtns.length; fi++) {
            (function(btn) {
                btn.addEventListener('click', function () {
                    var idx = parseInt(btn.getAttribute('data-idx'), 10);
                    onClickFill(idx, suggestedVT);
                });
            })(fillBtns[fi]);
        }
    }

    // =========================================================
    // CLICK ĐIỀN
    // =========================================================
    function onClickFill(idx, suggestedVT) {
        var item = suggestedVT && suggestedVT[idx];
        if (!item) return;

        var slInput  = _container.querySelector('#quyen-vt-sl-'   + idx);
        var cdInput  = _container.querySelector('#quyen-vt-cd-'   + idx);
        var fillBtn  = _container.querySelector('#quyen-vt-fill-' + idx);

        var sl       = slInput ? (parseInt(slInput.value, 10) || item.sl) : item.sl;
        var cachdung = cdInput ? cdInput.value.trim() : item.cachdung;

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

        // Timeout fallback 12s
        setTimeout(function () {
            if (_fillingIdx === idx) {
                resetFillBtn(idx, '✚ Điền');
                _fillingIdx = null;
            }
        }, 12000);
    }

    // =========================================================
    // KẾT QUẢ ĐIỀN
    // =========================================================
    function onFillResult(data) {
        var idx = _fillingIdx;
        _fillingIdx = null;

        if (data.success) {
            resetFillBtn(idx, '✅');
            showToast('✅ Đã điền ' + (data.ma || '') + ' vào phiếu!', 'success');
            setTimeout(function () { resetFillBtn(idx, '✚ Điền'); }, 2500);
        } else {
            resetFillBtn(idx, '✚ Điền');
            showToast('❌ ' + (data.error || 'Lỗi điền VT'), 'error');
        }
    }

    function resetFillBtn(idx, label) {
        if (idx === null || idx === undefined) return;
        var btn = _container && _container.querySelector('#quyen-vt-fill-' + idx);
        if (btn) { btn.textContent = label; btn.disabled = false; }
    }

    // =========================================================
    // COPY TO CLIPBOARD
    // =========================================================
    function copyToClipboard(suggestedVT) {
        if (!suggestedVT || suggestedVT.length === 0) return;

        var checkedItems = [];
        var rows = _container ? _container.querySelectorAll('.quyen-vt-suggest-row') : [];
        for (var i = 0; i < rows.length; i++) {
            var row  = rows[i];
            var idx  = parseInt(row.getAttribute('data-idx'), 10);
            var chk  = row.querySelector('.quyen-vt-check');
            var slI  = row.querySelector('.quyen-vt-sl-input');
            var cdI  = row.querySelector('.quyen-vt-cachdung-input');
            if (chk && chk.checked) {
                var item = suggestedVT[idx];
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

        var today = new Date().toLocaleDateString('vi-VN');
        var text  = 'DANH SÁCH VẬT TƯ GỢI Ý — ' + today + '\n' + '═'.repeat(40) + '\n';
        for (var n = 0; n < checkedItems.length; n++) {
            var ci = checkedItems[n];
            text += (n + 1) + '. [' + ci.ma + '] ' + ci.ten + '\n';
            text += '   SL: ' + ci.sl + ' ' + ci.dvt + '  |  ' + ci.huong + '\n';
            if (ci.cachdung) text += '   Cách dùng: ' + ci.cachdung + '\n';
        }
        text += '─'.repeat(40) + '\nTổng: ' + checkedItems.length + ' loại\n⚠️ Kiểm tra lại trước khi lập phiếu';

        navigator.clipboard.writeText(text).then(function () {
            showToast('✅ Đã copy ' + checkedItems.length + ' VT!', 'success');
        }).catch(function () {
            var ta = document.createElement('textarea');
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
            var el = document.createElement('div');
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
