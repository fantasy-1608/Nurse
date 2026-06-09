/* eslint-disable */
module.exports = {
    target: 'nurse',
    uiMode: 'production',
    extName: 'Điều Dưỡng VNPT HIS',
    extShortName: 'Điều Dưỡng',
    extDesc: 'Điều Dưỡng — Trợ lý tự động nhập liệu trên VNPT HIS',
    extEmoji: '🌸',
    extPrefix: 'Điều Dưỡng',
    extFooterText: 'Trợ lý VNPT HIS — kiểm tra trước khi lưu',
    extSuccessMessages: [
        'Đã điền dữ liệu. Vui lòng kiểm tra lại trước khi lưu.',
        'Hoàn tất điền biểu mẫu. Cần rà soát trên HIS trước khi lưu.',
        'Đã hỗ trợ nhập liệu. Người dùng chịu trách nhiệm kiểm tra cuối.',
        'Dữ liệu đã được điền vào form, chưa lưu hồ sơ.',
        'Hoàn tất thao tác hỗ trợ, hãy đối chiếu bệnh nhân và nội dung.'
    ],
    features: {
        auditEnabled: true
    }
};
