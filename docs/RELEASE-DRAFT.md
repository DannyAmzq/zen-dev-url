# Beta release draft

Prepared for [DannyAmzq/zen-dev-url](https://github.com/DannyAmzq/zen-dev-url), branch `beta/1.2.0-beta.1`, targeting `dev`. The existing `main` and `dev` trees matched at the baseline used for this update. This document is a draft, not a publication record.

## Release preparation

- [x] Preserve the public baseline's URL suggestions, viewport, developer settings, ports, and host-pattern behavior.
- [x] Record Windows 11 / Zen 1.22.1b runtime and isolated installer checks.
- [x] Complete restart and removal verification and record the results in BETA-VALIDATION.md.
- [x] Review the current screenshot at `docs/media/beta-toolbar.png`.
- [x] Verify archive contents and SHA-256 checksums with an independent ZIP reader.
- [ ] Attach the verified versioned archive and checksum to a `v1.2.0-beta.1` prerelease.
- [x] Confirm the repository's vulnerability-reporting channel and update SECURITY.md (GitHub private reporting is disabled).
- [ ] Use the real published prerelease link in outreach after publication.

Retain vendored fx-autoconfig's license. Its MPL-2.0 license does not assign a license to devbar itself. Sine remains unverified and is not advertised as an installation route.

## Title

devbar 1.2.0-beta.1 — remembered site preferences

## Body draft

This beta updates devbar, the Arc-inspired developer toolbar for Zen, with remembered site preferences. It keeps native URL suggestions, the viewport readout, developer actions, and existing detection settings.

For HTTP(S) sites, `Alt+Shift+D` now remembers a choice for that origin across restarts. Settings provides Automatic / Always on / Always off. Different schemes and non-default ports keep separate choices. `Alt+Shift+O` opens settings even when the toolbar is hidden or disabled.

The update improves toolbar layout and cleanup, validates custom-port and host-pattern input, and adds confirmation before clearing site data. Installers support selecting one profile and preserve unrelated CSS using bounded blocks, backups, and conservative legacy-block migration.

**Validated environment:** Windows 11, Zen 1.22.1b, a clean test profile, and the bundled fx-autoconfig loader pinned to `54f8829`.

Validation includes 12 runtime tests, 19 CSS-preservation assertions for each installer implementation, isolated installer CLI checks, and 24 live-browser checks. Live checks cover origin rules, settings/master/detection behavior, URL Enter/Escape and native suggestions, tab switching, console/network tools, window resizing, multiple-window settings and closure, split-pane focus/viewport behavior, and browser fullscreen. Restart persistence and clean-profile install/removal also passed. See the bundled BETA-VALIDATION.md for the detailed record.

**Limits:** macOS and Linux live-browser behavior, Sine, other Zen versions, page/video fullscreen, and interactions with other UI mods remain untested. No failure was observed in the completed current-environment checks; that is not a claim of universal compatibility.

Use the archive attached to this prerelease and its bundled installation/removal guide. The current source and feedback channel are in [DannyAmzq/zen-dev-url](https://github.com/DannyAmzq/zen-dev-url).

This runs privileged userChrome JavaScript through fx-autoconfig, separate from the Zen Mods store. Private-window site choices also persist in profile preferences. Cache, mixed-content, and JavaScript settings retain their global browser effects when the bar is hidden or removed.

If you already develop in Zen, try localhost, enable one staging origin, restart, and check that it remembers your choice. Report issues in this repository with your Zen version and reproduction steps; remove private URLs and tokens.
