# Shared installer functions. Dot-sourcing this file never touches a profile.
function Remove-DevbarCssBlock {
  param([AllowEmptyString()][string]$Content, [string]$LegacyCss)
  $begin = '/* devbar:begin */'
  $end = '/* devbar:end */'
  $starts = [regex]::Matches($Content, [regex]::Escape($begin))
  $ends = [regex]::Matches($Content, [regex]::Escape($end))
  if ($starts.Count -ne $ends.Count -or $starts.Count -gt 1) {
    throw 'Ambiguous devbar CSS markers. No CSS changed; remove only the old mod block manually and retry.'
  }
  if ($starts.Count -eq 1) {
    if ($ends[0].Index -lt $starts[0].Index) { throw 'Reversed devbar CSS markers. No CSS changed.' }
    $Content = $Content.Remove($starts[0].Index, $ends[0].Index + $end.Length - $starts[0].Index)
  }
  foreach ($marker in @('/* devbar */', '/* zen-dev-url */')) {
    $index = $Content.IndexOf($marker, [StringComparison]::Ordinal)
    if ($index -lt 0) { continue }
    $matched = $false
    $normalized = $LegacyCss.Replace("`r`n", "`n").TrimEnd("`r", "`n")
    foreach ($newline in @("`r`n", "`n")) {
      foreach ($bodyNewline in @("`r`n", "`n")) {
        $candidate = $marker + $newline + $normalized.Replace("`n", $bodyNewline)
        if ($Content.Substring($index).StartsWith($candidate, [StringComparison]::Ordinal)) {
          $Content = $Content.Remove($index, $candidate.Length)
          $matched = $true
          break
        }
      }
      if ($matched) { break }
    }
    if (-not $matched -or $Content.Contains($marker)) {
      throw 'Unbounded legacy devbar CSS differs from the known v1.1.0 block. No CSS changed; back up userChrome.css, remove only the old mod styles manually, and retry.'
    }
  }
  return $Content
}

function Write-DevbarCss {
  param([string]$Path, [AllowEmptyString()][string]$Content)
  if (Test-Path -LiteralPath $Path) {
    $backup = "$Path.devbar-backup-$([Guid]::NewGuid().ToString('N'))"
    Copy-Item -LiteralPath $Path -Destination $backup
  }
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}
