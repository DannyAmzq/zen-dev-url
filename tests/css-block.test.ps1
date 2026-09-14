$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/css-block.ps1')
$legacy = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../scripts/legacy-devbar-v1.1.0.css'))
$checks = 0
function Assert-Same($Actual, $Expected, $Label) {
  if ($Actual -cne $Expected) { throw "Failed: $Label" }
  $script:checks++
}
function Assert-Rejects($Content) {
  $rejected = $false
  try { Remove-DevbarCssBlock -Content $Content -LegacyCss $legacy | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw 'Expected ambiguous CSS to be rejected' }
  $script:checks++
}
$before = "/* personal theme */`r`n#sidebar { color: cyan; }`r`n"
$after = "`r`n/* keep after mod */`r`n#urlbar { width: 40px; }`r`n`r`n"
Assert-Same (Remove-DevbarCssBlock -Content ($before + $after) -LegacyCss $legacy) ($before + $after) 'unrelated stylesheet retained byte-for-byte'
Assert-Same (Remove-DevbarCssBlock -Content ($before + '/* devbar:begin */.mod{}/* devbar:end */' + $after) -LegacyCss $legacy) ($before + $after) 'bounded block preserves prefix and trailing rules'
foreach ($marker in @('/* devbar */', '/* zen-dev-url */')) {
  foreach ($markerNL in @("`n", "`r`n")) {
    foreach ($bodyNL in @("`n", "`r`n")) {
      $body = $legacy.Replace("`r`n", "`n").TrimEnd("`r", "`n").Replace("`n", $bodyNL)
      Assert-Same (Remove-DevbarCssBlock -Content ($before + $marker + $markerNL + $body + $after) -LegacyCss $legacy) ($before + $after) 'legacy exact match preserves trailing rules, including mixed line endings'
    }
  }
}
foreach ($bad in @('/* devbar */ changed custom body', '/* zen-dev-url */ unknown body', '/* devbar:begin */ missing end', '/* devbar:end */', '/* devbar:end *//* devbar:begin */', '/* devbar:begin *//* devbar:end *//* devbar:begin *//* devbar:end */')) { Assert-Rejects $bad }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('devbar-css-test-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
$css = Join-Path $fixture 'userChrome.css'
try {
  [IO.File]::WriteAllText($css, $before, [Text.UTF8Encoding]::new($false))
  Write-DevbarCss -Path $css -Content $after
  Assert-Same ([IO.File]::ReadAllText($css)) $after 'writes requested content'
  $backups = @(Get-ChildItem -LiteralPath $fixture -Filter '*.devbar-backup-*')
  Assert-Same $backups.Count 1 'creates a backup'
  Assert-Same ([IO.File]::ReadAllText($backups[0].FullName)) $before 'backup preserves original bytes'
} finally {
  # Only this test's known files; no recursive removal or profile access.
  Get-ChildItem -LiteralPath $fixture -File | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
  Remove-Item -LiteralPath $fixture
}
Write-Host "$checks CSS preservation assertions passed. No browser profiles accessed."
