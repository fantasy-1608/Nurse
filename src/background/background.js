/**
 * __EXT_EMOJI__ __EXT_NAME__ — Background Service Worker
 * Auto-update checker: kiểm tra phiên bản mới trên GitHub Releases
 * 
 * Hoạt động:
 *   1. Mỗi 6 giờ, gọi GitHub API lấy latest release
 *   2. So sánh version với manifest hiện tại
 *   3. Nếu có bản mới → lưu vào storage → popup hiện thông báo
 */

const GITHUB_OWNER = 'fantasy-1608';
const GITHUB_REPO = 'Nurse';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 giờ

// ==========================================
// CHECK FOR UPDATE
// ==========================================
async function checkForUpdate() {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
            { headers: { 'Accept': 'application/vnd.github.v3+json' } }
        );

        if (!response.ok) {
            console.log('[Update] GitHub API error:', response.status);
            return;
        }

        const release = await response.json();
        const latestVersion = (release.tag_name || '').replace(/^v/, '');
        const currentVersion = chrome.runtime.getManifest().version;

        console.log(`[Update] Current: v${currentVersion}, Latest: v${latestVersion}`);

        if (!latestVersion) return;

        if (isNewerVersion(latestVersion, currentVersion)) {
            // Tìm file zip phù hợp cho target này
            const assets = release.assets || [];
            let downloadUrl = release.html_url; // Fallback: trang release
            
            for (const asset of assets) {
                const name = (asset.name || '').toLowerCase();
                if (name.includes('.zip')) {
                    downloadUrl = asset.browser_download_url;
                    break;
                }
            }

            const updateInfo = {
                hasUpdate: true,
                latestVersion: latestVersion,
                currentVersion: currentVersion,
                downloadUrl: downloadUrl,
                releaseUrl: release.html_url,
                releaseNotes: (release.body || '').substring(0, 300),
                checkedAt: new Date().toISOString()
            };

            chrome.storage.local.set({ quyen_update: updateInfo });
            console.log(`[Update] 🆕 Phiên bản mới: v${latestVersion}!`);

            // Badge trên icon extension
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#e91e63' });
        } else {
            // Không có update → xóa badge
            chrome.storage.local.set({
                quyen_update: {
                    hasUpdate: false,
                    currentVersion: currentVersion,
                    latestVersion: latestVersion,
                    checkedAt: new Date().toISOString()
                }
            });
            chrome.action.setBadgeText({ text: '' });
        }
    } catch (error) {
        console.error('[Update] Check failed:', error);
    }
}

/**
 * So sánh semver: trả về true nếu `latest` > `current`
 */
function isNewerVersion(latest, current) {
    const partsA = latest.split('.').map(Number);
    const partsB = current.split('.').map(Number);
    
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const a = partsA[i] || 0;
        const b = partsB[i] || 0;
        if (a > b) return true;
        if (a < b) return false;
    }
    return false;
}

// ==========================================
// ALARM — Định kỳ kiểm tra
// ==========================================
chrome.alarms.create('check-update', {
    delayInMinutes: 1,          // Lần đầu: sau 1 phút
    periodInMinutes: 360        // Sau đó: mỗi 6 giờ
});

chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === 'check-update') {
        checkForUpdate();
    }
});

// Kiểm tra ngay khi install/update extension
chrome.runtime.onInstalled.addListener(function () {
    console.log('[Update] Extension installed/updated — checking for updates...');
    checkForUpdate();
});

// Kiểm tra khi mở popup (user triggered)
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'CHECK_UPDATE') {
        checkForUpdate().then(function () {
            chrome.storage.local.get('quyen_update', function (data) {
                sendResponse(data.quyen_update || {});
            });
        });
        return true; // async response
    }
});

console.log(`[Background] __EXT_EMOJI__ __EXT_NAME__ service worker loaded`);
