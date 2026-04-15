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

# ── 0. Check required commands ─────────────────────────────────
for cmd in curl unzip; do
  if ! command -v "$cmd" &> /dev/null; then
    error "Required command '$cmd' not found. Please install $cmd and try again."
  fi
done

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

if [[ "$IS_FLATPAK" == "false" ]]; then
  info "Zen resources: $ZEN_RESOURCES"
fi

# ── 2. Find the default profile ─────────────────────────────

find_default_profile() {
  local ini="$1"
  [[ -f "$ini" ]] || error "Could not find profiles.ini at: $ini"

  local base_dir rel_path
  base_dir=$(dirname "$ini")

  # Preferred: [Install{hash}] section — tracks the profile Zen actually launched last
  rel_path=$(awk '/^\[Install/{inst=1} inst && /^Default=/{print substr($0,9); exit}' "$ini")

  # Fallback: profile section marked Default=1
  if [[ -z "$rel_path" ]]; then
    rel_path=$(awk '
      /^\[Profile/ { in_profile=1; path=""; is_default=0 }
      in_profile && /^Path=/    { path=substr($0,6) }
      in_profile && /^Default=1/{ is_default=1 }
      in_profile && /^$/        { if (is_default && path!="") { print path; exit } in_profile=0 }
      END                       { if (is_default && path!="") print path }
    ' "$ini")
  fi

  [[ -z "$rel_path" ]] && error "Could not determine default profile from profiles.ini."

  if [[ "$rel_path" = /* ]]; then
    echo "$rel_path"
  else
    echo "$base_dir/$rel_path"
  fi
}

PROFILE_DIR=$(find_default_profile "$PROFILES_INI")
info "Detected profile: $PROFILE_DIR"
[[ -d "$PROFILE_DIR" ]] || error "Profile directory not found: $PROFILE_DIR"
success "Found profile: $PROFILE_DIR"

# ── 3. Check / install fx-autoconfig ────────────────────────

if [[ "$IS_FLATPAK" == "true" ]]; then
  warn "Flatpak: app bundle is read-only — skipping fx-autoconfig program files."
  warn "You must install fx-autoconfig manually into your profile's chrome/utils/ folder."
  warn "See: https://github.com/MrOtherGuy/fx-autoconfig#for-flatpak-installs"
  warn "(The userscript and CSS will still be copied so you are ready once fx-autoconfig is set up.)"
  echo ""
else
  CONFIG_JS="$ZEN_RESOURCES/config.js"
  CONFIG_PREFS="$ZEN_RESOURCES/defaults/pref/config-prefs.js"

  if [[ -f "$CONFIG_JS" ]]; then
    success "fx-autoconfig already installed, skipping."
  else
    info "Installing fx-autoconfig..."

    TMP_DIR=$(mktemp -d)
    trap 'rm -rf "$TMP_DIR"' EXIT

    curl -fsSL https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip \
      -o "$TMP_DIR/fx-autoconfig.zip"
    unzip -q "$TMP_DIR/fx-autoconfig.zip" -d "$TMP_DIR"

    if [[ "$OSTYPE" == "darwin"* ]]; then
      sudo cp "$TMP_DIR/fx-autoconfig-master/program/config.js" "$CONFIG_JS"
      sudo mkdir -p "$ZEN_RESOURCES/defaults/pref"
      sudo cp "$TMP_DIR/fx-autoconfig-master/program/defaults/pref/config-prefs.js" "$CONFIG_PREFS"
    else
      cp "$TMP_DIR/fx-autoconfig-master/program/config.js" "$CONFIG_JS"
      mkdir -p "$ZEN_RESOURCES/defaults/pref"
      cp "$TMP_DIR/fx-autoconfig-master/program/defaults/pref/config-prefs.js" "$CONFIG_PREFS"
    fi

    CHROME_UTILS="$PROFILE_DIR/chrome/utils"
    mkdir -p "$CHROME_UTILS"
    cp -r "$TMP_DIR/fx-autoconfig-master/profile/chrome/utils/." "$CHROME_UTILS/"
    success "fx-autoconfig installed."
  fi
fi

# ── 4. Copy userscript ──────────────────────────────────────

JS_DIR="$PROFILE_DIR/chrome/JS"
mkdir -p "$JS_DIR"
cp "$(dirname "$0")/zen-dev-url-detector.uc.js" "$JS_DIR/"
success "Copied userscript to $JS_DIR"

# ── 5. Append CSS (idempotent) ──────────────────────────────

CHROME_CSS="$PROFILE_DIR/chrome/userChrome.css"
MARKER="/* zen-dev-url */"

if grep -qF "$MARKER" "$CHROME_CSS" 2>/dev/null; then
  warn "zen-dev-url styles already present in userChrome.css, skipping append."
else
  {
    echo ""
    echo "$MARKER"
    cat "$(dirname "$0")/zen-dev-url.css"
  } >> "$CHROME_CSS"
  success "Appended styles to $CHROME_CSS"
fi

# ── 6. Remind about about:config ────────────────────────────

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
success "Installation complete!"
