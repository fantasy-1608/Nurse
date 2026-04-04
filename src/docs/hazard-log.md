# Hazard Log — Extension "Cảm ơn chị Quyên"

| # | Rủi ro | Mức độ | Biện pháp giảm thiểu | Trạng thái |
|---|--------|--------|----------------------|------------|
| H1 | Điền sai bệnh nhân | Cao | Patient-lock verify trước mỗi fill + cảnh báo mismatch | ✅ Sprint B |
| H2 | Sinh hiệu random không thực tế | Cao | Bỏ hoàn toàn random → mặc định trống, cảnh báo ngoài ngưỡng | ✅ Sprint A |
| H3 | Log chứa thông tin PHI | Trung bình | Logger v2 auto-redaction, debug mode tắt mặc định | ✅ Sprint A |
| H4 | Message injection từ bên ngoài | Trung bình | Origin check + type allowlist 24 types + marker `_q` | ✅ Sprint C |
| H5 | Fill chạy quá lâu (stuck) | Thấp | FillTracker timeout 15s + nút Hủy | ✅ Sprint D |
| H6 | Không có audit trail | Trung bình | Module audit.js ghi mọi hành động, xuất CSV | ✅ Sprint E |
| H7 | AJAX patch ảnh hưởng HIS | Thấp | Feature flag `__QUYEN_AJAX_SNOOP`, tắt được | ✅ Sprint C |
| H8 | Mất dữ liệu audit | Thấp | chrome.storage.local, max 500 entries auto-rotate | ✅ Sprint E |

## Nguyên tắc an toàn

1. **Không tự động lưu phiếu** — extension chỉ điền, ĐD tự nhấn Lưu
2. **Không gửi dữ liệu ra ngoài** — mọi thứ chạy local trong browser
3. **Patient-lock bắt buộc** — block fill nếu BN không khớp
4. **Audit đầy đủ** — mọi fill đều được ghi nhật ký
