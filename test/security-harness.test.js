const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const root = path.join(__dirname, '..');

function makeChromeMock(store, manifestVersion, manifestExtra) {
    const runtimeMessages = [];
    const installed = [];
    const startup = [];
    const storageChanged = [];
    const badge = { text: '', color: '' };

    function getValue(keys) {
        if (Array.isArray(keys)) {
            const out = {};
            keys.forEach((k) => { out[k] = store[k]; });
            return out;
        }
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (keys && typeof keys === 'object') {
            const out = {};
            Object.keys(keys).forEach((k) => { out[k] = store[k] === undefined ? keys[k] : store[k]; });
            return out;
        }
        return Object.assign({}, store);
    }

    return {
        runtimeMessages,
        installed,
        startup,
        storageChanged,
        badge,
        chrome: {
            runtime: {
                lastError: null,
                getManifest: () => Object.assign({ version: manifestVersion || '1.3.4', name: 'Nurse Test' }, manifestExtra || {}),
                onInstalled: { addListener: (fn) => installed.push(fn) },
                onStartup: { addListener: (fn) => startup.push(fn) },
                onMessage: { addListener: (fn) => runtimeMessages.push(fn) }
            },
            storage: {
                local: {
                    get: (keys, cb) => cb(getValue(keys)),
                    set: (obj, cb) => {
                        Object.assign(store, obj);
                        if (cb) cb();
                    },
                    remove: (keys, cb) => {
                        (Array.isArray(keys) ? keys : [keys]).forEach((k) => { delete store[k]; });
                        if (cb) cb();
                    }
                },
                onChanged: {
                    addListener: (fn) => storageChanged.push(fn)
                }
            },
            action: {
                setBadgeText: ({ text }) => { badge.text = text; },
                setBadgeBackgroundColor: ({ color }) => { badge.color = color; }
            }
        }
    };
}

function makeDomContext(store) {
    const chromeMock = makeChromeMock(store);
    const posted = [];
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Date,
        Math,
        location: { origin: 'https://his.vncare.vn', protocol: 'https:', host: 'his.vncare.vn' },
        localStorage: {
            removeItem: (k) => { delete store[`local:${k}`]; },
            getItem: (k) => store[`local:${k}`] || null,
            setItem: (k, v) => { store[`local:${k}`] = String(v); }
        },
        crypto: webcrypto,
        chrome: chromeMock.chrome,
        QuyenLog: {
            info: () => {},
            warn: () => {},
            error: () => {}
        }
    };
    context.window = context;
    context.HIS = {};
    context.window.postMessage = (message, targetOrigin) => posted.push({ message, targetOrigin });
    context.window.addEventListener = () => {};
    context.window.removeEventListener = () => {};
    context.__posted = posted;
    context.__chromeMock = chromeMock;
    return vm.createContext(context);
}

function runScript(context, relPath) {
    const code = fs.readFileSync(path.join(root, relPath), 'utf8');
    vm.runInContext(code, context, { filename: relPath });
}

async function expectReject(promise, message) {
    try {
        await promise;
        assert.fail('expected promise to reject');
    } catch (err) {
        assert.strictEqual(err.message, message);
    }
}

(async function main() {
    const store = {
        quyen_release_policy: { buildHash: 'hash-test-123', allowedVersions: ['1.3.4'] },
        quyen_privacy_salt_v1: 'hospital-salt-test'
    };
    const context = makeDomContext(store);

    runScript(context, 'src/shared/privacy.js');
    runScript(context, 'src/shared/audit.js');
    runScript(context, 'src/shared/safety.js');
    runScript(context, 'src/shared/message-schema.js');
    runScript(context, 'src/shared/message.js');

    const dirtyDetail = {
        module: 'infusion',
        patient: {
            name: 'PHI_FIXTURE_DO_NOT_USE_REAL_DATA',
            khambenhId: 'PHI_FIXTURE_ENCOUNTER_ID',
            hosobenhanid: 'PHI_FIXTURE_RECORD_ID',
            dob: 'PHI_FIXTURE_DO_NOT_USE_REAL_DATA 01/01/1990'
        },
        drug: 'Morphin 10mg',
        ma: 'VT123',
        doctorName: 'BÁC SĨ B'
    };

    const safeDetail = context.HIS.Privacy.sanitizeAuditDetail(dirtyDetail);
    assert(/^pt_/.test(safeDetail.patientRef), 'patientRef must be pseudonymous');
    assert(/^it_/.test(safeDetail.itemRef), 'itemRef must be salted pseudonym');
    const safeJson = JSON.stringify(safeDetail);
    assert(!safeJson.includes('PHI_FIXTURE_DO_NOT_USE_REAL_DATA'), 'sanitized detail must not include patient name');
    assert(!safeJson.includes('PHI_FIXTURE_ENCOUNTER_ID'), 'sanitized detail must not include encounter id');
    assert(!safeJson.includes('PHI_FIXTURE_DO_NOT_USE_REAL_DATA 01/01/1990'), 'sanitized detail must not include DOB');
    assert(!safeJson.includes('Morphin'), 'sanitized detail must not include drug name');
    assert(!safeJson.includes('BÁC SĨ B'), 'sanitized detail must not include doctor name');

    const entry = await context.HIS.Audit.log('INFUSION_FILL_ATTEMPT', dirtyDetail);
    assert.strictEqual(entry.buildHash, 'hash-test-123', 'audit entry must include local build hash');
    const auditJson = JSON.stringify(store.quyen_audit_log);
    assert(!auditJson.includes('PHI_FIXTURE_DO_NOT_USE_REAL_DATA'), 'audit log must not include patient name');
    assert(!auditJson.includes('Morphin'), 'audit log must not include drug name');

    store.quyen_kill_switch = true;
    context.HIS.Safety.setSafeModeForTest(false);
    context.__chromeMock.storageChanged.forEach((fn) => fn({ quyen_kill_switch: { newValue: true } }, 'local'));
    await expectReject(context.HIS.Safety.guardAutoFill('VATTU_FILL_ATTEMPT', { module: 'vattu' }), 'KILL_SWITCH');

    assert.strictEqual(context.HIS.Message.isValid({
        data: { type: 'QUYEN_BRIDGE_READY' },
        origin: 'https://his.vncare.vn'
    }), false, 'legacy raw QUYEN_* message must be rejected');

    assert.strictEqual(context.HIS.Message.isValid({
        data: { _q: context.HIS.Message.MARKER, type: 'QUYEN_BRIDGE_READY', ts: Date.now() - 3600000, source: 'bridge' },
        origin: 'https://his.vncare.vn'
    }), false, 'expired message must be rejected');

    const requestId = context.HIS.Message.send('QUYEN_REQ_VITALS', { module: 'caresheet' });
    assert(requestId, 'send must return requestId');
    assert.strictEqual(context.__posted[0].targetOrigin, 'https://his.vncare.vn', 'postMessage target origin must not be wildcard');

    const swStore = {};
    const swChrome = makeChromeMock(swStore, '1.3.4');
    const swContext = vm.createContext({
        console,
        Date,
        chrome: swChrome.chrome
    });
    runScript(swContext, 'src/background/background.js');
    assert.strictEqual(swChrome.runtimeMessages.length, 1, 'background must register release policy message listener');

    let response = null;
    swChrome.runtimeMessages[0]({ type: 'CHECK_RELEASE_POLICY' }, {}, (value) => { response = value; });
    assert(response && response.ok === true, 'default local release policy must allow current version');
    assert.strictEqual(JSON.stringify(swStore.quyen_release_policy.allowedVersions), '["1.3.4"]', 'default policy must allow only current version');

    swStore.quyen_kill_switch = true;
    swChrome.runtimeMessages[0]({ type: 'CHECK_RELEASE_POLICY' }, {}, (value) => { response = value; });
    assert.strictEqual(response.ok, false, 'kill switch must block release policy');
    assert.strictEqual(response.reason, 'KILL_SWITCH', 'kill switch reason must be explicit');

    swStore.quyen_kill_switch = false;
    swStore.quyen_release_policy = { allowedVersions: ['0.0.1'], expiresAt: '', buildHash: '' };
    swChrome.runtimeMessages[0]({ type: 'CHECK_RELEASE_POLICY' }, {}, (value) => { response = value; });
    assert.strictEqual(response.ok, true, 'local manual policy from older version must migrate to current version');
    assert.strictEqual(JSON.stringify(swStore.quyen_release_policy.allowedVersions), '["1.3.4"]', 'migrated local policy must allow current version');

    const prodStore = {
        quyen_release_policy: {
            allowedVersions: ['0.0.1'],
            expiresAt: '',
            buildHash: 'a'.repeat(64),
            channel: 'production'
        }
    };
    const prodChrome = makeChromeMock(prodStore, '1.3.4', { update_url: 'https://clients2.google.com/service/update2/crx' });
    const prodContext = vm.createContext({ console, Date, chrome: prodChrome.chrome });
    runScript(prodContext, 'src/background/background.js');
    prodChrome.runtimeMessages[0]({ type: 'CHECK_RELEASE_POLICY' }, {}, (value) => { response = value; });
    assert.strictEqual(response.ok, false, 'production version outside allowlist must be blocked');
    assert.strictEqual(response.reason, 'VERSION_NOT_ALLOWED', 'production version allowlist reason must be explicit');

    // Verify schema validation library exists
    assert(context.HIS.MessageSchema, 'HIS.MessageSchema must be defined');

    // Test: Valid message schema validation
    const validMsg = {
        _q: context.HIS.Message.MARKER,
        type: 'QUYEN_BRIDGE_READY',
        ts: Date.now(),
        source: 'bridge',
        nonce: 'nonce123',
        sessionNonce: context.HIS.Message.getSessionNonce(),
        requestId: 'req_123',
        status: 'ready',
        bridgeVersion: '1.2.0'
    };
    assert.strictEqual(context.HIS.MessageSchema.validate(validMsg).ok, true, 'valid QUYEN_BRIDGE_READY schema validation must pass');

    // Test: Invalid envelope (missing marker)
    const invalidMarkerMsg = Object.assign({}, validMsg, { _q: 'wrong' });
    assert.strictEqual(context.HIS.MessageSchema.validate(invalidMarkerMsg).ok, false, 'message without correct marker must fail schema validation');

    // Test: Extraneous fields
    const extraneousMsg = Object.assign({}, validMsg, { extra_field: 'value' });
    assert.strictEqual(context.HIS.MessageSchema.validate(extraneousMsg).ok, false, 'message with extraneous fields must fail schema validation');

    // Test: Oversized payload
    const oversizedMsg = Object.assign({}, validMsg, { bridgeVersion: 'a'.repeat(2000) });
    assert.strictEqual(context.HIS.MessageSchema.validate(oversizedMsg).ok, false, 'oversized payload must fail schema validation');

    // Test: Invalid selector (strict selector safety: only IDs starting with #)
    const invalidSelectorMsg = {
        _q: context.HIS.Message.MARKER,
        type: 'QUYEN_TRIGGER_CHANGE',
        ts: Date.now(),
        source: 'content',
        nonce: 'nonce123',
        sessionNonce: context.HIS.Message.getSessionNonce(),
        requestId: 'req_123',
        selector: '.class-selector', // not #ID
        value: 'test'
    };
    assert.strictEqual(context.HIS.MessageSchema.validate(invalidSelectorMsg).ok, false, 'selector not matching ID-only pattern must fail');

    // Test: Limit marker validation
    const invalidMarkerPatternMsg = {
        _q: context.HIS.Message.MARKER,
        type: 'QUYEN_COMBOGRID_CLICK',
        ts: Date.now(),
        source: 'content',
        nonce: 'nonce123',
        sessionNonce: context.HIS.Message.getSessionNonce(),
        requestId: 'req_123',
        marker: 'invalid_marker_name'
    };
    assert.strictEqual(context.HIS.MessageSchema.validate(invalidMarkerPatternMsg).ok, false, 'marker not matching expected pattern must fail');

    // Test: Replay protection (reject duplicate request ID)
    const replayMsg = {
        _q: context.HIS.Message.MARKER,
        type: 'QUYEN_BRIDGE_READY',
        ts: Date.now(),
        source: 'bridge',
        nonce: 'nonce123',
        sessionNonce: context.HIS.Message.getSessionNonce(),
        requestId: 'dup_req_123',
        status: 'ready',
        bridgeVersion: '1.2.0'
    };
    // First message with requestId 'dup_req_123' must be accepted
    assert.strictEqual(context.HIS.Message.isValid({ data: replayMsg, origin: 'https://his.vncare.vn' }), true, 'first request must be valid');
    // Second message with identical requestId 'dup_req_123' must be rejected (replay)
    assert.strictEqual(context.HIS.Message.isValid({ data: replayMsg, origin: 'https://his.vncare.vn' }), false, 'replayed request must be rejected');

    // Test: Pure JS HMAC-SHA-256 validation
    const hmacExpected = '62d0d2770632dd7d4062df4105ffa637cb5a51e176e414a4b1f1224f203d7398';
    const hmacActual = context.HIS.Privacy.hmacSha256('hospital-salt-test', 'test-message');
    assert.strictEqual(hmacActual, hmacExpected, 'hmacSha256 output must match cryptographic standard');

    // Test: Vietnam timezone formatting verification
    const lastAuditEntry = store.quyen_audit_log[store.quyen_audit_log.length - 1];
    assert(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+07:00/.test(lastAuditEntry.ts), 'audit timestamp must be formatted with Vietnam timezone offset (+07:00)');

    // Test: Serialized FIFO write queue concurrency
    const writePromises = [
        context.HIS.Audit.log('CONCURRENT_LOG_1', { module: 'infusion', drug: 'Drug A' }),
        context.HIS.Audit.log('CONCURRENT_LOG_2', { module: 'infusion', drug: 'Drug B' }),
        context.HIS.Audit.log('CONCURRENT_LOG_3', { module: 'infusion', drug: 'Drug C' })
    ];
    const loggedEntries = await Promise.all(writePromises);
    assert.strictEqual(loggedEntries.length, 3, 'All concurrent logs must successfully resolve');
    const allStored = store.quyen_audit_log;
    const lastThree = allStored.slice(allStored.length - 3);
    assert.strictEqual(lastThree[0].action, 'CONCURRENT_LOG_1');
    assert.strictEqual(lastThree[1].action, 'CONCURRENT_LOG_2');
    assert.strictEqual(lastThree[2].action, 'CONCURRENT_LOG_3');

    // Test: CSV injection formula prevention checks via audit log export
    const csvDirtyDetail = {
        module: 'vattu',
        patient: { name: 'Patient A' },
        result: ' =1+1', // starts with space and =
        reason: '\t-SUM()' // starts with tab and -
    };
    await context.HIS.Audit.log('\r@ALERT', csvDirtyDetail);
    let exportedCsv = '';
    context.HIS.Audit.exportCSV(function (csv) {
        exportedCsv = csv;
    });
    assert(exportedCsv.includes("' =1+1"), 'CSV export must escape formula with leading space');
    assert(exportedCsv.includes("'\t-SUM()"), 'CSV export must escape formula with leading tab');
    assert(exportedCsv.includes("'\r@ALERT"), 'CSV export must escape formula with leading carriage return');

    console.log('security harness tests passed');
})();
