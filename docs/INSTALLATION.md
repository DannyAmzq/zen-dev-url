# Install, update, and remove devbar

This guide covers `1.2.0-beta.1`. Windows 11 with Zen 1.22.1b has been tested; macOS and Linux browser installations still need beta testers. See the [validation record](BETA-VALIDATION.md).

[Windows](#windows) · [macOS](#macos) · [Linux](#linux) · [WSL](#wsl) · [Manual](#manual-installation) · [Update](#updating) · [Remove](#remove) · [Troubleshooting](#troubleshooting)

## Download

Choose a published `1.2.0-beta.1` package from [Releases](https://github.com/DannyAmzq/zen-dev-url/releases), or [download the main source ZIP](https://github.com/DannyAmzq/zen-dev-url/archive/refs/heads/main.zip) if the beta release is not listed yet. Extract the entire archive before running an installer. Keep `scripts/` and `vendor/` beside the installer; copying only `install.ps1` or `install.sh` is not sufficient.

The source ZIP follows the current `main` branch; a versioned release archive is a fixed snapshot. A release's `SHA256SUMS.txt` lets you check the downloaded archive. The included loader does not need a network download during installation.

## Before changing a profile

Open `about:support` and use **Profile Folder → Open Folder** to locate the active profile. Back up its `chrome` folder and existing loader configuration. Close Zen before editing these files. Prefer a separate profile for first testing.

The provided installers can target multiple detected profiles. Select one existing profile with `-ProfilePath "<profile>"` on PowerShell or `--profile "<profile>"` on Bash; without that flag they retain the existing multi-profile behavior. Use `-DryRun` or `--dry-run` to inspect changes first. Existing managed autoconfig or other loaders require compatibility review rather than replacement.

Installer-managed CSS is bounded by `/* devbar:begin */` and `/* devbar:end */`, with backups before replacement/removal. Known old blocks can migrate; ambiguous or edited legacy blocks stop the installer for manual cleanup so unrelated CSS is preserved.

## Windows

Open a PowerShell terminal in the extracted folder. Replace `<profile folder>` with the full path from `about:support`, then preview and install:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ProfilePath "<profile folder>" -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ProfilePath "<profile folder>"
```

The execution-policy option applies to this PowerShell process. Both Windows PowerShell 5.1 and PowerShell 7 installer fixtures are checked in CI.

Alternatively, double-click `install.bat`; this installs to all profiles the installer detects. The explicit profile command above is preferable for a separate beta profile. Initial loader setup can need Administrator access if Zen is under `Program Files` and `config.js` is not already installed.

Complete the [one-time browser setup](#one-time-browser-setup), then verify the chosen profile:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -ProfilePath "<profile folder>" -Verify
```

## macOS

In a terminal in the extracted folder:

```bash
bash install.sh --profile "<profile folder>" --dry-run
bash install.sh --profile "<profile folder>"
```

The installer expects `/Applications/Zen.app`; profiles normally live under `~/Library/Application Support/Zen/`. Initial program-side loader installation uses `sudo` and may prompt for a password. If macOS blocks the write, follow the installer's App Management guidance for your terminal app, then retry. Complete the browser setup below and verify with `bash install.sh --profile "<profile folder>" --verify`.

## Linux

The installer can locate extracted or package-installed Zen under common `~/.local`, `/opt`, and `/usr/lib` locations. Use a writable extracted installation for the simplest setup:

```bash
bash install.sh --profile "<profile folder>" --dry-run
bash install.sh --profile "<profile folder>"
```

Complete the browser setup below, then run `bash install.sh --profile "<profile folder>" --verify`.

**Flatpak:** copying profile files is not a complete installation. The current installer cannot place the required program-side loader inside the app deployment, and reports the installation as incomplete. This path is not supported for a working beta installation; use a writable extracted Zen installation instead.

**AppImage:** a mounted AppImage is read-only. Extract it first using its `--appimage-extract` option, move the extracted directory to a new user-owned location such as `~/.local/zen-browser`, and run Zen from that directory before locating its profile and running the installer. Do not replace an existing directory containing your files.

**Package-managed installations:** writing the program-side loader may require elevated permissions. Avoid running the entire profile installer as root, which can select the wrong home directory or leave root-owned profile files. Use a user-owned extracted installation or set up just the program-side loader with appropriate permissions, then run the profile installer as your normal user.

## WSL

For Zen installed on Windows, the native PowerShell instructions are the tested path. The Bash installer also detects WSL and targets Windows Zen through `/mnt/c`; pass the Windows profile path in WSL form with `--profile`. Initial program-side writes still require Windows permissions. This WSL path has not been exercised in the current beta validation.

## One-time browser setup

1. Open Zen and visit `about:config`.
2. Set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`.
3. Fully quit and reopen Zen.
4. Visit a running app at `http://localhost:<port>`. The toolbar should appear.

If needed, the browser console should report `[devbar] v1.2.0-beta.1 loaded`. An installer verification checks files and preferences; seeing the toolbar in the intended profile confirms that the browser actually loaded it.

## Installer options

| Bash | PowerShell | Purpose |
| --- | --- | --- |
| `--profile DIR` | `-ProfilePath DIR` | Target one existing profile |
| `--dry-run` | `-DryRun` | Preview changes |
| `--verify` | `-Verify` | Check installed files and preferences |
| `--uninstall` | `-Uninstall` | Remove devbar from the selected profiles |
| `--help` | `-Help` | Show usage |

Choose only one mode flag at a time. Omitting the profile flag retains automatic selection of all detected channel profiles.

## Manual installation

Set up [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig#install) if it is not already present. The repository includes a pinned copy under `vendor/fx-autoconfig/`; do not blindly overwrite another loader with it.

Copy the mod files into the chosen profile:

```text
<profile>/chrome/
  userChrome.css       # existing file; add only the import below
  devbar.css
  JS/
    devbar.uc.js
```

Add this import before ordinary rules and any `@namespace` declarations in `userChrome.css`, after any `@charset` declaration:

```css
@import url("devbar.css");
```

Preserve existing imports and rules. Create `userChrome.css` only if it is absent. Import the stylesheet once; do not also append its contents. In `about:config`, enable `toolkit.legacyUserProfileCustomizations.stylesheets`.

Fully quit and restart Zen. If the old script remains cached, use the loader's **Restart and clear startup cache** action. Open settings with `Alt+Shift+O` and complete the [smoke test](BETA-TESTING.md#ten-minute-smoke-test).

## Updating

Download and extract the desired release into its own folder, close Zen, and rerun that version's installer with the same profile flag. Restart and verify afterward. For a Git checkout, switch to the intended branch or release before updating; do not assume every branch contains the same version.

### Updating the April version

The mod keeps its existing `devbar.uc.js` / `devbar.css` filenames and `devbar.*` preferences. There is no new standalone policy script to install. Existing custom ports, host patterns, detection toggles, and developer settings are retained.

The main behavior change is `Alt+Shift+D`: HTTP(S) choices are now remembered per origin rather than following the same tab to unrelated sites. Choose Automatic to remove an override.

If CSS was previously appended to `userChrome.css`, identify and remove only the old devbar block before adding the import. Preserve unrelated CSS after the block. If the boundary is unclear, compare with a backup; do not remove everything from a marker to the end of the file. Check installer output for any manual migration instructions.

## Remove

The installers provide `-Uninstall` (PowerShell) and `--uninstall` (Bash); use the profile flag above to limit their scope. They remove installer-managed CSS, not a manually added import. For a manual installation, remove it from the chosen profile as follows:

1. Close Zen.
2. Move `chrome/JS/devbar.uc.js` and `chrome/devbar.css` into a backup outside the loader's directories.
3. Remove only the devbar CSS import, or only its previously appended CSS block.
4. Restart and clear startup cache if necessary.

Leave fx-autoconfig and unrelated scripts/styles in place. Optionally reset preferences beginning with `devbar.` to remove this mod's saved choices. Do not reset unrelated browser preferences blindly: cache, JavaScript, and mixed-content options use Firefox preferences and persist independently of this mod. Restore any of those you changed to your desired values in `about:config`.

## Troubleshooting

If the bar does not appear, check the active profile, loader, matching address, master switch, and CSS import order. Use `Alt+Shift+O` when the bar is hidden. For layout or command failures, record exact Zen version, OS, and reproduction steps and test without other UI mods in a separate profile.

For Linux packaging and write-permission issues, see the [Linux section](#linux). A successful copy of profile files alone is not proof the loader can run.
