# devbar

> A developer-mode mod for [Zen Browser](https://zen-browser.app) — construction-stripe banner, URL controls, and DevTools shortcuts that activate automatically on local dev URLs.

**1.2.0-beta.1 candidate:** this update adds remembered per-site choices and an always-available settings shortcut while retaining native URL suggestions, the viewport readout, actions, and detection settings. Validated on **Windows 11 with Zen 1.22.1b**; see the [current validation record](docs/BETA-VALIDATION.md) for the checks performed and their limits. See [installation and removal](docs/INSTALLATION.md), [configuration](docs/CONFIGURATION.md), and the [beta checklist](docs/BETA-TESTING.md).

![devbar beta toolbar in Zen 1.22.1b on Windows 11](docs/media/beta-toolbar.png)

---

## What it looks like

The screenshots below show the earlier April interface. The image above and validation record cover the current beta.

<!-- MEDIA: side-by-side screenshot — normal vs dev URL -->
<!-- ![Before and after](docs/media/before-after.png) -->
### Devbar
<img width="1202" height="146" alt="SCR-20260420-oxbw" src="https://github.com/user-attachments/assets/34334967-66e7-45ea-823a-95336bf039f8" />

### Tab Bar with Construction Stripes
<img width="330" height="88" alt="SCR-20260420-oxgd" src="https://github.com/user-attachments/assets/308bef94-8b2c-47ad-ba9a-41e20cebf9ab" />

### Settings Menu
<img width="301" height="790" alt="SCR-20260420-oxia" src="https://github.com/user-attachments/assets/3ddac77f-4e33-462b-9ad6-13ef4a39ec74" />


When you navigate to a local dev URL, devbar:

- Slides in a **construction-stripe banner** above the page
- Highlights the sidebar URL bar with an **orange outline**
- Adds a **striped border** to the active tab

<!-- MEDIA: close-up of the banner controls -->
<!-- ![Banner controls](docs/media/banner-controls.png) -->

---

## Features

### Banner

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

### Settings panel

<!-- MEDIA: screenshot of the settings panel -->
<!-- ![Settings panel](docs/media/settings-panel.png) -->

**Detection**
- Toggle 0.0.0.0 matching
- Toggle `.local` / `.test` / `.internal` / `.localhost` TLD matching
- Custom ports (e.g. `3000, 5173, 8080`) — any HTTP/HTTPS URL on those ports triggers dev mode
- Custom host patterns (glob syntax, e.g. `*.vercel.app`, `*.ngrok.io`)

**Network**
- Toggle the global HTTP-cache preference (`devtools.cache.disabled`); this setting is not restored when dev mode ends
- Toggle global mixed-content blocking (HTTPS pages loading HTTP resources)

**Page**
- Toggle JavaScript globally (`javascript.enabled`)

**DevTools**
- Auto-open DevTools on every dev URL navigation
- Choose which panel opens automatically (Console / Network / Inspector)

**Actions**
- Open current URL in a new tab
- Open current URL in a new private window
- View page source
- Copy as `curl` command (properly shell-escaped)

All settings are saved to `about:config` prefs and survive restarts.

### Keyboard shortcut

`Alt+Shift+D` — toggle dev mode for the current HTTP(S) origin and remember the choice across restarts. An origin includes scheme, hostname, and effective port; paths share a choice. Settings offers **Automatic / Always on / Always off**. Automatic removes the override and uses the existing detection rules. Private-window choices also persist in profile preferences; see [configuration](docs/CONFIGURATION.md).

`Alt+Shift+O` — open the settings panel even when the bar is hidden or globally disabled. Settings also exposes the master switch and an option to hide developer action buttons. Selecting Always on re-enables the master switch.

Non-HTTP(S) pages retain temporary per-tab shortcut behavior. This differs from the persistent HTTP(S) origin setting.

### Detected URLs (defaults)

| Pattern | Example |
|---|---|
| `localhost` | `http://localhost:3000` |
| `127.0.0.1` | `http://127.0.0.1:8080` |
| `0.0.0.0` *(toggleable)* | `http://0.0.0.0:5173` |
| `[::1]` | `http://[::1]:4000` |
| `.local` *(toggleable)* | `http://myapp.local` |
| `.localhost` *(toggleable)* | `http://myapp.localhost` |
| `.internal` *(toggleable)* | `http://api.internal` |
| `.test` *(toggleable)* | `http://myapp.test` |
| Custom ports | any host on a port you configure |
| Custom patterns | glob patterns you define |

---

## Requirements

- [Zen Browser](https://zen-browser.app)
- [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) — loads the userscript at startup

---

## Installation

### macOS

```bash
bash install.sh
```

The script will:
1. Detect your Zen profile automatically
2. Install fx-autoconfig if not already present (requires `sudo` to write into `Zen.app`)
3. Copy the userscript to `chrome/JS/`
4. Install a bounded CSS block in `chrome/userChrome.css`, backing it up and preserving unrelated rules

After that, follow the one-time prompt to enable `toolkit.legacyUserProfileCustomizations.stylesheets` in `about:config`, then restart Zen.

---

### Windows

Double-click **`install.bat`** — it handles execution policy automatically. Or from a PowerShell terminal:

```powershell
.\install.ps1
```

The script detects profiles from `%APPDATA%\zen\profiles.ini`, installs fx-autoconfig, copies the userscript, and installs a bounded CSS block. Select a single profile with `-ProfilePath "<profile>"`; otherwise it retains multi-profile behavior. Preview with `-DryRun`.

After that, follow the one-time prompt in `about:config`, then restart Zen.

---

### Linux

Zen Browser ships for Linux in three forms — the install experience differs per method.

---

#### Flatpak *(most common on modern distros — partial support)*

```bash
bash install.sh
```

The script auto-detects the Flatpak install (app ID: `app.zen_browser.zen`) and installs:

- ✅ The userscript (to `chrome/JS/`)
- ✅ The CSS (to `userChrome.css`)
- ✅ fx-autoconfig's **profile-side** utils (to `chrome/utils/`) — auto-installed from the vendored copy since v20260415-2

**What's still manual:** the Flatpak app bundle is a read-only squashfs, so fx-autoconfig's **program-side** files (`config.js`, `config-prefs.js`) can't be placed inside it by any installer. Without those two files the mod does not load.

The installer will print a red `⚠ INSTALL INCOMPLETE` box at the end explaining this — it no longer falsely reports success.

> **Recommended workaround:** switch to the tarball install of Zen (see next section). The Flatpak path can't be fully fixed without upstream Flatpak maintainer buy-in for a `config.js` override hook.

---

#### Tarball / manual extract *(full support)*

Extract the Zen tarball to a user-owned directory, then:

```bash
bash install.sh
```

The script finds the extracted binary, writes fx-autoconfig's program files alongside it (no `sudo` needed since you own the directory), and copies the userscript and CSS.

Common extraction locations it checks automatically:
- `~/.local/share/zen-browser/`
- `~/.local/zen-browser/`
- `/opt/zen-browser/`

---

#### AppImage

AppImages are read-only squashfs mounts — fx-autoconfig cannot be written into them at runtime. Extract it first:

```bash
./zen.AppImage --appimage-extract
mv squashfs-root ~/.local/zen-browser
# Then run zen from ~/.local/zen-browser/zen
bash install.sh
```

After extraction `install.sh` treats it the same as a tarball install.

---

#### Package manager (AUR, etc.)

```bash
bash install.sh
```

If the package installed Zen to `/opt/zen-browser/` or `/usr/lib/zen-browser/` the script will find it. Resources under `/opt` are typically user-writable; resources under `/usr/lib` need `sudo` — the script will fail with a permission error if so. In that case prefix with `sudo`:

```bash
sudo bash install.sh
```

---

### Windows — WSL (Ubuntu)

Open a WSL terminal inside this repo's directory:

```bash
bash install.sh
```

`install.sh` detects WSL automatically (via `/proc/version`), resolves your Windows username through `cmd.exe`, and targets the Zen install on the Windows side at `%APPDATA%\zen`. It also installs fx-autoconfig's program files into `%PROGRAMFILES%\Zen Browser\` (or `%LOCALAPPDATA%\zen\`) — the same files `install.ps1` handles for native PowerShell.

Multi-channel users don't need to do anything extra — the installer iterates every `Install{hash}` section in `profiles.ini` and installs to all detected channels (release/beta/twilight).

> **Note:** if Zen is installed under `%PROGRAMFILES%\Zen Browser\`, the installer may need Windows Administrator to write `config.js` there. If the check fails it will tell you to either re-launch WSL elevated, or just use `install.ps1` on the PowerShell side instead.

Then **fully quit and reopen Zen** (File → Quit, not just close window).

---

### Manual

1. **Userscript** — copy `devbar.uc.js` into your profile's `chrome/JS/` folder:
   - macOS: `~/Library/Application Support/Zen/Profiles/<profile>/chrome/JS/`
   - Windows: `%APPDATA%\zen\<profile>\chrome\JS\`

2. **CSS** — copy `devbar.css` to `chrome/`, then add `@import url("devbar.css");` before ordinary rules in `userChrome.css`. Keep unrelated rules; remove only a previous devbar block if present. See [safe update/removal instructions](docs/INSTALLATION.md).

3. **Enable userChrome** — in `about:config`, set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`

4. **Restart Zen**

---

## Verifying the install

Open the browser console (`Cmd+Option+J` on Mac, `Ctrl+Shift+J` on Windows) after restart. You should see:

```
[devbar] vYYYYMMDD-N loaded   ← styled in orange
```

Then navigate to `http://localhost` — the banner should appear.

---

## Updating

### macOS / Linux
```bash
git pull && bash install.sh
```

### WSL
```bash
git pull && bash install.sh
```

Same as macOS / Linux — `install.sh` handles WSL natively since v20260415-3. Restart Zen and confirm the version number bumped in the console.

### Windows
```powershell
git pull
.\install.ps1
```

---

## Installer options

Both `install.sh` and `install.ps1` accept the following flags:

| Flag | PowerShell | What it does |
|---|---|---|
| `--help` | `-Help` | Show usage and exit |
| `--uninstall` | `-Uninstall` | Remove devbar files from all profiles |
| `--verify` | `-Verify` | Check that the install is healthy |
| `--dry-run` | `-DryRun` | Show what would be done, change nothing |
| `--profile DIR` | `-ProfilePath DIR` | Limit installation, verification, or removal to one existing profile |

The beta uses bounded CSS markers and backups. Known old blocks migrate; ambiguous legacy blocks require manual cleanup. Manual CSS imports must be removed manually when uninstalling. See [installation and removal](docs/INSTALLATION.md).

```bash
# Check if everything is installed correctly
bash install.sh --verify

# Remove devbar (leaves fx-autoconfig in place)
bash install.sh --uninstall

# Preview what the installer will do
bash install.sh --dry-run
```

---

## Testing the Linux installer without a Linux machine

You don't need a Linux VM. Since you already have WSL2 (Ubuntu), Docker is the easiest path — Docker Desktop for Windows uses WSL2 as its backend, so no extra setup is needed.

### With Docker (recommended)

```bash
# From WSL2 — mock the Zen Flatpak directory structure
docker run --rm -it -v "$PWD:/repo" ubuntu:24.04 bash -c "
  apt-get update -q && apt-get install -q -y curl unzip &&
  # Simulate a Flatpak profile (must match the 'Default=Profiles/...'
  # format that the real installer parses from [Install{hash}] sections)
  ZEN_DIR=/root/.var/app/app.zen_browser.zen/zen &&
  mkdir -p \$ZEN_DIR/Profiles/default/chrome &&
  printf '[Install1234]\nDefault=Profiles/default\n' > \$ZEN_DIR/profiles.ini &&
  touch \$ZEN_DIR/Profiles/default/chrome/userChrome.css &&
  cd /repo &&
  bash install.sh
"
```

This runs the installer inside a clean Ubuntu container against a mocked profile tree. You can inspect the resulting `chrome/JS/` and `chrome/userChrome.css` to verify the output.

For a tarball install simulation, add a fake `zen` binary:

```bash
mkdir -p /root/.local/zen-browser && touch /root/.local/zen-browser/zen && chmod +x /root/.local/zen-browser/zen
```

### With GitHub Actions

Add a workflow to run `install.sh` on a real Linux runner automatically on every push — see `.github/workflows/` if one is added in the future.

---

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

---

## How it works

devbar is a [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) userscript (`devbar.uc.js`) that runs in the browser chrome context. It:

1. Listens to tab and navigation events via `gBrowser`
2. Checks the current URI against dev host/port/pattern rules
3. Sets a `devbar` attribute on `document.documentElement`
4. CSS in `userChrome.css` keyed on `:root[devbar]` activates all the visual changes

No native code, no extensions API, no remote requests.

---

## Contributing

Issues and PRs welcome. The dev branch is `dev` — please target that, not `main`.

Use the [contribution guide](CONTRIBUTING.md) and [beta test checklist](docs/BETA-TESTING.md). Report this mod's bugs in [this repository's Issues](https://github.com/DannyAmzq/zen-dev-url/issues), with your exact Zen version, OS, loader, other UI mods, and steps. Redact private URLs and tokens. Security reporting is described in [SECURITY.md](SECURITY.md).

<!-- MEDIA: optional contributor guide link or badge row -->
