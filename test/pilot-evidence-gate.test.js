const assert = require('assert');
const fs = require('fs');
const path = require('path');
const verifier = require('../tools/verify-pilot-evidence');

const hash = 'a'.repeat(64);
const base = {
    department: 'KHOA_PILOT',
    machine_ref: 'MAY_PILOT_01',
    his_role: 'dieu_duong',
    extension_version: '1.3.4',
    package_file: 'Nurse-v1.3.4.zip',
    package_sha256: hash,
    build_hash_recorded: hash,
    result: 'PASS',
    severity: 'P2',
    audit_attempt: 'true',
    audit_result: 'true',
    patient_mismatch_blocked: 'false',
    safe_mode_checked: 'false',
    kill_switch_checked: 'false',
    rollback_checked: 'false',
    external_network_ok: 'true',
    phi_in_audit: 'false',
    fast_path_enabled: 'false',
    notes: 'khong co PHI'
};

function row(moduleName, idx, scenario, patch) {
    return Object.assign({}, base, {
        module: moduleName,
        scenario: scenario || 'normal_fill',
        case_ref: moduleName + '_case_' + String(idx).padStart(2, '0')
    }, patch || {});
}

const rows = [];
['infusion', 'caresheet', 'vattu'].forEach(function (moduleName) {
    for (let i = 1; i <= 20; i++) rows.push(row(moduleName, i));
});

[
    ['normal_fill', {}],
    ['patient_switch', { result: 'BLOCKED', patient_mismatch_blocked: 'true', audit_result: 'false' }],
    ['hidden_old_form', { result: 'BLOCKED', patient_mismatch_blocked: 'true', audit_result: 'false' }],
    ['slow_network', {}],
    ['form_not_loaded', { result: 'BLOCKED', audit_result: 'false' }],
    ['non_nurse_user', { his_role: 'bac_si', result: 'BLOCKED', audit_result: 'false' }],
    ['safe_mode', { result: 'BLOCKED', audit_result: 'false', safe_mode_checked: 'true' }],
    ['kill_switch', { result: 'BLOCKED', audit_result: 'false', kill_switch_checked: 'true' }],
    ['rollback', { rollback_checked: 'true' }],
    ['external_network', {}]
].forEach(function (scenarioDef, scenarioIdx) {
    ['infusion', 'caresheet', 'vattu'].forEach(function (moduleName) {
        const found = rows.find(function (item) {
            return item.module === moduleName && item.case_ref === moduleName + '_case_' + String(scenarioIdx + 1).padStart(2, '0');
        });
        Object.assign(found, { scenario: scenarioDef[0] }, scenarioDef[1]);
    });
});

let result = verifier.verifyRows(rows, {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    minPerModule: 20
});

assert.strictEqual(result.ok, true, result.errors.join('\n'));

const badRows = rows.slice();
badRows[0] = Object.assign({}, badRows[0], { notes: 'PHI_FIXTURE_DO_NOT_USE_REAL_DATA 01/01/1990' });
result = verifier.verifyRows(badRows, {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    minPerModule: 20
});

assert.strictEqual(result.ok, false, 'PHI-like notes must fail pilot gate');
assert(result.errors.some(function (error) { return error.includes('PHI'); }), 'PHI error must be explicit');

const missingModuleScenarioRows = rows.filter(function (item) {
    return !(item.module === 'vattu' && item.scenario === 'rollback');
});
result = verifier.verifyRows(missingModuleScenarioRows, {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    minPerModule: 10
});

assert.strictEqual(result.ok, false, 'missing per-module required scenario must fail pilot gate');
assert(result.errors.some(function (error) {
    return error.includes('Module vattu thiếu scenario bắt buộc: rollback');
}), 'missing per-module scenario error must be explicit');

const templateRows = verifier.csvToObjects(fs.readFileSync(path.join(__dirname, '../src/docs/pilot-evidence-template.csv'), 'utf8'));
const templateCoverage = verifier.verifyRows(templateRows, {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    minPerModule: 10
});

assert(!templateCoverage.errors.some(function (error) {
    return error.includes('thiếu scenario bắt buộc');
}), 'pilot template must show every required scenario for every module');

console.log('pilot evidence gate tests passed');
