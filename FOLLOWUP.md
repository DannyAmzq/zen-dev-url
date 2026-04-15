# Follow-ups for next session

This file captures open threads across sessions. Claude Code has no cross-session
memory, so things that need picking up later get written here.

## Open

### Manual — for Danny
- [ ] **Create a GitHub Projects board** for the install-UX audit work.
  Projects can't be created via the MCP toolkit, so this has to be done
  through the web UI at `github.com/DannyAmzq/zen-dev-url/projects`. Drag
  in issues #8–#14 once created. Tracking issue #15 already groups them
  via sub-issues as an interim measure.

### Testing needed before merging `claude/copilot-installation-issues-ybaYQ`

The three high-severity install-UX fixes landed on the branch but were
not verifiable from Claude's sandbox. Before merging into `dev`:

- [ ] **macOS** — `bash install.sh` still completes cleanly, banner appears.
- [ ] **Linux tarball** — same.
- [ ] **Linux Flatpak** — new red `⚠ INSTALL INCOMPLETE` box prints instead
  of the old green "complete!". Profile utils end up in
  `~/.var/app/app.zen_browser.zen/zen/<profile>/chrome/utils/`. Exit code 0.
- [ ] **Windows WSL** — `bash install.sh` now works end-to-end without the
  old 10-line README snippet. Tests the new WSL detection block at
  `install.sh:39-74`.
- [ ] **Windows PowerShell** — `install.ps1` still works with the vendored
  fx-autoconfig (no more `Invoke-WebRequest`).

## Completed (latest first)

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

## Deferred

- **#13 long-term** — Investigate packaging as a WebExtension (`.xpi`) or
  using Zen's native mod system to eliminate fx-autoconfig entirely. Large
  scope, likely multi-day research + rewrite.
- Remaining medium-severity issues: #8 (curl/unzip check — largely obviated
  by vendoring but worth keeping as a sanity check), #11 (--uninstall /
  --verify flags), #12 (install.bat wrapper), #14 (--help / --dry-run).
