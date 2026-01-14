#!/usr/bin/env bash
set -e

BUILD_DIR="site/public"
OUT_DIR="public-dir"

# Ensure build output exists and is not empty
if [ ! -d "$BUILD_DIR" ]; then
  echo "Build output directory does not exist: $BUILD_DIR"
  exit 1
fi

if [ -z "$(ls -A "$BUILD_DIR")" ]; then
  echo "Build output directory is empty: $BUILD_DIR"
  exit 1
fi

# Prepare artifact directory
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Copy built site contents
cp -r "$BUILD_DIR"/. "$OUT_DIR"/

echo "Prepared site artifact in $OUT_DIR"
ls -lh "$OUT_DIR"
