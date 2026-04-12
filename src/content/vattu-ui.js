/**
 * __EXT_EMOJI__ __EXT_NAME__ — Vật Tư UI
 * Tab "🧰 Vật tư" trong floating panel — hiển thị gợi ý VT theo thuốc
 *
 * [BETA] — Phase 1: Read-only suggestion, không tự tạo phiếu HIS
 */

/* global QuyenLog, QuyenVatTuEngine */
/* exported QuyenVatTuUI */

const QuyenVatTuUI = (function () {
    'use strict';

    let _container = null;
    let _lastResult = null;
    let _loading = false;

    // =========================================================
    // INIT
    // =========================================================
    function init(container) {
        _container = container;
        renderIdle();
        QuyenLog.info('🧰 VatTuUI initialized');

        // Lắng nghe patient change
        window.addEventListener('message', function (event) {
            if (!event.data) return;
            if (event.data.type === 'QUYEN_PATIENT_SELECTED') {
                _lastResult = null;
                renderLoading('Đang tải dữ liệu thuốc...');
                // Delay nhỏ để bridge xử lý xong patient selection trước
                setTimeout(function () { refresh(); }, 800);
            }
        });
    }

    // =========================================================
    // PUBLIC: onPatientChange (gọi từ ui-panel.js nếu cần)
    // =========================================================
    function onPatientChange(patientData) {
        // Handled via message listener, but we can call refresh manually
        _lastResult = null;
        renderLoading('Đang tải dữ liệu...');
        setTimeout(function () { refresh(); }, 800);
    }

    // =========================================================
    // REFRESH — Gọi engine phân tích
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
    // RENDER: Idle (chưa chọn BN)
    // =========================================================
    function renderIdle() {
        if (!_container) return;
        _container.innerHTML = `
            <div class="quyen-vt-wrapper">
                <div class="quyen-vt-idle">
                    <div style="font-size:32px; margin-bottom:8px;">🧰</div>
                    <div style="color:#aaa; font-size:12px;">Chọn bệnh nhân để xem gợi ý vật tư</div>
                </div>
            </div>`;
    }

    // =========================================================
    // RENDER: Loading
    // =========================================================
    function renderLoading(msg) {
        if (!_container) return;
        _container.innerHTML = `
            <div class="quyen-vt-wrapper">
                <div class="quyen-vt-loading">
                    <div class="quyen-vt-spinner"></div>
                    <div>${msg || 'Đang tải...'}</div>
                </div>
            </div>`;
    }

    // =========================================================
    // RENDER: Error
    // =========================================================
    function renderError(msg) {
        if (!_container) return;
        _container.innerHTML = `
            <div class="quyen-vt-wrapper">
                <div class="quyen-vt-error">
                    <div style="font-size:20px; margin-bottom:6px;">⚠️</div>
                    <div style="font-size:12px; color:#c62828;">${escapeHtml(msg)}</div>
                    <button class="quyen-btn quyen-vt-retry-btn" id="quyen-vt-retry" style="margin-top:10px; background:#e91e63; color:#fff; padding:5px 14px; border-radius:7px; border:none; cursor:pointer; font-size:12px;">🔄 Thử lại</button>
                </div>
            </div>`;
        const retryBtn = _container.querySelector('#quyen-vt-retry');
        if (retryBtn) retryBtn.addEventListener('click', refresh);
    }

    // =========================================================
    // RENDER: Result
    // =========================================================
    function renderResult(result) {
        if (!_container) return;
        const { suggestedVT, existingVT, drugs } = result;

        // Build existing VT HTML (từ HIS)
        let existingHtml = '';
        if (existingVT && existingVT.length > 0) {
            // Dedup existing VT by mã
            const vtMap = new Map();
            for (const item of existingVT) {
                const key = item.ma || item.MADICHVU || '';
                if (!vtMap.has(key)) {
                    vtMap.set(key, {
                        ma:  key,
                        ten: item.ten || item.TENDICHVU || key,
                        sl:  parseInt(item.sl || item.SOLUONG || 1, 10),
                        dvt: item.dvt || item.DVT || '',
                    });
                } else {
                    vtMap.get(key).sl += parseInt(item.sl || item.SOLUONG || 1, 10);
                }
            }
            const vtList = [...vtMap.values()];
            existingHtml = `
            <div class="quyen-vt-section">
                <div class="quyen-vt-section-title">✅ Phiếu VT đang có <span class="quyen-vt-count">${vtList.length} loại</span></div>
                <div class="quyen-vt-existing-list">
                    ${vtList.map(item => `
                    <div class="quyen-vt-existing-item">
                        <span class="quyen-vt-ma">${escapeHtml(item.ma)}</span>
                        <span class="quyen-vt-ten">${escapeHtml(item.ten)}</span>
                        <span class="quyen-vt-sl-badge">${item.sl} ${escapeHtml(item.dvt)}</span>
                    </div>`).join('')}
                </div>
            </div>`;
        }

        // Build suggested VT HTML
        let suggestHtml = '';
        if (suggestedVT && suggestedVT.length > 0) {
            // Group by rule for label
            const ruleLabel = { base: '🩺 Cơ bản', tmc: '💉 Tiêm bắp/TMC', ttm: '💧 Truyền dịch (TTM)', insulin: '🩸 Insulin', wound: '🩹 Vết thương' };
            const grouped = {};
            for (const item of suggestedVT) {
                const r = item.rule || 'base';
                if (!grouped[r]) grouped[r] = [];
                grouped[r].push(item);
            }

            suggestHtml = `
            <div class="quyen-vt-section">
                <div class="quyen-vt-section-title">💡 Gợi ý theo thuốc <span class="quyen-vt-count">${suggestedVT.length} loại</span></div>
                <div class="quyen-vt-suggest-list" id="quyen-vt-suggest-list">`;

            let rowIdx = 0;
            for (const [rule, items] of Object.entries(grouped)) {
                suggestHtml += `<div class="quyen-vt-rule-group">
                    <div class="quyen-vt-rule-label">${ruleLabel[rule] || rule}</div>`;
                for (const item of items) {
                    const isWound = rule === 'wound';
                    suggestHtml += `
                    <div class="quyen-vt-suggest-row${isWound ? ' quyen-vt-wound' : ''}" data-idx="${rowIdx}">
                        <input type="checkbox" class="quyen-vt-check" id="quyen-vt-chk-${rowIdx}" data-idx="${rowIdx}" ${isWound ? '' : 'checked'}>
                        <label for="quyen-vt-chk-${rowIdx}" class="quyen-vt-suggest-label">
                            <span class="quyen-vt-ma">${escapeHtml(item.ma)}</span>
                            <span class="quyen-vt-ten">${escapeHtml(item.ten)}</span>
                        </label>
                        <div class="quyen-vt-sl-ctrl">
                            <input type="number" class="quyen-vt-sl-input" 
                                data-idx="${rowIdx}" value="${item.sl}" min="1" max="99"
                                id="quyen-vt-sl-${rowIdx}">
                            <span class="quyen-vt-dvt">${escapeHtml(item.dvt)}</span>
                        </div>
                        <span class="quyen-vt-huong">${escapeHtml(item.huong || '')}</span>
                        ${item.note ? `<span class="quyen-vt-note" title="${escapeHtml(item.note)}">ℹ️</span>` : ''}
                    </div>`;
                    rowIdx++;
                }
                suggestHtml += `</div>`;
            }
            suggestHtml += `</div></div>`;
        } else if (drugs && drugs.length === 0) {
            suggestHtml = `<div class="quyen-vt-empty">Không tìm thấy thuốc hôm nay.<br>Có thể chưa có phiếu thuốc.</div>`;
        } else {
            suggestHtml = `<div class="quyen-vt-empty">Không gợi ý thêm VT nào.<br>(BN chỉ có thuốc Uống)</div>`;
        }

        // Note về kim luồn
        const kimLuonNote = suggestedVT.some(v => v.ma === 'BO560') ?
            `<div class="quyen-vt-kim-note">📌 Kim luồn TM <strong>KI306</strong> + băng dính <strong>BA365</strong>: thêm vào khi lắp kim luồn mới (3–4 ngày/lần)</div>` : '';

        // Drug summary
        const drugSummary = drugs && drugs.length > 0 ?
            `<div class="quyen-vt-drug-summary">
                <span>💊 Thuốc hôm nay: ${drugs.length} loại —</span>
                <span class="quyen-vt-drug-tags">${drugs.slice(0,4).map(d => `<span class="quyen-vt-drug-tag">${escapeHtml(d.ten ? d.ten.split(' ')[0] : d.ma)}</span>`).join('')}${drugs.length > 4 ? `<span class="quyen-vt-drug-tag">+${drugs.length - 4}</span>` : ''}</span>
            </div>` : '';

        _container.innerHTML = `
            <div class="quyen-vt-wrapper">
                <div class="quyen-vt-toolbar">
                    ${drugSummary}
                    <button class="quyen-vt-refresh-btn" id="quyen-vt-refresh" title="Đọc lại từ HIS">🔄</button>
                </div>
                ${existingHtml}
                ${suggestHtml}
                ${kimLuonNote}
                ${suggestedVT && suggestedVT.length > 0 ? `
                <div class="quyen-vt-actions">
                    <button class="quyen-vt-copy-btn" id="quyen-vt-copy">📋 Copy danh sách</button>
                </div>` : ''}
            </div>`;

        // Wire up events
        const refreshBtn = _container.querySelector('#quyen-vt-refresh');
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);

        const copyBtn = _container.querySelector('#quyen-vt-copy');
        if (copyBtn) copyBtn.addEventListener('click', function () { copyToClipboard(suggestedVT); });
    }

    // =========================================================
    // COPY TO CLIPBOARD
    // =========================================================
    function copyToClipboard(suggestedVT) {
        if (!suggestedVT || suggestedVT.length === 0) return;

        // Lấy chỉ những item được check
        const checkedItems = [];
        const list = _container ? _container.querySelectorAll('.quyen-vt-suggest-row') : [];
        list.forEach(function (row) {
            const idx = row.getAttribute('data-idx');
            const chk = row.querySelector('.quyen-vt-check');
            const slInput = row.querySelector('.quyen-vt-sl-input');
            if (chk && chk.checked) {
                const item = suggestedVT[parseInt(idx, 10)];
                if (item) {
                    const sl = slInput ? slInput.value : item.sl;
                    checkedItems.push({ ...item, sl });
                }
            }
        });

        if (checkedItems.length === 0) {
            showToast('Không có VT nào được chọn!', 'warning');
            return;
        }

        const today = new Date().toLocaleDateString('vi-VN');
        let text = `DANH SÁCH VẬT TƯ GỢI Ý — ${today}\n`;
        text += '═'.repeat(40) + '\n';
        let n = 1;
        for (const item of checkedItems) {
            text += `${n}. [${item.ma}] ${item.ten}\n`;
            text += `   SL: ${item.sl} ${item.dvt}  |  ${item.huong}\n`;
            if (item.note) text += `   ℹ️ ${item.note}\n`;
            n++;
        }
        text += '─'.repeat(40) + '\n';
        text += `Tổng: ${checkedItems.length} loại vật tư\n`;
        text += '⚠️ Điều dưỡng kiểm tra lại trước khi lập phiếu';

        navigator.clipboard.writeText(text).then(function () {
            showToast('✅ Đã copy ' + checkedItems.length + ' VT vào clipboard!', 'success');
        }).catch(function () {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('✅ Đã copy!', 'success');
        });
    }

    // =========================================================
    // TOAST (dùng chung)
    // =========================================================
    function showToast(msg, type) {
        if (typeof QuyenUI !== 'undefined' && QuyenUI.showToast) {
            QuyenUI.showToast(msg, type);
        } else {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#333;color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;z-index:100002;';
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(function () { el.remove(); }, 2500);
        }
    }

    // =========================================================
    // UTILS
    // =========================================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
