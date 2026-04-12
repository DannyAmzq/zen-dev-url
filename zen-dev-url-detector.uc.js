// ==UserScript==
// @name           zen-dev-url-detector
// @description    Highlights the URL bar and shows a dev banner when on localhost or local dev URLs
// ==/UserScript==

/**
 * zen-dev-url-detector
 *
 * Detects when the active tab is on a local dev URL (localhost, 127.0.0.1,
 * file://, .local TLDs, etc.) and toggles a `zen-dev-url` attribute on the
 * document root. CSS in zen-dev-url.css uses that attribute to show the dev
 * banner and highlight the sidebar URL bar.
 *
 * Requires fx-autoconfig to load this script:
 * https://github.com/MrOtherGuy/fx-autoconfig
 *
 * Toggle the feature via about:config:
 *   zen.urlbar.show-dev-indicator = true/false
 */

(function () {
  const ZEN_DEV_URL_VERSION = '20260412-7';
  console.log(`%c[zen-dev-url] v${ZEN_DEV_URL_VERSION} loaded`, 'color:#ff6b35;font-weight:bold');

  // Prevent double-init across window reloads
  if (window.__zenDevUrlDetector) return;

  const detector = {
    /** about:config preference key that enables/disables the indicator */
    PREF: 'zen.urlbar.show-dev-indicator',

    /** Exact hostnames always treated as dev */
    _devHosts: new Set(['localhost', '127.0.0.1', '[::1]']),

    /** TLD suffixes always treated as dev */
    _devTLDs: ['.local', '.localhost', '.internal', '.test'],

    /** Reference to the banner hbox element */
    _banner: null,

    /** Reference to the editable URL input inside the banner */
    _input: null,

    /** Tabs manually forced into dev mode regardless of URL */
    _forcedBrowsers: new WeakSet(),

    /** Tabs manually suppressed from dev mode (overrides URL match) */
    _excludedBrowsers: new WeakSet(),

    get _enabled() {
      return Services.prefs.getBoolPref(this.PREF, true);
    },

    /**
     * Called once the browser window is ready. Sets up listeners and creates
     * the dev banner DOM element.
     */
    init() {
      this._createBanner();
      // Listen for navigation in any tab
      gBrowser.addTabsProgressListener(this._progressListener);
      // Listen for tab switches
      window.addEventListener('TabSelect', this);
      // Listen for pref changes
      Services.prefs.addObserver(this.PREF, this);
      Services.prefs.addObserver('zen.urlbar.dev-indicator.include-zero-host', this);
      Services.prefs.addObserver('zen.urlbar.dev-indicator.include-local-tlds', this);
      // Alt+Shift+D toggles dev mode for the current tab.
      // Works on any URL — forced-on overrides URL checks, forced-off suppresses
      // the banner even on dev URLs. mozSystemGroup: true fires before web content.
      window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && e.key === 'D') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!this._enabled) return;
          const browser = gBrowser.selectedBrowser;
          const forced = this._forcedBrowsers.has(browser);
          const excluded = this._excludedBrowsers.has(browser);
          const currentlyShowing = (this._isDevUri(gBrowser.currentURI) && !excluded) || forced;
          if (currentlyShowing) {
            this._forcedBrowsers.delete(browser);
            this._excludedBrowsers.add(browser);
            this._showToast('Dev mode off');
          } else {
            this._excludedBrowsers.delete(browser);
            this._forcedBrowsers.add(browser);
            this._showToast('Dev mode on');
          }
          this._update();
        }
      }, { capture: true, mozSystemGroup: true });
      this._update();
    },

    /**
     * Builds and appends the dev banner to the document root.
     * The banner contains an editable URL input and action buttons.
     * It is positioned over the content area via _repositionBanner().
     */
    _createBanner() {
      const banner = document.createXULElement('hbox');
      banner.id = 'zen-dev-url-banner';

      // Single contenteditable div — always the same element so text never
      // shifts position. Shows styled protocol/host HTML in display mode;
      // switches to plain editable text on mousedown.
      const field = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      field.id = 'zen-dev-url-field';
      field.setAttribute('contenteditable', 'false');
      field.spellcheck = false;

      const showDisplay = (spec) => {
        field.setAttribute('contenteditable', 'false');
        const match = spec.match(/^((?:https?|file):\/\/\/?)(.*)/);
        field.innerHTML = '';
        if (match) {
          const proto = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
          proto.className = 'zen-dev-url-protocol';
          proto.textContent = match[1];
          const host = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
          host.className = 'zen-dev-url-host';
          host.textContent = match[2];
          field.appendChild(proto);
          field.appendChild(host);
        } else {
          field.textContent = spec;
        }
      };

      // Switch to plain text on mousedown so the browser positions the cursor
      // at the exact click point within the now-plain content.
      field.addEventListener('mousedown', () => {
        if (field.getAttribute('contenteditable') === 'false') {
          field.textContent = gBrowser.currentURI.spec;
          field.setAttribute('contenteditable', 'true');
        }
      });
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = field.textContent.trim();
          if (val) {
            gURLBar.value = val;
            gURLBar.handleCommand();
          }
          field.blur();
        } else if (e.key === 'Escape') {
          showDisplay(gBrowser.currentURI.spec);
          field.blur();
        }
      });
      field.addEventListener('dblclick', () => {
        const range = document.createRange();
        range.selectNodeContents(field);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
      field.addEventListener('blur', () => {
        showDisplay(gBrowser.currentURI.spec);
      });

      /**
       * Lazily loads DevToolsShim so DevTools panels can be opened/closed
       * without importing the module at startup.
       * @returns {DevToolsShim|null}
       */
      const getDevTools = () => {
        try {
          const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
          return DevToolsShim;
        } catch (e) {
          console.error('[zen-dev-url] could not load DevToolsShim:', e);
          return null;
        }
      };

      /**
       * Opens a DevTools panel for the current tab, or closes it if it is
       * already the active panel.
       * @param {string} toolId - DevTools panel ID (e.g. 'webconsole', 'netmonitor')
       */
      const togglePanel = (toolId) => {
        const dt = getDevTools();
        if (!dt) return;
        const toolbox = dt.getToolboxForTab(gBrowser.selectedTab);
        if (toolbox && !toolbox._destroyer) {
          if (toolbox.currentToolId === toolId) {
            toolbox.destroy();
            return;
          }
        }
        dt.showToolboxForTab(gBrowser.selectedTab, { toolId });
      };

      /**
       * Toggles the Firefox Screenshots panel. If the panel is already visible
       * it cancels it; otherwise it opens it.
       */
      const toggleScreenshot = () => {
        const panel = document.querySelector('.screenshotsPagePanel');
        if (panel && getComputedStyle(panel).display !== 'none') {
          Services.obs.notifyObservers(window, 'screenshots-cancel-screenshot');
        } else {
          Services.obs.notifyObservers(window, 'menuitem-screenshot');
        }
      };

      const makeSeparator = () => {
        const sep = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
        sep.className = 'zen-dev-url-separator';
        return sep;
      };

      const makeBtn = (id, title, action) => {
        const btn = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
        btn.id = id;
        btn.className = 'zen-dev-url-btn';
        btn.title = title;
        btn.addEventListener('click', action);
        return btn;
      };

      // Copy URL button — lives at the right edge of the URL display area
      const copyBtn = makeBtn('zen-dev-url-copy-link', 'Copy URL', () => {
        gZenCommonActions.copyCurrentURLToClipboard();
        copyBtn.setAttribute('data-copied', '');
        setTimeout(() => copyBtn.removeAttribute('data-copied'), 1500);
      });

      // Screenshot button — isolated between separators
      const screenshotBtn = makeBtn('zen-dev-url-screenshot', 'Take screenshot',
        () => toggleScreenshot());

      // DevTools group: reload, inspector, console, network
      const devButtons = [
        makeBtn('zen-dev-url-clear-refresh', 'Clear cache and reload',
          () => gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE)),
        makeBtn('zen-dev-url-inspector', 'Inspect element', () => {
          const dt = getDevTools();
          if (!dt) return;
          const toolbox = dt.getToolboxForTab(gBrowser.selectedTab);
          // Close inspector if already open
          if (toolbox && !toolbox._destroyer && toolbox.currentToolId === 'inspector') {
            toolbox.destroy();
            return;
          }
          // Open inspector and immediately activate the node picker
          dt.showToolboxForTab(gBrowser.selectedTab, { toolId: 'inspector' })
            .then(tb => tb?.nodePicker?.start(tb.currentTarget, tb))
            .catch(e => console.error('[zen-dev-url] picker error:', e));
        }),
        makeBtn('zen-dev-url-console', 'Open console', () => togglePanel('webconsole')),
        makeBtn('zen-dev-url-network', 'Open network panel', () => togglePanel('netmonitor')),
      ];

      // Layout: [field] [copy] | sep | [screenshot] | sep | [reload] [inspector] [console] [network] | sep | [gear]
      banner.appendChild(field);
      banner.appendChild(copyBtn);
      banner.appendChild(makeSeparator());
      banner.appendChild(screenshotBtn);
      banner.appendChild(makeSeparator());
      for (const btn of devButtons) {
        banner.appendChild(btn);
      }
      banner.appendChild(makeSeparator());
      const settingsBtn = makeBtn('zen-dev-url-settings', 'Settings', () => detector._openSettings());
      banner.appendChild(settingsBtn);

      document.documentElement.appendChild(banner);
      this._banner = banner;
      this._field = field;
      this._showDisplay = showDisplay;
      this._repositionBanner();
      this._createSettingsPanel();
      // Re-align banner if window is resized or sidebar width changes
      window.addEventListener('resize', () => this._repositionBanner());
    },

    /**
     * Aligns the banner's position and width to match the content area
     * (#tabbrowser-tabpanels), keeping it above the web page regardless of
     * sidebar width.
     */
    _repositionBanner() {
      const tabpanels = document.getElementById('tabbrowser-tabpanels');
      if (!tabpanels || !this._banner) return;
      const rect = tabpanels.getBoundingClientRect();
      this._banner.style.top = rect.top + 'px';
      this._banner.style.left = rect.left + 'px';
      this._banner.style.width = rect.width + 'px';
    },

    /** Called when the zen.urlbar.show-dev-indicator pref changes */
    observe() { this._update(); },

    /** Called on TabSelect events */
    handleEvent() { this._update(); },

    /**
     * Returns true if the given URI should be treated as a dev URL.
     * @param {nsIURI} uri
     * @returns {boolean}
     */
    _isDevUri(uri) {
      if (!uri) return false;
      try {
        const { scheme } = uri;
        if (scheme !== 'http' && scheme !== 'https') return false;
        const host = uri.host ?? '';
        if (this._devHosts.has(host)) return true;
        if (host === '0.0.0.0' &&
            Services.prefs.getBoolPref('zen.urlbar.dev-indicator.include-zero-host', true))
          return true;
        if (Services.prefs.getBoolPref('zen.urlbar.dev-indicator.include-local-tlds', true) &&
            this._devTLDs.some(tld => host.endsWith(tld)))
          return true;
        return false;
      } catch { return false; }
    },

    /**
     * Recalculates whether the current tab is a dev URL and updates the
     * `zen-dev-url` attribute on the document root accordingly.
     * @param {nsIURI} [uri] - Override URI; defaults to the current tab's URI
     */
    _update(uri) {
      const currentUri = uri || gBrowser.currentURI;
      const browser = gBrowser.selectedBrowser;
      const forced = this._forcedBrowsers.has(browser);
      const excluded = this._excludedBrowsers.has(browser);
      const isDev = this._enabled && ((this._isDevUri(currentUri) && !excluded) || forced);
      document.documentElement.toggleAttribute('zen-dev-url', isDev);
      if (isDev && currentUri) {
        if (this._field && this._field.getAttribute('contenteditable') === 'false') {
          this._showDisplay(currentUri.spec);
        }
      }
    },

    /**
     * Shows a Zen toast notification with the given message.
     * Falls back silently if the API is unavailable.
     * @param {string} msg
     */
    _showToast(msg) {
      // Call gZenUIManager.showToast with a unique non-l10n ID so it creates
      // the native toast element + animation, then immediately override the
      // label's text before Fluent gets a chance to resolve the (unknown) ID.
      // showToast's element creation is synchronous (before its first await),
      // so lastElementChild of the container is our toast right after the call.
      try {
        const toastId = 'zen-dev-url-' + (msg.includes('on') ? 'on' : 'off');
        gZenUIManager.showToast(toastId, { timeout: 1800 });
        const label = document
          .getElementById('zen-toast-container')
          ?.lastElementChild
          ?.querySelector('label');
        if (label) {
          label.removeAttribute('data-l10n-id');
          label.removeAttribute('data-l10n-args');
          label.value = msg;
        }
      } catch {
        // Fallback if Zen internals unavailable
        let toast = document.getElementById('zen-dev-url-toast');
        if (!toast) {
          toast = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
          toast.id = 'zen-dev-url-toast';
          document.documentElement.appendChild(toast);
        }
        clearTimeout(this._toastTimer);
        toast.textContent = msg;
        toast.setAttribute('data-visible', '');
        this._toastTimer = setTimeout(() => toast.removeAttribute('data-visible'), 1800);
      }
    },

    /**
     * Creates a single toggle row for the settings panel.
     * @param {string} labelText - Human-readable label
     * @param {string} prefKey - about:config preference key
     * @param {boolean} defaultVal - Default value if pref is unset
     * @returns {HTMLElement}
     */
    _makeToggleRow(labelText, prefKey, defaultVal) {
      const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.className = 'zen-dev-url-toggle-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const toggleLabel = document.createElementNS('http://www.w3.org/1999/xhtml', 'label');
      toggleLabel.className = 'zen-dev-url-toggle';

      const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      input.type = 'checkbox';
      input.dataset.pref = prefKey;
      input.checked = Services.prefs.getBoolPref(prefKey, defaultVal);
      input.addEventListener('change', () => {
        Services.prefs.setBoolPref(prefKey, input.checked);
        detector._update();
      });

      const track = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      track.className = 'zen-dev-url-toggle-track';

      toggleLabel.appendChild(input);
      toggleLabel.appendChild(track);
      row.appendChild(label);
      row.appendChild(toggleLabel);
      return row;
    },

    /**
     * Creates and appends the floating settings panel to the document root.
     * The panel is hidden by default and shown by _openSettings().
     */
    _createSettingsPanel() {
      const panel = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      panel.id = 'zen-dev-url-settings-panel';
      panel.appendChild(this._makeToggleRow(
        'Show for 0.0.0.0',
        'zen.urlbar.dev-indicator.include-zero-host',
        true
      ));
      panel.appendChild(this._makeToggleRow(
        'Show for .local / .test / .internal',
        'zen.urlbar.dev-indicator.include-local-tlds',
        true
      ));
      document.documentElement.appendChild(panel);
      this._settingsPanel = panel;
    },

    /**
     * Repositions the settings panel so it sits below and right-aligns with
     * the gear button.
     */
    _repositionPanel() {
      const gear = document.getElementById('zen-dev-url-settings');
      if (!gear || !this._settingsPanel) return;
      const rect = gear.getBoundingClientRect();
      this._settingsPanel.style.top = (rect.bottom + 4) + 'px';
      this._settingsPanel.style.left = (rect.right - 260) + 'px';
    },

    /**
     * Opens the settings panel (or closes it if already open).
     * Refreshes checkbox states from live prefs on each open.
     */
    _openSettings() {
      if (this._settingsPanel && this._settingsPanel.style.display === 'block') {
        this._closeSettings();
        return;
      }
      // Refresh checkbox states from live prefs
      this._settingsPanel.querySelectorAll('input[data-pref]').forEach(input => {
        input.checked = Services.prefs.getBoolPref(input.dataset.pref, true);
      });
      this._repositionPanel();
      this._settingsPanel.style.display = 'block';

      this._outsideClickHandler = (e) => {
        const gear = document.getElementById('zen-dev-url-settings');
        if (!this._settingsPanel.contains(e.target) && e.target !== gear) {
          this._closeSettings();
        }
      };
      this._escapeHandler = (e) => {
        if (e.key === 'Escape') this._closeSettings();
      };
      document.addEventListener('mousedown', this._outsideClickHandler, true);
      window.addEventListener('keydown', this._escapeHandler, true);
    },

    /**
     * Closes the settings panel and cleans up its event listeners.
     */
    _closeSettings() {
      if (!this._settingsPanel) return;
      this._settingsPanel.style.display = 'none';
      if (this._outsideClickHandler) {
        document.removeEventListener('mousedown', this._outsideClickHandler, true);
        this._outsideClickHandler = null;
      }
      if (this._escapeHandler) {
        window.removeEventListener('keydown', this._escapeHandler, true);
        this._escapeHandler = null;
      }
    },

    /**
     * nsIWebProgressListener that fires on every navigation.
     * Uses addTabsProgressListener signature where the first argument is the
     * browser element (not aWebProgress).
     */
    _progressListener: {
      QueryInterface: ChromeUtils.generateQI(['nsIWebProgressListener']),
      onLocationChange(aBrowser, aWebProgress, _req, aLocation) {
        if (aWebProgress.isTopLevel && aBrowser === gBrowser.selectedBrowser) {
          detector._update(aLocation);
        }
      },
    },
  };

  window.__zenDevUrlDetector = detector;

  if (gBrowser) {
    detector.init();
  } else {
    window.addEventListener('DOMContentLoaded', () => detector.init(), { once: true });
  }
})();
