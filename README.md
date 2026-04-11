# zen-dev-url

A userChrome mod for [Zen Browser](https://zen-browser.app) that detects localhost and local dev URLs and highlights the browser UI — similar to how Arc Browser does it.

## What it does

- Adds an orange outline to the sidebar URL bar when you're on a dev URL
- Shows an editable dev URL banner above the page content (click to edit, Enter to navigate, Escape to cancel)
- Automatically detects `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `file://`, and hostnames ending in `.local`, `.localhost`, `.internal`, or `.test`
- Can be toggled via the preference `zen.urlbar.show-dev-indicator`

## Installation

This mod requires [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) to load the userscript. If you haven't set it up yet, follow the instructions in that repo first.

### 1. Copy the userscript

Copy `zen-dev-url-detector.uc.js` into your profile's `chrome/JS/` folder:

```
%APPDATA%\zen\Profiles\<your-profile>\chrome\JS\zen-dev-url-detector.uc.js
```

### 2. Add the CSS

Copy the contents of `zen-dev-url.css` into your `userChrome.css`:

```
%APPDATA%\zen\Profiles\<your-profile>\chrome\userChrome.css
```

### 3. Restart Zen Browser

The mod loads on startup. Navigate to `localhost` or any other dev URL to see it in action.

## Toggling the feature

You can disable the indicator without removing the files by setting the preference in `about:config`:

```
zen.urlbar.show-dev-indicator = false
```

## Detected URL patterns

| Pattern | Example |
|---|---|
| localhost | `http://localhost:3000` |
| 127.0.0.1 | `http://127.0.0.1:8080` |
| 0.0.0.0 | `http://0.0.0.0:5173` |
| IPv6 loopback | `http://[::1]:4000` |
| .local TLD | `http://myapp.local` |
| .localhost TLD | `http://myapp.localhost` |
| .internal TLD | `http://api.internal` |
| .test TLD | `http://myapp.test` |
| file:// | any local file |
