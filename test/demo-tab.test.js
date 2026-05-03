const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadModule(file, context, exportName) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(source + '\nthis.' + exportName + ' = ' + exportName + ';', context, { filename: file });
    return context[exportName];
}

function createContext(responseFactory) {
    const listeners = {};
    const refreshButton = { addEventListener: function () {} };
    const context = {
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Date: Date,
        Math: Math,
        Promise: Promise,
        Object: Object,
        String: String,
        Number: Number,
        isFinite: isFinite,
        parseInt: parseInt,
        QuyenLog: {
            info: function () {},
            warn: function () {},
            error: function () {}
        },
        document: {
            getElementById: function (id) {
                return id === 'quyen-demo-refresh' ? refreshButton : null;
            }
        },
        window: {
            addEventListener: function () {},
            removeEventListener: function () {}
        },
        HIS: {
            Message: {
                listen: function (type, callback) {
                    listeners[type] = callback;
                    return function () { delete listeners[type]; };
                },
                send: function (type, payload) {
                    if (type !== 'QUYEN_REQ_ADVANCE_PAYMENT') return;
                    const response = responseFactory ? responseFactory(payload) : {};
                    if (listeners.QUYEN_ADVANCE_PAYMENT_RESULT) {
                        listeners.QUYEN_ADVANCE_PAYMENT_RESULT(Object.assign({
                            requestId: payload.requestId
                        }, response));
                    }
                },
                isValid: function () { return true; }
            },
            PatientLock: {
                getSourceContext: function () {
                    return null;
                }
            }
        }
    };

    context.window.window = context.window;
    context.window.document = context.document;
    context.window.HIS = context.HIS;
    vm.createContext(context);
    return { context, listeners };
}

function patient(overrides) {
    return Object.assign({
        name: 'BN TEST',
        khambenhId: 'KB1',
        benhnhanId: 'BN1',
        hosobenhanid: 'HS1',
        maBHYT: 'GD123',
        doiTuongId: '1',
        doiTuong: 'BHYT',
        soNgayDieuTri: '4',
        thoiGianVaoVien: '29/04/2026 08:00:00'
    }, overrides || {});
}

async function main() {
    const env = createContext(function () {
        return {
            detail05: [{
                BNTRA: '1200000',
                TAMUNG_CONLAI: '1800000',
                TYLE_BHYT: '80'
            }],
            detail06: [{
                TAMUNG: '3000000',
                TIEN_PHAINOP: '0'
            }]
        };
    });
    const engine = loadModule('src/content/demo-engine.js', env.context, 'QuyenDemoEngine');

    const ok = engine.analyzeAdvancePayment(patient(), {
        detail05: [{ BNTRA: '1200000', TAMUNG_CONLAI: '1800000', TYLE_BHYT: '80' }],
        detail06: [{ TAMUNG: '3000000', TIEN_PHAINOP: '0' }]
    });
    assert.strictEqual(ok.status, 'ok');
    assert.strictEqual(ok.severity, 'ok');

    const low = engine.analyzeAdvancePayment(patient(), {
        detail05: [{ BNTRA: '1200000', TAMUNG_CONLAI: '300000', TYLE_BHYT: '80' }],
        detail06: [{ TAMUNG: '1500000', TIEN_PHAINOP: '0' }]
    });
    assert.strictEqual(low.status, 'low');
    assert.strictEqual(low.severity, 'warning');
    assert(low.suggestedAdvance >= 600000);

    const hunterApi = engine.analyzeAdvancePayment(patient(), {
        detail05: [{
            TONGTIENDV: '1265838',
            BHYT_THANHTOAN: '989436',
            BNTRA: '276402',
            T_BNTT: '29043',
            TAMUNG_CONLAI: '-276402',
            TYLE_BHYT: '100'
        }],
        detail06: [{
            TONGTIENDV: '1265838',
            VIENPHI: '276402',
            TAMUNG: '2500000',
            HOANUNG: '2223598',
            TIEN_PHAINOP: '225217.8'
        }]
    });
    assert.strictEqual(hunterApi.status, 'ok');
    assert.strictEqual(hunterApi.raw.advanceTotal, 2500000);
    assert.strictEqual(hunterApi.raw.patientPay, 276402);
    assert.strictEqual(hunterApi.metrics.find(function (m) { return m.label === 'Tạm ứng còn'; }).value, 2223598);

    const partialAdvance = engine.analyzeAdvancePayment(patient(), {
        detail05: [],
        detail06: [{ TAMUNG: '3000000' }]
    });
    assert.strictEqual(partialAdvance.status, 'partial_advance_only');
    assert.strictEqual(partialAdvance.severity, 'unknown');
    assert.strictEqual(partialAdvance.raw.partial, true);
    assert(partialAdvance.message.indexOf('chưa dự đoán') >= 0);

    const debt = engine.analyzeAdvancePayment(patient({ maBHYT: '', doiTuongId: '2', doiTuong: 'Thu phí' }), {
        detail05: [{ BNTRA: '2400000', TAMUNG_CONLAI: '0', TYLE_BHYT: '0' }],
        detail06: [{ TAMUNG: '1000000', TIEN_PHAINOP: '900000' }]
    });
    assert.strictEqual(debt.status, 'no_insurance_debt');
    assert.strictEqual(debt.severity, 'danger');
    assert(debt.recommendation.indexOf('ứng thêm') >= 0);

    const coreFallback = engine.analyzeAdvancePayment(patient({ financeCore: '1983240;1276648;0;0;1000000;0;0;0;276648;0;975574' }), {
        detail05: [],
        detail06: []
    });
    assert.notStrictEqual(coreFallback.status, 'unavailable');
    assert(coreFallback.raw.amountDue > 0);

    engine.setPatient(patient(), null, 1);
    const summary = await engine.summarize();
    assert.strictEqual(summary.patient.khambenhId, 'KB1');
    assert.strictEqual(summary.status, 'ok');

    env.context.QuyenDemoEngine = engine;
    const ui = loadModule('src/content/demo-ui.js', env.context, 'QuyenDemoUI');
    const container = { innerHTML: '' };
    ui.init(container);
    env.listeners.QUYEN_PATIENT_SELECTED({ seq: 2, patient: patient({ name: 'BN UI' }) });
    await new Promise(function (resolve) { setTimeout(resolve, 10); });
    assert(container.innerHTML.indexOf('Nhắc tạm ứng') >= 0);
    assert(container.innerHTML.indexOf('BN UI') >= 0);
    assert(container.innerHTML.indexOf('Tạm ứng còn') >= 0);

    console.log('demo-tab tests passed');
}

main().catch(function (err) {
    console.error(err);
    process.exit(1);
});
