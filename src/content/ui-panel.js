/**
 * __EXT_EMOJI__ __EXT_NAME__ — UI Panel
 * Floating panel hiển thị y lệnh truyền dịch và nút điền tự động
 */

/* global QuyenLog, QUYEN_CONFIG, getRandomThank, QuyenInfusionFiller, QuyenInfusionReader, QuyenCareSheetUI, QuyenVatTuUI, cancelAnimationFrame */
/* exported QuyenUI */

const QuyenUI = (function () {
    let _panel = null;
    let _drugListEl = null;
    let _statsEl = null;
    let _patientNameEl = null;
    let _isMinimized = false;
    let _filledToday = 0;
    let _currentPatientName = '';
    let _activeTab = 'infusion'; // 'infusion' | 'caresheet' | 'vattu'
    let _savedLeft = null, _savedTop = null;
    let _fillTrackerUnsub = null;  // ★ Fix: cleanup function cho FillTracker listener

    // Merit tier config
    const TIER_CONFIG = [
        { min: 50, cls: 'quyen-tier-legendary', icon: '✨👑✨' },
        { min: 40, cls: 'quyen-tier-diamond',   icon: '💎' },
        { min: 30, cls: 'quyen-tier-gold',      icon: '🏆' },
        { min: 20, cls: 'quyen-tier-silver',     icon: '💰' },
        { min: 10, cls: 'quyen-tier-bronze',     icon: '🥇' },
        { min: 0,  cls: 'quyen-tier-basic',      icon: '🪙' },
    ];

    // ==========================================
    // INIT
    // ==========================================
    function init() {
        createPanel();
        loadStats();
        // ★ Bắt đầu thu gọn + sad (chưa chọn BN)
        toggleMinimize();
        setFlowerState('sad');
        showWhatsNew();
        QuyenLog.info('UI Panel initialized __EXT_EMOJI__');
    }

    // ==========================================
    // ★ WHAT'S NEW — Hiện 1 lần khi version mới
    // ==========================================
    function showWhatsNew() {
        try {
            if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.storage) return;
            const currentVersion = chrome.runtime.getManifest().version;

            chrome.storage.local.get('quyen_last_seen_version', function (data) {
                const lastSeen = data.quyen_last_seen_version || '';
                if (lastSeen === currentVersion) return;

                // Changelog theo version
                const changelogs = {
                    '1.3.1': '🆕 v1.3.1\n• 🛠️ Sửa lỗi linter Vật Tư\n• 📦 Cập nhật phiên bản',
                    '1.3.0': '🆕 v1.3.0\n• 📦 Tự động điền Phiếu Vật Tư\n• 🎓 Giao diện tối ưu mới & Gamification\n• 🐞 Chống duplicate & lỗi tải Kho VT',
                    '1.2.2': '🆕 v1.2.2\n• 🛡️ Safe Mode: tắt auto-fill khi cần\n• ⌨️ Alt+Q: toggle panel nhanh\n• 🔒 Chống fill chồng (queue tuần tự)',
                    '1.2.1': '🆕 v1.2.1\n• 🔐 Bảo mật PBKDF2 600K iterations\n• 🧰 Tab Vật Tư (BETA)\n• 🐛 Sửa lỗi hiệu năng',
                };

                const msg = changelogs[currentVersion];
                if (msg) {
                    setTimeout(function () { showToast(msg, 'info'); }, 2000);
                }

                chrome.storage.local.set({ quyen_last_seen_version: currentVersion });
            });
        } catch (e) { /* silent */ }
    }

    /**
     * ★ setFlowerState — 3 trạng thái bông hoa:
     *   'sad'     — xám tối lắc lư (chưa chọn BN)
     *   'happy'   — hồng rực pulse (BN đã load)
     *   'fire'    — bốc cháy → héo úa (BN không khớp)
     */
    function setFlowerState(state) {
        const icon = document.getElementById('quyen-mini-icon');
        if (!icon) return;
        // Xóa tất cả state class cũ
        icon.classList.remove('quyen-mini-sad', 'quyen-mini-happy', 'quyen-mini-fire', 'quyen-mini-wilted', 'quyen-mini-pulse');
        void icon.offsetWidth; // force reflow
        if (state === 'sad')   icon.classList.add('quyen-mini-sad');
        if (state === 'happy') icon.classList.add('quyen-mini-happy');
        if (state === 'fire') {
            icon.classList.add('quyen-mini-fire');
            // Sau 4s animation xong → giữ nguyên dạng "héo"
            setTimeout(function () {
                icon.classList.remove('quyen-mini-fire');
                icon.classList.add('quyen-mini-wilted');
            }, 4000);
        }
    }

    // ==========================================
    // CREATE FLOATING PANEL
    // ==========================================
    function createPanel() {
        if (_panel) return;

        _panel = document.createElement('div');
        _panel.id = 'quyen-panel';
        _panel.innerHTML = `
            <div class="quyen-mini-icon" id="quyen-mini-icon">__EXT_EMOJI__</div>
            <div class="quyen-panel-header" id="quyen-panel-header">
                <div class="quyen-header-left">
                    <span class="quyen-logo">__EXT_EMOJI__</span>
                    <span class="quyen-title">__EXT_SHORT_NAME__</span>
                    <span class="quyen-header-dot">·</span>
                    <span class="quyen-stats quyen-tier-basic" id="quyen-stats">
                        <span class="quyen-merit-icon">🌱</span>
                        <span class="quyen-merit-count">0</span>
                        <span class="quyen-merit-label">chỉ vàng</span>
                    </span>
                </div>
                <button class="quyen-btn-minimize" id="quyen-btn-minimize" title="Thu nhỏ">—</button>
            </div>
            <div class="quyen-patient-section" id="quyen-patient-section">
                <div class="quyen-patient-row" id="quyen-patient-row">
                    <span class="quyen-patient-icon">👤</span>
                    <span class="quyen-patient-display" id="quyen-patient-display">Chọn bệnh nhân...</span>
                </div>
                <div class="quyen-patient-loading" id="quyen-patient-loading" style="display:none">
                    <div class="quyen-loading-track">
                        <div class="quyen-loading-fill" id="quyen-loading-fill"></div>
                    </div>
                    <span class="quyen-loading-text" id="quyen-loading-text"></span>
                </div>
                <div class="quyen-patient-vitals" id="quyen-patient-vitals" style="display:none"></div>
            </div>
            
            <!-- ★ Banner cảnh báo sai BN (ẩn mặc định, chỉ hiện khi có class theme-danger) -->
            <div class="quyen-alert-banner">🚨 CẢNH BÁO: PHÁT HIỆN SAI BỆNH NHÂN!</div>
            
            <div class="quyen-tab-bar" id="quyen-tab-bar">
                <button class="quyen-tab quyen-tab-active" data-tab="infusion" id="quyen-tab-infusion">✏️ Truyền dịch</button>
                <button class="quyen-tab" data-tab="caresheet" id="quyen-tab-caresheet">📋 Phiếu CS</button>
                <button class="quyen-tab" data-tab="vattu" id="quyen-tab-vattu">🧰 VT <span class="quyen-beta-badge">BETA</span></button>
            </div>
            <div class="quyen-panel-body" id="quyen-panel-body">
                <div class="quyen-tab-content quyen-tab-content-active" id="quyen-tab-content-infusion">
                    <div class="quyen-drug-section">
                        <div style="display:flex; align-items:center; padding:4px 8px; gap:8px;">
                            <span id="quyen-fill-status" style="flex:1;font-size:11px;color:#555;font-weight:500;"></span>
                            <button class="quyen-btn-refresh" id="quyen-btn-refresh" title="Quét lại y lệnh" style="font-size:14px; background:#e91e8c; border:none; border-radius:6px; padding:4px 10px; cursor:pointer; color:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔄</button>
                        </div>
                        <div class="quyen-drug-list" id="quyen-drug-list">
                            <div class="quyen-empty">Chờ mở form truyền dịch...</div>
                        </div>
                    </div>
                </div>
                <div class="quyen-tab-content" id="quyen-tab-content-caresheet">
                    <!-- CareSheet UI sẽ render vào đây -->
                </div>
                <div class="quyen-tab-content" id="quyen-tab-content-vattu">
                    <!-- VatTuUI sẽ render vào đây -->
                </div>
            </div>
            <div class="quyen-footer">
                __EXT_EMOJI__ __EXT_FOOTER_TEXT__
            </div>
        `;

        document.body.appendChild(_panel);

        // Cache elements
        _drugListEl = document.getElementById('quyen-drug-list');
        _statsEl = document.getElementById('quyen-stats');
        _patientNameEl = document.getElementById('quyen-patient-name');

        // Event handlers
        setupEventHandlers();

        // Tab system
        setupTabHandlers();

        // Roman/Arabic toggle
        setupRomanToggle();

        // Mini icon click to restore
        const miniIcon = document.getElementById('quyen-mini-icon');
        if (miniIcon) {
            miniIcon.addEventListener('click', restorePanel);
        }

        // Init CareSheet UI vào tab container
        const csContainer = document.getElementById('quyen-tab-content-caresheet');
        if (csContainer && typeof QuyenCareSheetUI !== 'undefined') {
            QuyenCareSheetUI.init(csContainer);
        }

        // Init VatTu UI vào tab container
        const vtContainer = document.getElementById('quyen-tab-content-vattu');
        if (vtContainer && typeof QuyenVatTuUI !== 'undefined') {
            QuyenVatTuUI.init(vtContainer);
        }


        // ★ Fast JS tooltip (instant, viewport-clamped)
        const _tipEl = document.createElement('div');
        _tipEl.id = 'quyen-custom-tip';
        _tipEl.style.cssText = 'position:fixed;z-index:999999;background:#555;color:#fff;padding:6px 10px;border-radius:6px;font-size:11px;line-height:1.5;max-width:240px;white-space:pre-line;pointer-events:none;opacity:0;transition:opacity 0.08s;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:none;';
        document.body.appendChild(_tipEl);

        document.addEventListener('mouseenter', function (e) {
            const label = e.target.closest && e.target.closest('.quyen-drug-label');
            if (!label) return;
            const tip = label.getAttribute('data-tip');
            if (!tip) return;
            _tipEl.textContent = tip;
            _tipEl.style.display = 'block';
            _tipEl.style.opacity = '0';

            // Tính vị trí, clamp trong viewport
            requestAnimationFrame(function () {
                const rect = label.getBoundingClientRect();
                const tipW = _tipEl.offsetWidth;
                const tipH = _tipEl.offsetHeight;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                // X: không tràn phải
                let x = Math.min(rect.left, vw - tipW - 8);
                x = Math.max(8, x);

                // Y: ưu tiên bên trên nếu không đủ chỗ bên dưới
                let y = rect.bottom + 6;
                if (y + tipH > vh - 8) {
                    y = rect.top - tipH - 6;
                }
                y = Math.max(8, y);

                _tipEl.style.left = x + 'px';
                _tipEl.style.top = y + 'px';
                _tipEl.style.opacity = '1';
            });
        }, true);

        document.addEventListener('mouseleave', function (e) {
            const label = e.target.closest && e.target.closest('.quyen-drug-label');
            if (!label) return;
            _tipEl.style.opacity = '0';
            setTimeout(function () { _tipEl.style.display = 'none'; }, 100);
        }, true);
    }

    // ==========================================
    // EVENT HANDLERS
    // ==========================================
    function setupEventHandlers() {
        // Minimize / Expand
        const minimizeBtn = document.getElementById('quyen-btn-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', toggleMinimize);
        }

        // ★ Keyboard shortcut: Alt+Q = toggle panel
        document.addEventListener('keydown', function (e) {
            if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
                // Không fire khi đang gõ trong input/textarea
                const tag = (document.activeElement || {}).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                e.preventDefault();
                if (_isMinimized) restorePanel();
                else toggleMinimize();
            }
        });

        // Header drag (simple)
        const header = document.getElementById('quyen-panel-header');
        if (header) {
            makeDraggable(_panel, header);
        }

        // Refresh drugs
        const refreshBtn = document.getElementById('quyen-btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                QuyenInfusionReader.rescan();
                showToast('🔄 Đang quét lại y lệnh...');
            });
        }

        // ★ Extension on/off toggle from popup
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener(function (msg) {
                if (msg && msg.type === 'QUYEN_TOGGLE_EXTENSION') {
                    if (_panel) _panel.style.display = msg.enabled ? '' : 'none';
                    const miniIcon = document.getElementById('quyen-mini-icon');
                    if (miniIcon) miniIcon.style.display = msg.enabled ? '' : 'none';
                }
            });
            // Check initial state
            chrome.storage.local.get('quyen_enabled', function (data) {
                if (data.quyen_enabled === false) {
                    if (_panel) _panel.style.display = 'none';
                    const miniIcon = document.getElementById('quyen-mini-icon');
                    if (miniIcon) miniIcon.style.display = 'none';
                }
            });
        }


        // Patient selection from Bridge
        window.addEventListener('message', function(event) {
            if (!event.data) return;
            // ★ SPRINT C: Origin + type validation
            if (typeof HIS !== 'undefined' && HIS.Message && !HIS.Message.isValid(event)) return;
            if (event.data.type === 'QUYEN_PATIENT_SELECTED') {
                const p = event.data.patient || {};
                const v = event.data.vitals || {};
                updateGlobalPatient(p, v);

                // ★ SPRINT B: Set patient-lock source + target context
                if (typeof HIS !== 'undefined' && HIS.PatientLock) {
                    HIS.PatientLock.setSourceContext(p);
                    // Target hint = same patient (là BN đang chọn trên form)
                    HIS.PatientLock.setTargetHint(p);
                }
            }

            // ★ Lỗi fill: form truyền dịch không mở trong 3s
            if (event.data.type === 'QUYEN_FILL_ERROR' && event.data.reason === 'FORM_NOT_FOUND') {
                const dName = event.data.drugName || 'thuốc';
                showToast(`❌ Chưa mở phiếu truyền dịch! Hãy mở form trước khi điền "${dName}".`, 'error');
                // Reset nút "⏳ Chờ..." về trạng thái ban đầu
                _drugListEl && _drugListEl.querySelectorAll('.quyen-btn-fill').forEach(function(btn) {
                    if (btn.textContent.includes('Chờ')) {
                        btn.textContent = '💉 Điền';
                        btn.disabled = false;
                    }
                });
            }

            // ★ Bridge sẵn sàng — pulse __EXT_EMOJI__ 1 lần để báo hiệu extension đã load
            if (event.data.type === 'QUYEN_BRIDGE_READY') {
                const icon = document.getElementById('quyen-mini-icon');
                if (icon) {
                    icon.classList.add('quyen-mini-pulse');
                    setTimeout(function () { icon.classList.remove('quyen-mini-pulse'); }, 1200);
                }
            }

            // ★ Auto-switch tab + restore + kiểm tra khớp BN khi mở form
            if (event.data.type === 'QUYEN_FORM_FOCUSED' && event.data.tab) {
                if (_isMinimized) restorePanel();
                if (event.data.tab !== _activeTab) switchTab(event.data.tab);
                // Kiểm tra khớp tên BN sau 600ms (chờ form load xong)
                setTimeout(function () {
                    if (typeof HIS !== 'undefined' && HIS.PatientLock && HIS.PatientLock.hasSource()) {
                        const lockResult = HIS.PatientLock.verifyCurrentForm();
                        if (!lockResult.ok) {
                            showToast('⚠️ BN không khớp! ' + lockResult.details, 'error');
                            setFlowerState('fire');
                            document.querySelectorAll('.quyen-btn-fill, .quyen-btn-cs-generate').forEach(function (btn) {
                                btn.disabled = true;
                                btn.title = '⚠️ BN không khớp — kiểm tra lại';
                            });
                            updateLockIndicator();
                        }
                    }
                }, 600);
            }

            // ★ Tự thu gọn khi đóng hết form
            if (event.data.type === 'QUYEN_FORM_CLOSED') {
                if (!_isMinimized) toggleMinimize();
            }
        });
    }

    // ==========================================
    // GLOBAL PATIENT DISPLAY (trên tabs)
    // ==========================================
    function updateGlobalPatient(patient, vitals) {
        const display = document.getElementById('quyen-patient-display');
        const section = document.getElementById('quyen-patient-section');
        const vitalsEl = document.getElementById('quyen-patient-vitals');
        if (!display) return;

        // Show loading
        setLoading('Nhận thông tin BN...', 20);

        // Update name
        let name = patient.name || '';

        // ★ Strip HTML tags nếu name chứa HTML
        if (name && name.indexOf('<') >= 0) {
            const tmpDiv = document.createElement('div');
            tmpDiv.innerHTML = name;
            name = (tmpDiv.textContent || tmpDiv.innerText || '').trim();
        }

        // ★ Fallback: đọc tên từ panel "THÔNG TIN ĐIỀU TRỊ" trên trang HIS
        if (!name) {
            try {
                // Tìm trong tất cả documents (main + iframes)
                const docsToScan = [document];
                const allIframes = document.querySelectorAll('iframe');
                for (let fi = 0; fi < allIframes.length; fi++) {
                    try { if (allIframes[fi].contentDocument) docsToScan.push(allIframes[fi].contentDocument); } catch (e) { console.debug("[Nurse] catch:", e.message || e); }
                }
                for (let di = 0; di < docsToScan.length; di++) {
                    try {
                        // Pattern: "Họ tên" label gần giá trị tên BN
                        const allTds = docsToScan[di].querySelectorAll('td, th, label, span');
                        for (let ti = 0; ti < allTds.length; ti++) {
                            const tdText = (allTds[ti].textContent || '').trim();
                            if (tdText === 'Họ tên' || tdText === 'Họ tên:' || tdText === 'Họ và tên') {
                                const nextEl = allTds[ti].nextElementSibling;
                                if (nextEl) {
                                    const candidateName = (nextEl.textContent || '').trim();
                                    if (candidateName.length >= 3 && candidateName.length <= 60
                                        && /[A-ZÀ-Ỹ]/.test(candidateName) && candidateName.includes(' ')) {
                                        name = candidateName;
                                        QuyenLog.info('👤 Tên BN từ panel TTĐT:', name);
                                        break;
                                    }
                                }
                            }
                        }
                        if (name) break;
                    } catch (e) { console.debug("[Nurse] catch:", e.message || e); }
                }
            } catch (e) { QuyenLog.warn('👤 Fallback name scan error:', e); }
        }

        // const dob = patient.dob || '';
        // const gender = patient.gender || '';
        display.textContent = name || 'Chọn bệnh nhân...';
        if (name && section) section.classList.add('quyen-patient-found');

        setTimeout(function() {
            setLoading('Đọc sinh hiệu...', 50);
            // Show vitals
            if (vitalsEl && vitals) {
                const parts = [];
                if (vitals.pulse) parts.push('💓' + vitals.pulse);
                if (vitals.temp) parts.push('🌡️' + vitals.temp + '°C');
                if (parts.length > 0) {
                    vitalsEl.textContent = parts.join('  ');
                    vitalsEl.style.display = 'block';
                }
            }
        }, 300);

        setTimeout(function() { setLoading('Chuẩn bị...', 80); }, 500);
        setTimeout(function() { setLoading('✅ Sẵn sàng', 100, true); }, 700);
        setTimeout(function() {
            hideLoading();
            // ★ SPRINT B: Cập nhật lock indicator
            updateLockIndicator();
            // ★ SPRINT D: Fill tracker progress UI
            setupFillTracker();
            // ★ Auto-scan thuốc khi chọn BN mới
            if (typeof QuyenInfusionReader !== 'undefined') {
                QuyenInfusionReader.rescan();
            }
            // ★ Pulse icon __EXT_EMOJI__ + chuyển sang HAPPY khi BN đã load xong
            const icon = document.getElementById('quyen-mini-icon');
            if (icon) {
                setFlowerState('happy');
                icon.classList.add('quyen-mini-pulse');
                setTimeout(function () { icon.classList.remove('quyen-mini-pulse'); }, 1200);
            }
        }, 2000);
    }

    function setLoading(text, percent, done) {
        const bar = document.getElementById('quyen-patient-loading');
        const fill = document.getElementById('quyen-loading-fill');
        const label = document.getElementById('quyen-loading-text');
        const flower = document.getElementById('quyen-mini-icon');

        if (!bar || !fill || !label) return;

        bar.style.display = 'flex';
        fill.style.width = percent + '%';
        label.textContent = text;

        fill.classList.toggle('quyen-loading-done', !!done);
        label.classList.toggle('quyen-loading-done', !!done);

        // ★ Nhảy số % chỗ bông hoa
        if (flower) {
            if (!done) {
                flower.textContent = percent + '%';
                flower.style.fontSize = '12px';
                flower.style.fontWeight = 'bold';
            } else {
                flower.textContent = '__EXT_EMOJI__';
                flower.style.fontSize = '';
                flower.style.fontWeight = '';
            }
        }
    }

    function hideLoading() {
        const bar = document.getElementById('quyen-patient-loading');
        if (bar) {
            bar.style.opacity = '0';
            setTimeout(function() {
                bar.style.display = 'none';
                bar.style.opacity = '1';
            }, 300);
        }
    }

    // ==========================================
    // UPDATE DRUG LIST UI
    // ==========================================
    function updateDrugList(allDrugs, ivDrugs) {
        if (!_drugListEl) return;

        // Tên BN đã hiện ở đầu panel → không cần hiện lại

        // Lọc chỉ thuốc ngày hôm nay
        const today = new Date();
        const todayStr = ('0' + today.getDate()).slice(-2) + '/' + ('0' + (today.getMonth() + 1)).slice(-2) + '/' + today.getFullYear();
        const todayDrugs = ivDrugs.filter(isTodayPrescription);

        if (todayDrugs.length === 0) {
            const msg = ivDrugs.length > 0
                ? `Có ${ivDrugs.length} thuốc truyền nhưng không có y lệnh ngày hôm nay (${todayStr})`
                : (allDrugs.length > 0
                    ? `Có ${allDrugs.length} thuốc nhưng không có thuốc truyền`
                    : 'Chờ mở form truyền dịch...');
            _drugListEl.innerHTML = `<div class="quyen-empty">${msg}</div>`;

            const fillAllBtn = document.getElementById('quyen-btn-fill-all');
            if (fillAllBtn) fillAllBtn.disabled = true;
            return;
        }

        // Dùng todayDrugs thay vì ivDrugs
        ivDrugs = todayDrugs;

        let html = '';

        ivDrugs.forEach((drug, index) => {
            const fullUsage = drug.usage || '';

            // Build tooltip with all details
            const tooltipParts = [drug.name];
            if (drug.concentration) tooltipParts.push('Nồng độ: ' + drug.concentration);
            if (drug.activeIngredient) tooltipParts.push('Hoạt chất: ' + drug.activeIngredient);
            if (drug.prescriptionDate) tooltipParts.push('Ngày kê: ' + drug.prescriptionDate);
            if (fullUsage) tooltipParts.push('Cách dùng: ' + fullUsage);
            tooltipParts.push('💉 Truyền TM');
            const tooltip = escapeHtml(tooltipParts.join('\n'));

            html += `
                <div class="quyen-drug-card quyen-drug-iv" data-index="${index}" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;margin:3px 0;border-radius:8px;background:rgba(0,0,0,0.05);border:1px solid rgba(0,0,0,0.08);">
                    <span class="quyen-drug-label" data-tip="${tooltip}" style="flex:1;font-size:12px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help;">${escapeHtml(drug.name)}</span>
                    <button class="quyen-btn quyen-btn-fill" data-drug-index="${index}" title="Điền ${escapeHtml(drug.name)}" style="margin-left:8px;padding:4px 14px;border-radius:6px;border:none;background:#4CAF50;color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);">💉 Điền</button>
                </div>
            `;
        });

        _drugListEl.innerHTML = html;

        // Click handlers
        _drugListEl.querySelectorAll('.quyen-btn-fill').forEach(btn => {
            btn.addEventListener('click', function () {
                const idx = parseInt(this.getAttribute('data-drug-index') || '0');
                const drug = ivDrugs[idx];
                if (drug) {
                    // ★ Lớp 1: Đã chọn BN chưa?
                    if (typeof HIS === 'undefined' || !HIS.PatientLock || !HIS.PatientLock.hasSource()) {
                        showToast('🚫 Chưa chọn bệnh nhân! Hãy click chọn BN trong danh sách trước.', 'error');
                        QuyenLog.warn('🔒 Infusion fill BLOCKED: no patient source');
                        return;
                    }

                    // ★ Lớp 2: BN trong form có khớp BN đã chọn không?
                    const lockResult = HIS.PatientLock.verifyCurrentForm({ requireTarget: true });
                    if (!lockResult.ok) {
                        showToast('🚫 ' + lockResult.details, 'error');
                        QuyenLog.warn('🔒 Infusion fill BLOCKED:', lockResult.reason, lockResult.details);
                        updateLockIndicator();
                        return;
                    }

                    const result = QuyenInfusionFiller.fillForm(drug);
                    if (result.success && !result.pending) {
                        // ★ Form đang mở sẵn — fill thành công ngay lập tức
                        incrementFilledCount();
                        showToast(`✅ Đã điền "${drug.name}" — ${getRandomThank()}`);
                        this.classList.add('quyen-btn-done');
                        this.textContent = '✅ Đã điền';
                    } else if (result.success && result.pending) {
                        // ★ Form chưa mở — đang chờ. showCompletionEffect() sẽ báo khi xong
                        showToast(`⏳ Chưa thấy form truyền dịch, đang chờ...`, 'warning');
                        this.textContent = '⏳ Chờ...';
                        this.disabled = true;
                    } else {
                        showToast(`❌ Lỗi: ${result.error}`, 'error');
                    }
                }
            });
        });

        // Enable fill-all
        const fillAllBtn = document.getElementById('quyen-btn-fill-all');
        if (fillAllBtn) fillAllBtn.disabled = false;
    }

    // ==========================================
    // UPDATE PATIENT NAME
    // Lấy tên BN từ form dialog hoặc grid
    // ==========================================
    // eslint-disable-next-line no-unused-vars
    function updatePatientName() {
        if (!_patientNameEl) return;

        // LUÔN reset để lấy tên mới
        _currentPatientName = '';

        // Ưu tiên 1: Lấy từ selected row trong grid bệnh nhân
        const selectedRow = document.querySelector('#grdBenhNhan tr.ui-state-highlight, #grdBenhNhan tr[aria-selected="true"], #grdBenhNhan tr.markedRow');
        if (selectedRow) {
            const nameCells = selectedRow.querySelectorAll('td');
            for (const cell of nameCells) {
                const t = (cell.textContent || '').trim();
                // Tên BN: viết hoa, dài hơn 3 ký tự, không phải số/mã
                if (t.length > 3 && /^[A-ZÀ-Ỹ]/.test(t) && !t.match(/^\d/) && t.includes(' ')) {
                    _currentPatientName = t;
                    break;
                }
            }
        }

        // Ưu tiên 2: Từ title dialog
        if (!_currentPatientName) {
            const dialogs = document.querySelectorAll('.ui-dialog-title, .ui-dialog-titlebar span');
            for (const d of dialogs) {
                const text = d.textContent || '';
                const match = text.match(/\(([^/]+)/);
                if (match) {
                    _currentPatientName = match[1].trim();
                    break;
                }
            }
        }

        if (_currentPatientName) {
            _patientNameEl.textContent = `👤 ${_currentPatientName}`;
            _patientNameEl.style.display = 'block';
        } else {
            _patientNameEl.style.display = 'none';
        }
    }

    // ==========================================
    // HELPER: KIỂM TRA THUỐC TRONG NGÀY
    // ==========================================
    function isTodayPrescription(drug) {
        if (!drug || !drug.prescriptionDate) return true; // Giữ nếu không có ngày
        const today = new Date();
        const todayStr = ('0' + today.getDate()).slice(-2) + '/' + ('0' + (today.getMonth() + 1)).slice(-2) + '/' + today.getFullYear();
        // Normalize format — chấp nhận DD/MM/YYYY hoặc YYYY-MM-DD
        const pDate = drug.prescriptionDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1');
        return pDate === todayStr;
    }

    // ==========================================
    // FILL ALL IV DRUGS
    // ==========================================
    // eslint-disable-next-line no-unused-vars
    function fillAllDrugs() {
        // ★ Lớp 1: Đã chọn BN chưa?
        if (typeof HIS === 'undefined' || !HIS.PatientLock || !HIS.PatientLock.hasSource()) {
            showToast('🚫 Chưa chọn bệnh nhân! Hãy click chọn BN trong danh sách trước.', 'error');
            QuyenLog.warn('🔒 Fill-All BLOCKED: no patient source');
            return;
        }

        // ★ Lớp 2: BN trong form có khớp BN đã chọn không?
        const lockResult = HIS.PatientLock.verifyCurrentForm({ requireTarget: true });
        if (!lockResult.ok) {
            showToast('🚫 ' + lockResult.details, 'error');
            QuyenLog.warn('🔒 Fill-All BLOCKED:', lockResult.reason, lockResult.details);
            updateLockIndicator();
            return;
        }

        const allIV = QuyenInfusionReader.getIVDrugs();
        const ivDrugs = allIV.filter(isTodayPrescription);
        
        if (ivDrugs.length === 0) {
            showToast('Không có thuốc truyền dịch ngày hôm nay!', 'warning');
            return;
        }

        // Fill the first IV drug (typically one at a time)
        const drug = ivDrugs[0];
        const result = QuyenInfusionFiller.fillForm(drug);

        if (result.success) {
            incrementFilledCount();
            showToast(`✅ Đã điền "${drug.name}" — ${getRandomThank()}`);
        } else {
            showToast(`❌ Lỗi: ${result.error}`, 'error');
        }
    }

    // ==========================================
    // TOAST NOTIFICATION
    // ==========================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `quyen-toast quyen-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // \u2605 T\u00ednh v\u1ecb tr\u00ed ngay tr\u00ean panel, clamp trong viewport
        function positionToast() {
            if (_panel) {
                const pr = _panel.getBoundingClientRect();
                const th = toast.offsetHeight || 40;
                const tw = toast.offsetWidth || 200;
                const vw = window.innerWidth;
                let left = pr.left + pr.width / 2;
                left = Math.max(tw / 2 + 10, Math.min(left, vw - tw / 2 - 10));
                toast.style.left = left + 'px';
                toast.style.top = Math.max(10, pr.top - th - 10) + 'px';
            }
        }

        requestAnimationFrame(() => {
            positionToast();
            toast.classList.add('quyen-toast-show');
        });

        setTimeout(() => {
            toast.classList.add('quyen-toast-hide');
            setTimeout(() => toast.remove(), 500);
        }, QUYEN_CONFIG.TOAST_DURATION);
    }


    // ==========================================
    // STATS
    // ==========================================
    function loadStats() {
        try {
            const today = new Date().toDateString();
            const saved = localStorage.getItem('quyen_stats');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.date === today) {
                    _filledToday = data.count || 0;
                }
            }
            updateStatsUI();
        } catch (e) { console.debug("[Nurse] catch:", e.message || e); }
    }

    function incrementFilledCount() {
        _filledToday++;
        updateStatsUI();
        try {
            localStorage.setItem('quyen_stats', JSON.stringify({
                date: new Date().toDateString(),
                count: _filledToday
            }));
        } catch (e) { console.debug("[Nurse] catch:", e.message || e); }
    }

    function updateStatsUI() {
        if (!_statsEl) return;
        const tier = TIER_CONFIG.find(t => _filledToday >= t.min);
        // Remove all tier classes
        TIER_CONFIG.forEach(t => _statsEl.classList.remove(t.cls));
        _statsEl.classList.add(tier.cls);
        _statsEl.innerHTML =
            `<span class="quyen-merit-icon">${tier.icon}</span>` +
            `<span class="quyen-merit-count">${_filledToday}</span>` +
            `<span class="quyen-merit-label">chỉ vàng</span>`;
    }

    // ==========================================
    // MINIMIZE → __EXT_EMOJI__ flower / RESTORE
    // ==========================================
    function toggleMinimize() {
        // Save current position before minimizing
        if (_panel.style.left) {
            _savedLeft = _panel.style.left;
            _savedTop = _panel.style.top;
        }
        _isMinimized = true;
        // Reset to bottom-right corner
        _panel.style.left = '';
        _panel.style.top = '';
        _panel.style.bottom = '20px';
        _panel.style.right = '20px';
        _panel.classList.add('quyen-minimized');
    }

    function restorePanel() {
        _isMinimized = false;
        _panel.classList.remove('quyen-minimized');
        if (_savedLeft && _savedTop) {
            requestAnimationFrame(function() {
                _panel.style.bottom = 'auto';
                _panel.style.right = 'auto';
                _panel.style.left = _savedLeft;
                _panel.style.top = _savedTop;
                setTimeout(clampToViewport, 450);
            });
        }
    }

    function clampToViewport() {
        if (!_panel) return;
        const rect = _panel.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let nl = rect.left, nt = rect.top;
        if (rect.right > vw) nl = vw - rect.width;
        if (rect.bottom > vh) nt = vh - rect.height;
        if (nl < 0) nl = 0;
        if (nt < 0) nt = 0;
        _panel.style.left = nl + 'px';
        _panel.style.top = nt + 'px';
    }

    // ==========================================
    // TAB SYSTEM
    // ==========================================
    // ==========================================
    // ROMAN/ARABIC SPEED TOGGLE
    // ==========================================
    function setupRomanToggle() {
        // ★ Luôn dùng La Mã
        if (typeof QuyenInfusionFiller !== 'undefined') {
            QuyenInfusionFiller.setUseRomanSpeed(true);
        }
    }

    function setupTabHandlers() {
        const tabBar = document.getElementById('quyen-tab-bar');
        if (!tabBar) return;

        tabBar.querySelectorAll('.quyen-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                switchTab(this.getAttribute('data-tab'));
            });
        });
    }

    function switchTab(tabId) {
        _activeTab = tabId;

        // Update tab buttons
        document.querySelectorAll('.quyen-tab').forEach(tab => {
            tab.classList.toggle('quyen-tab-active', tab.getAttribute('data-tab') === tabId);
        });

        // Update tab content
        document.querySelectorAll('.quyen-tab-content').forEach(content => {
            content.classList.toggle('quyen-tab-content-active',
                content.id === 'quyen-tab-content-' + tabId);
        });

        QuyenLog.info('🔀 Switch tab:', tabId);
    }

    // ==========================================
    // DRAGGABLE
    // ==========================================
    function makeDraggable(panel, handle) {
        let isDragging = false;
        let startX, startY, panelStartX, panelStartY;
        let animFrameId = null;
        let currentX, currentY;

        handle.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;
            isDragging = true;
            panel.classList.add('quyen-dragging');

            const rect = panel.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            panelStartX = rect.left;
            panelStartY = rect.top;

            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            currentX = panelStartX + (e.clientX - startX);
            currentY = panelStartY + (e.clientY - startY);
            if (!animFrameId) {
                animFrameId = requestAnimationFrame(updatePosition);
            }
        }

        function updatePosition() {
            animFrameId = null;
            if (!isDragging) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            currentX = Math.max(0, Math.min(currentX, vw - panel.offsetWidth));
            currentY = Math.max(0, Math.min(currentY, vh - panel.offsetHeight));
            panel.style.left = currentX + 'px';
            panel.style.top = currentY + 'px';
        }

        function onMouseUp() {
            isDragging = false;
            panel.classList.remove('quyen-dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
            clampToViewport();
        }

        // Re-clamp on window resize
        window.addEventListener('resize', function() {
            if (!_isMinimized && panel.style.left) clampToViewport();
        });
    }




    // ==========================================
    // UTILITY
    // ==========================================
    // ★ BUG-22: Dùng HIS.Utils.escapeHtml nếu có, fallback nếu không
    function escapeHtml(text) {
        if (typeof HIS !== 'undefined' && HIS.Utils && HIS.Utils.escapeHtml) {
            return HIS.Utils.escapeHtml(text);
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==========================================
    // ★ SPRINT B: LOCK INDICATOR
    // ==========================================
    function updateLockIndicator() {
        const display = document.getElementById('quyen-patient-display');
        if (!display) return;

        // Remove existing indicator
        const existing = document.getElementById('quyen-lock-indicator');
        if (existing) existing.remove();

        const indicator = document.createElement('span');
        indicator.id = 'quyen-lock-indicator';

        // Base style: small icon
        const baseStyle = 'margin-left: 6px; font-size: 12px; cursor: help; vertical-align: middle;';

        if (typeof HIS !== 'undefined' && HIS.PatientLock && HIS.PatientLock.hasSource()) {
            const result = HIS.PatientLock.verifyCurrentForm();
            if (result.ok) {
                indicator.textContent = '✓';
                indicator.title = 'Xác nhận: BN khớp\n' + result.details;
                indicator.style.cssText = baseStyle + 'color: #28a745;';
                if (_panel) _panel.classList.remove('quyen-theme-danger');
            } else if (result.reason === 'NO_TARGET') {
                indicator.textContent = '⚠️';
                indicator.title = 'Thông tin chặn:\n' + result.details;
                indicator.style.cssText = baseStyle + 'color: #e67e22;';
                if (_panel) _panel.classList.remove('quyen-theme-danger');
            } else {
                indicator.textContent = '❌';
                indicator.title = 'Chưa khớp BN!\n' + result.details;
                indicator.style.cssText = baseStyle + 'color: #f44336;';
                // Kích hoạt theme cảnh báo đỏ
                if (_panel) _panel.classList.add('quyen-theme-danger');
                setFlowerState('fire');
            }
        } else {
            indicator.textContent = '○';
            indicator.title = 'Chưa chọn bệnh nhân';
            indicator.style.cssText = baseStyle + 'color: #999;';
            if (_panel) _panel.classList.remove('quyen-theme-danger');
        }

        display.parentNode.insertBefore(indicator, display.nextSibling);
    }

    // ==========================================
    // ★ SPRINT D: FILL TRACKER PROGRESS UI
    // ==========================================
    function setupFillTracker() {
        if (typeof HIS === 'undefined' || !HIS.FillTracker) return;

        // ★ Fix: Remove listener cũ trước khi đăng ký mới — tránh tích lũy sau mỗi lần chọn BN
        if (_fillTrackerUnsub) { _fillTrackerUnsub(); _fillTrackerUnsub = null; }

        _fillTrackerUnsub = HIS.FillTracker.onChange(function (state, detail) {
            const S = HIS.FillTracker.STATE;
            const status = HIS.FillTracker.getStatus();

            if (state === S.FILLING) {
                showFillProgress('⏳ Đang điền: ' + (detail || '...'), true);
            } else if (state === S.DRUG_SELECTED) {
                showFillProgress('💊 Đã chọn thuốc, điền tốc độ...', true);
            } else if (state === S.DONE) {
                showFillProgress('✅ Hoàn tất! (' + (status.elapsed / 1000).toFixed(1) + 's)', false);
                setTimeout(hideFillProgress, 3000);
            } else if (state === S.TIMEOUT) {
                showFillProgress('⏰ Quá thời gian!', false);
                showToast('⏰ Fill quá 30s — có thể bị kẹt. Kiểm tra form!', 'error');
            } else if (state === S.CANCELLED) {
                showFillProgress('❌ Đã hủy', false);
                setTimeout(hideFillProgress, 2000);
            } else if (state === S.ERROR) {
                showFillProgress('❌ Lỗi: ' + detail, false);
                showToast('❌ Fill lỗi: ' + detail, 'error');
            }
        });
    }

    function showFillProgress(text, showCancel) {
        const statusEl = document.getElementById('quyen-fill-status');
        if (!statusEl) return;

        let html = text;
        if (showCancel) {
            html += ' <span id="quyen-fill-cancel" style="cursor:pointer;margin-left:4px;opacity:0.7;" title="Hủy">❌</span>';
        }
        statusEl.innerHTML = html;

        if (showCancel) {
            const cancelBtn = document.getElementById('quyen-fill-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function () {
                    if (typeof HIS !== 'undefined' && HIS.FillTracker) {
                        HIS.FillTracker.cancel();
                    }
                });
            }
        }
    }

    function hideFillProgress() {
        const statusEl = document.getElementById('quyen-fill-status');
        if (statusEl) {
            statusEl.style.transition = 'opacity 0.3s';
            statusEl.style.opacity = '0';
            setTimeout(function () { statusEl.textContent = ''; statusEl.style.opacity = '1'; }, 300);
        }
    }

    // ==========================================
    // ★ EPIC GOLD FLASH EFFECT
    // ==========================================
    function triggerGoldFlash() {
        const flash = document.createElement('div');
        flash.className = 'quyen-epic-gold-flash';
        flash.innerHTML = `
            <div class="quyen-gold-ring"></div>
            <div class="quyen-gold-particle quyen-gp-1">✨</div>
            <div class="quyen-gold-particle quyen-gp-2">💰</div>
            <div class="quyen-gold-particle quyen-gp-3">✨</div>
            <div class="quyen-gold-particle quyen-gp-4">🪙</div>
            <div class="quyen-gold-particle quyen-gp-5">✨</div>
        `;
        document.body.appendChild(flash);
        setTimeout(function() {
            if (flash.parentNode) flash.parentNode.removeChild(flash);
        }, 2000);
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        /** Khởi tạo UI panel, tạo DOM, wire events */
        init,
        /**
         * Cập nhật danh sách thuốc truyền dịch hiển thị trong tab Infusion
         * @param {Array} allDrugs - Tất cả thuốc từ y lệnh
         * @param {Array} ivDrugs - Chỉ thuốc truyền dịch (IV)
         */
        updateDrugList,
        /**
         * Hiện toast notification
         * @param {string} message - Nội dung thông báo
         * @param {'success'|'error'|'warning'|'info'} [type='success'] - Loại toast
         */
        showToast,
        /** Tăng counter chỉ vàng +1, cập nhật tier badge */
        incrementFilledCount,
        /**
         * Chuyển tab trong panel
         * @param {'infusion'|'caresheet'|'vattu'} tabName
         */
        switchTab,
        /**
         * Đổi trạng thái bông hoa mini icon
         * @param {'sad'|'happy'|'fire'} state
         */
        setFlowerState,
        /** Trigger hiệu ứng flash vàng khi đạt tier mới */
        triggerGoldFlash
    };
})();
