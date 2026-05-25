#!/bin/bash
# Run after every `npx expo export --platform web`
# Fixes overflow:hidden → overflow:auto so the app scrolls in the Claude preview iframe
sed -i '' 's/overflow: hidden/overflow: auto/g' dist/index.html
echo "✓ dist/index.html patched (overflow: auto)"
