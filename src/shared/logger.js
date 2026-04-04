/**
 * 🏥 HIS Shared — Logger v2.0
 * Unified logging với module prefix, styled console output
 * 
 * ⚠️ SAFETY (Sprint A):
 *   - Production mode (mặc định): auto-redact PHI, mute debug()
 *   - Debug mode: bật qua popup toggle, hiện full log (CHỈ dùng khi test)
 * 
 * Cách dùng:
 *   HIS.Logger.info('Scanner', 'Đã quét xong');
 *   HIS.Logger.error('Filler', 'Lỗi điền form', error);
 *   HIS.Logger.setDebugMode(true);  // Bật debug (qua popup)
 */

window.HIS = window.HIS || {};

HIS.Logger = {
    // ==========================================
    // MODE: 'production' (default) | 'debug'
    // ==========================================
    _mode: 'production',

    setDebugMode(enabled) {
        this._mode = enabled ? 'debug' : 'production';
        console.log(`%c🏥 [HIS] Logger mode: ${this._mode}`, 'color: #f59e0b; font-weight: bold;');
    },

    isDebugMode() {
        return this._mode === 'debug';
    },

    // ==========================================
    // PHI REDACTION — Patterns nhạy cảm
    // ==========================================
    _PHI_PATTERNS: [
        // Tên người Việt (2+ từ viết hoa liên tiếp, ≥ 6 ký tự)
        { regex: /\b[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,5}\b/g, replacement: '[TÊN_REDACTED]' },
        // Mã HSBA / MRN (≥6 chữ số liên tiếp)
        { regex: /\b\d{6,}\b/g, replacement: '[MÃ_REDACTED]' },
        // Ngày sinh (dd/mm/yyyy)
        { regex: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, replacement: '[DOB_REDACTED]' },
    ],

    _redactPHI(args) {
        if (this._mode === 'debug') return args; // Debug mode: không redact

        return args.map(arg => {
            if (typeof arg !== 'string') {
                // Redact JSON-serialized objects
                if (typeof arg === 'object' && arg !== null) {
                    try {
                        let str = JSON.stringify(arg);
                        let changed = false;
                        for (const p of this._PHI_PATTERNS) {
                            const newStr = str.replace(p.regex, p.replacement);
                            if (newStr !== str) { str = newStr; changed = true; }
                        }
                        return changed ? JSON.parse(str) : arg;
                    } catch (e) { return arg; }
                }
                return arg;
            }
            let result = arg;
            for (const p of this._PHI_PATTERNS) {
                result = result.replace(p.regex, p.replacement);
            }
            return result;
        });
    },

    // ==========================================
    // CORE LOGGING
    // ==========================================
    _getPrefix() {
        const emoji = HIS.APP_EMOJI || '🏥';
        const name = HIS.APP_NAME || 'HIS';
        return `${emoji} [${name}]`;
    },

    _style(color) {
        return `color: ${color}; font-weight: bold;`;
    },

    info(module, ...args) {
        const safe = this._redactPHI(args);
        console.log(`%c${this._getPrefix()}[${module}]`, this._style('#3b82f6'), ...safe);
    },

    success(module, ...args) {
        const safe = this._redactPHI(args);
        console.log(`%c${this._getPrefix()}[${module}]`, this._style('#10b981'), ...safe);
    },

    warn(module, ...args) {
        const safe = this._redactPHI(args);
        console.warn(`%c${this._getPrefix()}[${module}]`, this._style('#f59e0b'), ...safe);
    },

    error(module, ...args) {
        // Errors: always log (nhưng vẫn redact PHI)
        const safe = this._redactPHI(args);
        console.error(`%c${this._getPrefix()}[${module}]`, this._style('#ef4444'), ...safe);
    },

    debug(module, ...args) {
        // ⚠️ PRODUCTION: mute debug hoàn toàn
        if (this._mode !== 'debug') return;
        console.debug(`%c${this._getPrefix()}[${module}]`, this._style('#8b5cf6'), ...args);
    },

    group(module, label) {
        if (this._mode !== 'debug') return;
        console.groupCollapsed(`${this._getPrefix()}[${module}] ${label}`);
    },

    groupEnd() {
        if (this._mode !== 'debug') return;
        console.groupEnd();
    },

    time(label) {
        console.time(`${this._getPrefix()} ${label}`);
    },

    timeEnd(label) {
        console.timeEnd(`${this._getPrefix()} ${label}`);
    }
};

// Listen for debug mode toggle from popup (via storage)
try {
    const _chrome = /** @type {any} */ (window).chrome;
    if (_chrome && _chrome.storage && _chrome.storage.onChanged) {
        _chrome.storage.onChanged.addListener(function (changes) {
            if (changes.debugMode) {
                HIS.Logger.setDebugMode(changes.debugMode.newValue === true);
            }
        });
        // Load initial state
        _chrome.storage.local.get('debugMode', function (data) {
            if (data && data.debugMode === true) {
                HIS.Logger.setDebugMode(true);
            }
        });
    }
} catch (e) { /* Not in extension context */ }

console.log('[HIS] 🏥 Shared logger v2.0 loaded (mode: production)');
