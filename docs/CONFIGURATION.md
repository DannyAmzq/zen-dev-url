# Configuration

Open the full settings panel with the gear button or `Alt+Shift+O`, including when the toolbar is hidden or globally disabled. Existing detection and developer settings are retained in this candidate.

## Remember a site

Use **Automatic**, **Always on**, or **Always off** for the current HTTP(S) origin. `Alt+Shift+D` toggles an explicit choice. Selecting Always on re-enables the global master switch.

An origin includes scheme, hostname, and effective port. `http://localhost:3000/a` and `/b` share a choice; `http://localhost:3001` and `https://localhost:3000` are separate. Explicit default ports normalize to their omitted-port equivalent.

Automatic removes the saved override and returns to detection rules. Always off beats a matching local host, custom port, or custom pattern. The master switch can disable the bar across origins.

These choices are JSON in `devbar.site-rules`, mapping canonical origins to `on` or `off`. **Private-window changes also persist in the profile.** Do not use remembered choices for private hosts you do not want recorded. The preference contains hostnames, not a full browsing-history log; treat it as private when sharing diagnostic data.

Non-HTTP(S) pages retain temporary per-tab shortcut behavior. File URLs can also be enabled through the existing `devbar.include-file-urls` preference.

## Existing detection settings

Defaults continue to recognize `localhost`, `127.0.0.1`, `0.0.0.0`, IPv6 loopback, and the `.local`, `.test`, `.internal`, and `.localhost` suffixes. The zero-address and suffix behavior remains toggleable. File URLs are off by default.

Custom ports and custom host patterns retain their existing settings and comma-separated syntax. Port matching can enable the bar on any HTTP(S) host using a configured port. Patterns use the existing glob syntax, for example `*.vercel.app`; they are hostname patterns rather than complete URLs. Prefer a per-origin choice for a specific staging URL and port.

The DEV banner follows these rules; it does not establish that a site is safe or prevent actions against production.

## Developer controls

The full toolbar retains URL editing with native Zen suggestions, the viewport readout, copy, site-data clearing, reload bypassing cache, inspector, console, and network actions. Settings retains open-in-tab/private-window, view source, copy-as-curl, and auto-open developer tools.

Reload bypassing cache preserves cookies and authentication; the separate site-data clearing action removes site data and can sign you out. Do not confuse them.

Cache, mixed-content, and JavaScript options change browser preferences and can outlive the mod. In particular, `javascript.enabled` is global, not a per-tab control. See the preference reference below. Disabling the mod does not undo those independent browser preferences.

Use the developer-action visibility setting if you only need the URL. Keyboard shortcuts may conflict with OS bindings or other mods; on macOS Alt corresponds to Option.

## Toolbar controls

![Current devbar URL field and developer action buttons](media/beta-controls.png)

| Control | What it does |
|---|---|
| **URL display** | Shows the current URL; click to edit, `Enter` to navigate, `Escape` to cancel |
| **Copy** | Copies the URL — shows Zen's native toast |
| **Trash** | Confirms the registered-domain and subdomain scope, clears site data, then reloads the original tab after success; can sign you out |
| **Reload** | Hard reload (bypass cache only — preserves auth/cookies) |
| **Screenshot** | Toggles the Firefox Screenshots panel |
| **Inspector** | Opens DevTools element picker |
| **Console** | Toggles DevTools console |
| **Network** | Toggles DevTools network panel |
| **Viewport** | Live `W × H` readout, updates on resize |
| **⚙ Gear** | Opens the settings panel |

<details>
<summary>Current site and detection settings</summary>

<img src="media/beta-settings.png" width="300" alt="Current devbar site mode selector and detection settings" />

The panel scrolls to show additional controls.

</details>

## about:config prefs

All preferences are under `devbar.*`. You can tweak them directly in `about:config` or through the gear panel.

**devbar prefs** (created by this mod):

| Preference | Default | Description |
|---|---|---|
| `devbar.enabled` | `true` | Master on/off switch |
| `devbar.include-zero-host` | `true` | Match `0.0.0.0` |
| `devbar.include-local-tlds` | `true` | Match `.local` / `.test` / `.localhost` / `.internal` |
| `devbar.include-file-urls` | `false` | Match `file://` URLs |
| `devbar.custom-ports` | `""` | Comma-separated port list |
| `devbar.custom-patterns` | `""` | Comma-separated glob host patterns |
| `devbar.auto-open-devtools` | `false` | Auto-open DevTools on every dev URL navigation |
| `devbar.auto-open-panel` | `"webconsole"` | Which panel auto-open uses (`webconsole` / `netmonitor` / `inspector`) |
| `devbar.self-tests` | `false` | Run logic self-tests on window open and print results to the console (for contributors) |
| `devbar.site-rules` | `"{}"` | Remembered HTTP(S) origins mapped to `"on"` or `"off"`; Automatic removes the entry |
| `devbar.show-actions` | `true` | Show developer action buttons in the banner |

**Firefox prefs** (not owned by this mod — the settings panel just toggles them so your changes survive restart):

| Preference | Default | Description |
|---|---|---|
| `devtools.cache.disabled` | `false` | Disable HTTP cache |
| `security.mixed_content.block_active_content` | `true` | Block mixed content (panel toggle is inverted: unchecked = block) |
| `javascript.enabled` | `true` | JavaScript enabled globally |
