#!/bin/bash
# Run after every `npx expo export --platform web`

python3 << 'PYEOF'
import glob, sys

# ── 1. Patch index.html ───────────────────────────────────────────────────
html = open('dist/index.html').read()

# Replace overflow:hidden in the HTML shell
html = html.replace('overflow: hidden', 'overflow: auto')

# Inject mobile-scroll CSS into <head>
mobile_css = """<style id="runit-mobile-fix">
/* Allow native touch-scroll on iOS/Android inside RNW ScrollViews */
div[style*="overflow: scroll"],
div[style*="overflow-y: scroll"],
div[style*="overflow:scroll"],
div[style*="overflow-y:scroll"] {
  -webkit-overflow-scrolling: touch !important;
  touch-action: pan-y !important;
}
/* Ensure the body/root don't accidentally block scroll */
html, body { overflow: auto !important; }
</style>"""
html = html.replace('</head>', mobile_css + '\n</head>', 1)

open('dist/index.html', 'w').write(html)
print('✓ dist/index.html patched')

# ── 2. Patch JS bundle ────────────────────────────────────────────────────
bundles = glob.glob('dist/_expo/static/js/web/index-*.js')
if not bundles:
    print('⚠  No JS bundle found — skipping bundle patch')
    sys.exit(0)

bundle_path = bundles[0]
js = open(bundle_path).read()

# React Navigation screen wrapper: overflow:hidden → overflow:visible
# This is the container that wraps each navigator screen and blocks mobile scroll
js = js.replace(
    "main:{flex:1,zIndex:0,overflow:'hidden'}",
    "main:{flex:1,zIndex:0,overflow:'visible'}"
)

# React Navigation card container during transitions
js = js.replace(
    "containerStyle:{overflow:'hidden',transform:",
    "containerStyle:{overflow:'visible',transform:"
)

open(bundle_path, 'w').write(js)
print('✓ JS bundle patched  (React Navigation overflow: hidden → visible)')
PYEOF
