#!/bin/sh
# Regenerate PNG icons from icons/icon.svg (requires ImageMagick).
set -e
cd "$(dirname "$0")/../icons"
for s in 16 32 48 128; do
  magick -background none -density 384 icon.svg -resize "${s}x${s}" "icon-$s.png"
done
