/**
 * Display Direction Switcher (LTR / RTL)
 * Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const enabledToggle = document.getElementById('enabledToggle');
  const toggleDescription = document.getElementById('toggleDescription');
  const statusBadge = document.getElementById('statusBadge');
  const directionCard = document.getElementById('directionCard');
  const dirLtr = document.getElementById('dirLtr');
  const dirRtl = document.getElementById('dirRtl');

  // Load current settings from storage
  let currentSettings = {
    enabled: true,
    direction: 'ltr'
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const stored = await chrome.storage.sync.get(['enabled', 'direction']);
      if (stored.enabled !== undefined) currentSettings.enabled = Boolean(stored.enabled);
      if (stored.direction) currentSettings.direction = stored.direction;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Update UI representation
  function updateUI() {
    enabledToggle.checked = currentSettings.enabled;
    
    if (currentSettings.direction === 'rtl') {
      dirRtl.checked = true;
    } else {
      dirLtr.checked = true;
    }

    if (currentSettings.enabled) {
      statusBadge.textContent = currentSettings.direction === 'rtl' ? 'فعال (RTL)' : 'فعال (LTR)';
      statusBadge.className = 'status-badge badge-active';
      toggleDescription.textContent = currentSettings.direction === 'rtl' 
        ? 'نمایش راست به چپ فعال است' 
        : 'نمایش چپ به راست فعال است';
      directionCard.classList.remove('disabled');
    } else {
      statusBadge.textContent = 'غیرفعال';
      statusBadge.className = 'status-badge badge-inactive';
      toggleDescription.textContent = 'اکستنشن موقتاً غیرفعال است';
      directionCard.classList.add('disabled');
    }
  }

  // Save settings and notify tabs
  async function persistAndNotify() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        await chrome.storage.sync.set(currentSettings);
      }

      // Notify the active tab immediately
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            type: 'PDS_UPDATE_STATE',
            enabled: currentSettings.enabled,
            direction: currentSettings.direction
          }).catch(() => {
            // Content script may not be injected on special pages (chrome://, etc.)
          });
        }
      }
    } catch (err) {
      console.error('Failed to persist settings:', err);
    }
  }

  // Event Listeners
  enabledToggle.addEventListener('change', async () => {
    currentSettings.enabled = enabledToggle.checked;
    updateUI();
    await persistAndNotify();
  });

  dirLtr.addEventListener('change', async () => {
    if (dirLtr.checked) {
      currentSettings.direction = 'ltr';
      updateUI();
      await persistAndNotify();
    }
  });

  dirRtl.addEventListener('change', async () => {
    if (dirRtl.checked) {
      currentSettings.direction = 'rtl';
      updateUI();
      await persistAndNotify();
    }
  });

  // Initial render
  updateUI();
});
