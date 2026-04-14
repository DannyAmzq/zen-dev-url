#!/usr/bin/env bash
# ============================================================
# create-audit-issues.sh — Bulk-create GitHub issues from the
# cross-platform installation audit (INSTALL-AUDIT.md).
#
# Usage:
#   gh auth login   # if not already authenticated
#   bash create-audit-issues.sh
#
# Requires: gh CLI (https://cli.github.com)
# ============================================================

set -e

REPO="DannyAmzq/zen-dev-url"

echo "Creating 7 issues for the cross-platform installation audit..."
echo ""

# ── Issue 1 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "install.sh does not check for curl / unzip before use" \
  --label "bug,installer" \
  --body "$(cat <<'EOF'
## Problem

`install.sh` uses `curl` and `unzip` to download and extract fx-autoconfig, but never checks whether these tools are actually installed. On minimal Linux installs (Alpine, some Debian containers, Arch base), `curl` and/or `unzip` may not be present. The script will fail with a cryptic `command not found` error mid-run — after it has already modified some files — leaving the install in a half-done state.

**Platforms:** Linux (all variants), macOS (edge cases)

## Suggested fix

Add a dependency check near the top of `install.sh`:

```bash
for cmd in curl unzip; do
  command -v "$cmd" &>/dev/null || error "'$cmd' is required but not installed. Install it and re-run."
done
```

**Impact:** Medium — affects first-time users on minimal systems. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §1).
EOF
)"
echo "✓ Issue 1 created"

# ── Issue 2 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "Add WSL support to install.sh" \
  --label "enhancement,installer" \
  --body "$(cat <<'EOF'
## Problem

Windows WSL users have no install script. They must copy-paste a 10-line shell snippet from the README. This is error-prone:

1. No idempotency guard
2. No fx-autoconfig setup (only copies JS and CSS)
3. No error context — failures show `JS FAILED` with no diagnostic info
4. Users must manually `cd` into the repo and know their Windows username
5. Update path is a separate snippet

WSL is a very common developer environment — the target audience for this extension.

**Platforms:** Windows + WSL

## Suggested fix

Detect WSL in `install.sh` and handle natively:

```bash
if grep -qi microsoft /proc/version 2>/dev/null; then
  WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  PROFILES_INI="/mnt/c/Users/$WINUSER/AppData/Roaming/zen/profiles.ini"
  # ... reuse existing install logic
fi
```

**Impact:** High — eliminates the worst platform experience. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §2).
EOF
)"
echo "✓ Issue 2 created"

# ── Issue 3 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "Flatpak install misleadingly reports success when fx-autoconfig is not set up" \
  --label "bug,installer,ux" \
  --body "$(cat <<'EOF'
## Problem

On Flatpak installs, `install.sh` copies the JS and CSS, then prints a green **"Installation complete!"** message. However, fx-autoconfig's profile-side `chrome/utils/` files are NOT installed. Without them, the userscript never loads and the extension does not function at all.

The user must then follow a separate 6-line manual snippet. The misleading success message means users restart Zen, see nothing, and assume the extension is broken.

Flatpak is described in the README as the "most common" Linux install method.

**Platforms:** Linux (Flatpak)

## Suggested fix

1. Don't print "Installation complete!" unless fx-autoconfig utils are verified in the profile
2. Automate the profile-side fx-autoconfig install (script already knows the profile path)
3. Print a clear "⚠ One more step required" with exact commands if program-side can't be automated

**Impact:** High — most common Linux method has a broken happy path. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §3).
EOF
)"
echo "✓ Issue 3 created"

# ── Issue 4 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "Add --uninstall flag and about:config verification to installers" \
  --label "enhancement,installer" \
  --body "$(cat <<'EOF'
## Problem

After both installers complete, there is:

- No way to verify the `about:config` pref was set (checking `prefs.js` is possible)
- No way for the extension to warn users if CSS isn't loading
- No documented or scripted uninstall path

Users who want to remove the extension must manually identify and remove the JS file, strip CSS from `userChrome.css`, and reverse the `about:config` change.

**Platforms:** All

## Suggested fix

- Add `--verify` flag that reads `prefs.js` and checks if the stylesheet pref is set
- Add `--uninstall` flag that removes `zen-dev-url-detector.uc.js` and strips the CSS marker block
- Have the userscript log a diagnostic if it detects the banner exists but isn't visible

**Impact:** Medium — improves both onboarding and offboarding. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §4).
EOF
)"
echo "✓ Issue 4 created"

# ── Issue 5 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "Add install.bat wrapper to simplify Windows installation" \
  --label "enhancement,installer" \
  --body "$(cat <<'EOF'
## Problem

`install.ps1` requires changing PowerShell's execution policy before running:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

Friction: `Bypass` is the least restrictive policy (users may hesitate), right-click "Run with PowerShell" fails silently under restrictive policies, and the script isn't signed.

**Platforms:** Windows

## Suggested fix

Add an `install.bat` wrapper:

```bat
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
```

This makes installation a double-click with no PowerShell knowledge required. Also update the README to recommend the `.bat` approach first.

**Impact:** Medium — eliminates the main Windows friction point. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §5).
EOF
)"
echo "✓ Issue 5 created"

# ── Issue 6 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "Vendor fx-autoconfig files or investigate WebExtension packaging" \
  --label "enhancement,architecture" \
  --body "$(cat <<'EOF'
## Problem

The extension depends on fx-autoconfig, which requires modifying the browser's program directory. This is the root cause of most platform-specific friction:

| Issue | Root Cause |
|---|---|
| macOS needs sudo | Writing into Zen.app/Contents/Resources/ |
| Flatpak is broken | App bundle is read-only |
| AppImage needs extraction | Read-only squashfs mount |
| Snap won't work at all | Confinement prevents modification |
| Zen updates may break install | config.js gets overwritten |

Additionally, if GitHub is down the installer fails (no vendored fallback).

**Platforms:** All

## Suggested fix

**Short-term:** Vendor fx-autoconfig's required files in this repo to eliminate the network dependency.

**Long-term:** Investigate packaging as a WebExtension (.xpi) or using Zen's native mod system to eliminate fx-autoconfig entirely. This would make installation a single click on all platforms.

**Impact:** High (architectural) — this is the root cause of most installation friction. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §6).
EOF
)"
echo "✓ Issue 6 created"

# ── Issue 7 ──────────────────────────────────────────────────
gh issue create --repo "$REPO" \
  --title "Add --help, --dry-run, --verify CLI flags to installers" \
  --label "enhancement,installer" \
  --body "$(cat <<'EOF'
## Problem

Neither installer accepts any CLI flags. Users cannot:

- See what the installer will do before doing it (`--dry-run`)
- See which version is being installed (`--version`)
- Get usage help (`--help`)
- Check if installation is healthy (`--verify`)

The installers also don't print the version being installed, so users can't confirm the right version without opening the browser console.

**Platforms:** All

## Suggested fix

Add `--help`, `--dry-run`, `--uninstall`, `--verify` flags to both `install.sh` and `install.ps1`. Print the version string at the start of every run.

**Impact:** Medium — improves trust and debuggability. Surfaced by the 2026-04-14 installation audit (see `INSTALL-AUDIT.md` §7).
EOF
)"
echo "✓ Issue 7 created"

echo ""
echo "All 7 issues created successfully!"
