#!/bin/sh
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sh "$package_dir/install.sh"
result=$?
printf "\nPress Return to close.\n"
read -r answer
exit "$result"
