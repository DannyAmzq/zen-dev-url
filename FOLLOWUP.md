# Follow-ups for next session

This file captures open threads across sessions. Claude Code has no cross-session
memory, so things that need picking up later get written here.

## Open

### Feature work
- [ ] **#20 — Banner URL field: real input with gURLBar bridge.** v20260418-4
  landed the core: a real `<input>` in the dev banner with cursor, selection,
  and typing all local. Every keystroke syncs to `gURLBar.value` +
  `gURLBar.startQuery()` so the native suggestions popup opens from gURLBar.
  Enter navigates via `fixupAndLoadURIString`, Escape/blur restores display.
  **Next:** forward ArrowDown/ArrowUp/Tab to `gURLBar.view.selectBy()` for
  suggestion navigation, and ArrowRight to accept autofill. Also fix URL
  field opacity on Windows. See issue #20.
- [ ] **Stale PRs to close:** #7 (Copilot audit PR, superseded by #19),
  #16 (duplicate targeting main), #17 and #18 (cloudyun888 — obsolete).

### Long-term research
- [ ] **#21 — Zen Mods JS support.** File a feature request on
  `zen-browser/desktop` proposing a `script` field in the Zen Mods format.
  Research confirmed fx-autoconfig is unavoidable — Zen Mods are CSS-only,
  WebExtensions can't access chrome APIs, no built-in userChrome.js loader.

## Completed (latest first)

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
