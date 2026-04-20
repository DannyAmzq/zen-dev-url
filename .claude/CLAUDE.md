# zen-dev-url — dev notes

## Authorship
All commits, issues, and PRs MUST be authored under DannyAmzq's account. Never reference Claude as the author. If Claude must be referenced for any reason, always co-author DannyAmzq's account. No commit messages, PR descriptions, or issue bodies should attribute work to Claude or AI tooling.

## Branch
All development happens on `dev`.

## Testing on macOS (Zen Browser)

One-liner — pull latest, copy files, done. Then quit and reopen Zen.

```bash
git pull && \
CHROME="$HOME/Library/Application Support/zen/Profiles/3lw53z6b.Default (release)/chrome" && \
cp zen-dev-url-detector.uc.js "$CHROME/JS/" && \
sed -i '' '/\/\* zen-dev-url \*\//,$d' "$CHROME/userChrome.css" && \
{ printf '\n/* zen-dev-url */\n'; cat zen-dev-url.css; } >> "$CHROME/userChrome.css" && \
echo "Done — restart Zen."
```

Then fully restart Zen and open the browser console (`Cmd+Option+J` or `Ctrl+Shift+J`) to verify:
```
[zen-dev-url] vYYYYMMDD-N loaded
```

## Testing on Windows (from WSL)

Loops over every installed Zen channel (release/beta/twilight) automatically.

```bash
git pull && {
  WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
  ZEN="/mnt/c/Users/$WINUSER/AppData/Roaming/zen"
  while IFS= read -r PROFILE; do
    CHROME="$ZEN/$PROFILE/chrome"
    echo "→ $(basename "$PROFILE")"
    cp zen-dev-url-detector.uc.js "$CHROME/JS/" && echo "  JS OK" || echo "  JS FAILED"
    sed -i '/\/\* zen-dev-url \*\//,$d' "$CHROME/userChrome.css"
    { printf '\n/* zen-dev-url */\n'; cat zen-dev-url.css; } >> "$CHROME/userChrome.css" && echo "  CSS OK" || echo "  CSS FAILED"
  done < <(awk '/^\[Install/{f=1;next} /^\[/{f=0} f && /^Default=Profiles\//{print substr($0,9)}' \
    "$ZEN/profiles.ini" | tr -d '\r')
  echo "Done — restart Zen."
}
```

## Version verification
Every push bumps `ZEN_DEV_URL_VERSION` at the top of the userscript.
Check the browser console after restart — look for the orange `[zen-dev-url] vN loaded` line.

## Key files
- `zen-dev-url-detector.uc.js` — main userscript (JS logic, banner, settings)
- `zen-dev-url.css` — all styles (appended to userChrome.css)
- `install.sh` — first-time installer for Mac/Linux
- `install.ps1` — first-time installer for Windows
