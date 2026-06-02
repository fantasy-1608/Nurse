# Release Checklist Nurse

## 1. Baseline

- [ ] Git working tree sạch trước khi build.
- [ ] GitNexus CLI `npx gitnexus status` báo Nurse up-to-date.
- [ ] Đã chạy impact cho mọi symbol sửa; HIGH/CRITICAL đã được cảnh báo.
- [ ] Không có PHI thật trong commit, issue, log, screenshot hoặc tài liệu.

## 2. Kiểm Thử

- [ ] `npm run syntax:gate` pass cho toàn bộ JS trong `src`, `test`, `build`, `tools`.
- [ ] `npm test` pass.
- [ ] `npm run repo:phi:gate` pass, không có DOB/mã khám bệnh/HSBA hoặc ghi chú giống PHI thật trong repo nếu không có nhãn fixture an toàn.
- [ ] `npm run release:gate` pass.
- [ ] `npm run audit:gate` pass với `audit-export.csv` thật sau pilot.
- [ ] `npm run pilot:gate` pass với `pilot-evidence.csv` thật sau pilot.
- [ ] `npm run rollout:gate` pass với `rollout-inventory.csv` thật trước phát hành toàn viện.
- [ ] `npm run hospital:gate` pass khi có đủ artifact, audit export, pilot evidence và rollout inventory; hospital gate phải chạy syntax gate, dependency audit, repo PHI gate, release gate, audit gate, pilot gate và rollout gate.
- [ ] `npm test` có test bảo vệ cấu hình hospital gate, không cho bỏ syntax/dependency/repo-PHI/audit/pilot/rollout gate khỏi cổng cuối.
- [ ] `npm run build:nurse` pass.
- [ ] `npm run build:ddt` pass.
- [ ] `pnpm audit --prod` không có lỗ hổng đã biết.
- [ ] Đối chiếu `COMPLIANCE_MATRIX.md` và xác nhận mọi yêu cầu pháp lý có bằng chứng/gate tương ứng.
- [ ] Test Safe Mode chặn Truyền dịch, Phiếu chăm sóc, Vật tư.
- [ ] Test Patient Lock chặn no-target, mismatch ID, thiếu tên+DOB.
- [ ] Test audit fail-closed bằng cách mô phỏng storage error.
- [ ] Test message không marker bị chặn.
- [ ] Test tooltip/input/value không XSS.
- [ ] Test popup không tải font/script ngoài bệnh viện và manifest không có GitHub permission.
- [ ] Test release policy: version ngoài allowlist bị khóa, version hết hạn bị khóa, kill switch khóa ngay UI/module.

## 3. Pilot HIS

- [ ] 20 ca Truyền dịch tại 1 khoa.
- [ ] 20 ca Phiếu chăm sóc tại 1 khoa.
- [ ] 20 ca Vật tư tại 1 khoa, fast path tắt mặc định.
- [ ] Test đổi bệnh nhân giữa chừng.
- [ ] Test form cũ ẩn, mạng chậm, form chưa tải.
- [ ] Test user không phải Điều dưỡng bị chặn.
- [ ] Test tắt/bật extension và Safe Mode.
- [ ] Ghi đầy đủ `pilot-evidence.csv` theo mẫu `src/docs/pilot-evidence-template.csv`.
- [ ] Export audit từ popup thành `audit-export.csv` và chạy `npm run audit:gate`.
- [ ] `pilot-evidence.csv` không chứa tên BN, DOB, số HSBA/mã khám bệnh thật hoặc ghi chú có PHI.

## 4. Đóng Gói Thủ Công

- [ ] Tạo `dist-zip/DDT-v<version>.zip` và `dist-zip/Nurse-v<version>.zip`.
- [ ] Tạo `sha256.txt`.
- [ ] Tạo `release-policy.json`.
- [ ] Ghi changelog.
- [ ] Ghi danh sách máy/khoa/user Windows/user HIS/version/hash/người cài/thời điểm.
- [ ] Ghi đầy đủ `rollout-inventory.csv` theo mẫu `src/docs/rollout-inventory-template.csv`.
- [ ] Ghi `quyen_release_policy.buildHash` đúng với hash gói đã cài trên máy pilot/toàn viện.
- [ ] Có checklist rollback theo `ROLLBACK_CHECKLIST.md` và người chịu trách nhiệm trực.

## 5. Release Gate

- [ ] 0 lỗi P0/P1 đã biết.
- [ ] 0 PHI trong log/audit/export sau redact.
- [ ] `npm run audit:gate` xác nhận audit export không có PHI và PatientRef/ItemRef là mã giả danh.
- [ ] 100% auto-fill có audit attempt trước khi chạy.
- [ ] 100% mismatch bệnh nhân bị chặn.
- [ ] Build hash khớp trên mọi máy pilot.
- [ ] Không có request mạng ngoài `*.vncare.vn` trong lúc dùng popup/content/background.
- [ ] `npm run pilot:gate` xác nhận đủ số ca, scenario, hash, audit, no-PHI, kill switch, rollback và network gate.
- [ ] `npm run rollout:gate` xác nhận mọi máy có hash đúng, version đúng, release policy allowed, debug tắt, fast path tắt, kill switch/rollback đã test.
