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

console.log('[HIS] 🏥 Shared constants loaded');
