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
  const allowlistCard = document.getElementById('allowlistCard');
  const allowlistToggle = document.getElementById('allowlistToggle');
  const allowlistDesc = document.getElementById('allowlistDesc');
  const siteInput = document.getElementById('siteInput');
  const addSiteBtn = document.getElementById('addSiteBtn');
  const addCurrentSiteBtn = document.getElementById('addCurrentSiteBtn');
  const siteList = document.getElementById('siteList');
  const siteEmpty = document.getElementById('siteEmpty');
  const currentSiteDot = document.getElementById('currentSiteDot');
  const currentSiteText = document.getElementById('currentSiteText');

  const DEFAULTS = {
    enabled: true,
    direction: 'ltr',
    useAllowlist: true,
    allowedSites: []
  };

  let currentSettings = { ...DEFAULTS };
  let activeHostname = null; // bare hostname of the active tab, or null

  /**
   * Normalizes any user input / URL host to a bare hostname:
   * 'https://chat.DeepSeek.com/chat?x=1' -> 'chat.deepseek.com'
   */
  function normalizeHost(raw) {
    if (raw === undefined || raw === null) return '';
    let host = String(raw).trim().toLowerCase();
    try {
      host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // strip protocol
      host = host.split(/[/?#]/)[0];                     // strip path/query/hash
      host = host.replace(/:\d+$/, '');                  // strip port
    } catch (e) {
      /* ignore */
    }
    return host.split('.').filter(Boolean).join('.');
  }

  async function getActiveTab() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab || null;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  /** Extracts hostname from a tab URL; returns null for non-web pages. */
  function hostFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return normalizeHost(u.hostname);
    } catch (e) {
      return null;
    }
  }

  function isHostAllowed(hostname) {
    if (!hostname) return false;
    return currentSettings.allowedSites.some(
      (site) => site && (hostname === site || hostname.endsWith('.' + site))
    );
  }

  function setCurrentSiteStatus(kind, text) {
    currentSiteDot.className = 'dot dot-' + kind;
    currentSiteText.textContent = text;
  }

  function renderCurrentSiteStatus() {
    if (!currentSettings.useAllowlist) {
      setCurrentSiteStatus('gray', 'فیلتر خاموش است؛ روی همه سایت‌ها اعمال می‌شود');
    } else if (!activeHostname) {
      setCurrentSiteStatus('gray', 'صفحه فعلی قابل تشخیص نیست (صفحه داخلی مرورگر)');
    } else if (isHostAllowed(activeHostname)) {
      setCurrentSiteStatus('green', `${activeHostname} — در لیست مجاز است`);
    } else {
      setCurrentSiteStatus('red', `${activeHostname} — خارج از لیست؛ تغییری اعمال نمی‌شود`);
    }
  }

  function renderSiteList() {
    siteList.innerHTML = '';
    currentSettings.allowedSites.forEach((site, index) => {
      const li = document.createElement('li');
      li.className = 'site-item';

      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = site;
      name.dir = 'ltr';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'site-remove';
      remove.title = 'حذف از لیست';
      remove.textContent = '✕';
      remove.addEventListener('click', async () => {
        currentSettings.allowedSites = currentSettings.allowedSites.filter((_, i) => i !== index);
        await persistAndNotify();
        renderSiteList();
        renderCurrentSiteStatus();
      });

      li.appendChild(name);
      li.appendChild(remove);
      siteList.appendChild(li);
    });

    siteEmpty.style.display = currentSettings.allowedSites.length > 0 ? 'none' : 'flex';
  }

  function updateUI() {
    enabledToggle.checked = currentSettings.enabled;
    allowlistToggle.checked = currentSettings.useAllowlist;

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
      allowlistCard.classList.remove('disabled');
    } else {
      statusBadge.textContent = 'غیرفعال';
      statusBadge.className = 'status-badge badge-inactive';
      toggleDescription.textContent = 'اکستنشن غیرفعال است؛ هیچ تغییری اعمال نمی‌شود';
      directionCard.classList.add('disabled');
      allowlistCard.classList.add('disabled');
    }

    allowlistDesc.textContent = currentSettings.useAllowlist
      ? 'فقط سایت‌های لیست تغییر می‌کنند'
      : 'اعمال روی همه سایت‌ها';
  }

  async function persistAndNotify() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        await chrome.storage.sync.set(currentSettings);
      }

      // Notify the active tab immediately (other open tabs react via storage.onChanged)
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const activeTab = await getActiveTab();
        if (activeTab?.id) {
          try {
            const p = chrome.tabs.sendMessage(activeTab.id, {
              type: 'PDS_UPDATE_STATE',
              ...currentSettings
            });
            if (p && typeof p.catch === 'function') p.catch(() => {
              // Content script not injected on special pages (chrome://, store, ...)
            });
          } catch (e) {
            /* ignore */
          }
        }
      }
    } catch (err) {
      console.error('Failed to persist settings:', err);
    }
  }

  async function addSite(raw) {
    const site = normalizeHost(raw);
    if (!site) {
      siteInput.classList.add('input-error');
      siteInput.focus();
      return;
    }
    siteInput.classList.remove('input-error');

    if (!currentSettings.allowedSites.includes(site)) {
      currentSettings.allowedSites.push(site);
      await persistAndNotify();
      renderSiteList();
      renderCurrentSiteStatus();
    }
    siteInput.value = '';
  }

  // ---- Event listeners ----

  enabledToggle.addEventListener('change', async () => {
    currentSettings.enabled = enabledToggle.checked;
    updateUI();
    await persistAndNotify();
  });

  allowlistToggle.addEventListener('change', async () => {
    currentSettings.useAllowlist = allowlistToggle.checked;
    updateUI();
    renderCurrentSiteStatus();
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

  addSiteBtn.addEventListener('click', () => addSite(siteInput.value));
  siteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite(siteInput.value);
  });
  siteInput.addEventListener('input', () => {
    siteInput.classList.remove('input-error');
  });

  addCurrentSiteBtn.addEventListener('click', async () => {
    if (activeHostname) {
      await addSite(activeHostname);
    } else {
      setCurrentSiteStatus('gray', 'صفحه فعلی قابل تشخیص نیست (صفحه داخلی مرورگر)');
    }
  });

  // ---- Init ----

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
      if (stored.enabled !== undefined) currentSettings.enabled = Boolean(stored.enabled);
      if (stored.direction) currentSettings.direction = stored.direction;
      if (stored.useAllowlist !== undefined) currentSettings.useAllowlist = Boolean(stored.useAllowlist);
      if (Array.isArray(stored.allowedSites)) {
        currentSettings.allowedSites = stored.allowedSites
          .map((s) => normalizeHost(s))
          .filter(Boolean);
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  const tab = await getActiveTab();
  activeHostname = tab?.url ? hostFromUrl(tab.url) : null;

  renderSiteList();
  updateUI();
  renderCurrentSiteStatus();
});
