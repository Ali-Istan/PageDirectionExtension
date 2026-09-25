/**
 * Display Direction Switcher (LTR / RTL)
 * Background Service Worker (Manifest V3)
 */

async function updateBadge(enabled, direction) {
  try {
    if (!enabled) {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#6B7280' });
    } else {
      const text = direction === 'rtl' ? 'RTL' : 'LTR';
      const color = direction === 'rtl' ? '#10B981' : '#2563EB';
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color });
    }
  } catch (err) {
    // Ignore errors in environments where action isn't available
  }
}

// On install, set default settings
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled, direction } = await chrome.storage.sync.get(['enabled', 'direction']);
  const isEnabled = enabled !== undefined ? enabled : true;
  const currentDir = direction || 'ltr';

  await chrome.storage.sync.set({
    enabled: isEnabled,
    direction: currentDir
  });

  await updateBadge(isEnabled, currentDir);
});

// Update badge when settings change
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync' || areaName === 'local') {
    const { enabled, direction } = await chrome.storage.sync.get(['enabled', 'direction']);
    const isEnabled = enabled !== undefined ? enabled : true;
    const currentDir = direction || 'ltr';
    await updateBadge(isEnabled, currentDir);
  }
});
