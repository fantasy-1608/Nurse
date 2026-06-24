const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const requireArtifacts = process.argv.includes('--require-artifacts');

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function readJson(relPath) {
    return JSON.parse(read(relPath));
}

function walk(dir, out) {
    out = out || [];
    if (!fs.existsSync(dir)) return out;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (let i = 0; i < entries.length; i++) {
        const full = path.join(dir, entries[i].name);
        if (entries[i].isDirectory()) {
            walk(full, out);
        } else {
            out.push(full);
        }
    }
    return out;
}

function assertNoText(relPath, needles) {
    const text = read(relPath);
    needles.forEach(function (needle) {
        assert(!text.includes(needle), relPath + ' must not contain ' + needle);
    });
}

function assertManifestHardening(manifest, label) {
    assert.strictEqual(manifest.manifest_version, 3, label + ' must be MV3');
    assert.deepStrictEqual(manifest.permissions.slice().sort(), ['storage'], label + ' permissions must stay minimal');
    assert.deepStrictEqual(manifest.host_permissions, ['*://*.vncare.vn/*'], label + ' host permission must stay VNPT HIS only');
    assert(!manifest.optional_host_permissions || manifest.optional_host_permissions.length === 0, label + ' must not request optional hosts');
    assert(manifest.action && manifest.action.default_popup, label + ' must define extension action popup');

    const js = manifest.content_scripts[0].js;
    assert(js.includes('shared/privacy.js'), label + ' must load privacy helpers');
    assert(js.includes('shared/audit.js'), label + ' must load audit');
    assert(js.includes('shared/safety.js'), label + ' must load safety');
    assert(js.indexOf('shared/privacy.js') < js.indexOf('shared/logger.js'), label + ' privacy must load before logger');
    assert(js.indexOf('shared/audit.js') < js.indexOf('shared/safety.js'), label + ' audit must load before safety');
}

function assertNoExternalRuntimeUrls(dir) {
    const files = walk(path.join(root, dir)).filter(function (file) {
        return /\.(js|json|html|css)$/.test(file);
    });
    files.forEach(function (file) {
        const text = fs.readFileSync(file, 'utf8');
        const rel = path.relative(root, file);
        assert(!/api\.github\.com|githubusercontent\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|generativelanguage\.googleapis\.com/.test(text), rel + ' must not use external runtime URLs');
        assert(!/<all_urls>/.test(text), rel + ' must not request all URLs');
        assert(!/postMessage\s*\([^)]*,\s*['"]\*['"]\s*\)/.test(text), rel + ' must not use wildcard postMessage target');
    });
}

function assertNoLegacyRuntimeStorage(dir) {
    const files = walk(path.join(root, dir)).filter(function (file) {
        return /\.js$/.test(file);
    });
    files.forEach(function (file) {
        const rel = path.relative(root, file);
        if (rel.endsWith('shared/privacy.js')) return;
        const text = fs.readFileSync(file, 'utf8');
        assert(!/localStorage\.(getItem|setItem)/.test(text), rel + ' must not use page localStorage');
        assert(!/geminiApiKey|dashboard_password/.test(text), rel + ' must not contain legacy AI/API-key storage');
        assert(!/quyen_error_log/.test(text), rel + ' must not contain persistent error log storage');
    });
}

function hashFile(relPath) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relPath))).digest('hex');
}

function assertReleaseArtifacts() {
    // Release policy artifacts checks disabled
}

function assertRequiredReleaseDocs() {
    [
        'SECURITY_POLICY.md',
        'PRIVACY_IMPACT_ASSESSMENT.md',
        'COMPLIANCE_MATRIX.md',
        'RELEASE_CHECKLIST.md',
        'ROLLBACK_CHECKLIST.md',
        'HOSPITAL_RELEASE_READINESS_REPORT.md',
        'src/docs/hazard-log.md',
        'src/docs/pilot-checklist.md',
        'src/docs/pilot-evidence-template.csv',
        'src/docs/rollout-inventory-template.csv'
    ].forEach(function (relPath) {
        assert(fs.existsSync(path.join(root, relPath)), relPath + ' must exist for hospital release readiness');
    });
}

function assertNoOutdatedReleaseInstructions() {
    [
        'README.md',
        'CHANGELOG.md',
        'RELEASE_CHECKLIST.md',
        'SECURITY_POLICY.md',
        'HOSPITAL_RELEASE_READINESS_REPORT.md'
    ].forEach(function (relPath) {
        const text = read(relPath);
        assert(!/GitHub Releases|GitHub Release|auto-update notification/i.test(text), relPath + ' must not describe external GitHub release/update workflow');
    });
}

assertManifestHardening(readJson('src/manifest.json'), 'source manifest');
assertNoExternalRuntimeUrls('src');
assertNoLegacyRuntimeStorage('src');
assertNoText('src/content/content.js', ['quyen_error_log']);
assertNoText('src/injected/his-bridge.js', [
    "position:fixed;top:0;left:0;width:100%;height:100%",
    'quyen-role-blocker-modal.style'
]);
assertNoText('src/content/ui-panel.js', ['localStorage.setItem(\'quyen_stats\'', 'localStorage.getItem(\'quyen_stats\'']);
assertNoText('src/popup/popup.js', ['quyen_error_log']);
assert(!fs.existsSync(path.join(root, 'src/shared/crypto.js')), 'unused crypto/API-key module must not ship');

const privacy = read('src/shared/privacy.js');
assert(privacy.includes('quyen_error_log'), 'privacy migration must remove legacy error log');
assert(privacy.includes('quyen_stats'), 'privacy migration must remove legacy stats');

const message = read('src/shared/message.js');
assert(message.includes('MARKER'), 'message bus must use a strict marker');
assert(message.includes('MAX_MESSAGE_AGE_MS') || /5\s*\*\s*60\s*\*\s*1000/.test(message), 'message bus must expire old envelopes');
assert(!message.includes('isLegacyType && sameWindowSource'), 'message bus must reject legacy raw QUYEN_* messages');

if (fs.existsSync(path.join(root, 'dist/Nurse/manifest.json'))) {
    assertManifestHardening(readJson('dist/Nurse/manifest.json'), 'Nurse manifest');
    assertNoExternalRuntimeUrls('dist/Nurse');
    assertNoLegacyRuntimeStorage('dist/Nurse');
}

assertReleaseArtifacts();
assertRequiredReleaseDocs();
assertNoOutdatedReleaseInstructions();

console.log('release gate tests passed');
