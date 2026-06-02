/**
 * HIS Shared — Audit Trail v1.0  (Sprint E)
 * Ghi nhật ký hành động fill vào chrome.storage.local.
 * Max 500 entries, auto-rotate.
 * Không lưu tên BN/DOB/mã thật; mọi detail đi qua HIS.Privacy.
 *
 * Sử dụng:
 *   HIS.Audit.log('INFUSION_FILL', { drug: 'Paracetamol', patient: 'PHI_FIXTURE_DO_NOT_USE_REAL_DATA' });
 *   HIS.Audit.getToday(callback);
 *   HIS.Audit.exportCSV(callback);
 */

window.HIS = window.HIS || {};

HIS.Audit = (function () {
    'use strict';

    var STORAGE_KEY = 'quyen_audit_log';
    var MAX_ENTRIES = 1000;
    var _buildHashCache = '';

    // ==========================================
    // LOG — ghi 1 entry
    // ==========================================
    function log(action, detail) {
        return new Promise(function (resolve, reject) {
            var safeDetail = _sanitizeDetail(detail || {});
            var entry = {
                ts: new Date().toISOString(),
                action: String(action || 'UNKNOWN').substring(0, 80),
                module: safeDetail.module || '',
                patientRef: safeDetail.patientRef || '',
                itemRef: safeDetail.itemRef || '',
                requestId: safeDetail.requestId || '',
                result: safeDetail.result || 'OK',
                reason: safeDetail.reason || '',
                filledCount: safeDetail.filledCount || 0,
                duration: safeDetail.duration || '',
                fillMode: safeDetail.fillMode || '',
                extVersion: _getExtensionVersion(),
                buildHash: safeDetail.buildHash || _buildHashCache || '',
                detail: safeDetail
            };

            _getEntries(function (entries) {
                entries.push(entry);

                if (entries.length > MAX_ENTRIES) {
                    entries = entries.slice(entries.length - MAX_ENTRIES);
                }

                _saveEntries(entries, function (ok, err) {
                    if (!ok) {
                        reject(new Error(err || 'AUDIT_WRITE_FAILED'));
                        return;
                    }
                    if (typeof QuyenLog !== 'undefined') {
                        QuyenLog.info('Audit:', action, entry.result);
                    }
                    resolve(entry);
                });
            }, reject);
        });
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
            var headers = ['Thời gian', 'Hành động', 'Module', 'PatientRef', 'ItemRef', 'RequestId', 'Phiên bản', 'Build hash', 'Thời lượng', 'Chế độ', 'Kết quả', 'Lý do', 'Số mục'];
            var rows = [headers.join(',')];

            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                rows.push([
                    _csvEscape(e.ts),
                    _csvEscape(e.action),
                    _csvEscape(e.module),
                    _csvEscape(e.patientRef),
                    _csvEscape(e.itemRef),
                    _csvEscape(e.requestId),
                    _csvEscape(e.extVersion),
                    _csvEscape(e.buildHash),
                    _csvEscape(e.duration),
                    _csvEscape(e.fillMode),
                    _csvEscape(e.result),
                    _csvEscape(e.reason),
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
    function _getEntries(callback, onError) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([STORAGE_KEY], function (result) {
                if (chrome.runtime && chrome.runtime.lastError) {
                    if (onError) onError(new Error(chrome.runtime.lastError.message));
                    return;
                }
                var entries = result[STORAGE_KEY] || [];
                callback(entries);
            });
        } else {
            if (onError) onError(new Error('AUDIT_STORAGE_UNAVAILABLE'));
        }
    }

    function _saveEntries(entries, callback) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            var obj = {};
            obj[STORAGE_KEY] = entries;
            chrome.storage.local.set(obj, function () {
                if (chrome.runtime.lastError) {
                    var trimCount = Math.max(1, Math.floor(entries.length * 0.2));
                    var trimmed = entries.slice(trimCount);
                    if (HIS.Logger) HIS.Logger.warn('Audit', 'Quota exceeded, trimming ' + trimCount + ' oldest entries');
                    var obj2 = {};
                    obj2[STORAGE_KEY] = trimmed;
                    chrome.storage.local.set(obj2, function () {
                        if (chrome.runtime.lastError) {
                            if (callback) callback(false, chrome.runtime.lastError.message);
                            return;
                        }
                        if (callback) callback(true);
                    });
                    return;
                }
                if (callback) callback(true);
            });
        } else {
            if (callback) callback(false, 'AUDIT_STORAGE_UNAVAILABLE');
        }
    }

    function _sanitizeDetail(detail) {
        if (typeof HIS !== 'undefined' && HIS.Privacy && HIS.Privacy.sanitizeAuditDetail) {
            return HIS.Privacy.sanitizeAuditDetail(detail);
        }
        return {};
    }

    function _getExtensionVersion() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
                return chrome.runtime.getManifest().version || '';
            }
        } catch (e) { /* ignore */ }
        return '';
    }

    function _loadBuildHash() {
        try {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
            chrome.storage.local.get('quyen_release_policy', function (data) {
                var policy = data && data.quyen_release_policy;
                if (policy && policy.buildHash) _buildHashCache = String(policy.buildHash).substring(0, 128);
            });
        } catch (e) { /* extension APIs may be unavailable in tests */ }
    }

    function _csvEscape(val) {
        if (val === null || val === undefined) return '';
        var str = String(val);
        if (str.indexOf(',') >= 0 || str.indexOf('"') >= 0 || str.indexOf('\n') >= 0) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }

    _loadBuildHash();

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
