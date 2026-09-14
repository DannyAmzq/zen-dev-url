# Security and privacy

devbar runs with browser privileges through fx-autoconfig. Its intended actions include reading the selected URL, navigating the selected tab, writing preferences, copying URLs to the clipboard, invoking screenshots, and opening developer tools.

Review the source and use a separate profile for first testing. Keep the loader and browser updated. The DEV label follows host rules and manual choices; it does not prevent production changes.

Settings use `devbar.*` profile preferences; remembered origins use `devbar.site-rules`. Private-window choices also persist there. Saved origins and patterns can reveal private project names. Avoid publishing these preferences, complete profiles, or unredacted URLs. Normal browser and clipboard behavior applies to actions you invoke.

The existing site-data clear action can remove authentication and storage. Cache, mixed-content, and JavaScript options change browser preferences beyond toolbar visibility; JavaScript's preference is global. Removing devbar does not automatically restore those settings.

## Report a vulnerability

GitHub private vulnerability reporting was disabled when checked on 2026-09-14. Ask the maintainer for a private channel without posting exploit details or secrets. No private contact address is configured in this candidate.

Include affected versions, reproduction steps using dummy data, impact, and any suggested fix. Do not share real credentials or a complete browser profile.

Only the current beta candidate is in scope for maintenance; no response-time guarantee or security audit is claimed.
