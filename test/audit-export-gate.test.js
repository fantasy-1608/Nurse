const assert = require('assert');
const verifier = require('../tools/verify-audit-export');

const hash = 'c'.repeat(64);
const goodCsv = [
    'Thời gian,Hành động,Module,PatientRef,ItemRef,RequestId,Phiên bản,Build hash,Kết quả,Lý do,Số mục',
    '2026-05-31T08:00:00.000Z,INFUSION_FILL_RESULT,infusion,pt_ab12cd34,it_ab12cd34,req_001,1.3.4,' + hash + ',OK,,1',
    '2026-05-31T08:01:00.000Z,VATTU_FILL_RESULT,vattu,pt_1111aaaa,it_2222bbbb,req_002,1.3.4,' + hash + ',BLOCKED,SAFE_MODE,0'
].join('\n');

let result = verifier.verifyAuditExport(goodCsv, {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash }
});

assert.strictEqual(result.ok, true, result.errors.join('\n'));

const badCsv = [
    'Thời gian,Hành động,Module,PatientRef,ItemRef,RequestId,Phiên bản,Build hash,Kết quả,Lý do,Số mục',
    '2026-05-31T08:00:00.000Z,INFUSION_FILL_RESULT,infusion,PHI_FIXTURE_DO_NOT_USE_REAL_DATA,it_ab12cd34,req_001,1.3.4,' + hash + ',OK,PHI_FIXTURE_DO_NOT_USE_REAL_DATA 01/01/1990,1'
].join('\n');

result = verifier.verifyAuditExport(badCsv, {
    version: '1.3.4',
    releaseHashes: { 'Nurse-v1.3.4.zip': hash }
});

assert.strictEqual(result.ok, false, 'PHI-like audit export must fail');
assert(result.errors.some(function (error) { return error.includes('PHI') || error.includes('PatientRef'); }), 'audit error must be explicit');

console.log('audit export gate tests passed');
