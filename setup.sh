#!/bin/bash

set -euo pipefail

# ============================================================================
# Enhansome Setup Script
# ============================================================================
# Production-ready script to set up an Enhansome-enhanced repository
# Version: 1.0.0
#
# Usage:
#   ./setup.sh                    # Interactive mode
#   DRY_RUN=true ./setup.sh      # Dry-run mode (shows what would be done)
#   VERBOSE=true ./setup.sh      # Verbose mode (shows debug output)
#   CLEANUP_ON_ERROR=false ./setup.sh  # Disable automatic cleanup on error
#
# Environment Variables:
#   DRY_RUN          - If "true", shows actions without executing (default: false)
#   VERBOSE          - If "true", shows debug output (default: false)
#   CLEANUP_ON_ERROR - If "true", cleans up on error (default: true)
# ============================================================================

# --- Configuration ---
# shellcheck disable=SC2034  # Used for version tracking/debugging
SCRIPT_VERSION="1.0.0"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
CLEANUP_ON_ERROR="${CLEANUP_ON_ERROR:-true}"

# --- State Tracking ---
# These variables track created resources for cleanup
CREATED_REPO=""
CLONED_DIR=""

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log() {
  echo "$1"
}

log_verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    echo "🔍 DEBUG: $1" >&2
  fi
}

error() {
  echo "❌ Error: $1" >&2
  return 1
}

warn() {
  echo "⚠️  Warning: $1" >&2
}

# ============================================================================
# CLEANUP FUNCTIONS
# ============================================================================

cleanup_on_error() {
  if [[ "$CLEANUP_ON_ERROR" != "true" ]]; then
    warn "Cleanup disabled. Manual cleanup may be required."
    return 0
  fi

  log "🧹 Cleaning up after error..."
  local cleanup_errors=0

  if [[ -n "$CLONED_DIR" ]] && [[ -d "$CLONED_DIR" ]]; then
    log_verbose "Removing cloned directory: $CLONED_DIR"
    if rm -rf "$CLONED_DIR"; then
      log "Removed directory: $CLONED_DIR"
    else
      warn "Failed to remove directory: $CLONED_DIR"
      ((cleanup_errors++))
    fi
  fi

  if [[ -n "$CREATED_REPO" ]]; then
    log_verbose "Attempting to delete created repo: $CREATED_REPO"
    if gh repo delete "$CREATED_REPO" --yes 2>/dev/null; then
      log "Deleted repository: $CREATED_REPO"
    else
      warn "Could not delete repository: $CREATED_REPO (may need manual cleanup)"
      ((cleanup_errors++))
    fi
  fi

  if [[ $cleanup_errors -eq 0 ]]; then
    log "✅ Cleanup completed successfully"
    return 0
  else
    warn "Cleanup completed with $cleanup_errors errors"
    return 1
  fi
}

execute() {
  local description=$1
  shift

  if [[ "$DRY_RUN" == "true" ]]; then
    log "🔍 DRY RUN: Would execute: $description"
    log_verbose "  Command: $*"
    return 0
  else
    log_verbose "Executing: $*"
    "$@"
  fi
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

validate_repo_format() {
  local repo=$1

  if [[ -z "$repo" ]]; then
    error "Repository cannot be empty"
    return 1
  fi

  if [[ ! "$repo" =~ ^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$ ]]; then
    error "Invalid repository format: '$repo'. Expected format: owner/repo"
    return 1
  fi

  return 0
}

validate_path() {
  local path=$1

  if [[ -z "$path" ]]; then
    error "Path cannot be empty"
    return 1
  fi

  # Prevent path traversal attacks
  if [[ "$path" =~ \.\./\.\. ]]; then
    error "Path traversal detected in: '$path'"
    return 1
  fi

  # Prevent absolute paths outside HOME (for safety)
  if [[ "$path" =~ ^/ && ! "$path" =~ ^"$HOME" && ! "$path" =~ ^/tmp ]]; then
    error "Absolute path must be within HOME or /tmp: '$path'"
    return 1
  fi

  # Convert to absolute path
  if [[ ! "$path" =~ ^/ ]]; then
    path="$PWD/$path"
  fi

  echo "$path"
  return 0
}

sanitize_input() {
  local input=$1
  # Remove null bytes, carriage returns, and newlines
  printf '%s' "$input" | tr -d '\n\r\000'
}

is_directory_nonempty() {
  local dir=$1

  if [[ ! -d "$dir" ]]; then
    return 1
  fi

  if [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
    return 1
  fi

  return 0
}

extract_repo_owner() {
  local repo=$1
  cut -d'/' -f1 <<< "$repo"
}

extract_repo_name() {
  local repo=$1
  cut -d'/' -f2 <<< "$repo"
}

transform_to_enhansome_name() {
  local name=$1
  echo "${name//awesome/enhansome}"
}

is_gh_authenticated() {
  gh auth status >/dev/null 2>&1
}

get_gh_username() {
  local username
  username=$(gh api user --jq .login 2>/dev/null)
  if [[ -z "$username" ]]; then
    error "Failed to get authenticated GitHub username"
    return 1
  fi
  echo "$username"
}

gh_repo_exists() {
  local repo=$1
  gh repo view "$repo" >/dev/null 2>&1
}

check_prerequisites() {
  local missing=()

  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required commands: ${missing[*]}"
    return 1
  fi

  return 0
}

# ============================================================================
# USER INTERACTION FUNCTIONS
# ============================================================================

prompt() {
  local var_name=$1
  local prompt_text=$2
  local default_value=$3
  local validator=${4:-}

  while true; do
    read -rp "$prompt_text [$default_value]: " input
    input=$(sanitize_input "${input:-$default_value}")

    # Apply validator if provided
    if [[ -n "$validator" ]] && ! $validator "$input" 2>/dev/null; then
      warn "Invalid input. Please try again."
      continue
    fi

    # Safe assignment without eval
    printf -v "$var_name" '%s' "$input"
    break
  done
}

# ============================================================================
# MAIN SCRIPT LOGIC
# ============================================================================

# If sourced (for testing), don't execute main logic
# BASH_SOURCE may not be set when script is piped to bash -c
if [[ "${BASH_SOURCE[0]:-$0}" == "${0}" ]]; then

  # Set up error trap
  trap 'cleanup_on_error' ERR

  # Check prerequisites
  check_prerequisites gh git || exit 1

  # Get submodule repo
  prompt SUBMODULE_REPO "Enter submodule repo (format: owner/repo)" "avelino/awesome-go" "validate_repo_format"

  SUBMODULE_NAME=$(extract_repo_name "$SUBMODULE_REPO")
  ENHANSOME_REPO=$(transform_to_enhansome_name "$SUBMODULE_NAME")

  # Get GitHub authenticated username
  AUTH_USER=$(get_gh_username) || exit 1
  DEFAULT_REPO_NAME="${AUTH_USER}/${ENHANSOME_REPO}"

  prompt REPO_NAME "Enter name for new GitHub repo" "$DEFAULT_REPO_NAME" "validate_repo_format"

  # Validate destination path
  read -rp "Enter destination directory to clone into [$HOME/git/${REPO_NAME##*/}]: " dest_input
  DEST_DIR="${dest_input:-$HOME/git/${REPO_NAME##*/}}"
  DEST_DIR=$(validate_path "$DEST_DIR") || exit 1

  # Check if destination directory already exists and is not empty
  if is_directory_nonempty "$DEST_DIR"; then
    error "Destination directory already exists and is not empty: $DEST_DIR"
    exit 1
  fi

  # Check if repo already exists
  if gh_repo_exists "$REPO_NAME"; then
    error "Repository already exists: $REPO_NAME"
    exit 1
  fi

  # Create GitHub repo
  log "🚀 Creating GitHub repo: $REPO_NAME..."
  execute "Create GitHub repo" gh repo create "$REPO_NAME" --public || exit 1
  CREATED_REPO="$REPO_NAME"

  # Get canonical repo URL
  REPO_URL=$(gh repo view "$REPO_NAME" --json url -q .url) || exit 1

  # Clone repo
  log "📦 Cloning $REPO_URL into $DEST_DIR..."
  execute "Clone repository" git clone "$REPO_URL" "$DEST_DIR" || exit 1
  CLONED_DIR="$DEST_DIR"

  cd "$DEST_DIR" || exit 1

  # Create workflow directory
  log "🛠️  Creating GitHub Actions workflow..."
  execute "Create workflow directory" mkdir -p .github/workflows

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

  # Add submodule
  log "📁 Adding submodule $SUBMODULE_REPO under ./origin..."
  execute "Add submodule" git submodule add "https://github.com/$SUBMODULE_REPO.git" origin || exit 1

  # Prompt for registry discovery
  echo ""
  read -rp "Make this list discoverable to the Enhansome Registry? (Y/n): " MAKE_DISCOVERABLE
  MAKE_DISCOVERABLE="${MAKE_DISCOVERABLE:-Y}"

  if [[ "$MAKE_DISCOVERABLE" =~ ^[Yy]$ ]]; then
    log "🔍 Creating .enhansome.jsonc for registry discovery..."

    cat > .enhansome.jsonc <<'EOF'
{
  // Enable registry indexing for this Enhansome-enhanced repository
  "registryIndexing": true
}
EOF
    log "✅ Created .enhansome.jsonc"
  else
    log "⏭️  Skipping registry discovery."
  fi

  # Initial commit & push
  log "📤 Committing and pushing changes..."
  execute "Git add" git add .
  execute "Git commit" git commit -m "chore: 🎉 Initial setup with Enhansome workflow and submodule"
  execute "Git push" git push origin main || exit 1

  log -e "\n✅ Done! Repo created at: $REPO_URL"

  # Clear cleanup state on success
  CREATED_REPO=""
  CLONED_DIR=""
fi
