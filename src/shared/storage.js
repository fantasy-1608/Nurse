/**
 * 🏥 HIS Shared — Storage Wrapper
 * Chrome Storage API wrapper thống nhất, hỗ trợ cả local và sync
 * 
 * Cách dùng:
 *   await HIS.Storage.get('myKey');
 *   await HIS.Storage.set('myKey', value);
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
    }
};

console.log('[HIS] 🏥 Shared storage loaded');
