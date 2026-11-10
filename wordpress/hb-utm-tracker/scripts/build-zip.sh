#!/bin/sh
# Build an installable WordPress plugin zip. The zip root is hb-utm-tracker/.
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
stage=$(mktemp -d)
dest=${1:-"$root/../../dist/hb-utm-tracker.zip"}

mkdir -p "$stage/hb-utm-tracker" "$(dirname "$dest")"
cp "$root/hb-utm-tracker.php" "$root/uninstall.php" "$root/readme.txt" "$root/README.md" "$stage/hb-utm-tracker/"
cp -R "$root/includes" "$root/assets" "$root/standalone" "$stage/hb-utm-tracker/"

rm -f "$dest"
(
  cd "$stage"
  zip -r "$dest" hb-utm-tracker -x '*.DS_Store'
)
rm -rf "$stage"
echo "wrote $dest"
