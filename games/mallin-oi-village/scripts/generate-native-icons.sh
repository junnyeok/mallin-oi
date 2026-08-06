#!/bin/sh

set -eu

PROJECT_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE=${1:-"$PROJECT_ROOT/assets/app-icon/mallodat-special-city-source.png"}

if [ ! -f "$SOURCE" ]; then
  printf 'App icon source not found: %s\n' "$SOURCE" >&2
  exit 1
fi

resize_icon() {
  size=$1
  output=$2
  /usr/bin/sips -z "$size" "$size" "$SOURCE" --out "$output" >/dev/null
}

resize_icon 1024 "$PROJECT_ROOT/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

resize_icon 48 "$PROJECT_ROOT/android/app/src/main/res/mipmap-mdpi/ic_launcher.png"
resize_icon 72 "$PROJECT_ROOT/android/app/src/main/res/mipmap-hdpi/ic_launcher.png"
resize_icon 96 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png"
resize_icon 144 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png"
resize_icon 192 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"

resize_icon 48 "$PROJECT_ROOT/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png"
resize_icon 72 "$PROJECT_ROOT/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png"
resize_icon 96 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png"
resize_icon 144 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png"
resize_icon 192 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png"

resize_icon 108 "$PROJECT_ROOT/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png"
resize_icon 162 "$PROJECT_ROOT/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png"
resize_icon 216 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png"
resize_icon 324 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png"
resize_icon 432 "$PROJECT_ROOT/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png"

printf 'Native app icons generated from %s\n' "$SOURCE"
