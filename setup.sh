#!/bin/bash

set -euo pipefail

# ============================================================================
# Enhansome Setup Script
# ============================================================================
# Production-ready script to set up an Enhansome-enhanced repository
# Version: 1.0.0
#
# Usage:
#   ./setup.sh [OPTIONS]
#
# Options:
#   --dry-run        Show what would be done without executing
#   --verbose        Show debug output
#   --no-cleanup     Disable automatic cleanup on error
#   --help           Show this help message
#
# Examples:
#   ./setup.sh                    # Interactive mode
#   ./setup.sh --dry-run         # Dry-run mode (shows what would be done)
#   ./setup.sh --verbose         # Verbose mode (shows debug output)
#   ./setup.sh --no-cleanup      # Disable automatic cleanup on error
#   ./setup.sh --dry-run --verbose  # Combine options
# ============================================================================

# --- Configuration ---
# shellcheck disable=SC2034  # Used for version tracking/debugging
SCRIPT_VERSION="1.0.0"
DRY_RUN="false"
VERBOSE="false"
CLEANUP_ON_ERROR="true"

# --- Parse Command Line Arguments ---
show_help() {
  cat << EOF
Enhansome Setup Script v${SCRIPT_VERSION}

Production-ready script to set up an Enhansome-enhanced repository.

Usage:
  ./setup.sh [OPTIONS]

Options:
  --dry-run        Show what would be done without executing
  --verbose        Show debug output
  --no-cleanup     Disable automatic cleanup on error
  --help           Show this help message

Examples:
  ./setup.sh                    # Interactive mode
  ./setup.sh --dry-run         # Dry-run mode
  ./setup.sh --verbose         # Verbose mode
  ./setup.sh --no-cleanup      # Disable automatic cleanup on error
  ./setup.sh --dry-run --verbose  # Combine options

EOF
  exit 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      --verbose)
        VERBOSE="true"
        shift
        ;;
      --no-cleanup)
        CLEANUP_ON_ERROR="false"
        shift
        ;;
      --help|-h)
        show_help
        ;;
      *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
    esac
  done
}

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
  local result="${name/awesome/enhansome}"

  # If result doesn't contain "enhansome", prefix it
  if [[ ! "$result" =~ enhansome ]]; then
    result="enhansome-${result}"
  fi

  echo "$result"
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

# Detect the README file in a directory
# Checks common variations: README.md, readme.md, Readme.md, README.MD
detect_readme_file() {
  local dir=$1
  local candidates=("README.md" "readme.md" "Readme.md" "README.MD" "ReadMe.md")

  for candidate in "${candidates[@]}"; do
    if [[ -f "$dir/$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  # No README found
  return 1
}

# Convert markdown filename to JSON filename
# README.md -> README.json, readme.md -> readme.json
md_to_json_filename() {
  local md_file=$1
  echo "${md_file%.md}.json"
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
# REGISTRY FUNCTIONS
# ============================================================================

register_with_registry() {
  local repo=$1
  local json_file=$2
  local allowlist_entry="${repo}/${json_file}"
  local branch_name="register/${repo//\//-}"
  local registry_repo="v1nvn/enhansome-registry"

  log "📝 Creating registration PR on enhansome-registry..."

  # DRY RUN mode: show what would be done
  if [[ "$DRY_RUN" == "true" ]]; then
    log "🔍 DRY RUN: Would perform the following steps:"
    log "   1. Check for existing PR with head: $branch_name"
    log "   2. Check push permissions for $registry_repo"
    log "   3. Fork $registry_repo if no push access"
    log "   4. Create branch: $branch_name"
    log "   5. Add entry to allowlist.txt: $allowlist_entry"
    log "   6. Create PR with title: [setup.sh] Register: $repo"
    log "✅ DRY RUN: Registration PR would be created"
    return 0
  fi

  # Check if PR already exists
  local existing_pr
  existing_pr=$(gh pr list --repo "$registry_repo" \
    --head "$branch_name" --state open --json url --jq '.[0].url' 2>/dev/null)

  if [[ -n "$existing_pr" ]]; then
    log "✅ Registration PR already exists: $existing_pr"
    return 0
  fi

  # Determine target repo: direct if push access, fork otherwise
  local target_repo head_ref
  local can_push
  can_push=$(gh api "repos/$registry_repo" --jq '.permissions.push' 2>/dev/null)

  if [[ "$can_push" == "true" ]]; then
    target_repo="$registry_repo"
    head_ref="$branch_name"
  else
    log "   Forking registry (no direct push access)..."
    gh repo fork "$registry_repo" --clone=false 2>/dev/null || true
    local fork_owner
    fork_owner=$(gh api user --jq '.login')
    target_repo="${fork_owner}/enhansome-registry"
    head_ref="${fork_owner}:${branch_name}"
  fi

  # Clean up branch from any previous failed attempt
  gh api "repos/$target_repo/git/refs/heads/$branch_name" --method DELETE 2>/dev/null || true

  # Create branch from main
  local main_sha
  main_sha=$(gh api "repos/$target_repo/git/refs/heads/main" --jq '.object.sha')

  gh api "repos/$target_repo/git/refs" \
    --method POST \
    -f ref="refs/heads/$branch_name" \
    -f sha="$main_sha" >/dev/null

  # Get current allowlist.txt content (raw) and SHA
  local file_sha current_content
  file_sha=$(gh api "repos/$target_repo/contents/allowlist.txt" --jq '.sha')
  current_content=$(gh api "repos/$target_repo/contents/allowlist.txt" \
    -H "Accept: application/vnd.github.raw+json")

  # Append entry and base64 encode for the Contents API
  # Ensure proper newline separation regardless of whether current content ends with newline
  local new_content_b64
  if [[ "$current_content" =~ $'\n'$ ]]; then
    # Content already ends with newline, just append entry with trailing newline
    new_content_b64=$(printf '%s%s\n' "$current_content" "$allowlist_entry" | base64)
  else
    # Content doesn't end with newline, add separator before appending
    new_content_b64=$(printf '%s\n%s\n' "$current_content" "$allowlist_entry" | base64)
  fi

  # Update file on branch
  gh api "repos/$target_repo/contents/allowlist.txt" \
    --method PUT \
    -f message="feat(registry): add $repo" \
    -f content="$new_content_b64" \
    -f sha="$file_sha" \
    -f branch="$branch_name" >/dev/null

  # Create PR (always targets the upstream registry repo)
  local pr_url
  pr_url=$(gh pr create --repo "$registry_repo" \
    --head "$head_ref" \
    --title "[setup.sh] Register: $repo" \
    --body "Adds \`$allowlist_entry\` to the registry allowlist.

---
*Automated registration by Enhansome setup.sh v${SCRIPT_VERSION}*")

  log "✅ Registration PR created: $pr_url"
  log "   Merge to complete registration."
}

# ============================================================================
# MAIN SCRIPT LOGIC
# ============================================================================

# If sourced (for testing), don't execute main logic
# BASH_SOURCE may not be set when script is piped to bash -c
if [[ "${BASH_SOURCE[0]:-$0}" == "${0}" ]]; then

  # Parse command line arguments
  parse_args "$@"

  # Set up error trap
  trap 'cleanup_on_error' ERR

  # Check prerequisites
  check_prerequisites gh git || exit 1

  # Get submodule repo
  prompt SUBMODULE_REPO "Enter submodule repo (format: owner/repo)" "avelino/awesome-go" "validate_repo_format"

  SUBMODULE_NAME=$(extract_repo_name "$SUBMODULE_REPO")
  ENHANSOME_REPO=$(transform_to_enhansome_name "$SUBMODULE_NAME")

  # Get GitHub authenticated username
  if [[ "$DRY_RUN" == "true" ]]; then
    AUTH_USER="dry-run-user"
    log_verbose "DRY RUN: Using mock username: $AUTH_USER"
  else
    AUTH_USER=$(get_gh_username) || exit 1
  fi
  DEFAULT_REPO_NAME="$AUTH_USER/$ENHANSOME_REPO"

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
  if [[ "$DRY_RUN" != "true" ]] && gh_repo_exists "$REPO_NAME"; then
    error "Repository already exists: $REPO_NAME"
    exit 1
  fi

  # Create GitHub repo
  log "🚀 Creating GitHub repo: $REPO_NAME..."
  execute "Create GitHub repo" gh repo create "$REPO_NAME" --public || exit 1
  CREATED_REPO="$REPO_NAME"

  # Get canonical repo URL
  if [[ "$DRY_RUN" == "true" ]]; then
    REPO_URL="https://github.com/$REPO_NAME"
    log_verbose "DRY RUN: Using constructed URL: $REPO_URL"
  else
    REPO_URL=$(gh repo view "$REPO_NAME" --json url -q .url) || exit 1
  fi

  # Clone repo
  log "📦 Cloning $REPO_URL into $DEST_DIR..."
  execute "Clone repository" git clone "$REPO_URL" "$DEST_DIR" || exit 1
  CLONED_DIR="$DEST_DIR"

  if [[ "$DRY_RUN" == "true" ]]; then
    # Create temporary directory for dry run so script can continue
    mkdir -p "$DEST_DIR"
    log_verbose "DRY RUN: Created temporary directory: $DEST_DIR"
  fi

  cd "$DEST_DIR" || exit 1

  # Add submodule FIRST (need it to detect README file)
  log "📁 Adding submodule $SUBMODULE_REPO under ./origin..."
  execute "Add submodule" git submodule add "https://github.com/$SUBMODULE_REPO.git" origin || exit 1

  if [[ "$DRY_RUN" == "true" ]]; then
    # Create mock origin directory with README for dry run
    mkdir -p origin
    touch origin/README.md
    log_verbose "DRY RUN: Created mock origin directory with README.md"
  fi

  # Detect README file in submodule
  if [[ "$DRY_RUN" == "true" ]]; then
    DETECTED_README="README.md"
    log "📄 DRY RUN: Would detect README in submodule (defaulting to README.md)"
    DEFAULT_FILE="$DETECTED_README"
  else
    DETECTED_README=$(detect_readme_file "origin")
    if [[ -n "$DETECTED_README" ]]; then
      log "📄 Detected: $DETECTED_README"
      DEFAULT_FILE="$DETECTED_README"
    else
      warn "Could not detect README file in submodule."
      DEFAULT_FILE="README.md"
    fi
  fi

  # Prompt for file to enhance
  read -rp "Enter file to enhance [$DEFAULT_FILE]: " FILE_TO_ENHANCE
  FILE_TO_ENHANCE="${FILE_TO_ENHANCE:-$DEFAULT_FILE}"

  # Validate file exists
  if [[ "$DRY_RUN" != "true" ]] && [[ ! -f "origin/$FILE_TO_ENHANCE" ]]; then
    error "File not found: origin/$FILE_TO_ENHANCE"
    exit 1
  fi

  # Derive JSON filename for registry
  JSON_FILE=$(md_to_json_filename "$FILE_TO_ENHANCE")

  # Create workflow directory
  log "🛠️  Creating GitHub Actions workflow..."
  execute "Create workflow directory" mkdir -p .github/workflows

  if [[ "$DRY_RUN" == "true" ]]; then
    log "🔍 DRY RUN: Would create .github/workflows/main.yml with:"
    log "   - Schedule: daily at 2am UTC"
    log "   - File to enhance: $FILE_TO_ENHANCE"
    log "   - Action: v1nvn/enhansome@v1"
  else
    cat > .github/workflows/main.yml <<EOF
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
          github_token: \${{ secrets.GITHUB_TOKEN }}
          file_to_enhance: '${FILE_TO_ENHANCE}'

      - name: Enhancement Complete
        if: success()
        run: echo "✅ Awesome list enhancement complete."
EOF
  fi

  # Prompt for registry registration
  echo ""
  read -rp "Register this list with the Enhansome Registry? [Y/n]: " REGISTER_REGISTRY
  REGISTER_REGISTRY="${REGISTER_REGISTRY:-Y}"

  if [[ "$REGISTER_REGISTRY" =~ ^[Yy]$ ]]; then
    register_with_registry "$REPO_NAME" "$JSON_FILE"
  else
    log "⏭️  Skipping registry registration."
    log "   You can register later at:"
    log "   https://github.com/v1nvn/enhansome-registry"
  fi

  # Initial commit & push
  log "📤 Committing and pushing changes..."
  execute "Git add" git add .
  execute "Git commit" git commit -m "chore: 🎉 Initial setup with Enhansome workflow and submodule"
  execute "Git push" git push origin main || exit 1

  echo ""
  log "✅ Done! Repo created at: $REPO_URL"

  # Clear cleanup state on success
  CREATED_REPO=""
  CLONED_DIR=""
fi
