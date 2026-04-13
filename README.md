# zen-dev-url

> A developer-mode mod for [Zen Browser](https://zen-browser.app) — construction-stripe banner, URL controls, and DevTools shortcuts that activate automatically on local dev URLs.

<!-- MEDIA: hero screenshot or GIF of the banner in action -->
<!-- ![zen-dev-url banner demo](docs/media/banner-demo.gif) -->

---

## What it looks like

<!-- MEDIA: side-by-side screenshot — normal vs dev URL -->
<!-- ![Before and after](docs/media/before-after.png) -->

When you navigate to a local dev URL, zen-dev-url:

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
| **Trash** | Clears cookies, storage, and all caches for the site, then hard-reloads |
| **Reload** | Hard reload (bypass cache only — preserves auth/cookies) |
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
- Disable HTTP cache while in dev mode
- Allow mixed content (HTTPS page loading HTTP resources)

**Page**
- Disable JavaScript for the current tab

**DevTools**
- Auto-open DevTools on every dev URL navigation
- Choose which panel opens automatically (Console / Network / Inspector)

**Actions**
- Open current URL in a new private window

All settings are saved to `about:config` prefs and survive restarts.

### Keyboard shortcut

`Alt+Shift+D` — toggle dev mode on/off from anywhere.

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
4. Append the CSS to `chrome/userChrome.css` (idempotent — safe to re-run)

After that, follow the one-time prompt to enable `toolkit.legacyUserProfileCustomizations.stylesheets` in `about:config`, then restart Zen.

---

### Windows — PowerShell

Right-click `install.ps1` → **Run with PowerShell**, or from a PowerShell terminal:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

The script detects your profile from `%APPDATA%\zen\profiles.ini`, installs fx-autoconfig, copies the userscript, and appends the CSS.

After that, follow the one-time prompt in `about:config`, then restart Zen.

---

### Linux

Zen Browser ships for Linux in three forms — the install experience differs per method.

---

#### Flatpak *(most common on modern distros)*

```bash
bash install.sh
```

The script detects the Flatpak install automatically (app ID: `app.zen_browser.zen`) and copies the userscript and CSS into your profile. **However**, the Flatpak app bundle is read-only, so fx-autoconfig's program files (`config.js`) cannot be written there automatically.

You need to install fx-autoconfig's profile side manually:

```bash
# Download fx-autoconfig
curl -fsSL https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip \
  -o /tmp/fx-autoconfig.zip
unzip -q /tmp/fx-autoconfig.zip -d /tmp/fxac

# Find your profile (path printed by install.sh)
PROFILE="$HOME/.var/app/app.zen_browser.zen/zen/<your-profile>"

mkdir -p "$PROFILE/chrome/utils"
cp -r /tmp/fxac/fx-autoconfig-master/profile/chrome/utils/. "$PROFILE/chrome/utils/"
```

> The program-side `config.js` for Flatpak requires a Flatpak override. Until the Flatpak maintainers add an official hook, the cleanest workaround is to use the **tarball install** instead.

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
WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
ZEN="/mnt/c/Users/$WINUSER/AppData/Roaming/zen"
PROFILE=$(awk '/^\[Install/{f=1} f && /^Path=/{print substr($0,6); exit}' "$ZEN/profiles.ini" | tr -d '\r')
CHROME="$ZEN/$PROFILE/chrome"

cp zen-dev-url-detector.uc.js "$CHROME/JS/" && echo "JS ok"
sed -i '/\/\* zen-dev-url \*\//,$d' "$CHROME/userChrome.css"
{ printf '\n/* zen-dev-url */\n'; cat zen-dev-url.css; } >> "$CHROME/userChrome.css" && echo "CSS ok"
```

Then **fully quit and reopen Zen** (File → Quit, not just close window).

> **Tip:** this same snippet doubles as your update command — run it any time you pull new changes and restart Zen.

---

### Manual

1. **Userscript** — copy `zen-dev-url-detector.uc.js` into your profile's `chrome/JS/` folder:
   - macOS: `~/Library/Application Support/Zen/Profiles/<profile>/chrome/JS/`
   - Windows: `%APPDATA%\zen\<profile>\chrome\JS\`

2. **CSS** — append the contents of `zen-dev-url.css` to your `chrome/userChrome.css`

3. **Enable userChrome** — in `about:config`, set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`

4. **Restart Zen**

---

## Verifying the install

Open the browser console (`Cmd+Option+J` on Mac, `Ctrl+Shift+J` on Windows) after restart. You should see:

```
[zen-dev-url] v20260412-24 loaded   ← styled in orange
[zen-dev-url] self-tests: 15/15 passed
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
git pull

WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
ZEN="/mnt/c/Users/$WINUSER/AppData/Roaming/zen"
PROFILE=$(awk '/^\[Install/{f=1} f && /^Path=/{print substr($0,6); exit}' "$ZEN/profiles.ini" | tr -d '\r')
CHROME="$ZEN/$PROFILE/chrome"

cp zen-dev-url-detector.uc.js "$CHROME/JS/" && echo "JS ok"
sed -i '/\/\* zen-dev-url \*\//,$d' "$CHROME/userChrome.css"
{ printf '\n/* zen-dev-url */\n'; cat zen-dev-url.css; } >> "$CHROME/userChrome.css" && echo "CSS ok"
```

Restart Zen and confirm the version number bumped in the console.

### Windows PowerShell
```powershell
git pull
.\install.ps1
```

---

## Testing the Linux installer without a Linux machine

You don't need a Linux VM. Since you already have WSL2 (Ubuntu), Docker is the easiest path — Docker Desktop for Windows uses WSL2 as its backend, so no extra setup is needed.

### With Docker (recommended)

```bash
# From WSL2 — mock the Zen Flatpak directory structure
docker run --rm -it -v "$PWD:/repo" ubuntu:24.04 bash -c "
  apt-get update -q && apt-get install -q -y curl unzip &&
  # Simulate a Flatpak profile
  mkdir -p /root/.var/app/app.zen_browser.zen/zen/default &&
  touch /root/.var/app/app.zen_browser.zen/zen/profiles.ini &&
  printf '[Install1234]\nDefault=default\n' > /root/.var/app/app.zen_browser.zen/zen/profiles.ini &&
  mkdir -p /root/.var/app/app.zen_browser.zen/zen/default/chrome &&
  touch /root/.var/app/app.zen_browser.zen/zen/default/chrome/userChrome.css &&
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

All preferences are under `zen.urlbar.*`. You can tweak them directly in `about:config` or through the gear panel.

| Preference | Default | Description |
|---|---|---|
| `zen.urlbar.show-dev-indicator` | `true` | Master on/off switch |
| `zen.urlbar.dev-indicator.include-zero-host` | `true` | Match `0.0.0.0` |
| `zen.urlbar.dev-indicator.include-local-tlds` | `true` | Match `.local` / `.test` / etc. |
| `zen.urlbar.dev-indicator.custom-ports` | `""` | Comma-separated port list |
| `zen.urlbar.dev-indicator.custom-patterns` | `""` | Comma-separated glob patterns |
| `zen.urlbar.dev-indicator.disable-cache` | `false` | Disable HTTP cache |
| `zen.urlbar.dev-indicator.allow-mixed-content` | `false` | Allow mixed content |
| `zen.urlbar.dev-indicator.disable-js` | `false` | Disable JavaScript |
| `zen.urlbar.dev-indicator.auto-open-devtools` | `false` | Auto-open DevTools on nav |
| `zen.urlbar.dev-indicator.devtools-panel` | `"webconsole"` | Panel opened by auto-open |

---

## How it works

zen-dev-url is a [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) userscript (`zen-dev-url-detector.uc.js`) that runs in the browser chrome context. It:

1. Listens to tab and navigation events via `gBrowser`
2. Checks the current URI against dev host/port/pattern rules
3. Sets a `zen-dev-url` attribute on `document.documentElement`
4. CSS in `userChrome.css` keyed on `:root[zen-dev-url]` activates all the visual changes

No native code, no extensions API, no remote requests.

---

## Contributing

Issues and PRs welcome. The dev branch is `dev` — please target that, not `main`.

<!-- MEDIA: optional contributor guide link or badge row -->
