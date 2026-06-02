const assert = require('assert');
const hospitalGate = require('../tools/verify-hospital-release');

const labels = hospitalGate.steps.map(function (step) { return step[0]; });
const commands = hospitalGate.steps.map(function (step) {
    return [step[1][0]].concat(step[1][1]).join(' ');
});

[
    'syntax gate',
    'dependency audit',
    'repo PHI gate',
    'release gate',
    'audit gate',
    'pilot gate',
    'rollout gate'
].forEach(function (label) {
    assert(labels.includes(label), 'hospital gate must include ' + label);
});

assert(commands.includes('npm run syntax:gate'), 'hospital gate must run syntax:gate');
assert(commands.includes('pnpm audit --prod'), 'hospital gate must run production dependency audit');
assert(commands.includes('npm run repo:phi:gate'), 'hospital gate must scan repository for PHI-like fixtures');
assert(commands.includes('npm run release:gate'), 'hospital gate must run release gate');
assert(commands.includes('npm run audit:gate'), 'hospital gate must require real audit export');
assert(commands.includes('npm run pilot:gate'), 'hospital gate must require real pilot evidence');
assert(commands.includes('npm run rollout:gate'), 'hospital gate must require real rollout inventory');

console.log('hospital release gate tests passed');
