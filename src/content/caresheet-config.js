/**
 * __EXT_EMOJI__ __EXT_NAME__ — Care Sheet Config
 * Định nghĩa field mapping cho phiếu chăm sóc
 * 
 * Sections: 1-3 (sinh tồn, toàn thân, hô hấp)
 *           5 (tuần hoàn), 6 (tiêu hóa), 7 (dinh dưỡng)
 *           10 (giấc ngủ), 11 (vệ sinh), 12 (tinh thần)
 *           13 (vận động), 14 (bài tiết), 15 (GDSK), 16 (theo dõi khác)
 */

/* exported CARESHEET_CONFIG */

const CARESHEET_CONFIG = {

    // ==========================================
    // DEFAULT EMPTY VALUES — Mẫu trống cho phiếu chăm sóc
    // ⚠️ SAFETY: Sinh hiệu (mạch, HA, nhịp thở, SpO2, nhiệt độ) PHẢI ĐỂ TRỐNG.
    //    Chỉ điền từ nguồn thật (vitals bridge) hoặc ĐD nhập tay.
    //    Các mục phi sinh tồn (vệ sinh, tinh thần...) có giá trị mặc định hợp lý.
    // ==========================================
    getDefaultEmptyValues: function () {
        return {
            // Thông tin chung
            ketQua: '', phanCapCS: '', nhanDinh: '',
            // 1. Chỉ số sinh tồn — ĐỂ TRỐNG (bắt buộc nhập tay hoặc lấy từ vitals thật)
            nhipTim: '',
            nhietDo: '',
            huyetAp: '',
            nhipTho: '',
            spO2: '',
            canNang: '', dau: '0', bmi: '',
            // 2. Toàn thân
            daNiemMac: ['Hồng'], daNiemMacKhac: '',
            triGiac: ['Tỉnh'], triGiacKhac: '', glassgow: '15',
            // 3. Hô hấp
            khoTho: ['(-)'],
            thoOxy1: '', thoOxy2: '',
            ho: [], hoKhac: '',
            // 5. Tuần hoàn
            tinhChatMach: ['Mạch đều'], tinhChatMachKhac: '',
            // 6. Tiêu hóa
            tieuHoaBT: ['BT'],
            an: ['Ăn được'],
            non: [],
            bung: ['Mềm'],
            dauBung: [],
            phanUngThanhBung: ['(-)'],
            vetMo: ['Khô'],
            sondeDaDay: '',
            dlVetMo: '',
            // 7. Dinh dưỡng
            duongNuoiDuong: ['Miệng'],
            cheDoAn: 'Cơm', luongAn: '',
            // 10. Giấc ngủ
            ngu: ['BT'],
            cdNghiNgoi: ['BT'],
            // 11. Vệ sinh
            vsMatMuiMieng: ['Sạch'],
            vsRangMieng: ['Sạch'],
            vsToanThan: ['Sạch'],
            thayDoVai: ['(+)'],
            // 12. Tinh thần
            tinhThan: ['BT'],
            // 13. Vận động
            vanDong: ['Hạn chế'],
            hoTroVanDong: [],
            // 14. Bài tiết
            tieuTien: ['BT'],
            tinhChatTieuTien: [],
            mauSacNuocTieu: [],
            luongNuocTieu: '',
            daiTien: ['BT'],
            tinhChatPhan: ['BT'],
            soLanDaiTien: '', soLuongDaiTien: '',
            trungTien: ['BT'],
            // 15. GDSK
            gdsk: ['+'],
            // 16. Theo dõi khác
            vetThuongVetLoet1: '', vetThuongVetLoet2: '',
            diemBraden: ['NC thấp'],
            diemMorse: ['Thấp'],
            diemHumptyDumpty: [],
            canhBaoSom: [],
            mucDoDau: ['2'],
            phu: ['0: không phù'],
            viemTinhMach: ['0 - Không']
        };
    },

    // ==========================================
    // FIELD DEFINITIONS
    // ==========================================
    SECTIONS: [
        // ===== THÔNG TIN CHUNG =====
        {
            id: 'header',
            title: 'Thông tin chung',
            fields: [
                { key: 'ketQua', ctFormId: '1316', type: 'text', label: 'Kết quả' },
                { key: 'phanCapCS', ctFormId: '1240', type: 'text', label: 'Phân cấp chăm sóc' },
                { key: 'nhanDinh', ctFormId: '1241', type: 'text', label: 'Nhận định, theo dõi' }
            ]
        },
        // ===== 1. CHỈ SỐ SINH TỒN =====
        {
            id: 'vitalSigns',
            title: '1. Chỉ số sinh tồn, sinh trắc',
            fields: [
                { key: 'nhipTim', ctFormId: '1243', type: 'text', label: 'Nhịp tim/mạch' },
                { key: 'nhietDo', ctFormId: '1244', type: 'text', label: 'Nhiệt độ (°C)' },
                { key: 'huyetAp', ctFormId: '1245', type: 'text', label: 'Huyết áp (mmHg)' },
                { key: 'nhipTho', ctFormId: '1246', type: 'text', label: 'Nhịp thở' },
                { key: 'spO2', ctFormId: '1247', type: 'text', label: 'SpO2 (%)' },
                { key: 'canNang', ctFormId: '1248', type: 'text', label: 'Cân nặng (kg)' },
                { key: 'dau', ctFormId: '1249', type: 'text', label: 'Đau (điểm)' },
                { key: 'bmi', ctFormId: '1250', type: 'text', label: 'BMI' }
            ]
        },
        // ===== 2. TOÀN THÂN =====
        {
            id: 'general',
            title: '2. Toàn thân',
            fields: [
                {
                    key: 'daNiemMac', ctFormId: '1252', type: 'checkbox', label: 'Da, niêm mạc',
                    options: ['Hồng', 'Tái nhợt', 'Vân tím', 'Vàng', 'Khác']
                },
                { key: 'daNiemMacKhac', ctFormId: '1253', type: 'text', label: 'Da, niêm mạc (Khác)' },
                {
                    key: 'triGiac', ctFormId: '1254', type: 'checkbox', label: 'Tri giác',
                    options: ['Tỉnh', 'Lơ mơ', 'Kích thích', 'Hôn mê', 'Tỉnh chậm', 'Li bì', 'Quấy khóc', 'Tăng TLC', 'Giảm TLC', 'Khác']
                },
                { key: 'triGiacKhac', ctFormId: '1255', type: 'text', label: 'Tri giác (Khác)' },
                { key: 'glassgow', ctFormId: '1256', type: 'text', label: 'Glassgow (điểm)' }
            ]
        },
        // ===== 3. HÔ HẤP =====
        {
            id: 'respiratory',
            title: '3. Hô hấp',
            fields: [
                {
                    key: 'khoTho', ctFormId: '1258', type: 'checkbox', label: 'Khó thở',
                    options: ['(+)', '(-)']
                },
                {
                    key: 'thoOxy', ctFormId: '1260', type: 'split', label: 'Thở oxy',
                    subLabels: ['C1 canula (l/p)', 'M Mask (l/p)'],
                    splitKeys: ['thoOxy1', 'thoOxy2']
                },
                {
                    key: 'ho', ctFormId: '1261', type: 'checkbox', label: 'Ho',
                    options: ['Ho khan', 'Ho đờm', 'Khò khè', 'Thở NCPAP', 'Khác']
                },
                { key: 'hoKhac', ctFormId: '1262', type: 'text', label: 'Ho (Khác)' }
            ]
        },
        // ===== 4. CƠ QUAN BỆNH =====
        {
            id: 'organDisease',
            title: '4. Cơ quan bệnh',
            fields: [
                { key: 'coQuanBenh1', ctFormId: '1169', type: 'text', label: 'Cơ quan bệnh (1)' },
                { key: 'coQuanBenh2', ctFormId: '1170', type: 'text', label: 'Cơ quan bệnh (2)' },
                { key: 'coQuanBenh3', ctFormId: '1171', type: 'text', label: 'Cơ quan bệnh (3)' },
                { key: 'coQuanBenh4', ctFormId: '1232', type: 'text', label: 'Cơ quan bệnh (4)' }
            ]
        },
        // ===== 5. TUẦN HOÀN =====
        {
            id: 'circulation',
            title: '5. Tuần hoàn',
            fields: [
                {
                    key: 'tinhChatMach', ctFormId: '1295', type: 'checkbox', label: 'Tính chất mạch',
                    options: ['Mạch đều', 'Mạch nhanh nhỏ', 'Mạch rời rạc', 'RL nhịp']
                },
                { key: 'tinhChatMachKhac', ctFormId: '1296', type: 'text', label: 'Tuần hoàn (Khác)' }
            ]
        },
        // ===== 6. TIÊU HÓA =====
        {
            id: 'digestive',
            title: '6. Tiêu hóa',
            fields: [
                {
                    key: 'tieuHoaBT', ctFormId: '1268', type: 'checkbox', label: 'Tiêu hóa',
                    options: ['BT']
                },
                {
                    key: 'an', ctFormId: '1223', type: 'checkbox', label: 'Ăn',
                    options: ['Ăn được', 'Nhịn ăn', 'Ăn tiêu', 'Ăn chậm tiêu', 'Ăn không tiêu']
                },
                {
                    key: 'non', ctFormId: '1236', type: 'checkbox', label: 'Nôn',
                    options: ['Nôn khan', 'Nôn thức ăn', 'Buồn Nôn', 'Nôn máu']
                },
                {
                    key: 'bung', ctFormId: '1160', type: 'checkbox', label: 'Bụng',
                    options: ['Mềm', 'Chướng vừa', 'Chướng căng', 'Cứng']
                },
                {
                    key: 'dauBung', ctFormId: '1161', type: 'checkbox', label: 'Đau bụng',
                    options: ['Bụng dưới', 'Hố chậu P', 'Hố chậu T', 'Quanh rốn', 'Hạ sườn P', 'Hạ sườn T', 'Đau thượng vị']
                },
                {
                    key: 'phanUngThanhBung', ctFormId: '1162', type: 'checkbox', label: 'Phản ứng thành bụng',
                    options: ['(+)', '(-)']
                },
                {
                    key: 'vetMo', ctFormId: '1163', type: 'checkbox', label: 'Vết mổ',
                    options: ['Đau', 'Không có máu/dịch thấm băng', 'Khô', 'Khô, liền mép', 'Sưng nề, đỏ', 'Rỉ dịch vàng, hôi', 'Hóa mủ/giả mạc']
                },
                { key: 'sondeDaDay', ctFormId: '1164', type: 'text', label: 'Sonde dạ dày (ml)' },
                { key: 'dlVetMo', ctFormId: '1167', type: 'text', label: 'DL Vết mổ (ml)' }
            ]
        },
        // ===== 7. DINH DƯỠNG =====
        {
            id: 'nutrition',
            title: '7. Dinh dưỡng',
            fields: [
                {
                    key: 'duongNuoiDuong', ctFormId: '1193', type: 'checkbox', label: 'Đường nuôi dưỡng',
                    options: ['Miệng', 'Sonde DD', 'Tĩnh mạch']
                },
                { key: 'cheDoAn', ctFormId: '1194', type: 'text', label: 'Chế độ ăn' },
                { key: 'luongAn', ctFormId: '1195', type: 'text', label: 'Lượng ăn' }
            ]
        },
        // ===== 10. GIẤC NGỦ =====
        {
            id: 'sleep',
            title: '10. Giấc ngủ, nghỉ ngơi',
            fields: [
                {
                    key: 'ngu', ctFormId: '1151', type: 'checkbox', label: 'Ngủ',
                    options: ['BT', 'Khó ngủ', 'Mất ngủ', 'Ngủ li bì theo an thần', 'Ngủ lơ mơ', 'Giật mình khi ngủ']
                },
                {
                    key: 'cdNghiNgoi', ctFormId: '1154', type: 'checkbox', label: 'CĐ nghỉ ngơi',
                    options: ['BT', 'Tại giường', 'Tại Phòng']
                }
            ]
        },
        // ===== 11. VỆ SINH =====
        {
            id: 'hygiene',
            title: '11. Vệ sinh cá nhân',
            fields: [
                {
                    key: 'vsMatMuiMieng', ctFormId: '1156', type: 'checkbox', label: 'VS mắt, mũi, miệng',
                    options: ['Sạch', 'Bẩn']
                },
                {
                    key: 'vsRangMieng', ctFormId: '1157', type: 'checkbox', label: 'VS Răng miệng',
                    options: ['Sạch', 'Bẩn']
                },
                {
                    key: 'vsToanThan', ctFormId: '1152', type: 'checkbox', label: 'VS toàn thân',
                    options: ['Sạch', 'Bẩn']
                },
                {
                    key: 'thayDoVai', ctFormId: '1153', type: 'checkbox', label: 'Thay đồ vải',
                    options: ['(+)', '(-)']
                }
            ]
        },
        // ===== 12. TINH THẦN =====
        {
            id: 'mental',
            title: '12. Tinh thần',
            fields: [
                {
                    key: 'tinhThan', ctFormId: '1159', type: 'checkbox', label: 'Tinh thần',
                    options: ['BT', 'Lo lắng', 'Hoảng loạn']
                }
            ]
        },
        // ===== 13. VẬN ĐỘNG =====
        {
            id: 'mobility',
            title: '13. Vận động/PHCN',
            fields: [
                {
                    key: 'vanDong', ctFormId: '1137', type: 'checkbox', label: 'Vận động',
                    options: ['BT', 'Không VĐ', 'Hạn chế', 'Liệt']
                },
                {
                    key: 'hoTroVanDong', ctFormId: '1138', type: 'checkbox', label: 'Hỗ trợ vận động',
                    options: ['(+)', '(-)']
                }
            ]
        },
        // ===== 14. BÀI TIẾT =====
        {
            id: 'excretion',
            title: '14. Bài tiết',
            fields: [
                {
                    key: 'tieuTien', ctFormId: '1140', type: 'checkbox', label: 'Tiểu tiện',
                    options: ['BT', 'Tiểu sonde NĐ – BQ', 'Không tự chủ']
                },
                {
                    key: 'tinhChatTieuTien', ctFormId: '1141', type: 'checkbox', label: 'TC tiểu tiện',
                    options: ['Bí tiểu', 'Tiểu buốt', 'Tiểu rắt']
                },
                {
                    key: 'mauSacNuocTieu', ctFormId: '1143', type: 'checkbox', label: 'Màu sắc NT',
                    options: ['Trong', 'Đỏ', 'Vàng', 'Đục']
                },
                { key: 'luongNuocTieu', ctFormId: '1144', type: 'text', label: 'Lượng NT (ml)' },
                {
                    key: 'daiTien', ctFormId: '1124', type: 'checkbox', label: 'Đại tiện',
                    options: ['BT', 'Táo bón', 'Tiêu chảy', 'Không tự chủ']
                },
                {
                    key: 'tinhChatPhan', ctFormId: '1125', type: 'checkbox', label: 'Tính chất phân',
                    options: ['BT', 'Lỏng', 'Tóe nước', 'Máu/bã trầu', 'Hoa cà, hoa cải', 'Vàng', 'Cứng', 'P. đen', 'P. su']
                },
                { key: 'soLanDaiTien', ctFormId: '1126', type: 'text', label: 'Số lần (lần)' },
                { key: 'soLuongDaiTien', ctFormId: '1127', type: 'text', label: 'Số lượng (gr)' },
                {
                    key: 'trungTien', ctFormId: '1128', type: 'checkbox', label: 'Trung tiện',
                    options: ['BT', 'Chưa', 'Đã', 'Bí']
                }
            ]
        },
        // ===== 15. GDSK =====
        {
            id: 'healthEducation',
            title: '15. Nhu cầu TV GDSK',
            fields: [
                {
                    key: 'gdsk', ctFormId: '1130', type: 'checkbox', label: 'GDSK',
                    options: ['+', '-']
                }
            ]
        },
        // ===== 16. THEO DÕI KHÁC =====
        {
            id: 'monitoring',
            title: '16. Theo dõi khác',
            fields: [
                {
                    key: 'vetThuongVetLoet', ctFormId: '1133', type: 'split', label: 'Vết thương/loét',
                    subLabels: ['Độ', 'Vị trí'],
                    splitKeys: ['vetThuongVetLoet1', 'vetThuongVetLoet2']
                },
                {
                    key: 'diemBraden', ctFormId: '1134', type: 'checkbox', label: 'Điểm Braden',
                    options: ['NC cao', 'NC thấp', 'NC trung bình']
                },
                {
                    key: 'diemMorse', ctFormId: '1135', type: 'checkbox', label: 'Điểm Morse',
                    options: ['Thấp', 'Trung bình', 'Cao']
                },
                {
                    key: 'diemHumptyDumpty', ctFormId: '1136', type: 'checkbox', label: 'Điểm Humpty Dumpty',
                    options: ['Thấp', 'Cao']
                },
                {
                    key: 'canhBaoSom', ctFormId: '1237', type: 'checkbox', label: 'Cảnh báo sớm',
                    options: ['0 - TD 12h', '1 - TD mỗi 4-6h', '2 - TD mỗi 1- 3h', '3 – TD liên tục']
                },
                {
                    key: 'mucDoDau', ctFormId: '1227', type: 'checkbox', label: 'Mức độ đau (VAS)',
                    options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
                },
                {
                    key: 'phu', ctFormId: '1235', type: 'checkbox', label: 'Phù',
                    options: ['0: không phù', 'Độ 1', 'Độ 2', 'Độ 3', 'Độ 4']
                },
                {
                    key: 'viemTinhMach', ctFormId: '1224', type: 'checkbox', label: 'Viêm TM (VIP)',
                    options: ['0 - Không', '1 - Theo dõi', '2 - Giai đoạn sớm', '3 - Giai đoạn trung bình', '4 - Giai đoạn tiến triển', '5 - Giai đoạn huyết khối']
                }
            ]
        }
    ]
};

// ⚠️ SAFETY: randomBloodPressure() đã bị XÓA.
// Sinh hiệu phải lấy từ nguồn thật (vitals bridge) hoặc ĐD nhập tay.
// Ref: Sprint A — P0 fix "Sinh dữ liệu lâm sàng giả"
