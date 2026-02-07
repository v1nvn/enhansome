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
#   --repo <owner/repo>   Awesome list repo to use as submodule
#   --name <owner/repo>   Target GitHub repo name (default: auto-generated)
#   --dest <path>         Destination directory (default: ~/git/<repo-name>)
#   -f, --file <name>     File to enhance (default: auto-detected README)
#   --no-register         Skip registry registration
#   --dry-run             Show what would be done without executing
#   --verbose             Show debug output
#   --no-cleanup          Disable automatic cleanup on error
#   --help                Show this help message
#
# Examples:
#   ./setup.sh --repo avelino/awesome-go
#   ./setup.sh --repo avelino/awesome-go --name myuser/enhansome-go --dest ~/dev/my-go
#   ./setup.sh --repo avelino/awesome-go --no-register --dry-run
# ============================================================================

# --- Configuration ---
# shellcheck disable=SC2034  # Used for version tracking/debugging
SCRIPT_VERSION="1.0.0"
DRY_RUN="false"
VERBOSE="false"
CLEANUP_ON_ERROR="true"
SUBMODULE_REPO=""
REPO_NAME=""
DEST_DIR=""
FILE_TO_ENHANCE=""
REGISTER_REGISTRY="true"

# --- Caching ---
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/enhansome"
CACHE_TTL=3600  # Cache TTL in seconds (1 hour)
REGISTRY_REPO="v1nvn/enhansome-registry"

# --- Parse Command Line Arguments ---
show_help() {
  cat << EOF
Enhansome Setup Script v${SCRIPT_VERSION}

Production-ready script to set up an Enhansome-enhanced repository.

Usage:
  ./setup.sh [OPTIONS]

Options:
  --repo <owner/repo>   Awesome list repo to use as submodule (required)
  --name <owner/repo>   Target GitHub repo name (default: auto-generated)
  --dest <path>         Destination directory (default: ~/git/<repo-name>)
  -f, --file <name>     File to enhance (default: auto-detected README)
  --no-register         Skip registry registration
  --dry-run             Show what would be done without executing
  --verbose             Show debug output
  --no-cleanup          Disable automatic cleanup on error
  --help                Show this help message

Examples:
  ./setup.sh --repo avelino/awesome-go
  ./setup.sh --repo avelino/awesome-go --name myuser/enhansome-go --dest ~/dev/my-go
  ./setup.sh --repo avelino/awesome-go --no-register --dry-run

EOF
  exit 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        SUBMODULE_REPO="$2"
        shift 2
        ;;
      --name)
        REPO_NAME="$2"
        shift 2
        ;;
      --dest)
        DEST_DIR="$2"
        shift 2
        ;;
      -f|--file)
        FILE_TO_ENHANCE="$2"
        shift 2
        ;;
      --no-register)
        REGISTER_REGISTRY="false"
        shift
        ;;
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
  echo "=> $1"
}

log_verbose() {
  if [[ "${VERBOSE}" == "true" ]]; then
    echo "[DEBUG] $1" >&2
  fi
}

error() {
  echo "Error: $1" >&2
  return 1
}

warn() {
  echo "Warning: $1" >&2
}

# ============================================================================
# CLEANUP FUNCTIONS
# ============================================================================

cleanup_on_error() {
  if [[ "$CLEANUP_ON_ERROR" != "true" ]]; then
    warn "Cleanup disabled. Manual cleanup may be required."
    return 0
  fi

  log "Cleaning up after error"
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
    log_verbose "Deleting created repo: $CREATED_REPO"
    if gh repo delete "$CREATED_REPO" --yes 2>/dev/null; then
      log "Deleted repository: $CREATED_REPO"
    else
      warn "Could not delete repository: $CREATED_REPO (may need manual cleanup)"
      ((cleanup_errors++))
    fi
  fi

  if [[ $cleanup_errors -eq 0 ]]; then
    log "Cleanup completed successfully"
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
    log "[DRY RUN] $description"
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
# CACHING FUNCTIONS
# ============================================================================

init_cache() {
  mkdir -p "$CACHE_DIR"
}

get_cache_path() {
  local cache_key=$1
  echo "$CACHE_DIR/${cache_key}.cache"
}

is_cache_valid() {
  local cache_file=$1
  local now

  if [[ ! -f "$cache_file" ]]; then
    return 1
  fi

  # Check cache age
  if [[ "$(uname)" == "Darwin" ]]; then
    now=$(date +%s)
    local cache_age
    cache_age=$(stat -f %m "$cache_file" 2>/dev/null || echo 0)
    local age_diff=$((now - cache_age))
  else
    local cache_age
    cache_age=$(stat -c %Y "$cache_file" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age_diff=$((now - cache_age))
  fi

  [[ $age_diff -lt $CACHE_TTL ]]
}

# ============================================================================
# REGISTRY CHECK FUNCTIONS (with caching)
# ============================================================================

# Cache the registry repo using git (shallow clone for efficiency)
REGISTRY_CACHE_DIR="${CACHE_DIR}/enhansome-registry"

ensure_registry_cache() {
  local registry_url="https://github.com/${REGISTRY_REPO}"

  # Clone if .git directory is missing (validates it's a git repo)
  if [[ ! -d "$REGISTRY_CACHE_DIR/.git" ]]; then
    log_verbose "Cloning registry repo to $REGISTRY_CACHE_DIR"

    # Clean up any partial/failed clone directory
    rm -rf "$REGISTRY_CACHE_DIR"

    # Clone and clean up on failure
    if ! git clone --depth 1 --single-branch --quiet "$registry_url" "$REGISTRY_CACHE_DIR" 2>/dev/null; then
      rm -rf "$REGISTRY_CACHE_DIR"
      log_verbose "Failed to clone registry repo"
      return 1
    fi

    return 0
  fi

  # Always pull latest changes on startup
  log_verbose "Pulling latest registry changes..."
  git -C "$REGISTRY_CACHE_DIR" pull --quiet 2>/dev/null
  touch "$REGISTRY_CACHE_DIR/.git"  # Update timestamp

  return 0
}

fetch_denylist() {
  local denylist_file="${REGISTRY_CACHE_DIR}/denylist.txt"

  if [[ ! -f "$denylist_file" ]]; then
    log_verbose "Denylist file not found: $denylist_file"
    return 1
  fi

  cat "$denylist_file"
}

fetch_allowlist() {
  local allowlist_file="${REGISTRY_CACHE_DIR}/allowlist.txt"

  if [[ ! -f "$allowlist_file" ]]; then
    log_verbose "Allowlist file not found: $allowlist_file"
    return 1
  fi

  cat "$allowlist_file"
}

is_repo_in_denylist() {
  local awesome_repo=$1
  local denylist
  denylist=$(fetch_denylist)

  if [[ -z "$denylist" ]]; then
    return 1
  fi

  # Check if repo is in denylist (exact match)
  grep -qxF "$awesome_repo" <<< "$denylist" 2>/dev/null
}

is_repo_in_allowlist() {
  local target_repo=$1
  local json_file=$2
  local allowlist_entry="${target_repo}/${json_file}"
  local allowlist
  allowlist=$(fetch_allowlist)

  if [[ -z "$allowlist" ]]; then
    return 1
  fi

  # Check if exact entry exists in allowlist
  grep -qxF "$allowlist_entry" <<< "$allowlist" 2>/dev/null
}

fetch_original_repositories() {
  # Ensure registry cache exists before trying to read from it
  ensure_registry_cache || return 1

  local data_dir="${REGISTRY_CACHE_DIR}/data"

  # Check if data directory exists
  if [[ ! -d "$data_dir" ]]; then
    log_verbose "Registry data directory not found: $data_dir"
    return 1
  fi

  # Extract original_repository from all JSON files
  for json_file in "$data_dir"/*.json; do
    [[ -f "$json_file" ]] || continue
    jq -r '.metadata.original_repository // empty' "$json_file" 2>/dev/null
  done | grep -v '^$' || true
}

is_awesome_repo_already_enhansomed() {
  local awesome_repo=$1
  local original_repos
  original_repos=$(fetch_original_repositories)

  if [[ -z "$original_repos" ]]; then
    return 1
  fi

  # Check if repo is in the list (exact match)
  # Use printf to avoid issues with empty strings
  printf '%s\n' "$original_repos" | grep -qxF "$awesome_repo" 2>/dev/null
}

is_submodule_already_added() {
  local awesome_repo=$1
  local gitmodules_file=".gitmodules"

  if [[ ! -f "$gitmodules_file" ]]; then
    return 1
  fi

  # Check if submodule URL matches the awesome repo
  grep -q "url = https://github.com/${awesome_repo}.git" "$gitmodules_file" 2>/dev/null
}

run_idempotency_checks() {
  local awesome_repo=$1
  local target_repo=$2
  local json_file=$3

  # Only run checks if registry registration is enabled
  if [[ "$REGISTER_REGISTRY" != "true" ]]; then
    log_verbose "Registry registration disabled, skipping idempotency checks"
    return 0
  fi

  init_cache

  # Check 1: Denylist
  if is_repo_in_denylist "$awesome_repo"; then
    error "Repository '$awesome_repo' is in the denylist and cannot be registered"
    log "To bypass, use --no-register (registration will be skipped)"
    return 1
  fi

  # Check 2: Allowlist (already registered?)
  if is_repo_in_allowlist "$target_repo" "$json_file"; then
    log "Already registered: ${target_repo}/${json_file}"
    log "Skipping duplicate registration"
    return 2  # Special exit code to skip registration but continue
  fi

  # Check 3: Submodule already exists (check after cd to dest)
  if is_submodule_already_added "$awesome_repo"; then
    log "Submodule already exists: $awesome_repo"
    log "Skipping duplicate submodule addition"
    return 3  # Special exit code to skip submodule but continue
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
# REGISTRY FUNCTIONS
# ============================================================================

register_with_registry() {
  local repo=$1
  local json_file=$2
  local allowlist_entry="${repo}/${json_file}"
  local branch_name="register/${repo//\//-}"
  local registry_repo="v1nvn/enhansome-registry"

  log "Creating registration PR on enhansome-registry"

  # DRY RUN mode: show what would be done
  if [[ "$DRY_RUN" == "true" ]]; then
    log "[DRY RUN] Would create registration PR for: $allowlist_entry"
    return 0
  fi

  # Check if PR already exists
  local existing_pr
  existing_pr=$(gh pr list --repo "$registry_repo" \
    --head "$branch_name" --state open --json url --jq '.[0].url' 2>/dev/null)

  if [[ -n "$existing_pr" ]]; then
    log "Registration PR already exists: $existing_pr"
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
    log "Forking registry (no direct push access)"
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

  log "Registration PR created: $pr_url"
  log "Merge to complete registration"
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

  # Validate required flags
  if [[ -z "$SUBMODULE_REPO" ]]; then
    error "--repo is required"
    echo "Use --help for usage information"
    exit 1
  fi

  validate_repo_format "$SUBMODULE_REPO" || exit 1

  # Derive repo name from submodule if not provided
  SUBMODULE_NAME=$(extract_repo_name "$SUBMODULE_REPO")
  ENHANSOME_REPO=$(transform_to_enhansome_name "$SUBMODULE_NAME")

  # Get GitHub authenticated username
  if [[ "$DRY_RUN" == "true" ]]; then
    AUTH_USER="dry-run-user"
    log_verbose "Using mock username: $AUTH_USER"
  else
    AUTH_USER=$(get_gh_username) || exit 1
  fi

  # Set default repo name if not provided
  if [[ -z "$REPO_NAME" ]]; then
    REPO_NAME="$AUTH_USER/$ENHANSOME_REPO"
  fi

  validate_repo_format "$REPO_NAME" || exit 1

  # Set default destination if not provided
  if [[ -z "$DEST_DIR" ]]; then
    DEST_DIR="$HOME/git/${REPO_NAME##*/}"
  fi

  DEST_DIR=$(validate_path "$DEST_DIR") || exit 1

  # Check if destination directory already exists and is not empty (skip in dry-run)
  if [[ "$DRY_RUN" != "true" ]] && is_directory_nonempty "$DEST_DIR"; then
    error "Destination directory already exists and is not empty: $DEST_DIR"
    exit 1
  fi

  # Check if repo already exists
  if [[ "$DRY_RUN" != "true" ]] && gh_repo_exists "$REPO_NAME"; then
    error "Repository already exists: $REPO_NAME"
    exit 1
  fi

  # Derive JSON filename for registry (needed for allowlist check)
  JSON_FILE=$(md_to_json_filename "${FILE_TO_ENHANCE:-README.md}")

  # ============================================================================
  # IDEMPOTENCY CHECKS (all done early, before creating resources)
  # ============================================================================
  if [[ "$REGISTER_REGISTRY" == "true" ]]; then
    init_cache
    ensure_registry_cache

    # Check 1: Denylist - fail if awesome repo is blocked
    if is_repo_in_denylist "$SUBMODULE_REPO"; then
      error "Repository '$SUBMODULE_REPO' is in the denylist"
      log "Denylist contains repositories that cannot be auto-registered"
      log "To bypass this check, use --no-register"
      exit 1
    fi

    # Check 2: Allowlist - fail if target repo already registered
    if is_repo_in_allowlist "$REPO_NAME" "$JSON_FILE"; then
      error "Already registered: ${REPO_NAME}/${JSON_FILE}"
      log "This repository is already in the registry allowlist"
      log "To bypass this check, use --no-register"
      exit 1
    fi

    # Check 3: Submodule - skip if awesome repo already has an enhansome repo
    if is_awesome_repo_already_enhansomed "$SUBMODULE_REPO"; then
      error "Already enhansomed: $SUBMODULE_REPO"
      log "An enhansome repo for this awesome list already exists"
      log "To bypass this check, use --no-register"
      exit 1
    fi
  fi

  # Create GitHub repo
  log "Creating GitHub repo: $REPO_NAME"
  execute "Create GitHub repo" gh repo create "$REPO_NAME" --public || exit 1
  CREATED_REPO="$REPO_NAME"

  # Get canonical repo URL
  if [[ "$DRY_RUN" == "true" ]]; then
    REPO_URL="https://github.com/$REPO_NAME"
    log_verbose "Using constructed URL: $REPO_URL"
  else
    REPO_URL=$(gh repo view "$REPO_NAME" --json url -q .url) || exit 1
  fi

  # Clone repo
  log "Cloning $REPO_URL into $DEST_DIR"
  execute "Clone repository" git clone "$REPO_URL" "$DEST_DIR" || exit 1
  CLONED_DIR="$DEST_DIR"

  # Change to cloned directory (skip in dry-run since directory doesn't exist)
  if [[ "$DRY_RUN" == "true" ]]; then
    log_verbose "Would change to directory: $DEST_DIR"
  else
    cd "$DEST_DIR" || exit 1
  fi

  # Add submodule
  log "Adding submodule $SUBMODULE_REPO under ./origin"
  execute "Add submodule" git submodule add "https://github.com/$SUBMODULE_REPO.git" origin || exit 1

  # Detect README file in submodule
  if [[ "$DRY_RUN" == "true" ]]; then
    DETECTED_README="README.md"
    log_verbose "Would detect README in submodule (defaulting to README.md)"
    DEFAULT_FILE="$DETECTED_README"
  else
    DETECTED_README=$(detect_readme_file "origin")
    if [[ -n "$DETECTED_README" ]]; then
      log "Detected: $DETECTED_README"
      DEFAULT_FILE="$DETECTED_README"
    else
      warn "Could not detect README file in submodule"
      DEFAULT_FILE="README.md"
    fi
  fi

  # Set default file to enhance if not provided
  FILE_TO_ENHANCE="${FILE_TO_ENHANCE:-$DEFAULT_FILE}"

  # Validate file exists
  if [[ "$DRY_RUN" != "true" ]] && [[ ! -f "origin/$FILE_TO_ENHANCE" ]]; then
    error "File not found: origin/$FILE_TO_ENHANCE"
    exit 1
  fi

  # Derive JSON filename for registry
  JSON_FILE=$(md_to_json_filename "$FILE_TO_ENHANCE")

  # Create workflow directory
  log "Creating GitHub Actions workflow"
  execute "Create workflow directory" mkdir -p .github/workflows

  if [[ "$DRY_RUN" == "true" ]]; then
    log_verbose "Would create .github/workflows/main.yml"
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
        run: echo "Awesome list enhancement complete."
EOF
  fi

  # Register with registry (unless --no-register is set)
  if [[ "$REGISTER_REGISTRY" == "true" ]]; then
    register_with_registry "$REPO_NAME" "$JSON_FILE"
  else
    log "Skipping registry registration"
    log "Register later at: https://github.com/v1nvn/enhansome-registry"
  fi

  # Initial commit & push
  log "Committing and pushing changes"
  execute "Git add" git add .
  execute "Git commit" git commit -m "chore: Initial setup with Enhansome workflow and submodule"
  execute "Git push" git push origin main || exit 1

  log "Done! Repo created at: $REPO_URL"

  # Clear cleanup state on success
  CREATED_REPO=""
  CLONED_DIR=""
fi
