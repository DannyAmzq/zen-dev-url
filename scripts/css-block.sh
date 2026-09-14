#!/usr/bin/env bash
# Source-only installer helpers; importing this file does not touch profiles.
# Result is returned in DEVBAR_CSS_RESULT to retain trailing newlines exactly.
devbar_strip_css() {
  local content="$1" legacy="$2" begin='/* devbar:begin */' end='/* devbar:end */'
  local prefix rest suffix marker candidate newline body_newline normalized matched
  if [[ "$content" == *"$begin"* ]]; then
    prefix="${content%%"$begin"*}"
    rest="${content#*"$begin"}"
    if [[ "$prefix" == *"$end"* || "$rest" != *"$end"* || "$rest" == *"$begin"* ]]; then
      echo 'Ambiguous devbar CSS markers. No CSS changed.' >&2; return 1
    fi
    suffix="${rest#*"$end"}"
    if [[ "$suffix" == *"$end"* ]]; then echo 'Duplicate devbar end marker. No CSS changed.' >&2; return 1; fi
    content="$prefix$suffix"
  elif [[ "$content" == *"$end"* ]]; then
    echo 'Unmatched devbar end marker. No CSS changed.' >&2; return 1
  fi
  normalized="${legacy//$'\r\n'/$'\n'}"
  while [[ "$normalized" == *$'\n' || "$normalized" == *$'\r' ]]; do normalized="${normalized%?}"; done
  for marker in '/* devbar */' '/* zen-dev-url */'; do
    [[ "$content" != *"$marker"* ]] && continue
    prefix="${content%%"$marker"*}"
    rest="${content#*"$marker"}"
    matched=false
    for newline in $'\r\n' $'\n'; do
      for body_newline in $'\r\n' $'\n'; do
        candidate="$newline${normalized//$'\n'/$body_newline}"
        if [[ "$rest" == "$candidate"* ]]; then
          content="$prefix${rest#"$candidate"}"
          matched=true
          break
        fi
      done
      [[ "$matched" == true ]] && break
    done
    if [[ "$matched" != true || "$content" == *"$marker"* ]]; then
      echo 'Unbounded legacy devbar CSS differs from v1.1.0. No CSS changed; back up userChrome.css, remove only the old mod styles manually, and retry.' >&2
      return 1
    fi
  done
  DEVBAR_CSS_RESULT="$content"
}

devbar_write_css() {
  local file="$1" content="$2" backup
  if [[ -f "$file" ]]; then
    backup=$(mktemp "$file.devbar-backup.XXXXXX") || return 1
    cp -p "$file" "$backup" || return 1
  fi
  printf '%s' "$content" > "$file"
}
