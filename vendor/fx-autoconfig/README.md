# Vendored fx-autoconfig

This directory contains a pinned copy of [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig)
by MrOtherGuy, licensed under the Mozilla Public License 2.0 (see `LICENSE`).

## Why vendored?

The installers (`install.sh`, `install.ps1`) previously fetched fx-autoconfig
from GitHub on every first install. Vendoring eliminates:

- The network dependency (installs work offline, installs don't break when
  GitHub is down or rate-limits)
- The `curl` + `unzip` (or `Invoke-WebRequest` + `Expand-Archive`) requirement
  on minimal systems
- Version drift — every zen-dev-url release pins exactly one fx-autoconfig
  snapshot that has been tested together

See issues #8 and #13 for context.

## Pin

**Upstream commit:** [`54f88294ea70f1d13ded482351da068d5f21c004`](https://github.com/MrOtherGuy/fx-autoconfig/commit/54f88294ea70f1d13ded482351da068d5f21c004)
(2026-04-09)

## Layout

Mirrors the upstream tree (only the files the installer needs):

```
vendor/fx-autoconfig/
├── LICENSE                                    (MPL 2.0, upstream)
├── program/
│   ├── config.js                              → $ZEN_RESOURCES/config.js
│   └── defaults/pref/config-prefs.js          → $ZEN_RESOURCES/defaults/pref/config-prefs.js
└── profile/chrome/utils/                      → $PROFILE/chrome/utils/
    ├── boot.sys.mjs
    ├── chrome.manifest
    ├── fs.sys.mjs
    ├── module_loader.mjs
    ├── uc_api.sys.mjs
    └── utils.sys.mjs
```

## Updating the pin

Run from the repo root:

```bash
tmp=$(mktemp -d)
curl -fsSL https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip -o "$tmp/fx.zip"
unzip -q "$tmp/fx.zip" -d "$tmp"
src="$tmp/fx-autoconfig-master"
cp "$src/program/config.js"                          vendor/fx-autoconfig/program/config.js
cp "$src/program/defaults/pref/config-prefs.js"      vendor/fx-autoconfig/program/defaults/pref/config-prefs.js
cp -r "$src/profile/chrome/utils/."                  vendor/fx-autoconfig/profile/chrome/utils/
cp "$src/LICENSE"                                    vendor/fx-autoconfig/LICENSE
rm -rf "$tmp"
# Then update the "Upstream commit" SHA in this README to:
curl -fsSL https://api.github.com/repos/MrOtherGuy/fx-autoconfig/commits/master | grep '"sha"' | head -1
```

Always test on at least one platform (macOS, Linux, Windows) after updating.
