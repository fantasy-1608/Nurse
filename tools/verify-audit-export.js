#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_HEADERS = [
    'Thời gian',
    'Hành động',
    'Module',
    'PatientRef',
    'ItemRef',
    'RequestId',
    'Phiên bản',
    'Build hash',
    'Kết quả'
];

const ALLOWED_MODULES = { infusion: true, caresheet: true, vattu: true, '': true };
const ALLOWED_RESULTS = { OK: true, PENDING: true, BLOCKED: true, ERROR: true, SAFE_MODE: true, KILL_SWITCH: true, AUDIT_UNAVAILABLE: true, '': true };

function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
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
    if (!rows.length) return { headers: [], rows: [] };
    const headers = rows[0].map(function (header) { return header.trim(); });
    return {
        headers: headers,
        rows: rows.slice(1).map(function (row) {
            const obj = {};
            headers.forEach(function (header, idx) {
                obj[header] = (row[idx] || '').trim();
            });
            return obj;
        })
    };
}

function hasPhiRisk(value) {
    const text = String(value || '');
    if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(text)) return true;
    if (/\b\d{6,}\b/.test(text)) return true;
    if (/\b[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+){1,5}\b/.test(text)) return true;
    if (/nguy[eê]n|tr[aầ]n|l[eê]|ph[aạ]m|ho[aà]ng|hu[yỳ]nh|v[oõ]|b[aá]c s[iĩ]|morphin|paracetamol/i.test(text)) return true;
    return false;
}

function verifyAuditExport(text, options) {
    options = options || {};
    const parsed = csvToObjects(text);
    const errors = [];
    const minRows = options.minRows || 1;
    const expectedVersion = options.version || '';
    const expectedHashes = options.releaseHashes || {};

    REQUIRED_HEADERS.forEach(function (header) {
        if (!parsed.headers.includes(header)) errors.push('Thiếu cột audit bắt buộc: ' + header);
    });

    if (parsed.rows.length < minRows) errors.push('Audit export thiếu số dòng: ' + parsed.rows.length + '/' + minRows + '.');

    parsed.rows.forEach(function (row, idx) {
        const line = idx + 2;
        const moduleName = String(row.Module || '').toLowerCase();
        const result = String(row['Kết quả'] || '').toUpperCase();
        const patientRef = row.PatientRef || '';
        const itemRef = row.ItemRef || '';
        const version = row['Phiên bản'] || '';
        const buildHash = String(row['Build hash'] || '').toLowerCase();

        if (!row['Thời gian'] || Number.isNaN(Date.parse(row['Thời gian']))) errors.push('Dòng ' + line + ': thời gian audit không hợp lệ.');
        if (!row['Hành động']) errors.push('Dòng ' + line + ': thiếu hành động audit.');
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_MODULES, moduleName)) errors.push('Dòng ' + line + ': module audit không hợp lệ.');
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_RESULTS, result)) errors.push('Dòng ' + line + ': kết quả audit không hợp lệ.');
        if (patientRef && !/^pt_[a-f0-9]{8,64}$/i.test(patientRef)) errors.push('Dòng ' + line + ': PatientRef phải là mã giả danh.');
        if (itemRef && !/^it_[a-f0-9]{8,64}$/i.test(itemRef)) errors.push('Dòng ' + line + ': ItemRef phải là mã giả danh.');
        if (expectedVersion && version && version !== expectedVersion) errors.push('Dòng ' + line + ': phiên bản audit không khớp package.json.');
        if (buildHash && Object.keys(expectedHashes).length && !Object.values(expectedHashes).includes(buildHash)) {
            errors.push('Dòng ' + line + ': build hash audit không khớp sha256.txt.');
        }

        Object.keys(row).forEach(function (key) {
            if (hasPhiRisk(row[key])) errors.push('Dòng ' + line + ': cột ' + key + ' có dấu hiệu PHI.');
        });
    });

    return { ok: errors.length === 0, errors: errors, rows: parsed.rows.length };
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

function main() {
    const root = path.join(__dirname, '..');
    const fileArg = process.argv[2] || 'audit-export.csv';
    const auditPath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(auditPath)) {
        console.error('Không tìm thấy file audit export: ' + auditPath);
        console.error('Export audit từ popup thành audit-export.csv rồi chạy lại.');
        process.exit(2);
    }

    const result = verifyAuditExport(fs.readFileSync(auditPath, 'utf8'), {
        version: loadPackageVersion(root),
        releaseHashes: loadReleaseHashes(root)
    });

    if (!result.ok) {
        console.error('audit gate failed:');
        result.errors.forEach(function (error) { console.error('- ' + error); });
        process.exit(1);
    }

    console.log('audit gate passed');
    console.log('rows:', result.rows);
}

if (require.main === module) {
    main();
}

module.exports = {
    parseCsv: parseCsv,
    csvToObjects: csvToObjects,
    verifyAuditExport: verifyAuditExport,
    REQUIRED_HEADERS: REQUIRED_HEADERS
};
