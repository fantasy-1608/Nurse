/**
 * 🏥 HIS Shared — Storage Wrapper
 * Chrome Storage API wrapper thống nhất, hỗ trợ cả local và sync
 * 
 * Cách dùng:
 *   await HIS.Storage.get('myKey');
 *   await HIS.Storage.set('myKey', value);
 *   await HIS.Storage.getLocal('dailyStats');
 */

window.HIS = window.HIS || {};

HIS.Storage = {

    /**
     * Get value from chrome.storage.local
     * @param {string|string[]} keys
     * @returns {Promise<Object>}
     */
    get(keys) {
        return new Promise((resolve) => {
            if (!chrome?.storage?.local) {
                resolve({});
                return;
            }
            chrome.storage.local.get(keys, (result) => {
                resolve(result || {});
            });
        });
    },

    /**
     * Set value to chrome.storage.local
     * @param {Object} data - Key-value pairs
     * @returns {Promise<void>}
     */
    set(data) {
        return new Promise((resolve) => {
            if (!chrome?.storage?.local) {
                resolve();
                return;
            }
            chrome.storage.local.set(data, resolve);
        });
    },

    /**
     * Remove keys from chrome.storage.local
     * @param {string|string[]} keys
     * @returns {Promise<void>}
     */
    remove(keys) {
        return new Promise((resolve) => {
            if (!chrome?.storage?.local) {
                resolve();
                return;
            }
            chrome.storage.local.remove(keys, resolve);
        });
    },

    /**
     * Get value with default fallback
     * @param {string} key
     * @param {*} defaultValue
     * @returns {Promise<*>}
     */
    async getWithDefault(key, defaultValue) {
        const result = await this.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
    },

    /**
     * Get/set from localStorage (cho dữ liệu không cần sync)
     */
    getLocal(key) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            return null;
        }
    },

    setLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            if (HIS.Logger) HIS.Logger.warn('Storage', 'localStorage write failed:', e);
        }
    },

    /**
     * Daily counter helper — đếm số lần thực hiện theo ngày
     * @param {string} key
     * @returns {{ count: number, date: string }}
     */
    getDailyCount(key) {
        const today = new Date().toDateString();
        const data = this.getLocal(key);
        if (data && data.date === today) {
            return data;
        }
        return { count: 0, date: today };
    },

    incrementDailyCount(key) {
        const data = this.getDailyCount(key);
        data.count++;
        this.setLocal(key, data);
        return data.count;
    }
};

console.log('[HIS] 🏥 Shared storage loaded');
