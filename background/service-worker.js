/**
 * Display Direction Switcher (LTR / RTL)
 * Background Service Worker (Manifest V3)
 *
 * The content script reports each tab's real state via
 * { type: 'PDS_PAGE_REPORT', enabled, direction, pageAllowed }.
 * This worker only updates the toolbar badge for that tab:
 *   - 'OFF'  (gray)   -> extension disabled
 *   - ''     (empty)  -> page is outside the allowlist (no action)
 *   - 'RTL'  (green)  -> RTL applied on this page
 *   - 'LTR'  (blue)   -> LTR applied on this page
 */

const DEFAULTS = {
  enabled: true,
  direction: 'ltr',
  useAllowlist: true,
  allowedSites: []
};

async function ensureDefaults() {
  try {
    const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
    await chrome.storage.sync.set({ ...DEFAULTS, ...stored });
  } catch (err) {
    // Ignore errors in environments where storage isn't available
  }
}

async function setBadge(tabId, report) {
  try {
    const enabled = Boolean(report?.enabled);
    const pageAllowed = Boolean(report?.pageAllowed);

    if (!enabled) {
      await chrome.action.setBadgeText({ tabId, text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#6B7280' });
    } else if (!pageAllowed) {
      // Outside the allowlist -> the extension does nothing on this page.
      await chrome.action.setBadgeText({ tabId, text: '' });
    } else {
      const direction = report.direction === 'rtl' ? 'rtl' : 'ltr';
      const text = direction === 'rtl' ? 'RTL' : 'LTR';
      const color = direction === 'rtl' ? '#10B981' : '#2563EB';
      await chrome.action.setBadgeText({ tabId, text });
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
    }
  } catch (err) {
    // Ignore errors in environments where action isn't available
  }
}

// On install, make sure all settings keys exist
chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
});

// Reports from content scripts (each tab reports its own state)
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'PDS_PAGE_REPORT' && sender?.tab?.id !== undefined) {
    setBadge(sender.tab.id, message);
  }
});
