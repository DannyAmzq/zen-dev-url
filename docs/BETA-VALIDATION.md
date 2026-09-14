# devbar 1.2.0-beta.1 validation

Recorded 2026-09-14. These results cover the tested configuration, not every Zen version or customization.

## Environment

- Windows 11, OS build 26200; 150% display scaling.
- Zen **1.22.1b**, Gecko 155.0.1, browser build 20260911034930.
- Fresh disposable profile, default Zen layout, no other UI mods.
- Installer-bundled fx-autoconfig profile files, upstream pin `54f88294ea70f1d13ded482351da068d5f21c004`. Compatible program-side fx-autoconfig was already present; first-time program-directory installation was not exercised.
- Local HTTP fixture with dummy data; browser automation used the isolated process's Marionette endpoint. Personal profiles were not modified.

## Results

All **24 live functional checks passed**:

| Area | Verified behavior |
| --- | --- |
| Startup and geometry (3) | One toolbar; URL displayed; space reserved above page; geometry remains correct after resize |
| Detection and settings (7) | Existing local defaults and custom ports/globs; normalized HTTP(S) origins; off override and separate ports; settings shortcut while hidden; Automatic restores detection; master switch and action visibility |
| Editing and actions (7) | Enter navigates; Escape cancels; native suggestion query opens; focused text survives URL updates; tab switch exits editing; console and network buttons open the correct native panels |
| Windows and layout (7) | New window initializes once; preferences synchronize both directions; closing a window leaves the first usable; split panes remain below toolbar; focused split URL and viewport match; browser fullscreen reserves toolbar space |

Additional lifecycle checks passed:

- Full Windows install into a fresh profile using `-ProfilePath`, with an existing unrelated CSS comment. Browser loaded the installed runtime and appended stylesheet successfully.
- Installer `-Verify`: **5/5 checks passed** after startup.
- Restart retained an Always off origin choice, kept the toolbar hidden, and initialized only one instance. Returning to Automatic restored the bar.
- Targeted uninstall removed the userscript and bounded CSS while preserving the unrelated CSS. After restart, no devbar object, banner, or added layout row remained.
- No devbar-tagged errors were found in the inspected browser console records.

Automated regression checks:

- `npm run check`: **12 runtime tests passed**, including rule persistence, malformed settings, legacy detection, input validation, and cleanup.
- `tests/css-block.test.ps1`: **19 CSS preservation assertions passed**.
- `tests/css-block.test.sh`: **19 CSS preservation assertions passed** under Git Bash on Windows.
- `tests/installer-cli.test.ps1`: selected-profile dry run, failed verification exit status, and conflicting-mode rejection passed against temporary fixtures.
- GitHub CI covers Node checks and packaging on Windows and Ubuntu, with each platform's applicable installer fixtures. Consult the PR checks for CI results.

![Actual toolbar on the disposable local development fixture](media/beta-toolbar.png)

## Remaining beta coverage

Not yet tested: live macOS/Linux installation or browser use; other Zen releases; Sine installation/update/removal; private windows; page/video fullscreen; compact mode; right sidebar; vertical splits; theme variations and other UI mods. Only the default split arrangement and browser fullscreen were exercised.

The clear-data action, clipboard contents, screenshot action, inspector picker, auto-open DevTools, and remaining browser-wide settings were not exercised in this pass. Existing functionality was retained, but that is not a substitute for live testing. Settings shortcuts were dispatched as keyboard events; a complete physical-keyboard-only accessibility pass remains open.

No failure was observed in the completed checks. This is enough to invite a small **Windows beta** while requesting reports for the untested configurations.
