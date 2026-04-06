/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');

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

console.log('\n' + '='.repeat(50));
console.log(`\n✅ Hoàn tất! Các file zip nằm tại thư mục dist-zip/:`);
console.log(`   📁 DDT-v${version}.zip`);
console.log(`   📁 Nurse-v${version}.zip`);
console.log(`\n💡 Để tạo GitHub Release, chạy:`);
console.log(`   npm run release\n`);
