#!/usr/bin/env node

const { spawnSync } = require('child_process');

const steps = [
    ['syntax gate', ['npm', ['run', 'syntax:gate']]],
    ['dependency audit', ['pnpm', ['audit', '--prod']]],
    ['repo PHI gate', ['npm', ['run', 'repo:phi:gate']]],
    ['release gate', ['npm', ['run', 'release:gate']]],
    ['audit gate', ['npm', ['run', 'audit:gate']]],
    ['pilot gate', ['npm', ['run', 'pilot:gate']]],
    ['rollout gate', ['npm', ['run', 'rollout:gate']]]
];

let failed = false;

function main() {
    steps.forEach(function (step) {
        const label = step[0];
        const cmd = step[1][0];
        const args = step[1][1];
        console.log('\n== ' + label + ' ==');
        const result = spawnSync(cmd, args, { stdio: 'inherit' });
        if (result.status !== 0) failed = true;
    });

    if (failed) {
        console.error('\nhospital release gate failed');
        process.exit(1);
    }

    console.log('\nhospital release gate passed');
}

if (require.main === module) {
    main();
}

module.exports = {
    steps: steps,
    main: main
};
