# Đánh Giá Tác Động Dữ Liệu Cá Nhân

## Mục Đích Xử Lý

Nurse đọc dữ liệu trong phiên VNPT HIS để hỗ trợ điều dưỡng điền nhanh phiếu truyền dịch, phiếu chăm sóc và phiếu vật tư. Mục đích duy nhất là giảm thao tác nhập liệu trong ca trực, không dùng cho phân tích ngoài bệnh viện, quảng cáo, huấn luyện AI hoặc giám sát cá nhân.

Đánh giá này áp dụng theo nguyên tắc tối thiểu hóa dữ liệu của Nghị định 13/2023/NĐ-CP và yêu cầu quản trị/bảo vệ dữ liệu y tế theo Nghị định 102/2025/NĐ-CP.

## Dữ Liệu Có Thể Được Xử Lý Trong Bộ Nhớ

| Nhóm dữ liệu | Ví dụ | Nơi xử lý | Có lưu lâu dài không |
|---|---|---|---|
| Định danh người bệnh | Tên, DOB/năm sinh, KHAMBENHID, HSBA | Content script và bridge trong tab HIS | Không lưu dạng thật |
| Dữ liệu lâm sàng | Thuốc, sinh hiệu, cân nặng, phiếu chăm sóc | Trong tab HIS hiện tại | Không lưu dạng thật |
| Vật tư | Mã, tên, số lượng, cách dùng | Trong tab HIS hiện tại | Audit chỉ lưu itemRef giả danh |
| Người dùng HIS | Nhóm quyền, bác sĩ/điều dưỡng hiển thị trong HIS | Trong tab HIS hiện tại | Không lưu tên thật |
| Audit kỹ thuật | Module, kết quả, lý do chặn, requestId, version | `chrome.storage.local` | Có, đã giả danh |
| Release policy | Version allowlist, build hash, hạn dùng, kill switch | `chrome.storage.local` | Có, không chứa PHI |

## Lưu Trữ Và Thời Hạn

- Audit lưu trong `chrome.storage.local`, tối đa 1000 bản ghi, tự xoay vòng.
- Error log cũ và audit cũ được xóa một lần khi nâng cấp privacy schema.
- Export audit CSV không chứa tên bệnh nhân, DOB, mã bệnh án thật hoặc tên bác sĩ.

## Quyền Truy Cập

- Người dùng lâm sàng chỉ thao tác trong phiên HIS đã đăng nhập bằng quyền hiện có.
- IT/khoa chỉ xem audit export đã redact khi cần kiểm tra rollout hoặc sự cố.
- Không cấp thêm quyền Chrome ngoài phạm vi hiện có nếu không có đánh giá lại.
- Không gọi dịch vụ update/font/telemetry ngoài bệnh viện trong bản rollout thủ công.

## Rủi Ro Còn Lại

- Cài thủ công có nguy cơ lệch phiên bản nếu không kiểm hash.
- Auto-fill Vật tư vẫn có rủi ro vì thao tác trên UI HIS phức tạp; fast path mặc định tắt và chỉ bật theo khoa sau pilot.
- Extension chạy trong trang HIS nên vẫn phụ thuộc thay đổi DOM/API của VNPT HIS; cần pilot và rollback.

## Biện Pháp Giảm Thiểu

- Patient Lock bắt buộc `requireTarget: true` trước mọi auto-fill.
- Audit fail-closed trước thao tác nguy hiểm.
- Message bus strict envelope và allowlist.
- Safe Mode toàn cục.
- Release checklist bắt buộc ghi version/hash/máy/khoa/người cài.
- Release policy cục bộ khóa version không nằm trong allowlist, version hết hạn hoặc kill switch đang bật.
