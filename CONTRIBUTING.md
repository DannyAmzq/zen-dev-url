# Contributing

Help is especially useful from developers already using Zen for localhost or staging work. Start with the [beta checklist](docs/BETA-TESTING.md).

## Report a problem

Use the bug-report template. Include exact Zen version, OS, loader, other UI mods, affected layout, and minimal reproduction steps. Replace private hostnames with representative examples and remove tokens from URLs and screenshots.

Keep this mod's support here. Open an upstream Zen issue only after reproducing without this mod and other customizations.

## Propose a change

Describe the development task that is difficult today and how the change helps. Discuss larger behavior changes in an issue before implementation. Small fixes can go directly into a pull request.

Runtime behavior lives in `devbar.uc.js` and styles in `devbar.css`. The editable field already connects to native Zen suggestions; preserve that behavior. Follow the repository's existing convention of targeting the `dev` branch for pull requests.

Keep URL handling text-based, navigation explicit, and listeners removable on shutdown. Add meaningful policy tests when matching or preference behavior changes. Browser APIs still need live testing: record the exact tested Zen version and relevant scenarios in the pull request. Mocked test results are not browser-compatibility evidence.

Update installation and removal instructions when files or preferences change. Preserve attribution and the vendored fx-autoconfig license. No root project license has been inferred from that dependency's license.

