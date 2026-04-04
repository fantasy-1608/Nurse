/* eslint-disable no-prototype-builtins */
/**
 * __EXT_EMOJI__ __EXT_NAME__ — Care Sheet Filler
 * Điền form phiếu chăm sóc trên VNPT-HIS
 * 
 * QUAN TRỌNG: Form phiếu chăm sóc nằm trong iframe #divDlgThemPhieuifmView
 * → Phải dùng getFormDocument() thay vì document trực tiếp!
 * 
 * Hỗ trợ 3 loại field:
 *   - text: input[type="text"] 
 *   - checkbox: input[type="checkbox"] (cùng name, khác value)
 *   - split: nhiều input cùng ctFormId (ví dụ: Thở oxy = C1 | Mask)
 */

/* global QuyenLog, CARESHEET_CONFIG */
/* exported QuyenCareSheetFiller */

const QuyenCareSheetFiller = (function () {

    // ==========================================
    // GET FORM DOCUMENT
    // Form phiếu CS nằm trong iframe → phải lấy đúng document
    // ==========================================
    function getFormDocument() {
        // Lấy tất cả iframes
        const allIframes = document.querySelectorAll('iframe');

        // Lọc cấu trúc ưu tiên: Visible (hiển thị) lên đầu
        const formIframes = [];
        for (const iframe of allIframes) {
            // Check visibility. In some browsers, offsetParent is null if display:none
            const isVisible = iframe.offsetParent !== null;
            formIframes.push({ elm: iframe, isVisible: isVisible });
        }
        
        // Sắp xếp: visible iframes được check trước
        formIframes.sort((a, b) => (a.isVisible === b.isVisible) ? 0 : a.isVisible ? -1 : 1);

        // Cách 1 & 2 gộp: check các iframe khả nghi
        for (const item of formIframes) {
            const iframe = item.elm;
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!iframeDoc) continue;

                // Kiểm tra xem iframe có chứa field đặc trưng (Sinh hiệu) hay không
                const vitalField = iframeDoc.querySelector('[data-ct-form-id="1243"]');
                if (vitalField) {
                    QuyenLog.info(`  📄 Tìm thấy iframe form CS (visible=${item.isVisible}) qua data-ct-form-id: #${iframe.id || '(no-id)'}`);
                    return iframeDoc;
                }

                // Hoặc có chứa tcChiTietPhieu
                const chitiet = iframeDoc.getElementById('tcChiTietPhieu');
                if (chitiet) {
                    QuyenLog.info(`  📄 Tìm thấy iframe form CS (visible=${item.isVisible}) qua tcChiTietPhieu: #${iframe.id || '(no-id)'}`);
                    return iframeDoc;
                }
                
                // Backup check fallback cho các src quen thuộc nếu DOM chưa load xong
                if (iframe.id && iframe.id.includes('ThemPhieu') || (iframe.src && (iframe.src.includes('ThemPhieu') || iframe.src.includes('NTU02D204')))) {
                    // Nếu là iframe ThemPhieu nhưng không tìm thấy data-ct-form-id, có thể do DOM chưa tải kịp
                    // nhưng nếu nó VISIBLE, nó RẤT ĐÁNG để dùng
                    if (item.isVisible) {
                         QuyenLog.info(`  📄 Fallback: Tìm thấy iframe (visible) theo src/id: #${iframe.id || '(no-id)'} nhưng DOM có thể rỗng.`);
                         return iframeDoc;
                    }
                }
            } catch (e) {
                // Cross-origin iframe → bỏ qua
            }
        }

        // Cách 3: Fallback — dùng document chính (trường hợp form không trong iframe)
        const vitalField = document.querySelector('[data-ct-form-id="1243"]');
        if (vitalField) {
            QuyenLog.info('  📄 Form CS nằm trong document chính');
            return document;
        }

        QuyenLog.warn('  ❌ Không tìm thấy document chứa form phiếu chăm sóc (có thể form chưa loading xong)');
        return null;
    }

    // ==========================================
    // FILL FROM TEMPLATE
    // Điền toàn bộ template values vào HIS form
    // ==========================================
    function fillFromTemplate(templateId) {
        const template = CARESHEET_CONFIG.TEMPLATES.find(t => t.id === templateId);
        if (!template) {
            QuyenLog.error('❌ Không tìm thấy template:', templateId);
            return { success: false, error: 'Template không tồn tại' };
        }

        QuyenLog.info(`📋 Đang điền mẫu "${template.name}"...`);

        const formDoc = getFormDocument();
        if (!formDoc) {
            return { success: false, error: 'Form phiếu chăm sóc chưa mở. Hãy bấm "Thêm phiếu" trên HIS trước!' };
        }

        const values = template.values;
        let filledCount = 0;
        const errors = [];

        for (const section of CARESHEET_CONFIG.SECTIONS) {
            console.groupCollapsed(`__EXT_EMOJI__ ${section.title}`);
            for (const field of section.fields) {
                try {
                    const result = fillField(formDoc, field, values);
                    if (result.filled) filledCount++;
                    if (result.error) errors.push(result.error);
                } catch (e) {
                    QuyenLog.error(`  ❌ Lỗi điền ${field.label}:`, e);
                    errors.push(`${field.label}: ${e.message}`);
                }
            }
            console.groupEnd();
        }

        QuyenLog.info(`✅ Đã điền ${filledCount} fields, ${errors.length} lỗi`);

        return {
            success: true, // Không báo lỗi nghiêm trọng trên UI chỉ vì thiếu field template
            filledCount,
            errors,
            templateName: template.name
        };
    }

    // ==========================================
    // FILL CUSTOM VALUES
    // Điền từ object values tùy chỉnh (từ mini form)
    // ==========================================
    function fillCustomValues(values) {
        const formDoc = getFormDocument();
        if (!formDoc) {
            return { success: false, error: 'Form phiếu chăm sóc chưa mở!' };
        }

        let filledCount = 0;
        const errors = [];

        for (const section of CARESHEET_CONFIG.SECTIONS) {
            console.groupCollapsed(`__EXT_EMOJI__ ${section.title}`);
            for (const field of section.fields) {
                try {
                    const result = fillField(formDoc, field, values);
                    if (result.filled) filledCount++;
                    if (result.error) errors.push(result.error);
                } catch (e) {
                    errors.push(`${field.label}: ${e.message}`);
                }
            }
            console.groupEnd();
        }

        return { success: errors.length === 0, filledCount, errors };
    }

    // ==========================================
    // FILL SINGLE FIELD — nhận formDoc làm param
    // ==========================================
    function fillField(formDoc, field, values) {
        switch (field.type) {
            case 'text':
                return fillTextField(formDoc, field, values);
            case 'checkbox':
                return fillCheckboxField(formDoc, field, values);
            case 'split':
                return fillSplitField(formDoc, field, values);
            default:
                return { filled: false, error: `Unknown type: ${field.type}` };
        }
    }

    // ==========================================
    // TEXT FIELD
    // ==========================================
    function fillTextField(formDoc, field, values) {
        const value = values[field.key];
        if (value === undefined || value === null) return { filled: false };
        if (value === '') return { filled: false };

        const container = formDoc.querySelector(`[data-ct-form-id="${field.ctFormId}"]`);
        if (!container) {
            QuyenLog.warn(`  ⚠️ Không tìm thấy [data-ct-form-id="${field.ctFormId}"] cho "${field.label}"`);
            return { filled: false, error: `Không tìm thấy: ${field.label}` };
        }

        const input = container.querySelector('input[type="text"], input:not([type])');
        if (!input) {
            QuyenLog.warn(`  ⚠️ Không tìm thấy input trong "${field.label}"`);
            return { filled: false, error: `Không tìm thấy input: ${field.label}` };
        }

        setInputValue(input, String(value));
        QuyenLog.info(`  ✅ ${field.label}: "${value}"`);
        return { filled: true };
    }

    // ==========================================
    // CHECKBOX FIELD
    // ==========================================
    function fillCheckboxField(formDoc, field, values) {
        const selectedValues = values[field.key];
        if (!selectedValues || !Array.isArray(selectedValues) || selectedValues.length === 0) {
            return { filled: false };
        }

        const container = formDoc.querySelector(`[data-ct-form-id="${field.ctFormId}"]`);
        if (!container) {
            QuyenLog.warn(`  ⚠️ Không tìm thấy container checkbox "${field.label}"`);
            return { filled: false, error: `Không tìm thấy: ${field.label}` };
        }

        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        if (checkboxes.length === 0) {
            QuyenLog.warn(`  ⚠️ Không có checkbox nào trong "${field.label}"`);
            return { filled: false, error: `Không có checkbox: ${field.label}` };
        }

        let tickedCount = 0;

        // Uncheck tất cả trước
        checkboxes.forEach(cb => {
            if (cb.checked) {
                cb.click(); // Native click toggles the state and fires necessary events
                if (cb.checked) { // Fallback if click didn't toggle
                    cb.checked = false;
                    triggerEvent(cb, 'change');
                }
            }
        });

        // Check theo selected values
        for (const val of selectedValues) {
            let found = false;
            for (const cb of checkboxes) {
                if (cb.value === val) {
                    if (!cb.checked) {
                        cb.click();
                        if (!cb.checked) { // Fallback
                            cb.checked = true;
                            triggerEvent(cb, 'change');
                        }
                    }
                    tickedCount++;
                    found = true;
                    break;
                }
            }
            if (!found) {
                QuyenLog.warn(`  ⚠️ Không tìm thấy checkbox value="${val}" trong "${field.label}"`);
            }
        }

        QuyenLog.info(`  ✅ ${field.label}: [${selectedValues.join(', ')}] (${tickedCount} ticked)`);
        return { filled: tickedCount > 0 };
    }

    // ==========================================
    // SPLIT FIELD
    // ==========================================
    function fillSplitField(formDoc, field, values) {
        const splitKeys = field.splitKeys || [];
        if (splitKeys.length === 0) return { filled: false };

        const container = formDoc.querySelector(`[data-ct-form-id="${field.ctFormId}"]`);
        if (!container) {
            QuyenLog.warn(`  ⚠️ Không tìm thấy container split "${field.label}"`);
            return { filled: false, error: `Không tìm thấy: ${field.label}` };
        }

        const inputs = container.querySelectorAll('input[type="text"], input:not([type])');
        let filledCount = 0;

        for (let i = 0; i < splitKeys.length && i < inputs.length; i++) {
            const val = values[splitKeys[i]];
            if (val !== undefined && val !== null && val !== '') {
                setInputValue(inputs[i], String(val));
                filledCount++;
            }
        }

        if (filledCount > 0) {
            QuyenLog.info(`  ✅ ${field.label}: ${splitKeys.map(k => values[k] || '').join(' | ')}`);
        }
        return { filled: filledCount > 0 };
    }

    // ==========================================
    // CHECK IF CARE SHEET FORM IS OPEN
    // ==========================================
    function isCareSheetFormOpen() {
        return getFormDocument() !== null;
    }

    // ==========================================
    // UTILITY — Set input value + trigger events
    // ==========================================
    function setInputValue(input, value) {
        if (input.disabled && !input.id.includes('datepicker')) return;

        // Thử dùng native setter từ iframe's window
        try {
            const win = input.ownerDocument.defaultView || window;
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                win.HTMLInputElement.prototype, 'value'
            )?.set;

            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, value);
            } else {
                input.value = value;
            }
        } catch (e) {
            input.value = value;
        }

        triggerEvent(input, 'input');
        triggerEvent(input, 'change');
        triggerEvent(input, 'blur');
    }

    function triggerEvent(el, eventType) {
        const event = new Event(eventType, { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
    }

    // ==========================================
    // SECTION 4 AUTO-COPY — Lấy "Cơ quan bệnh" + cân nặng từ phiếu cũ
    // ==========================================
    let _cachedSec4Data = null;
    let _cachedSec17Data = null;
    let _cachedWeight = '';
    let _cachedHeight = '';
    let _cachedPatientName = '';
    let _cachedPhieuId = '';
    let _cachedVitalsFromPrev = null; // ★ Sinh hiệu từ phiếu cũ (dữ liệu thật)

    // Lắng nghe dữ liệu Section 4 từ Bridge
    window.addEventListener('message', function (event) {
        if (!event.data || event.data.type !== 'QUYEN_CARESHEET_SEC4_DATA') return;
        // ★ SPRINT C: Origin validation
        if (typeof HIS !== 'undefined' && HIS.Message && !HIS.Message.isValid(event)) return;
        if (event.data.data && Object.keys(event.data.data).length > 0) {
            _cachedSec4Data = event.data.data;
        }
        if (event.data.sec17 && Object.keys(event.data.sec17).length > 0) {
            _cachedSec17Data = event.data.sec17;
        }
        if (event.data.weight) _cachedWeight = event.data.weight;
        if (event.data.height) _cachedHeight = event.data.height;
        if (event.data.patientName) _cachedPatientName = event.data.patientName;
        if (event.data.phieuId) _cachedPhieuId = event.data.phieuId;
        // ★ Sinh hiệu từ phiếu cũ
        if (event.data.vitalsFromPrev && Object.keys(event.data.vitalsFromPrev).length > 0) {
            _cachedVitalsFromPrev = event.data.vitalsFromPrev;
        }

        const phieuId = event.data.phieuId || '';
        const vitalCount = _cachedVitalsFromPrev ? Object.keys(_cachedVitalsFromPrev).length : 0;
        QuyenLog.info('📋 Nhận từ phiếu cũ #' + phieuId + ': Sec4=' + JSON.stringify(_cachedSec4Data) + ', Sec17=' + JSON.stringify(_cachedSec17Data) + ', CN=' + _cachedWeight + 'kg, CC=' + _cachedHeight + 'cm, Vitals=' + vitalCount + ' mục');
    });

    // Lắng nghe Vitals từ patient selection + API NT.006
    window.addEventListener('message', function (event) {
        if (!event.data) return;
        let v = null;
        if (event.data.type === 'QUYEN_VITALS_RESULT') v = event.data.vitals;
        if (event.data.type === 'QUYEN_PATIENT_SELECTED') {
            // ★ FIX Bug1: Reset caches khi chuyển BN mới
            _cachedSec4Data = null;
            _cachedSec17Data = null;
            _cachedWeight = '';
            _cachedHeight = '';
            _cachedPatientName = '';
            _cachedPhieuId = '';
            _cachedVitalsFromPrev = null;
            v = event.data.vitals;
        }
        if (!v) return;
        // Luôn cập nhật (không guard !_cachedHeight nữa — BN mới đã clear cache ở trên)
        if (v.height) _cachedHeight = v.height;
        if (v.weight) _cachedWeight = v.weight;
        if (v.height || v.weight) {
            QuyenLog.info('⚖️ Vitals → CC=' + (v.height || 'N/A') + 'cm, CN=' + (v.weight || 'N/A') + 'kg');
        }
    });

    /**
     * Điền Section 4 "Cơ quan bệnh" + cân nặng từ phiếu chăm sóc gần nhất.
     */
    function fillSection4FromPrevious() {
        const formDoc = getFormDocument();
        if (!formDoc) {
            QuyenLog.warn('❌ Form phiếu chăm sóc chưa mở!');
            return { success: false, error: 'Form chưa mở' };
        }

        // ★ Chỉ dùng cache nếu ĐÃ CÓ sec4 hoặc sec17 (không dựa vào weight)
        if (_cachedSec4Data || _cachedSec17Data) {
            return _doFillSection4(formDoc, _cachedSec4Data || {}, _cachedWeight, _cachedSec17Data || {});
        }

        // Chưa có cache → request Bridge
        QuyenLog.info('📋 Yêu cầu Bridge gửi Section 4...');
        window.postMessage({ type: 'QUYEN_REQ_CARESHEET_SEC4' }, location.origin);

        // Chờ response (tối đa 3 giây)
        return new Promise(function (resolve) {
            let resolved = false;
            function onMessage(ev) {
                if (ev.data && ev.data.type === 'QUYEN_CARESHEET_SEC4_DATA' && !resolved) {
                    resolved = true;
                    window.removeEventListener('message', onMessage);
                    _cachedSec4Data = ev.data.data || {};
                    _cachedSec17Data = ev.data.sec17 || {};
                    _cachedWeight = ev.data.weight || '';
                    _cachedPatientName = ev.data.patientName || '';
                    if (Object.keys(_cachedSec4Data).length > 0 || _cachedWeight || Object.keys(_cachedSec17Data).length > 0) {
                        resolve(_doFillSection4(formDoc, _cachedSec4Data, _cachedWeight, _cachedSec17Data));
                    } else {
                        QuyenLog.warn('📋 Không có dữ liệu từ phiếu cũ');
                        resolve({ success: false, error: 'Không tìm thấy phiếu cũ' });
                    }
                }
            }
            window.addEventListener('message', onMessage);
            setTimeout(function () {
                if (!resolved) {
                    resolved = true;
                    window.removeEventListener('message', onMessage);
                    QuyenLog.warn('📋 Timeout chờ data phiếu cũ');
                    resolve({ success: false, error: 'Timeout — không tìm thấy phiếu cũ' });
                }
            }, 6000);
        });
    }

    /** Điền Section 4 + Section 17 + cân nặng vào form */
    function _doFillSection4(formDoc, sec4Data, weight, sec17Data) {
        const idToKey = { '1169': 'coQuanBenh1', '1170': 'coQuanBenh2', '1171': 'coQuanBenh3', '1232': 'coQuanBenh4' };
        let filledCount = 0;

        // ═══ Section 4: Cơ quan bệnh ═══
        console.groupCollapsed('__EXT_EMOJI__ 4. Cơ quan bệnh (từ phiếu cũ)');
        for (const ctId in sec4Data) {
            if (!sec4Data.hasOwnProperty(ctId)) continue;
            const value = sec4Data[ctId];
            if (!value) continue;

            const container = formDoc.querySelector('[data-ct-form-id="' + ctId + '"]');
            if (!container) continue;

            const input = container.querySelector('input[type="text"], input:not([type]), textarea');
            if (!input) continue;

            setInputValue(input, value);
            filledCount++;
            QuyenLog.info('  ✅ ' + (idToKey[ctId] || ctId) + ': "' + value + '"');
        }
        if (Object.keys(sec4Data).length === 0) QuyenLog.info('  (không có dữ liệu)');
        console.groupEnd();

        // ═══ Cân nặng + Chiều cao + BMI + ★ SINH HIỆU TỪ PHIỪU CŨ ═══
        console.groupCollapsed('__EXT_EMOJI__ 1. Chỉ số sinh tồn (từ phiếu cũ)');
        if (weight) {
            const weightContainer = formDoc.querySelector('[data-ct-form-id="1248"]');
            if (weightContainer) {
                const weightInput = weightContainer.querySelector('input[type="text"], input:not([type])');
                if (weightInput) {
                    setInputValue(weightInput, weight);
                    filledCount++;
                    QuyenLog.info('  ⚖️ Cân nặng: ' + weight + ' kg');
                }
            }
        }

        const height = _cachedHeight;
        if (height) {
            let heightContainer = formDoc.querySelector('[data-ct-form-id="1317"]');
            if (!heightContainer) heightContainer = formDoc.querySelector('[data-ct-form-id="1251"]');
            if (heightContainer) {
                const heightInput = heightContainer.querySelector('input[type="text"], input:not([type])');
                if (heightInput) {
                    setInputValue(heightInput, height);
                    filledCount++;
                    QuyenLog.info('  📏 Chiều cao: ' + height + ' cm');
                }
            }
        }

        if (weight && height) {
            const w = parseFloat(weight);
            const h = parseFloat(height) / 100;
            if (w > 0 && h > 0) {
                const bmi = (w / (h * h)).toFixed(1);
                const bmiContainer = formDoc.querySelector('[data-ct-form-id="1250"]');
                if (bmiContainer) {
                    const bmiInput = bmiContainer.querySelector('input[type="text"], input:not([type])');
                    if (bmiInput) {
                        setInputValue(bmiInput, bmi);
                        filledCount++;
                        QuyenLog.info('  📊 BMI: ' + bmi + ' (CN=' + weight + ', CC=' + height + ')');
                    }
                }
            }
        }

        // ★ SINH HIỆU TỪ PHIẾU CŨ (dữ liệu thật, không bịa)
        if (_cachedVitalsFromPrev) {
            const VITAL_FIELDS = [
                { key: 'nhipTim', ctFormId: '1243', label: 'Mạch' },
                { key: 'nhietDo', ctFormId: '1244', label: 'Nhiệt độ' },
                { key: 'huyetAp', ctFormId: '1245', label: 'Huyết áp' },
                { key: 'nhipTho', ctFormId: '1246', label: 'Nhịp thở' },
                { key: 'spO2', ctFormId: '1247', label: 'SpO2' }
            ];
            for (let vi = 0; vi < VITAL_FIELDS.length; vi++) {
                const vf = VITAL_FIELDS[vi];
                const vVal = _cachedVitalsFromPrev[vf.key];
                if (!vVal) continue;
                const vContainer = formDoc.querySelector('[data-ct-form-id="' + vf.ctFormId + '"]');
                if (!vContainer) continue;
                const vInput = vContainer.querySelector('input[type="text"], input:not([type])');
                if (!vInput) continue;
                setInputValue(vInput, vVal);
                filledCount++;
                QuyenLog.info('  📋 ' + vf.label + ': ' + vVal + ' (từ phiếu cũ)');
            }
        }
        console.groupEnd();

        // ═══ Section 17: Can thiệp điều dưỡng ═══
        console.groupCollapsed('__EXT_EMOJI__ 17. Can thiệp điều dưỡng (từ phiếu cũ)');
        if (sec17Data && Object.keys(sec17Data).length > 0) {
            QuyenLog.info('🏥 ' + Object.keys(sec17Data).length + ' mục combogrid');
            fillSection17Sequential(formDoc, sec17Data);
        } else {
            QuyenLog.info('  (không có dữ liệu)');
        }
        console.groupEnd();

        if (filledCount > 0) {
            QuyenLog.info('📋 Đã copy ' + filledCount + ' ô từ phiếu cũ! __EXT_EMOJI__');
        }

        return { success: filledCount > 0, filledCount: filledCount, patientName: _cachedPatientName, weight: weight, phieuId: _cachedPhieuId, sec17Count: (sec17Data ? Object.keys(sec17Data).length : 0) };
    }

    /**
     * Điền Section 17 — combogrid fields.
     * Cách 1: Set DULIEU trực tiếp vào ô (không qua dropdown).
     * Gửi message đến his-bridge.js (page context) để dùng jQuery iframe.
     */
    function fillSection17Sequential(formDoc, sec17Data) {
        // Thu thập tasks: {ctId, value} — gửi raw DULIEU
        const tasks = [];
        for (const ctId in sec17Data) {
            if (!sec17Data.hasOwnProperty(ctId)) continue;
            const dulieu = sec17Data[ctId];
            if (!dulieu) continue;
            tasks.push({ ctId: ctId, value: dulieu });
        }

        if (tasks.length === 0) return;

        QuyenLog.info('🏥 Gửi ' + tasks.length + ' Section 17 fields đến Bridge (direct set)...');
        window.postMessage({ type: 'QUYEN_FILL_COMBOGRID', tasks: tasks }, location.origin);
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        fillFromTemplate,
        fillCustomValues,
        isCareSheetFormOpen,
        getFormDocument,
        setInputValue,
        fillSection4FromPrevious,
        // ★ FIX Bug2: Expose cached vitals so caresheet-ui can prefill canNang/chieuCao
        getCachedWeight: function () { return _cachedWeight; },
        getCachedHeight: function () { return _cachedHeight; }
    };
})();

