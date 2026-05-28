const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
const uiPanel = fs.readFileSync(path.join(root, 'src/content/ui-panel.js'), 'utf8');

const contentScripts = manifest.content_scripts[0].js;

assert(!contentScripts.includes('content/demo-engine.js'), 'manifest must not load demo-engine.js');
assert(!contentScripts.includes('content/demo-ui.js'), 'manifest must not load demo-ui.js');
assert(!uiPanel.includes('data-tab="demo"'), 'panel must not render the Demo tab');
assert(!uiPanel.includes('quyen-tab-content-demo'), 'panel must not render the Demo content container');
assert(!uiPanel.includes('QuyenDemoUI'), 'panel must not reference QuyenDemoUI');

console.log('no-demo-tab tests passed');
