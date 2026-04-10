/**
 * 🏥 HIS Shared — Selectors Registry
 * CSS Selectors cho các thành phần VNPT HIS
 * Tập trung 1 chỗ để dễ maintain khi HIS thay đổi giao diện
 * 
 * Cách dùng:
 *   const sel = HIS.Selectors.PATIENT_GRID;
 *   document.querySelector(sel);
 */

window.HIS = window.HIS || {};

HIS.Selectors = {

    // ==========================================
    // GRID & TABLE
    // ==========================================
    PATIENT_GRID: '#grdBenhNhan',
    PATIENT_GRID_SELECTED: '#grdBenhNhan tr.ui-state-highlight, #grdBenhNhan tr[aria-selected="true"], #grdBenhNhan tr.markedRow',

    DRUG_TABLE: 'table.jqTable, table[id*="grd"]',

    // ==========================================
    // DIALOG / MODAL
    // ==========================================
    DIALOG: '.ui-dialog',
    DIALOG_TITLE: '.ui-dialog-title',
    DIALOG_TITLEBAR: '.ui-dialog-titlebar',
    DIALOG_CLOSE: '.ui-dialog-titlebar-close',
    DIALOG_CONTENT: '.ui-dialog-content',

    // ==========================================
    // FORM FIELDS (common across modules)
    // ==========================================
    PATIENT_ID: 'input[name*="BENHNHAN"], input[id*="maBenhNhan"]',
    PATIENT_NAME: 'input[name*="HOTEN"], input[id*="hoTen"]',

    // Doctor & Nurse selects
    DOCTOR_SELECT: 'select[id*="bacSi"], select[name*="BACSI"]',
    NURSE_SELECT: 'select[id*="yTa"], select[name*="YTA"]',

    // ==========================================
    // BUTTONS (common)
    // ==========================================
    // ★ v1.2.0 BugFix: Removed :contains() — not valid for querySelector.
    //   Use HIS.Selectors.findByText('button', 'Lưu') for text-based matching.
    SAVE_BTN: 'button[title*="Lưu"], input[value*="Lưu"], button.btn-save',
    ADD_NEW_BTN: 'button[title*="Thêm"], input[value*="Thêm"], button.btn-add',
    CLOSE_BTN: 'button[title*="Đóng"], input[value*="Đóng"], button.btn-close',

    // ==========================================
    // INFUSION-SPECIFIC (Truyền dịch)
    // ==========================================
    INFUSION: {
        DIALOG: '.ui-dialog',
        NAME: 'input[id*="tenDich"], input[name*="TENDICH"], select[id*="tenDich"]',
        BATCH: 'input[id*="loSo"], input[name*="LOSO"]',
        QUANTITY: 'input[id*="soLuong"], input[name*="SOLUONG"]',
        SPEED: 'input[id*="tocDo"], input[name*="TOCDO"]',
        SPEED_UNIT: 'input[type="checkbox"][id*="mlh"], input[type="checkbox"]',
        START_TIME: 'input[id*="batDau"], input[name*="TGBATDAU"]',
        END_TIME: 'input[id*="ketThuc"], input[name*="TGKETTHUC"]',
        MIXED_DRUGS: 'input[id*="thuocPha"], textarea[id*="thuocPha"]',
    },

    // ==========================================
    // CARESHEET-SPECIFIC (Phiếu chăm sóc)
    // ==========================================
    CARESHEET: {
        // Sẽ bổ sung thêm khi dùng
    },

    // ==========================================
    // PRESCRIPTION-SPECIFIC (Đơn thuốc)
    // ==========================================
    PRESCRIPTION: {
        // Sẽ bổ sung thêm khi dùng
    },

    /**
     * Helper: Tìm element từ nhiều selector (fallback chain)
     * @param {string[]} selectors - Mảng selector, thử lần lượt
     * @returns {Element|null}
     */
    findFirst(selectors) {
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    },

    /**
     * Helper: Tìm element bằng text content
     * @param {string} tagName - VD: 'button', 'a', 'span'
     * @param {string} text - Text cần tìm
     * @returns {Element|null}
     */
    findByText(tagName, text) {
        const elements = document.querySelectorAll(tagName);
        for (const el of elements) {
            if ((el.textContent || '').trim().includes(text)) {
                return el;
            }
        }
        return null;
    }
};

console.log('[HIS] 🏥 Shared selectors loaded');
