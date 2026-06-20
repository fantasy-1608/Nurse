# Chrome Web Store Listing — Điều Dưỡng VNPT HIS

> Last Updated: 2026-06-20

## Store Listing

**Extension Name**  
Điều Dưỡng VNPT HIS

**Short Description**  
Hỗ trợ điều dưỡng đọc y lệnh và điền biểu mẫu nội trú trên VNPT HIS, có kiểm tra bệnh nhân trước khi ghi.

**Detailed Description**

Điều Dưỡng VNPT HIS hỗ trợ nhân viên điều dưỡng nhập dữ liệu vào các biểu mẫu nội trú trên hệ thống VNPT HIS.

TÍNH NĂNG
• Đọc danh sách thuốc và thuốc truyền từ hồ sơ đang mở trên HIS.
• Hỗ trợ điền phiếu truyền dịch, phiếu chăm sóc và vật tư.
• Đối chiếu ngữ cảnh bệnh nhân trước và sau thao tác điền.
• Yêu cầu người dùng kiểm tra lại dữ liệu trên HIS trước khi lưu.
• Lưu nhật ký kỹ thuật đã giả danh hóa trên thiết bị để phục vụ kiểm tra và xử lý sự cố.

CÁCH SỬ DỤNG
1. Đăng nhập VNPT HIS bằng tài khoản điều dưỡng được cấp quyền.
2. Mở màn hình buồng điều trị và chọn đúng bệnh nhân.
3. Mở bảng Điều Dưỡng, chọn chức năng cần hỗ trợ.
4. Kiểm tra bệnh nhân và toàn bộ dữ liệu đã điền trước khi lưu trên HIS.

QUYỀN RIÊNG TƯ
Tiện ích chỉ hoạt động trên tên miền `vncare.vn`. Dữ liệu lâm sàng được xử lý trong trình duyệt để thực hiện chức năng do người dùng yêu cầu; tiện ích không gửi dữ liệu cho nhà phát triển, không dùng quảng cáo và không dùng phân tích bên thứ ba.

Phiên bản 1.3.9 — loại bỏ mọi lớp trạng thái phủ toàn màn hình, giữ nguyên các kiểm tra an toàn ghi dữ liệu và giảm quyền trình duyệt xuống mức cần thiết.

**Category**  
Productivity

**Single Purpose**  
Hỗ trợ điều dưỡng nhập liệu nội trú trên VNPT HIS với kiểm tra ngữ cảnh bệnh nhân.

**Primary Language**  
Vietnamese

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | Ready | `src/assets/icons/icon128.png` |
| Screenshot 1 | 1280×800 | Ready | `store-assets/screenshot-popup.png` |
| Screenshot 2 | 1280×800 | Optional, not required for initial internal listing | — |
| Screenshot 3 | 1280×800 | Optional, not required for initial internal listing | — |
| Small Promo Tile | 440×280 | Optional for Unlisted distribution | — |

### Screenshot Notes

- Screenshot 1: bảng Điều Dưỡng trên màn hình HIS với toàn bộ dữ liệu bệnh nhân được làm giả hoặc che kín.
- Screenshot 2: trạng thái kiểm tra sai ngữ cảnh bệnh nhân trong panel; HIS vẫn thao tác được, không có lớp phủ toàn màn hình.
- Screenshot 3: popup bật/tắt tiện ích và Safe Mode, không hiển thị dữ liệu bệnh nhân.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Lưu tùy chọn bật/tắt, Safe Mode, chính sách phiên bản, số liệu sức khỏe runtime và nhật ký thao tác đã giả danh hóa ngay trên thiết bị. |
| `*://*.vncare.vn/*` | host_permissions | Đọc y lệnh và hỗ trợ điền biểu mẫu chỉ trên các trang VNPT HIS thuộc tên miền `vncare.vn`; không truy cập trang web khác. |

## Privacy & Data Use

### Data Handling

Tiện ích xử lý nội dung trang và thông tin sức khỏe đang hiển thị trên HIS để thực hiện thao tác do người dùng yêu cầu. Dữ liệu này không được gửi đến nhà phát triển hoặc bên thứ ba. Tiện ích lưu cục bộ các tùy chọn, thông tin sức khỏe runtime và nhật ký kỹ thuật đã giả danh hóa; người dùng có thể xóa bằng cách xóa dữ liệu tiện ích hoặc gỡ tiện ích.

### Chrome Web Store disclosure guidance

- Personally identifiable information: patient name and record identifiers are handled transiently and locally for patient-context verification; raw identifiers are not transmitted to the developer or third parties.
- Health information: handled locally for core functionality; not transmitted off-device by the extension.
- Website content: handled locally on `vncare.vn`; not transmitted to the developer or third parties.
- User activity: local audit and performance events only; identifiers are redacted or pseudonymized.
- Authentication information: not collected or stored by the extension; requests reuse the existing HIS browser session.
- Data is not sold, not used for advertising, not used for creditworthiness, and not used outside the extension's single purpose.

## Privacy Policy

**Repository source:** `docs/PRIVACY_POLICY.md`  
**Privacy Policy URL:** https://fantasy-1608.github.io/Nurse/privacy-policy.html

## Distribution

**Visibility:** Unlisted — chỉ người có link trực tiếp mới truy cập listing.  
**Regions:** All regions, tương tự Aladinn; listing vẫn Unlisted.  
**Pricing:** Free.

## Developer Info

**Publisher Name:** Huỳnh Trung Anh  
**Contact Email:** trunganh1608@gmail.com  
**Support URL / Email:** https://github.com/fantasy-1608/Nurse/issues  
**Homepage URL:** https://github.com/fantasy-1608/Nurse

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.3.9 | 2026-06-20 | Thay lớp loading phủ màn hình bằng chip trạng thái không chặn; xác nhận role block chỉ ẩn Nurse UI; bỏ quyền `activeTab` không dùng. | Draft |

## Review Notes

- Tiện ích không tự lưu hồ sơ lâm sàng; người dùng phải kiểm tra và lưu trên HIS.
- Nếu không xác minh được vai trò điều dưỡng, tiện ích tự ẩn nhưng không chặn giao diện HIS.
- Các guard sai bệnh nhân và lỗi audit tiếp tục fail-closed đối với thao tác tự động của tiện ích, không khóa thao tác thủ công trên HIS.

## Remaining Submission Steps

1. Kiểm tra thủ công bản unpacked trên môi trường pilot: sai vai trò, timeout vai trò và lỗi điền đều không được khóa HIS.
2. Tải `dist-zip/Nurse-v1.3.9.zip` lên Chrome Developer Dashboard và hoàn thành biểu mẫu Data Use đúng nội dung mục Privacy.
3. Chọn Distribution → Visibility: `Unlisted`, sau đó gửi duyệt.
