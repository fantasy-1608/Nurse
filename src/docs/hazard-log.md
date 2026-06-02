# Hazard Log — Nurse

| ID | Hazard | Severity | Likelihood | Mitigation | Evidence | Owner | Status |
|---|---|---:|---:|---|---|---|---|
| H1 | Điền nhầm bệnh nhân | Critical | Medium | Patient Lock `requireTarget: true`, chặn thiếu target, chặn mismatch ID/tên+DOB | `shared/patient-lock.js`, guard tại Infusion/CareSheet/Vật tư | Dev + Khoa | Active |
| H2 | Auto-fill chạy khi Safe Mode bật | High | Medium | `HIS.Safety.guardAutoFill()` chặn toàn cục | `shared/safety.js`, UI entry points | Dev | Mitigated |
| H3 | Không có audit trước thao tác lâm sàng | High | Medium | Audit fail-closed, không ghi được audit thì chặn auto-fill | `shared/audit.js`, `shared/safety.js` | Dev + IT | Mitigated |
| H4 | Audit/log chứa PHI | High | Medium | `HIS.Privacy` redact, audit dùng patientRef/itemRef, xóa log cũ | `shared/privacy.js`, `shared/logger.js` | Dev + IT | Mitigated |
| H5 | Message injection từ script khác | High | Medium | Envelope bắt buộc `_q`, source, ts, requestId, allowlist type | `shared/message.js`, `injected/his-bridge.js` | Dev | Mitigated |
| H6 | Bridge gọi SP tùy ý | High | Low | `QUYEN_REQ_CALL_SP` chỉ cho SP allowlist | `his-bridge.js` | Dev | Mitigated |
| H7 | Vật tư fast path/data injection sai widget | High | Medium | Mặc định tắt bằng feature flag, fallback gõ/click, verify field trước khi thêm | `vattu-ui.js`, `his-bridge.js` | Dev + Khoa | Pilot |
| H8 | Queue Vật tư tiếp tục sau lỗi | High | Medium | Dừng queue khi fail/timeout, có nút Dừng | `vattu-ui.js` | Dev | Mitigated |
| H9 | User không phải Điều dưỡng dùng extension | High | Low | Bridge chặn `USER_GROUP_ID != 5`, không log tên user | `his-bridge.js`, `content.js` | IT | Active |
| H10 | Debug log lộ dữ liệu | High | Medium | Debug release hết hạn 15 phút, vẫn redact PHI | `logger.js`, `popup.js` | Dev + IT | Mitigated |
| H11 | XSS trong tooltip/input/value | Medium | Medium | Escape text/attr, tránh `innerHTML` động ở status | `ui-panel.js`, `vattu-ui.js` | Dev | Mitigated |
| H12 | Cài thủ công lệch version/hash | High | Medium | Release checklist hash, release policy allowlist/buildHash/expiry, danh sách máy, rollback | `RELEASE_CHECKLIST.md`, `background.js`, `content.js` | IT | Mitigated |
| H13 | Thay đổi DOM/API VNPT HIS làm fill sai | High | Medium | Pilot 20 ca/module, post-fill checks, rollback | `RELEASE_CHECKLIST.md` | Dev + Khoa | Required |
| H14 | Extension gọi dịch vụ ngoài bệnh viện | High | Low | Không có GitHub permission/update checker, không tải Google Fonts, test manifest/popup | `manifest.json`, `background.js`, `popup.html` | Dev + IT | Mitigated |
| H15 | Cần dừng khẩn cấp theo máy/khoa | Critical | Low | Popup kill switch `quyen_kill_switch`, tháo UI/module và badge cảnh báo | `background.js`, `content.js`, `popup.js` | IT + Khoa | Mitigated |

## Release Gate

- Không phát hành toàn viện nếu còn lỗi P0/P1, audit không fail-closed, message legacy còn được chấp nhận, hoặc build hash không khớp.
- Không phát hành nếu release policy không khóa được version ngoài allowlist, version hết hạn hoặc kill switch.
- Không phát hành nếu popup/background/content tạo request mạng ngoài VNPT HIS.
- Không dùng dữ liệu bệnh nhân thật trong báo lỗi gửi ra ngoài bệnh viện.
- Không bật Vật tư fast path ngoài khoa pilot khi chưa có biên bản pass.
