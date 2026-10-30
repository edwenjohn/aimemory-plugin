#!/usr/bin/env bash
# Install the aimemory plugin into Codex (CLI, desktop app and IDE extension share ~/.codex).
#
# 1. Copies this repo to ~/.codex/plugins/aimemory
# 2. Adds an "aimemory" entry to ~/.agents/plugins/marketplace.json (merging, never clobbering other entries)
# 3. Prints the remaining manual steps (enable, run setup, trust hooks)
#
# Usage: bash scripts/install-codex.sh
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
codex_home="${CODEX_HOME:-$HOME/.codex}"
plugin_dir="$codex_home/plugins/aimemory"
marketplace_dir="$HOME/.agents/plugins"
marketplace_file="$marketplace_dir/marketplace.json"

echo "Installing aimemory from $repo"

mkdir -p "$plugin_dir"
for item in "$repo"/* "$repo"/.[!.]*; do
  name="$(basename "$item")"
  case "$name" in .git|.superpowers|node_modules|tests) continue ;; esac
  rm -rf "$plugin_dir/$name"
  cp -R "$item" "$plugin_dir/$name"
done
echo "Copied to $plugin_dir"

mkdir -p "$marketplace_dir"
node - "$marketplace_file" "$plugin_dir" <<'EOF'
const fs = require('fs');
const [file, pluginDir] = process.argv.slice(2);
let market = { name: 'personal', plugins: [] };
if (fs.existsSync(file)) {
  try { market = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('Could not parse ' + file + ': ' + e.message); process.exit(1); }
}
market.plugins = (market.plugins || []).filter((p) => p && p.name !== 'aimemory');
market.plugins.push({
  name: 'aimemory',
  source: { source: 'local', path: pluginDir },
  policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
  category: 'Productivity',
});
fs.writeFileSync(file, JSON.stringify(market, null, 2) + '\n');
console.log('Marketplace entry written to ' + file);
EOF

cat <<'EOF'

Next steps in Codex:
  1. Restart Codex (CLI, desktop app or IDE extension).
  2. Open the plugin browser, find "AI Memory" (aimemory) and enable it.
  3. Run its setup (the onboarding skill) and give it your memory folder, e.g. F:\AI Memory Framework.
     Or in any session: $aimemory-path F:\AI Memory Framework
  4. Run /hooks and trust the aimemory hooks; they are skipped until you do.
  5. Check with $aimemory-status.
EOF
