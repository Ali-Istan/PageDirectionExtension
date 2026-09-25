/**
 * Display Direction Switcher (LTR / RTL)
 * Content Script
 * 
 * Manages the activation state and direction attributes on the document.
 * Strictly excludes and protects:
 * 1. Code blocks: <div class="md-code-block md-code-block-light"> and its children.
 * 2. Sidebars / Menus: DeepSeek Sider, asides, navigation, and drawer panels.
 */

(function () {
  'use strict';

  // Prevent multiple initializations in the same frame
  if (window.__pds_initialized) return;
  window.__pds_initialized = true;

  // Default configuration
  let currentConfig = {
    enabled: true,
    direction: 'ltr', // 'ltr' (default) or 'rtl'
  };

  /**
   * Checks if an element is or is inside a protected code block.
   * Specifically targets <div class="md-code-block md-code-block-light"> and its children.
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
   * Targets DeepSeek sider (.dc04ec1d, .b8812f16, .a2f3d50e), aside, nav, and [role="navigation"].
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
   * Applies the current configuration to the document.
   */
  function applyState() {
    const root = document.documentElement;
    if (!root) return;

    if (currentConfig.enabled) {
      root.setAttribute('data-pds-enabled', 'true');
      root.setAttribute('data-pds-dir', currentConfig.direction);
    } else {
      root.removeAttribute('data-pds-enabled');
      root.removeAttribute('data-pds-dir');
    }
  }

  /**
   * Loads saved settings from chrome.storage
   */
  async function loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const stored = await chrome.storage.sync.get(['enabled', 'direction']);
        if (stored.enabled !== undefined) {
          currentConfig.enabled = Boolean(stored.enabled);
        }
        if (stored.direction) {
          currentConfig.direction = stored.direction;
        }
      }
    } catch (e) {
      console.warn('[PDS] Could not access chrome.storage.sync, using defaults:', e);
    }
    applyState();
  }

  // Initialize as soon as possible
  loadSettings();

  // Listen for storage changes in real time (e.g., when toggled from popup)
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' || areaName === 'local') {
        if (changes.enabled !== undefined) {
          currentConfig.enabled = Boolean(changes.enabled.newValue);
        }
        if (changes.direction !== undefined) {
          currentConfig.direction = changes.direction.newValue;
        }
        applyState();
      }
    });
  }

  // Listen for direct runtime messages from popup or background
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'PDS_UPDATE_STATE') {
        if (message.enabled !== undefined) currentConfig.enabled = Boolean(message.enabled);
        if (message.direction) currentConfig.direction = message.direction;
        applyState();
        sendResponse({ success: true, state: currentConfig });
      } else if (message && message.type === 'PDS_GET_STATE') {
        sendResponse({ success: true, state: currentConfig });
      }
      return true;
    });
  }

  // Double check once DOM is fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyState);
  } else {
    applyState();
  }

  // Expose API for testing environments
  if (typeof window !== 'undefined') {
    window.__pds = {
      getConfig: () => ({ ...currentConfig }),
      setConfig: (newConfig) => {
        currentConfig = { ...currentConfig, ...newConfig };
        applyState();
      },
      isProtectedCodeBlock,
      isProtectedSidebar,
      isProtected,
      applyState
    };
  }
})();
