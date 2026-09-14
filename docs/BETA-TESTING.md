# Beta test guide

Version: `1.2.0-beta.1`. Live Windows checks passed on Zen 1.22.1b; see the [validation record](BETA-VALIDATION.md) for evidence and untested scenarios. Syntax checks alone do not establish browser compatibility.

## Test record

| Date | Exact Zen version | OS/version | Loader/version | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-09-14 | 1.22.1b | Windows 11 build 26200 | Bundled fx-autoconfig 54f8829 | 24 live checks, restart, install/removal passed | [Details](BETA-VALIDATION.md) |

Record **Pass**, **Fail**, or **Not tested** for each check. Include other UI mods, scaling, and whether the profile is new. For failures include reproduction steps, expected/actual behavior, and sanitized screenshots.

## Ten-minute smoke test

1. Install in a separate profile using [INSTALLATION.md](INSTALLATION.md). Confirm unrelated customizations remain intact.
2. Visit your running app at `http://localhost:<port>`. Confirm the URL is visible and no page control is covered.
3. Click the URL, change a path, and press Enter. Confirm the selected tab navigates. Edit again and press Escape; confirm no navigation.
4. Open a normal HTTPS site. Confirm Automatic hides the bar. Press `Alt+Shift+O`, select Always on, and confirm it appears.
5. Toggle `Alt+Shift+D` on one localhost origin. Confirm a different port retains its behavior. Restore Automatic in settings.
6. Restart Zen and open another window. Confirm remembered choices persist and settings behave consistently.
7. Follow the removal instructions. Confirm the normal UI returns and other customizations remain.

## Functional checks

- Automatic retains the documented localhost, zero-address, and local-suffix defaults. Test detection toggles independently.
- Existing custom ports and glob patterns retain their behavior; ordinary unmatched public sites stay off.
- Exact and wildcard custom rules match only documented targets; removing a rule updates Automatic behavior.
- Always off wins over detection. Returning to Automatic removes the manual override.
- Paths share an origin; scheme and non-default port differences remain distinct.
- Local files stay off until opted in. Internal pages do not become ordinary site entries.
- Copy returns the selected URL. Special characters display literally and cannot become markup.
- Screenshot, reload bypassing cache, element picker, console, and network actions target the selected page. Test site-data clearing only on disposable local data; it can sign you out.
- Native URL suggestions, keyboard selection, viewport readout, custom ports/globs, copy-as-curl, and settings actions continue to work.
- Switching tabs during editing cannot accidentally navigate the wrong tab. Back/forward, redirects, and same-document navigation refresh the display.
- Private-window site choices persist in profile preferences as documented; use dummy hosts when testing.

## Layout checks

| Scenario | Inspect | Status |
| --- | --- | --- |
| Left/right sidebar; drag width | Tracks content without covering sidebar controls | Not tested |
| Compact mode; hidden toolbars | No stale gap or blocked hover target | Not tested |
| Horizontal/vertical splits | Display/actions follow focused pane without overlap | Not tested |
| Browser fullscreen | Content usable; documented toolbar behavior | Not tested |
| Page/video fullscreen | Mod does not cover fullscreen content | Not tested |
| Narrow window; high scaling | URL/buttons remain usable | Not tested |
| Light/dark themes | Readable labels and visible focus | Not tested |
| Keyboard only | Editing, settings, buttons, Escape, focus return | Not tested |
| Multiple windows and closure | No duplicate banner or stale listeners | Not tested |
| Session restore and restart | No duplicate initialization; choices retained | Not tested |

## Release gate

Before announcing a public beta, record a clean-profile installation and removal on the maintainer's actual Zen version, complete the smoke test, and capture a real demo. Reproduce known layout failures and state them in release notes. Each supported-platform claim needs that platform's own record.

Ask testers what they used, what failed, and whether they kept it enabled after a few days. Installation friction and lack of workflow fit are useful feedback too.
