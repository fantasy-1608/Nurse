/**
 * __EXT_EMOJI__ __EXT_NAME__ — Constants & Selectors
 * Centralized configuration for the Nurse Infusion Extension
 */

/* exported QUYEN_CONFIG, getRandomThank, QuyenLog */
const QUYEN_CONFIG = {
    VERSION: '1.3.0',
    DEBUG: false,

    // URL pattern cho trang Buồng Điều Trị (nội trú)
    PAGE_PATTERNS: [
        'BuongDieuTri',
        'NTU02D021',
        'noitru'
    ],

    // Selectors cho form truyền dịch
    SELECTORS: {
        // Dialog form truyền dịch
        INFUSION_DIALOG: '.ui-dialog',
        INFUSION_DIALOG_TITLE: '.ui-dialog-title',

        // Bảng danh sách bệnh nhân
        PATIENT_GRID: '#grdBenhNhan',

        // Bảng y lệnh thuốc trong form truyền dịch
        DRUG_TABLE: 'table.jqTable, table[id*="grd"]',

        // Các trường form truyền dịch (sẽ được xác định chính xác khi test)
        FORM_FIELDS: {
            PATIENT_ID: 'input[name*="BENHNHAN"], input[id*="maBenhNhan"]',
            PATIENT_NAME: 'input[name*="HOTEN"], input[id*="hoTen"]',
            INFUSION_NAME: 'input[id*="tenDich"], input[name*="TENDICH"], select[id*="tenDich"]',
            BATCH_NUMBER: 'input[id*="loSo"], input[name*="LOSO"]',
            QUANTITY_ML: 'input[id*="soLuong"], input[name*="SOLUONG"]',
            SPEED: 'input[id*="tocDo"], input[name*="TOCDO"]',
            SPEED_UNIT_CHECKBOX: 'input[type="checkbox"][id*="mlh"], input[type="checkbox"]',
            START_TIME: 'input[id*="batDau"], input[name*="TGBATDAU"]',
            END_TIME: 'input[id*="ketThuc"], input[name*="TGKETTHUC"]',
            DOCTOR: 'select[id*="bacSi"], select[name*="BACSI"]',
            NURSE: 'select[id*="yTa"], select[name*="YTA"]',
            MIXED_DRUGS: 'input[id*="thuocPha"], textarea[id*="thuocPha"]',
        },

        // Nút bấm
        BUTTONS: {
            SAVE: 'button:contains("Lưu"), input[value*="Lưu"]',
            ADD_NEW: 'button:contains("Đổi"), input[value*="Đổi"]',
        }
    },

    // Từ khóa nhận diện thuốc truyền dịch trong y lệnh
    // (Chính xác theo dropdown "Cách dùng" trong HIS)
    IV_KEYWORDS: [
        'tiêm truyền tĩnh mạch',
        'truyền tĩnh mạch',
        'tiêm truyền'
    ],

    // Lời cảm ơn chị Quyên __EXT_EMOJI__
    THANK_MESSAGES: '__EXT_SUCCESS_MESSAGES__',

    // Toast styles
    TOAST_DURATION: 3000
};

/**
 * Lấy một lời cảm ơn ngẫu nhiên
 */
function getRandomThank() {
    const msgs = QUYEN_CONFIG.THANK_MESSAGES;
    return msgs[Math.floor(Math.random() * msgs.length)];
}

/**
 * Logger
 */
const QuyenLog = {
    info: (...args) => QUYEN_CONFIG.DEBUG && console.log('[__EXT_PREFIX__]', ...args),
    warn: (...args) => console.warn('[__EXT_PREFIX__]', ...args),
    error: (...args) => console.error('[__EXT_PREFIX__]', ...args)
};
