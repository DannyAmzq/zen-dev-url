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

# ── 1. Detect OS and Zen paths ───────────────────────────────

if [[ "$OSTYPE" == "darwin"* ]]; then
  ZEN_APP="/Applications/Zen.app"
  ZEN_RESOURCES="$ZEN_APP/Contents/Resources"
  ZEN_PROFILES_DIR="$HOME/Library/Application Support/Zen/Profiles"
  PROFILES_INI="$HOME/Library/Application Support/Zen/profiles.ini"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  _zen_bin=$(find /opt /usr/lib /usr/local/lib -name "zen" -type f 2>/dev/null | head -1)
  [[ -z "$_zen_bin" ]] && error "Could not find Zen installation. Is Zen Browser installed?"
  ZEN_RESOURCES=$(dirname "$_zen_bin")
  ZEN_PROFILES_DIR="$HOME/.zen/Profiles"
  PROFILES_INI="$HOME/.zen/profiles.ini"
else
  error "Unsupported OS: $OSTYPE. Use install.ps1 on Windows."
fi

info "Zen resources: $ZEN_RESOURCES"

# ── 2. Find the default profile ─────────────────────────────

find_default_profile() {
  local ini="$1"
  local profiles_dir="$2"
  [[ -f "$ini" ]] || error "Could not find profiles.ini at: $ini"

  # Parse the profile marked Default=1
  local rel_path
  rel_path=$(awk '
    /^\[Profile/ { in_profile=1; path=""; is_default=0; is_relative=1 }
    in_profile && /^Path=/ { path=substr($0,6) }
    in_profile && /^Default=1/ { is_default=1 }
    in_profile && /^IsRelative=0/ { is_relative=0 }
    in_profile && /^$/ {
      if (is_default && path != "") {
        print (is_relative ? "Profiles/" : "") path
        exit
      }
      in_profile=0
    }
    END {
      if (is_default && path != "") print (is_relative ? "Profiles/" : "") path
    }
  ' "$ini")

  [[ -z "$rel_path" ]] && error "Could not determine default profile from profiles.ini."

  # profiles.ini paths are relative to the parent of the Profiles dir
  local base_dir
  base_dir=$(dirname "$profiles_dir")
  echo "$base_dir/$rel_path"
}

PROFILE_DIR=$(find_default_profile "$PROFILES_INI" "$ZEN_PROFILES_DIR")
[[ -d "$PROFILE_DIR" ]] || error "Profile directory not found: $PROFILE_DIR"
success "Found profile: $PROFILE_DIR"

# ── 3. Check / install fx-autoconfig ────────────────────────

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
