/**
 * 🏥 HIS Shared — Utilities
 * Tiện ích dùng chung: debounce, throttle, waitForElement, escapeHtml, ...
 * 
 * Cách dùng:
 *   await HIS.Utils.waitForElement('#myInput');
 *   const safe = HIS.Utils.escapeHtml(userInput);
 */

window.HIS = window.HIS || {};

HIS.Utils = {

    /**
     * Debounce — chỉ chạy function sau khi ngừng gọi một khoảng delay
     */
    debounce(fn, delay = 300) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * Throttle — giới hạn tần suất gọi function
     */
    throttle(fn, limit = 300) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Chờ element xuất hiện trong DOM (dùng MutationObserver)
     * @param {string} selector - CSS selector
     * @param {number} [timeout=10000] - Timeout ms
     * @param {Document|Element} [root=document] - Root element
     * @returns {Promise<Element>}
     */
    waitForElement(selector, timeout = 10000, root = document) {
        return new Promise((resolve, reject) => {
            const el = root.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = root.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(root.body || root, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`[HIS] Element "${selector}" not found within ${timeout}ms`));
            }, timeout);
        });
    },

    /**
     * Chờ nhiều elements cùng lúc
     * @param {string[]} selectors
     * @param {number} [timeout=10000]
     * @returns {Promise<Element[]>}
     */
    waitForElements(selectors, timeout = 10000) {
        return Promise.all(selectors.map(s => this.waitForElement(s, timeout)));
    },

    /**
     * Escape HTML — chống XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Safe text setter (alias of escapeHtml)
     */
    safeText(text) {
        return this.escapeHtml(text);
    },

    /**
     * ★ AUDIT FIX: Safe innerHTML helper — auto-escape interpolated values
     * Usage: HIS.Utils.safeHTML`<b>${userName}</b> đã chọn`
     */
    safeHTML(strings, ...values) {
        let result = '';
        for (let i = 0; i < strings.length; i++) {
            result += strings[i];
            if (i < values.length) {
                result += HIS.Utils.escapeHtml(String(values[i]));
            }
        }
        return result;
    },

    /**
     * Check trang hiện tại có phải VNPT HIS không
     */
    isHisPage() {
        return HIS.HOST_PATTERNS.some(p => window.location.hostname.includes(p));
    },

    /**
     * Check trang hiện tại khớp pattern nào
     * @param {string[]} patterns - Mảng pattern (VD: HIS.PAGE_PATTERNS.INPATIENT)
     */
    matchesPage(patterns) {
        const url = window.location.href.toLowerCase();
        return patterns.some(p => url.includes(p.toLowerCase()));
    },

    /**
     * Retry async function với exponential backoff
     * @param {Function} fn - Async function
     * @param {number} [maxAttempts=3]
     * @param {number} [initialDelay=1000]
     */
    async retry(fn, maxAttempts = 3, initialDelay = 1000) {
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt === maxAttempts) break;
                const delay = initialDelay * Math.pow(2, attempt - 1);
                if (HIS.Logger) {
                    HIS.Logger.warn('Utils', `Attempt ${attempt} failed, retry in ${delay}ms...`);
                }
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError;
    },

    /**
     * Sleep helper
     * @param {number} ms
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Tạo unique ID
     * @param {string} [prefix='his']
     */
    uniqueId(prefix) {
        const p = prefix || HIS.APP_PREFIX || 'his';
        return `${p}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    }
};

console.log('[HIS] 🏥 Shared utils loaded');
