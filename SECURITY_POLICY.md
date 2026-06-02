# Chính Sách Bảo Mật Nurse

## Phạm Vi

Nurse là tiện ích Chrome hỗ trợ điều dưỡng thao tác trên VNPT HIS. Tiện ích có thể đọc và điền dữ liệu liên quan người bệnh, thuốc, vật tư, sinh hiệu và phiếu chăm sóc trong phiên HIS hiện tại. Nurse không thay thế HIS/EMR chính và không tự lưu hồ sơ cuối cùng.

## Căn Cứ Tuân Thủ

- Luật Khám bệnh, chữa bệnh 2023: thông tin người bệnh và hồ sơ bệnh án phải được giữ bí mật.
- Thông tư 13/2025/TT-BYT: hồ sơ bệnh án điện tử phải tuân thủ pháp luật về dữ liệu, CNTT, ATTT mạng, an ninh mạng, bảo vệ dữ liệu cá nhân và lưu trữ.
- Nghị định 13/2023/NĐ-CP: bảo vệ dữ liệu cá nhân.
- Nghị định 102/2025/NĐ-CP: quản lý, xử lý, khai thác, sử dụng và bảo vệ dữ liệu y tế.
- Luật Dữ liệu 2024, Luật Giao dịch điện tử 2023, Nghị định 85/2016/NĐ-CP, Thông tư 12/2022/TT-BTTTT.
- Thông tư 53/2014/TT-BYT và Quyết định 326/QĐ-BYT ngày 07/02/2024 về bảo đảm ATTT trong y tế.

## Nguyên Tắc Bắt Buộc

- Không gửi PHI ra ngoài bệnh viện, không gửi lên LLM, không telemetry bên thứ ba.
- Không lưu token HIS, API key, tên bệnh nhân, DOB hoặc mã bệnh án thật trong log/audit/export.
- Không duy trì error log thô. Runtime chỉ được lưu bộ đếm sức khỏe tối thiểu (`quyen_runtime_health_v1`) không chứa message, đường dẫn, stack trace, tên bệnh nhân hoặc mã bệnh án.
- Auto-fill chỉ chạy khi Patient Lock xác nhận đúng bệnh nhân và audit ghi thành công.
- Safe Mode phải chặn mọi auto-fill: Truyền dịch, Phiếu chăm sóc, Vật tư.
- Debug Mode ở bản release chỉ bật tạm thời 15 phút, vẫn redact PHI.
- Không tự bấm nút Lưu hồ sơ cuối cùng trên HIS.

## Kiểm Soát Kỹ Thuật

- `HIS.Privacy` redact dữ liệu nhạy cảm dùng chung cho logger và audit; các key log lỗi cũ được migration xóa.
- `HIS.Message` yêu cầu envelope có marker, source, timestamp, requestId và allowlist type.
- `HIS.Audit` ghi audit đã giả danh; nếu không ghi được audit thì auto-fill bị chặn.
- `HIS.Safety` là guard chung cho Safe Mode và audit trước thao tác lâm sàng.
- Vật tư fast path/data injection mặc định tắt bằng `quyen_vattu_fast_path_enabled=false`.
- Release policy cục bộ dùng `quyen_release_policy` để khóa version ngoài allowlist, lưu build hash đã kiểm và khóa bản hết hạn.
- Popup có khóa khẩn cấp cục bộ `quyen_kill_switch`; khi bật, content script tháo UI và không khởi động module tự động.
- Popup và background không gọi Google Fonts, GitHub API hoặc kênh update ngoài bệnh viện.

## Vận Hành Sự Cố

- Khi nghi sai bệnh nhân, sai thuốc, log có PHI hoặc extension chạy sai quyền: bật Safe Mode hoặc tắt extension ngay trong popup, báo IT và điều dưỡng trưởng.
- Nếu cần dừng ngay trên máy: bật **Khóa khẩn cấp** trong popup hoặc gỡ extension khỏi Chrome/Edge.
- IT thu hồi bản lỗi bằng checklist rollback, ghi máy/khoa/user/version/hash/thời điểm.
- Không đưa ảnh màn hình, log hoặc file export có dữ liệu thật lên GitHub, LLM hoặc kênh ngoài bệnh viện.

## Nguồn Đối Chiếu

- Bộ Y tế: hướng dẫn triển khai hồ sơ bệnh án điện tử theo Thông tư 13/2025/TT-BYT.
- Cổng Thông tin điện tử Chính phủ: Nghị định 13/2023/NĐ-CP, Luật Giao dịch điện tử 2023 và các văn bản ATTT liên quan.
- VBPL: Thông tư 53/2014/TT-BYT về điều kiện hoạt động y tế trên môi trường mạng.
