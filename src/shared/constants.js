/**
 * 🏥 HIS Shared — Constants
 * Hằng số dùng chung cho tất cả Chrome Extension VNPT HIS
 * 
 * Cách dùng: Mỗi extension gọi HIS.init({ name, version, prefix }) để cấu hình
 */

window.HIS = window.HIS || {};

/**
 * Khởi tạo namespace cho extension
 * @param {Object} config
 * @param {string} config.name - Tên extension (VD: 'Aladinn', 'Nurse')
 * @param {string} config.version - Version (VD: '1.0.0')
 * @param {string} config.prefix - Prefix cho CSS/ID (VD: 'aladinn', 'quyen')
 * @param {string} [config.emoji] - Emoji đại diện (VD: '🧞', '__EXT_EMOJI__')
 */
HIS.init = function (config) {
    HIS.APP_NAME = config.name || 'HIS Extension';
    HIS.APP_VERSION = config.version || '1.0.0';
    HIS.APP_PREFIX = config.prefix || 'his';
    HIS.APP_EMOJI = config.emoji || '🏥';
    HIS._initialized = true;
};

// Host patterns cho VNPT HIS
HIS.HOST_PATTERNS = [
    'vncare.vn'
];

// API endpoints
HIS.API = {
    GEMINI_BASE: 'https://generativelanguage.googleapis.com',
};

// Z-Index Scale (tránh z-index wars giữa các extension)
HIS.Z_INDEX = {
    BASE: 9000,
    TOOLTIP: 9100,
    DASHBOARD: 9200,
    MENU: 9300,
    PANEL: 9400,
    TOAST: 9600,
    MODAL: 9700,
    OVERLAY: 9800,
    TOP: 9999
};

// HIS page patterns
HIS.PAGE_PATTERNS = {
    INPATIENT: ['BuongDieuTri', 'NTU02D021', 'noitru'],
    OUTPATIENT: ['KhamBenh', 'ngoaitru', 'PKDK'],
    PRESCRIPTION: ['DonThuoc', 'ToaThuoc'],
    PHARMACY: ['NhaThuoc', 'KhoDuoc']
};

// ★ AUDIT FIX: Centralized timeouts — dễ điều chỉnh theo network condition
HIS.TIMEOUTS = {
    CARESHEET_SEC4: 6000,        // fillSection4FromPrevious wait
    FILL_TRACKER: 30000,         // FillTracker max duration
    CARESHEET_POLL: 5000,        // pollForCareSheetReady max (500ms × 10)
    GRID_HOOK: 30000,            // setupPatientGridHook max wait
    PATIENT_INFO_RETRY: 2000,    // detectPatientInfo retry interval
    PATIENT_INFO_POLL: 15000,    // detectPatientInfo safety poll
    JQUERY_RETRY: 10000,         // jQuery detection timeout
    TOAST_DURATION: 3000,        // Toast auto-dismiss
};

console.log('[HIS] 🏥 Shared constants loaded');
