# Install, update, and remove devbar

This guide covers the `1.2.0-beta.1` candidate. Follow the platform-specific loader details in the [README](../README.md#installation). The existing project is [DannyAmzq/zen-dev-url](https://github.com/DannyAmzq/zen-dev-url); candidate files are not published until a new prerelease is created.

## Before changing a profile

Open `about:support` and use **Profile Folder → Open Folder** to locate the active profile. Back up its `chrome` folder and existing loader configuration. Close Zen before editing these files. Prefer a separate profile for first testing.

The provided installers can target multiple detected profiles. Select one existing profile with `-ProfilePath "<profile>"` on PowerShell or `--profile "<profile>"` on Bash; without that flag they retain the existing multi-profile behavior. Use `-DryRun` or `--dry-run` to inspect changes first. Existing managed autoconfig or other loaders require compatibility review rather than replacement.

Installer-managed CSS is bounded by `/* devbar:begin */` and `/* devbar:end */`, with backups before replacement/removal. Known old blocks can migrate; ambiguous or edited legacy blocks stop the installer for manual cleanup so unrelated CSS is preserved.

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

## Updating the April version

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

The existing Linux packaging caveats remain relevant: read-only Flatpak/AppImage installations cannot receive the normal program-side loader files directly. See the README for the supported installation paths; an installer copying profile files alone is not proof the mod loads.
