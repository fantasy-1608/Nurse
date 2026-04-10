# 💉 Điều Dưỡng (Clinical Nurse Extension)

> Trước đây: "🌸 Cảm ơn chị Quyên"

Một tiện ích mở rộng (Extension) chạy trên trình duyệt web, được thiết kế đặc biệt nhằm trở thành **"Trợ lý Ảo"** cho các Điều dưỡng viên thao tác trên hệ thống mạng y tế **VNPT HIS**.

Mục tiêu cốt lõi của công cụ này là **tự động hóa nhập liệu, giảm tải thao tác cơ học**, giúp điều dưỡng nhanh chóng hoàn thiện hồ sơ bệnh án để dành nhiều thời gian hơn cho việc chăm sóc trực tiếp bệnh nhân.

---

## 🌟 Các Tính Năng Nổi Bật

### 1. Tự Động Lập Phiếu Truyền Dịch

- **Trích xuất y lệnh:** Tự động đọc và quét y lệnh thuốc/dịch truyền từ hệ thống.
- **Điền nhanh vào phiếu:** Tự động phân tách và điền các thông số dịch truyền (tên thuốc, dung môi, số lượng, tốc độ, thời gian bắt đầu/kết thúc) vào form phiếu truyền dịch của VNPT HIS.

### 2. Tự Động Điền Phiếu Chăm Sóc

- **Templates thông minh:** Hỗ trợ điền nhanh toàn bộ Phiếu chăm sóc theo các Template đã được cấu hình sẵn (Hô hấp, Tiêu hóa, Thần kinh,...).
- **Kế thừa thông tin thông minh:** Có khả năng rà soát và copy các dữ liệu từ "Phiếu gần nhất" của bệnh nhân đó để điền vào phiếu mới, bao gồm:
  - Sinh hiệu (Huyết áp, Mạch, Nhiệt độ, SpO2, Nhịp thở)
  - Thể trạng (Chiều cao, Cân nặng, BMI)
  - Diễn biến cơ quan bệnh (Section 4)
  - Can thiệp điều dưỡng (Section 17)

### 3. An Toàn Bệnh Nhân (Patient Lock)

- Tính năng bảo mật an toàn đảm bảo việc **chỉ điền dữ liệu cho đúng bệnh nhân đang được chọn**. Tránh tối đa rủi ro "râu ông nọ cắm cằm bà kia" do hệ thống HIS rớt mạng, nhảy tab hay thao tác nhầm.

### 4. Giao Diện Bảng Điều Khiển Nhanh (Side panel)

- Tích hợp một bảng điều khiển ngay trong cửa sổ HIS, giúp điều dưỡng thao tác 1 CLICK là xong phiếu.

### 5. 💰 Hệ thống Thành tựu "Chỉ Vàng" (Độc quyền v1.2.0)

- **Ghi nhận công sức:** Theo dõi tự động toàn bộ lịch sử điền form của Điều dưỡng. Tích luỹ điểm hiển thị dưới dạng "**Chỉ vàng**".
- **Hiệu ứng rực rỡ:** 
  - Chữ "+1 chỉ vàng ✨" bay lên sau mỗi phiếu hoàn thành.
  - Hiệu ứng **Dải Ngân hà Vàng (Epic Gold Flash)** nổ lớn giữa màn hình khi tạo phiếu (giúp giảm stress ca trực).
- **Hệ thống Rank (Tier):** Từ mầm cây non / đồng xu (0 điểm) tiến hóa lên Huy chương vàng (10) 🥇 → Kim cương (40) 💎 → Vương miện lấp lánh (50) ✨👑✨. Tạo động lực chốt y lệnh không mệt mỏi!

### 6. 🆕 Thông tin Phiếu đã lập (v1.2.0)

- **Đếm phiếu tự động:** Khi chọn bệnh nhân, extension tự động truy vấn API `NTU02D204.01` để hiển thị số lượng phiếu CS đã lập trong ngày.
- **Thời gian tạo phiếu:** Hiện thời gian tạo từng phiếu (ví dụ: "3 phiếu hôm nay (07:15, 13:30, 19:45)") giúp ĐD theo dõi tiến độ ca trực.

### 7. 🆕 Sinh hiệu Fallback thông minh (v1.2.0)

- **Tìm kiếm bậc thang:** Khi dữ liệu sinh hiệu nội trú (`NT.006`) trống, extension tự động tìm kiếm qua lần lượt: HSBA → Cấp cứu → Ngoại trú → Khám bệnh.
- **Không bỏ sót:** Đảm bảo luôn tìm được cân nặng, chiều cao, mạch, nhiệt độ ban đầu, kể cả BN mới nhập viện.

## ⚙️ Hướng Dẫn Cài Đặt (Dành cho Kỹ thuật / Quản trị)

Dự án hiện hỗ trợ build thành 2 phiên bản khác nhau thông qua Node.js:

- **Bản Triển Khai Toàn Viện (`DDT`)**: Tên hiển thị là "Điều Dưỡng".
- **Bản Kỷ Niệm / Thí Điểm (`Nurse`)**: Tên hiển thị là "🌸 Cảm ơn chị Quyên".

### Phục vụ Build

1. Cài đặt [Node.js](https://nodejs.org/).
2. Mở Terminal / Command Prompt tại thư mục dự án và chạy các lệnh:

   ```bash
   # Build bản Điều Dưỡng (sử dụng chính)
   npm run build:ddt

   # Hoặc build bản Chị Quyên
   npm run build:nurse
   ```

3. Sau khi build thành công, source code của extension sẽ nằm trong thư mục `/dist/DDT` hoặc `/dist/Nurse`.

### Thêm Extension Vào Trình Duyệt (Chrome / Edge)

1. Mở Cài đặt tiện ích mở rộng (Gõ `chrome://extensions/` hoặc `edge://extensions/` vào thanh địa chỉ).
2. Bật chế độ dành cho nhà phát triển (**Developer mode**).
3. Nhấn vào nút **Tải tiện ích đã giải nén (Load unpacked)**.
4. Chọn thư mục `/dist/DDT` hoặc `/dist/Nurse` vừa build ở trên.
5. Kiểm tra biểu tượng chiếc kim tiêm 💉 xuất hiện trên thanh công cụ là thành công.

---

## 🚀 Hướng Dẫn Sử Dụng Chi Tiết (Dành cho Điều Dưỡng)

### Bước 1: Khởi động và Chọn bệnh nhân

- Đăng nhập hệ thống VNPT HIS bình thường.
- Extension sẽ theo dõi và **khóa an toàn (lock)** khi bạn click chọn một bệnh nhân từ danh sách. Một thông báo nhỏ sẽ báo hiệu hệ thống đã nhận diện được bệnh nhân mục tiêu.

### Bước 2A: Rút Gọn Thao Tác Lập Phiếu Truyền Dịch

1. Mở module Phác đồ / Y lệnh.
2. Tại cửa sổ **Thêm phiếu truyền dịch**, bảng điều khiển siêu tốc của Extension sẽ hiện ra.
3. Click vào nút **"Bắt đầu điền"** -> Công cụ sẽ tự động đọc tên thuốc truyền, dung môi, tính toán lượng ml và tốc độ truyền để đánh thẳng vào phiếu.
4. Kiểm tra lại thông tin và ấn lưu trên VNPT HIS.

### Bước 2B: Rút Gọn Thao Tác Phiếu Chăm Sóc

1. Tại cửa sổ tạo **Phiếu chăm sóc** mới cho bệnh nhân.
2. Chọn **"Copy phiếu cũ"**: Tiện ích sẽ quét Phiếu chăm sóc gần nhất của bệnh nhân này và bê y nguyên các chỉ số như *Sinh hiệu, Cơ quan bệnh, Y lệnh can thiệp* sang phiếu mới cực kỳ chuẩn xác.
3. Hoặc chọn **Điền theo Tempate (Mẫu chuẩn)**:
   - Trên thanh công cụ của Extesion (Slide Panel), thả xuống và chọn mẫu (ví dụ Mẫu Cấp Cứu, Mẫu Nhi, Mẫu Hồi Sức,...).
   - Chỉ 1 Click "Điền mẫu", tất cả checkbox và textarea sẽ tự nhảy chữ theo form chuẩn viện ban hành.

### Bước 3: Xem Lịch Sử (Nhật Ký)

- Bạn có thể click vào biểu tượng 💉 ở góc phải trên cùng trình duyệt (Popup).
- Khi mở cửa sổ này ra, có thể xem lại *Nhật ký thao tác (Audit Log)*: Biết được ngày hôm nay mình đã dùng auto-fill tiết kiệm được bao nhiêu thời gian và xử lý được bao nhiêu ca.

---

## 🛠 Xử Lí Sự Cố Chung (Troubleshooting)

- **Lỗi không click được "Điền Phiếu":** Đảm bảo bạn đã click CHỌN một bệnh nhân trên HIS trước khi dùng tiện ích.
- **Tiện ích điền sai / chệch ô:** Đôi khi VNPT HIS tải biểu mẫu chậm. Vui lòng chờ đến khi giao diện form phiếu hiện ra tải xong toàn bộ rồi hẳn bấm "Điền".
- **Không tự động copy được phiếu chăm sóc cũ:** Bệnh nhân vừa nhập viện, chưa hề có phiếu chăm sóc nào trước đó để extension có thể copy. Vui lòng tạo phiếu mới thủ công hoặc sử dụng Template.

---

*Phát triển với ❤️ nhằm nâng cao chất lượng môi trường làm việc y khoa.*
