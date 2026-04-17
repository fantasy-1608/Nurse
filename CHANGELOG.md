# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-04-17

### Added

- **Data Injection (Bypass DOM)**: Kỹ thuật tiêm thẳng vật tư vào biến nội bộ của HIS, giảm thời gian điền xuống 0.3s/vật tư, loại bỏ độ trễ do phụ thuộc mạng drop-down.
- **Universal Storage Selection**: Tự động chộp chính xác Tủ trực vật tư linh hoạt bằng từ khóa `Tủ trực VTYT`, loại bỏ rủi ro lệch ID khi chia sẻ đa khoa.
- **Data Injection Fallback**: Hệ thống tự động kích hoạt 'phao cứu sinh', chuyển về quy trình gõ phím cũ nếu tiêm thất bại (do HIS cập nhật cấu trúc).

### Fixed

- **Linter**: Đã xoá các biến không dùng `fillBtn`, `enterBtn` trong `vattu-ui.js` để code clean.

## [1.3.0] - 2026-04-16

### Added

- **Tự Động Hóa Phiếu Vật Tư (Mới!)**: Bắt tự động sự kiện mở form "Tạo phiếu vật tư". Thay thế hoàn toàn thao tác thủ công.
- **Auto Kho & Doctor**: Tự động điền Bác sĩ kê đơn và chọn Kho vật tư (Tủ trực VTYT).
- **Gamification**: Tích lũy điểm Chỉ Vàng cho module Vật Tư.
- **Deduplication**: Xử lý logic chống lặp lại vật tư trên danh sách.

### Fixed

- **Performance**: Sửa lỗi DOM reflow và popup phiền phức từ HIS khi chọn kho.
- **CSS**: Làm gọn toàn bộ các element của Phiếu Vật Tư, sạch sẽ linter.

## [1.2.1] - 2026-04-11

### Fixed (Audit Remediation)

- **Performance:** Đổi `all_frames: false` — giảm ~90% memory footprint (17 scripts × N iframes → 1 lần)
- **Performance:** MutationObserver thu nhỏ scope — bỏ `characterData`, chỉ react trên IFRAME/DIV/DIALOG
- **Performance:** NT.006 chuyển từ sync XHR → async — không còn block UI khi chọn bệnh nhân
- **Performance:** Thêm `visibilitychange` handler — pause intervals/observers khi tab ẩn
- **Security:** GitHub permissions chuyển sang `optional_host_permissions` (principle of least privilege)
- **Security:** PBKDF2 iterations tăng từ 100,000 → 600,000 (OWASP 2025)
- **Security:** Message bus listener errors được log thay vì nuốt im
- **Reliability:** 72 empty catch blocks → tất cả đều log lỗi qua `console.debug`
- **Reliability:** Global error boundary (`window.onerror` + `unhandledrejection`) trong content.js
- **Reliability:** Bridge protocol version (`bridgeVersion: '1.2.1'`) trong `QUYEN_BRIDGE_READY`
- **DX:** Centralized timeout config (`HIS.TIMEOUTS`)
- **DX:** ESLint `no-var` và `prefer-const` bật lại thành `warn`

## [1.2.0] - 2026-04-10

### Added (v1.2.0)

- **Gamification:** Hệ thống "Chỉ vàng" với animation + central screen flash
- **UI:** "Phiếu đã lập" badge hiển thị số phiếu chăm sóc đã lập hôm nay
- **UI:** Extension Steps Tracker — real-time feedback cho background operations
- **Safety:** Patient Lock v2 — fuzzy name match + fail-closed verification
- **Vitals:** Multi-source fallback cascade (NT.006 → HSBA → CC → Ngoại trú → Khám bệnh)
- **Security:** Message bus v1.0 — origin validation + type allowlist + envelope marker

### Fixed (v1.2.0)

- Race conditions trong async data fetching (sequence validation)
- Cross-patient data contamination (Section 4 empty by default)
- Duplicate bridge injection guard
- Memory leaks: MutationObserver + FillTracker cleanup

## [1.1.0] - 2026-04-08

### Added (v1.1.0)

- Activation lock (SHA-256 hash-based)
- Network-share deployment model
- Debug mode toggle

### Fixed (v1.1.0)

- IV speed regex (Roman numeral support: C g/p, LX g/p)
- FillTracker listener leak (unsubscribe function)

## [1.0.0] - 2026-04-07

### Added (v1.0.0)

- Core infusion automation
- Care sheet template filling
- Floating UI panel
- Auto-update notification (GitHub Releases)
