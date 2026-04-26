/* eslint-disable */
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target || !['nurse', 'ddt'].includes(target)) {
    console.error('❌ Vui lòng chỉ định target: npm run build:nurse hoặc npm run build:ddt');
    process.exit(1);
}

const config = require(`./config.${target}.js`);
const pkg = require('../package.json');
const srcDir = path.join(__dirname, '../src');
const distDir = path.join(__dirname, `../dist/${target === 'nurse' ? 'Nurse' : 'DDT'}`);

console.log(`🚀 Bắt đầu build cho target: ${target.toUpperCase()}`);

// Hàm copy thư mục đệ quy
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            // Đọc và thay thế nội dung với file text
            if (/\.(js|json|html|css)$/.test(entry.name)) {
                let content = fs.readFileSync(srcPath, 'utf8');
                
                content = content.replace(/__EXT_NAME__/g, config.extName);
                content = content.replace(/__EXT_SHORT_NAME__/g, config.extShortName);
                content = content.replace(/__EXT_DESC__/g, config.extDesc);
                content = content.replace(/__EXT_EMOJI__/g, config.extEmoji);
                content = content.replace(/__EXT_PREFIX__/g, config.extPrefix);
                content = content.replace(/__EXT_FOOTER_TEXT__/g, config.extFooterText);
                content = content.replace(/__EXT_VERSION__/g, pkg.version);
                
                // Thay thế chuỗi mảng JSON cho SUCCESS_MESSAGES
                content = content.replace(/'__EXT_SUCCESS_MESSAGES__'/g, JSON.stringify(config.extSuccessMessages, null, 8));

                fs.writeFileSync(destPath, content);
            } else {
                // Copy bình thường với file binary (ảnh)
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

// Xóa thư mục cũ
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}

// Copy và thay thế
copyDir(srcDir, distDir);

console.log(`✅ Build thành công! Thư mục extension nằm tại: ${distDir}`);
