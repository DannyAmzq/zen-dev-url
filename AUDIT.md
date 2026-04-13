# zen-dev-url — Audit Report

**Date:** 2026-04-13
**Auditor:** Claude (Sonnet 4.6)
**Scope:** full repository — userscript, CSS, installers, docs
**Target branch:** `dev`
**Version at audit start:** `v20260413-1`
**Version after fixes:** `v20260413-2`

This was a systematic review of every file with a bug/security/correctness lens.
Fixes applied directly are listed in §1. Items left for judgment (features,
stylistic calls, things that need hardware to verify) are listed in §2 with
GitHub issues opened where appropriate.

---

## 1. Fixes applied in this audit

### 1.1 Critical bugs

| # | Where | Problem | Fix |
|---|---|---|---|
| **B1** | `zen-dev-url-detector.uc.js:33` | `_devHosts` contained `'[::1]'` with brackets, but `nsIURI.host` returns IPv6 addresses **without** brackets. So every `http://[::1]:…/` URL silently failed host-match and never triggered dev mode unless another rule caught it. | Changed `'[::1]'` → `'::1'`. Added a self-test to lock the contract. |
| **B2** | `zen-dev-url-detector.uc.js:74-78` | `Alt+Shift+D` called `preventDefault()` + `stopImmediatePropagation()` *before* checking `this._enabled`, so a disabled mod still swallowed the user's keystroke and prevented any other handler from seeing it. | Moved the `if (!this._enabled) return` check *before* the event-eating calls. |
| **B3** | `README.md` (install + update snippets) | Both WSL snippets used `awk '/^\[Install/{f=1} f && /^Path=/…'`. `[Install{hash}]` sections contain `Default=` not `Path=`, so the awk never matched inside the Install block and would later hit `Path=` inside a `[Profile]` section — potentially returning the *wrong* profile for multi-channel users (beta + twilight). | Replaced both snippets with the same `while read … done < <(awk …)` loop that `.claude/CLAUDE.md` and both installers already use. Iterates every detected channel. |
| **B4** | `README.md` (Docker mock) | The mock `profiles.ini` wrote `Default=default`, but the real installer's awk filters for `Default=Profiles/…` to exclude the boolean `Default=1` that appears in `[Profile]` sections. So the Docker test command wouldn't exercise the same code path as a real install. | Changed mock to `Default=Profiles/default` and moved the profile dir under `Profiles/default/` to match. |
| **B5** | `README.md` (about:config prefs table) | Listed three prefs that don't exist: `zen.urlbar.dev-indicator.disable-cache`, `.allow-mixed-content`, `.disable-js`. The settings panel actually toggles the *Firefox-native* prefs: `devtools.cache.disabled`, `security.mixed_content.block_active_content` (inverted), and `javascript.enabled`. Also missing `include-file-urls`, and `devtools-panel` should be `auto-open-panel`. | Split the table into two: "zen-dev-url prefs" (the ones the mod owns) and "Firefox prefs" (the ones the settings panel merely toggles). |
| **B6** | `zen-dev-url.css:221-228` | `#zen-dev-url-copy-link::before` and `[data-copied]::before` rules were duplicated verbatim. Harmless at runtime but confusing. | Removed the duplicate block. |

### 1.2 Defensive / quality

| # | Where | Problem | Fix |
|---|---|---|---|
| **Q1** | `zen-dev-url-detector.uc.js:392-395` | Custom host pattern glob → regex compile had no `try/catch`. One bad pattern in the user's comma-separated list would throw and abort matching for every pattern after it, breaking dev detection on any host. | Wrapped each pattern's `new RegExp(…)` + `.test(…)` in `try/catch` so a bad pattern is silently skipped. |
| **Q2** | `install.ps1` | `$TmpDir` under `%TEMP%\fx-autoconfig-install` was created and then left behind forever. Subsequent runs re-used it — if `Expand-Archive -Force` missed any stale file, stale fx-autoconfig bits could leak in. | Remove `$TmpDir` before extracting (clean slate) and again at the end (don't leave a ~500 KB dir behind). `install.sh` already did this via `trap`. |

### 1.3 Docs hygiene

- Bumped the README "Verifying the install" banner from `v20260412-24` → `v20260413-2`.
- Updated self-test count 15/15 → 16/16 to match the new IPv6 test.

---

## 2. Findings NOT fixed — for review

### 2.1 Judgment calls — filed as GitHub issues

These are real improvements but involve tradeoffs; see the linked issues for
discussion.

- **#2 — Debounce the resize handler** — every pixel of a window resize fires `_repositionBanner()` + `_updateViewport()`. Browsers throttle resize somewhat, but a single-`requestAnimationFrame` wrap would cut down work during a drag.
- **#3 — Gate self-tests behind a pref (default off in prod)** — the IIFE at `zen-dev-url-detector.uc.js:847` runs on every window open and logs to the user's console. Useful during dev, noise in prod.
- **#4 — Clarify expected behaviour of Alt+Shift+D force-toggle across navigations** — `_forcedBrowsers` / `_excludedBrowsers` persist for the lifetime of the `<browser>` element, so forcing dev-on survives a same-tab navigation. Documentation call more than a code bug.
- **#5 — Add a single top-level error handler** — everything is individually try/caught today, but a window-level `error` listener tagged `[zen-dev-url] FATAL:` would make bug reports easier to triage.
- **#6 — Cache `auto-open-devtools` pref instead of reading on every `_update()`** — pref reads are cheap but we already observe the pref, so caching is the cleaner code.

### 2.2 Things I noticed but left alone

Each is small enough that touching them would cost more review time than leave them alone, but worth listing in case you disagree:

- **`install.sh`: macOS resources path is hardcoded to `/Applications/Zen.app`** — if Zen is installed to `~/Applications/Zen.app` or elsewhere, the script fails. Fixable with a `mdfind` / loop but adds complexity for a rare case.
- **`install.sh`: Mac profile path uses `Library/Application Support/Zen/` (uppercase), but `.claude/CLAUDE.md` Mac one-liner uses `Library/Application Support/zen/` (lowercase)** — on case-insensitive APFS, both work; on case-sensitive, only one does. I couldn't verify which Zen actually creates without Mac hardware. Low priority; fixable by having the shell try both.
- **`install.sh`: the `find` fallback uses a hard-coded set of paths** (`$HOME/.local`, `/opt`, `/usr/lib`, `/usr/local/lib`) — Snap, distro-packaged, or Nix installs won't be found. Fine for now.
- **`install.ps1`: only finds one `zen.exe`** — if a user has two Zen binaries in different directories (release in `%LOCALAPPDATA%\zen` + beta in `%PROGRAMFILES%\Zen Beta`), only the first gets fx-autoconfig program files. Profile-side steps still run for all channels, so the userscript + CSS land correctly, but auto-config may not be fully set up for the second binary. Edge case; worth a note but not a fix.
- **`_showToast()` detects on/off purely from the message text** — `msg.includes('on')` matches "off" too (since "off" contains "o"+"f"+"f", not "on", so it's actually fine — but relies on a string search that would break if we ever localized). Minor.
- **Settings panel's outside-click handler has a Firefox-specific special case for `<menuitem>` targets** — fragile if Zen ever renders `<select>` popups with a different element. A regression-worthy comment is already there, but worth re-testing after any Zen toolkit update.
- **`_settingsPanel.style.display === 'block'`** is the source of truth for "is panel open?" — relying on inline style. An external stylesheet change could shadow this. A dedicated `this._settingsOpen` flag would be more robust.
- **`setTimeout` on `copyBtn`/`clearSiteData` data-* flags isn't cleared on rapid clicks** — the second click's timeout races with the first. Visual glitch only.

### 2.3 Security review: clean

I walked the userscript specifically looking for:

- **`eval` / `Function` / `setTimeout(string, …)`** — none present.
- **`innerHTML` with user input** — only set to `''` to clear, then `appendChild(textContent=…)`. Safe.
- **Regex built from user input** (custom patterns) — special chars escaped before `*/?` substitution, no injection surface. Q1 adds a try/catch so one bad pattern can't crash.
- **Arbitrary URL navigation from the banner field** (`gURLBar.value = val; gURLBar.handleCommand()`) — this goes through the normal URL bar pipeline, which already applies Firefox/Zen's URL-fixup + security checks. A `javascript:` paste would be handled by the URL bar the same way a manual paste would — Firefox blocks these in most contexts.
- **Script privileges** — this runs in the chrome context (because fx-autoconfig). That's appropriate for a mod that toggles attributes on the root element and opens DevTools panels, but worth flagging: *never* take page-originated data and act on it chromeside. Currently it doesn't.

### 2.4 Memory / listener leaks

All event listeners are added but never removed. For a userscript that lives
for the entire window lifetime, this is fine — Zen cleans up the window on
close. The pattern I'd flag if this were long-lived server code:

- `window.addEventListener('keydown', …)` (Alt+Shift+D)
- `window.addEventListener('resize', …)`
- `gBrowser.addTabsProgressListener(…)`
- `Services.prefs.addObserver(…)` × 6

None of these have cleanup paths. If fx-autoconfig ever adds hot-reload, they'd
leak on every reload. Until then: not a real problem.

---

## 3. How to validate

After restarting Zen you should see:

```
[zen-dev-url] v20260413-2 loaded        ← bumped from -1
[zen-dev-url] self-tests: 16/16 passed  ← new IPv6 test
```

Sanity-check the IPv6 fix by visiting `http://[::1]:<port>/` — the banner
should appear. (The old version would silently skip it.)

Sanity-check the Alt+Shift+D fix by turning off
`zen.urlbar.show-dev-indicator` in `about:config`, then pressing Alt+Shift+D
anywhere — it should no longer be swallowed (you can confirm by binding
Alt+Shift+D to anything else and seeing that binding fire).

---

## 4. Summary

- **6 bugs fixed** (IPv6 match, disabled-shortcut passthrough, 3 README docs bugs, 1 CSS dup).
- **2 defensive improvements** (regex try/catch, PS1 tmpdir cleanup).
- **5 feature/cleanup suggestions** filed as GitHub issues for later.
- **0 security issues found.**
- Memory/listener story is OK for the userscript lifecycle.

The mod is in good shape for a `v1.1.1` patch release on top of `v1.1.0`. No
behavior changes that would need a minor version bump — just the IPv6 host
now actually works, and the shortcut is politer when disabled.
