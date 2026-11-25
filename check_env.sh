#!/usr/bin/env bash
# kl-air-watch: is this machine ready? Says how to fix anything missing.
set -uo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ok=0
pass() { printf '  ok      %s\n' "$1"; }
fail() { printf '  MISSING %s\n          fix: %s\n' "$1" "$2"; ok=1; }
note() { printf '  note    %s\n          %s\n' "$1" "$2"; }

echo "update, site and unit tests:"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]; then pass "node $(node -v)"; else fail "Node 22 or newer" "install Node 22+ (for example: nvm install 22)"; fi
if command -v python3 >/dev/null; then pass "python3 (the feed tests parse the RSS with it)"; else fail "python3" "install Python 3 (sudo apt install python3)"; fi
if (cd "$R" && node scripts/airwatch.mjs check >/dev/null 2>&1); then pass "committed history and alert log are valid"; else fail "committed data" "run: node scripts/airwatch.mjs check   (it names the broken file)"; fi

echo "browser test and screenshots (optional):"
if [ -d "$R/node_modules/playwright-core" ]; then pass "playwright-core"; else note "playwright-core not installed" "cd $R && npm ci"; fi
chrome=""
for c in "${AIRWATCH_CHROME:-}" /usr/bin/google-chrome /usr/bin/google-chrome-stable /usr/bin/chromium /usr/bin/chromium-browser; do [ -n "$c" ] && [ -x "$c" ] && chrome="$c" && break; done
if [ -n "$chrome" ]; then pass "Chrome: $chrome"; else note "no Chrome found" "install Google Chrome, or set AIRWATCH_CHROME to a Chromium binary"; fi

echo "deploying by hand (optional; see README, Deploy your own):"
if command -v npx >/dev/null; then pass "npx (for: npx wrangler pages deploy dist --project-name <your-project>)"; else note "no npx" "install npm to deploy by hand"; fi

[ $ok -eq 0 ] && echo "ready." || echo "fix the MISSING lines above."
exit $ok
