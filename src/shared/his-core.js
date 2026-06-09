/**
 * 🏥 HIS Shared — Core DOM Helpers
 * Tương tác an toàn với form VNPT HIS: fill input, click, select dropdown
 * 
 * Cách dùng:
 *   HIS.Core.safeFill(inputEl, 'giá trị');
 *   HIS.Core.safeClick(buttonEl);
 *   await HIS.Core.selectDropdown(selectEl, 'giá trị');
 */

window.HIS = window.HIS || {};

HIS.Core = {

    /**
     * Điền giá trị vào input và trigger đúng events cho Angular/jQuery
     * VNPT HIS dùng jQuery/Kendo nên cần trigger đúng events
     * @param {HTMLInputElement|HTMLTextAreaElement} input
     * @param {string} value
     * @returns {boolean} success
     */
    safeFill(input, value) {
        if (!input) {
            if (HIS.Logger) HIS.Logger.warn('Core', 'safeFill: input is null');
            return false;
        }

        try {
            // Focus trước
            input.focus();

            // Set native value (bypass React/Angular setter)
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;

            if (input instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
                nativeTextAreaValueSetter.call(input, value);
            } else if (nativeInputValueSetter) {
                nativeInputValueSetter.call(input, value);
            } else {
                input.value = value;
            }

            // Trigger events cho jQuery/Kendo
            const events = ['input', 'change', 'blur'];
            events.forEach(eventName => {
                input.dispatchEvent(new Event(eventName, { bubbles: true }));
            });

            // Trigger jQuery change nếu jQuery tồn tại
            if (typeof jQuery !== 'undefined') {
                try { jQuery(input).trigger('change'); } catch (e) { console.debug("[HIS] catch:", e.message || e); }
            }

            return true;
        } catch (e) {
            if (HIS.Logger) HIS.Logger.error('Core', 'safeFill error:', e);
            return false;
        }
    },

    /**
     * Click an toàn, có retry nếu element chưa sẵn sàng
     * @param {HTMLElement} element
     * @param {Object} [options]
     * @param {number} [options.delay=100] - Delay trước khi click
     * @returns {Promise<boolean>}
     */
    async safeClick(element, options = {}) {
        if (!element) {
            if (HIS.Logger) HIS.Logger.warn('Core', 'safeClick: element is null');
            return false;
        }

        const delay = options.delay || 100;

        try {
            // Scroll vào view nếu cần
            if (element.scrollIntoView) {
                element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            await HIS.Utils.sleep(delay);

            // Click
            element.click();

            // Trigger jQuery click nếu tồn tại
            if (typeof jQuery !== 'undefined') {
                try { jQuery(element).trigger('click'); } catch (e) { console.debug("[HIS] catch:", e.message || e); }
            }

            return true;
        } catch (e) {
            if (HIS.Logger) HIS.Logger.error('Core', 'safeClick error:', e);
            return false;
        }
    },

    /**
     * Chọn giá trị trong <select> dropdown
     * Hỗ trợ cả native <select> và Kendo DropDownList
     * @param {HTMLSelectElement} selectEl
     * @param {string} value - Giá trị cần chọn (match text hoặc value)
     * @returns {boolean} success
     */
    selectDropdown(selectEl, value) {
        if (!selectEl) return false;

        try {
            const options = Array.from(selectEl.options);

            // Tìm option khớp value hoặc text
            const match = options.find(opt =>
                opt.value === value ||
                opt.textContent.trim().toLowerCase().includes(value.toLowerCase())
            );

            if (match) {
                selectEl.value = match.value;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));

                if (typeof jQuery !== 'undefined') {
                    try { jQuery(selectEl).trigger('change'); } catch (e) { console.debug("[HIS] catch:", e.message || e); }
                }
                return true;
            }

            if (HIS.Logger) HIS.Logger.warn('Core', `selectDropdown: "${value}" not found`);
            return false;
        } catch (e) {
            if (HIS.Logger) HIS.Logger.error('Core', 'selectDropdown error:', e);
            return false;
        }
    },

    /**
     * Chọn checkbox/radio
     * @param {HTMLInputElement} checkbox
     * @param {boolean} checked
     */
    setCheckbox(checkbox, checked = true) {
        if (!checkbox) return false;
        if (checkbox.checked !== checked) {
            checkbox.checked = checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
        }
        return true;
    },

    /**
     * Lấy tên bệnh nhân từ grid hoặc dialog hiện tại
     * @returns {string} Tên bệnh nhân hoặc ''
     */
    getPatientName() {
        // Từ selected row trong grid bệnh nhân
        const selectedRow = document.querySelector(
            '#grdBenhNhan tr.ui-state-highlight, ' +
            '#grdBenhNhan tr[aria-selected="true"], ' +
            '#grdBenhNhan tr.markedRow'
        );

        if (selectedRow) {
            const cells = selectedRow.querySelectorAll('td');
            for (const cell of cells) {
                const t = (cell.textContent || '').trim();
                // Tên BN: viết hoa, dài > 3 ký tự, có dấu cách, không phải số
                if (t.length > 3 && /^[A-ZÀ-Ỹ]/.test(t) && !t.match(/^\d/) && t.includes(' ')) {
                    return t;
                }
            }
        }

        // Từ dialog title
        const dialogs = document.querySelectorAll('.ui-dialog-title, .ui-dialog-titlebar span');
        for (const d of dialogs) {
            const text = d.textContent || '';
            const match = text.match(/\(([^/]+)/);
            if (match) return match[1].trim();
        }

        return '';
    },

    /**
     * Inject page script vào trang (for content script ↔ page script bridge)
     * @param {string} scriptPath - Path relative to extension root
     * @param {string} [id] - ID cho script tag
     * @returns {boolean}
     */
    injectPageScript(scriptPath, id) {
        const scriptId = id || 'his-bridge-' + Date.now();
        if (document.getElementById(scriptId)) return false;

        try {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = chrome.runtime.getURL(scriptPath);
            script.onload = function () {
                if (HIS.Logger) HIS.Logger.info('Core', `Bridge script "${scriptPath}" injected`);
                script.remove();
            };
            (document.head || document.documentElement).appendChild(script);
            return true;
        } catch (e) {
            if (HIS.Logger) HIS.Logger.error('Core', 'injectPageScript error:', e);
            return false;
        }
    },

    /**
     * Parse bảng dữ liệu HIS thành array of objects
     * @param {string} tableSelector - CSS selector cho <table>
     * @returns {Object[]} Mỗi row là 1 object với key = header text
     */
    parseTable(tableSelector) {
        const table = document.querySelector(tableSelector);
        if (!table) return [];

        const headers = [];
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
            headerRow.querySelectorAll('th, td').forEach(cell => {
                headers.push((cell.textContent || '').trim());
            });
        }

        const rows = [];
        const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        bodyRows.forEach(row => {
            const obj = {};
            row.querySelectorAll('td').forEach((cell, i) => {
                const key = headers[i] || `col_${i}`;
                obj[key] = (cell.textContent || '').trim();
                obj[`_el_${i}`] = cell; // Lưu reference đến element
            });
            if (Object.keys(obj).length > 0) {
                obj._row = row;
                rows.push(obj);
            }
        });

        return rows;
    },

    /**
     * Chờ và đóng modal/dialog
     * @param {string} [selector='.ui-dialog']
     * @param {number} [timeout=3000]
     */
    async closeModal(selector = '.ui-dialog', timeout = 3000) {
        try {
            const dialog = await HIS.Utils.waitForElement(selector, timeout);
            const closeBtn = dialog.querySelector('.ui-dialog-titlebar-close, button[title="Close"]');
            if (closeBtn) {
                await this.safeClick(closeBtn);
                return true;
            }
        } catch (e) {
            // No modal found, that's ok
        }
        return false;
    }
};


/* ==========================================
   HIS.DocCache & HIS.PerfCache Implementation (PERF-001)
   ========================================== */

HIS.DocCache = (function() {
    let _docs = [];
    let _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;
        invalidate();
        
        try {
            const observer = new MutationObserver((mutations) => {
                let checkNeeded = false;
                for (let i = 0; i < mutations.length; i++) {
                    const added = mutations[i].addedNodes;
                    for (let j = 0; j < added.length; j++) {
                        const node = added[j];
                        if (node && node.nodeType === 1) {
                            if (node.tagName === 'IFRAME' || (node.querySelectorAll && node.querySelectorAll('iframe').length > 0)) {
                                checkNeeded = true;
                                break;
                            }
                        }
                    }
                    if (checkNeeded) break;
                }
                if (checkNeeded) {
                    invalidate();
                }
            });
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) {}

        // Connect PatientLock.onChange
        try {
            if (typeof HIS !== 'undefined' && HIS.PatientLock && typeof HIS.PatientLock.onChange === 'function') {
                HIS.PatientLock.onChange(function() {
                    invalidate();
                });
            }
        } catch(e) {}

        // Connect QUYEN_FORM_CLOSED message
        try {
            window.addEventListener('message', function(event) {
                if (event && event.data && event.data.type === 'QUYEN_FORM_CLOSED') {
                    invalidate();
                }
            });
        } catch(e) {}
    }

    function invalidate() {
        _docs = [];
        if (typeof HIS !== 'undefined' && HIS.PerfCache && typeof HIS.PerfCache.invalidate === 'function') {
            HIS.PerfCache.invalidate();
        }
    }

    function getAll() {
        if (_docs.length > 0) {
            return _docs;
        }

        const docs = [document];
        try {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const iDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iDoc) {
                        docs.push(iDoc);
                        const subIframes = iDoc.querySelectorAll('iframe');
                        for (let j = 0; j < subIframes.length; j++) {
                            try {
                                const sDoc = subIframes[j].contentDocument || subIframes[j].contentWindow.document;
                                if (sDoc) docs.push(sDoc);
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
        } catch (e) {}
        _docs = docs;
        return docs;
    }

    return {
        init,
        invalidate,
        getAll
    };
})();

HIS.PerfCache = (function() {
    let _cache = {};

    function invalidate() {
        _cache = {};
    }

    function get(key) {
        return _cache[key];
    }

    function set(key, value) {
        _cache[key] = value;
    }

    return {
        invalidate,
        get,
        set
    };
})();

HIS.PerfMetrics = (function() {
    const MAX_ENTRIES = 200;

    function record(actionType, selector, duration, inputContent) {
        let redactedContent = undefined;
        if (inputContent !== undefined && inputContent !== null) {
            if (typeof HIS !== 'undefined' && HIS.Privacy && typeof HIS.Privacy.redact === 'function') {
                redactedContent = HIS.Privacy.redact(inputContent);
            } else {
                redactedContent = String(inputContent).replace(/[A-ZÀ-Ỹa-zà-ỹ0-9]/g, '*');
            }
        }
        
        const entry = {
            timestamp: new Date().toISOString(),
            actionType: actionType,
            selector: selector,
            duration: duration,
            content: redactedContent
        };

        let queue = [];
        try {
            const stored = localStorage['getItem']('quyen_perf_telemetry');
            if (stored) {
                queue = JSON.parse(stored);
            }
        } catch(e) {}

        if (!Array.isArray(queue)) {
            queue = [];
        }

        queue.push(entry);
        while (queue.length > 100) {
            queue.shift();
        }

        try {
            localStorage['setItem']('quyen_perf_telemetry', JSON.stringify(queue));
        } catch(e) {}
    }

    function log(moduleName, step, durationMs, result, fallbackUsed, timeout, staleDropped) {
        let metric = {};
        if (typeof moduleName === 'object' && moduleName !== null) {
            metric = Object.assign({}, moduleName);
        } else {
            metric = {
                module: moduleName,
                step: step,
                durationMs: durationMs,
                result: result,
                fallbackUsed: fallbackUsed,
                timeout: timeout,
                staleDropped: staleDropped
            };
        }

        metric.ts = metric.ts || new Date().toISOString();
        if (!metric.version) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
                    const manifest = chrome.runtime.getManifest();
                    metric.version = manifest ? manifest.version : '1.3.6';
                }
            } catch (e) {}
            metric.version = metric.version || '1.3.6';
        }

        let redactedMetric = metric;
        if (typeof HIS !== 'undefined' && HIS.Privacy && typeof HIS.Privacy.redact === 'function') {
            redactedMetric = HIS.Privacy.redact(metric);
        }

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get('quyen_perf_metrics', function(data) {
                let list = data.quyen_perf_metrics || [];
                if (!Array.isArray(list)) list = [];
                list.push(redactedMetric);
                if (list.length > MAX_ENTRIES) {
                    list = list.slice(list.length - MAX_ENTRIES);
                }
                chrome.storage.local.set({ quyen_perf_metrics: list });
            });
        }
    }

    function getQueue() {
        try {
            const stored = localStorage['getItem']('quyen_perf_telemetry');
            if (stored) {
                return JSON.parse(stored) || [];
            }
        } catch(e) {}
        return [];
    }

    function clear() {
        try {
            localStorage['removeItem']('quyen_perf_telemetry');
        } catch(e) {}
    }

    return {
        record,
        log,
        getQueue,
        clear
    };
})();

// Auto-initialize DocCache
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    HIS.DocCache.init();
} else {
    window.addEventListener('DOMContentLoaded', () => HIS.DocCache.init());
}

console.log('[HIS] 🏥 Shared core DOM helpers loaded');

