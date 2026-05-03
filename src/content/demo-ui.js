/**
 * __EXT_EMOJI__ __EXT_NAME__ — Demo UI
 * Read-only advance payment reminder.
 */

/* global QuyenLog, QuyenDemoEngine */
/* exported QuyenDemoUI */

const QuyenDemoUI = (function () {
    'use strict';

    let _container = null;
    let _currentRun = 0;
    let _patientUnsub = null;

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, function (m) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
        });
    }

    function formatMoney(value) {
        return QuyenDemoEngine.formatMoney(value || 0);
    }

    function formatDays(value) {
        if (value === null || value === undefined || !isFinite(value)) return 'Chưa rõ';
        if (value < 0) return '0 ngày';
        if (value < 1) return '< 1 ngày';
        return value.toFixed(value < 10 ? 1 : 0).replace('.0', '') + ' ngày';
    }

    function statusLabel(severity) {
        if (severity === 'danger') return 'Cần nhắc ngay';
        if (severity === 'warning') return 'Theo dõi';
        if (severity === 'ok') return 'Ổn';
        return 'Chưa rõ';
    }

    function init(container) {
        _container = container;
        renderIdle();

        if (_patientUnsub) _patientUnsub();
        if (typeof HIS !== 'undefined' && HIS.Message && typeof HIS.Message.listen === 'function') {
            _patientUnsub = HIS.Message.listen('QUYEN_PATIENT_SELECTED', handlePatientSelected);
        } else {
            window.addEventListener('message', handleLegacyMessage);
            _patientUnsub = function () { window.removeEventListener('message', handleLegacyMessage); };
        }

        // ★ Lắng nghe cập nhật tự động khi panel THÔNG TIN ĐIỀU TRỊ mở ra
        window.addEventListener('message', handleFinancePanelUpdate);

        const currentPatient = QuyenDemoEngine.getCurrentPatient();
        if (currentPatient && currentPatient.khambenhId) refresh();
        QuyenLog.info('Demo advance payment UI initialized');
    }

    function handleFinancePanelUpdate(event) {
        if (!event.data || event.data.type !== 'QUYEN_FINANCE_PANEL_UPDATE') return;
        if (typeof HIS !== 'undefined' && HIS.Message && !HIS.Message.isValid(event)) return;
        const currentPatient = QuyenDemoEngine.getCurrentPatient();
        if (!currentPatient || !currentPatient.khambenhId) return;
        if (String(event.data.khambenhId) !== String(currentPatient.khambenhId)) return;
        // Panel mở và có dữ liệu đầy đủ → re-render
        QuyenLog.info('💰 Auto-update Demo tab: panel viện phí mở, render lại');
        refresh();
    }

    function handleLegacyMessage(event) {
        if (!event.data) return;
        if (typeof HIS !== 'undefined' && HIS.Message && !HIS.Message.isValid(event)) return;
        if (event.data.type !== 'QUYEN_PATIENT_SELECTED') return;
        handlePatientSelected(event.data);
    }

    function handlePatientSelected(data) {
        const patient = (data && data.patient) || {};
        const seq = (data && data.seq) || Date.now();
        QuyenDemoEngine.setPatient(patient, null, seq);
        refresh();
        setTimeout(function () { refresh(); }, 1200);
        setTimeout(function () { refresh(); }, 2800);
    }

    function renderShell(title, subtitle, bodyHtml, buttonDisabled) {
        if (!_container) return;
        _container.innerHTML = [
            '<div class="quyen-demo-wrapper quyen-advance-wrapper">',
            '  <div class="quyen-demo-head">',
            '    <div>',
            '      <div class="quyen-demo-title">' + escapeHtml(title) + '</div>',
            '      <div class="quyen-demo-subtitle">' + escapeHtml(subtitle) + '</div>',
            '    </div>',
            '    <button class="quyen-demo-refresh" id="quyen-demo-refresh" title="Tải lại"' + (buttonDisabled ? ' disabled' : '') + '>↻</button>',
            '  </div>',
            bodyHtml,
            '</div>'
        ].join('');
        bindRefresh();
    }

    function renderIdle() {
        renderShell(
            'Nhắc tạm ứng',
            'Chọn bệnh nhân để dự đoán tiền ứng còn đủ trong bao lâu.',
            '<div class="quyen-demo-empty">Chưa có dữ liệu bệnh nhân.</div>',
            false
        );
    }

    function renderLoading() {
        const patient = QuyenDemoEngine.getCurrentPatient() || {};
        renderShell(
            'Nhắc tạm ứng',
            (patient.name || 'Bệnh nhân đang chọn') + (patient.khambenhId ? ' #' + patient.khambenhId : ''),
            '<div class="quyen-demo-empty">Đang đọc thông tin viện phí...</div>',
            true
        );
    }

    function renderResult(result) {
        const p = result.patient || {};
        let html = '';

        html += '<div class="quyen-advance-status quyen-advance-' + escapeHtml(result.severity || 'unknown') + '">';
        html += '<div class="quyen-advance-status-top">';
        html += '<span>' + escapeHtml(statusLabel(result.severity)) + '</span>';
        html += '<b>' + escapeHtml(result.title || 'Nhắc tạm ứng') + '</b>';
        html += '</div>';
        html += '<p>' + escapeHtml(result.message || '') + '</p>';
        html += '</div>';

        if (result.metrics && result.metrics.length) {
            html += '<div class="quyen-advance-metrics">';
            for (let i = 0; i < result.metrics.length; i++) {
                const m = result.metrics[i];
                const value = m.type === 'days' ? formatDays(m.value) : formatMoney(m.value);
                html += '<div class="quyen-advance-metric">';
                html += '<span>' + escapeHtml(m.label) + '</span>';
                html += '<b>' + escapeHtml(value) + '</b>';
                html += '</div>';
            }
            html += '</div>';
        }

        if (result.recommendation) {
            html += '<div class="quyen-advance-recommend">';
            html += '<b>Gợi ý nhắc</b>';
            html += '<span>' + escapeHtml(result.recommendation) + '</span>';
            html += '</div>';
        }

        html += '<div class="quyen-advance-note">';
        html += result.insured === false ? 'Không thấy BHYT trong dữ liệu bệnh nhân.' : 'Có BHYT hoặc chưa xác định cần kiểm tra thêm.';
        html += ' Số liệu chỉ dùng để nhắc kiểm tra, không thay thế màn hình viện phí.';
        html += '</div>';

        renderShell(
            'Nhắc tạm ứng',
            (p.name || 'Bệnh nhân đang chọn') + (p.khambenhId ? ' #' + p.khambenhId : ''),
            html,
            false
        );
    }

    function bindRefresh() {
        const btn = document.getElementById('quyen-demo-refresh');
        if (btn) btn.addEventListener('click', refresh);
    }

    async function refresh() {
        if (!_container) return;
        const run = ++_currentRun;
        renderLoading();
        try {
            const result = await QuyenDemoEngine.summarize();
            if (run !== _currentRun) return;
            renderResult(result);
        } catch (e) {
            if (run !== _currentRun) return;
            renderShell(
                'Nhắc tạm ứng',
                'Không đọc được dữ liệu viện phí.',
                '<div class="quyen-demo-empty">Demo lỗi: ' + escapeHtml(e.message || e) + '</div>',
                false
            );
        }
    }

    return {
        init: init,
        refresh: refresh
    };
})();
