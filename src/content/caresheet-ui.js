/**
 * __EXT_EMOJI__ __EXT_NAME__ — Care Sheet UI
 * Tab "Phiếu chăm sóc" trong floating panel
 * 
 * Approach: Mẫu mặc định trống cho sinh hiệu, ĐD nhập tay hoặc lấy từ vitals thật.
 * Các mục phi sinh tồn có giá trị mặc định hợp lý.
 */

/* global QuyenLog, CARESHEET_CONFIG, QuyenCareSheetFiller, QuyenUI */
/* exported QuyenCareSheetUI */

const QuyenCareSheetUI = (function () {

    let _container = null;
    let _customValues = {};
    let _customSectionFilter = null; // null = show all; array = show only these indices

    // ==========================================
    // INIT
    // ==========================================
    function init(container) {
        _container = container;
        renderUI();
        QuyenLog.info('📋 Care Sheet UI initialized');
    }

    // ==========================================
    // RENDER UI
    // ==========================================
    function renderUI() {
        if (!_container) return;

        // Load saved fill mode from localStorage
        const _fillMode = localStorage.getItem('quyen_cs_fillmode') || 'full';

        _container.innerHTML = `
            <div class="quyen-cs-wrapper">
                <!-- Top: Mode selector + Fill button + refresh -->
                <div class="quyen-cs-top-actions" style="display:flex;flex-direction:column;gap:6px;">
                    <div style="display:flex;gap:6px;align-items:center;">
                        <select id="quyen-cs-mode" style="flex:1;padding:4px 8px;border-radius:6px;border:1px solid #ddd;font-size:11px;background:#fff;color:#333;cursor:pointer;">
                            <option value="full" ${_fillMode === 'full' ? 'selected' : ''}>📋 Đầy đủ</option>
                            <option value="simple" ${_fillMode === 'simple' ? 'selected' : ''}>⚡ Đơn giản (1-6)</option>
                            <option value="custom" ${_fillMode === 'custom' ? 'selected' : ''}>⚙️ Tùy chọn</option>
                        </select>
                        <button class="quyen-btn quyen-btn-cs-fill" id="quyen-btn-cs-fill" disabled style="padding:4px 14px;border-radius:6px;border:none;background:#4CAF50;color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">✨ Điền</button>
                        <button class="quyen-btn-cs-refresh" id="quyen-btn-cs-generate" title="Đặt lại mặc định" style="font-size:14px;background:#e91e8c;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;color:#fff;">🔄</button>
                    </div>
                    <div id="quyen-cs-custom-sections" style="display:none;">
                    </div>
                </div>

                <!-- Feedback Wrapper -->
                <div class="quyen-cs-feedback-wrapper" style="margin-bottom: 8px;">
                    <!-- Status Important Info -->
                    <div class="quyen-cs-status" id="quyen-cs-status" style="display:none;"></div>
                    
                    <!-- Real-time Steps Log -->
                    <div class="quyen-cs-steps-container" id="quyen-cs-steps-container" style="display:none; margin-top:6px; padding: 6px 10px; background: rgba(0,0,0,0.02); border: 1px dashed #c0c0c0; border-radius: 6px;">
                        <div style="font-size: 10px; color: #777; font-weight: 600; margin-bottom: 4px; text-transform: uppercase;">Tiến trình hoạt động</div>
                        <ul id="quyen-cs-steps-list" style="margin:0; padding-left: 0; list-style-type: none; font-size: 11px; color: #444; display: flex; flex-direction: column; gap: 4px;">
                        </ul>
                    </div>
                </div>
                <style>
                    @keyframes quyen-fade-in-up { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
                    .quyen-step-item { 
                        animation: quyen-fade-in-up 0.3s ease; 
                        display: flex; 
                        align-items: flex-start; 
                        line-height: 1.4;
                        position: relative;
                        padding-bottom: 8px;
                    }
                    /* Vertical line connecting steps */
                    .quyen-step-item:not(:last-child)::before {
                        content: '';
                        position: absolute;
                        top: 18px;
                        left: 7px;
                        bottom: -2px;
                        width: 2px;
                        background: #e0e0e0;
                        border-radius: 1px;
                        z-index: 1;
                    }
                    .quyen-step-icon { 
                        margin-right: 8px; 
                        flex-shrink: 0; 
                        position: relative;
                        z-index: 2;
                        background: #fafafa;
                        border-radius: 50%;
                        width: 16px;
                        height: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                    }
                </style>

                <!-- Editable Fields -->
                <div class="quyen-cs-section">
                    <div class="quyen-cs-section-title">✏️ Xem / Chỉnh sửa <span class="quyen-cs-hint">(kéo xuống nếu cần)</span></div>
                    <div class="quyen-cs-fields" id="quyen-cs-fields">
                        <div class="quyen-cs-empty">Đang tạo giá trị...</div>
                    </div>
                </div>
            </div>
        `;

        setupActions();

        // Load mẫu mặc định (sinh hiệu trống, phi sinh tồn có default)
        loadDefaultValues();

        // Auto-detect patient name
        detectPatientInfo();
    }

    // ==========================================
    // PATIENT INFO + VITALS — Auto-detect from Bridge
    // ==========================================
    let _cachedVitals = null;
    let _cachedPatient = null;
    let _vitalsRequested = false;

    // ★ SAFETY v2: Track BN hiện tại để validate incoming care sheet data
    let _currentPatientSeq = 0;
    let _currentKhambenhId = '';

    // Listen for patient selection from Bridge (jqGrid hook)
    window.addEventListener('message', function (event) {
        if (!event.data) return;
        // ★ SPRINT C: Origin + type validation
        if (typeof HIS !== 'undefined' && HIS.Message && !HIS.Message.isValid(event)) return;

        // Khi Bridge phát hiện chọn BN mới (từ grid)
        if (event.data.type === 'QUYEN_PATIENT_SELECTED') {
            const p = event.data.patient || {};
            const v = event.data.vitals || {};
            _cachedPatient = p;
            _cachedVitals = v;

            // ★ SAFETY v2: Cập nhật patient tracking
            _currentPatientSeq = event.data.seq || 0;
            _currentKhambenhId = p.khambenhId || '';
            QuyenLog.info('👤 BN selected | seq:', _currentPatientSeq, '| KB:', _currentKhambenhId);

            // ★ BUG-02: Reset toàn bộ sinh hiệu + cân nặng + BMI trong _customValues khi đổi BN
            const VITAL_RESET_KEYS = ['nhipTim', 'nhietDo', 'huyetAp', 'nhipTho', 'spO2', 'canNang', 'bmi'];
            for (let vri = 0; vri < VITAL_RESET_KEYS.length; vri++) {
                _customValues[VITAL_RESET_KEYS[vri]] = '';
            }
            // Reset các input trên panel tương ứng
            for (let vri2 = 0; vri2 < VITAL_RESET_KEYS.length; vri2++) {
                const vInput = document.querySelector('#quyen-cs-fields input[data-field-key="' + VITAL_RESET_KEYS[vri2] + '"]');
                if (vInput) {
                    vInput.value = '';
                    vInput.style.borderColor = '';
                    vInput.style.background = '';
                    vInput.style.boxShadow = '';
                    vInput.title = '';
                }
            }
            // Xóa banner cảnh báo sinh hiệu cũ (nếu có)
            const oldAlert = document.getElementById('quyen-vital-alert');
            if (oldAlert) oldAlert.remove();

            // ★ SPRINT B: set target hint cho patient-lock
            if (typeof HIS !== 'undefined' && HIS.PatientLock) {
                HIS.PatientLock.setTargetHint(p);
            }

            // Prefill vitals mới (nếu có)
            prefillVitalsToPanel(v);

            // Reset Section 4 fields khi chuyển BN
            resetSection4InPanel();

            clearExtensionSteps();
            addExtensionStep('Chọn BN: ' + (p.name || 'Mới') + (p.khambenhId ? ` (#${p.khambenhId})` : ''), 'done');
        }

        // Fallback: vitals result từ REQ_VITALS
        if (event.data.type === 'QUYEN_VITALS_RESULT') {
            _cachedVitals = event.data.vitals || {};
            QuyenLog.info('⚖️ Vitals nhận:', JSON.stringify(_cachedVitals));
            prefillVitalsToPanel(_cachedVitals);
            addExtensionStep('Tải xong sinh hiệu & cân nặng (NT.006)', 'done');
        }

        // ★ Auto-prefill từ phiếu cũ (KHÔNG bao gồm Section 4 — Cơ quan bệnh luôn để trống)
        if (event.data.type === 'QUYEN_CARESHEET_SEC4_DATA') {
            // ★ SAFETY v2: Validate seq + khambenhId trước khi prefill
            const msgSeq = event.data.seq;
            const msgKB = event.data.khambenhId || '';
            if (_currentPatientSeq > 0 && msgSeq === undefined) {
                QuyenLog.warn('📋 UI: DROPPED SEC4 data — missing seq');
                return;
            }
            if (msgSeq !== undefined && msgSeq !== _currentPatientSeq) {
                QuyenLog.warn('📋 UI: DROPPED SEC4 data — seq stale (' + msgSeq + ' != ' + _currentPatientSeq + ')');
                return;
            }
            if (msgKB && _currentKhambenhId && msgKB !== _currentKhambenhId) {
                QuyenLog.warn('📋 UI: DROPPED SEC4 data — KB mismatch (' + msgKB + ' != ' + _currentKhambenhId + ')');
                return;
            }

            // ★ KHÔNG prefill Section 4 (Cơ quan bệnh) nữa — chỉ lấy cân nặng
            if (event.data.weight) {
                _customValues.canNang = event.data.weight;
                const weightInput = document.querySelector('#quyen-cs-fields input[data-field-key="canNang"]');
                if (weightInput) {
                    weightInput.value = event.data.weight;
                    highlightInput(weightInput);
                }
            }

            // ★ Prefill sinh hiệu từ phiếu cũ vào panel (dữ liệu thật)
            if (event.data.vitalsFromPrev) {
                prefillOldVitalsToPanel(event.data.vitalsFromPrev);
            }
            
            const fetchedItems = [];
            if (event.data.weight) fetchedItems.push('Cân nặng');
            if (event.data.vitalsFromPrev && Object.keys(event.data.vitalsFromPrev).length > 0) fetchedItems.push('Sinh hiệu');
            // Section 4 (Cơ quan bệnh) + Section 17 (Can thiệp ĐD) — KHÔNG copy (tránh nhầm BN)
            
            addExtensionStep('Nạp phiếu cũ: ' + (fetchedItems.length > 0 ? fetchedItems.join(', ') : 'Không có dữ liệu mới'), 'done');
        }
    });


    /** Pre-fill weight + BMI vào ô chỉnh sửa trên panel */
    function prefillVitalsToPanel(vitals) {
        if (!vitals) return;

        // ★ FIX: Luôn lưu vào _customValues TRƯỚC — dù DOM chưa sẵn sàng
        if (vitals.weight) {
            _customValues.canNang = vitals.weight;
            const weightInput = document.querySelector('#quyen-cs-fields input[data-field-key="canNang"]');
            if (weightInput) {
                weightInput.value = vitals.weight;
                highlightInput(weightInput);
            }
            QuyenLog.info('⚖️ Đã prefill cân nặng:', vitals.weight + 'kg');
        }

        // Tính BMI nếu có cả cân nặng + chiều cao
        if (vitals.weight && vitals.height) {
            const w = parseFloat(vitals.weight);
            const h = parseFloat(vitals.height) / 100; // cm → m
            if (w > 0 && h > 0) {
                const bmi = (w / (h * h)).toFixed(1);
                _customValues.bmi = bmi;
                const bmiInput = document.querySelector('#quyen-cs-fields input[data-field-key="bmi"]');
                if (bmiInput) {
                    bmiInput.value = bmi;
                    highlightInput(bmiInput);
                }
                QuyenLog.info('📊 Đã prefill BMI:', bmi, '(CN=' + vitals.weight + ', CC=' + vitals.height + ')');
            }
        }
    }

    /** ★ Pre-fill sinh hiệu từ phiếu cũ vào panel (dữ liệu thật, ĐD có thể sửa) */
    function prefillOldVitalsToPanel(vitals) {
        if (!vitals) return;

        // Khoảng bình thường người lớn
        const VITAL_RANGES = {
            nhipTim:  { min: 60,  max: 100, unit: 'l/p', label: 'Mạch' },
            nhietDo:  { min: 36,  max: 37.5, unit: '°C', label: 'Nhiệt độ' },
            nhipTho:  { min: 16,  max: 25,  unit: 'l/p', label: 'Nhịp thở' },
            spO2:     { min: 95,  max: 100, unit: '%',   label: 'SpO2' },
            huyetAp:  { label: 'Huyết áp' } // xử lý riêng (systolic/diastolic)
        };

        const VITAL_KEYS = [
            { key: 'nhipTim', label: 'Mạch' },
            { key: 'nhietDo', label: 'Nhiệt độ' },
            { key: 'huyetAp', label: 'Huyết áp' },
            { key: 'nhipTho', label: 'Nhịp thở' },
            { key: 'spO2', label: 'SpO2' }
        ];
        let count = 0;
        const warnings = [];

        for (let i = 0; i < VITAL_KEYS.length; i++) {
            const vk = VITAL_KEYS[i];
            const val = vitals[vk.key];
            if (!val) continue;

            const input = document.querySelector('#quyen-cs-fields input[data-field-key="' + vk.key + '"]');
            if (input) {
                input.value = val;
                _customValues[vk.key] = val;
                highlightInput(input);
                count++;

                // ★ Kiểm tra khoảng bình thường
                const warning = checkVitalRange(vk.key, val, VITAL_RANGES);
                if (warning) {
                    warnings.push(warning);
                    markInputWarning(input, warning);
                }
            }
        }

        if (count > 0) {
            QuyenLog.info('📋 Đã prefill ' + count + ' sinh hiệu từ phiếu cũ (dữ liệu thật)');
            if (warnings.length > 0) {
                showVitalWarningBanner(warnings);
                setStatus('⚠️ ' + warnings.length + ' sinh hiệu bất thường!', 'warning');
                QuyenLog.warn('⚠️ Sinh hiệu bất thường:', warnings.join('; '));
            } else {
                setStatus('📋 Sinh hiệu từ phiếu cũ (' + count + ' mục) — tất cả bình thường ✓', 'success');
            }
        }
    }

    /** Kiểm tra giá trị sinh hiệu có trong khoảng bình thường */
    function checkVitalRange(key, value, ranges) {
        const range = ranges[key];
        if (!range) return null;

        // Huyết áp: "130/80" → check systolic + diastolic
        if (key === 'huyetAp') {
            const parts = String(value).split('/');
            if (parts.length === 2) {
                const sys = parseFloat(parts[0]);
                const dia = parseFloat(parts[1]);
                const msgs = [];
                if (!isNaN(sys) && (sys < 90 || sys > 140)) msgs.push('TT=' + sys);
                if (!isNaN(dia) && (dia < 60 || dia > 90)) msgs.push('TTr=' + dia);
                if (msgs.length > 0) return 'HA bất thường (' + msgs.join(', ') + ')';
            }
            return null;
        }

        const num = parseFloat(value);
        if (isNaN(num)) return null;

        if (num < range.min || num > range.max) {
            return range.label + ' = ' + value + '  (BT: ' + range.min + '–' + range.max + range.unit + ')';
        }
        return null;
    }

    /** Đánh dấu input bất thường — viền đỏ */
    function markInputWarning(input, warningText) {
        input.style.borderColor = '#dc3545';
        input.style.backgroundColor = '#fff5f5';
        input.style.boxShadow = '0 0 0 2px rgba(220,53,69,0.25)';
        input.title = '⚠️ ' + warningText;
    }

    /** ★ Banner cảnh báo sinh hiệu bất thường — nổi bật, dễ thấy */
    function showVitalWarningBanner(warnings) {
        // Xóa banner cũ
        const old = document.getElementById('quyen-vital-alert');
        if (old) old.remove();

        const banner = document.createElement('div');
        banner.id = 'quyen-vital-alert';
        banner.style.cssText = [
            'background: linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
            'color: #fff',
            'padding: 10px 14px',
            'border-radius: 8px',
            'margin: 8px 0',
            'font-size: 12px',
            'line-height: 1.5',
            'box-shadow: 0 2px 8px rgba(220,53,69,0.3)',
            'animation: quyen-shake 0.5s ease-in-out'
        ].join(';');

        // ★ BUG-07: Escape HTML trong warnings để chống XSS
        function escapeWarningText(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        const lines = ['<div style="font-size:14px; font-weight:700; margin-bottom:4px">🚨 SINH HIỆU BẤT THƯỜNG</div>'];
        for (let i = 0; i < warnings.length; i++) {
            lines.push('<div style="padding:2px 0">• ' + escapeWarningText(warnings[i]) + '</div>');
        }
        lines.push('<div style="margin-top:6px; font-size:11px; opacity:0.9">⬆ ĐD kiểm tra và sửa trước khi điền phiếu</div>');
        lines.push('<button id="quyen-vital-alert-close" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#fff;font-size:16px;cursor:pointer;opacity:0.7">✕</button>');

        banner.innerHTML = lines.join('');
        banner.style.position = 'relative';

        // Chèn vào đầu phần XEM / CHỈNH SỬA
        const fieldsContainer = document.getElementById('quyen-cs-fields');
        if (fieldsContainer) {
            fieldsContainer.parentNode.insertBefore(banner, fieldsContainer);
        }

        // Close button
        setTimeout(function() {
            const closeBtn = document.getElementById('quyen-vital-alert-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    banner.style.transition = 'opacity 0.3s';
                    banner.style.opacity = '0';
                    setTimeout(function() { banner.remove(); }, 300);
                });
            }
        }, 100);

        // Thêm animation shake
        if (!document.getElementById('quyen-shake-style')) {
            const style = document.createElement('style');
            style.id = 'quyen-shake-style';
            style.textContent = '@keyframes quyen-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-4px)} 40%{transform:translateX(4px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)} }';
            document.head.appendChild(style);
        }
    }

    /** ★ Pre-fill Section 4 "Cơ quan bệnh" vào panel khi nhận từ bridge */
    function prefillSection4ToPanel(data) {
        if (!data) return;

        const sec4 = data.data || {};
        const sec17 = data.sec17 || {};
        const phieuId = data.phieuId || '?';

        // Map CT_FORM_ID → field key
        const sec4Map = {
            '1169': 'coQuanBenh1',
            '1170': 'coQuanBenh2',
            '1171': 'coQuanBenh3',
            '1232': 'coQuanBenh4'
        };

        // Điền Section 4
        for (const ctId in sec4Map) {
            if (!Object.prototype.hasOwnProperty.call(sec4Map, ctId)) continue;
            const fieldKey = sec4Map[ctId];
            const value = sec4[ctId] || '';
            const input = document.querySelector('#quyen-cs-fields input[data-field-key="' + fieldKey + '"]');
            if (input && value) {
                input.value = value;
                _customValues[fieldKey] = value;
                highlightInput(input);
            }
        }

        // ★ FIX: Luôn lưu cân nặng vào _customValues TRƯỚC — dù DOM chưa sẵn sàng
        if (data.weight) {
            _customValues.canNang = data.weight;
            const weightInput = document.querySelector('#quyen-cs-fields input[data-field-key="canNang"]');
            if (weightInput) {
                weightInput.value = data.weight;
                highlightInput(weightInput);
            }
        }

        const sec4Count = Object.keys(sec4).length;
        const sec17Count = Object.keys(sec17).length;

        if (sec4Count > 0 || sec17Count > 0) {
            let msg = '📋 Đã điền ' + sec4Count + ' mục + ';
            if (data.weight) msg += 'Cân nặng: ' + data.weight + 'kg';
            msg += ' | Phiếu cũ #' + phieuId;
            if (sec17Count > 0) msg += ' → ' + sec17Count + ' ô';
            setStatus(msg, 'success');
            QuyenLog.info('📋 Auto-prefill panel: Sec4=' + sec4Count + ', Sec17=' + sec17Count + ', CN=' + (data.weight || 'N/A'));
        }
    }

    /** Reset Section 4 fields trong panel (khi chuyển BN) */
    function resetSection4InPanel() {
        const sec4Keys = ['coQuanBenh1', 'coQuanBenh2', 'coQuanBenh3', 'coQuanBenh4'];
        for (let i = 0; i < sec4Keys.length; i++) {
            const input = document.querySelector('#quyen-cs-fields input[data-field-key="' + sec4Keys[i] + '"]');
            if (input) {
                input.value = '';
                _customValues[sec4Keys[i]] = '';
                input.style.borderColor = '';
                input.style.background = '';
            }
        }
    }

    /** Highlight input xanh tam thời (dùng chung) */
    function highlightInput(input) {
        input.style.borderColor = '#4caf50';
        input.style.background = '#f1f8e9';
        setTimeout(function () {
            input.style.borderColor = '';
            input.style.background = '';
        }, 3000);
    }

    // ★ BUG-04: Module-level refs cho cleanup
    let _detectObserver = null;
    let _detectInterval = null;
    let _detectRetryTimer = null;

    function detectPatientInfo() {
        // ★ BUG-04: Cleanup observer/interval cũ trước khi tạo mới
        if (_detectObserver) { _detectObserver.disconnect(); _detectObserver = null; }
        if (_detectInterval) { clearInterval(_detectInterval); _detectInterval = null; }
        if (_detectRetryTimer) { clearInterval(_detectRetryTimer); _detectRetryTimer = null; }

        function findPatientName() {
            // Luôn tìm từ DOM (title bar) ĐẦU TIÊN — để detect BN mới
            const docs = [document];
            try {
                const iframes = document.querySelectorAll('iframe');
                for (let i = 0; i < iframes.length; i++) {
                    try { if (iframes[i].contentDocument) docs.push(iframes[i].contentDocument); } catch (e) { /* ignore */ }
                }
            } catch (e) { /* ignore */ }

            for (let d = 0; d < docs.length; d++) {
                try {
                    const walker = docs[d].createTreeWalker(docs[d].body || docs[d], NodeFilter.SHOW_TEXT);
                    while (walker.nextNode()) {
                        const text = walker.currentNode.textContent || '';
                        // Caresheet: "HIS-Thêm phiếu (TRẦN THỊ NHƯ Ý/ 2001/ Nữ)"
                        const match = text.match(/HIS[^(]*\(([^)]+\/[^)]+)\)/);
                        if (match) {
                            const fromDOM = match[1].trim();
                            if (_cachedPatient && _cachedPatient.name && _cachedPatient.name !== fromDOM) {
                                QuyenLog.info('👤 BN mới từ form:', fromDOM, '(cũ:', _cachedPatient.name + ')');
                                _cachedPatient = { name: fromDOM };
                                _cachedVitals = null;
                            }
                            return fromDOM;
                        }
                    }
                } catch (e) { /* ignore */ }
            }

            // Infusion page: header text split across DOM nodes → dùng innerText
            // Format: "2603171231 | NGUYỄN THỊ MỸ LỆ | 01/01/1963 (63 Tuổi) | Nữ | ..."
            for (let d2 = 0; d2 < docs.length; d2++) {
                try {
                    const bodyText = (docs[d2].body || docs[d2]).innerText || '';
                    const infMatch = bodyText.match(/\d{10}\s*\|\s*([A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ\s]+)\s*\|\s*\d{2}\/\d{2}\/\d{4}\s*\((\d+)\s*Tuổi\)\s*\|\s*(Nữ|Nam)/);
                    if (infMatch) {
                        const infName = infMatch[1].trim();
                        const infAge = infMatch[2];
                        const infGender = infMatch[3];
                        const infDisplay = infName + ' — ' + infAge + ' tuổi — ' + infGender;
                        if (!_cachedPatient || _cachedPatient.name !== infDisplay) {
                            _cachedPatient = { name: infDisplay };
                        }
                        return infDisplay;
                    }
                } catch (e) { /* ignore */ }
            }

            // Fallback: dùng cache từ Bridge
            if (_cachedPatient && _cachedPatient.name) {
                return _cachedPatient.name;
            }
            return '';
        }

        function update() {
            const name = findPatientName();
            const el = document.getElementById('quyen-patient-display');
            const section = document.getElementById('quyen-patient-section');
            
            if (name) {
                // ★ FIX: Only overwrite the display name if it hasn't been set by the Grid event yet,
                // or if we truly need a fallback. This prevents stale DOM scraped from old hidden
                // dialogs from overwriting the correct data sent by his-bridge!
                if (el && (!el.textContent || el.textContent === 'Chọn bệnh nhân...')) {
                    el.textContent = name.replace(/\s*\/\s*/g, ' — ');
                    if (section) section.classList.add('quyen-patient-found');
                }

                // ★ SPRINT B: Cập nhật target hint từ title parse
                if (typeof HIS !== 'undefined' && HIS.PatientLock) {
                    // Parse "VÕ HOÀNG NAM/ 1957/ Nam" → { name, dob }
                    const parts = name.split(/\s*[/—]\s*/);
                    HIS.PatientLock.setTargetHint({
                        name: (parts[0] || '').trim(),
                        dob: (parts[1] || '').trim(),
                        gender: (parts[2] || '').trim()
                    });
                }
                
                // Request vitals lần đầu (fallback nếu Bridge chưa gửi)
                if (!_vitalsRequested && !_cachedVitals) {
                    _vitalsRequested = true;
                    addExtensionStep('Đang tìm dữ liệu sinh hiệu...', 'loading');
                    window.postMessage({ type: 'QUYEN_REQ_VITALS' }, location.origin);
                }
            } else if (el && (!el.textContent || el.textContent === 'Chọn bệnh nhân...')) {
                // Only clear if it's already empty/default, to be safe
                el.textContent = 'Chọn bệnh nhân...';
                if (section) section.classList.remove('quyen-patient-found');
            }
        }

        update();

        // Retry vài lần cho trang render chậm (BuongDieuTri)
        let _retryCount = 0;
        _detectRetryTimer = setInterval(function () {
            _retryCount++;
            update();
            // ★ BUG-10: Null check cho quyen-patient-display
            const displayEl = document.getElementById('quyen-patient-display');
            if (_retryCount >= 5 || (displayEl && displayEl.textContent !== 'Chọn bệnh nhân...')) {
                clearInterval(_detectRetryTimer);
                _detectRetryTimer = null;
            }
        }, 2000);

        // MutationObserver: chỉ chạy khi DOM thay đổi (iframe mới, title mới)
        let _updateTimer = null;
        function debouncedUpdate() {
            if (_updateTimer) clearTimeout(_updateTimer);
            _updateTimer = setTimeout(update, 500);
        }

        _detectObserver = new MutationObserver(function (mutations) {
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];
                // Iframe mới thêm vào hoặc text thay đổi
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    debouncedUpdate();
                    return;
                }
                if (m.type === 'characterData') {
                    debouncedUpdate();
                    return;
                }
            }
        });
        _detectObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // Safety net: kiểm tra rất thưa (15s) phòng trường hợp MutationObserver miss
        _detectInterval = setInterval(update, 15000);
    }




    // ==========================================
    // LOAD DEFAULT VALUES (⚠️ Không còn random)
    // ==========================================
    function loadDefaultValues() {
        _customValues = CARESHEET_CONFIG.getDefaultEmptyValues();

        // ★ FIX Bug2: Ưu tiên vitals thật từ NT.006, fallback sang phiếu chăm sóc cũ
        const liveWeight = _cachedVitals && _cachedVitals.weight;

        // Từ NT.006 (trực tiếp khi chọn BN)
        if (liveWeight) _customValues.canNang = liveWeight;

        // Fallback: từ phiếu chăm sóc cũ (khi BN không có CN trong NT.006)
        if (typeof QuyenCareSheetFiller !== 'undefined' && !liveWeight) {
            const prevWeight = QuyenCareSheetFiller.getCachedWeight();
            if (prevWeight) {
                _customValues.canNang = prevWeight;
                QuyenLog.info('⚖️ Cân nặng từ phiếu cũ (fallback): ' + prevWeight + 'kg');
            }
        }

        // Render editable fields
        renderEditableFields();

        // Re-apply vitals highlight sau render
        if (_cachedVitals && _cachedVitals.weight) {
            prefillVitalsToPanel(_cachedVitals);
        }

        // Enable fill button
        const fillBtn = document.getElementById('quyen-btn-cs-fill');
        if (fillBtn) fillBtn.disabled = false;

        const hasWeight = _customValues.canNang;
        const hasVitals = _cachedVitals && (_cachedVitals.weight || _cachedVitals.pulse);
        setStatus(
            hasVitals
                ? '✅ Mẫu mặc định đã tải. Sinh hiệu từ dữ liệu thật đã điền.'
                : hasWeight
                    ? '📋 Mẫu mặc định đã tải. Cân nặng từ phiếu cũ (sinh hiệu cần nhập tay).'
                    : '📋 Mẫu mặc định đã tải. Sinh hiệu cần nhập tay hoặc chọn BN để lấy vitals.',
            hasVitals ? 'success' : 'info'
        );
    }

    // ==========================================
    // EDITABLE FIELDS
    // ==========================================
    function renderEditableFields() {
        const el = document.getElementById('quyen-cs-fields');
        if (!el) return;

        let html = '';

        CARESHEET_CONFIG.SECTIONS.forEach((section, idx) => {
            // ★ custom mode: only render checked sections
            if (_customSectionFilter !== null && !_customSectionFilter.includes(idx)) return;

            const collapsed = idx > 0 ? 'quyen-cs-collapsed' : '';
            const arrow = idx > 0 ? '▶' : '▼';
            html += `<div class="quyen-cs-field-section ${collapsed}">
                <div class="quyen-cs-field-section-title quyen-cs-toggle" data-section-idx="${idx}">
                    <span class="quyen-cs-arrow">${arrow}</span> ${section.title}
                </div>
                <div class="quyen-cs-field-body">`;

            section.fields.forEach(field => {
                html += renderFieldEditor(field);
            });

            html += `</div></div>`;
        });

        el.innerHTML = html;

        // Bind change handlers
        el.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', handleFieldChange);
            input.addEventListener('input', handleFieldChange);
        });

        // Bind toggle handlers
        el.querySelectorAll('.quyen-cs-toggle').forEach(toggle => {
            toggle.addEventListener('click', function () {
                const section = this.closest('.quyen-cs-field-section');
                const arrow = this.querySelector('.quyen-cs-arrow');
                if (section.classList.contains('quyen-cs-collapsed')) {
                    section.classList.remove('quyen-cs-collapsed');
                    if (arrow) arrow.textContent = '▼';
                } else {
                    section.classList.add('quyen-cs-collapsed');
                    if (arrow) arrow.textContent = '▶';
                }
            });
        });
    }

    function renderFieldEditor(field) {
        const value = _customValues[field.key];

        switch (field.type) {
            case 'text':
                return `
                    <div class="quyen-cs-field-row">
                        <label class="quyen-cs-field-label">${field.label}</label>
                        <input class="quyen-cs-field-input" type="text" 
                            data-field-key="${field.key}" 
                            value="${escapeAttr(value || '')}" 
                            placeholder="${field.label}">
                    </div>
                `;

            case 'checkbox': {
                const options = field.options || [];
                const selected = Array.isArray(value) ? value : [];
                let checkHtml = `<div class="quyen-cs-field-row">
                    <label class="quyen-cs-field-label">${field.label}</label>
                    <div class="quyen-cs-checkbox-group">`;

                options.forEach(opt => {
                    const checked = selected.includes(opt) ? 'checked' : '';
                    checkHtml += `
                        <label class="quyen-cs-checkbox-label">
                            <input type="checkbox" data-field-key="${field.key}" 
                                value="${escapeAttr(opt)}" ${checked}>
                            <span>${opt}</span>
                        </label>`;
                });

                checkHtml += `</div></div>`;
                return checkHtml;
            }

            case 'split': {
                const splitKeys = field.splitKeys || [];
                const subLabels = field.subLabels || [];
                let splitHtml = `<div class="quyen-cs-field-row">
                    <label class="quyen-cs-field-label">${field.label}</label>
                    <div class="quyen-cs-split-group">`;

                splitKeys.forEach((sk, i) => {
                    const subLabel = subLabels[i] || `Ô ${i + 1}`;
                    splitHtml += `
                        <div class="quyen-cs-split-item">
                            <span class="quyen-cs-split-label">${subLabel}</span>
                            <input class="quyen-cs-field-input quyen-cs-split-input" type="text"
                                data-field-key="${sk}"
                                value="${escapeAttr(_customValues[sk] || '')}"
                                placeholder="${subLabel}">
                        </div>`;
                });

                splitHtml += `</div></div>`;
                return splitHtml;
            }

            default:
                return '';
        }
    }

    // ==========================================
    // HANDLE FIELD CHANGES
    // ==========================================
    function handleFieldChange(e) {
        const input = e.target;
        const key = input.getAttribute('data-field-key');
        if (!key) return;

        if (input.type === 'checkbox') {
            if (!Array.isArray(_customValues[key])) _customValues[key] = [];
            if (input.checked) {
                if (!_customValues[key].includes(input.value)) {
                    _customValues[key].push(input.value);
                }
            } else {
                _customValues[key] = _customValues[key].filter(v => v !== input.value);
            }
        } else {
            _customValues[key] = input.value;
        }
    }

    // ==========================================
    // ACTIONS
    // ==========================================
    function setupActions() {
        const generateBtn = document.getElementById('quyen-btn-cs-generate');
        if (generateBtn) {
            generateBtn.addEventListener('click', loadDefaultValues);
        }

        const fillBtn = document.getElementById('quyen-btn-cs-fill');
        if (fillBtn) {
            fillBtn.addEventListener('click', doFill);
        }

        // Mode selector
        const modeSelect = document.getElementById('quyen-cs-mode');
        if (modeSelect) {
            modeSelect.addEventListener('change', function () {
                localStorage.setItem('quyen_cs_fillmode', this.value);
                toggleCustomSections(this.value);
            });
            toggleCustomSections(modeSelect.value);
        }
    }

    // ★ Show/hide custom section checkboxes
    function toggleCustomSections(mode) {
        const panel = document.getElementById('quyen-cs-custom-sections');
        if (!panel) return;

        if (mode !== 'custom') {
            panel.style.display = 'none';
            // Clear filter → all sections visible in edit panel
            _customSectionFilter = null;
            if (Object.keys(_customValues).length > 0) renderEditableFields();
            return;
        }

        panel.style.display = 'block';
        const rawSaved = localStorage.getItem('quyen_cs_custom_secs');
        const saved = rawSaved ? JSON.parse(rawSaved) : null;
        const sections = CARESHEET_CONFIG.SECTIONS;
        let html = '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
        for (let i = 0; i < sections.length; i++) {
            const isChecked = saved === null || saved.includes(i);
            const checkedAttr = isChecked ? 'checked' : '';
            // ★ Numbered label: "1. Thông tin ch", "2. Chỉ số S"
            const secNum = i + 1;
            const shortTitle = sections[i].title.replace(/^\d+\.\s*/, '').substring(0, 11);
            const labelText = secNum + '. ' + shortTitle;
            html += '<label style="display:flex;align-items:center;gap:2px;font-size:10px;color:#555;cursor:pointer;background:rgba(0,0,0,0.04);padding:2px 5px;border-radius:4px;">';
            html += '<input type="checkbox" class="quyen-cs-sec-check" data-sec="' + i + '" ' + checkedAttr + ' style="width:12px;height:12px;margin:0;">';
            html += labelText + '</label>';
        }
        html += '</div>';
        panel.innerHTML = html;

        // Apply initial filter from saved state
        _customSectionFilter = saved;
        if (Object.keys(_customValues).length > 0) renderEditableFields();

        // Save on change + live re-render editable fields
        panel.querySelectorAll('.quyen-cs-sec-check').forEach(function (cb) {
            cb.addEventListener('change', function () {
                const checkedIndices = [];
                panel.querySelectorAll('.quyen-cs-sec-check:checked').forEach(function (c) {
                    checkedIndices.push(parseInt(c.getAttribute('data-sec')));
                });
                localStorage.setItem('quyen_cs_custom_secs', JSON.stringify(checkedIndices));
                // ★ Update filter and immediately re-render the edit panel
                _customSectionFilter = checkedIndices;
                if (Object.keys(_customValues).length > 0) renderEditableFields();
            });
        });
    }

    function doFill() {
        if (!_customValues || Object.keys(_customValues).length === 0) {
            setStatus('⚠️ Chưa tạo giá trị!', 'warning');
            return;
        }

        // ★ FIX: Last-chance retrieval — lấy DỮ LIỆU TỪ MỌI NGUỒN trước khi điền
        // Bao gồm: cân nặng, sinh hiệu, và section 4 (cơ quan bệnh)

        // ─── Sinh hiệu từ phiếu cũ (nếu panel chưa nhận kịp async message) ───
        const VITAL_KEYS_FILL = ['nhipTim', 'nhietDo', 'huyetAp', 'nhipTho', 'spO2'];
        if (_cachedVitals) {
            const vitalMap = { nhipTim: 'pulse', nhietDo: 'temp', huyetAp: 'bp', nhipTho: 'resp', spO2: 'spo2' };
            for (let vi = 0; vi < VITAL_KEYS_FILL.length; vi++) {
                const vk = VITAL_KEYS_FILL[vi];
                if (!_customValues[vk] && _cachedVitals[vitalMap[vk]]) {
                    _customValues[vk] = _cachedVitals[vitalMap[vk]];
                    QuyenLog.info('💉 Last-chance ' + vk + ' từ cachedVitals: ' + _customValues[vk]);
                }
            }
        }

        // ─── Đọc từ input panel (ĐD đã nhập tay hoặc prefill đã chạy) ───
        for (let vi2 = 0; vi2 < VITAL_KEYS_FILL.length; vi2++) {
            const vk2 = VITAL_KEYS_FILL[vi2];
            if (!_customValues[vk2]) {
                const vInput = document.querySelector('#quyen-cs-fields input[data-field-key="' + vk2 + '"]');
                if (vInput && vInput.value && vInput.value.trim()) {
                    _customValues[vk2] = vInput.value.trim();
                    QuyenLog.info('💉 Last-chance ' + vk2 + ' từ input panel: ' + _customValues[vk2]);
                }
            }
        }

        // ─── Section 4: Cơ quan bệnh — LUÔN ĐỂ TRỐNG (ĐD tự nhập) ───
        // Không tự động copy từ phiếu cũ để tránh nhầm BN

        // ─── Cân nặng ───
        if (!_customValues.canNang) {
            // Nguồn 1: _cachedVitals (từ patient selection / NT.006)
            if (_cachedVitals && _cachedVitals.weight) {
                _customValues.canNang = _cachedVitals.weight;
                QuyenLog.info('⚖️ Last-chance CN từ cachedVitals: ' + _cachedVitals.weight + 'kg');
            }
            // Nguồn 2: QuyenCareSheetFiller cache (từ phiếu cũ)
            if (!_customValues.canNang && typeof QuyenCareSheetFiller !== 'undefined') {
                const prevWeight = QuyenCareSheetFiller.getCachedWeight();
                if (prevWeight) {
                    _customValues.canNang = prevWeight;
                    QuyenLog.info('⚖️ Last-chance CN từ phiếu cũ: ' + prevWeight + 'kg');
                }
            }
            // Nguồn 3: Đọc trực tiếp từ ô input trên panel (ĐD đã nhập tay)
            if (!_customValues.canNang) {
                const weightInput = document.querySelector('#quyen-cs-fields input[data-field-key="canNang"]');
                if (weightInput && weightInput.value && weightInput.value.trim()) {
                    _customValues.canNang = weightInput.value.trim();
                    QuyenLog.info('⚖️ Last-chance CN từ input tay: ' + _customValues.canNang + 'kg');
                }
            }
        }

        // ★ Lớp 1: Đã chọn BN chưa?
        if (typeof HIS === 'undefined' || !HIS.PatientLock || !HIS.PatientLock.hasSource()) {
            const msg = '🚫 Chưa chọn bệnh nhân! Hãy click chọn BN trong danh sách trước.';
            setStatus(msg, 'error');
            if (typeof QuyenUI !== 'undefined') QuyenUI.showToast(msg, 'error');
            QuyenLog.warn('🔒 CareSheet fill BLOCKED: no patient source');
            return;
        }

        // ★ Lớp 2: BN trong form có khớp BN đã chọn không?
        const lockResult = HIS.PatientLock.verifyCurrentForm();
        if (!lockResult.ok) {
            setStatus('🚫 ' + lockResult.details, 'error');
            if (typeof QuyenUI !== 'undefined') {
                QuyenUI.showToast('🚫 ' + lockResult.details, 'error');
                QuyenUI.setFlowerState('fire');
            }
            QuyenLog.warn('🔒 CareSheet fill BLOCKED:', lockResult.reason);
            return;
        }

        // ★ Filter values theo fill mode
        const mode = (document.getElementById('quyen-cs-mode') || {}).value || 'full';
        let valuesToFill = _customValues;
        let allowedSections = null; // ★ Khai báo null để báo hiệu "Đầy đủ" (không filter)

        if (mode === 'simple' || mode === 'custom') {
            allowedSections = []; // Có filter
            if (mode === 'simple') {
                // Mục 0-6 (Thông tin chung + sections 1-6)
                allowedSections = [0, 1, 2, 3, 4, 5, 6];
            } else {
                // Custom: from localStorage (xử lý đúng mảng rỗng [])
                const rawSaved = localStorage.getItem('quyen_cs_custom_secs');
                allowedSections = rawSaved ? JSON.parse(rawSaved) : CARESHEET_CONFIG.SECTIONS.map(function (_, i) { return i; });
            }

            // Get allowed field keys from selected sections
            const allowedKeys = {};
            const sections = CARESHEET_CONFIG.SECTIONS;
            for (let si = 0; si < allowedSections.length; si++) {
                const secIdx = allowedSections[si];
                if (secIdx < sections.length) {
                    sections[secIdx].fields.forEach(function (f) {
                        allowedKeys[f.key] = true;
                        if (f.subKeys) f.subKeys.forEach(function (sk) { allowedKeys[sk.key] = true; });
                    });
                }
            }

            // Filter
            valuesToFill = {};
            Object.keys(_customValues).forEach(function (k) {
                if (allowedKeys[k]) valuesToFill[k] = _customValues[k];
            });
            QuyenLog.info('📋 Fill mode: ' + mode + ', sections: ' + allowedSections.join(',') + ', fields: ' + Object.keys(valuesToFill).length);
        }

        setStatus('⏳ Đang điền...', 'info');
        addExtensionStep('Bắt đầu điền ' + Object.keys(valuesToFill).length + ' mục cơ bản...', 'loading');

        const result = QuyenCareSheetFiller.fillCustomValues(valuesToFill);

        if (result.success) {
            setStatus(`✅ Đã điền ${result.filledCount} mục thành công! __EXT_EMOJI__`, 'success');
            showMeritAnimation();
            if (typeof QuyenUI !== 'undefined') {
                QuyenUI.showToast(`✅ Đã điền phiếu chăm sóc — ${result.filledCount} mục! __EXT_EMOJI__`);
                QuyenUI.incrementFilledCount();
            }


            // ★ Copy cân nặng + sinh hiệu + Section 17 từ phiếu cũ (KHÔNG copy Section 4)
            try {
                const lockCheck2 = (typeof HIS !== 'undefined' && HIS.PatientLock) ? HIS.PatientLock.verifyCurrentForm() : { ok: true };
                if (!lockCheck2.ok) {
                    QuyenLog.warn('⚠️ Skip fillSection4FromPrevious — BN đã thay đổi:', lockCheck2.details);
                    addExtensionStep('Bỏ qua copy phiếu cũ: BN thay đổi', 'error');
                } else {
                    addExtensionStep('Đang copy dữ liệu phiếu cũ...', 'loading');
                    // ★ Loại bỏ Section 4 (index 4) + Section 17 (index 16 trong filler) — tránh nhầm BN
                    // Chỉ copy: cân nặng, sinh hiệu từ phiếu cũ
                    let sec4Allowed = allowedSections;
                    if (sec4Allowed === null) {
                        // Chế độ đầy đủ → cho phép tất cả TRỪ section 4 (index 4)
                        sec4Allowed = CARESHEET_CONFIG.SECTIONS.map(function(_, i) { return i; }).filter(function(i) { return i !== 4; });
                    } else {
                        // Chế độ đơn giản/tùy chọn → loại bỏ section 4 nếu có
                        sec4Allowed = sec4Allowed.filter(function(i) { return i !== 4; });
                    }
                    const sec4Result = QuyenCareSheetFiller.fillSection4FromPrevious(sec4Allowed);
                    function showSec4Result(r) {
                         if (r && r.success) {
                            let msg = '📋 Phiếu cũ #' + (r.phieuId || '?') + ' → ' + r.filledCount + ' ô';
                            if (r.sec17Count) msg += ' + Sec17: ' + r.sec17Count + ' mục';
                            if (r.weight) msg += ' | Cân nặng: ' + r.weight + 'kg';
                            setStatus('✅ Đã điền ' + result.filledCount + ' mục + ' + msg, 'success');
                            addExtensionStep('Hoàn tất copy phiếu cũ (' + r.filledCount + ' ô)', 'done');
                            if (typeof QuyenUI !== 'undefined') QuyenUI.showToast(msg);
                        } else {
                            addExtensionStep('Không có dữ liệu phiếu cũ để copy', 'done');
                        }
                    }
                    if (sec4Result && sec4Result.then) {
                        sec4Result.then(showSec4Result);
                    } else {
                        showSec4Result(sec4Result);
                    }
                }
            } catch (e) {
                QuyenLog.warn('⚠️ Không thể copy dữ liệu phiếu cũ:', e);
            }
        } else {
            const errorCount = result.errors ? result.errors.length : 0;
            const errorMsg = result.error || (result.errors ? result.errors.slice(0, 3).join(', ') : '');
            setStatus(`⚠️ Điền ${result.filledCount || 0} mục, ${errorCount} lỗi: ${errorMsg}`, 'warning');
            if (typeof QuyenUI !== 'undefined') {
                QuyenUI.showToast(`⚠️ ${errorMsg}`, 'warning');
            }
        }
    }

    // eslint-disable-next-line no-unused-vars
    function doCheck() {
        const isOpen = QuyenCareSheetFiller.isCareSheetFormOpen();
        if (isOpen) {
            setStatus('✅ Form phiếu chăm sóc đang mở — sẵn sàng điền!', 'success');
            if (typeof QuyenUI !== 'undefined') {
                QuyenUI.showToast('✅ Form phiếu chăm sóc đã sẵn sàng! __EXT_EMOJI__');
            }
        } else {
            setStatus('❌ Chưa mở form phiếu chăm sóc. Hãy bấm "Thêm phiếu" trên HIS.', 'error');
            if (typeof QuyenUI !== 'undefined') {
                QuyenUI.showToast('❌ Chưa tìm thấy form phiếu chăm sóc', 'error');
            }
        }
    }

    // ==========================================
    // STATUS
    // ==========================================
    function setStatus(message, type) {
        const el = document.getElementById('quyen-cs-status');
        if (!el) return;
        el.textContent = message;
        el.className = `quyen-cs-status quyen-cs-status-${type || 'info'}`;
        el.style.display = message ? 'block' : 'none';
    }

    // ==========================================
    // EXTENSION STEPS TRACKER
    // ==========================================
    function addExtensionStep(message, status = 'done') {
        const container = document.getElementById('quyen-cs-steps-container');
        const list = document.getElementById('quyen-cs-steps-list');
        if (!container || !list) return;

        container.style.display = 'block';

        // ★ Tự động chuyển tất cả step "loading" cũ sang "done"
        const oldLoadingIcons = list.querySelectorAll('.quyen-step-loading');
        for (let i = 0; i < oldLoadingIcons.length; i++) {
            oldLoadingIcons[i].style.animation = 'none';
            oldLoadingIcons[i].style.color = '#4caf50';
            oldLoadingIcons[i].textContent = '✅';
            oldLoadingIcons[i].classList.remove('quyen-step-loading');
        }

        const li = document.createElement('li');
        li.className = 'quyen-step-item';
        
        let iconHtml = '<span class="quyen-step-icon" style="color:#4caf50;">✅</span>';
        if (status === 'loading') {
            iconHtml = '<span class="quyen-step-icon quyen-step-loading" style="color:#2196f3; animation: quyen-spin 1s linear infinite;">⏳</span>';
        } else if (status === 'error') {
            iconHtml = '<span class="quyen-step-icon" style="color:#f44336;">❌</span>';
        }

        li.innerHTML = iconHtml + ' <span>' + escapeAttr(message) + '</span>';
        list.appendChild(li);

        // Giữ lại tối đa 4 thao tác gần nhất cho gọn
        while (list.children.length > 4) {
            list.removeChild(list.firstChild);
        }
        
        // Thêm keyframes spin nếu chưa có
        if (!document.getElementById('quyen-spin-style')) {
            const style = document.createElement('style');
            style.id = 'quyen-spin-style';
            style.textContent = '@keyframes quyen-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    }

    function clearExtensionSteps() {
        const container = document.getElementById('quyen-cs-steps-container');
        const list = document.getElementById('quyen-cs-steps-list');
        if (list) list.innerHTML = '';
        if (container) container.style.display = 'none';
    }

    // ==========================================
    // UTILITY
    // ==========================================
    function escapeAttr(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
    }

    // ==========================================
    // MERIT ANIMATION — "+1 công đức" bay lên
    // ==========================================
    function showMeritAnimation() {
        const fillBtn = document.getElementById('quyen-btn-cs-fill');
        if (!fillBtn) return;

        const rect = fillBtn.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'quyen-merit-float';
        el.textContent = '+1 công đức cho __EXT_SHORT_NAME__ __EXT_EMOJI__';
        el.style.left = rect.left + rect.width / 2 + 'px';
        el.style.top = rect.top + 'px';
        document.body.appendChild(el);

        // Trigger animation
        requestAnimationFrame(() => {
            el.classList.add('quyen-merit-animate');
        });

        // Cleanup
        setTimeout(() => el.remove(), 3000);
    }
    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        loadDefaultValues,
        renderUI
    };
})();
