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
  const ZEN_DEV_URL_VERSION = '20260414-4';
  console.log(`%c[zen-dev-url] v${ZEN_DEV_URL_VERSION} loaded`, 'color:#ff6b35;font-weight:bold');

  // Prevent double-init across window reloads
  if (window.__zenDevUrlDetector) return;

  const detector = {
    /** about:config preference key that enables/disables the indicator */
    PREF: 'zen.urlbar.show-dev-indicator',

    /** Exact hostnames always treated as dev.
     *  Note: nsIURI.host returns IPv6 addresses WITHOUT brackets
     *  (e.g. http://[::1]:8080/ → uri.host === '::1'), so we store
     *  the bare form here to match. */
    _devHosts: new Set(['localhost', '127.0.0.1', '::1']),

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

    /**
     * Cached pref values. Populated by _readPrefs() at init() and refreshed
     * on every observed pref change. Reading prefs synchronously on every
     * navigation/tab-switch is wasteful; the observer already fires on any
     * change, so a single read pass on each change is enough.
     */
    _prefs: null,

    /**
     * Reads (or re-reads) all observed prefs into this._prefs.
     * Call once in init() then again inside observe() on any pref change.
     */
    _readPrefs() {
      const sp = Services.prefs;
      const rawPorts    = sp.getStringPref('zen.urlbar.dev-indicator.custom-ports', '');
      const rawPatterns = sp.getStringPref('zen.urlbar.dev-indicator.custom-patterns', '');

      // Pre-parse ports into a Set for O(1) lookup in _isDevUri
      const portSet = new Set(
        rawPorts.split(',').map(p => p.trim()).filter(Boolean)
      );

      // Pre-compile host patterns; bad patterns are skipped silently
      const patternRes = [];
      for (const pat of rawPatterns.split(',').map(p => p.trim()).filter(Boolean)) {
        try {
          patternRes.push(new RegExp(
            '^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
          ));
        } catch { /* invalid glob — skip */ }
      }

      this._prefs = {
        enabled:          sp.getBoolPref(this.PREF, true),
        includeFileUrls:  sp.getBoolPref('zen.urlbar.dev-indicator.include-file-urls', false),
        includeZeroHost:  sp.getBoolPref('zen.urlbar.dev-indicator.include-zero-host', true),
        includeLocalTLDs: sp.getBoolPref('zen.urlbar.dev-indicator.include-local-tlds', true),
        portSet,
        patternRes,
        autoOpenDevtools: sp.getBoolPref('zen.urlbar.dev-indicator.auto-open-devtools', false),
        autoOpenPanel:    sp.getStringPref('zen.urlbar.dev-indicator.auto-open-panel', 'webconsole'),
      };
    },

    /**
     * Called once the browser window is ready. Sets up listeners and creates
     * the dev banner DOM element.
     */
    init() {
      // Populate pref cache before any _update() / _isDevUri() calls
      this._readPrefs();
      this._createBanner();
      // Listen for navigation in any tab
      gBrowser.addTabsProgressListener(this._progressListener);
      // Listen for tab switches
      window.addEventListener('TabSelect', this);
      // Listen for pref changes — _readPrefs() + _update() run on each change
      for (const key of [
        this.PREF,
        'zen.urlbar.dev-indicator.include-zero-host',
        'zen.urlbar.dev-indicator.include-local-tlds',
        'zen.urlbar.dev-indicator.include-file-urls',
        'zen.urlbar.dev-indicator.custom-ports',
        'zen.urlbar.dev-indicator.custom-patterns',
        'zen.urlbar.dev-indicator.auto-open-devtools',
        'zen.urlbar.dev-indicator.auto-open-panel',
      ]) {
        Services.prefs.addObserver(key, this);
      }
      // Top-level error handler: tag any uncaught error from our script so bug
      // reports include a recognisable prefix rather than a bare stack trace.
      window.addEventListener('error', (e) => {
        if (e.filename?.includes('zen-dev-url-detector.uc.js')) {
          console.error('[zen-dev-url] FATAL:', e.message, 'at', `${e.filename}:${e.lineno}`);
        }
      }, true);
      // Alt+Shift+D toggles dev mode for the current tab.
      // Works on any URL — forced-on overrides URL checks, forced-off suppresses
      // the banner even on dev URLs. mozSystemGroup: true fires before web content.
      window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && e.key === 'D') {
          // Respect the master off switch BEFORE eating the event — otherwise
          // a disabled mod still swallows the user's Alt+Shift+D.
          if (!this._prefs.enabled) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          const browser = gBrowser.selectedBrowser;
          const forced = this._forcedBrowsers.has(browser);
          const excluded = this._excludedBrowsers.has(browser);
          const currentlyShowing = (this._isDevUri(gBrowser.currentURI) && !excluded) || forced;
          if (currentlyShowing) {
            this._forcedBrowsers.delete(browser);
            this._excludedBrowsers.add(browser);
            this._showToast('◎  Dev banner off');
          } else {
            this._excludedBrowsers.delete(browser);
            this._forcedBrowsers.add(browser);
            this._showToast('◉  Dev banner on');
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
      // Arrow / Home / End keys on the editable field leak to Firefox's
       // toolbar-keynav (focusout chain shows `toolbartabstop` before urlbar
       // steals focus). Chrome sys-capture listeners run before ours and
       // stopImmediatePropagation there doesn't help — we never get called.
       // Fix: in capture phase on the field itself, do the caret move by hand
       // via Selection.modify(), then preventDefault + stopImmediatePropagation
       // so no chrome layer ever sees the arrow.
       const NAV = {
         ArrowLeft:  ['backward', 'character'],
         ArrowRight: ['forward',  'character'],
         ArrowUp:    ['backward', 'lineboundary'],
         ArrowDown:  ['forward',  'lineboundary'],
         Home:       ['backward', 'lineboundary'],
         End:        ['forward',  'lineboundary'],
       };
       field.addEventListener('keydown', (e) => {
         if (field.getAttribute('contenteditable') !== 'true') return;
         const spec = NAV[e.key];
         if (!spec) return;
         if (e.ctrlKey || e.metaKey) return;   // preserve Ctrl/Cmd-Home/End etc.
         const sel = window.getSelection();
         if (sel && sel.rangeCount && field.contains(sel.anchorNode)) {
           try { sel.modify(e.shiftKey ? 'extend' : 'move', spec[0], spec[1]); }
           catch (err) { console.error('[zen-dev-url] sel.modify failed:', err); }
         }
         e.preventDefault();
         e.stopImmediatePropagation();
       }, { capture: true });

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

      // Clear site data (cookies + localStorage + cache) for the current origin.
      // getBaseDomain() throws for localhost/IPs, so fall back to uri.host.
      // This Zen build's nsIClearDataService uses the OLD callback-based API —
      // the 4th argument is a required { onDataDeleted() } callback, not a Promise.
      // We pick whichever method is available and always pass the callback.
      const clearSiteData = makeBtn('zen-dev-url-clear-data', 'Clear site data + hard reload', () => {
        try {
          const uri = gBrowser.currentURI;
          let host;
          try { host = Services.eTLD.getBaseDomain(uri); }
          catch { host = uri.host; }
          // Use CLEAR_ALL_CACHES (network+image+JS+CSS+preflight+auth caches
          // combined) if available, otherwise fall back to individual names.
          const ciCD = Ci.nsIClearDataService;
          const cacheFlags = ciCD.CLEAR_ALL_CACHES
            ?? ((ciCD.CLEAR_CACHE ?? ciCD.CLEAR_NETWORK_CACHE ?? 0) | (ciCD.CLEAR_IMAGE_CACHE ?? 0) | (ciCD.CLEAR_JS_CACHE ?? 0) | (ciCD.CLEAR_CSS_CACHE ?? 0));
          const flags = (ciCD.CLEAR_COOKIES ?? 0) | (ciCD.CLEAR_DOM_STORAGES ?? 0) | cacheFlags;
          const cb = { onDataDeleted(resultFlags) {
            clearSiteData.setAttribute('data-done', '');
            setTimeout(() => clearSiteData.removeAttribute('data-done'), 1500);
            // Hard reload AFTER confirmed deletion so we know the page fetches fresh
            gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
          } };
          const hasBaseDomain = typeof Services.clearData.deleteDataFromBaseDomain === 'function';
          const fn = (hasBaseDomain
            ? Services.clearData.deleteDataFromBaseDomain
            : Services.clearData.deleteDataFromHost
          ).bind(Services.clearData);
          fn(host, false, flags, cb);
        } catch (e) {
          console.error('[zen-dev-url] clear site data failed:', e);
        }
      });

      // Reload — grouped visually with clear-data (both are page-state tools)
      const reloadBtn = makeBtn('zen-dev-url-clear-refresh', 'Clear cache and reload',
        () => gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE));

      // Screenshot button — grouped with devtools (it's a dev capture tool)
      const screenshotBtn = makeBtn('zen-dev-url-screenshot', 'Take screenshot',
        () => toggleScreenshot());

      // DevTools group: inspector, console, network (separate from page tools)
      const devButtons = [
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

      // Viewport size readout — updated on resize and tab/navigation changes
      const viewportEl = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      viewportEl.id = 'zen-dev-url-viewport';

      // Layout: [field] [copy] | sep | [clear-data] [reload] | sep | [screenshot] [inspector] [console] [network] | sep | [viewport] | sep | [gear]
      banner.appendChild(field);
      banner.appendChild(copyBtn);
      banner.appendChild(makeSeparator());
      banner.appendChild(clearSiteData);
      banner.appendChild(reloadBtn);
      banner.appendChild(makeSeparator());
      banner.appendChild(screenshotBtn);
      for (const btn of devButtons) {
        banner.appendChild(btn);
      }
      banner.appendChild(makeSeparator());
      banner.appendChild(viewportEl);
      banner.appendChild(makeSeparator());
      const settingsBtn = makeBtn('zen-dev-url-settings', 'Settings', () => detector._openSettings());
      banner.appendChild(settingsBtn);

      // Append inside #browser, not documentElement. #browser creates a
       // stacking context (position:relative; z-index:1) and contains
       // #navigator-toolbox — putting the banner here lets the floating
       // compact-mode sidebar slide OVER the banner on hover instead of
       // being clipped underneath. Fallback to documentElement pre-layout.
       (document.getElementById('browser') || document.documentElement).appendChild(banner);
      this._banner = banner;
      this._field = field;
      this._viewportEl = viewportEl;
      this._showDisplay = showDisplay;
      this._repositionBanner();
      this._createSettingsPanel();
      // Re-align banner and refresh viewport on resize.
      // Both window resize and ResizeObserver can fire many times per second
      // during a window-drag or sidebar-splitter drag — gate through a single
      // RAF so at most one reposition runs per frame.
      let rafPending = false;
      const onResize = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          this._repositionBanner();
          this._updateViewport();
        });
      };
      window.addEventListener('resize', onResize);
      // Window resize doesn't fire when only the sidebar width changes (e.g.
      // user toggles the sidebar or drags the splitter) — observe the content
      // panel directly so the banner follows its left edge and width.
      try {
        const tabpanels = document.getElementById('tabbrowser-tabpanels');
        if (tabpanels && typeof ResizeObserver === 'function') {
          this._tabpanelsObserver = new ResizeObserver(onResize);
          this._tabpanelsObserver.observe(tabpanels);
        }
      } catch (e) {
        console.error('[zen-dev-url] ResizeObserver setup failed:', e);
      }
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
      // Skip while layout is still initializing (common on window open) —
      // writing left:0/width:0 would briefly cover the sidebar.
      if (rect.width <= 0) return;
      this._banner.style.top = rect.top + 'px';
      this._banner.style.left = rect.left + 'px';
      this._banner.style.width = rect.width + 'px';
    },

    /**
     * Updates the viewport size readout (WxH of the selected browser's content area).
     */
    _updateViewport() {
      if (!this._viewportEl) return;
      const br = gBrowser.selectedBrowser?.getBoundingClientRect();
      if (br) this._viewportEl.textContent = `${Math.round(br.width)} × ${Math.round(br.height)}`;
    },

    /** Called when any observed pref changes — refresh cache then re-evaluate */
    observe() { this._readPrefs(); this._update(); },

    /** Called on TabSelect events */
    handleEvent() { this._update(); },

    /**
     * Returns true if the given URI should be treated as a dev URL.
     * @param {nsIURI} uri
     * @returns {boolean}
     */
    _isDevUri(uri) {
      if (!uri || !this._prefs) return false;
      try {
        const { scheme } = uri;
        if (scheme === 'file') return this._prefs.includeFileUrls;
        if (scheme !== 'http' && scheme !== 'https') return false;
        const host = uri.host ?? '';
        if (this._devHosts.has(host)) return true;
        if (host === '0.0.0.0' && this._prefs.includeZeroHost) return true;
        if (this._prefs.includeLocalTLDs && this._devTLDs.some(tld => host.endsWith(tld))) return true;
        // Custom ports — pre-parsed Set, O(1) lookup
        if (this._prefs.portSet.size > 0 && uri.port > 0 &&
            this._prefs.portSet.has(String(uri.port))) return true;
        // Custom host patterns — pre-compiled RegExps from _readPrefs()
        if (this._prefs.patternRes.some(re => re.test(host))) return true;
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
      const isDev = this._prefs?.enabled && ((this._isDevUri(currentUri) && !excluded) || forced);
      document.documentElement.toggleAttribute('zen-dev-url', isDev);
      if (isDev && currentUri) {
        if (this._field && this._field.getAttribute('contenteditable') === 'false') {
          this._showDisplay(currentUri.spec);
        }
        this._updateViewport();
        // Auto-open DevTools panel if setting is on and panel not already open
        if (this._prefs.autoOpenDevtools) {
          try {
            const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
            const toolbox = DevToolsShim.getToolboxForTab(gBrowser.selectedTab);
            if (!toolbox || toolbox._destroyer) {
              DevToolsShim.showToolboxForTab(gBrowser.selectedTab, { toolId: this._prefs.autoOpenPanel });
            }
          } catch { /* DevTools unavailable */ }
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
     * @param {boolean} [invert=false] - If true, display is opposite of pref value
     *   (e.g. pref "block_x=true" shown as toggle "Allow x=false")
     * @returns {HTMLElement}
     */
    _makeToggleRow(labelText, prefKey, defaultVal, invert = false) {
      const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.className = 'zen-dev-url-toggle-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const toggleLabel = document.createElementNS('http://www.w3.org/1999/xhtml', 'label');
      toggleLabel.className = 'zen-dev-url-toggle';

      const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      input.type = 'checkbox';
      input.dataset.pref = prefKey;
      input.dataset.invert = invert ? '1' : '';
      const raw = Services.prefs.getBoolPref(prefKey, defaultVal);
      input.checked = invert ? !raw : raw;
      input.addEventListener('change', () => {
        Services.prefs.setBoolPref(prefKey, invert ? !input.checked : input.checked);
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
     * Creates a select (dropdown) row for the settings panel.
     * @param {string} labelText
     * @param {string} prefKey
     * @param {{value:string, label:string}[]} options
     * @param {string} defaultVal
     * @returns {HTMLElement}
     */
    _makeSelectRow(labelText, prefKey, options, defaultVal) {
      const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.className = 'zen-dev-url-toggle-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const select = document.createElementNS('http://www.w3.org/1999/xhtml', 'select');
      select.className = 'zen-dev-url-select';
      select.dataset.pref = prefKey;
      const current = Services.prefs.getStringPref(prefKey, defaultVal);
      for (const opt of options) {
        const el = document.createElementNS('http://www.w3.org/1999/xhtml', 'option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (opt.value === current) el.selected = true;
        select.appendChild(el);
      }
      select.addEventListener('change', () => {
        Services.prefs.setStringPref(prefKey, select.value);
      });
      select.addEventListener('mousedown', e => e.stopPropagation());

      row.appendChild(label);
      row.appendChild(select);
      return row;
    },

    /**
     * Creates a section header label for the settings panel.
     * @param {string} text
     * @returns {HTMLElement}
     */
    _makeSectionHeader(text) {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      el.className = 'zen-dev-url-section-header';
      el.textContent = text;
      return el;
    },

    /**
     * Creates a thin horizontal divider for the settings panel.
     * @returns {HTMLElement}
     */
    _makePanelDivider() {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      el.className = 'zen-dev-url-panel-divider';
      return el;
    },

    /**
     * Creates a text input row for the settings panel (string prefs).
     * Changes are debounced 400ms then written to prefs and trigger _update().
     * @param {string} labelText - Human-readable label
     * @param {string} prefKey - about:config preference key
     * @param {string} placeholder - Placeholder text
     * @returns {HTMLElement}
     */
    _makeTextRow(labelText, prefKey, placeholder) {
      const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.className = 'zen-dev-url-text-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      input.type = 'text';
      input.className = 'zen-dev-url-text-input';
      input.dataset.pref = prefKey;
      input.placeholder = placeholder;
      input.value = Services.prefs.getStringPref(prefKey, '');

      let debounce;
      input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          Services.prefs.setStringPref(prefKey, input.value);
          detector._update();
        }, 400);
      });
      // Prevent the field from triggering banner edit on click
      input.addEventListener('mousedown', e => e.stopPropagation());

      row.appendChild(label);
      row.appendChild(input);
      return row;
    },

    /**
     * Creates a full-width action button row for the settings panel.
     * Clicking it executes the action and closes the panel.
     * @param {string} labelText
     * @param {Function} action
     * @returns {HTMLElement}
     */
    _makeActionRow(labelText, action) {
      const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.className = 'zen-dev-url-action-row';
      const btn = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
      btn.className = 'zen-dev-url-action-btn';
      btn.textContent = labelText;
      btn.addEventListener('click', () => {
        action();
        detector._closeSettings();
      });
      row.appendChild(btn);
      return row;
    },

    /**
     * Creates and appends the floating settings panel to the document root.
     * The panel is hidden by default and shown by _openSettings().
     * Sections: Detection | Network | Page | DevTools | Actions
     */
    _createSettingsPanel() {
      const panel = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      panel.id = 'zen-dev-url-settings-panel';

      // ── Detection ─────────────────────────────────────────────
      panel.appendChild(this._makeSectionHeader('Detection'));
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
      panel.appendChild(this._makeToggleRow(
        'Show for file://',
        'zen.urlbar.dev-indicator.include-file-urls',
        false
      ));
      panel.appendChild(this._makeTextRow(
        'Custom ports',
        'zen.urlbar.dev-indicator.custom-ports',
        '3000, 5173, 8080, 8000'
      ));
      panel.appendChild(this._makeTextRow(
        'Custom host patterns',
        'zen.urlbar.dev-indicator.custom-patterns',
        '*.vercel.app, *.ngrok.io, *.loca.lt'
      ));

      // ── Network ───────────────────────────────────────────────
      panel.appendChild(this._makePanelDivider());
      panel.appendChild(this._makeSectionHeader('Network'));
      panel.appendChild(this._makeToggleRow(
        'Disable HTTP cache',
        'devtools.cache.disabled',
        false
      ));
      panel.appendChild(this._makeToggleRow(
        'Allow mixed content (HTTP on HTTPS)',
        'security.mixed_content.block_active_content',
        true,
        /* invert */ true
      ));

      // ── JavaScript ────────────────────────────────────────────
      panel.appendChild(this._makePanelDivider());
      panel.appendChild(this._makeSectionHeader('Page'));
      panel.appendChild(this._makeToggleRow(
        'Enable JavaScript',
        'javascript.enabled',
        true
      ));

      // ── DevTools ──────────────────────────────────────────────
      panel.appendChild(this._makePanelDivider());
      panel.appendChild(this._makeSectionHeader('DevTools'));
      const autoOpenRow = this._makeToggleRow(
        'Auto-open DevTools on dev URLs',
        'zen.urlbar.dev-indicator.auto-open-devtools',
        false
      );
      panel.appendChild(autoOpenRow);
      // Panel selector — indented sub-option, only active when auto-open is on
      const panelSelectRow = this._makeSelectRow(
        'Panel',
        'zen.urlbar.dev-indicator.auto-open-panel',
        [
          { value: 'webconsole', label: 'Console'   },
          { value: 'netmonitor', label: 'Network'   },
          { value: 'inspector',  label: 'Inspector' },
        ],
        'webconsole'
      );
      panelSelectRow.style.paddingLeft = '28px';
      const panelSelect = panelSelectRow.querySelector('select');
      const syncPanelRow = () => {
        const on = Services.prefs.getBoolPref('zen.urlbar.dev-indicator.auto-open-devtools', false);
        panelSelectRow.style.opacity = on ? '1' : '0.4';
        panelSelect.disabled = !on;
      };
      syncPanelRow();
      autoOpenRow.querySelector('input').addEventListener('change', syncPanelRow);
      panel.appendChild(panelSelectRow);

      // ── Actions ───────────────────────────────────────────────
      panel.appendChild(this._makePanelDivider());
      panel.appendChild(this._makeSectionHeader('Actions'));
      const sysPrincipal = () => Services.scriptSecurityManager.getSystemPrincipal();
      const ACTIONS = [
        ['Open in new tab', () => {
          const url = gBrowser.currentURI.spec;
          const tab = gBrowser.addTab(url, { triggeringPrincipal: sysPrincipal() });
          gBrowser.selectedTab = tab;
        }],
        ['Open in private window', () => {
          const url = gBrowser.currentURI.spec;
          const win = OpenBrowserWindow({ private: true });
          win.addEventListener('load', () => {
            // Defer one tick so all chrome init finishes before we navigate.
            // fixupAndLoadURIString lives on gBrowser (the tabbrowser), NOT on
            // selectedBrowser (the <browser> element).
            win.setTimeout(() => {
              try {
                win.gBrowser.fixupAndLoadURIString(url, {
                  triggeringPrincipal: sysPrincipal(),
                });
              } catch (e1) {
                try {
                  win.gURLBar.value = url;
                  win.gURLBar.handleCommand();
                } catch (e2) {
                  console.error('[zen-dev-url] private win: all nav methods failed:', e2.message);
                }
              }
            }, 0);
          }, { once: true });
        }],
        ['View page source', () => {
          const url = 'view-source:' + gBrowser.currentURI.spec;
          const tab = gBrowser.addTab(url, { triggeringPrincipal: sysPrincipal() });
          gBrowser.selectedTab = tab;
        }],
        ['Copy as curl', () => {
          const url = gBrowser.currentURI.spec;
          navigator.clipboard.writeText(`curl '${url.replace(/'/g, `'\\''`)}'`)
            .then(() => this._showToast('◉  Copied curl'))
            .catch(err => console.error('[zen-dev-url] clipboard write failed:', err));
        }],
      ];
      for (const [label, onClick] of ACTIONS) {
        panel.appendChild(this._makeActionRow(label, onClick));
      }

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
      // Refresh all input/select states from live prefs
      this._settingsPanel.querySelectorAll('input[data-pref], select[data-pref]').forEach(el => {
        const key = el.dataset.pref;
        if (el.tagName === 'SELECT') {
          el.value = Services.prefs.getStringPref(key, '');
        } else if (el.type === 'checkbox') {
          const raw = Services.prefs.getBoolPref(key, true);
          el.checked = el.dataset.invert ? !raw : raw;
        } else if (el.type === 'text') {
          el.value = Services.prefs.getStringPref(key, '');
        }
      });
      this._repositionPanel();
      this._settingsPanel.style.display = 'block';

      this._outsideClickHandler = (e) => {
        // Firefox renders native <select> option popups as XUL <menuitem>
        // elements inside a <menupopup> overlay — a completely separate DOM
        // tree that neither contains() nor composedPath() can reach from our
        // panel. Ignore all menuitem mousedowns while the panel is open;
        // our panel contains no menuitem elements so this is unambiguous.
        if (e.target.nodeName?.toLowerCase() === 'menuitem') return;

        // For all other targets, use composedPath() rather than contains() —
        // the select element itself has anonymous XUL chrome content that
        // contains() misses but composedPath() correctly includes.
        const gear = document.getElementById('zen-dev-url-settings');
        const panel = this._settingsPanel;
        if (e.composedPath().some(el => el === panel || el === gear)) return;
        this._closeSettings();
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

  // ── Self-tests ────────────────────────────────────────────────────────────
  // Off by default to keep the user's console quiet.
  // Contributors: flip zen.urlbar.dev-indicator.self-tests = true in about:config.
  if (Services.prefs.getBoolPref('zen.urlbar.dev-indicator.self-tests', false)) (function runSelfTests() {
    let pass = 0, fail = 0;

    function assert(description, actual, expected) {
      if (actual === expected) {
        pass++;
      } else {
        fail++;
        console.error(`[zen-dev-url] FAIL: ${description}\n  expected: ${expected}\n  got:      ${actual}`);
      }
    }

    // Glob pattern matching (same logic as _isDevUri custom patterns)
    function globMatch(pattern, host) {
      const re = new RegExp(
        '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return re.test(host);
    }

    assert('*.vercel.app matches subdomain',        globMatch('*.vercel.app', 'myapp.vercel.app'),       true);
    assert('*.vercel.app matches deep subdomain',   globMatch('*.vercel.app', 'pr-123.myapp.vercel.app'), true);
    assert('*.vercel.app does not match bare tld',  globMatch('*.vercel.app', 'vercel.app'),              false);
    assert('*.ngrok.io matches subdomain',          globMatch('*.ngrok.io',   'abc123.ngrok.io'),         true);
    assert('*.ngrok.io does not cross tlds',        globMatch('*.ngrok.io',   'abc.ngrok.com'),           false);
    assert('exact host matches',                    globMatch('myapp.local',  'myapp.local'),             true);
    assert('exact host does not match other',       globMatch('myapp.local',  'other.local'),             false);
    assert('? matches single char',                 globMatch('app-?.local',  'app-1.local'),             true);
    assert('? does not match two chars',            globMatch('app-?.local',  'app-12.local'),            false);

    // Verify the nsIClearDataService flag constants we depend on are defined
    const ciCD = Ci.nsIClearDataService;
    const cookieFlag  = ciCD?.CLEAR_COOKIES;
    const storageFlag = ciCD?.CLEAR_DOM_STORAGES;
    if (cookieFlag === undefined || storageFlag === undefined) {
      fail++;
      console.error('[zen-dev-url] FAIL: CLEAR_COOKIES or CLEAR_DOM_STORAGES is undefined — clear site data broken');
    } else {
      pass++;
    }
    const cacheFlag = ciCD?.CLEAR_ALL_CACHES ?? ciCD?.CLEAR_CACHE ?? ciCD?.CLEAR_NETWORK_CACHE;
    if (cacheFlag === undefined) {
      console.warn('[zen-dev-url] WARN: no cache clear constant found — cache will not be cleared on site data clear');
    }

    // Custom port matching
    function portMatch(customPorts, port) {
      if (!customPorts || port <= 0) return false;
      return customPorts.split(',').map(p => p.trim()).filter(Boolean).includes(String(port));
    }

    assert('port 3000 in list',     portMatch('3000, 5173, 8080', 3000), true);
    assert('port 5173 in list',     portMatch('3000, 5173, 8080', 5173), true);
    assert('port 9000 not in list', portMatch('3000, 5173, 8080', 9000), false);
    assert('port -1 never matches', portMatch('3000', -1),               false);
    assert('empty list never matches', portMatch('', 3000),              false);

    // IPv6 localhost: nsIURI.host returns '::1' (no brackets); _devHosts must
    // contain the bare form or the match silently fails for http://[::1]/ URLs.
    assert('IPv6 localhost (::1) is in _devHosts', detector._devHosts.has('::1'), true);

    const total = pass + fail;
    const status = fail === 0
      ? `%c[zen-dev-url] self-tests: ${pass}/${total} passed`
      : `%c[zen-dev-url] self-tests: ${fail} FAILED, ${pass}/${total} passed`;
    const style = fail === 0 ? 'color:#90ee90;font-weight:bold' : 'color:#ff4444;font-weight:bold';
    console.log(status, style);
  })();

  if (gBrowser) {
    detector.init();
  } else {
    window.addEventListener('DOMContentLoaded', () => detector.init(), { once: true });
  }
})();
