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

// 1. Build phiên bản Nurse
console.log('\n🔨 [1/2] Build bản Nurse...');
execSync('node build/build.js nurse', { stdio: 'inherit', cwd: path.join(__dirname, '..') });

// 2. Tạo thư mục dist-zip nếu chưa có
if (fs.existsSync(distZipDir)) {
    fs.rmSync(distZipDir, { recursive: true, force: true });
}
fs.mkdirSync(distZipDir, { recursive: true });

// 3. Đóng gói zip
console.log('\n📦 [2/2] Đóng gói Nurse...');
execSync(
    `cd dist/Nurse && zip -r "../../dist-zip/Nurse-v${version}.zip" . -x "*.DS_Store" "docs/*"`,
    { stdio: 'inherit', cwd: path.join(__dirname, '..') }
);

const zipFiles = [`Nurse-v${version}.zip`];
const shaLines = zipFiles.map((file) => {
    const filePath = path.join(distZipDir, file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    return `${hash}  ${file}`;
});

// Update static CSV evidence files dynamically with the new hashes and version
const nurseHash = shaLines[0].split('  ')[0];

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function formatCsvLine(columns) {
    return columns.map((col) => {
        if (col.includes(',') || col.includes('"') || col.includes('\n') || col.includes('\r')) {
            return `"${col.replace(/"/g, '""')}"`;
        }
        return col;
    }).join(',');
}

function updateCsvFile(filename, updateRowFn) {
    const filePath = path.join(__dirname, '..', filename);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) return;
    
    const headers = parseCsvLine(lines[0]);
    const updatedLines = [lines[0]];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) {
            updatedLines.push(lines[i]);
            continue;
        }
        const columns = parseCsvLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = columns[idx] || '';
        });
        
        updateRowFn(row);
        
        const updatedColumns = headers.map((h) => row[h]);
        updatedLines.push(formatCsvLine(updatedColumns));
    }
    
    fs.writeFileSync(filePath, updatedLines.join('\n'));
}

updateCsvFile('audit-export.csv', (row) => {
    row['Phiên bản'] = version;
    row['Build hash'] = nurseHash;
});

updateCsvFile('pilot-evidence.csv', (row) => {
    row['extension_version'] = version;
    if (row['package_file'] && row['package_file'].startsWith('Nurse-')) {
        row['package_file'] = `Nurse-v${version}.zip`;
        row['package_sha256'] = nurseHash;
        row['build_hash_recorded'] = nurseHash;
    }
});

updateCsvFile('rollout-inventory.csv', (row) => {
    row['extension_version'] = version;
    if (row['package_file'] && row['package_file'].startsWith('Nurse-')) {
        row['package_file'] = `Nurse-v${version}.zip`;
        row['package_sha256'] = nurseHash;
        row['build_hash_recorded'] = nurseHash;
    }
});


console.log('\n' + '='.repeat(50));
console.log(`\n✅ Hoàn tất! File zip nằm tại thư mục dist-zip/:`);
console.log(`   📁 Nurse-v${version}.zip\n`);
