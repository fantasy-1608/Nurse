# Báo Cáo Readiness Triển Khai Toàn Bệnh Viện — Nurse

Ngày cập nhật: 2026-05-31  
Phạm vi: extension Nurse/Điều Dưỡng hỗ trợ thao tác trên VNPT HIS.  
Kết luận hiện tại: **Release-candidate nội bộ, chưa đủ bằng chứng để phát hành toàn bệnh viện** cho đến khi hoàn tất pilot HIS thật.

## 1. Kết Quả Gate Kỹ Thuật

| Gate | Bằng chứng hiện tại | Trạng thái |
|---|---|---|
| GitNexus index | `npx gitnexus status` báo indexed commit và current commit đều `7835f0c`, status up-to-date | Pass |
| GitNexus affected scope | `detect_changes(scope=all)` báo `critical`, 227 changed symbols, 106 affected, 31 files | Cần nghiệm thu pilot |
| JS syntax | `npm run syntax:gate` kiểm toàn bộ JS trong `src`, `test`, `build`, `tools` | Pass |
| Unit/security tests | `npm test` chạy `no-demo-tab` + `security-harness` + repo PHI gate + `release-gate` + audit/pilot/rollout/hospital gate tests | Pass |
| Repo PHI gate | `npm run repo:phi:gate` quét source/docs/test để chặn DOB/mã bệnh nhân/ghi chú giống PHI thật không có nhãn fixture | Pass local |
| Release gate artifact | `npm run release:gate` kiểm quyền, nguồn ngoài, key storage cũ, manifest dist, ZIP và SHA-256 | Pass |
| Audit export gate | `npm run audit:gate` đã có verifier và test synthetic; cần `audit-export.csv` thật sau pilot | Chưa pilot |
| Pilot evidence gate | `npm run pilot:gate` đã có verifier và test synthetic; bắt buộc đủ 20 ca/module và đủ mọi scenario rủi ro trên từng module; cần `pilot-evidence.csv` thật sau pilot | Chưa pilot |
| Rollout inventory gate | `npm run rollout:gate` đã có verifier và test synthetic; cần `rollout-inventory.csv` thật trước toàn viện | Chưa rollout |
| Dependency audit | `pnpm audit --prod`; cũng được gọi trong `npm run hospital:gate` | Pass, no known vulnerabilities |
| Build release | `npm run build:all` | Pass |
| Diff hygiene | `git diff --check` | Pass |
| External network check | Grep không còn GitHub API, Google Fonts, wildcard `postMessage('*')`; dist popup/CSS không có external URL | Pass |
| Manifest least privilege | Dist manifest chỉ còn `activeTab`, `storage`, host `*.vncare.vn`, không optional host permission | Pass |

## 2. Artifact Release

| Artifact | Hash SHA-256 |
|---|---|
| `dist-zip/DDT-v1.3.4.zip` | `ce1a9a15fa3446cfef7de2105894fa8ba5814d87457e5efa9904e01e97922bd5` |
| `dist-zip/Nurse-v1.3.4.zip` | `4d378b9156d11e0766b88fbd1ae3e86e5fa9964b4acdb13ae6071f5332cbf842` |

Các file đi kèm:

- `dist-zip/sha256.txt`
- `dist-zip/release-policy.json`
- `SECURITY_POLICY.md`
- `PRIVACY_IMPACT_ASSESSMENT.md`
- `COMPLIANCE_MATRIX.md`
- `RELEASE_CHECKLIST.md`
- `ROLLBACK_CHECKLIST.md`
- `src/docs/pilot-evidence-template.csv`
- `src/docs/rollout-inventory-template.csv`
- `src/docs/hazard-log.md`
- `src/docs/pilot-checklist.md`

## 3. Đối Chiếu Yêu Cầu Bảo Mật

| Yêu cầu | Bằng chứng | Trạng thái |
|---|---|---|
| Không gửi PHI ra ngoài bệnh viện | Không còn GitHub update, không external font, không telemetry; chỉ host `*.vncare.vn` | Pass local |
| Không lưu tên BN/DOB/mã thật trong audit | `HIS.Privacy` redact + salted `patientRef`/`itemRef`; `security-harness` kiểm không còn tên/ID/DOB/thuốc/bác sĩ; repo PHI gate chặn fixture giống PHI thật | Pass local |
| Không giữ log lỗi/storage cũ có rủi ro PHI | `quyen_error_log` và `quyen_stats` chỉ còn trong migration xóa key; runtime dùng `quyen_runtime_health_v1` không chứa message/file/path | Pass local |
| Không đóng gói module API key/LLM cũ | `src/shared/crypto.js` đã gỡ; `release-gate` chặn `geminiApiKey`/`dashboard_password` ngoài migration xóa key | Pass local |
| Audit fail-closed trước auto-fill | `HIS.Safety.guardAutoFill`; test chặn khi kill switch/audit guard | Pass local |
| Safe Mode toàn cục | Safety guard dùng chung cho Truyền dịch, Phiếu chăm sóc, Vật tư | Pass local |
| Message envelope bắt buộc | `HIS.Message.isValid` chặn legacy raw `QUYEN_*`, timestamp hết hạn, source sai; bridge dùng target origin cụ thể | Pass local |
| Patient Lock `requireTarget: true` | Các entry auto-fill chính gọi `verifyCurrentForm({ requireTarget: true })` | Pass static/local |
| Vật tư fast path kiểm soát | `quyen_vattu_fast_path_enabled` mặc định false, queue dừng khi fail/timeout, có nút dừng | Pass local |
| Release policy cục bộ | Version allowlist, expiry, build hash, kill switch; test service worker policy | Pass local |
| Build hash trên máy pilot/toàn viện | `sha256.txt` + `release-policy.json`; cần IT ghi hash trên từng máy | Chưa pilot |

## 4. Yêu Cầu Pháp Lý Đã Áp Vào Thiết Kế

- Luật Khám bệnh, chữa bệnh 2023: bảo mật thông tin người bệnh và hồ sơ bệnh án.
- Thông tư 13/2025/TT-BYT: EMR phải tuân thủ pháp luật về dữ liệu, CNTT, ATTT mạng, an ninh mạng, bảo vệ dữ liệu cá nhân và lưu trữ.
- Nghị định 13/2023/NĐ-CP: bảo vệ dữ liệu cá nhân.
- Nghị định 102/2025/NĐ-CP: quản lý, xử lý, khai thác, sử dụng và bảo vệ dữ liệu y tế.
- Thông tư 53/2014/TT-BYT và Quyết định 326/QĐ-BYT: yêu cầu chính sách bảo mật, phân quyền, nhật ký, sao lưu/khôi phục, kiểm tra mã nguồn và quản lý sự cố ATTT y tế.

## 5. Gate Chưa Được Chứng Minh

Không được phát hành toàn bệnh viện nếu thiếu một trong các bằng chứng sau:

- Pilot HIS thật 20 ca/module: Truyền dịch, Phiếu chăm sóc, Vật tư; mỗi module phải đủ scenario normal, đổi bệnh nhân, form cũ ẩn, mạng chậm, form không tải, user không phải điều dưỡng, Safe Mode, kill switch, rollback và kiểm request mạng.
- `pilot-evidence.csv` thật theo mẫu `src/docs/pilot-evidence-template.csv` và chạy `npm run pilot:gate` pass.
- `audit-export.csv` thật từ popup và chạy `npm run audit:gate` pass.
- Ca đổi bệnh nhân giữa chừng, form cũ ẩn, mạng chậm, form không tải, user không phải điều dưỡng.
- Audit export từ pilot chứng minh 0 PHI và 100% auto-fill có audit attempt/result.
- Biên bản IT xác nhận hash gói cài khớp từng máy pilot.
- `rollout-inventory.csv` thật theo mẫu `src/docs/rollout-inventory-template.csv` và chạy `npm run rollout:gate` pass.
- Biên bản rollback/kill switch đã thử trên máy pilot.
- Xác nhận không có request ngoài `*.vncare.vn` khi dùng popup/content/background trên máy thật.

## 6. Điều Kiện Để Chuyển Từ Release-Candidate Sang Toàn Viện

1. Chạy pilot tại 1 khoa với tối thiểu 60 ca tổng cộng, 20 ca mỗi module.
2. Không có lỗi P0/P1, không có mismatch bệnh nhân lọt qua, không có PHI trong audit/export/log.
3. `npm run audit:gate` pass với `audit-export.csv` thật.
4. `npm run pilot:gate` pass với `pilot-evidence.csv` thật.
5. `npm run rollout:gate` pass với `rollout-inventory.csv` thật.
6. `npm run hospital:gate` pass trên bộ bằng chứng cuối, bao gồm syntax gate, dependency audit, repo PHI gate, release gate, audit gate, pilot gate và rollout gate.
7. GitNexus critical scope được nghiệm thu bằng pilot và ký xác nhận bởi dev + IT + khoa.
8. Cài bản ZIP bằng hash trong `sha256.txt`, lưu hash vào `quyen_release_policy.buildHash` trên từng máy.
9. Fast path Vật tư chỉ bật theo khoa sau khi pilot pass; mặc định toàn viện vẫn tắt.
10. Có danh sách máy, khoa, user Windows, user HIS, version, hash, người cài, thời điểm và người chịu trách nhiệm rollback.

## 7. Kết Luận

Repo hiện đã đạt mức **release-candidate kỹ thuật** với kiểm thử tự động mạnh hơn trước. Tuy nhiên, mục tiêu “không bug, không vi phạm bảo mật, sẵn sàng phát hành toàn bệnh viện” vẫn **chưa được chứng minh đầy đủ** cho đến khi hoàn tất pilot HIS thật và biên bản rollout/rollback.
