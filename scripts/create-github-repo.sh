#!/usr/bin/env bash
# Usage: ./scripts/create-github-repo.sh <owner>/<repo>
# Requires: gh CLI logged-in (https://cli.github.com/)
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <owner>/<repo>"
  exit 1
fi
REPO="$1"
# create private repo and push current directory
gh repo create "$REPO" --private --source . --remote origin --push
echo "Repository created and pushed: https://github.com/$REPO"

echo "Enable GitHub Pages: go to repo Settings → Pages and set branch 'gh-pages' (or allow Actions to publish)."