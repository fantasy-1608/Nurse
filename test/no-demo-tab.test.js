const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
const uiPanel = fs.readFileSync(path.join(root, 'src/content/ui-panel.js'), 'utf8');
const messageBus = fs.readFileSync(path.join(root, 'src/shared/message.js'), 'utf8');
const vattuUi = fs.readFileSync(path.join(root, 'src/content/vattu-ui.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'src/popup/popup.html'), 'utf8');
const background = fs.readFileSync(path.join(root, 'src/background/background.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'src/content/content.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');

const contentScripts = manifest.content_scripts[0].js;

assert(!contentScripts.includes('content/demo-engine.js'), 'manifest must not load demo-engine.js');
assert(!contentScripts.includes('content/demo-ui.js'), 'manifest must not load demo-ui.js');
assert(!uiPanel.includes('data-tab="demo"'), 'panel must not render the Demo tab');
assert(!uiPanel.includes('quyen-tab-content-demo'), 'panel must not render the Demo content container');
assert(!uiPanel.includes('QuyenDemoUI'), 'panel must not reference QuyenDemoUI');

assert(contentScripts.includes('shared/privacy.js'), 'manifest must load privacy helpers before logger');
assert(contentScripts.includes('shared/audit.js'), 'manifest must load audit trail');
assert(contentScripts.includes('shared/safety.js'), 'manifest must load safety controls');
assert(contentScripts.indexOf('shared/privacy.js') < contentScripts.indexOf('shared/logger.js'), 'privacy must load before logger');
assert(contentScripts.indexOf('shared/audit.js') < contentScripts.indexOf('shared/safety.js'), 'audit must load before safety guard');
assert(!messageBus.includes('isLegacyType && sameWindowSource'), 'message bus must not allow raw legacy QUYEN_* messages');
assert(uiPanel.includes("!HIS.Message || !HIS.Message.isValid(event)"), 'content listeners must fail closed if message bus is unavailable');
assert(vattuUi.includes('quyen_vattu_fast_path_enabled'), 'Vật tư fast path must be behind a storage feature flag');
assert(!JSON.stringify(manifest).includes('api.github.com'), 'manifest must not request GitHub/API permissions for hospital rollout');
assert(!manifest.permissions.includes('alarms'), 'manifest must not keep unused background alarm permission');
assert(!popupHtml.includes('fonts.googleapis.com'), 'popup must not load external fonts');
assert(background.includes('quyen_release_policy'), 'background must enforce local release policy');
assert(background.includes('quyen_kill_switch'), 'background must support local kill switch');
assert(uiPanel.includes('safety guard unavailable'), 'infusion auto-fill must fail closed if safety guard is unavailable');
assert(vattuUi.includes('VT fill BLOCKED: safety guard unavailable'), 'vattu auto-fill must fail closed if safety guard is unavailable');
assert(!uiPanel.includes('localStorage.setItem(\'quyen_stats\''), 'panel must not persist localStorage quyen_stats');
assert(!content.includes('quyen_error_log'), 'content runtime must not persist PHI-risk error log');
assert(!popup.includes('quyen_error_log'), 'popup must not export PHI-risk error log');
assert(content.includes('quyen_runtime_health_v1'), 'runtime health counter must replace persistent error logs');

console.log('security surface tests passed');
