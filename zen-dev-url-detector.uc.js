// ==UserScript==
// @name           zen-dev-url-detector
// @description    Highlights the URL bar and shows a dev banner when on localhost or local dev URLs
// ==/UserScript==

(function () {
  if (window.__zenDevUrlDetector) return;

  const detector = {
    PREF: 'zen.urlbar.show-dev-indicator',
    _devHosts: new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']),
    _devTLDs: ['.local', '.localhost', '.internal', '.test'],
    _banner: null,

    get _enabled() {
      return Services.prefs.getBoolPref(this.PREF, true);
    },

    init() {
      this._createBanner();
      gBrowser.addTabsProgressListener(this._progressListener);
      window.addEventListener('TabSelect', this);
      Services.prefs.addObserver(this.PREF, this);
      this._update();
    },

    _createBanner() {
      const banner = document.createXULElement('hbox');
      banner.id = 'zen-dev-url-banner';

      const input = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
      input.id = 'zen-dev-url-banner-input';
      input.type = 'text';
      input.spellcheck = false;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = input.value.trim();
          if (val) {
            gURLBar.value = val;
            gURLBar.handleCommand();
          }
          input.blur();
        } else if (e.key === 'Escape') {
          input.value = gBrowser.currentURI.spec;
          input.blur();
        }
      });
      input.addEventListener('focus', () => input.select());

      const getDevTools = () => {
        try {
          const { DevToolsShim } = ChromeUtils.importESModule('chrome://devtools-startup/content/DevToolsShim.sys.mjs');
          return DevToolsShim;
        } catch (e) {
          console.error('[zen-dev-url] could not load DevToolsShim:', e);
          return null;
        }
      };

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

      const toggleScreenshot = () => {
        const panel = document.querySelector('.screenshotsPagePanel');
        if (panel && getComputedStyle(panel).display !== 'none') {
          Services.obs.notifyObservers(window, 'screenshots-cancel-screenshot');
        } else {
          Services.obs.notifyObservers(window, 'menuitem-screenshot');
        }
      };

      const buttons = [
        {
          id: 'zen-dev-url-clear-refresh',
          title: 'Clear cache and reload',
          action: () => gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE),
        },
        {
          id: 'zen-dev-url-screenshot',
          title: 'Take screenshot',
          action: () => toggleScreenshot(),
        },
        {
          id: 'zen-dev-url-inspector',
          title: 'Inspect element',
          action: () => {
            const dt = getDevTools();
            if (!dt) return;
            const toolbox = dt.getToolboxForTab(gBrowser.selectedTab);
            if (toolbox && !toolbox._destroyer && toolbox.currentToolId === 'inspector') {
              toolbox.destroy();
              return;
            }
            dt.showToolboxForTab(gBrowser.selectedTab, { toolId: 'inspector' })
              .then(tb => tb?.nodePicker?.start(tb.currentTarget, tb))
              .catch(e => console.error('[zen-dev-url] picker error:', e));
          },
        },
        {
          id: 'zen-dev-url-console',
          title: 'Open console',
          action: () => togglePanel('webconsole'),
        },
        {
          id: 'zen-dev-url-network',
          title: 'Open network panel',
          action: () => togglePanel('netmonitor'),
        },
      ];

      banner.appendChild(input);
      for (const { id, title, action } of buttons) {
        const btn = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
        btn.id = id;
        btn.className = 'zen-dev-url-btn';
        btn.title = title;
        btn.addEventListener('click', action);
        banner.appendChild(btn);
      }
      document.documentElement.appendChild(banner);
      this._banner = banner;
      this._input = input;
      this._repositionBanner();
      window.addEventListener('resize', () => this._repositionBanner());
    },

    _repositionBanner() {
      const tabpanels = document.getElementById('tabbrowser-tabpanels');
      if (!tabpanels || !this._banner) return;
      const rect = tabpanels.getBoundingClientRect();
      this._banner.style.top = rect.top + 'px';
      this._banner.style.left = rect.left + 'px';
      this._banner.style.width = rect.width + 'px';
    },

    observe() { this._update(); },
    handleEvent() { this._update(); },

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

    _update(uri) {
      const currentUri = uri || gBrowser.currentURI;
      const isDev = this._enabled && this._isDevUri(currentUri);
      document.documentElement.toggleAttribute('zen-dev-url', isDev);
      if (this._input && isDev && currentUri) {
        this._input.value = currentUri.spec;
      }
    },

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
