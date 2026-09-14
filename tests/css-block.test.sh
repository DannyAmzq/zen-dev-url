#!/usr/bin/env bash
set -e
TEST_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$TEST_ROOT/scripts/css-block.sh"
legacy=$(cat "$TEST_ROOT/scripts/legacy-devbar-v1.1.0.css"; printf '.')
legacy="${legacy%.}"
before=$'/* personal */\r\n#sidebar { color: cyan; }\r\n'
after=$'\r\n/* retain after */\r\n#urlbar { width: 40px; }\r\n\r\n'
checks=0
assert_same() { [[ "$1" == "$2" ]] || { echo "Failed: $3" >&2; exit 1; }; checks=$((checks + 1)); }
devbar_strip_css "$before$after" "$legacy"
assert_same "$DEVBAR_CSS_RESULT" "$before$after" 'unrelated stylesheet'
devbar_strip_css "$before/* devbar:begin */.mod{}/* devbar:end */$after" "$legacy"
assert_same "$DEVBAR_CSS_RESULT" "$before$after" 'bounded block with trailing personal rules'
normalized="${legacy//$'\r\n'/$'\n'}"
while [[ "$normalized" == *$'\n' || "$normalized" == *$'\r' ]]; do normalized="${normalized%?}"; done
for marker in '/* devbar */' '/* zen-dev-url */'; do
  for marker_nl in $'\n' $'\r\n'; do
    for body_nl in $'\n' $'\r\n'; do
      body="${normalized//$'\n'/$body_nl}"
      devbar_strip_css "$before$marker$marker_nl$body$after" "$legacy"
      assert_same "$DEVBAR_CSS_RESULT" "$before$after" 'legacy exact match preserves trailing rules and line endings'
    done
  done
done
for bad in '/* devbar */ changed' '/* zen-dev-url */ unknown' '/* devbar:begin */' '/* devbar:end */' '/* devbar:end *//* devbar:begin */' '/* devbar:begin *//* devbar:end *//* devbar:begin *//* devbar:end */'; do
  if devbar_strip_css "$bad" "$legacy" 2>/dev/null; then echo 'Expected ambiguous CSS rejection' >&2; exit 1; fi
  checks=$((checks + 1))
done
fixture=$(mktemp -d "${TMPDIR:-/tmp}/devbar-css-test.XXXXXX")
css="$fixture/userChrome.css"
printf '%s' "$before" > "$css"
devbar_write_css "$css" "$after"
saved=$(cat "$css"; printf '.')
assert_same "${saved%.}" "$after" 'writes requested content'
backups=("$fixture"/userChrome.css.devbar-backup.*)
assert_same "${#backups[@]}" 1 'creates a backup'
saved=$(cat "${backups[0]}"; printf '.')
assert_same "${saved%.}" "$before" 'backup contains unchanged source'
# Remove only known fixture files; no recursive removal or profile access.
rm -- "$css" "${backups[0]}"
rmdir -- "$fixture"
printf '%s CSS preservation assertions passed. No browser profiles accessed.\n' "$checks"
