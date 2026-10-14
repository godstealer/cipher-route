#!/bin/sh
set -eu
case "${1:-both}" in both|chrome|edge|chromium) ;; *) echo 'Usage: sh install.sh [both|chrome|edge|chromium]' >&2; exit 1 ;; esac
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$package_dir/cipher-route-host" --install "${1:-both}"
