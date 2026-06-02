const assert = require('assert');
const verifier = require('../tools/verify-rollout-inventory');

const hash = 'b'.repeat(64);
const base = {
    department: 'KHOA_PILOT',
    machine_ref: 'MAY_001',
    windows_user_ref: 'win_user_001',
    his_user_ref: 'his_user_001',
    his_role: 'dieu_duong',
    extension_version: '1.3.4',
    package_file: 'Nurse-v1.3.4.zip',
    package_sha256: hash,
    build_hash_recorded: hash,
    release_policy_allowed: 'true',
    release_policy_expires_at: '2099-12-31',
    installed_by: 'it_001',
    installed_at: '2026-05-31T08:00:00+07:00',
    kill_switch_tested: 'true',
    rollback_tested: 'true',
    safe_mode_default: 'true',
    debug_mode_enabled: 'false',
    fast_path_enabled: 'false',
    external_network_ok: 'true',
    status: 'ACTIVE',
    notes: 'khong co PHI'
};

let result = verifier.verifyRows([base], {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    nowMs: Date.parse('2026-05-31T00:00:00+07:00')
});

assert.strictEqual(result.ok, true, result.errors.join('\n'));

result = verifier.verifyRows([Object.assign({}, base, { debug_mode_enabled: 'true' })], {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    nowMs: Date.parse('2026-05-31T00:00:00+07:00')
});
assert.strictEqual(result.ok, false, 'debug mode enabled must fail rollout gate');
assert(result.errors.some(function (error) { return error.includes('Debug Mode'); }), 'debug error must be explicit');

result = verifier.verifyRows([Object.assign({}, base, { notes: 'PHI_FIXTURE_DO_NOT_USE_REAL_DATA 01/01/1990' })], {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash },
    nowMs: Date.parse('2026-05-31T00:00:00+07:00')
});
assert.strictEqual(result.ok, false, 'PHI-like notes must fail rollout gate');
assert(result.errors.some(function (error) { return error.includes('PHI'); }), 'PHI error must be explicit');

console.log('rollout inventory gate tests passed');
