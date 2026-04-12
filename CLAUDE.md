# zen-dev-url — dev notes

## Branch
All development happens on `dev`.

## Testing on macOS (Zen Browser)

Run from the repo root after `git pull`:

```bash
PROFILE=$(awk '/Default=1/{f=1} f && /^Path=/{print substr($0,6); exit}' \
  ~/Library/Application\ Support/Zen/profiles.ini)
CHROME="$HOME/Library/Application Support/Zen/Profiles/$PROFILE/chrome"

cp zen-dev-url-detector.uc.js "$CHROME/JS/"
sed -i '' '/\/\* zen-dev-url \*\//,$d' "$CHROME/userChrome.css"
{ printf '\n/* zen-dev-url */\n'; cat zen-dev-url.css; } >> "$CHROME/userChrome.css"
echo "Done — restart Zen."
```

Then fully restart Zen and open the browser console (`Cmd+Option+J` or `Ctrl+Shift+J`) to verify:
```
[zen-dev-url] vYYYYMMDD-N loaded
```

## Testing on Windows (from WSL)

```bash
WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')
ZEN="/mnt/c/Users/$WINUSER/AppData/Roaming/zen"
PROFILE=$(awk '/Default=1/{f=1} f && /^Path=/{print substr($0,6); exit}' "$ZEN/profiles.ini" | tr -d '\r')
CHROME="$ZEN/$PROFILE/chrome"

cp zen-dev-url-detector.uc.js "$CHROME/JS/" && echo "JS copied OK" || echo "JS FAILED"
sed -i '/\/\* zen-dev-url \*\//,$d' "$CHROME/userChrome.css"
{ printf '\n/* zen-dev-url */\n'; cat zen-dev-url.css; } >> "$CHROME/userChrome.css" && echo "CSS updated OK" || echo "CSS FAILED"
```

## Version verification
Every push bumps `ZEN_DEV_URL_VERSION` at the top of the userscript.
Check the browser console after restart — look for the orange `[zen-dev-url] vN loaded` line.

## Key files
- `zen-dev-url-detector.uc.js` — main userscript (JS logic, banner, settings)
- `zen-dev-url.css` — all styles (appended to userChrome.css)
- `install.sh` — first-time installer for Mac/Linux
- `install.ps1` — first-time installer for Windows
