# Pilot Checklist — Triển khai thí điểm

## Trước triển khai

- [ ] Cài đặt extension trên máy thí điểm
- [ ] Kiểm hash ZIP với `sha256.txt`, ghi máy/khoa/user/version/hash/người cài
- [ ] Nạp `quyen_release_policy` cục bộ: `allowedVersions` có version đang cài, `buildHash` khớp gói ZIP, `expiresAt` theo kế hoạch pilot nếu có
- [ ] Mở popup và xác nhận release status: “Được phép chạy”
- [ ] Bật thử “Khóa khẩn cấp” và xác nhận UI/module dừng; tắt lại trước khi pilot thật
- [ ] Xác nhận không có request mạng ngoài `*.vncare.vn` khi mở popup và dùng extension
- [ ] Tắt Debug Mode (mặc định)
- [ ] Bật Safe Mode thử nghiệm và xác nhận chặn cả 3 module
- [ ] Xác nhận Vật tư fast path đang tắt nếu chưa có phê duyệt pilot
- [ ] Kiểm tra patient-lock hoạt động (dấu ✓ xanh khi chọn BN)
- [ ] Test fill truyền dịch 1 phiếu → kiểm tra kết quả
- [ ] Test fill phiếu CS (đầy đủ + đơn giản) → kiểm tra kết quả
- [ ] Xác nhận cảnh báo sinh hiệu bất thường hoạt động
- [ ] Mở popup → xác nhận nhật ký ghi nhận fill
- [ ] Export audit CSV và xác nhận không có tên BN/DOB/mã bệnh án thật
- [ ] Lưu audit export thành `audit-export.csv` và chạy `npm run audit:gate`
- [ ] Tạo `pilot-evidence.csv` từ mẫu `src/docs/pilot-evidence-template.csv`, chỉ dùng mã giả danh như `infusion_case_001`
- [ ] Lập kế hoạch đủ 20 ca/module và đủ 10 scenario cho từng module: normal, đổi bệnh nhân, form cũ ẩn, mạng chậm, form không tải, user không phải điều dưỡng, Safe Mode, kill switch, rollback, kiểm request mạng.

## Trong quá trình thí điểm

- [ ] ĐD ghi nhận bất kỳ lỗi nào (sai thuốc, sai BN, v.v.)
- [ ] Kiểm tra audit log hàng ngày (popup → Nhật ký)
- [ ] Ghi nhận mọi lần Safe Mode/Patient Lock chặn thao tác
- [ ] Ghi `pilot-evidence.csv` ngay sau từng ca, không ghi tên BN/DOB/mã khám bệnh/HSBA thật vào `case_ref` hoặc `notes`
- [ ] Xuất CSV cuối tuần để lưu trữ
- [ ] Theo dõi thời gian fill (mục tiêu < 8 giây)

## Sau thí điểm

- [ ] Thu thập feedback ĐD
- [ ] Xuất CSV toàn bộ → lưu hồ sơ sáng kiến
- [ ] Đánh giá: số phiếu fill, thời gian tiết kiệm, lỗi phát sinh
- [ ] Đối chiếu 100% ca mismatch/no-target đã bị chặn
- [ ] Chạy `npm run pilot:gate` với file `pilot-evidence.csv` thật và lưu output vào hồ sơ rollout
- [ ] Lập `rollout-inventory.csv` theo mẫu `src/docs/rollout-inventory-template.csv` nếu quyết định mở rộng
- [ ] Chạy `npm run rollout:gate` trước khi cài thêm máy ngoài khoa pilot
- [ ] Quyết định: mở rộng / chỉnh sửa / dừng

## Thông tin liên hệ

- **Người phát triển**: [Tên]
- **Người hướng dẫn**: [Tên]
- **Khoa thí điểm**: Ngoại TK - Chấn thương CH
