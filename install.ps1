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

# ── 2. Find the default profile ──────────────────────────────

$ProfilesIni = "$env:APPDATA\zen\profiles.ini"
if (-not (Test-Path $ProfilesIni)) { Fail "profiles.ini not found at: $ProfilesIni" }

$iniContent = Get-Content $ProfilesIni
$profilePath = $null
$isRelative  = $true

# Preferred: [Install{hash}] section — tracks the profile Zen actually launched last
$inInstall = $false
foreach ($line in $iniContent) {
  if     ($line -match '^\[Install')       { $inInstall = $true }
  elseif ($line -match '^\[')              { $inInstall = $false }
  elseif ($inInstall -and $line -match '^Default=(.+)') {
    $profilePath = $Matches[1].Trim()
    $isRelative  = $true   # [Install] Default= paths are always relative
    break
  }
}

# Fallback: profile section marked Default=1
if (-not $profilePath) {
  $curPath = $null; $curRelative = $true; $curDefault = $false
  foreach ($line in $iniContent) {
    if ($line -match '^\[Profile') {
      if ($curDefault -and $curPath) { $profilePath = $curPath; $isRelative = $curRelative; break }
      $curPath = $null; $curRelative = $true; $curDefault = $false
    }
    elseif ($line -match '^Path=(.+)')    { $curPath = $Matches[1] }
    elseif ($line -match '^IsRelative=0') { $curRelative = $false }
    elseif ($line -match '^Default=1')    { $curDefault = $true }
  }
  if (-not $profilePath -and $curDefault -and $curPath) { $profilePath = $curPath; $isRelative = $curRelative }
}

if (-not $profilePath) { Fail "Could not find default profile in profiles.ini." }

$ProfileDir = if ($isRelative) {
  Join-Path "$env:APPDATA\zen" $profilePath
} else { $profilePath }

if (-not (Test-Path $ProfileDir)) { Fail "Profile directory not found: $ProfileDir" }
Success "Found profile: $ProfileDir"

# ── 3. Check / install fx-autoconfig ─────────────────────────

$ConfigJs = Join-Path $ZenResources "config.js"

if (Test-Path $ConfigJs) {
  Success "fx-autoconfig already installed, skipping."
} else {
  Info "Installing fx-autoconfig..."

  $TmpDir = Join-Path $env:TEMP "fx-autoconfig-install"
  New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

  $ZipPath = Join-Path $TmpDir "fx-autoconfig.zip"
  Invoke-WebRequest -Uri "https://github.com/MrOtherGuy/fx-autoconfig/archive/refs/heads/master.zip" `
    -OutFile $ZipPath
  Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force

  $FxSrc = Join-Path $TmpDir "fx-autoconfig-master"
  Copy-Item "$FxSrc\program\config.js" $ConfigJs

  $PrefsDir = Join-Path $ZenResources "defaults\pref"
  New-Item -ItemType Directory -Force -Path $PrefsDir | Out-Null
  Copy-Item "$FxSrc\program\defaults\pref\config-prefs.js" "$PrefsDir\config-prefs.js"

  $UtilsDest = Join-Path $ProfileDir "chrome\utils"
  New-Item -ItemType Directory -Force -Path $UtilsDest | Out-Null
  Copy-Item "$FxSrc\profile\chrome\utils\*" $UtilsDest -Recurse -Force

  Remove-Item $TmpDir -Recurse -Force
  Success "fx-autoconfig installed."
}

# ── 4. Copy userscript ───────────────────────────────────────

$JsDir = Join-Path $ProfileDir "chrome\JS"
New-Item -ItemType Directory -Force -Path $JsDir | Out-Null
Copy-Item "$ScriptDir\zen-dev-url-detector.uc.js" $JsDir -Force
Success "Copied userscript to $JsDir"

# ── 5. Append CSS (idempotent) ───────────────────────────────

$ChromeCss = Join-Path $ProfileDir "chrome\userChrome.css"
$Marker = "/* zen-dev-url */"

$alreadyInstalled = (Test-Path $ChromeCss) -and (Get-Content $ChromeCss -Raw) -match [regex]::Escape($Marker)

if ($alreadyInstalled) {
  Warn "zen-dev-url styles already present in userChrome.css, skipping append."
} else {
  $cssContent = "`n$Marker`n" + (Get-Content "$ScriptDir\zen-dev-url.css" -Raw)
  Add-Content -Path $ChromeCss -Value $cssContent -Encoding UTF8
  Success "Appended styles to $ChromeCss"
}

# ── 6. Remind about about:config ─────────────────────────────

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
Success "Installation complete!"
