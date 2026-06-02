#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dirs = ['src', 'test', 'build', 'tools'];

function walk(dir, out) {
    out = out || [];
    if (!fs.existsSync(dir)) return out;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else if (/\.js$/i.test(entry.name)) {
            out.push(full);
        }
    });
    return out;
}

function main() {
    const files = [];
    dirs.forEach(function (dir) {
        walk(path.join(root, dir), files);
    });

    const failures = [];
    files.forEach(function (file) {
        const result = spawnSync(process.execPath, ['--check', file], {
            cwd: root,
            encoding: 'utf8'
        });
        if (result.status !== 0) {
            failures.push({
                file: path.relative(root, file),
                output: (result.stderr || result.stdout || '').trim()
            });
        }
    });

    if (failures.length) {
        console.error('js syntax gate failed:');
        failures.forEach(function (failure) {
            console.error('- ' + failure.file);
            if (failure.output) console.error(failure.output);
        });
        process.exit(1);
    }

    console.log('js syntax gate passed');
    console.log('files:', files.length);
}

if (require.main === module) {
    main();
}

module.exports = {
    walk: walk
};
