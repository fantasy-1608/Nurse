/**
 * HIS Shared — Audit Trail v1.0  (Sprint E)
 * Ghi nhật ký hành động fill vào chrome.storage.local.
 * Max 500 entries, auto-rotate.
 *
 * Sử dụng:
 *   HIS.Audit.log('INFUSION_FILL', { drug: 'Paracetamol', patient: 'Nguyễn Văn A' });
 *   HIS.Audit.getToday(callback);
 *   HIS.Audit.exportCSV(callback);
 */

window.HIS = window.HIS || {};

HIS.Audit = (function () {
    'use strict';

    var STORAGE_KEY = 'quyen_audit_log';
    var MAX_ENTRIES = 500;

    // ==========================================
    // LOG — ghi 1 entry
    // ==========================================
    function log(action, detail) {
        var entry = {
            ts: new Date().toISOString(),
            action: action || 'UNKNOWN',
            drug: (detail && detail.drug) || '',
            patient: (detail && detail.patient) || '',
            sections: (detail && detail.sections) || '',
            duration: (detail && detail.duration) || '',
            fillMode: (detail && detail.fillMode) || '',
            result: (detail && detail.result) || 'OK',
            filledCount: (detail && detail.filledCount) || 0
        };

        _getEntries(function (entries) {
            entries.push(entry);

            // Auto-rotate: giữ max entries
            if (entries.length > MAX_ENTRIES) {
                entries = entries.slice(entries.length - MAX_ENTRIES);
            }

            _saveEntries(entries);
        });

        // Console log cho debug
        if (typeof QuyenLog !== 'undefined') {
            QuyenLog.info('📝 Audit: ' + action + ' — ' + (detail && detail.drug || ''));
        }
    }

    // ==========================================
    // GET — đọc entries
    // ==========================================
    function getToday(callback) {
        var today = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
        _getEntries(function (entries) {
            var filtered = entries.filter(function (e) {
                return e.ts && e.ts.substring(0, 10) === today;
            });
            if (callback) callback(filtered);
        });
    }

    function getAll(callback) {
        _getEntries(function (entries) {
            if (callback) callback(entries);
        });
    }

    function getStats(callback) {
        var today = new Date().toISOString().substring(0, 10);
        _getEntries(function (entries) {
            var todayCount = 0;
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].ts && entries[i].ts.substring(0, 10) === today) todayCount++;
            }
            if (callback) callback({
                total: entries.length,
                today: todayCount,
                lastEntry: entries.length > 0 ? entries[entries.length - 1] : null
            });
        });
    }

    // ==========================================
    // EXPORT — xuất CSV
    // ==========================================
    function exportCSV(callback) {
        _getEntries(function (entries) {
            var headers = ['Thời gian', 'Hành động', 'Thuốc/Phiếu', 'Bệnh nhân', 'Mục', 'Thời lượng', 'Chế độ', 'Kết quả', 'Số mục'];
            var rows = [headers.join(',')];

            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                rows.push([
                    _csvEscape(e.ts),
                    _csvEscape(e.action),
                    _csvEscape(e.drug),
                    _csvEscape(e.patient),
                    _csvEscape(e.sections),
                    _csvEscape(e.duration),
                    _csvEscape(e.fillMode),
                    _csvEscape(e.result),
                    e.filledCount || 0
                ].join(','));
            }

            var csv = '\uFEFF' + rows.join('\n'); // BOM for Excel Vietnamese
            if (callback) callback(csv, entries.length);
        });
    }

    // ==========================================
    // CLEAR
    // ==========================================
    function clear(callback) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove(STORAGE_KEY, function () {
                if (callback) callback();
            });
        }
    }

    // ==========================================
    // INTERNAL
    // ==========================================
    function _getEntries(callback) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([STORAGE_KEY], function (result) {
                var entries = result[STORAGE_KEY] || [];
                callback(entries);
            });
        } else {
            // Fallback: localStorage (content script context)
            try {
                var data = localStorage.getItem(STORAGE_KEY);
                callback(data ? JSON.parse(data) : []);
            } catch (e) {
                callback([]);
            }
        }
    }

    function _saveEntries(entries) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            var obj = {};
            obj[STORAGE_KEY] = entries;
            chrome.storage.local.set(obj, function () {
                // ★ BUG-17: Handle quota exceeded — trim oldest 20% and retry
                if (chrome.runtime.lastError) {
                    var trimCount = Math.max(1, Math.floor(entries.length * 0.2));
                    var trimmed = entries.slice(trimCount);
                    if (HIS.Logger) HIS.Logger.warn('Audit', 'Quota exceeded, trimming ' + trimCount + ' oldest entries');
                    var obj2 = {};
                    obj2[STORAGE_KEY] = trimmed;
                    chrome.storage.local.set(obj2);
                }
            });
        } else {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
            } catch (e) {
                // ★ BUG-17: LocalStorage quota exceeded — trim and retry
                try {
                    var trimCount = Math.max(1, Math.floor(entries.length * 0.2));
                    var trimmed = entries.slice(trimCount);
                    if (HIS.Logger) HIS.Logger.warn('Audit', 'LocalStorage quota exceeded, trimming ' + trimCount + ' oldest entries');
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
                } catch (e2) { /* truly out of space */ }
            }
        }
    }

    function _csvEscape(val) {
        if (val === null || val === undefined) return '';
        var str = String(val);
        if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    // ==========================================
    // EXPOSE
    // ==========================================
    return {
        log: log,
        getToday: getToday,
        getAll: getAll,
        getStats: getStats,
        exportCSV: exportCSV,
        clear: clear
    };
})();

console.log('[HIS] 📝 Audit Trail v1.0 loaded');
