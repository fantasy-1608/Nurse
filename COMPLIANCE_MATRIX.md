# Ma Trận Tuân Thủ Pháp Lý Và An Toàn Thông Tin — Nurse

Ngày cập nhật: 2026-05-31

Phạm vi: extension Nurse/DDT hỗ trợ thao tác trên VNPT HIS. Extension không thay thế HIS/EMR chính, nhưng có đọc, xử lý và điền dữ liệu lâm sàng trên giao diện HIS nên phải áp dụng yêu cầu bảo mật dữ liệu người bệnh, dữ liệu y tế và an toàn thông tin mạng.

## 1. Nguồn pháp lý áp dụng

| Nguồn | Yêu cầu liên quan | Cách áp vào Nurse |
|---|---|---|
| Luật Khám bệnh, chữa bệnh 2023 | Hồ sơ bệnh án và thông tin người bệnh phải được giữ bí mật; người được tiếp cận hồ sơ chỉ dùng đúng mục đích. | Không lưu tên BN/DOB/mã khám bệnh/HSBA trong audit/log; không tự lưu hồ sơ cuối; mọi thao tác ghi phải qua Patient Lock, audit và xác nhận người dùng. |
| Thông tư 13/2025/TT-BYT | Hồ sơ bệnh án điện tử được lập, cập nhật, hiển thị, ký, lưu trữ, quản lý, sử dụng và khai thác bằng phương tiện điện tử; phải tuân thủ pháp luật về dữ liệu, CNTT, giao dịch điện tử, ATTT mạng, an ninh mạng, bảo vệ dữ liệu cá nhân và lưu trữ. | Extension chỉ là công cụ hỗ trợ HIS, không tự ký/khóa EMR; release gate kiểm manifest tối thiểu, không nguồn ngoài, audit export đã redact, pilot evidence đủ scenario. |
| Nghị định 13/2023/NĐ-CP | Bảo vệ dữ liệu cá nhân trong quá trình xử lý dữ liệu. | Dữ liệu định danh được redact/pseudonymize; không telemetry ngoài bệnh viện; xóa migration key cũ có rủi ro PHI; audit export chặn dấu hiệu PHI. |
| Nghị định 102/2025/NĐ-CP | Quản lý, bảo vệ, xử lý, khai thác và sử dụng dữ liệu y tế theo pháp luật về dữ liệu, CNTT, ATTT mạng, an ninh mạng và bảo vệ dữ liệu cá nhân. | Không gửi dữ liệu y tế ra ngoài `*.vncare.vn`; release policy cục bộ, hash build, rollout inventory, kill switch và rollback bắt buộc. |
| Thông tư 53/2014/TT-BYT | Điều kiện hoạt động y tế trên môi trường mạng: chính sách bảo mật, kiểm soát truy cập, chống mã độc, quản lý lỗi bảo mật, kiểm tra mã nguồn, phân quyền, nhật ký, sao lưu/khôi phục và mã hóa phù hợp. | Security policy, audit trail, release checklist, rollback checklist, dependency audit, GitNexus impact, safe mode, fail-closed, no external runtime URL. |
| Quyết định 326/QĐ-BYT năm 2024 | Quy chế bảo đảm ATTT, an ninh mạng trong hoạt động của Bộ Y tế. | Áp dụng như baseline vận hành: phân quyền theo HIS hiện tại, không vượt quyền tài khoản, kiểm soát sự cố, thu hồi bản lỗi và lưu bằng chứng rollout. |

Nguồn kiểm tra:

- Luật Khám bệnh, chữa bệnh số 15/2023/QH15: https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=168125
- Hướng dẫn Bộ Y tế về Thông tư 13/2025/TT-BYT và hồ sơ bệnh án điện tử: https://moh.gov.vn/thong-tin-chi-dao-dieu-hanh/-/asset_publisher/DOHhlnDN87WZ/content/huong-dan-moi-nhat-trien-khai-ho-so-benh-an-ien-tu
- Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân: https://congbao.chinhphu.vn/so-do-van-ban-so-13-2023-nd-cp-39228?cbid=44543
- Nghị định 102/2025/NĐ-CP về quản lý dữ liệu y tế: https://vanban.chinhphu.vn/?classid=1&docid=213607&orggroupid=2&pageid=27160
- Thông tin Bộ Y tế về Nghị định 102/2025/NĐ-CP và quản lý dữ liệu y tế: https://moh.gov.vn/thong-tin-chi-dao-dieu-hanh/-/asset_publisher/DOHhlnDN87WZ/content/thong-nhat-ong-bo-trong-quan-ly-du-lieu-y-te
- Thông tư 53/2014/TT-BYT: https://vbpl.vn/FileData/TW/Lists/vbpq/Attachments/66739/VanBanGoc_53_2014_TT-BYT.pdf

## 2. Ma trận yêu cầu - kiểm soát - bằng chứng

| Nhóm yêu cầu | Control trong repo | Gate/bằng chứng hiện tại | Trạng thái |
|---|---|---|---|
| Tối thiểu quyền extension | Manifest chỉ có `activeTab`, `storage`, host `*.vncare.vn`, không optional host. | `npm run release:gate` kiểm source và dist manifest. | Pass local |
| Không đưa PHI ra ngoài bệnh viện | Gỡ GitHub update runtime, Google Fonts, telemetry ngoài; bridge dùng origin cụ thể. | `release:gate` scan URL ngoài; pilot gate yêu cầu `external_network_ok=true` từng ca. | Pass local, chờ pilot thật |
| Không lưu định danh người bệnh | `HIS.Privacy.redact`, `patientRef`, `itemRef`, migration xóa key cũ, repo PHI gate chặn fixture giống dữ liệu thật. | `npm test`, `npm run repo:phi:gate`, `npm run audit:gate` với `audit-export.csv` thật. | Pass local, chờ audit thật |
| Nhật ký/audit đủ nhưng không lộ PHI | `HIS.Audit`, export CSV có version/build hash, pseudonym. | `test/audit-export-gate.test.js`, `tools/verify-audit-export.js`. | Pass local, chờ pilot export |
| Fail-closed khi audit hoặc safety lỗi | `HIS.Safety.guardAutoFill` chặn auto-fill nếu audit/safe mode/kill switch lỗi. | `security-harness` và pilot evidence gate. | Pass local |
| Patient Lock trước ghi lâm sàng | `requireTarget: true`, sequence/request binding, mismatch blocked. | Static/local tests và pilot scenario `patient_switch`, `hidden_old_form` cho từng module. | Pass local, chờ pilot thật |
| Không tự lưu hồ sơ cuối | Auto-fill chỉ điền/ thêm vào phiếu, người dùng quyết định lưu HIS. | Code review + release checklist + pilot verification. | Pass local |
| Vật tư fast path kiểm soát | `quyen_vattu_fast_path_enabled=false` mặc định, queue dừng khi fail/timeout. | `release checklist`, `pilot:gate`, `rollout:gate` yêu cầu fast path tắt mặc định. | Pass local |
| Kiểm soát cài thủ công | ZIP, SHA-256, release-policy, rollout inventory, version/hash allowlist. | `build:all`, `release:gate`, `rollout:gate`. | Pass local, chờ inventory thật |
| Thu hồi/rollback | Popup kill switch, rollback checklist, rollout inventory ghi rollback. | `ROLLBACK_CHECKLIST.md`, `rollout:gate` yêu cầu `rollback_tested=true`. | Pass local, chờ máy thật |
| Quản lý sự cố và hazard | Hazard log có severity, mitigation, evidence, owner, status. | `src/docs/hazard-log.md`, release gate yêu cầu tồn tại. | Pass local |
| Không vượt quyền HIS | Extension không có credential riêng, không bypass role; pilot non-nurse phải bị chặn. | `pilot:gate` yêu cầu `non_nurse_user` từng module với role không phải điều dưỡng và result `BLOCKED`. | Pass local, chờ pilot thật |

## 3. Điều kiện chưa được phép bỏ qua

- Không được dùng dữ liệu bệnh nhân thật trong issue, log phát triển, prompt LLM, screenshot hoặc tài liệu test.
- Không được bật fast path Vật tư toàn viện nếu chưa có pilot pass theo khoa.
- Không được coi `npm test` thay thế pilot HIS thật; test tự động chỉ chứng minh logic/gate local.
- Không được phát hành toàn viện nếu `npm run hospital:gate` chưa pass với `audit-export.csv`, `pilot-evidence.csv` và `rollout-inventory.csv` thật.

## 4. Bằng chứng cần nộp khi xin phát hành toàn viện

- `dist-zip/sha256.txt` và `dist-zip/release-policy.json`.
- `audit-export.csv` từ popup, đã chạy `npm run audit:gate`.
- `pilot-evidence.csv` đủ 20 ca/module và đủ 10 scenario/module, đã chạy `npm run pilot:gate`.
- `rollout-inventory.csv` đầy đủ máy/khoa/user/version/hash, đã chạy `npm run rollout:gate`.
- Output `npm run hospital:gate`.
- Biên bản IT/khoa xác nhận hash, kill switch, rollback, Safe Mode, không request ngoài `*.vncare.vn`.
