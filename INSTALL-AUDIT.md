# zen-dev-url — Cross-Platform Installation Ease Audit

**Date:** 2026-04-14  
**Auditor:** Copilot  
**Scope:** Installation experience across all documented platforms  
**Repository version:** `v20260414-4` (commit `208850b`)

---

## Executive Summary

zen-dev-url requires **Zen Browser** + **fx-autoconfig** + manual `about:config` setup. The installation experience ranges from **excellent** (macOS, Windows PowerShell, Linux tarball) to **poor** (Flatpak, AppImage, WSL). The main barriers are: the fx-autoconfig dependency requiring write access to browser program files, the lack of a WSL installer, and misleading success messages on Flatpak.

### Platform Scorecard

| Platform | Install Command | Steps to Working Extension | Ease Rating |
|---|---|---|---|
| **macOS** | `bash install.sh` | 1 command + `about:config` + restart | ⭐⭐⭐⭐ Good |
| **Windows PowerShell** | `.\install.ps1` | 1 command + execution policy + `about:config` + restart | ⭐⭐⭐ OK |
| **Linux (tarball)** | `bash install.sh` | 1 command + `about:config` + restart | ⭐⭐⭐⭐ Good |
| **Linux (pkg mgr)** | `[sudo] bash install.sh` | 1 command (maybe sudo) + `about:config` + restart | ⭐⭐⭐ OK |
| **Linux (Flatpak)** | `bash install.sh` + manual steps | 1 command + 6-line manual snippet + `about:config` + restart | ⭐⭐ Poor |
| **Linux (AppImage)** | extract + `bash install.sh` | 3 manual steps + 1 command + `about:config` + restart | ⭐⭐ Poor |
| **Windows (WSL)** | copy-paste snippet | 10-line manual snippet + `about:config` + restart | ⭐ Very Poor |
| **Manual (any)** | file copies | 4 manual steps | ⭐⭐ Poor |

---

## Findings

### Issue 1: `install.sh` does not check for required CLI tools (`curl`, `unzip`)

**Severity:** Medium  
**Platforms:** Linux (all variants), macOS (edge cases)

`install.sh` uses `curl` and `unzip` to download and extract fx-autoconfig but never verifies they are installed. On minimal Linux systems (Alpine, some Debian containers, Arch base installs), these tools may be absent. The script fails mid-run with a cryptic `command not found` error — potentially after already modifying some files — leaving the install in a half-done state.

**Recommendation:** Add a dependency check near the top of `install.sh`:
```bash
for cmd in curl unzip; do
  command -v "$cmd" &>/dev/null || error "'$cmd' is required but not installed."
done
```

---

### Issue 2: WSL has no installer — requires copy-pasting a 10-line shell snippet

**Severity:** High  
**Platforms:** Windows + WSL

WSL users have no install script. They must copy-paste a 10-line shell snippet from the README. Problems:

1. **No idempotency guard** — `sed -i` strips old CSS but doesn't check if the marker exists first
2. **No fx-autoconfig setup** — the snippet only copies JS and CSS; no fx-autoconfig program or profile files
3. **No error context** — failures show `JS FAILED` with no diagnostic info
4. **Easy to get wrong** — users must `cd` into the repo first and the path logic is embedded in the snippet
5. **Separate update snippet** — updating requires copying a different block of shell commands

**Recommendation:** Extend `install.sh` to detect WSL natively:
```bash
if grep -qi microsoft /proc/version 2>/dev/null; then
  WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  PROFILES_INI="/mnt/c/Users/$WINUSER/AppData/Roaming/zen/profiles.ini"
  # ... reuse existing install logic
fi
```

---

### Issue 3: Flatpak install reports "complete" but extension doesn't work

**Severity:** High  
**Platforms:** Linux (Flatpak — described as "most common on modern distros")

`install.sh` copies the JS and CSS for Flatpak users, then prints a green "Installation complete!" message. However, fx-autoconfig's profile-side `chrome/utils/` files are **not** installed automatically. Without them, fx-autoconfig cannot load the userscript, so the extension **does not function at all**.

The user must then follow a separate 6-line manual snippet from the README. The misleading success message means many users will restart Zen, see nothing happen, and assume the extension is broken.

**Recommendation:**
1. Don't print "Installation complete!" unless fx-autoconfig utils are in place
2. Automate the profile-side fx-autoconfig install (the script already knows the profile path)
3. Print a clear "⚠ One more step required" with exact commands if program-side can't be automated

---

### Issue 4: No `about:config` verification or uninstall path

**Severity:** Medium  
**Platforms:** All

After installation, users must manually set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true` in `about:config`. Without this, `userChrome.css` is completely ignored — the extension produces no visual output. There is:

- No way for the installer to verify this was done (checking `prefs.js` in the profile is possible)
- No way for the extension to warn the user at runtime if CSS isn't loading
- No documented or scripted uninstall path

**Recommendation:**
- Add a `--verify` flag that reads `prefs.js` and checks if the pref is set
- Add a `--uninstall` flag that removes the JS file and strips the CSS marker block
- Have the userscript log a diagnostic if it detects the banner element exists but isn't visible

---

### Issue 5: PowerShell execution policy friction on Windows

**Severity:** Medium  
**Platforms:** Windows (native PowerShell)

`install.ps1` requires changing PowerShell's execution policy before running. The README instructs:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

Friction points:
1. `Bypass` is the least restrictive policy — security-conscious users may hesitate
2. Right-click "Run with PowerShell" fails silently under restrictive policies
3. The script isn't signed, so it can't run under `AllSigned` or `RemoteSigned`
4. No elevation detection — writing to `%PROGRAMFILES%\Zen Browser\` may need admin

**Recommendation:** Add an `install.bat` wrapper:
```bat
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
```
This makes installation a double-click with no PowerShell knowledge required.

---

### Issue 6: fx-autoconfig dependency creates platform-specific barriers

**Severity:** High (architectural)  
**Platforms:** All

The extension depends on [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig), which requires modifying the browser's program directory. This is the root cause of most platform-specific friction:

| Issue | Root Cause |
|---|---|
| macOS needs `sudo` | Writing into `Zen.app/Contents/Resources/` |
| Flatpak is broken | App bundle is read-only squashfs |
| AppImage needs extraction | Read-only squashfs mount |
| Snap won't work at all | Confinement prevents modification |
| Zen updates may break install | `config.js` in program dir gets overwritten |

Additionally:
- If GitHub is down, the installer fails (no vendored fallback)
- There's no verification that fx-autoconfig is actually loaded after install
- This is not a standard extension mechanism — users expect add-ons pages or `.xpi` files

**Recommendation (short-term):** Vendor fx-autoconfig files in this repo to eliminate the network dependency.  
**Recommendation (long-term):** Investigate packaging as a WebExtension (`.xpi`) or using Zen's native mod system (if available) to eliminate fx-autoconfig entirely.

---

### Issue 7: Inconsistent platform experience — no CLI flags for help/dry-run/version

**Severity:** Medium  
**Platforms:** All

Neither installer accepts any flags. Users cannot:
- See what the installer will do before doing it (`--dry-run`)
- See which version is being installed (`--version`)
- Get usage help (`--help`)
- Undo an installation (`--uninstall`)
- Check if installation is healthy (`--verify`)

The installers also don't print the version being installed (only the `about:config` reminder), so users can't confirm they installed the right version without opening the browser console.

**Recommendation:** Add `--help`, `--dry-run`, `--uninstall`, and `--verify` flags to both `install.sh` and `install.ps1`. Print the version string at the start of every run.

---

## Detailed Platform Walkthroughs

### macOS — ⭐⭐⭐⭐ Good

**Prerequisites:** Zen Browser installed to `/Applications/Zen.app`, `curl` and `unzip` available (ship with macOS by default), `git` to clone the repo.

**Steps:**
1. `git clone` the repo
2. `bash install.sh` (will prompt for `sudo` to write fx-autoconfig into `Zen.app`)
3. Open Zen → `about:config` → enable stylesheet pref
4. Restart Zen

**Friction points:**
- Requires `sudo` for fx-autoconfig program files (may surprise users)
- Hardcoded to `/Applications/Zen.app` — `~/Applications/Zen.app` is not checked
- The `about:config` step is manual but clearly prompted

**Verdict:** Smooth experience for most users. The `sudo` prompt is the only speed bump.

---

### Windows PowerShell — ⭐⭐⭐ OK

**Prerequisites:** Zen Browser installed, PowerShell available (ships with Windows).

**Steps:**
1. Clone or download the repo
2. Open PowerShell, navigate to repo
3. `Set-ExecutionPolicy -Scope Process Bypass` (or right-click "Run with PowerShell")
4. `.\install.ps1`
5. Open Zen → `about:config` → enable stylesheet pref
6. Restart Zen

**Friction points:**
- Execution policy barrier is confusing for non-PowerShell users
- No `.bat` wrapper for double-click install
- Right-click "Run with PowerShell" may fail depending on system policy

**Verdict:** Works well for technically proficient users. The execution policy step is a barrier for newcomers.

---

### Linux (tarball/manual extract) — ⭐⭐⭐⭐ Good

**Prerequisites:** Zen extracted to a user-owned directory (`~/.local/zen-browser/` etc.), `curl` and `unzip`.

**Steps:**
1. Clone the repo
2. `bash install.sh`
3. `about:config` + restart

**Friction points:**
- `curl` and `unzip` aren't checked before use
- If Zen is in `/opt/zen-browser/` but owned by root, the installer may fail without a clear message about needing `sudo`

**Verdict:** Best Linux experience. Comparable to macOS.

---

### Linux (Flatpak) — ⭐⭐ Poor

**Prerequisites:** Zen installed via Flatpak, `curl`, `unzip`.

**Steps:**
1. Clone the repo
2. `bash install.sh` → copies JS + CSS, prints warnings about fx-autoconfig
3. Manually download and extract fx-autoconfig
4. Manually copy `chrome/utils/` to profile
5. Separately handle the program-side `config.js` (requires Flatpak override or switching to tarball)
6. `about:config` + restart

**Friction points:**
- Script says "Installation complete!" when it's not
- 6-line manual snippet required
- The `config.js` program-side issue may be **impossible** to resolve without switching away from Flatpak
- Users on the "most common" Linux method have the worst experience

**Verdict:** The combination of misleading success messages and manual steps makes this the most frustrating automated-ish path.

---

### Linux (AppImage) — ⭐⭐ Poor

**Prerequisites:** Zen AppImage downloaded.

**Steps:**
1. `./zen.AppImage --appimage-extract`
2. `mv squashfs-root ~/.local/zen-browser`
3. Run Zen from the new location to create a profile
4. `bash install.sh`
5. `about:config` + restart

**Friction points:**
- 3 manual steps before the installer can even run
- Users must change how they launch Zen permanently
- The extraction + move process is not intuitive
- If users try `install.sh` first, they get an error telling them to extract — wasted time

**Verdict:** Workable but requires significant Linux knowledge.

---

### Windows WSL — ⭐ Very Poor

**Prerequisites:** WSL with Ubuntu, Zen installed on the Windows side.

**Steps:**
1. Clone the repo in WSL
2. Copy-paste the 10-line shell snippet from README
3. Manually install fx-autoconfig (not covered by the snippet)
4. `about:config` + restart

**Friction points:**
- No installer script at all
- The snippet doesn't install fx-autoconfig
- Users must know their Windows username for path construction
- No error handling
- Different snippet for install vs. update
- Most likely to be used by developers (the target audience!)

**Verdict:** The worst installation experience. Ironic since WSL is a very common developer environment.

---

### Manual — ⭐⭐ Poor

**Steps:**
1. Copy JS file to `chrome/JS/`
2. Append CSS to `userChrome.css`
3. Install fx-autoconfig separately
4. `about:config` + restart

**Friction points:**
- Must know where the profile directory is
- Must install fx-autoconfig independently
- No idempotency — appending CSS twice creates duplicates (the installers handle this, manual doesn't)

**Verdict:** Acceptable as a last resort, but the documentation could link to fx-autoconfig setup more prominently.

---

## Summary of Recommendations (Priority Order)

| Priority | Issue | Effort | Impact |
|---|---|---|---|
| **P0** | Fix Flatpak misleading success message (#3) | Small | High — prevents confusion on most common Linux method |
| **P0** | Add WSL support to `install.sh` (#2) | Medium | High — eliminates the worst platform experience |
| **P1** | Check for `curl`/`unzip` before use (#1) | Tiny | Medium — prevents cryptic mid-install failures |
| **P1** | Add `install.bat` wrapper for Windows (#5) | Tiny | Medium — makes Windows install a double-click |
| **P1** | Add `--uninstall` flag (#4) | Small | Medium — no cleanup path currently exists |
| **P2** | Add `--help`, `--dry-run`, `--verify` flags (#7) | Medium | Medium — improves trust and debuggability |
| **P2** | Vendor fx-autoconfig files (#6, short-term) | Small | Medium — eliminates network dependency |
| **P3** | Investigate WebExtension packaging (#6, long-term) | Large | Very High — would make install a single click on all platforms |

---

## Appendix: Issue Templates for GitHub

The following issues are ready to be filed. Each corresponds to a finding above.

### Issue: `install.sh` does not check for `curl` / `unzip` before use
**Labels:** `bug`, `installer`  
See Finding #1 above.

### Issue: Add WSL support to `install.sh`
**Labels:** `enhancement`, `installer`  
See Finding #2 above.

### Issue: Flatpak install misleadingly reports success when fx-autoconfig is not set up
**Labels:** `bug`, `installer`, `ux`  
See Finding #3 above.

### Issue: Add `--uninstall` flag and `about:config` verification to installers
**Labels:** `enhancement`, `installer`  
See Finding #4 above.

### Issue: Add `install.bat` wrapper to simplify Windows installation
**Labels:** `enhancement`, `installer`  
See Finding #5 above.

### Issue: Vendor fx-autoconfig or investigate WebExtension packaging
**Labels:** `enhancement`, `architecture`  
See Finding #6 above.

### Issue: Add `--help`, `--dry-run`, `--verify` CLI flags to installers
**Labels:** `enhancement`, `installer`  
See Finding #7 above.
