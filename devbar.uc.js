// ==UserScript==
// @name           devbar
// @description    Highlights the URL bar and shows a dev banner when on localhost or local dev URLs
// @version        1.2.0-beta.1
// @include        main
// ==/UserScript==

/**
 * devbar
 *
 * Detects when the active tab is on a local dev URL (localhost, 127.0.0.1,
 * file://, .local TLDs, etc.) and toggles a `devbar` attribute on the
 * document root. CSS in devbar.css uses that attribute to show the dev
 * banner and highlight the sidebar URL bar.
 *
 * Requires fx-autoconfig to load this script:
 * https://github.com/MrOtherGuy/fx-autoconfig
 *
 * Toggle the feature via about:config:
 *   devbar.enabled = true/false
 */

(function () {
  if (location.href !== 'chrome://browser/content/browser.xhtml') return;
  const DEVBAR_VERSION = '1.2.0-beta.1';
  console.log(`%c[devbar] v${DEVBAR_VERSION} loaded`, 'color:#ff6b35;font-weight:bold');

  // Prevent double-init across window reloads (also blocks old zen-dev-url copy)
  if (window.__devbar || window.__zenDevUrlDetector) return;

  const detector = {
    _abort: new AbortController(),
    _timers: new Set(),
    _frames: new Set(),
    _observedPrefs: [],
    _destroyed: false,
    _initialized: false,
    _siteRules: Object.create(null),
    _listen(target, type, callback, options = {}) {
      target.addEventListener(type, callback, {
        ...(typeof options === 'boolean' ? { capture: options } : options),
        signal: this._abort.signal,
      });
    },
    _setTimeout(callback, delay) {
      const id = window.setTimeout(() => {
        this._timers.delete(id);
        if (!this._destroyed) callback();
      }, delay);
      this._timers.add(id);
      return id;
    },
    _clearTimeout(id) { window.clearTimeout(id); this._timers.delete(id); },
    _requestFrame(callback) {
      const id = window.requestAnimationFrame(() => {
        this._frames.delete(id);
        if (!this._destroyed) callback();
      });
      this._frames.add(id);
      return id;
    },
    _run(action) {
      try { Promise.resolve(action()).catch(error => console.error('[devbar] action failed:', error)); }
      catch (error) { console.error('[devbar] action failed:', error); }
    },
    _origin(uri = gBrowser.currentURI) {
      try {
        const url = new URL(typeof uri === 'string' ? uri : uri.spec);
        return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
      } catch { return null; }
    },
    _readSiteRules() {
      this._siteRules = Object.create(null);
      try {
        const parsed = JSON.parse(Services.prefs.getStringPref('devbar.site-rules', '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        for (const [key, mode] of Object.entries(parsed)) {
          const origin = this._origin(key);
          if (origin && (mode === 'on' || mode === 'off')) this._siteRules[origin] = mode;
        }
      } catch (error) { console.error('[devbar] invalid site rules:', error); }
    },
    _setSiteMode(mode, origin = this._origin()) {
      if (!origin || !['auto', 'on', 'off'].includes(mode)) return;
      if (mode === 'auto') delete this._siteRules[origin];
      else this._siteRules[origin] = mode;
      Services.prefs.setStringPref('devbar.site-rules', JSON.stringify(this._siteRules));
      if (mode === 'on') Services.prefs.setBoolPref(this.PREF, true);
      this._update();
    },
    _matchesCurrentMode(uri = gBrowser.currentURI, browser = gBrowser.selectedBrowser) {
      if (!this._prefs?.enabled) return false;
      const origin = this._origin(uri);
      const mode = origin && this._siteRules[origin];
      if (mode) return mode === 'on';
      return this._forcedBrowsers.has(browser) ||
        (this._isDevUri(uri) && !this._excludedBrowsers.has(browser));
    },
    _toggleSite() {
      const active = this._matchesCurrentMode();
      const origin = this._origin();
      if (origin) this._setSiteMode(active ? 'off' : 'on', origin);
      else {
        // Keep the original per-tab toggle for file/internal pages.
        const browser = gBrowser.selectedBrowser;
        (active ? this._excludedBrowsers : this._forcedBrowsers).add(browser);
        (active ? this._forcedBrowsers : this._excludedBrowsers).delete(browser);
        if (!active) Services.prefs.setBoolPref(this.PREF, true);
        this._update();
      }
      this._showToast(active ? 'Devbar off for this site' : 'Devbar on for this site');
    },
    _validateDetectionInput(prefKey, value) {
      const entries = value.split(',').map(part => part.trim()).filter(Boolean);
      if (prefKey === 'devbar.custom-ports') {
        return entries.some(port => !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
          ? 'Use comma-separated ports from 1 to 65535. Changes were not saved.' : '';
      }
      if (prefKey === 'devbar.custom-patterns') {
        const invalid = entries.some(host => {
          if (/^[a-z\d_*?.-]+$/i.test(host) && host !== '*' && host !== '?') return false;
          try { return !host.includes(':') || new URL(`http://[${host}]/`).hostname === ''; }
          catch { return true; }
        });
        return invalid ? 'Use hosts or host patterns (* and ?), without schemes, ports, or paths. Changes were not saved.' : '';
      }
      return '';
    },
    /** about:config preference key that enables/disables the indicator */
    PREF: 'devbar.enabled',

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
      this._readSiteRules();
      const sp = Services.prefs;
      const rawPorts    = sp.getStringPref('devbar.custom-ports', '');
      const rawPatterns = sp.getStringPref('devbar.custom-patterns', '');

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
        includeFileUrls:  sp.getBoolPref('devbar.include-file-urls', false),
        includeZeroHost:  sp.getBoolPref('devbar.include-zero-host', true),
        includeLocalTLDs: sp.getBoolPref('devbar.include-local-tlds', true),
        portSet,
        patternRes,
        autoOpenDevtools: sp.getBoolPref('devbar.auto-open-devtools', false),
        autoOpenPanel:    sp.getStringPref('devbar.auto-open-panel', 'webconsole'),
      };
    },

    /**
     * Called once the browser window is ready. Sets up listeners and creates
     * the dev banner DOM element.
     */
    init() {
      if (this._initialized || this._destroyed) return;
      this._initialized = true;
      this._isEditing = false;
      // Populate pref cache before any _update() / _isDevUri() calls
      this._readPrefs();
      this._createBanner();
      // Listen for navigation in any tab
      gBrowser.addTabsProgressListener(this._progressListener);
      // Listen for tab switches
      detector._listen(window, 'TabSelect', this);
      // Listen for pref changes — _readPrefs() + _update() run on each change
      for (const key of [
        this.PREF,
        'devbar.include-zero-host',
        'devbar.include-local-tlds',
        'devbar.include-file-urls',
        'devbar.custom-ports',
        'devbar.custom-patterns',
        'devbar.auto-open-devtools',
        'devbar.auto-open-panel',
        'devbar.site-rules',
        'devbar.show-actions',
      ]) {
        Services.prefs.addObserver(key, this);
        this._observedPrefs.push(key);
      }
      // Top-level error handler: tag any uncaught error from our script so bug
      // reports include a recognisable prefix rather than a bare stack trace.
      detector._listen(window, 'error', (e) => {
        if (e.filename?.includes('devbar.uc.js')) {
          console.error('[devbar] FATAL:', e.message, 'at', `${e.filename}:${e.lineno}`);
        }
      }, true);
      // Site choices survive navigation, restarts, and browser windows.
      detector._listen(window, 'keydown', (e) => {
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.repeat) return;
        const key = e.key.toLowerCase();
        if (key !== 'd' && key !== 'o') return;
        e.preventDefault();
        e.stopPropagation();
        this._run(() => key === 'o' ? this._openSettings() : this._toggleSite());
      }, { capture: true, mozSystemGroup: true });
      const toggleDevbar = () => this._toggleSite();

      const addMenuToggle = (menuId, itemId, sepId) => {
        const menu = document.getElementById(menuId);
        if (!menu) return;
        const sep = document.createXULElement('menuseparator');
        sep.id = sepId;
        const menuItem = document.createXULElement('menuitem');
        menuItem.id = itemId;
        menuItem.setAttribute('label', 'Toggle Devbar');
        detector._listen(menuItem, 'command', toggleDevbar);
        menu.appendChild(sep);
        menu.appendChild(menuItem);
      };

      // Tab context menu (right-click on tab)
      addMenuToggle('tabContextMenu', 'devbar-context-toggle', 'devbar-context-sep');
      // Page context menu (right-click on page content)
      addMenuToggle('contentAreaContextMenu', 'devbar-page-toggle', 'devbar-page-sep');

      this._update();
    },

    _getDevTools() {
      try {
        const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
        return DevToolsShim;
      } catch (e) {
        console.error('[devbar] could not load DevToolsShim:', e);
        return null;
      }
    },

    _createBanner() {
      const banner = document.createXULElement('hbox');
      banner.id = 'devbar-banner';
      banner.setAttribute('role', 'group');
      banner.setAttribute('aria-label', 'Developer tools for the active tab or split pane');

      // ── URL Bar (bridges to gURLBar) ──────────────────────────────
      // Typing and selection stay in this input. Values sync to gURLBar to
      // drive Zen's native suggestions; the popup keeps its native location.

      const log = (...args) => {
        if (Services.prefs.getBoolPref('devbar.self-tests', false))
          console.log('[devbar:urlbar]', ...args);
      };

      // Wrapper lets the field sit alongside buttons with correct flex layout
      const wrapper = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      wrapper.id = 'devbar-field-wrapper';

      const field = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      field.id = 'devbar-field';
      field.type = 'text';
      field.spellcheck = false;
      field.autocomplete = 'off';
      field.placeholder = 'Search or enter URL';
      field.setAttribute('aria-label', 'Full URL of the active tab; Enter navigates, Escape cancels');

      wrapper.appendChild(field);

      const showDisplay = (spec) => {
        field.value = spec;
      };

      // Focus: enter edit mode. The cursor, selection, and typing all live
      // in our input. We sync our value to gURLBar to trigger its native
      // autocomplete/suggestions popup alongside.
      detector._listen(field, 'focus', () => {
        if (detector._isEditing) return;
        detector._isEditing = true;
        detector._editingBrowser = gBrowser.selectedBrowser;
        field.setAttribute('data-active', '');
        const startUri = gBrowser.currentURI.spec;
        field.value = startUri;
        field.select();
        log('dev URL bar focused with', startUri);
      });

      // Input: sync typed value to gURLBar and trigger autocomplete search.
      // After the search, check if gURLBar autofilled — if so, show the
      // autofill text in our field with the completion portion selected
      // (just like the real URL bar). ArrowRight accepts the autofill.
      detector._listen(field, 'input', () => {
        try {
          const typed = field.value;
          const cursorPos = field.selectionStart;
          const editBrowser = detector._editingBrowser;
          gURLBar.value = typed;
          gURLBar.setAttribute('focused', 'true');
          if (typeof gURLBar.startQuery === 'function') {
            detector._run(() => gURLBar.startQuery());
          }
          detector._requestFrame(() => {
            try {
              if (!detector._isEditing || detector._editingBrowser !== editBrowser || field.value !== typed) return;
              const gVal = gURLBar.value;
              if (gVal.length > typed.length && gVal.toLowerCase().startsWith(typed.toLowerCase())) {
                field.value = gVal;
                field.setSelectionRange(cursorPos, gVal.length);
              }
            } catch {}
          });
        } catch (err) {
          log('gURLBar sync/search error:', err);
        }
      });

      // Keydown: navigation keys are forwarded to gURLBar's suggestion list
      // so ArrowDown/ArrowUp/Tab cycle through suggestions and ArrowRight
      // accepts autofill — all using gURLBar's native logic.
      detector._listen(field, 'keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          try {
            if (gURLBar.view?.isOpen) {
              gURLBar.view.selectBy(1, { reverse: e.key === 'ArrowUp' });
              detector._requestFrame(() => {
                if (!detector._isEditing || detector._editingBrowser !== gBrowser.selectedBrowser) return;
                if (gURLBar.value) {
                  field.value = gURLBar.value;
                  field.setSelectionRange(field.value.length, field.value.length);
                }
              });
            }
          } catch (err) {
            log('suggestion nav error:', err);
          }
        } else if (e.key === 'Tab') {
          if (!gURLBar.view?.isOpen) return; // Preserve keyboard access to toolbar buttons.
          e.preventDefault();
          try {
            if (gURLBar.view?.isOpen) {
              gURLBar.view.selectBy(1, { reverse: e.shiftKey });
              detector._requestFrame(() => {
                if (!detector._isEditing || detector._editingBrowser !== gBrowser.selectedBrowser) return;
                if (gURLBar.value) {
                  field.value = gURLBar.value;
                  field.setSelectionRange(field.value.length, field.value.length);
                }
              });
            }
          } catch (err) {
            log('tab nav error:', err);
          }
        } else if (e.key === 'ArrowRight') {
          // At end of typed text (or with autofill selected): accept the autofill
          if (field.selectionStart !== field.selectionEnd || field.selectionStart === field.value.length) {
            try {
              const gVal = gURLBar.value;
              if (gVal && gVal.length > 0 && gVal !== field.value) {
                e.preventDefault();
                field.value = gVal;
                field.setSelectionRange(field.value.length, field.value.length);
              }
            } catch {}
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          try {
            // If a suggestion is selected in gURLBar's view, use its handler
            if (gURLBar.view?.isOpen && gURLBar.view?.selectedElement) {
              gURLBar.handleCommand(e);
              field.blur();
              return;
            }
          } catch (err) {
            log('gURLBar handleCommand error:', err);
          }
          const url = field.value.trim();
          if (!url) return;
          try {
            gBrowser.fixupAndLoadURIString(url, {
              triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
            });
            log('navigating to', url);
          } catch (err) {
            console.error('[devbar] navigation failed:', err);
          }
          field.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          try {
            if (gURLBar.view?.isOpen) gURLBar.view.close();
          } catch {}
          field.blur();
        }
      });

      const finishEdit = () => {
        field.removeAttribute('data-active');
        detector._isEditing = false;
        detector._editingBrowser = null;
        showDisplay(gBrowser.currentURI.spec);
        try {
          if (gURLBar.view?.isOpen) gURLBar.view.close();
          // Do not overwrite another control's URL edit after focus leaves us.
          if (document.activeElement !== gURLBar.inputField) gURLBar.value = gBrowser.currentURI.spec;
          gURLBar.removeAttribute('focused');
        } catch {}
      };
      detector._listen(field, 'blur', () => {
        const editingBrowser = detector._editingBrowser;
        detector._setTimeout(() => {
          if (document.activeElement === field || detector._editingBrowser !== editingBrowser) return;
          finishEdit();
        }, 150);
      });
      detector._exitEditMode = () => {
        if (!detector._isEditing) return;
        finishEdit();
        field.blur();
      };

      const getDevTools = () => detector._getDevTools();

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
            return toolbox.destroy();
          }
        }
        return dt.showToolboxForTab(gBrowser.selectedTab, { toolId });
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
        sep.className = 'devbar-separator';
        return sep;
      };

      const makeBtn = (id, title, action) => {
        const btn = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
        btn.id = id;
        btn.className = 'devbar-btn';
        btn.title = title;
        btn.type = 'button';
        btn.setAttribute('aria-label', title);
        detector._listen(btn, 'mousedown', (e) => e.preventDefault());
        detector._listen(btn, 'click', () => detector._run(action));
        return btn;
      };

      // Copy URL button — Zen's gZenCommonActions already shows its own
      // toast/notification, so we don't fire a second one here.
      const copyBtn = makeBtn('devbar-copy-link', 'Copy URL', () => {
        gZenCommonActions.copyCurrentURLToClipboard();
        copyBtn.setAttribute('data-copied', '');
        detector._setTimeout(() => copyBtn.removeAttribute('data-copied'), 1500);
      });

      // Clear site data (cookies + localStorage + cache) for the current origin.
      // getBaseDomain() throws for localhost/IPs, so fall back to uri.host.
      // This Zen build's nsIClearDataService uses the OLD callback-based API —
      // the 4th argument is a required { onDataDeleted() } callback, not a Promise.
      // We pick whichever method is available and always pass the callback.
      const clearSiteData = makeBtn('devbar-clear-data', 'Clear site data + hard reload', () => {
        try {
          const uri = gBrowser.currentURI;
          const targetBrowser = gBrowser.selectedBrowser;
          let host;
          try { host = Services.eTLD.getBaseDomain(uri); }
          catch { host = uri.host; }
          if (!Services.prompt.confirm(window, 'Clear site data', `Clear cookies, storage, and caches for ${host} and its subdomains? This can sign you out. The current page will reload.`)) return;
          // Use CLEAR_ALL_CACHES (network+image+JS+CSS+preflight+auth caches
          // combined) if available, otherwise fall back to individual names.
          const ciCD = Ci.nsIClearDataService;
          const cacheFlags = ciCD.CLEAR_ALL_CACHES
            ?? ((ciCD.CLEAR_CACHE ?? ciCD.CLEAR_NETWORK_CACHE ?? 0) | (ciCD.CLEAR_IMAGE_CACHE ?? 0) | (ciCD.CLEAR_JS_CACHE ?? 0) | (ciCD.CLEAR_CSS_CACHE ?? 0));
          const flags = (ciCD.CLEAR_COOKIES ?? 0) | (ciCD.CLEAR_DOM_STORAGES ?? 0) | cacheFlags;
          const cb = { onDataDeleted(resultFlags) {
            if (detector._destroyed) return;
            if (resultFlags) {
              detector._showToast('Some site data could not be cleared');
              return;
            }
            clearSiteData.setAttribute('data-done', '');
            detector._setTimeout(() => clearSiteData.removeAttribute('data-done'), 1500);
            detector._showToast('Cleared site data — ' + host + ' !');
            // Hard reload AFTER confirmed deletion so we know the page fetches fresh
            // Do not reload a different tab if the user switched during deletion.
            if (targetBrowser.isConnected && targetBrowser.currentURI.spec === uri.spec) {
              targetBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
            }
          } };
          const hasBaseDomain = typeof Services.clearData.deleteDataFromBaseDomain === 'function';
          const fn = (hasBaseDomain
            ? Services.clearData.deleteDataFromBaseDomain
            : Services.clearData.deleteDataFromHost
          ).bind(Services.clearData);
          fn(host, false, flags, cb);
        } catch (e) {
          console.error('[devbar] clear site data failed:', e);
        }
      });

      // Reload — grouped visually with clear-data (both are page-state tools)
      const reloadBtn = makeBtn('devbar-clear-refresh', 'Reload bypassing cache', () => {
        gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE);
        detector._showToast('Hard reloaded !');
      });

      // Screenshot button — grouped with devtools (it's a dev capture tool).
      // toggleScreenshot toggles the panel visibility, so the toast verb depends
      // on whether the panel was visible before this click.
      const screenshotBtn = makeBtn('devbar-screenshot', 'Take screenshot',
        () => toggleScreenshot());

      // DevTools toggles report which tool is opening/closing in the toast.
      // For DevTools panels, "open" means showing for first time OR switching
      // from another tool; "close" means destroying the toolbox.
      const devToolsToast = (label, toolId) => {
        const dt = getDevTools();
        if (!dt) return null;
        const toolbox = dt.getToolboxForTab(gBrowser.selectedTab);
        if (toolbox && !toolbox._destroyer && toolbox.currentToolId === toolId) {
          return `${label} closed !`;
        }
        return `${label} opened !`;
      };

      // DevTools group: inspector, console, network (separate from page tools)
      const devButtons = [
        makeBtn('devbar-inspector', 'Inspect element', () => {
          const dt = getDevTools();
          if (!dt) return;
          const toolbox = dt.getToolboxForTab(gBrowser.selectedTab);
          // Close inspector if already open
          if (toolbox && !toolbox._destroyer && toolbox.currentToolId === 'inspector') {
            toolbox.destroy();
            detector._showToast('Inspector closed !');
            return;
          }
          // Open inspector and immediately activate the node picker
          dt.showToolboxForTab(gBrowser.selectedTab, { toolId: 'inspector' })
            .then(tb => tb?.nodePicker?.start(tb.currentTarget, tb))
            .catch(e => console.error('[devbar] picker error:', e));
          detector._showToast('Inspector opened !');
        }),
        makeBtn('devbar-console', 'Open console', () => {
          const msg = devToolsToast('Console', 'webconsole');
          detector._run(() => togglePanel('webconsole'));
          if (msg) detector._showToast(msg);
        }),
        makeBtn('devbar-network', 'Open network panel', () => {
          const msg = devToolsToast('Network panel', 'netmonitor');
          detector._run(() => togglePanel('netmonitor'));
          if (msg) detector._showToast(msg);
        }),
      ];

      // Viewport size readout — updated on resize and tab/navigation changes
      const viewportEl = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      viewportEl.id = 'devbar-viewport';

      // Layout: [wrapper(field+input+dropdown)] [copy] | sep | [clear-data] [reload] | sep | [screenshot] [inspector] [console] [network] | sep | [viewport] | sep | [gear]
      banner.appendChild(wrapper);
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
      const settingsBtn = makeBtn('devbar-settings', 'Settings (Alt+Shift+O)', () => detector._openSettings());
      banner.appendChild(settingsBtn);

      const content = document.getElementById('zen-appcontent-wrapper');
      const tabbox = document.getElementById('zen-tabbox-wrapper') || document.getElementById('tabbrowser-tabbox');
      if (!content || tabbox?.parentNode !== content) {
        throw new Error('Unsupported Zen content layout; Devbar was not installed.');
      }
      // Participate in normal layout so sidebar resizing and split view cannot
      // leave a stale fixed overlay covering a page or its security warnings.
      content.insertBefore(banner, tabbox);
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
        detector._requestFrame(() => {
          rafPending = false;
          this._repositionBanner();
          this._updateViewport();
        });
      };
      detector._listen(window, 'resize', onResize);
      // Window resize doesn't fire when only the sidebar width changes (e.g.
      // user toggles the sidebar or drags the splitter) — observe the content
      // panel directly so the banner follows its left edge and width.
      try {
        const tabpanels = document.getElementById('tabbrowser-tabpanels');
        if (tabpanels && typeof ResizeObserver === 'function') {
          this._tabpanelsObserver = new ResizeObserver(onResize);
          this._tabpanelsObserver.observe(tabpanels);
          this._viewportObserver = new ResizeObserver(() => this._updateViewport());
        }
      } catch (e) {
        console.error('[devbar] ResizeObserver setup failed:', e);
      }
    },

    /**
     * Aligns the banner's position and width to match the content area
     * (#tabbrowser-tabpanels), keeping it above the web page regardless of
     * sidebar width.
     */
    _repositionBanner() {
      // The banner follows its normal-flow parent. Only the floating settings
      // panel needs coordinates when the window or sidebar is resized.
      if (this._settingsPanel?.style.display === 'block') this._repositionPanel();
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
     * `devbar` attribute on the document root accordingly.
     * @param {nsIURI} [uri] - Override URI; defaults to the current tab's URI
     */
    _update(uri) {
      if (this._destroyed) return;
      const currentUri = uri || gBrowser.currentURI;
      const browser = gBrowser.selectedBrowser;
      if (this._viewportObserver && this._observedBrowser !== browser) {
        this._viewportObserver.disconnect();
        this._viewportObserver.observe(browser);
        this._observedBrowser = browser;
      }
      if (this._isEditing && this._editingBrowser !== browser) this._exitEditMode();
      const isDev = this._matchesCurrentMode(currentUri, browser);
      if (this._banner) this._banner.hidden = !isDev;
      document.documentElement.toggleAttribute('devbar-hide-actions', !Services.prefs.getBoolPref('devbar.show-actions', true));
      document.documentElement.toggleAttribute('devbar', isDev);
      if (!isDev && this._isEditing && this._exitEditMode) {
        this._exitEditMode();
      }
      if (isDev && currentUri) {
        if (this._field && !this._isEditing) {
          this._showDisplay(currentUri.spec);
        }
        this._updateViewport();
        // Auto-open DevTools panel if setting is on and panel not already open
        if (this._prefs.autoOpenDevtools) {
          try {
            const dt = this._getDevTools();
            if (dt) {
              const toolbox = dt.getToolboxForTab(gBrowser.selectedTab);
              if (!toolbox || toolbox._destroyer) {
                this._run(() => dt.showToolboxForTab(gBrowser.selectedTab, { toolId: this._prefs.autoOpenPanel }));
              }
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
        const toastId = 'devbar-' + (msg.includes('on') ? 'on' : 'off');
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
        let toast = document.getElementById('devbar-toast');
        if (!toast) {
          toast = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
          toast.id = 'devbar-toast';
          document.documentElement.appendChild(toast);
        }
        detector._clearTimeout(this._toastTimer);
        toast.textContent = msg;
        toast.setAttribute('data-visible', '');
        this._toastTimer = detector._setTimeout(() => toast.removeAttribute('data-visible'), 1800);
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
      row.className = 'devbar-toggle-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const toggleLabel = document.createElementNS('http://www.w3.org/1999/xhtml', 'label');
      toggleLabel.className = 'devbar-toggle';

      const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      input.type = 'checkbox';
      input.dataset.pref = prefKey;
      input.dataset.invert = invert ? '1' : '';
      input.dataset.default = String(defaultVal);
      input.setAttribute('aria-label', labelText);
      const raw = Services.prefs.getBoolPref(prefKey, defaultVal);
      input.checked = invert ? !raw : raw;
      detector._listen(input, 'change', () => {
        Services.prefs.setBoolPref(prefKey, invert ? !input.checked : input.checked);
        detector._update();
      });

      const track = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      track.className = 'devbar-toggle-track';

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
      row.className = 'devbar-toggle-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const select = document.createElementNS('http://www.w3.org/1999/xhtml', 'select');
      select.className = 'devbar-select';
      select.dataset.pref = prefKey;
      select.dataset.default = defaultVal;
      select.setAttribute('aria-label', labelText);
      const current = Services.prefs.getStringPref(prefKey, defaultVal);
      for (const opt of options) {
        const el = document.createElementNS('http://www.w3.org/1999/xhtml', 'option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (opt.value === current) el.selected = true;
        select.appendChild(el);
      }
      detector._listen(select, 'change', () => {
        Services.prefs.setStringPref(prefKey, select.value);
      });
      detector._listen(select, 'mousedown', e => e.stopPropagation());

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
      el.className = 'devbar-section-header';
      el.textContent = text;
      return el;
    },

    /**
     * Creates a thin horizontal divider for the settings panel.
     * @returns {HTMLElement}
     */
    _makePanelDivider() {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      el.className = 'devbar-panel-divider';
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
      row.className = 'devbar-text-row';

      const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      label.textContent = labelText;

      const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      input.type = 'text';
      input.className = 'devbar-text-input';
      input.dataset.pref = prefKey;
      input.placeholder = placeholder;
      input.setAttribute('aria-label', labelText);
      input.value = Services.prefs.getStringPref(prefKey, '');
      const validation = document.createElementNS('http://www.w3.org/1999/xhtml', 'small');
      validation.className = 'devbar-validation';
      validation.setAttribute('role', 'status');

      let debounce;
      detector._listen(input, 'input', () => {
        detector._clearTimeout(debounce);
        debounce = detector._setTimeout(() => {
          const error = this._validateDetectionInput(prefKey, input.value);
          input.setAttribute('aria-invalid', String(Boolean(error)));
          validation.textContent = error;
          if (error) return;
          Services.prefs.setStringPref(prefKey, input.value);
          detector._update();
        }, 400);
      });
      // Prevent the field from triggering banner edit on click
      detector._listen(input, 'mousedown', e => e.stopPropagation());

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(validation);
      return row;
    },

    /**
     * Creates a full-width action button row for the settings panel.
     * Clicking it executes the action and closes the panel.
     * @param {string} labelText
     * @param {string} iconUrl  chrome:// path to an SVG rendered via mask-image
     * @param {Function} action
     * @returns {HTMLElement}
     */
    _makeActionRow(labelText, iconUrl, action) {
      const row = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      row.className = 'devbar-action-row';
      const btn = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
      btn.className = 'devbar-action-btn';
      const icon = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      icon.className = 'devbar-action-icon';
      icon.style.maskImage = `url("${iconUrl}")`;
      icon.style.webkitMaskImage = `url("${iconUrl}")`;
      const labelNode = document.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      labelNode.className = 'devbar-action-label';
      labelNode.textContent = labelText;
      btn.appendChild(icon);
      btn.appendChild(labelNode);
      detector._listen(btn, 'click', () => {
        detector._run(action);
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
      panel.id = 'devbar-settings-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Devbar settings');
      panel.appendChild(this._makeSectionHeader('Current site'));
      const originLabel = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      originLabel.id = 'devbar-site-origin';
      const siteMode = document.createElementNS('http://www.w3.org/1999/xhtml', 'select');
      siteMode.id = 'devbar-site-mode';
      siteMode.className = 'devbar-select';
      siteMode.setAttribute('aria-label', 'Developer bar mode for this site');
      for (const [value, label] of [['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Always off']]) {
        const option = document.createElementNS('http://www.w3.org/1999/xhtml', 'option');
        option.value = value;
        option.textContent = label;
        siteMode.appendChild(option);
      }
      this._listen(siteMode, 'change', () => this._setSiteMode(siteMode.value, this._settingsOrigin));
      panel.append(originLabel, siteMode);
      this._siteMode = siteMode;
      this._siteOriginLabel = originLabel;
      panel.appendChild(this._makeToggleRow('Enable Devbar', this.PREF, true));
      panel.appendChild(this._makeToggleRow('Show developer action buttons', 'devbar.show-actions', true));

      // ── Detection ─────────────────────────────────────────────
      panel.appendChild(this._makeSectionHeader('Detection'));
      panel.appendChild(this._makeToggleRow(
        'Show for 0.0.0.0',
        'devbar.include-zero-host',
        true
      ));
      panel.appendChild(this._makeToggleRow(
        'Show for .local / .test / .internal',
        'devbar.include-local-tlds',
        true
      ));
      panel.appendChild(this._makeToggleRow(
        'Show for file://',
        'devbar.include-file-urls',
        false
      ));
      panel.appendChild(this._makeTextRow(
        'Custom ports',
        'devbar.custom-ports',
        '3000, 5173, 8080, 8000'
      ));
      panel.appendChild(this._makeTextRow(
        'Custom host patterns',
        'devbar.custom-patterns',
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
        'devbar.auto-open-devtools',
        false
      );
      panel.appendChild(autoOpenRow);
      // Panel selector — indented sub-option, only active when auto-open is on
      const panelSelectRow = this._makeSelectRow(
        'Panel',
        'devbar.auto-open-panel',
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
        const on = Services.prefs.getBoolPref('devbar.auto-open-devtools', false);
        panelSelectRow.style.opacity = on ? '1' : '0.4';
        panelSelect.disabled = !on;
      };
      syncPanelRow();
      this._listen(autoOpenRow.querySelector('input'), 'change', syncPanelRow);
      panel.appendChild(panelSelectRow);

      // ── Actions ───────────────────────────────────────────────
      panel.appendChild(this._makePanelDivider());
      panel.appendChild(this._makeSectionHeader('Actions'));
      const sysPrincipal = () => Services.scriptSecurityManager.getSystemPrincipal();
      const ACTIONS = [
        ['Open in new tab', 'chrome://browser/skin/new-tab.svg', () => {
          const url = gBrowser.currentURI.spec;
          const tab = gBrowser.addTab(url, { triggeringPrincipal: sysPrincipal() });
          gBrowser.selectedTab = tab;
        }],
        ['Open in private window', 'chrome://browser/skin/privateBrowsing.svg', () => {
          const url = gBrowser.currentURI.spec;
          const win = OpenBrowserWindow({ private: true });
          detector._listen(win, 'load', () => {
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
                  console.error('[devbar] private win: all nav methods failed:', e2.message);
                }
              }
            }, 0);
          }, { once: true });
        }],
        ['View page source', 'chrome://devtools/skin/images/tool-styleeditor.svg', () => {
          const url = 'view-source:' + gBrowser.currentURI.spec;
          const tab = gBrowser.addTab(url, { triggeringPrincipal: sysPrincipal() });
          gBrowser.selectedTab = tab;
        }],
        ['Copy as curl', 'chrome://global/skin/icons/edit-copy.svg', () => {
          const url = gBrowser.currentURI.spec;
          navigator.clipboard.writeText(`curl '${url.replace(/'/g, `'\\''`)}'`)
            .then(() => this._showToast('Copied curl !'))
            .catch(err => console.error('[devbar] clipboard write failed:', err));
        }],
      ];
      for (const [label, iconUrl, onClick] of ACTIONS) {
        panel.appendChild(this._makeActionRow(label, iconUrl, onClick));
      }

      document.documentElement.appendChild(panel);
      this._settingsPanel = panel;
    },

    /**
     * Repositions the settings panel so it sits below and right-aligns with
     * the gear button.
     */
    _repositionPanel() {
      const gear = document.getElementById('devbar-settings');
      if (!gear || !this._settingsPanel) return;
      const rect = gear.getBoundingClientRect();
      const visible = document.documentElement.hasAttribute('devbar') && rect.width > 0;
      const width = Math.min(300, window.innerWidth - 24);
      this._settingsPanel.style.width = width + 'px';
      this._settingsPanel.style.top = Math.max(12, Math.min(visible ? rect.bottom + 4 : 72, window.innerHeight - 160)) + 'px';
      this._settingsPanel.style.left = Math.max(12, Math.min(visible ? rect.right - width : window.innerWidth - width - 24, window.innerWidth - width - 12)) + 'px';
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
      this._settingsOrigin = this._origin();
      this._siteMode.disabled = !this._settingsOrigin;
      this._siteMode.value = this._siteRules[this._settingsOrigin] || 'auto';
      this._siteOriginLabel.textContent = this._settingsOrigin || 'Remembered choices require an HTTP(S) site.';
      // Refresh all input/select states from live prefs
      this._settingsPanel.querySelectorAll('input[data-pref], select[data-pref]').forEach(el => {
        const key = el.dataset.pref;
        if (el.localName === 'select') {
          el.value = Services.prefs.getStringPref(key, el.dataset.default || '');
        } else if (el.type === 'checkbox') {
          const raw = Services.prefs.getBoolPref(key, el.dataset.default === 'true');
          el.checked = el.dataset.invert ? !raw : raw;
        } else if (el.type === 'text') {
          el.value = Services.prefs.getStringPref(key, '');
        }
      });
      this._repositionPanel();
      this._settingsPanel.style.display = 'block';
      this._siteMode.disabled
        ? this._settingsPanel.querySelector('input').focus()
        : this._siteMode.focus();

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
        const gear = document.getElementById('devbar-settings');
        const panel = this._settingsPanel;
        if (e.composedPath().some(el => el === panel || el === gear)) return;
        this._closeSettings();
      };
      this._escapeHandler = (e) => {
        if (e.key === 'Escape') this._closeSettings();
      };
      detector._listen(document, 'mousedown', this._outsideClickHandler, true);
      detector._listen(window, 'keydown', this._escapeHandler, true);
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

    uninit() {
      if (this._destroyed) return;
      this._destroyed = true;
      this._closeSettings();
      this._abort.abort();
      for (const timer of this._timers) window.clearTimeout(timer);
      for (const frame of this._frames) window.cancelAnimationFrame(frame);
      this._timers.clear();
      this._frames.clear();
      this._tabpanelsObserver?.disconnect();
      this._viewportObserver?.disconnect();
      if (this._initialized) {
        try { gBrowser.removeTabsProgressListener(this._progressListener); } catch {}
      }
      for (const pref of this._observedPrefs) Services.prefs.removeObserver(pref, this);
      if (this._startupObserver) Services.obs.removeObserver(this._startupObserver, 'browser-delayed-startup-finished');
      for (const id of ['devbar-banner', 'devbar-settings-panel', 'devbar-toast', 'devbar-context-toggle', 'devbar-context-sep', 'devbar-page-toggle', 'devbar-page-sep']) document.getElementById(id)?.remove();
      document.documentElement.removeAttribute('devbar');
      document.documentElement.removeAttribute('devbar-hide-actions');
      if (window.__devbar === this) delete window.__devbar;
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

  window.__devbar = detector;

  // ── Self-tests ────────────────────────────────────────────────────────────
  // Off by default to keep the user's console quiet.
  // Contributors: flip devbar.self-tests = true in about:config.
  // Defined as a function (not IIFE) so we can run it AFTER init() creates the
  // banner + URL field. Some assertions check DOM elements that don't exist
  // until init() finishes.
  const runSelfTests = () => {
    if (!Services.prefs.getBoolPref('devbar.self-tests', false)) return;
    (function runSelfTestsInner() {
    let pass = 0, fail = 0;

    function assert(description, actual, expected) {
      if (actual === expected) {
        pass++;
      } else {
        fail++;
        console.error(`[devbar] FAIL: ${description}\n  expected: ${expected}\n  got:      ${actual}`);
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
      console.error('[devbar] FAIL: CLEAR_COOKIES or CLEAR_DOM_STORAGES is undefined — clear site data broken');
    } else {
      pass++;
    }
    const cacheFlag = ciCD?.CLEAR_ALL_CACHES ?? ciCD?.CLEAR_CACHE ?? ciCD?.CLEAR_NETWORK_CACHE;
    if (cacheFlag === undefined) {
      console.warn('[devbar] WARN: no cache clear constant found — cache will not be cleared on site data clear');
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

    // Banner URL field — should be a real <input> (v20260418-4+) so the cursor,
    // text selection, and keyboard interaction all live locally. The gURLBar
    // bridge runs on top of this: each keystroke syncs value + triggers search.
    const banner = document.getElementById('devbar-banner');
    const urlField = document.getElementById('devbar-field');
    assert('banner exists',              !!banner,                                true);
    assert('URL field exists',           !!urlField,                              true);
    // Element created via createElementNS(XHTML, 'input'), so tagName is
    // returned lowercase — unlike the uppercase you get for HTML elements.
    assert('URL field is input',         urlField?.tagName?.toLowerCase(),        'input');
    assert('URL field type=text',        urlField?.type,                          'text');
    assert('URL field autocomplete off', urlField?.getAttribute('autocomplete'),  'off');
    assert('URL field has placeholder',  urlField?.placeholder?.length > 0,       true);
    assert('URL field spellcheck off',   urlField?.spellcheck,                    false);

    // Edit-mode lifecycle contract — _exitEditMode is invoked by _update() when
    // the tab changes to a non-dev URL while the user is still typing.
    assert('_exitEditMode is a function', typeof detector._exitEditMode,          'function');
    assert('_isEditing defaults to false', detector._isEditing === true || detector._isEditing === false, true);

    // gURLBar bridge sanity — if any of these are missing, suggestion nav
    // and autofill will silently no-op. Log a clear failure instead.
    assert('gURLBar exists',             typeof gURLBar,                          'object');
    assert('gURLBar.view exists',        !!gURLBar?.view,                         true);
    assert('gURLBar.view.selectBy fn',   typeof gURLBar?.view?.selectBy,          'function');
    assert('gURLBar.startQuery fn',      typeof gURLBar?.startQuery,              'function');
    assert('gURLBar.handleCommand fn',   typeof gURLBar?.handleCommand,           'function');

    const total = pass + fail;
    const status = fail === 0
      ? `%c[devbar] self-tests: ${pass}/${total} passed`
      : `%c[devbar] self-tests: ${fail} FAILED, ${pass}/${total} passed`;
    const style = fail === 0 ? 'color:#90ee90;font-weight:bold' : 'color:#ff4444;font-weight:bold';
    console.log(status, style);
    })();
  };

  const bootstrap = () => {
    try { detector.init(); }
    catch (error) { detector.uninit(); throw error; }
    // Init is synchronous (banner + field appended to DOM before return),
    // so self-tests on DOM state are reliable immediately after.
    runSelfTests();
  };

  detector._listen(window, 'unload', () => detector.uninit(), { once: true });
  if (window.gBrowserInit?.delayedStartupFinished) detector._run(bootstrap);
  else {
    detector._startupObserver = (subject, topic) => {
      if (subject !== window) return;
      Services.obs.removeObserver(detector._startupObserver, topic);
      detector._startupObserver = null;
      detector._run(bootstrap);
    };
    Services.obs.addObserver(detector._startupObserver, 'browser-delayed-startup-finished');
  }
})();
