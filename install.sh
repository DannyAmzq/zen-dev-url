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

SCRIPT_DIR="$(dirname "$0")"

# ── 1. Detect OS and Zen paths ───────────────────────────────

IS_FLATPAK=false
ZEN_RESOURCES=""

if [[ "$OSTYPE" == "darwin"* ]]; then
  ZEN_APP="/Applications/Zen.app"
  ZEN_RESOURCES="$ZEN_APP/Contents/Resources"
  PROFILES_INI="$HOME/Library/Application Support/Zen/profiles.ini"

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

mapfile -t PROFILE_DIRS < <(while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  [[ "$p" = /* ]] && echo "$p" || echo "$_ini_base/$p"
done <<< "$_raw_paths")

if [[ ${#PROFILE_DIRS[@]} -eq 1 ]]; then
  info "Detected profile: ${PROFILE_DIRS[0]}"
else
  info "Detected ${#PROFILE_DIRS[@]} Zen channel profiles — installing to all:"
  for p in "${PROFILE_DIRS[@]}"; do info "  $p"; done
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
  warn "Flatpak: app bundle is read-only — skipping fx-autoconfig program files."
  warn "You must install fx-autoconfig manually into your profile's chrome/utils/ folder."
  warn "See: https://github.com/MrOtherGuy/fx-autoconfig#for-flatpak-installs"
  warn "(The userscript and CSS will still be copied so you are ready once fx-autoconfig is set up.)"
  echo ""
else
  CONFIG_JS="$ZEN_RESOURCES/config.js"
  CONFIG_PREFS="$ZEN_RESOURCES/defaults/pref/config-prefs.js"

  if [[ ! -f "$CONFIG_JS" ]]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sudo cp "$FX_SRC/program/config.js" "$CONFIG_JS"
      sudo mkdir -p "$ZEN_RESOURCES/defaults/pref"
      sudo cp "$FX_SRC/program/defaults/pref/config-prefs.js" "$CONFIG_PREFS"
    else
      cp "$FX_SRC/program/config.js" "$CONFIG_JS"
      mkdir -p "$ZEN_RESOURCES/defaults/pref"
      cp "$FX_SRC/program/defaults/pref/config-prefs.js" "$CONFIG_PREFS"
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

  # fx-autoconfig utils (per-profile, only if we downloaded source)
  if [[ "$IS_FLATPAK" == "false" && -n "$FX_SRC" ]]; then
    CHROME_UTILS="$PROFILE_DIR/chrome/utils"
    mkdir -p "$CHROME_UTILS"
    cp -r "$FX_SRC/profile/chrome/utils/." "$CHROME_UTILS/"
  fi

  # Userscript
  JS_DIR="$PROFILE_DIR/chrome/JS"
  mkdir -p "$JS_DIR"
  cp "$SCRIPT_DIR/zen-dev-url-detector.uc.js" "$JS_DIR/"
  success "Copied userscript to $JS_DIR"

  # CSS (idempotent)
  CHROME_CSS="$PROFILE_DIR/chrome/userChrome.css"
  MARKER="/* zen-dev-url */"
  if grep -qF "$MARKER" "$CHROME_CSS" 2>/dev/null; then
    warn "zen-dev-url styles already present in userChrome.css, skipping append."
  else
    { echo ""; echo "$MARKER"; cat "$SCRIPT_DIR/zen-dev-url.css"; } >> "$CHROME_CSS"
    success "Appended styles to $CHROME_CSS"
  fi

  INSTALLED=$((INSTALLED + 1))
done

[[ $INSTALLED -eq 0 ]] && error "No profiles were successfully installed to."

# ── 5. Remind about about:config ────────────────────────────

echo ""
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
echo ""
success "Installation complete! ($INSTALLED profile(s) updated)"
