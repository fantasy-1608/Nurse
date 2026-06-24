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
        buildHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        channel: 'production',
        updatedAt: new Date().toISOString()
    };
}

function normalizePolicy(policy) {
    const base = defaultReleasePolicy();
    if (!policy || typeof policy !== 'object') return base;
    let allowedVersions = Array.isArray(policy.allowedVersions) ? policy.allowedVersions.map(String) : base.allowedVersions;
    if (allowedVersions.indexOf(currentVersion()) < 0) {
        allowedVersions = base.allowedVersions;
    }
    return {
        allowedVersions,
        expiresAt: policy.expiresAt ? String(policy.expiresAt) : '',
        buildHash: policy.buildHash ? String(policy.buildHash) : base.buildHash,
        channel: policy.channel ? String(policy.channel) : 'production',
        updatedAt: policy.updatedAt ? String(policy.updatedAt) : base.updatedAt
    };
}

function evaluateReleasePolicy(policy, killSwitch) {
    const version = currentVersion();
    if (killSwitch === true) {
        return { ok: false, reason: 'KILL_SWITCH', version, policy: policy || null };
    }
    return { ok: true, reason: 'OK', version, policy: policy || null };
}

function ensureReleasePolicy(callback) {
    chrome.storage.local.get([RELEASE_POLICY_KEY, KILL_SWITCH_KEY], function (data) {
        const isDev = !('update_url' in chrome.runtime.getManifest());
        const updates = {};
        
        let policy = data[RELEASE_POLICY_KEY];
        if (!policy) {
            policy = defaultReleasePolicy();
            updates[RELEASE_POLICY_KEY] = policy;
        } else if (policy && isDev) {
            const normalized = normalizePolicy(policy);
            if (JSON.stringify(normalized) !== JSON.stringify(policy)) {
                policy = normalized;
                updates[RELEASE_POLICY_KEY] = policy;
            }
        }
        
        if (typeof data[KILL_SWITCH_KEY] !== 'boolean') {
            updates[KILL_SWITCH_KEY] = false;
        }

        function done() {
            const currentPolicy = updates[RELEASE_POLICY_KEY] !== undefined ? updates[RELEASE_POLICY_KEY] : data[RELEASE_POLICY_KEY];
            const currentKill = updates[KILL_SWITCH_KEY] !== undefined ? updates[KILL_SWITCH_KEY] : (data[KILL_SWITCH_KEY] === true);
            const evaluated = evaluateReleasePolicy(currentPolicy, currentKill);
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
