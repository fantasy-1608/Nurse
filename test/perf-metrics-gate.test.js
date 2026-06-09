const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const root = path.join(__dirname, '..');

// Helper to run a script in context
function runScript(context, relPath) {
    const code = fs.readFileSync(path.join(root, relPath), 'utf8');
    vm.runInContext(code, context, { filename: relPath });
}

// 1. Setup mock environment
const store = {};
const context = {
    console,
    localStorage: {
        removeItem: (k) => { delete store[`local:${k}`]; },
        getItem: (k) => store[`local:${k}`] || null,
        setItem: (k, v) => { store[`local:${k}`] = String(v); }
    },
    Date,
    Math,
    document: {
        readyState: 'complete',
        addEventListener: () => {}
    },
    window: {},
    HIS: {}
};
context.window = context;

const vmContext = vm.createContext(context);

// Load privacy helpers
runScript(vmContext, 'src/shared/privacy.js');
// Load his-core which contains PerfMetrics
runScript(vmContext, 'src/shared/his-core.js');

console.log('Testing PerfMetrics...');

// Test 1: Record adds entries to localstorage
vmContext.HIS.PerfMetrics.clear();
vmContext.HIS.PerfMetrics.record('fill', 'patient_name', 150, 'NGUYEN VAN A');

let queue = vmContext.HIS.PerfMetrics.getQueue();
assert.strictEqual(queue.length, 1, 'Should have exactly 1 item in queue');
assert.strictEqual(queue[0].actionType, 'fill');
assert.strictEqual(queue[0].selector, 'patient_name');
assert.strictEqual(queue[0].duration, 150);
// Verify privacy redact masked the patient name
assert.strictEqual(queue[0].content, '[NAME] A', 'Patient name must be redacted to [NAME] A');

// Test 2: Privacy redact masks medical IDs
vmContext.HIS.PerfMetrics.record('fill', 'patient_id', 120, '1234567890');
queue = vmContext.HIS.PerfMetrics.getQueue();
assert.strictEqual(queue.length, 2);
assert.strictEqual(queue[1].content, '[ID]', 'Patient ID must be redacted to [ID]');

// Test 3: FIFO capping at 100 entries
vmContext.HIS.PerfMetrics.clear();
for (let i = 0; i < 150; i++) {
    vmContext.HIS.PerfMetrics.record('click', 'btn_' + i, 5);
}
queue = vmContext.HIS.PerfMetrics.getQueue();
assert.strictEqual(queue.length, 100, 'Queue must be capped at 100 entries');
assert.strictEqual(queue[0].selector, 'btn_50', 'FIFO rotation check failed: oldest entries must be dropped');
assert.strictEqual(queue[99].selector, 'btn_149', 'FIFO rotation check failed: newest entries must be present');

// Test 4: Clear function
vmContext.HIS.PerfMetrics.clear();
queue = vmContext.HIS.PerfMetrics.getQueue();
assert.strictEqual(queue.length, 0, 'Queue must be empty after clear()');

console.log('PerfMetrics gate tests passed successfully! ✅');
