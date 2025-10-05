#!/bin/bash

set -euo pipefail

# --- Functions ---
error() {
  echo "❌ Error: $1" >&2
  exit 1
}

prompt() {
  local var_name=$1
  local prompt_text=$2
  local default_value=$3
  read -rp "$prompt_text [$default_value]: " input
  eval "$var_name=\"\${input:-$default_value}\""
}

# --- Check prerequisites ---
command -v gh >/dev/null || error "GitHub CLI (gh) is not installed"
command -v git >/dev/null || error "Git is not installed"

# --- Get submodule repo ---
prompt SUBMODULE_REPO "Enter submodule repo (format: owner/repo)" "avelino/awesome-go"

SUBMODULE_OWNER=$(cut -d'/' -f1 <<< "$SUBMODULE_REPO")
SUBMODULE_NAME=$(cut -d'/' -f2 <<< "$SUBMODULE_REPO")
ENHANSOME_REPO="${SUBMODULE_NAME//awesome/enhansome}"

# --- Get GitHub authenticated username ---
AUTH_USER=$(gh api user --jq .login) || error "Failed to get authenticated GitHub username"
DEFAULT_REPO_NAME="${AUTH_USER}/${ENHANSOME_REPO}"

prompt REPO_NAME "Enter name for new GitHub repo" "$DEFAULT_REPO_NAME"
prompt DEST_DIR "Enter destination directory to clone into" "$HOME/git/${REPO_NAME##*/}"

# --- Create GitHub repo ---
echo "🚀 Creating GitHub repo: $REPO_NAME..."
gh repo create "$REPO_NAME" --public || error "Failed to create GitHub repo"

# --- Get canonical repo URL ---
REPO_URL=$(gh repo view "$REPO_NAME" --json url -q .url) || error "Failed to get repo URL"

# --- Clone repo ---
echo "📦 Cloning $REPO_URL into $DEST_DIR..."
git clone "$REPO_URL" "$DEST_DIR" || error "Failed to clone repo"
cd "$DEST_DIR" || error "Cannot cd into $DEST_DIR"

# --- Create workflow directory ---
echo "🛠️  Creating GitHub Actions workflow..."
mkdir -p .github/workflows

cat > .github/workflows/main.yml <<'EOF'
name: Enhance Awesome List

on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  enhance_and_commit:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          submodules: 'true'

      - name: Run Awesome List Enhancer and Commit
        uses: v1nvn/enhansome@v1
        id: enhansome
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}

      - name: Enhancement Complete
        if: success()
        run: echo "✅ Awesome list enhancement complete."
EOF

# --- Add submodule ---
echo "📁 Adding submodule $SUBMODULE_REPO under ./origin..."
git submodule add "https://github.com/$SUBMODULE_REPO.git" origin || error "Failed to add submodule"

# --- Initial commit & push ---
echo "📤 Committing and pushing changes..."
git add .
git commit -m "chore: 🎉 Initial setup with Enhansome workflow and submodule"
git push origin main || error "Failed to push changes"

echo -e "\n✅ Done! Repo created at: $REPO_URL"