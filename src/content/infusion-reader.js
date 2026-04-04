/**
 * __EXT_EMOJI__ __EXT_NAME__ — Infusion Reader
 * Đọc y lệnh thuốc truyền dịch từ HIS Bridge API
 * 
 * v1.2: Fix vòng lặp vô hạn — chỉ scan 1 lần, có debounce
 */

/* global QuyenLog */
/* exported QuyenInfusionReader */

const QuyenInfusionReader = (function () {
    let _drugs = [];
    let _ivDrugs = [];
    let _onDrugsReady = null;
    let _hasFoundDrugs = false;  // Flag: đã tìm được thuốc chưa
    let _scanTimer = null;       // Debounce timer
    let _lastScanTime = 0;       // Thời điểm scan cuối

    // ==========================================
    // INIT
    // ==========================================
    function init(onDrugsReady) {
        _onDrugsReady = onDrugsReady;

        // Lắng nghe kết quả từ bridge
        window.addEventListener('message', handleBridgeMessage);

        // Quan sát khi form truyền dịch mở
        observeInfusionDialog();
    }

    // ==========================================
    // OBSERVE — Phát hiện form truyền dịch mở
    // ==========================================
    function observeInfusionDialog() {
        const observer = new MutationObserver(function (mutations) {
            // ĐÃ TÌM THẤY THUỐC → không scan nữa
            if (_hasFoundDrugs) return;

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const el = /** @type {HTMLElement} */ (node);

                    // Bỏ qua nếu là panel/toast của chính mình
                    if (el.id === 'quyen-panel' || el.classList.contains('quyen-toast')) continue;

                    const text = (el.textContent || '').toLowerCase();

                    if (text.includes('truyền dịch') || text.includes('truyen dich') ||
                        (el.id && el.id.toLowerCase().includes('truyendich'))) {
                        QuyenLog.info('🎯 Phát hiện form truyền dịch!');
                        debouncedScan();
                    }
                }
            }
        });

        observer.observe(document.body || document.documentElement, {
            childList: true, subtree: false  // CHỈ quan sát children trực tiếp, không subtree
        });
    }

    // ==========================================
    // DEBOUNCED SCAN — Tránh scan liên tục
    // ==========================================
    function debouncedScan() {
        if (_hasFoundDrugs) return;

        const now = Date.now();
        if (now - _lastScanTime < 2000) return; // Tối thiểu 2s giữa các lần scan

        if (_scanTimer) clearTimeout(_scanTimer);
        _scanTimer = setTimeout(() => {
            _lastScanTime = Date.now();
            requestDrugsFromBridge();
        }, 500);
    }

    // ==========================================
    // RESCAN — Quét lại (do user bấm nút 🔄)
    // ==========================================
    function rescan() {
        _hasFoundDrugs = false; // Reset flag
        _lastScanTime = 0;
        QuyenLog.info('🔄 Quét lại theo yêu cầu...');
        requestDrugsFromBridge();
    }

    // ==========================================
    // BRIDGE REQUEST
    // ==========================================
    function requestDrugsFromBridge() {
        QuyenLog.info('🔍 Đang quét bảng thuốc...');
        window.postMessage({
            type: 'QUYEN_REQ_DRUG_LIST',
            requestId: 'drug_' + Date.now()
        }, window.location.origin);
    }

    // ==========================================
    // HANDLE BRIDGE MESSAGES
    // ==========================================
    function handleBridgeMessage(event) {
        if (!event.data) return;

        if (event.data.type === 'QUYEN_DRUG_LIST_RESULT' || event.data.type === 'QUYEN_IFRAME_DRUGS') {
            const drugs = event.data.drugs || [];
            if (drugs.length > 0) {
                processDrugList(drugs);
            }
        }
    }

    // ==========================================
    // PROCESS RESULTS
    // ==========================================
    function processDrugList(drugs) {
        // Tránh xử lý lại nếu danh sách giống nhau
        if (_hasFoundDrugs && _drugs.length === drugs.length) {
            const sameNames = _drugs.every((d, i) => d.name === drugs[i].name);
            if (sameNames) return; // Không thay đổi → bỏ qua
        }

        _drugs = drugs;
        _ivDrugs = drugs.filter(d => d.isIV);
        _hasFoundDrugs = true; // Đánh dấu: đã tìm được

        QuyenLog.info(`📋 Tổng: ${drugs.length} thuốc, ${_ivDrugs.length} thuốc truyền dịch`);
        drugs.forEach((d, i) => QuyenLog.info(`  ${i + 1}. ${d.name} ${d.isIV ? '💉 IV' : '💊'} — ${d.usage}`));

        if (_onDrugsReady) {
            _onDrugsReady(_drugs, _ivDrugs);
        }
    }

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        getAllDrugs: () => _drugs,
        getIVDrugs: () => _ivDrugs,
        rescan,
        requestDrugsFromBridge
    };
})();
