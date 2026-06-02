#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_COLUMNS = [
    'department',
    'machine_ref',
    'windows_user_ref',
    'his_user_ref',
    'his_role',
    'extension_version',
    'package_file',
    'package_sha256',
    'build_hash_recorded',
    'release_policy_allowed',
    'release_policy_expires_at',
    'installed_by',
    'installed_at',
    'kill_switch_tested',
    'rollback_tested',
    'safe_mode_default',
    'debug_mode_enabled',
    'fast_path_enabled',
    'external_network_ok',
    'status',
    'notes'
];

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            row.push(cell);
            cell = '';
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && next === '\n') i++;
            row.push(cell);
            if (row.some(function (value) { return value.trim() !== ''; })) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += ch;
        }
    }

    row.push(cell);
    if (row.some(function (value) { return value.trim() !== ''; })) rows.push(row);
    return rows;
}

function csvToObjects(text) {
    const rows = parseCsv(text);
    if (rows.length === 0) return [];
    const headers = rows[0].map(function (header) { return header.trim(); });
    return rows.slice(1).map(function (row) {
        const obj = {};
        headers.forEach(function (header, idx) {
            obj[header] = (row[idx] || '').trim();
        });
        return obj;
    });
}

function truthy(value) {
    return /^(true|yes|y|1|pass|ok)$/i.test(String(value || '').trim());
}

function falsy(value) {
    return /^(false|no|n|0|none|)$/i.test(String(value || '').trim());
}

function loadPackageVersion(root) {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

function loadReleaseHashes(root) {
    const hashPath = path.join(root, 'dist-zip/sha256.txt');
    if (!fs.existsSync(hashPath)) return {};
    const out = {};
    const lines = fs.readFileSync(hashPath, 'utf8').split(/\r?\n/).filter(Boolean);
    lines.forEach(function (line) {
        const match = line.match(/^([a-f0-9]{64})\s+(.+\.zip)$/i);
        if (match) out[match[2]] = match[1].toLowerCase();
    });
    return out;
}

function hasPhiRisk(row) {
    const value = String(row.notes || '');
    if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(value)) return true;
    if (/\b\d{6,}\b/.test(value)) return true;
    if (/\b[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+){1,5}\b/.test(value)) return true;
    return false;
}

function isExpired(value, nowMs) {
    if (!value) return false;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return true;
    return parsed <= nowMs;
}

function verifyRows(rows, options) {
    options = options || {};
    const expectedVersion = options.version || '';
    const releaseHashes = options.releaseHashes || {};
    const nowMs = options.nowMs || Date.now();
    const minMachines = options.minMachines || 1;
    const errors = [];
    const machines = new Set();
    const departments = new Set();

    if (!rows.length) errors.push('CSV không có dòng inventory cài đặt.');

    const headers = rows.length ? Object.keys(rows[0]) : [];
    REQUIRED_COLUMNS.forEach(function (column) {
        if (!headers.includes(column)) errors.push('Thiếu cột bắt buộc: ' + column);
    });

    rows.forEach(function (row, idx) {
        const line = idx + 2;
        const packageFile = row.package_file || '';
        const packageHash = String(row.package_sha256 || '').toLowerCase();
        const buildHash = String(row.build_hash_recorded || '').toLowerCase();
        const status = String(row.status || '').toUpperCase();

        if (!row.department) errors.push('Dòng ' + line + ': thiếu department.');
        else departments.add(row.department);
        if (!row.machine_ref) errors.push('Dòng ' + line + ': thiếu machine_ref.');
        else machines.add(row.machine_ref);
        if (!row.windows_user_ref) errors.push('Dòng ' + line + ': thiếu windows_user_ref.');
        if (!row.his_user_ref) errors.push('Dòng ' + line + ': thiếu his_user_ref.');
        if (!row.installed_by) errors.push('Dòng ' + line + ': thiếu installed_by.');
        if (!row.installed_at || Number.isNaN(Date.parse(row.installed_at))) errors.push('Dòng ' + line + ': installed_at không hợp lệ.');
        if (expectedVersion && row.extension_version !== expectedVersion) errors.push('Dòng ' + line + ': version không khớp package.json.');

        if (!releaseHashes[packageFile]) errors.push('Dòng ' + line + ': package_file không nằm trong sha256.txt.');
        if (releaseHashes[packageFile] && releaseHashes[packageFile] !== packageHash) errors.push('Dòng ' + line + ': package_sha256 không khớp sha256.txt.');
        if (packageHash && buildHash !== packageHash) errors.push('Dòng ' + line + ': build_hash_recorded phải khớp package_sha256.');

        if (!truthy(row.release_policy_allowed)) errors.push('Dòng ' + line + ': release policy chưa allow version/hash này.');
        if (isExpired(row.release_policy_expires_at, nowMs)) errors.push('Dòng ' + line + ': release policy đã hết hạn hoặc ngày không hợp lệ.');
        if (!truthy(row.kill_switch_tested)) errors.push('Dòng ' + line + ': chưa test kill switch trên máy này.');
        if (!truthy(row.rollback_tested)) errors.push('Dòng ' + line + ': chưa test rollback trên máy này.');
        if (!truthy(row.safe_mode_default)) errors.push('Dòng ' + line + ': Safe Mode mặc định/chính sách khoa chưa được xác nhận.');
        if (!falsy(row.debug_mode_enabled)) errors.push('Dòng ' + line + ': Debug Mode phải tắt khi rollout.');
        if (!falsy(row.fast_path_enabled)) errors.push('Dòng ' + line + ': fast path Vật tư phải tắt mặc định khi rollout toàn viện.');
        if (!truthy(row.external_network_ok)) errors.push('Dòng ' + line + ': chưa xác nhận không có request ngoài *.vncare.vn.');
        if (status !== 'ACTIVE') errors.push('Dòng ' + line + ': status phải là ACTIVE trước rollout toàn viện.');
        if (hasPhiRisk(row)) errors.push('Dòng ' + line + ': notes có dấu hiệu PHI.');
    });

    if (machines.size < minMachines) {
        errors.push('Thiếu số máy inventory: ' + machines.size + '/' + minMachines + '.');
    }

    return {
        ok: errors.length === 0,
        errors: errors,
        machines: machines.size,
        departments: departments.size
    };
}

function main() {
    const root = path.join(__dirname, '..');
    const fileArg = process.argv[2] || 'rollout-inventory.csv';
    const evidencePath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(evidencePath)) {
        console.error('Không tìm thấy file rollout inventory: ' + evidencePath);
        console.error('Tạo file theo mẫu src/docs/rollout-inventory-template.csv rồi chạy lại.');
        process.exit(2);
    }

    const rows = csvToObjects(fs.readFileSync(evidencePath, 'utf8'));
    const result = verifyRows(rows, {
        version: loadPackageVersion(root),
        releaseHashes: loadReleaseHashes(root)
    });

    if (!result.ok) {
        console.error('rollout gate failed:');
        result.errors.forEach(function (error) { console.error('- ' + error); });
        process.exit(1);
    }

    console.log('rollout gate passed');
    console.log('machines:', result.machines);
    console.log('departments:', result.departments);
}

if (require.main === module) {
    main();
}

module.exports = {
    parseCsv: parseCsv,
    csvToObjects: csvToObjects,
    verifyRows: verifyRows,
    REQUIRED_COLUMNS: REQUIRED_COLUMNS
};
