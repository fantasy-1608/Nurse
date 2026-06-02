#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_COLUMNS = [
    'module',
    'scenario',
    'case_ref',
    'department',
    'machine_ref',
    'his_role',
    'extension_version',
    'package_file',
    'package_sha256',
    'build_hash_recorded',
    'result',
    'severity',
    'audit_attempt',
    'audit_result',
    'patient_mismatch_blocked',
    'safe_mode_checked',
    'kill_switch_checked',
    'rollback_checked',
    'external_network_ok',
    'phi_in_audit',
    'fast_path_enabled',
    'notes'
];

const MODULES = ['infusion', 'caresheet', 'vattu'];
const REQUIRED_SCENARIOS = [
    'normal_fill',
    'patient_switch',
    'hidden_old_form',
    'slow_network',
    'form_not_loaded',
    'non_nurse_user',
    'safe_mode',
    'kill_switch',
    'rollback',
    'external_network'
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
    const textFields = ['case_ref', 'notes'];
    return textFields.some(function (field) {
        const value = String(row[field] || '');
        if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/.test(value)) return true;
        if (/\b\d{6,}\b/.test(value)) return true;
        if (/\b[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][A-ZÀ-Ỹa-zà-ỹ]+){1,5}\b/.test(value)) return true;
        return false;
    });
}

function verifyRows(rows, options) {
    options = options || {};
    const expectedVersion = options.version || '';
    const releaseHashes = options.releaseHashes || {};
    const minPerModule = options.minPerModule || 20;
    const errors = [];
    const counts = { infusion: 0, caresheet: 0, vattu: 0 };
    const scenarios = {};
    const moduleScenarios = {};

    REQUIRED_SCENARIOS.forEach(function (scenario) { scenarios[scenario] = 0; });
    MODULES.forEach(function (moduleName) {
        moduleScenarios[moduleName] = {};
        REQUIRED_SCENARIOS.forEach(function (scenario) { moduleScenarios[moduleName][scenario] = 0; });
    });

    if (!rows.length) errors.push('CSV không có dòng dữ liệu pilot.');

    const headers = rows.length ? Object.keys(rows[0]) : [];
    REQUIRED_COLUMNS.forEach(function (column) {
        if (!headers.includes(column)) errors.push('Thiếu cột bắt buộc: ' + column);
    });

    rows.forEach(function (row, idx) {
        const line = idx + 2;
        const moduleName = String(row.module || '').toLowerCase();
        const scenario = String(row.scenario || '').toLowerCase();
        const result = String(row.result || '').toUpperCase();
        const severity = String(row.severity || '').toUpperCase();
        const packageFile = row.package_file || '';
        const packageHash = String(row.package_sha256 || '').toLowerCase();
        const buildHash = String(row.build_hash_recorded || '').toLowerCase();

        if (!MODULES.includes(moduleName)) errors.push('Dòng ' + line + ': module không hợp lệ.');
        else {
            counts[moduleName]++;
            if (Object.prototype.hasOwnProperty.call(moduleScenarios[moduleName], scenario)) {
                moduleScenarios[moduleName][scenario]++;
            }
        }

        if (Object.prototype.hasOwnProperty.call(scenarios, scenario)) scenarios[scenario]++;
        if (!/^(PASS|BLOCKED)$/.test(result)) errors.push('Dòng ' + line + ': result phải là PASS hoặc BLOCKED.');
        if (severity === 'P0' || severity === 'P1') errors.push('Dòng ' + line + ': còn lỗi ' + severity + ', không được release.');
        if (expectedVersion && row.extension_version !== expectedVersion) errors.push('Dòng ' + line + ': version không khớp package.json.');

        if (!releaseHashes[packageFile]) errors.push('Dòng ' + line + ': package_file không nằm trong sha256.txt.');
        if (releaseHashes[packageFile] && releaseHashes[packageFile] !== packageHash) errors.push('Dòng ' + line + ': package_sha256 không khớp sha256.txt.');
        if (packageHash && buildHash !== packageHash) errors.push('Dòng ' + line + ': build_hash_recorded phải khớp package_sha256.');

        if (!truthy(row.audit_attempt)) errors.push('Dòng ' + line + ': thiếu audit_attempt.');
        if (result === 'PASS' && !truthy(row.audit_result)) errors.push('Dòng ' + line + ': thao tác PASS phải có audit_result.');
        if ((scenario === 'patient_switch' || scenario === 'hidden_old_form') && !truthy(row.patient_mismatch_blocked)) {
            errors.push('Dòng ' + line + ': scenario đổi BN/form cũ phải chứng minh mismatch bị chặn.');
        }
        if (scenario === 'safe_mode' && !truthy(row.safe_mode_checked)) errors.push('Dòng ' + line + ': safe_mode chưa được kiểm.');
        if (scenario === 'kill_switch' && !truthy(row.kill_switch_checked)) errors.push('Dòng ' + line + ': kill switch chưa được kiểm.');
        if (scenario === 'rollback' && !truthy(row.rollback_checked)) errors.push('Dòng ' + line + ': rollback chưa được kiểm.');
        if (scenario === 'non_nurse_user') {
            if (/^(dieu_duong|nurse)$/i.test(String(row.his_role || '').trim())) {
                errors.push('Dòng ' + line + ': non_nurse_user phải dùng vai trò HIS không phải điều dưỡng.');
            }
            if (result !== 'BLOCKED') errors.push('Dòng ' + line + ': non_nurse_user phải bị chặn.');
        }
        if (!truthy(row.external_network_ok)) errors.push('Dòng ' + line + ': chưa xác nhận không có request ngoài *.vncare.vn.');
        if (!falsy(row.phi_in_audit)) errors.push('Dòng ' + line + ': audit/export còn PHI.');
        if (moduleName === 'vattu' && !falsy(row.fast_path_enabled)) errors.push('Dòng ' + line + ': fast path Vật tư phải tắt trong pilot toàn viện mặc định.');
        if (hasPhiRisk(row)) errors.push('Dòng ' + line + ': case_ref/notes có dấu hiệu PHI.');
    });

    MODULES.forEach(function (moduleName) {
        if (counts[moduleName] < minPerModule) {
            errors.push('Thiếu số ca module ' + moduleName + ': ' + counts[moduleName] + '/' + minPerModule + '.');
        }
    });
    REQUIRED_SCENARIOS.forEach(function (scenario) {
        if (!scenarios[scenario]) errors.push('Thiếu scenario bắt buộc: ' + scenario + '.');
    });
    MODULES.forEach(function (moduleName) {
        REQUIRED_SCENARIOS.forEach(function (scenario) {
            if (!moduleScenarios[moduleName][scenario]) {
                errors.push('Module ' + moduleName + ' thiếu scenario bắt buộc: ' + scenario + '.');
            }
        });
    });

    return { ok: errors.length === 0, errors: errors, counts: counts, scenarios: scenarios, moduleScenarios: moduleScenarios };
}

function main() {
    const root = path.join(__dirname, '..');
    const fileArg = process.argv[2] || 'pilot-evidence.csv';
    const evidencePath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(evidencePath)) {
        console.error('Không tìm thấy file pilot evidence: ' + evidencePath);
        console.error('Tạo file theo mẫu src/docs/pilot-evidence-template.csv rồi chạy lại.');
        process.exit(2);
    }

    const rows = csvToObjects(fs.readFileSync(evidencePath, 'utf8'));
    const result = verifyRows(rows, {
        version: loadPackageVersion(root),
        releaseHashes: loadReleaseHashes(root)
    });

    if (!result.ok) {
        console.error('pilot gate failed:');
        result.errors.forEach(function (error) { console.error('- ' + error); });
        process.exit(1);
    }

    console.log('pilot gate passed');
    console.log('counts:', JSON.stringify(result.counts));
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
