#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SAFE_FIXTURE_MARKER = 'PHI_FIXTURE_DO_NOT_USE_REAL_DATA';
const SKIP_DIRS = new Set(['.git', '.gitnexus', 'node_modules', 'dist', 'dist-zip', '.agents', '.gemini', 'temp', 'screenshots', 'pilot-evidence', 'audit-export', 'rollout-inventory']);
const SCAN_EXTENSIONS = new Set(['.css', '.csv', '.html', '.js', '.json', '.md']);
const DOB_PATTERN = /\b(?:0?[1-9]|[12][0-9]|3[01])[/-](?:0?[1-9]|1[0-2])[/-](?:19|20)\d{2}\b/;
const DOB_CONTEXT_PATTERN = /\b(?:patient|benh\s*nhan|bệnh\s*nhân|bn|dob|ngay\s*sinh|ngày\s*sinh|nam\s*sinh|năm\s*sinh|ho\s*ten|họ\s*tên|khambenh|hosobenhan|hsba|ma\s*kham|mã\s*khám|ma\s*benh|mã\s*bệnh)\b/i;
const PATIENT_ID_PATTERN = /\b(?:khambenh|hosobenhan|hsba|ma\s*kham|mã\s*khám|ma\s*benh|mã\s*bệnh|patient|benh\s*nhan|bệnh\s*nhân|bn)\b[^\n]{0,80}\b\d{6,}\b/i;

function shouldScanFile(filePath) {
    return SCAN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walk(dir, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
        if (SKIP_DIRS.has(entry.name)) return;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, out);
            return;
        }
        if (entry.isFile() && shouldScanFile(fullPath)) out.push(fullPath);
    });
}

function scanText(text, filePath) {
    const findings = [];
    text.split(/\r?\n/).forEach(function (line, idx) {
        if (!line.trim() || line.includes(SAFE_FIXTURE_MARKER)) return;
        const reasons = [];
        if (DOB_PATTERN.test(line) && DOB_CONTEXT_PATTERN.test(line)) reasons.push('DOB-like date');
        if (PATIENT_ID_PATTERN.test(line)) reasons.push('patient-id-like value');
        if (reasons.length) {
            findings.push({
                file: filePath || '<text>',
                line: idx + 1,
                reason: reasons.join(', '),
                text: line.trim().slice(0, 180)
            });
        }
    });
    return findings;
}

function scanRepo(rootDir) {
    const files = [];
    const findings = [];
    walk(rootDir || ROOT, files);
    files.forEach(function (file) {
        const stat = fs.statSync(file);
        if (stat.size > 2 * 1024 * 1024) return;
        const text = fs.readFileSync(file, 'utf8');
        findings.push.apply(findings, scanText(text, path.relative(rootDir || ROOT, file)));
    });
    return findings;
}

function main() {
    const findings = scanRepo(ROOT);
    if (findings.length) {
        console.error('repo PHI gate failed: found possible patient identifiers');
        findings.slice(0, 50).forEach(function (finding) {
            console.error(finding.file + ':' + finding.line + ' [' + finding.reason + '] ' + finding.text);
        });
        if (findings.length > 50) console.error('... ' + (findings.length - 50) + ' more findings');
        process.exit(1);
    }
    console.log('repo PHI gate passed');
}

if (require.main === module) {
    main();
}

module.exports = {
    scanText: scanText,
    scanRepo: scanRepo,
    SAFE_FIXTURE_MARKER: SAFE_FIXTURE_MARKER
};
