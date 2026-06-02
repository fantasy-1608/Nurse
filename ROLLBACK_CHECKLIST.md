# Rollback Checklist Nurse

Tài liệu này dùng khi cần dừng, thu hồi hoặc hạ phiên bản extension Nurse/DDT trên máy pilot hoặc máy triển khai toàn bệnh viện.

## 1. Điều Kiện Kích Hoạt Rollback

- Có lỗi P0/P1, nghi ngờ ghi nhầm bệnh nhân, sai thuốc/vật tư/sinh hiệu hoặc sai phiếu.
- Audit không ghi được, audit export có PHI, hoặc `npm run audit:gate` fail trên audit pilot.
- Patient Lock không đọc được target hoặc không chặn mismatch.
- Extension gửi request ngoài `*.vncare.vn` hoặc có log/debug chứa dữ liệu bệnh nhân.
- Hash gói cài trên máy không khớp `dist-zip/sha256.txt`.
- Phiên bản không nằm trong allowlist, hết hạn release policy, hoặc bật sai fast path Vật tư.

## 2. Dừng Khẩn Cấp Tại Máy

1. Mở popup extension.
2. Bật **Khóa khẩn cấp**.
3. Làm mới tab HIS đang mở.
4. Xác nhận UI Nurse/DDT không còn cho thao tác auto-fill.
5. Ghi nhận vào `rollout-inventory.csv`: máy, khoa, user Windows/HIS, thời điểm, người thao tác, lý do.

Nếu popup không mở được:

1. Vào `chrome://extensions` hoặc `edge://extensions`.
2. Tắt extension Nurse/DDT.
3. Làm mới toàn bộ tab HIS.
4. Báo IT trực và khoa đang dùng.

## 3. Thu Hồi Hoặc Hạ Phiên Bản

1. Tắt extension trên máy cần thu hồi.
2. Gỡ bản hiện tại nếu cần thay bằng bản trước.
3. Cài lại đúng ZIP đã được phê duyệt.
4. Đối chiếu SHA-256 với `dist-zip/sha256.txt`.
5. Ghi `quyen_release_policy.buildHash` theo hash gói đã cài.
6. Xác nhận release policy allowed, expiry còn hạn, debug mode tắt, fast path Vật tư tắt nếu chưa được duyệt.
7. Chạy lại ca smoke test theo khoa: mở HIS, chọn bệnh nhân giả lập/pilot, kiểm Safe Mode, kiểm kill switch.

## 4. Bằng Chứng Bắt Buộc Sau Rollback

- Ảnh hoặc biên bản hash gói cài.
- Dòng tương ứng trong `rollout-inventory.csv` có `rollback_tested=true`.
- Audit export sau rollback không có PHI và pass `npm run audit:gate`.
- Nếu rollback do sự cố lâm sàng: ghi sự cố vào hazard log, phân loại severity, owner, mitigation và trạng thái.

## 5. Điều Kiện Mở Lại

Chỉ bật lại extension khi đủ các điều kiện sau:

- Nguyên nhân sự cố đã được xác định và có bản sửa.
- `npm test`, `npm run release:gate`, `npm run audit:gate`, `npm run pilot:gate` pass với bằng chứng thật liên quan.
- GitNexus `detect_changes(scope=all)` đã được xem lại nếu có sửa code.
- Dev, IT và khoa xác nhận bằng văn bản cho máy/khoa bị ảnh hưởng.
