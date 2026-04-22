#!/usr/bin/env bash
# P3-100: Lint rule — forbid legacy hex palette values in client/src.
#
# Legacy values:
#   #00d4ff / rgba(0,212,255,...) → use token-cyan (--token-cyan / #00F0FF)
#   #7c3aed / rgba(124,58,237,...) → use token-violet (--token-violet / #6B5BFF)
#
# Usage:
#   bash scripts/lint-no-legacy-hex.sh
#   # exits 0 if clean, 1 if violations found
#
# Add to CI:
#   - run: bash scripts/lint-no-legacy-hex.sh

set -euo pipefail

SEARCH_DIR="client/src"
EXIT_CODE=0

echo "Checking for legacy hex palette values in $SEARCH_DIR..."

# Check for #00d4ff (hex literal)
if grep -rn --include='*.ts' --include='*.tsx' --include='*.css' --include='*.scss' -i '#00d4ff' "$SEARCH_DIR" 2>/dev/null; then
  echo "ERROR: Found #00d4ff — use var(--token-cyan) or token-cyan Tailwind class instead."
  EXIT_CODE=1
fi

# Check for rgba(0,212,255,...) — the RGB equivalent of #00d4ff
if grep -rn --include='*.ts' --include='*.tsx' --include='*.css' --include='*.scss' '0,212,255' "$SEARCH_DIR" 2>/dev/null; then
  echo "ERROR: Found rgba(0,212,255,...) — use rgba(0,240,255,...) (token-cyan) instead."
  EXIT_CODE=1
fi

# Check for #7c3aed (hex literal)
if grep -rn --include='*.ts' --include='*.tsx' --include='*.css' --include='*.scss' -i '#7c3aed' "$SEARCH_DIR" 2>/dev/null; then
  echo "ERROR: Found #7c3aed — use var(--token-violet) or token-violet Tailwind class instead."
  EXIT_CODE=1
fi

# Check for rgba(124,58,237,...) — the RGB equivalent of #7c3aed
if grep -rn --include='*.ts' --include='*.tsx' --include='*.css' --include='*.scss' '124,58,237' "$SEARCH_DIR" 2>/dev/null; then
  echo "ERROR: Found rgba(124,58,237,...) — use rgba(107,91,255,...) (token-violet) instead."
  EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ No legacy hex palette values found. Clean."
else
  echo ""
  echo "FAILED: Legacy hex values detected. Replace with token equivalents."
  echo "  #00d4ff / rgba(0,212,255,...) → --token-cyan / #00F0FF / rgba(0,240,255,...)"
  echo "  #7c3aed / rgba(124,58,237,...) → --token-violet / #6B5BFF / rgba(107,91,255,...)"
fi

exit $EXIT_CODE
