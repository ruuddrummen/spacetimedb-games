#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing SpacetimeDB CLI..."
curl -sSf https://install.spacetimedb.com | sh -s -- --yes

# Persist ~/.local/bin in shell configs so interactive terminals see the binary
PROFILE_LINE='export PATH="$HOME/.local/bin:$PATH"'
for file in "$HOME/.bashrc" "$HOME/.profile"; do
    grep -qxF "$PROFILE_LINE" "$file" 2>/dev/null || echo "$PROFILE_LINE" >> "$file"
done

# Make spacetime available for the remainder of this script
export PATH="$HOME/.local/bin:$PATH"

echo "==> SpacetimeDB CLI installed: $(spacetime --version)"

echo "==> Configuring default SpacetimeDB server to localhost:3000..."
# Register a named server entry so CLI commands target the in-container process
spacetime server add "http://localhost:3000" local --no-fingerprint 2>/dev/null \
    || echo "  (server entry already exists or add syntax differs — skipping)"
spacetime server set-default local 2>/dev/null \
    || echo "  (set-default failed — run 'spacetime server set-default local' manually if needed)"

# Re-attach / rebuild scenario: restore npm deps if the project is already bootstrapped
if [ -f "client/package.json" ]; then
    echo "==> Found existing client project — running npm install..."
    (cd client && npm install)
fi

echo ""
echo "==> Done. See SETUP.md for next steps."
