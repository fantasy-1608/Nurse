# 💉 Điều Dưỡng Extension v1.3.0

> Trợ lý tự động nhập liệu trên VNPT HIS cho Điều dưỡng viên

Extension chạy trên trình duyệt Chrome/Edge, tự động hóa các thao tác nhập liệu lặp đi lặp lại trên hệ thống **VNPT HIS** — giúp điều dưỡng tiết kiệm thời gian để tập trung chăm sóc bệnh nhân.

---

## 🌟 Tính Năng Chính

### 1. Tự Động Hóa Phiếu Vật Tư (Mới!)

- Bắt tự động sự kiện mở form "Tạo phiếu vật tư".
- **Tự động điền Bác sĩ kê đơn** và **chọn Kho vật tư** (Tủ trực VTYT).
- Auto-đóng popup thông báo phiền phức của HIS.
- Khung UI gọn gàng, Điền 1 chạm thông minh kèm theo gợi ý Cách dùng, chống trùng lặp.
- Liên kết nút "Lưu" để cộng điểm Chỉ vàng.

### 2. Tự Động Lập Phiếu Truyền Dịch

- Trích xuất y lệnh thuốc/dịch truyền từ HIS
- Tự động phân tách và điền: tên thuốc, dung môi, số lượng (ml), tốc độ (giọt/phút), thời gian
- Hỗ trợ số La Mã (C g/p = 100, LX g/p = 60)

### 3. Tự Động Điền Phiếu Chăm Sóc

- **3 chế độ:** Điền đầy đủ, Điền đơn giản, Chọn mục tùy chỉnh
- **Kế thừa phiếu cũ:** Copy sinh hiệu, cơ quan bệnh (Section 4), can thiệp điều dưỡng (Section 17) từ phiếu gần nhất
- **Templates:** Mẫu chuẩn cho các khoa (Cấp cứu, Nhi, Hồi sức...)

### 4. An Toàn Bệnh Nhân (Patient Lock)

- Khóa dữ liệu theo bệnh nhân đang chọn — chống nhầm lẫn cross-patient
- Fuzzy name match + sequence validation — fail-closed khi không xác minh được
- Race condition guard: hủy request cũ khi chuyển bệnh nhân

### 5. Sinh Hiệu Fallback Thông Minh

- Tìm kiếm sinh hiệu qua 6 nguồn: NT.006 → Grid → HSBA → CC → Ngoại trú → Khám bệnh
- Async fetch — không block giao diện khi truy vấn

### 6. Hệ Thống "Chỉ Vàng" (Gamification)

- Tích lũy điểm qua mỗi phiếu vật tư / phiếu chăm sóc hoàn thành
- Hiệu ứng "+1 chỉ vàng ✨" bay lên + Gold Flash giữa màn hình
- Rank system: 🌱 → 🪙 → 🥉 → 🥈 → 🥇 → 💎 → ✨👑✨

### 7. Bảng Điều Khiển (Side Panel)

- Floating panel tích hợp ngay trong cửa sổ HIS
- Real-time status hiển thị tiến trình đang thực hiện
- UI cực kỳ hiện đại, gọn gàng, tối ưu diện tích.

---

## ⚙️ Cài Đặt

### Yêu cầu

- [Node.js](https://nodejs.org/) >= 18
- Chrome hoặc Edge (Chromium-based)

### Build

```bash
# Build bản Điều Dưỡng (triển khai chính)
npm run build:ddt

# Build bản Chị Quyên (🌸)
npm run build:nurse

# Build cả 2 + đóng gói zip
npm run build:all
```

Kết quả nằm trong `dist/DDT` và `dist/Nurse`.

### Cài Extension vào trình duyệt

1. Mở `chrome://extensions/` (hoặc `edge://extensions/`)
2. Bật **Developer mode**
3. Nhấn **Load unpacked** → chọn thư mục `dist/DDT` hoặc `dist/Nurse`
4. Biểu tượng 💉 xuất hiện trên toolbar là thành công

### Triển khai qua Network Share

Extension hỗ trợ auto-update qua thư mục mạng chia sẻ — không cần cài lại thủ công trên từng máy.

---

## 🚀 Hướng Dẫn Sử Dụng

### Bước 1: Chọn bệnh nhân

- Đăng nhập VNPT HIS → vào module Nội trú
- Click chọn bệnh nhân từ danh sách — extension sẽ tự nhận diện và khóa an toàn

### Bước 2A: Phiếu Truyền Dịch

1. Mở form **Thêm phiếu truyền dịch**
2. Bảng điều khiển extension hiện ra → nhấn **"Điền"** bên cạnh tên thuốc
3. Kiểm tra lại → Lưu trên HIS

### Bước 2B: Phiếu Chăm Sóc

1. Mở form **Thêm phiếu chăm sóc**
2. Chọn chế độ: **Đầy đủ** / **Đơn giản** / **Tùy chỉnh**
3. Nhấn **"Điền phiếu"** → extension tự điền tất cả sections
4. (Tuỳ chọn) Nhấn **"Copy phiếu cũ"** để kế thừa Section 4 + 17

### Bước 2C: Phiếu Vật Tư

1. Mở form **Tạo phiếu vật tư** trên màn hình chỉ định.
2. Extension tự động chọn Bác sĩ kê đơn và Kho vật tư.
3. Bảng điều khiển xuất hiện với gợi ý, tìm kiếm nhanh và thiết lập Cách dùng sẵn.
4. Bấm ✚ Điền để đưa vật tư vào phiếu HIS.
5. Bấm ↵ Lưu để hoàn thành và nhận +1 chỉ vàng!

### Bước 3: Xem Lịch Sử

- Click icon 💉 trên toolbar để xem popup
- Kiểm tra Nhật ký thao tác và số Chỉ vàng đã tích lũy

---

## 🏗️ Kiến Trúc

```text
src/
├── manifest.json          # Chrome Extension manifest v3
├── background/            # Service worker
├── content/               # Content scripts (chạy trong trang HIS)
│   ├── content.js         # Orchestrator — khởi tạo các module
│   ├── ui-panel.js        # Floating side panel UI
│   ├── caresheet-ui.js    # Phiếu chăm sóc — UI + detection
│   ├── caresheet-filler.js # Phiếu chăm sóc — auto-fill logic
│   ├── infusion-filler.js # Phiếu truyền dịch — auto-fill logic
│   ├── vattu-ui.js        # Phiếu vật tư - UI + Điền tự động
│   └── constants.js       # Config + selectors
├── injected/
│   └── his-bridge.js      # Bridge script (page context) — truy cập jsonrpc/jQuery
├── shared/                # Modules dùng chung
│   ├── message.js         # Message bus (origin validation + type allowlist)
│   ├── patient-lock.js    # Patient Lock v2 (fuzzy match + seq guard)
│   ├── crypto.js          # PBKDF2 activation lock
│   ├── constants.js       # Global constants + HIS.TIMEOUTS
│   ├── utils.js           # Utilities (escapeHtml, safeHTML, waitForElement)
│   └── fill-tracker.js    # Fill progress tracking
├── popup/                 # Extension popup (audit log + stats)
└── styles/                # CSS
```

### Message Flow

```text
HIS Page (jsonrpc/jQuery)
    ↕ window.postMessage (origin-validated)
his-bridge.js (page context)
    ↕ window.postMessage
content.js (content script)
    ↕ chrome.runtime.sendMessage
background.js (service worker)
```

---

## 🔒 Bảo Mật

- **Origin validation:** Message bus chỉ nhận message từ đúng origin của HIS
- **Type allowlist:** Chỉ xử lý các message types đã đăng ký
- **PBKDF2:** Activation lock dùng 600,000 iterations (OWASP 2025)
- **XSS protection:** `escapeHtml()` + `safeHTML` tagged template cho mọi user input
- **Least privilege:** GitHub permissions là optional, chỉ request khi cần check update

---

## 🛠 Xử Lý Sự Cố

| Vấn đề | Giải pháp |
| ------ | --------- |
| Nút "Điền" không hoạt động | Đảm bảo đã click chọn bệnh nhân trên HIS trước |
| Điền sai ô / chệch dữ liệu | Chờ form HIS tải xong hoàn toàn rồi mới bấm Điền |
| Không copy được phiếu cũ | BN mới nhập viện, chưa có phiếu trước đó |
| Kho VT không được chọn | Do tốc độ tải Form HIS chậm. Thử mở lại lần nữa. |
| Extension không hiện | Kiểm tra `chrome://extensions/` — bật extension và reload trang |
| Lỗi "Bridge not ready" | Reload trang HIS (F5) — bridge cần vài giây để khởi tạo |

---

## 📋 Changelog

Xem chi tiết tại [CHANGELOG.md](CHANGELOG.md).

### v1.3.0 (16/04/2026) — Phiếu Vật Tư Auto & UI Polish

- Thêm hệ thống "Phiếu vật tư": Auto chọn Kho, Điền bác sĩ, loại bỏ các popup HIS phiền nhức nhối.
- Tái cấu trúc lại UI Phiếu Vật Tư thành dạng list cực kỳ khoa học, nhỏ gọn.
- Tìm kiếm linh hoạt qua `Mã VT`, chống trùng mã cực nhạy.
- Thêm hiệu ứng âm thanh/chỉ vàng khi điền xong phiếu VT!
- Fix loạt lỗi linter/CSS cảnh báo từ trình duyệt.
- Tối ưu hóa API fetch sinh hiệu / xử lý grid bất đồng bộ.

### v1.2.0 (10/04/2026) — Feature Release

- Chỉ vàng gamification, Patient Lock v2, Vitals Cascade
- Message bus v1.0, Extension Steps Tracker

### v1.1.0 (08/04/2026)

- Activation lock, Network share deployment, Debug mode

### v1.0.0 (07/04/2026)

- Core infusion + caresheet automation, Floating UI panel

---

## 📦 Release

```bash
# Build + zip + tạo GitHub Release
npm run release
```

Quy trình: `npm version patch` → `git push` → `npm run release`

---

Được phát triển bằng cả trái tim ❤️ bởi Huỳnh Trung Anh.

*Vì một môi trường y tế hiện đại, giảm tải gánh nặng thủ tục hành chính, trọn tâm với người bệnh.*
