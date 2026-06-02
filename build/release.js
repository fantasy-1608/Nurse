/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Đọc version từ package.json
const pkg = require('../package.json');
const version = pkg.version;

const distZipDir = path.join(__dirname, '../dist-zip');

console.log(`\n📦 Bắt đầu build & đóng gói Release v${version}\n`);
console.log('='.repeat(50));

// 1. Build cả 2 phiên bản
console.log('\n🔨 [1/4] Build bản DDT...');
execSync('node build/build.js ddt', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

console.log('\n🔨 [2/4] Build bản Nurse...');
execSync('node build/build.js nurse', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

// 2. Tạo thư mục dist-zip nếu chưa có
if (fs.existsSync(distZipDir)) {
    fs.rmSync(distZipDir, { recursive: true, force: true });
}
fs.mkdirSync(distZipDir, { recursive: true });

// 3. Đóng gói zip
console.log('\n📦 [3/4] Đóng gói DDT...');
execSync(
    `cd dist/DDT && zip -r "../../dist-zip/DDT-v${version}.zip" . -x "*.DS_Store"`,
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
);

console.log('\n📦 [4/4] Đóng gói Nurse...');
execSync(
    `cd dist/Nurse && zip -r "../../dist-zip/Nurse-v${version}.zip" . -x "*.DS_Store"`,
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
);

const zipFiles = [`DDT-v${version}.zip`, `Nurse-v${version}.zip`];
const shaLines = zipFiles.map((file) => {
    const filePath = path.join(distZipDir, file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    return `${hash}  ${file}`;
});
fs.writeFileSync(path.join(distZipDir, 'sha256.txt'), shaLines.join('\n') + '\n');

const policy = {
    generatedAt: new Date().toISOString(),
    channel: 'manual',
    version,
    packages: zipFiles.map((file, index) => ({
        file,
        sha256: shaLines[index].split('  ')[0],
        allowedVersions: [version],
        expiresAt: '',
        storageKey: 'quyen_release_policy'
    })),
    installNote: 'Nhập đúng sha256 của gói đã cài vào quyen_release_policy.buildHash trên máy pilot/toàn viện.'
};
fs.writeFileSync(path.join(distZipDir, 'release-policy.json'), JSON.stringify(policy, null, 2) + '\n');

console.log('\n' + '='.repeat(50));
console.log(`\n✅ Hoàn tất! Các file zip nằm tại thư mục dist-zip/:`);
console.log(`   📁 DDT-v${version}.zip`);
console.log(`   📁 Nurse-v${version}.zip`);
console.log(`   🔐 sha256.txt`);
console.log(`   🔐 release-policy.json`);
console.log(`\n💡 Kiểm hash theo sha256.txt và lưu buildHash vào release policy cục bộ khi pilot/toàn viện.\n`);
