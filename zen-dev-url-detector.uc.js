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
  // Prevent double-init across window reloads
  if (window.__zenDevUrlDetector) return;

  const detector = {
    /** about:config preference key that enables/disables the indicator */
    PREF: 'zen.urlbar.show-dev-indicator',

    /** Exact hostnames always treated as dev */
    _devHosts: new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']),

    /** TLD suffixes always treated as dev */
    _devTLDs: ['.local', '.localhost', '.internal', '.test'],

    /** Reference to the banner hbox element */
    _banner: null,

    /** Reference to the editable URL input inside the banner */
    _input: null,

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
      // Alt+Shift+D toggles dev mode.
      // mozSystemGroup: true fires before web content and other extensions,
      // so it wins regardless of what else has focus or is registered.
      window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && e.key === 'D') {
          e.preventDefault();
          e.stopImmediatePropagation();
          Services.prefs.setBoolPref(this.PREF, !this._enabled);
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

      // "DEV" badge shown on the left
      const badge = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      badge.id = 'zen-dev-url-badge';
      badge.textContent = 'DEV';

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

      // Layout: [badge] [field] [copy] | sep | [screenshot] | sep | [reload] [inspector] [console] [network]
      banner.appendChild(badge);
      banner.appendChild(field);
      banner.appendChild(copyBtn);
      banner.appendChild(makeSeparator());
      banner.appendChild(screenshotBtn);
      banner.appendChild(makeSeparator());
      for (const btn of devButtons) {
        banner.appendChild(btn);
      }

      document.documentElement.appendChild(banner);
      this._banner = banner;
      this._field = field;
      this._showDisplay = showDisplay;
      this._repositionBanner();
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
        if (scheme === 'file') return true;
        if (scheme !== 'http' && scheme !== 'https') return false;
        const host = uri.host ?? '';
        if (this._devHosts.has(host)) return true;
        if (this._devTLDs.some(tld => host.endsWith(tld))) return true;
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
      const isDev = this._enabled && this._isDevUri(currentUri);
      document.documentElement.toggleAttribute('zen-dev-url', isDev);
      if (isDev && currentUri) {
        if (this._field && this._field.getAttribute('contenteditable') === 'false') {
          this._showDisplay(currentUri.spec);
        }
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
