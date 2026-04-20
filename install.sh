#!/usr/bin/env bash
# ============================================================
# zen-dev-url installer — Mac & Linux
# ============================================================
# NOTE: Any existing userChrome.css content is preserved.
#       This script appends zen-dev-url styles rather than
#       overwriting, and is safe to re-run (idempotent).
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[zen-dev-url]${NC} $1"; }
success() { echo -e "${GREEN}[zen-dev-url]${NC} $1"; }
warn()    { echo -e "${YELLOW}[zen-dev-url]${NC} $1"; }
error()   { echo -e "${RED}[zen-dev-url]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 0. Parse CLI flags ──────────────────────────────────────

MODE="install"

show_help() {
  cat <<'HELP'
zen-dev-url installer — Mac, Linux, and WSL

Usage: bash install.sh [OPTIONS]

Options:
  -h, --help        Show this help message and exit
      --uninstall   Remove zen-dev-url files from all detected profiles
      --verify      Check whether zen-dev-url is correctly installed
      --dry-run     Show what would be done without making changes

Without options, installs zen-dev-url to all detected Zen profiles.
HELP
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --help|-h)      show_help ;;
    --uninstall)    MODE="uninstall" ;;
    --verify)       MODE="verify" ;;
    --dry-run)      MODE="dry-run" ;;
    *)              error "Unknown option: $arg (try --help)" ;;
  esac
done

VERSION=$(sed -n "s/.*ZEN_DEV_URL_VERSION *= *'\([^']*\)'.*/\1/p" "$SCRIPT_DIR/zen-dev-url-detector.uc.js" 2>/dev/null)
[[ -z "$VERSION" ]] && VERSION="unknown"
info "zen-dev-url v$VERSION — $MODE"

# ── 1. Detect OS and Zen paths ───────────────────────────────

IS_FLATPAK=false
IS_WSL=false
ZEN_RESOURCES=""

# WSL takes priority over the generic Linux branch: /proc/version contains
# "microsoft" on WSL1/WSL2 but the filesystem target is the Windows-side
# Zen install under /mnt/c, not a Linux Zen install.
if grep -qi microsoft /proc/version 2>/dev/null; then
  IS_WSL=true
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  ZEN_APP="/Applications/Zen.app"
  ZEN_RESOURCES="$ZEN_APP/Contents/Resources"
  PROFILES_INI="$HOME/Library/Application Support/Zen/profiles.ini"

elif [[ "$IS_WSL" == "true" ]]; then
  # ── WSL: Zen is installed on the Windows side under %APPDATA%\zen, ─
  #     program files under %LOCALAPPDATA%\zen or %PROGRAMFILES%\Zen Browser.
  command -v cmd.exe &>/dev/null \
    || error "WSL detected but cmd.exe is not on PATH — cannot resolve Windows user."
  WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n')
  [[ -n "$WINUSER" ]] \
    || error "Could not determine Windows username via cmd.exe. Is /mnt/c accessible?"
  info "WSL install detected (Windows user: $WINUSER)"

  PROFILES_INI="/mnt/c/Users/$WINUSER/AppData/Roaming/zen/profiles.ini"

  # Look for zen.exe in the standard Windows install locations.
  for _candidate in \
      "/mnt/c/Users/$WINUSER/AppData/Local/zen" \
      "/mnt/c/Program Files/Zen Browser" \
      "/mnt/c/Program Files (x86)/Zen Browser"; do
    if [[ -f "$_candidate/zen.exe" ]]; then
      ZEN_RESOURCES="$_candidate"
      break
    fi
  done
  [[ -z "$ZEN_RESOURCES" ]] \
    && error "Could not find Zen Browser on the Windows side. Is it installed?"

  # Sanity: we need write access to install fx-autoconfig program files —
  # but ONLY if they aren't already there. If config.js exists (from a prior
  # install.ps1 run or manual install), Step 3 will skip the write entirely
  # and we don't need permissions at all.
  if [[ ! -f "$ZEN_RESOURCES/config.js" && ! -w "$ZEN_RESOURCES" ]]; then
    warn "Cannot write to $ZEN_RESOURCES — likely needs Windows Administrator."
    warn "fx-autoconfig's config.js is not yet installed and needs to be placed there."
    warn "Either: (a) re-run from an elevated WSL shell (launch wsl.exe as admin)"
    warn "or     (b) run install.ps1 from PowerShell on the Windows side instead."
    error "Aborting: no write permission for fx-autoconfig program files."
  fi

elif [[ "$OSTYPE" == "linux-gnu"* || "$OSTYPE" == "linux"* ]]; then
  # ── Flatpak (app bundle is read-only; profile lives under ~/.var/app) ──
  FLATPAK_ID="app.zen_browser.zen"
  FLATPAK_LEGACY_ID="io.github.zen_browser.zen"
  if   flatpak info "$FLATPAK_ID" &>/dev/null || [[ -d "$HOME/.var/app/$FLATPAK_ID" ]]; then
    IS_FLATPAK=true
    PROFILES_INI="$HOME/.var/app/$FLATPAK_ID/zen/profiles.ini"
    info "Flatpak install detected (app ID: $FLATPAK_ID)"
  elif flatpak info "$FLATPAK_LEGACY_ID" &>/dev/null || [[ -d "$HOME/.var/app/$FLATPAK_LEGACY_ID" ]]; then
    IS_FLATPAK=true
    PROFILES_INI="$HOME/.var/app/$FLATPAK_LEGACY_ID/zen/profiles.ini"
    info "Flatpak install detected (legacy app ID: $FLATPAK_LEGACY_ID)"
  else
    # ── Tarball / package install — resources are writable ──
    for _candidate in \
        "$HOME/.local/share/zen-browser" \
        "$HOME/.local/zen-browser" \
        "$HOME/.local/zen" \
        "/opt/zen-browser" \
        "/opt/zen" \
        "/usr/lib/zen-browser" \
        "/usr/lib/zen"; do
      if [[ -f "$_candidate/zen" ]]; then
        ZEN_RESOURCES="$_candidate"
        break
      fi
    done
    # Last resort: search common parent directories
    if [[ -z "$ZEN_RESOURCES" ]]; then
      _bin=$(find "$HOME/.local" /opt /usr/lib /usr/local/lib -maxdepth 4 \
               -name "zen" -type f 2>/dev/null | head -1)
      [[ -n "$_bin" ]] && ZEN_RESOURCES=$(dirname "$_bin")
    fi
    [[ -z "$ZEN_RESOURCES" ]] && error "Could not find Zen installation. Is Zen Browser installed?"
    PROFILES_INI="$HOME/.zen/profiles.ini"
    # AppImage: binary is there but inside a read-only squashfs mount
    if [[ "$ZEN_RESOURCES" == /tmp/.mount_* ]]; then
      warn "AppImage mount detected — app bundle is read-only."
      warn "Extract the AppImage to a writable location first, then re-run this script."
      warn "  ./zen.AppImage --appimage-extract"
      warn "  mv squashfs-root ~/.local/zen-browser"
      exit 1
    fi
  fi

else
  error "Unsupported OS: $OSTYPE. Use install.ps1 on Windows."
fi

[[ "$IS_FLATPAK" == "false" ]] && info "Zen resources: $ZEN_RESOURCES"

# ── 2. Find all profiles ─────────────────────────────────────
# Each installed Zen channel (release/beta/twilight) has its own [Install{hash}]
# section in profiles.ini. Collect all of them so we install to every channel.
#
# Reset the flag on any non-Install section header so we don't accidentally
# pick up the boolean Default=1 that appears in [Profile] sections.

[[ -f "$PROFILES_INI" ]] || error "Could not find profiles.ini at: $PROFILES_INI"
_ini_base=$(dirname "$PROFILES_INI")

_raw_paths=$(awk \
  '/^\[Install/{f=1;next} /^\[/{f=0} f && /^Default=Profiles\//{print substr($0,9)}' \
  "$PROFILES_INI" | tr -d '\r')

# Fallback: [Profile] section marked Default=1
if [[ -z "$_raw_paths" ]]; then
  _raw_paths=$(awk '
    /^\[Profile/ { in_p=1; path=""; is_def=0 }
    in_p && /^Path=/    { path=substr($0,6) }
    in_p && /^Default=1/{ is_def=1 }
    in_p && /^$/        { if (is_def && path!="") { print path; exit } in_p=0 }
    END                 { if (is_def && path!="") print path }
  ' "$PROFILES_INI")
fi

[[ -z "$_raw_paths" ]] && error "Could not determine any profiles from profiles.ini."

# Build PROFILE_DIRS array — avoid `mapfile`/`readarray` (bash 4+) because
# macOS still ships with bash 3.2 by default.
PROFILE_DIRS=()
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  if [[ "$p" = /* ]]; then
    PROFILE_DIRS+=("$p")
  else
    PROFILE_DIRS+=("$_ini_base/$p")
  fi
done <<< "$_raw_paths"

if [[ ${#PROFILE_DIRS[@]} -eq 1 ]]; then
  info "Detected profile: ${PROFILE_DIRS[0]}"
else
  info "Detected ${#PROFILE_DIRS[@]} Zen channel profiles — installing to all:"
  for p in "${PROFILE_DIRS[@]}"; do info "  $p"; done
fi

# ── Mode: --verify ──────────────────────────────────────────
if [[ "$MODE" == "verify" ]]; then
  PASS=0; FAIL=0

  # Program-side fx-autoconfig (skip on Flatpak — can't be installed there)
  if [[ "$IS_FLATPAK" == "false" ]]; then
    if [[ -f "$ZEN_RESOURCES/config.js" ]]; then
      success "✔ fx-autoconfig config.js found"; PASS=$((PASS + 1))
    else
      warn "✘ fx-autoconfig config.js MISSING at $ZEN_RESOURCES"; FAIL=$((FAIL + 1))
    fi
  fi

  for PROFILE_DIR in "${PROFILE_DIRS[@]}"; do
    [[ ! -d "$PROFILE_DIR" ]] && continue
    [[ ${#PROFILE_DIRS[@]} -gt 1 ]] && info "─── $(basename "$PROFILE_DIR") ───"

    if [[ -f "$PROFILE_DIR/chrome/JS/zen-dev-url-detector.uc.js" ]]; then
      success "✔ Userscript installed"; PASS=$((PASS + 1))
    else
      warn "✘ Userscript MISSING at $PROFILE_DIR/chrome/JS/"; FAIL=$((FAIL + 1))
    fi

    if grep -qF "/* zen-dev-url */" "$PROFILE_DIR/chrome/userChrome.css" 2>/dev/null; then
      success "✔ CSS styles present in userChrome.css"; PASS=$((PASS + 1))
    else
      warn "✘ CSS styles MISSING from userChrome.css"; FAIL=$((FAIL + 1))
    fi

    if [[ -f "$PROFILE_DIR/chrome/utils/chrome.manifest" ]]; then
      success "✔ fx-autoconfig profile utils installed"; PASS=$((PASS + 1))
    else
      warn "✘ fx-autoconfig profile utils MISSING"; FAIL=$((FAIL + 1))
    fi

    if grep -q 'toolkit.legacyUserProfileCustomizations.stylesheets.*true' \
         "$PROFILE_DIR/prefs.js" 2>/dev/null; then
      success "✔ Stylesheet pref enabled in prefs.js"; PASS=$((PASS + 1))
    else
      warn "✘ toolkit.legacyUserProfileCustomizations.stylesheets not set (check about:config)"; FAIL=$((FAIL + 1))
    fi
  done

  echo ""
  if [[ $FAIL -eq 0 ]]; then
    success "All checks passed ($PASS/$((PASS + FAIL)))"
  else
    warn "$FAIL of $((PASS + FAIL)) checks failed"
  fi
  exit 0
fi

# ── Mode: --uninstall ───────────────────────────────────────
if [[ "$MODE" == "uninstall" ]]; then
  REMOVED=0
  for PROFILE_DIR in "${PROFILE_DIRS[@]}"; do
    [[ ! -d "$PROFILE_DIR" ]] && continue
    [[ ${#PROFILE_DIRS[@]} -gt 1 ]] && info "─── $(basename "$PROFILE_DIR") ───"

    # Remove userscript
    _js="$PROFILE_DIR/chrome/JS/zen-dev-url-detector.uc.js"
    if [[ -f "$_js" ]]; then
      rm "$_js"
      success "Removed userscript"
    else
      warn "Userscript not found, skipping"
    fi

    # Strip CSS block (from marker to EOF)
    _css="$PROFILE_DIR/chrome/userChrome.css"
    _marker="/* zen-dev-url */"
    if [[ -f "$_css" ]] && grep -qF "$_marker" "$_css"; then
      # Portable: truncate file at the marker line
      _line=$(grep -nF "$_marker" "$_css" | head -1 | cut -d: -f1)
      head -n $((_line - 1)) "$_css" > "$_css.tmp" && mv "$_css.tmp" "$_css"
      success "Removed zen-dev-url styles from userChrome.css"
    else
      warn "No zen-dev-url styles found in userChrome.css, skipping"
    fi

    REMOVED=$((REMOVED + 1))
  done

  echo ""
  info "fx-autoconfig was left in place (other mods may depend on it)."
  info "To remove it: delete config.js + defaults/pref/config-prefs.js from"
  info "  $ZEN_RESOURCES"
  info "and chrome/utils/ from each profile directory."
  echo ""
  success "Uninstall complete ($REMOVED profile(s) cleaned). Restart Zen."
  exit 0
fi

# ── Mode: --dry-run ─────────────────────────────────────────
if [[ "$MODE" == "dry-run" ]]; then
  FX_SRC="$SCRIPT_DIR/vendor/fx-autoconfig"
  echo ""
  info "Dry run — no changes will be made."
  echo ""

  if [[ "$IS_FLATPAK" == "false" ]]; then
    if [[ ! -f "$ZEN_RESOURCES/config.js" ]]; then
      info "  • Would install fx-autoconfig program files to $ZEN_RESOURCES"
    else
      info "  • fx-autoconfig program files already present (skip)"
    fi
  else
    info "  • Flatpak detected — program-side fx-autoconfig cannot be installed"
  fi

  for PROFILE_DIR in "${PROFILE_DIRS[@]}"; do
    [[ ! -d "$PROFILE_DIR" ]] && continue
    info "  Profile: $(basename "$PROFILE_DIR")"
    info "    • Copy fx-autoconfig utils → chrome/utils/"
    info "    • Copy zen-dev-url-detector.uc.js → chrome/JS/"
    if grep -qF "/* zen-dev-url */" "$PROFILE_DIR/chrome/userChrome.css" 2>/dev/null; then
      info "    • CSS already present (skip)"
    else
      info "    • Append zen-dev-url.css → userChrome.css"
    fi
  done

  echo ""
  info "No changes were made. Remove --dry-run to install."
  exit 0
fi

# ── 3. Check / install fx-autoconfig ────────────────────────
# fx-autoconfig is vendored in vendor/fx-autoconfig/ — no network fetch
# or curl/unzip dependency needed. See vendor/fx-autoconfig/README.md.
#
# Program files go into the Zen binary directory (once).
# Utils go into each profile's chrome/utils/ (per-profile loop below).

FX_SRC="$SCRIPT_DIR/vendor/fx-autoconfig"

if [[ ! -d "$FX_SRC/profile/chrome/utils" ]]; then
  error "Vendored fx-autoconfig not found at $FX_SRC — did you clone the repo with its full tree?"
fi

if [[ "$IS_FLATPAK" == "true" ]]; then
  # Flatpak: the app bundle is a read-only squashfs, so we cannot place
  # program-side fx-autoconfig files (config.js, config-prefs.js) inside it.
  # The profile-side utils ARE installable though — they live in the user's
  # writable ~/.var/app directory. Step 4 handles that.
  warn "Flatpak install detected — app bundle is read-only."
  warn "Profile-side fx-autoconfig utils will be installed automatically,"
  warn "but program-side files (config.js) CANNOT be placed into the bundle."
  warn "A final manual step is required — see the summary at the end."
  echo ""
else
  CONFIG_JS="$ZEN_RESOURCES/config.js"
  CONFIG_PREFS="$ZEN_RESOURCES/defaults/pref/config-prefs.js"

  if [[ ! -f "$CONFIG_JS" ]]; then
    # On macOS Ventura+ the OS blocks writes inside /Applications app
    # bundles unless the shell's parent app has been granted App Management
    # permission in System Settings. Even `sudo cp` fails with "Operation
    # not permitted". Detect that case and explain the fix in-line instead
    # of dying with an opaque error.
    _install_fx_files() {
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sudo cp "$FX_SRC/program/config.js" "$CONFIG_JS" \
          && sudo mkdir -p "$ZEN_RESOURCES/defaults/pref" \
          && sudo cp "$FX_SRC/program/defaults/pref/config-prefs.js" "$CONFIG_PREFS"
      else
        cp "$FX_SRC/program/config.js" "$CONFIG_JS" \
          && mkdir -p "$ZEN_RESOURCES/defaults/pref" \
          && cp "$FX_SRC/program/defaults/pref/config-prefs.js" "$CONFIG_PREFS"
      fi
    }

    _err_file=$(mktemp "${TMPDIR:-/tmp}/zen-dev-url-install-err.XXXXXX")
    if ! _install_fx_files 2>"$_err_file"; then
      _err=$(cat "$_err_file" 2>/dev/null)
      rm -f "$_err_file"
      if [[ "$OSTYPE" == "darwin"* && "$_err" == *"Operation not permitted"* ]]; then
        echo ""
        echo -e "${RED}┌───────────────────────────────────────────────────────────┐${NC}"
        echo -e "${RED}│  macOS blocked the write — App Management permission     │${NC}"
        echo -e "${RED}├───────────────────────────────────────────────────────────┤${NC}"
        echo -e "${RED}│                                                           │${NC}"
        echo -e "${RED}│  Even with sudo, macOS Ventura+ will not let a terminal   │${NC}"
        echo -e "${RED}│  modify /Applications/Zen.app unless you grant it App     │${NC}"
        echo -e "${RED}│  Management permission.                                   │${NC}"
        echo -e "${RED}│                                                           │${NC}"
        echo -e "${RED}│  Fix:                                                     │${NC}"
        echo -e "${RED}│  1. Open System Settings → Privacy & Security             │${NC}"
        echo -e "${RED}│     → App Management                                      │${NC}"
        echo -e "${RED}│  2. Toggle ON your terminal app (Terminal / iTerm /       │${NC}"
        echo -e "${RED}│     Ghostty / Warp / etc).                                │${NC}"
        echo -e "${RED}│  3. Fully quit and reopen the terminal.                   │${NC}"
        echo -e "${RED}│  4. Re-run ./install.sh                                   │${NC}"
        echo -e "${RED}│                                                           │${NC}"
        echo -e "${RED}└───────────────────────────────────────────────────────────┘${NC}"
        echo ""
        error "Install aborted — grant App Management permission and retry."
      else
        [[ -n "$_err" ]] && echo "$_err" >&2
        error "Failed to install fx-autoconfig program files to $ZEN_RESOURCES"
      fi
    fi
    success "fx-autoconfig program files installed (from vendored copy)."
  else
    success "fx-autoconfig program files already installed."
  fi
fi

# ── 4. Install to each profile ───────────────────────────────

INSTALLED=0

for PROFILE_DIR in "${PROFILE_DIRS[@]}"; do
  if [[ ! -d "$PROFILE_DIR" ]]; then
    warn "Profile directory not found, skipping: $PROFILE_DIR"
    continue
  fi

  [[ ${#PROFILE_DIRS[@]} -gt 1 ]] && info "─── $(basename "$PROFILE_DIR") ───"

  # fx-autoconfig profile-side utils — always install from vendored copy.
  # Safe on Flatpak because the profile lives in a writable user directory.
  CHROME_UTILS="$PROFILE_DIR/chrome/utils"
  mkdir -p "$CHROME_UTILS"
  cp -r "$FX_SRC/profile/chrome/utils/." "$CHROME_UTILS/"

  # Userscript
  JS_DIR="$PROFILE_DIR/chrome/JS"
  mkdir -p "$JS_DIR"
  cp "$SCRIPT_DIR/zen-dev-url-detector.uc.js" "$JS_DIR/"
  success "Copied userscript to $JS_DIR"

  # CSS — always refresh. If an existing zen-dev-url block is present,
  # strip everything from the marker to EOF and re-append, so re-running
  # install.sh picks up CSS changes (icons, stripe colors, etc). Without
  # this, users who installed once and then `git pull`'d would get JS
  # updates but frozen CSS.
  CHROME_CSS="$PROFILE_DIR/chrome/userChrome.css"
  MARKER="/* zen-dev-url */"
  if grep -qF "$MARKER" "$CHROME_CSS" 2>/dev/null; then
    _line=$(grep -nF "$MARKER" "$CHROME_CSS" | head -1 | cut -d: -f1)
    head -n $((_line - 1)) "$CHROME_CSS" > "$CHROME_CSS.tmp" && mv "$CHROME_CSS.tmp" "$CHROME_CSS"
    info "Stripped existing zen-dev-url styles before re-appending."
  fi
  { echo ""; echo "$MARKER"; cat "$SCRIPT_DIR/zen-dev-url.css"; } >> "$CHROME_CSS"
  success "Appended styles to $CHROME_CSS"

  INSTALLED=$((INSTALLED + 1))
done

[[ $INSTALLED -eq 0 ]] && error "No profiles were successfully installed to."

# ── 5. Remind about about:config (only if not already set) ──
# Check prefs.js in every installed profile. If EVERY profile already has
# the pref set to true, the reminder is unnecessary — skip the yellow box
# and just note it was already enabled. If ANY profile is missing it,
# show the reminder (and, if partial, list which profiles need it).

_pref_missing_count=0
_pref_missing_profiles=()
for PROFILE_DIR in "${PROFILE_DIRS[@]}"; do
  [[ ! -d "$PROFILE_DIR" ]] && continue
  if ! grep -q 'toolkit.legacyUserProfileCustomizations.stylesheets.*true' \
         "$PROFILE_DIR/prefs.js" 2>/dev/null; then
    _pref_missing_count=$((_pref_missing_count + 1))
    _pref_missing_profiles+=("$(basename "$PROFILE_DIR")")
  fi
done

echo ""
if [[ $_pref_missing_count -eq 0 ]]; then
  success "✔ toolkit.legacyUserProfileCustomizations.stylesheets already enabled — no manual step needed."
else
  echo -e "${YELLOW}┌─────────────────────────────────────────────────────┐${NC}"
  echo -e "${YELLOW}│  Almost done — one manual step required in Zen:     │${NC}"
  echo -e "${YELLOW}│                                                     │${NC}"
  echo -e "${YELLOW}│  1. Open Zen and go to: about:config                │${NC}"
  echo -e "${YELLOW}│  2. Search: toolkit.legacyUserProfileCustomizations │${NC}"
  echo -e "${YELLOW}│             .stylesheets                            │${NC}"
  echo -e "${YELLOW}│  3. Set it to: true                                 │${NC}"
  echo -e "${YELLOW}│  4. Restart Zen                                     │${NC}"
  echo -e "${YELLOW}│                                                     │${NC}"
  echo -e "${YELLOW}│  The dev banner will appear on localhost URLs.      │${NC}"
  echo -e "${YELLOW}└─────────────────────────────────────────────────────┘${NC}"
  if [[ ${#PROFILE_DIRS[@]} -gt 1 && $_pref_missing_count -lt ${#PROFILE_DIRS[@]} ]]; then
    warn "Needed in: ${_pref_missing_profiles[*]}"
  fi
fi
echo ""

# ── 6. Report status honestly ───────────────────────────────
# On Flatpak the install is INCOMPLETE — program-side config.js cannot
# be written into the read-only app bundle. Say so loudly instead of
# printing a green "complete!" that leaves users wondering why nothing
# happens after restart.

if [[ "$IS_FLATPAK" == "true" ]]; then
  echo -e "${RED}┌─────────────────────────────────────────────────────────┐${NC}"
  echo -e "${RED}│  ⚠  INSTALL INCOMPLETE — FLATPAK-SPECIFIC STEP REQUIRED │${NC}"
  echo -e "${RED}├─────────────────────────────────────────────────────────┤${NC}"
  echo -e "${RED}│                                                         │${NC}"
  echo -e "${RED}│  fx-autoconfig's profile-side utils were installed,     │${NC}"
  echo -e "${RED}│  BUT the program-side files (config.js, config-prefs.js)│${NC}"
  echo -e "${RED}│  could NOT be written — the Flatpak app bundle is a     │${NC}"
  echo -e "${RED}│  read-only squashfs and no installer can modify it.     │${NC}"
  echo -e "${RED}│                                                         │${NC}"
  echo -e "${RED}│  Without those files, the mod will NOT LOAD.            │${NC}"
  echo -e "${RED}│                                                         │${NC}"
  echo -e "${RED}│  Recommended workaround: switch to the tarball install  │${NC}"
  echo -e "${RED}│  of Zen. See the README > Linux (tarball) section.      │${NC}"
  echo -e "${RED}│                                                         │${NC}"
  echo -e "${RED}└─────────────────────────────────────────────────────────┘${NC}"
  echo ""
  warn "Partial install: $INSTALLED profile(s) received userscript + CSS + profile utils."
  warn "Program-side fx-autoconfig MUST be handled separately before the mod will work."
  exit 0   # not a script error — user action needed, not a failure
fi

success "Installation complete! ($INSTALLED profile(s) updated)"
