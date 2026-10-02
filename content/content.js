/**
 * Display Direction Switcher (LTR / RTL)
 * Content Script
 *
 * Behavior:
 * - Direction is applied ONLY when BOTH conditions are true:
 *     1. The master switch "enabled" is ON.
 *     2. The current page host is inside the allowlist ("allowedSites"),
 *        unless the allowlist filter ("useAllowlist") is turned OFF.
 * - On every other page this script removes its attributes and does
 *   nothing else. Because ALL CSS rules are gated behind
 *   html[data-pds-enabled="true"], pages outside the allowlist are
 *   never affected in any way.
 *
 * Protected elements (only when active):
 * 1. Code blocks: <div class="md-code-block md-code-block-light"> + children.
 * 2. Sidebars / Menus: DeepSeek Sider, asides, navigation, drawer panels.
 */

(function () {
  'use strict';

  // Prevent multiple initializations in the same frame
  if (window.__pds_initialized) return;
  window.__pds_initialized = true;

  const DEFAULTS = {
    enabled: true,
    direction: 'ltr', // 'ltr' (default) or 'rtl'
    useAllowlist: true,
    allowedSites: [] // base hosts, e.g. ['chat.deepseek.com', 'chatgpt.com']
  };

  let currentConfig = { ...DEFAULTS };

  /**
   * Injects an @font-face for the bundled Vazirmatn font using an absolute
   * extension URL. Relative URLs inside extension CSS resolve against the
   * page URL, so this must be done from JavaScript.
   * Falls back to locally installed Vazirmatn / Vazir if present.
   */
  let fontFaceInjected = false;

  function injectFontFace() {
    if (fontFaceInjected) return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return;
      const head = document.head;
      if (!head) return; // not ready yet; retried on DOMContentLoaded

      const url = chrome.runtime.getURL('fonts/Vazirmatn-var.woff2');
      const style = document.createElement('style');
      style.setAttribute('data-pds-font-face', '');
      style.textContent =
        "@font-face{font-family:'Vazirmatn PDS';" +
        "src:local('Vazirmatn'),local('Vazirmatn Regular'),local('Vazir')," +
        "url('" + url + "') format('woff2');" +
        'font-weight:100 900;font-style:normal;font-display:swap;}';
      head.appendChild(style);
      fontFaceInjected = true;
    } catch (e) {
      /* ignore */
    }
  }

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

  /**
   * Returns true when "hostname" matches any base site in the list.
   * Example: host 'chat.deepseek.com' matches entry 'deepseek.com'
   * because the host ends with '.deepseek.com'.
   */
  function isHostAllowed(hostname, sites) {
    const host = normalizeHost(hostname);
    if (!host) return false;
    const list = Array.isArray(sites) ? sites : [];
    return list.some((entry) => {
      const site = normalizeHost(entry);
      if (!site) return false;
      return host === site || host.endsWith('.' + site);
    });
  }

  /**
   * Decides whether the extension should act on the current page.
   */
  function isCurrentPageAllowed() {
    if (!currentConfig.useAllowlist) return true;
    return isHostAllowed(location.hostname, currentConfig.allowedSites);
  }

  /**
   * Checks if an element is or is inside a protected code block.
   */
  function isProtectedCodeBlock(element) {
    if (!element || !(element instanceof Element)) return false;
    return Boolean(
      element.classList?.contains('md-code-block') ||
      element.classList?.contains('md-code-block-light') ||
      element.closest('.md-code-block')
    );
  }

  /**
   * Checks if an element is or is inside a protected sidebar or navigation menu.
   */
  function isProtectedSidebar(element) {
    if (!element || !(element instanceof Element)) return false;
    return Boolean(
      element.closest('aside') ||
      element.closest('nav') ||
      element.closest('[role="navigation"]') ||
      element.closest('.dc04ec1d') ||
      element.closest('.b8812f16') ||
      element.closest('.a2f3d50e') ||
      element.closest('[class*="sider" i]') ||
      element.closest('[class*="sidebar" i]')
    );
  }

  /**
   * Combined check for any protected element (code block or sidebar).
   */
  function isProtected(element) {
    return isProtectedCodeBlock(element) || isProtectedSidebar(element);
  }

  /**
   * Code-like areas that must never be forced to RTL (editors, <pre>, <code>).
   */
  function isCodeLike(element) {
    if (!element || !element.closest) return false;
    return Boolean(
      element.closest('pre, code, .monaco-editor, .CodeMirror, .cm-editor, .ace_editor, .md-code-block')
    );
  }

  /**
   * Some chat sites (e.g. DeepSeek) put `dir="auto"` or
   * `unicode-bidi: plaintext` on message bubbles. That makes every line
   * resolve its own direction from its first strong character, so a line
   * starting with an English word stays LTR. Such elements are marked with
   * data-pds-rtl="true" so the CSS can force a real RTL base direction.
   */
  const FORCED_ATTR = 'data-pds-rtl';
  const FONT_ATTR = 'data-pds-font';

  // Persian / Arabic / Hebrew letters that indicate right-to-left text.
  const RTL_CHARS = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;

  // Block-level tags: if an element contains any of these, it is a wrapper
  // (not a leaf text block) and must not be flipped on its own.
  const BLOCK_DESCENDANTS =
    'div, p, section, article, ul, ol, li, table, form, header, footer, ' +
    'nav, aside, main, figure, details, h1, h2, h3, h4, h5, h6, pre, blockquote';

  function shouldForceRtl(element) {
    if (!(element instanceof Element)) return false;
    if (element.hasAttribute(FORCED_ATTR)) return false;
    if (isProtected(element) || isCodeLike(element)) return false;

    const dir = element.getAttribute('dir');
    let unicodeBidi = '';
    let display = '';
    let direction = '';
    try {
      const cs = window.getComputedStyle(element);
      unicodeBidi = cs.unicodeBidi;
      display = cs.display;
      direction = cs.direction;
    } catch (e) {
      return false;
    }

    // Never force RTL on flex/grid containers: `direction` reorders children.
    if (/flex|grid/.test(display)) return false;

    // Case 1: the site itself marks the element as auto/plaintext.
    // It is safe (and intended) to force such an element to RTL.
    if (dir === 'auto' || unicodeBidi === 'plaintext') return true;

    // Case 2: the element is still laid out LTR but contains Persian text
    // (e.g. a plain <div> message bubble). Only force true "leaf" text
    // blocks, never wrappers, so page layout is left untouched.
    if (direction === 'ltr' && RTL_CHARS.test(element.textContent || '')) {
      if (!element.querySelector(BLOCK_DESCENDANTS)) return true;
    }

    return false;
  }

  function forceRtlOn(element) {
    element.setAttribute(FORCED_ATTR, element.getAttribute('dir') || '');
    element.setAttribute('dir', 'rtl');
  }

  function clearRtlMarks(scope) {
    const root = scope || document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[' + FORCED_ATTR + ']').forEach((el) => {
      const previousDir = el.getAttribute(FORCED_ATTR);
      if (previousDir) {
        el.setAttribute('dir', previousDir);
      } else {
        el.removeAttribute('dir');
      }
      el.removeAttribute(FORCED_ATTR);
    });
  }

  function clearFontMarks(scope) {
    const root = scope || document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[' + FONT_ATTR + ']').forEach((el) => {
      el.removeAttribute(FONT_ATTR);
    });
  }

  function markFont(element) {
    if (!element.hasAttribute(FONT_ATTR)) {
      element.setAttribute(FONT_ATTR, 'vazirmatn');
    }
  }

  const SHOW_TEXT = 4; // NodeFilter.SHOW_TEXT
  const REJECT = 2;    // NodeFilter.FILTER_REJECT
  const ACCEPT = 1;    // NodeFilter.FILTER_ACCEPT

  function isPageActive() {
    return Boolean(currentConfig.enabled) && isCurrentPageAllowed();
  }

  /**
   * Processes all text nodes inside `root`:
   *   - marks Persian text elements with data-pds-font (Vazirmatn font), and
   *   - in RTL mode, forces auto-directional/LTR text elements to RTL.
   * Only text nodes are visited, so exactly the elements that render text are
   * touched. Code blocks, editors and sidebars are always skipped.
   */
  function syncTextNodes(root) {
    if (!root || root.nodeType !== 1) return;
    if (isProtected(root) || isCodeLike(root)) return;

    // If the container itself is auto-directional, force it once; its text
    // children then inherit RTL.
    if (currentConfig.direction === 'rtl' && shouldForceRtl(root)) {
      forceRtlOn(root);
    }

    const walker = document.createTreeWalker(root, SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return REJECT;
        const parent = node.parentElement;
        if (!parent) return REJECT;
        if (isProtected(parent) || isCodeLike(parent)) return REJECT;
        return ACCEPT;
      }
    });

    const seen = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el) continue;

      // Vazirmatn for Persian/Arabic text (any direction mode).
      if (RTL_CHARS.test(node.nodeValue)) markFont(el);

      // Force RTL only in RTL mode.
      if (currentConfig.direction === 'rtl' && !seen.has(el)) {
        seen.add(el);
        if (shouldForceRtl(el)) forceRtlOn(el);
      }
    }
  }

  /**
   * Applies or clears all page marks depending on the current state.
   */
  function syncPage() {
    if (!isPageActive()) {
      clearRtlMarks();
      clearFontMarks();
      return;
    }
    if (currentConfig.direction !== 'rtl') {
      clearRtlMarks();
    }
    if (document.body) syncTextNodes(document.body);
  }

  let textSyncTimer = null;
  let pendingRoots = new Set();

  /**
   * Schedules a sync. When a root node is given (from a DOM mutation), only
   * that subtree is scanned; otherwise a full scan runs.
   */
  function scheduleTextDirectionSync(root) {
    if (root && root.nodeType === 1) {
      pendingRoots.add(root);
    } else if (root && root.parentElement) {
      pendingRoots.add(root.parentElement);
    } else {
      pendingRoots.add(document.body || document.documentElement);
    }

    if (textSyncTimer) return;
    textSyncTimer = setTimeout(() => {
      textSyncTimer = null;
      const roots = Array.from(pendingRoots).filter(Boolean);
      pendingRoots = new Set();

      if (!isPageActive()) {
        clearRtlMarks();
        clearFontMarks();
        return;
      }
      if (currentConfig.direction !== 'rtl') {
        clearRtlMarks();
      }

      for (const node of roots) {
        if (!node.isConnected) continue;
        syncTextNodes(node);
      }
    }, 100);
  }

  /**
   * Applies the current configuration to the document.
   * When the page is not allowed (or disabled), the attributes are removed
   * and therefore the gated CSS has zero effect.
   */
  function applyState() {
    const root = document.documentElement;
    if (!root) return;

    const shouldApply = Boolean(currentConfig.enabled) && isCurrentPageAllowed();

    if (shouldApply) {
      root.setAttribute('data-pds-enabled', 'true');
      root.setAttribute('data-pds-dir', currentConfig.direction === 'rtl' ? 'rtl' : 'ltr');
    } else {
      root.removeAttribute('data-pds-enabled');
      root.removeAttribute('data-pds-dir');
    }

    scheduleTextDirectionSync();
  }

  /**
   * Merges stored/message values into the current configuration.
   */
  function mergeSettings(values) {
    if (!values) return;
    if (values.enabled !== undefined) {
      currentConfig.enabled = Boolean(values.enabled);
    }
    if (values.direction) {
      currentConfig.direction = values.direction === 'rtl' ? 'rtl' : 'ltr';
    }
    if (values.useAllowlist !== undefined) {
      currentConfig.useAllowlist = Boolean(values.useAllowlist);
    }
    if (Array.isArray(values.allowedSites)) {
      currentConfig.allowedSites = values.allowedSites
        .map((s) => normalizeHost(s))
        .filter(Boolean);
    }
  }

  /**
   * Reports the page state to the background service worker so the
   * toolbar badge can reflect this tab's real status.
   */
  function reportToBackground() {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const p = chrome.runtime.sendMessage({
          type: 'PDS_PAGE_REPORT',
          enabled: Boolean(currentConfig.enabled),
          direction: currentConfig.direction,
          pageAllowed: isCurrentPageAllowed()
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Loads saved settings from chrome.storage
   */
  async function loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
        mergeSettings(stored);
      }
    } catch (e) {
      console.warn('[PDS] Could not access chrome.storage.sync, using defaults:', e);
    }
    applyState();
    reportToBackground();
  }

  // Initialize as soon as possible
  loadSettings();

  // React to setting changes in real time (popup saves to storage)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync' && areaName !== 'local') return;
      mergeSettings({
        enabled: changes.enabled ? changes.enabled.newValue : undefined,
        direction: changes.direction ? changes.direction.newValue : undefined,
        useAllowlist: changes.useAllowlist ? changes.useAllowlist.newValue : undefined,
        allowedSites: changes.allowedSites ? changes.allowedSites.newValue : undefined
      });
      applyState();
      reportToBackground();
    });
  }

  // Listen for direct runtime messages from popup or background
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'PDS_UPDATE_STATE') {
        mergeSettings(message);
        applyState();
        reportToBackground();
        sendResponse({
          success: true,
          state: { ...currentConfig },
          pageAllowed: isCurrentPageAllowed(),
          hostname: normalizeHost(location.hostname)
        });
      } else if (message && message.type === 'PDS_GET_STATE') {
        sendResponse({
          success: true,
          state: { ...currentConfig },
          pageAllowed: isCurrentPageAllowed(),
          hostname: normalizeHost(location.hostname)
        });
      }
      return true;
    });
  }

  // Keep the forced RTL marks up to date as the chat renders new messages.
  function startTextObserver() {
    if (!document.documentElement || window.__pds_observer) return;
    try {
      window.__pds_observer = new MutationObserver((mutations) => {
        if (!isPageActive()) return;
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') {
            scheduleTextDirectionSync(mutation.target.parentElement);
          } else {
            for (const added of mutation.addedNodes) {
              if (added.nodeType === 1) scheduleTextDirectionSync(added);
            }
          }
        }
      });
      window.__pds_observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (e) {
      /* MutationObserver unavailable */
    }
  }

  startTextObserver();

  // Inject the bundled font as early as possible, then retry once <head>
  // is available.
  injectFontFace();

  // Double check once DOM is fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectFontFace();
      applyState();
      reportToBackground();
    });
  } else {
    injectFontFace();
    applyState();
  }

  // Expose API for testing environments
  if (typeof window !== 'undefined') {
    window.__pds = {
      getConfig: () => ({ ...currentConfig }),
      setConfig: (newConfig) => {
        mergeSettings(newConfig);
        applyState();
      },
      normalizeHost,
      isHostAllowed,
      isCurrentPageAllowed,
      isProtectedCodeBlock,
      isProtectedSidebar,
      isProtected,
      syncPage,
      syncTextNodes,
      clearRtlMarks,
      clearFontMarks,
      applyState
    };
  }
})();
