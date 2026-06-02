/**
 * __EXT_EMOJI__ __EXT_NAME__ — Background Service Worker
 * Local release policy only. No external update checks in hospital rollout.
 */

const RELEASE_POLICY_KEY = 'quyen_release_policy';
const KILL_SWITCH_KEY = 'quyen_kill_switch';

function currentVersion() {
    return chrome.runtime.getManifest().version || '';
}

function defaultReleasePolicy() {
    return {
        allowedVersions: [currentVersion()],
        expiresAt: '',
        buildHash: '',
        channel: 'manual',
        updatedAt: new Date().toISOString()
    };
}

function normalizePolicy(policy) {
    const base = defaultReleasePolicy();
    if (!policy || typeof policy !== 'object') return base;
    return {
        allowedVersions: Array.isArray(policy.allowedVersions) ? policy.allowedVersions.map(String) : base.allowedVersions,
        expiresAt: policy.expiresAt ? String(policy.expiresAt) : '',
        buildHash: policy.buildHash ? String(policy.buildHash) : '',
        channel: policy.channel ? String(policy.channel) : 'manual',
        updatedAt: policy.updatedAt ? String(policy.updatedAt) : base.updatedAt
    };
}

function evaluateReleasePolicy(policy, killSwitch) {
    const version = currentVersion();
    const normalized = normalizePolicy(policy);
    const allowed = normalized.allowedVersions.indexOf(version) >= 0;
    const expired = normalized.expiresAt ? Date.now() > Date.parse(normalized.expiresAt) : false;

    if (killSwitch === true) {
        return { ok: false, reason: 'KILL_SWITCH', version, policy: normalized };
    }
    if (!allowed) {
        return { ok: false, reason: 'VERSION_NOT_ALLOWED', version, policy: normalized };
    }
    if (expired) {
        return { ok: false, reason: 'VERSION_EXPIRED', version, policy: normalized };
    }
    return { ok: true, reason: 'OK', version, policy: normalized };
}

function ensureReleasePolicy(callback) {
    chrome.storage.local.get([RELEASE_POLICY_KEY, KILL_SWITCH_KEY], function (data) {
        const policy = normalizePolicy(data[RELEASE_POLICY_KEY]);
        const updates = {};
        if (!data[RELEASE_POLICY_KEY]) updates[RELEASE_POLICY_KEY] = policy;
        if (typeof data[KILL_SWITCH_KEY] !== 'boolean') updates[KILL_SWITCH_KEY] = false;

        function done() {
            const evaluated = evaluateReleasePolicy(policy, data[KILL_SWITCH_KEY] === true);
            if (callback) callback(evaluated);
        }

        if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, done);
        } else {
            done();
        }
    });
}

function refreshBadge() {
    ensureReleasePolicy(function (status) {
        if (!status.ok) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#d32f2f' });
            return;
        }
        chrome.action.setBadgeText({ text: '' });
    });
}

chrome.runtime.onInstalled.addListener(function () {
    ensureReleasePolicy(refreshBadge);
});

chrome.runtime.onStartup.addListener(function () {
    refreshBadge();
});

chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes[RELEASE_POLICY_KEY] || changes[KILL_SWITCH_KEY]) refreshBadge();
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'CHECK_RELEASE_POLICY') {
        ensureReleasePolicy(function (status) {
            sendResponse(status);
        });
        return true;
    }
});

console.log('[Background] __EXT_EMOJI__ __EXT_NAME__ service worker loaded (local release policy)');
