# Run read-only installer modes against an isolated fake installation/profile.
$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('devbar-cli-test-' + [Guid]::NewGuid().ToString('N'))
$local = Join-Path $fixture 'local'
$fakeZen = Join-Path $local 'zen'
$profile = Join-Path $fixture 'selected profile'
$installer = (Resolve-Path (Join-Path $PSScriptRoot '../install.ps1')).Path
$shell = (Get-Process -Id $PID).Path
$oldLocal = $env:LOCALAPPDATA
$oldApp = $env:APPDATA
$oldProgram = $env:PROGRAMFILES
$oldX86 = ${env:PROGRAMFILES(x86)}
try {
  [IO.Directory]::CreateDirectory($fakeZen) | Out-Null
  [IO.Directory]::CreateDirectory($profile) | Out-Null
  [IO.File]::WriteAllText((Join-Path $fakeZen 'zen.exe'), '')
  $env:LOCALAPPDATA = $local
  $env:APPDATA = Join-Path $fixture 'no-profiles-ini'
  $env:PROGRAMFILES = Join-Path $fixture 'no-program-files'
  ${env:PROGRAMFILES(x86)} = Join-Path $fixture 'no-program-files-x86'
  $output = & $shell -NoProfile -File $installer -DryRun -ProfilePath $profile 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or -not $output.Contains($profile) -or -not $output.Contains('No changes were made')) { throw "DryRun failed: $output" }
  if (@(Get-ChildItem -LiteralPath $profile -Force).Count -ne 0) { throw 'DryRun modified the profile' }
  $output = & $shell -NoProfile -File $installer -Verify -ProfilePath $profile 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0 -or -not $output.Contains('checks failed')) { throw "Verify must report an incomplete install: $output" }
  $output = & $shell -NoProfile -File $installer -DryRun -Uninstall -ProfilePath $profile 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0 -or -not $output.Contains('Choose only one')) { throw 'Conflicting modes must reject before any mutation' }
  if (@(Get-ChildItem -LiteralPath $profile -Force).Count -ne 0) { throw 'Read-only modes modified profile' }
  Write-Host 'Installer CLI: selected-profile dry run, negative verification, and conflicting-mode rejection passed. No real profiles accessed.'
} finally {
  $env:LOCALAPPDATA = $oldLocal
  $env:APPDATA = $oldApp
  $env:PROGRAMFILES = $oldProgram
  ${env:PROGRAMFILES(x86)} = $oldX86
  # Known fixture-only paths, removed non-recursively.
  Remove-Item -LiteralPath (Join-Path $fakeZen 'zen.exe') -ErrorAction SilentlyContinue
  foreach ($dir in @($fakeZen, $local, $profile, $fixture)) { Remove-Item -LiteralPath $dir -ErrorAction SilentlyContinue }
}
