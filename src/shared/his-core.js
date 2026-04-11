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

console.log('[HIS] 🏥 Shared core DOM helpers loaded');
