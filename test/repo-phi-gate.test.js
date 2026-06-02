const assert = require('assert');
const phiGate = require('../tools/check-repo-phi');

let findings = phiGate.scanText('notes: khong co PHI', 'fixture.txt');
assert.strictEqual(findings.length, 0, 'safe text must pass');

findings = phiGate.scanText('patient: Nguyen Van A ' + ['01', '01', '1990'].join('/'), 'fixture.txt');
assert.strictEqual(findings.length, 1, 'DOB-like patient fixture must fail without explicit marker');
assert(findings[0].reason.includes('DOB'), 'finding must explain DOB-like date');

findings = phiGate.scanText('### v1.3.3 (26/04/2026) release note', 'fixture.txt');
assert.strictEqual(findings.length, 0, 'release dates must not be treated as DOB without patient context');

findings = phiGate.scanText('patient: PHI_FIXTURE_DO_NOT_USE_REAL_DATA ' + ['01', '01', '1990'].join('/'), 'fixture.txt');
assert.strictEqual(findings.length, 0, 'explicit PHI fixture marker must pass');

console.log('repo PHI gate tests passed');
