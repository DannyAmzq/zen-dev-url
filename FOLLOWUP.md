# Follow-ups for next session

This file captures open threads across sessions so things that need
picking up later don't get lost.

## Open

### Feature work
- [ ] **URL field opacity on Windows** (loose thread from #20). Not
  reproduced recently, re-check after Windows test round.
- [ ] **Stale PRs to close:** #7 (Copilot audit PR, superseded by #19),
  #16 (duplicate targeting main), #17 and #18 (cloudyun888 — obsolete).

### Long-term research
- [ ] **#21 — Zen Mods JS support.** File a feature request on
  `zen-browser/desktop` proposing a `script` field in the Zen Mods format.
  Research confirmed fx-autoconfig is unavoidable — Zen Mods are CSS-only,
  WebExtensions can't access chrome APIs, no built-in userChrome.js loader.

## Completed (latest first)

### 2026-04-18
- **#20 — Dev banner URL field.** Final approach landed in v20260418-4+.
  The banner field is a real `<input>` (cursor + text selection live
  there); each keystroke syncs `field.value → gURLBar.value` and calls
  `gURLBar.startQuery()` to drive the native Zen suggestions popup.
  ArrowDown/Up + Tab/Shift+Tab cycle suggestions via
  `gURLBar.view.selectBy()`, ArrowRight accepts autofill, Enter with a
  selected suggestion routes through `gURLBar.handleCommand()`, plain
  Enter falls back to `gBrowser.fixupAndLoadURIString()`. 30/30 self-tests
  pass. Versions v20260417-1 (standalone) and v20260416-7 (relocate real
  urlbar) were dead ends.
- **install.sh bash 3.2 compat.** Replaced `mapfile` with while-read loop
  so fresh macOS (bash 3.2.57) no longer dies with `mapfile: command not
  found`. Commit `99fa55e`.
- **install.sh macOS App Management detection.** Added an explicit error
  box explaining how to grant `Terminal → System Settings → Privacy &
  Security → App Management` when `cp` into `/Applications/Zen.app/...`
  fails with `Operation not permitted`. Commit in v20260418-4.
- **install.sh about:config reminder is conditional.** Skips the yellow
  "one manual step required" box when every profile already has
  `toolkit.legacyUserProfileCustomizations.stylesheets=true`. Commit
  `eb6cd66`.
- **install.sh CSS refresh bug fix.** Previously `grep -qF MARKER && skip`
  meant any `git pull && ./install.sh` after first install updated the JS
  but left userChrome.css frozen. Now strips from marker to EOF and
  re-appends every run. Commit `3eca0b2`.
- **Banner polish for release.** Toasts dropped ASCII icons in favour of
  `!` suffix; copy/screenshot toasts removed (Zen's own copy toast
  covers the former). Banner stripe base lightened from
  `rgba(30,12,5,0.92)` to `rgba(50,22,10,0.88)` with stripe opacity
  `0.22 → 0.30`. Settings panel Actions rows now have 14px mask-image
  icons (new-tab / privateBrowsing / styleeditor / edit-copy). Self-tests
  bumped to 30 assertions and moved after `init()` so DOM checks see the
  banner.

### 2026-04-16
- Merged PR #19 into `dev` — all install-UX fixes.
- **#11 + #14** — Added CLI flags to both installers: `--help`, `--uninstall`,
  `--verify`, `--dry-run`. Commit `e02a06d`.
- **#12** — Created `install.bat` wrapper for double-click Windows install.
  Commit `e02a06d`.
- **#8** — Closed as not planned (vendoring eliminated curl/unzip deps).
- **#13 long-term research** — All alternatives evaluated (Zen Mods, WebExtension,
  built-in userChrome.js, enterprise policies). All dead ends. fx-autoconfig
  unavoidable for current feature set. Filed issue #21.
- Fixed WSL write-check bug (too eager when config.js already present).
  Commit `2c8d322`.
- Danny created GitHub Projects board.
- Added authorship policy to CLAUDE.md.

### 2026-04-15
- Close-out: deleted `create-audit-issues.sh`, linked issues #8–#14 from
  `INSTALL-AUDIT.md`. Commit `bd92c94`.
- Created issues #8–#14 from the Copilot install-UX audit.
- Created tracking issue #15 with #8–#14 as sub-issues.
- **#13 short-term** — vendored fx-autoconfig under `vendor/fx-autoconfig/`
  pinned to upstream `54f88294`. Both installers now work offline. Commit
  `307a47e`.
- **#10** — Flatpak install now auto-installs profile-side utils from the
  vendored copy and prints an honest "INSTALL INCOMPLETE" box instead of
  falsely claiming success. Commit `6ed2d57`.
- **#9** — WSL detection added to `install.sh`. WSL users can now run
  `bash install.sh` instead of copy-pasting a 10-line snippet. Commit
  `c4fb8ed`.

### Verified
- [x] **WSL** — `bash install.sh` end-to-end, 2 channels (beta + twilight).
- [x] **WSL --verify** — 8/9 passed (twilight missing about:config pref, expected).
- [x] **Flatpak (Docker mock)** — red INSTALL INCOMPLETE box, exit 0.
- [x] **Tarball (Docker mock)** — green "Installation complete!"
- [ ] **macOS** — untested (low risk, only change is vendored source).
- [ ] **Windows PowerShell** — untested (low risk, same change).
