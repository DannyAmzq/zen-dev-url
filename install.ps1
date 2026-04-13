# ============================================================
# zen-dev-url installer — Windows (PowerShell)
# ============================================================
# NOTE: Any existing userChrome.css content is preserved.
#       This script appends zen-dev-url styles rather than
#       overwriting, and is safe to re-run (idempotent).
# ============================================================

$ErrorActionPreference = "Stop"

function Info    { param($msg) Write-Host "[zen-dev-url] $msg" -ForegroundColor Cyan }
function Success { param($msg) Write-Host "[zen-dev-url] $msg" -ForegroundColor Green }
function Warn    { param($msg) Write-Host "[zen-dev-url] $msg" -ForegroundColor Yellow }
function Fail    { param($msg) Write-Host "[zen-dev-url] $msg" -ForegroundColor Red; exit 1 }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

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

# ── 3. Check / install fx-autoconfig ─────────────────────────
# Program files go into the Zen binary directory (once).
# Utils go into each profile's chrome\utils\ (per-profile loop below).

$ConfigJs = Join-Path $ZenResources "config.js"
$FxSrc    = $null

# Download source if program files are missing OR any profile is missing utils
$needsDownload = (-not (Test-Path $ConfigJs)) -or
                 ($ProfileDirs | Where-Object { -not (Test-Path (Join-Path $_ "chrome\utils")) }).Count -gt 0

$TmpDir = $null
if ($needsDownload) {
  Info "Downloading fx-autoconfig..."

  $TmpDir  = Join-Path $env:TEMP "fx-autoconfig-install"
  # Clean any leftovers from a previous run so Expand-Archive doesn't see stale files
  if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

  $ZipPath = Join-Path $TmpDir "fx-autoconfig.zip"
  Invoke-WebRequest -Uri "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip" `
    -OutFile $ZipPath
  Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force
  $FxSrc = Join-Path $TmpDir "fx-autoconfig-master"

  if (-not (Test-Path $ConfigJs)) {
    Copy-Item "$FxSrc\program\config.js" $ConfigJs

    $PrefsDir = Join-Path $ZenResources "defaults\pref"
    New-Item -ItemType Directory -Force -Path $PrefsDir | Out-Null
    Copy-Item "$FxSrc\program\defaults\pref\config-prefs.js" "$PrefsDir\config-prefs.js"

    Success "fx-autoconfig program files installed."
  } else {
    Success "fx-autoconfig program files already installed."
  }
} else {
  Success "fx-autoconfig already installed, skipping."
}

# ── 4. Install to each profile ───────────────────────────────

$Installed = 0

foreach ($ProfileDir in $ProfileDirs) {
  if ($ProfileDirs.Count -gt 1) {
    Info "─── $(Split-Path -Leaf $ProfileDir) ───"
  }

  # fx-autoconfig utils (per-profile, only if we downloaded source)
  if ($FxSrc) {
    $UtilsDest = Join-Path $ProfileDir "chrome\utils"
    New-Item -ItemType Directory -Force -Path $UtilsDest | Out-Null
    Copy-Item "$FxSrc\profile\chrome\utils\*" $UtilsDest -Recurse -Force
  }

  # Userscript
  $JsDir = Join-Path $ProfileDir "chrome\JS"
  New-Item -ItemType Directory -Force -Path $JsDir | Out-Null
  Copy-Item "$ScriptDir\zen-dev-url-detector.uc.js" $JsDir -Force
  Success "Copied userscript to $JsDir"

  # CSS (idempotent)
  $ChromeCss = Join-Path $ProfileDir "chrome\userChrome.css"
  $Marker    = "/* zen-dev-url */"
  $alreadyInstalled = (Test-Path $ChromeCss) -and
                      (Get-Content $ChromeCss -Raw) -match [regex]::Escape($Marker)
  if ($alreadyInstalled) {
    Warn "zen-dev-url styles already present in userChrome.css for $(Split-Path -Leaf $ProfileDir), skipping."
  } else {
    $cssContent = "`n$Marker`n" + (Get-Content "$ScriptDir\zen-dev-url.css" -Raw)
    Add-Content -Path $ChromeCss -Value $cssContent -Encoding UTF8
    Success "Appended styles to $ChromeCss"
  }

  $Installed++
}

if ($Installed -eq 0) { Fail "No profiles were successfully installed to." }

# Clean up the fx-autoconfig download dir
if ($TmpDir -and (Test-Path $TmpDir)) { Remove-Item $TmpDir -Recurse -Force }

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
Write-Host "│  The dev banner will appear on localhost URLs.      │" -ForegroundColor Yellow
Write-Host "└─────────────────────────────────────────────────────┘" -ForegroundColor Yellow
Write-Host ""
Success "Installation complete! ($Installed profile(s) updated)"
