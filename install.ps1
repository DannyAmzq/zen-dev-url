# ============================================================
# devbar installer — Windows (PowerShell)
# ============================================================
# NOTE: Any existing userChrome.css content is preserved.
#       This script appends devbar styles rather than
#       overwriting, and is safe to re-run (idempotent).
# ============================================================

param(
  [switch]$Help,
  [switch]$Uninstall,
  [switch]$Verify,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Info    { param($msg) Write-Host "[devbar] $msg" -ForegroundColor Cyan }
function Success { param($msg) Write-Host "[devbar] $msg" -ForegroundColor Green }
function Warn    { param($msg) Write-Host "[devbar] $msg" -ForegroundColor Yellow }
function Fail    { param($msg) Write-Host "[devbar] $msg" -ForegroundColor Red; exit 1 }

# ── 0. Parse flags ──────────────────────────────────────────

if ($Help) {
  Write-Host @"
devbar installer — Windows (PowerShell)

Usage: .\install.ps1 [OPTIONS]

Options:
  -Help         Show this help message and exit
  -Uninstall    Remove devbar files from all detected profiles
  -Verify       Check whether devbar is correctly installed
  -DryRun       Show what would be done without making changes

Without options, installs devbar to all detected Zen profiles.
"@
  exit 0
}

if     ($Uninstall) { $Mode = "uninstall" }
elseif ($Verify)    { $Mode = "verify" }
elseif ($DryRun)    { $Mode = "dry-run" }
else                { $Mode = "install" }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Print version
$verLine = Select-String -Path "$ScriptDir\devbar.uc.js" -Pattern "DEVBAR_VERSION\s*=\s*'([^']+)'" | Select-Object -First 1
if ($verLine -and $verLine.Matches.Groups.Count -gt 1) {
  $Version = $verLine.Matches.Groups[1].Value
} else {
  $Version = "unknown"
}
Info "devbar v$Version — $Mode"

# ── 1. Find Zen installation ─────────────────────────────────

$ZenExe = @(
  "$env:LOCALAPPDATA\zen\zen.exe",
  "$env:PROGRAMFILES\Zen Browser\zen.exe",
  "$env:PROGRAMFILES(x86)\Zen Browser\zen.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $ZenExe) { Fail "Could not find Zen Browser installation." }
$ZenResources = Split-Path -Parent $ZenExe
Info "Zen resources: $ZenResources"

# ── 2. Find all Zen profiles ─────────────────────────────────
# Each installed Zen channel (release/beta/twilight) has its own [Install{hash}]
# section in profiles.ini. Collect all of them so we install to every channel.
#
# Reset $inInstall on any non-Install section header so we don't accidentally
# pick up the boolean Default=1 that appears in [Profile] sections.

$ProfilesIni = "$env:APPDATA\zen\profiles.ini"
if (-not (Test-Path $ProfilesIni)) { Fail "profiles.ini not found at: $ProfilesIni" }

$iniContent  = Get-Content $ProfilesIni
$rawPaths    = @()
$inInstall   = $false

foreach ($line in $iniContent) {
  if     ($line -match '^\[Install')                       { $inInstall = $true }
  elseif ($line -match '^\[')                              { $inInstall = $false }
  elseif ($inInstall -and $line -match '^Default=(Profiles.+)') {
    $rawPaths  += $Matches[1].Trim()
    $inInstall  = $false   # one Default= per Install section
  }
}

# Fallback: [Profile] section marked Default=1
if ($rawPaths.Count -eq 0) {
  $curPath = $null; $curRelative = $true; $curDefault = $false
  foreach ($line in $iniContent) {
    if ($line -match '^\[Profile') {
      if ($curDefault -and $curPath) { $rawPaths += $curPath; break }
      $curPath = $null; $curRelative = $true; $curDefault = $false
    }
    elseif ($line -match '^Path=(.+)')    { $curPath = $Matches[1] }
    elseif ($line -match '^IsRelative=0') { $curRelative = $false }
    elseif ($line -match '^Default=1')    { $curDefault = $true }
  }
  if ($rawPaths.Count -eq 0 -and $curDefault -and $curPath) { $rawPaths += $curPath }
}

if ($rawPaths.Count -eq 0) { Fail "Could not find any profiles in profiles.ini." }

$ProfileDirs = @()
foreach ($p in $rawPaths) {
  $dir = if ($p -match '^[A-Za-z]:\\') { $p } else { Join-Path "$env:APPDATA\zen" $p }
  if (Test-Path $dir) {
    $ProfileDirs += $dir
  } else {
    Warn "Profile directory not found, skipping: $dir"
  }
}
if ($ProfileDirs.Count -eq 0) { Fail "No valid profile directories found." }

if ($ProfileDirs.Count -eq 1) {
  Info "Detected profile: $($ProfileDirs[0])"
} else {
  Info "Detected $($ProfileDirs.Count) Zen channel profiles — installing to all:"
  foreach ($d in $ProfileDirs) { Info "  $d" }
}

# ── Mode: -Verify ───────────────────────────────────────────
if ($Mode -eq "verify") {
  $Pass = 0; $FailCount = 0

  $ConfigJs = Join-Path $ZenResources "config.js"
  if (Test-Path $ConfigJs) {
    Success "✔ fx-autoconfig config.js found"; $Pass++
  } else {
    Warn "✘ fx-autoconfig config.js MISSING at $ZenResources"; $FailCount++
  }

  foreach ($ProfileDir in $ProfileDirs) {
    if ($ProfileDirs.Count -gt 1) { Info "─── $(Split-Path -Leaf $ProfileDir) ───" }

    $js = Join-Path $ProfileDir "chrome\JS\devbar.uc.js"
    if (Test-Path $js) {
      Success "✔ Userscript installed"; $Pass++
    } else {
      Warn "✘ Userscript MISSING"; $FailCount++
    }

    $css = Join-Path $ProfileDir "chrome\userChrome.css"
    if ((Test-Path $css) -and (Get-Content $css -Raw) -match [regex]::Escape("/* devbar */")) {
      Success "✔ CSS styles present in userChrome.css"; $Pass++
    } else {
      Warn "✘ CSS styles MISSING from userChrome.css"; $FailCount++
    }

    $manifest = Join-Path $ProfileDir "chrome\utils\chrome.manifest"
    if (Test-Path $manifest) {
      Success "✔ fx-autoconfig profile utils installed"; $Pass++
    } else {
      Warn "✘ fx-autoconfig profile utils MISSING"; $FailCount++
    }

    $prefs = Join-Path $ProfileDir "prefs.js"
    if ((Test-Path $prefs) -and (Select-String -Path $prefs -Pattern 'toolkit.legacyUserProfileCustomizations.stylesheets.*true' -Quiet)) {
      Success "✔ Stylesheet pref enabled"; $Pass++
    } else {
      Warn "✘ toolkit.legacyUserProfileCustomizations.stylesheets not set (check about:config)"; $FailCount++
    }
  }

  Write-Host ""
  $total = $Pass + $FailCount
  if ($FailCount -eq 0) {
    Success "All checks passed ($Pass/$total)"
  } else {
    Warn "$FailCount of $total checks failed"
  }
  exit 0
}

# ── Mode: -Uninstall ────────────────────────────────────────
if ($Mode -eq "uninstall") {
  $Removed = 0
  foreach ($ProfileDir in $ProfileDirs) {
    if ($ProfileDirs.Count -gt 1) { Info "─── $(Split-Path -Leaf $ProfileDir) ───" }

    # Remove userscript
    $js = Join-Path $ProfileDir "chrome\JS\devbar.uc.js"
    if (Test-Path $js) {
      Remove-Item $js -Force
      Success "Removed userscript"
    } else {
      Warn "Userscript not found, skipping"
    }

    # Strip CSS block (from marker to EOF)
    $css = Join-Path $ProfileDir "chrome\userChrome.css"
    $Marker = "/* devbar */"
    if ((Test-Path $css) -and (Get-Content $css -Raw) -match [regex]::Escape($Marker)) {
      $lines = Get-Content $css
      $idx = ($lines | Select-String -SimpleMatch $Marker | Select-Object -First 1).LineNumber - 1
      if ($idx -gt 0) {
        $lines[0..($idx - 1)] | Set-Content $css -Encoding UTF8
      } else {
        Set-Content $css "" -Encoding UTF8
      }
      Success "Removed devbar styles from userChrome.css"
    } else {
      Warn "No devbar styles found in userChrome.css, skipping"
    }

    $Removed++
  }

  Write-Host ""
  Info "fx-autoconfig was left in place (other mods may depend on it)."
  Info "To remove it: delete config.js + defaults\pref\config-prefs.js from"
  Info "  $ZenResources"
  Info "and chrome\utils\ from each profile directory."
  Write-Host ""
  Success "Uninstall complete ($Removed profile(s) cleaned). Restart Zen."
  exit 0
}

# ── Mode: -DryRun ───────────────────────────────────────────
if ($Mode -eq "dry-run") {
  $FxSrc = Join-Path $ScriptDir "vendor\fx-autoconfig"
  Write-Host ""
  Info "Dry run — no changes will be made."
  Write-Host ""

  $ConfigJs = Join-Path $ZenResources "config.js"
  if (-not (Test-Path $ConfigJs)) {
    Info "  • Would install fx-autoconfig program files to $ZenResources"
  } else {
    Info "  • fx-autoconfig program files already present (skip)"
  }

  foreach ($ProfileDir in $ProfileDirs) {
    Info "  Profile: $(Split-Path -Leaf $ProfileDir)"
    Info "    • Copy fx-autoconfig utils → chrome\utils\"
    Info "    • Copy devbar.uc.js → chrome\JS\"
    $css = Join-Path $ProfileDir "chrome\userChrome.css"
    if ((Test-Path $css) -and (Get-Content $css -Raw) -match [regex]::Escape("/* devbar */")) {
      Info "    • CSS already present (skip)"
    } else {
      Info "    • Append devbar.css → userChrome.css"
    }
  }

  Write-Host ""
  Info "No changes were made. Remove -DryRun to install."
  exit 0
}

# ── 3. Check / install fx-autoconfig ─────────────────────────
# fx-autoconfig is vendored in vendor\fx-autoconfig\ — no network fetch
# or Expand-Archive dependency needed. See vendor\fx-autoconfig\README.md.
#
# Program files go into the Zen binary directory (once).
# Utils go into each profile's chrome\utils\ (per-profile loop below).

$FxSrc = Join-Path $ScriptDir "vendor\fx-autoconfig"
if (-not (Test-Path (Join-Path $FxSrc "profile\chrome\utils"))) {
  Fail "Vendored fx-autoconfig not found at $FxSrc — did you clone the repo with its full tree?"
}

$ConfigJs = Join-Path $ZenResources "config.js"

if (-not (Test-Path $ConfigJs)) {
  Copy-Item (Join-Path $FxSrc "program\config.js") $ConfigJs

  $PrefsDir = Join-Path $ZenResources "defaults\pref"
  New-Item -ItemType Directory -Force -Path $PrefsDir | Out-Null
  Copy-Item (Join-Path $FxSrc "program\defaults\pref\config-prefs.js") "$PrefsDir\config-prefs.js"

  Success "fx-autoconfig program files installed (from vendored copy)."
} else {
  Success "fx-autoconfig program files already installed."
}

# ── 4. Install to each profile ───────────────────────────────

$Installed = 0

foreach ($ProfileDir in $ProfileDirs) {
  if ($ProfileDirs.Count -gt 1) {
    Info "─── $(Split-Path -Leaf $ProfileDir) ───"
  }

  # fx-autoconfig utils (per-profile, from vendored copy)
  $UtilsDest = Join-Path $ProfileDir "chrome\utils"
  New-Item -ItemType Directory -Force -Path $UtilsDest | Out-Null
  Copy-Item "$FxSrc\profile\chrome\utils\*" $UtilsDest -Recurse -Force

  # Userscript
  $JsDir = Join-Path $ProfileDir "chrome\JS"
  New-Item -ItemType Directory -Force -Path $JsDir | Out-Null
  Copy-Item "$ScriptDir\devbar.uc.js" $JsDir -Force
  Success "Copied userscript to $JsDir"

  # CSS — always refresh. If an existing devbar block is present,
  # strip everything from the marker to EOF and re-append, so re-running
  # install.ps1 picks up CSS changes (icons, stripe colors, etc).
  $ChromeCss = Join-Path $ProfileDir "chrome\userChrome.css"
  $Marker    = "/* devbar */"
  if ((Test-Path $ChromeCss) -and (Get-Content $ChromeCss -Raw) -match [regex]::Escape($Marker)) {
    $lines = Get-Content $ChromeCss
    $idx = ($lines | Select-String -SimpleMatch $Marker | Select-Object -First 1).LineNumber - 1
    if ($idx -gt 0) {
      $lines[0..($idx - 1)] | Set-Content $ChromeCss -Encoding UTF8
    } else {
      Set-Content $ChromeCss "" -Encoding UTF8
    }
    Info "Stripped existing devbar styles before re-appending."
  }
  $cssContent = "`n$Marker`n" + (Get-Content "$ScriptDir\devbar.css" -Raw)
  Add-Content -Path $ChromeCss -Value $cssContent -Encoding UTF8
  Success "Appended styles to $ChromeCss"

  $Installed++
}

if ($Installed -eq 0) { Fail "No profiles were successfully installed to." }

# ── 5. Remind about about:config ─────────────────────────────

Write-Host ""
Write-Host "┌─────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│  Almost done — one manual step required in Zen:     │" -ForegroundColor Yellow
Write-Host "│                                                     │" -ForegroundColor Yellow
Write-Host "│  1. Open Zen and go to: about:config                │" -ForegroundColor Yellow
Write-Host "│  2. Search: toolkit.legacyUserProfileCustomizations │" -ForegroundColor Yellow
Write-Host "│             .stylesheets                            │" -ForegroundColor Yellow
Write-Host "│  3. Set it to: true                                 │" -ForegroundColor Yellow
Write-Host "│  4. Restart Zen                                     │" -ForegroundColor Yellow
Write-Host "│                                                     │" -ForegroundColor Yellow
Write-Host "│  Devbar will appear on localhost URLs.      │" -ForegroundColor Yellow
Write-Host "└─────────────────────────────────────────────────────┘" -ForegroundColor Yellow
Write-Host ""
Success "Installation complete! ($Installed profile(s) updated)"
