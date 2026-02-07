#!/bin/bash

set -euo pipefail

# ============================================================================
# Batch Setup Script from Registry
# ============================================================================
# Reads repos from the enhansome-registry database and runs setup.sh
# on all repos that match the specified criteria.
#
# Usage:
#   ./scripts/batch_setup_from_registry.sh [OPTIONS]
#
# Options:
#   --min-links <num>         Minimum number of links required (default: 100)
#   --max-links <num>         Maximum number of links (optional)
#   --dest <path>             Base destination directory (each repo gets a subdirectory)
#   --limit <num>             Stop after N repos are successfully processed (skipped repos don't count)
#   --offset <num>            Skip N repos before processing (default: 0)
#   --updated-after <date>    Only repos updated after this date (ISO 8601 or SQLite format)
#   --updated-before <date>   Only repos updated before this date (ISO 8601 or SQLite format)
#   --dry-run                 Show what would be done without executing
#   --continue-on-error       Continue processing even if setup.sh fails for a repo
#   --no-register             Skip PR creation (pass --no-register to setup.sh)
#   --db <path>               Path to registry database
#   --count-only              Only show count of qualifying repos
#   --help                    Show this help message
# ============================================================================

DB_PATH="../enhansome-registry/dev-scripts/awesome_cache.db"
MIN_LINKS=""
MAX_LINKS=""
DEST_DIR=""
LIMIT=""
OFFSET=0
UPDATED_AFTER=""
UPDATED_BEFORE=""
DRY_RUN="false"
CONTINUE_ON_ERROR="false"
NO_REGISTER="false"
SETUP_SCRIPT="./setup.sh"
COUNT_ONLY="false"

show_help() {
  cat << EOF
Batch Setup Script from Registry

Reads repos from the enhansome-registry database and runs setup.sh
on all repos that match the specified criteria.

Usage:
  $0 [OPTIONS]

Options:
  --min-links <num>         Minimum number of links required (default: 100)
  --max-links <num>         Maximum number of links (optional)
  --dest <path>             Base destination directory (each repo gets subdirectory)
  --limit <num>             Stop after N repos are successfully processed (skipped repos don't count)
  --offset <num>            Skip N repos before processing (default: 0)
  --updated-after <date>    Only repos updated after this date (ISO 8601: YYYY-MM-DD)
  --updated-before <date>   Only repos updated before this date (ISO 8601: YYYY-MM-DD)
  --dry-run                 Show what would be done without executing
  --continue-on-error       Continue processing even if setup.sh fails for a repo
  --no-register             Skip PR creation (pass --no-register to setup.sh)
  --db <path>               Path to registry database (default: ../enhansome-registry/dev-scripts/awesome_cache.db)
  --count-only              Only show count of qualifying repos
  --help                    Show this help message

Examples:
  # Count qualifying repos
  $0 --count-only

  # Preview what would be done (dry run)
  $0 --dry-run

  # Process repos with 200+ links, limit to 10
  $0 --min-links 200 --limit 10

  # Process repos with 100-500 links
  $0 --min-links 100 --max-links 500

  # Process repos updated in 2024
  $0 --updated-after "2024-01-01" --updated-before "2025-01-01"

  # Process repos to a temp directory
  $0 --dest /tmp/enhansome

  # Continue from the 20th repo if previous run failed
  $0 --offset 20

EOF
  exit 0
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --min-links)
        MIN_LINKS="$2"
        shift 2
        ;;
      --max-links)
        MAX_LINKS="$2"
        shift 2
        ;;
      --dest)
        DEST_DIR="$2"
        shift 2
        ;;
      --limit)
        LIMIT="$2"
        shift 2
        ;;
      --offset)
        OFFSET="$2"
        shift 2
        ;;
      --updated-after)
        UPDATED_AFTER="$2"
        shift 2
        ;;
      --updated-before)
        UPDATED_BEFORE="$2"
        shift 2
        ;;
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      --continue-on-error)
        CONTINUE_ON_ERROR="true"
        shift
        ;;
      --no-register)
        NO_REGISTER="true"
        shift
        ;;
      --db)
        DB_PATH="$2"
        shift 2
        ;;
      --count-only)
        COUNT_ONLY="true"
        shift
        ;;
      --help|-h)
        show_help
        ;;
      *)
        echo "Error: Unknown option: $1" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
    esac
  done

  # Set default min-links if not specified
  if [[ -z "$MIN_LINKS" ]]; then
    MIN_LINKS=100
  fi
}

log() {
  echo "=> $1"
}

error() {
  echo "Error: $1" >&2
  return 1
}

check_prerequisites() {
  local missing=()

  if ! command -v sqlite3 >/dev/null 2>&1; then
    missing+=("sqlite3")
  fi

  if ! command -v gh >/dev/null 2>&1; then
    missing+=("gh")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    error "Missing required commands: ${missing[*]}"
    return 1
  fi

  if [[ ! -f "$DB_PATH" ]]; then
    error "Database not found: $DB_PATH"
    return 1
  fi

  if [[ ! -f "$SETUP_SCRIPT" ]]; then
    error "Setup script not found: $SETUP_SCRIPT"
    return 1
  fi

  return 0
}

# Get GitHub authenticated username (matches setup.sh logic)
get_gh_username() {
  local username
  username=$(gh api user --jq .login 2>/dev/null)
  if [[ -z "$username" ]]; then
    error "Failed to get authenticated GitHub username"
    return 1
  fi
  echo "$username"
}

# Check if GitHub repo exists (matches setup.sh logic)
gh_repo_exists() {
  local repo=$1
  gh repo view "$repo" >/dev/null 2>&1
}

# Transform awesome repo name to enhansome name (matches setup.sh logic)
transform_to_enhansome_name() {
  local name=$1
  local result="${name/awesome/enhansome}"

  # If result doesn't contain "enhansome", prefix it
  if [[ ! "$result" =~ enhansome ]]; then
    result="enhansome-${result}"
  fi

  echo "$result"
}

# Get the destination directory for a repo (matches setup.sh logic)
get_repo_dest() {
  local enhansome_name=$1

  if [[ -n "$DEST_DIR" ]]; then
    echo "${DEST_DIR}/${enhansome_name}"
  else
    # Default destination directory (same as setup.sh default)
    # TODO: Make this portable instead of hardcoded
    echo "/Users/vineet/git/${enhansome_name}"
  fi
}

# Get skip reason for a repo (returns empty string if should not skip)
# Outputs the skip reason to stdout
get_skip_reason() {
  local owner=$1
  local name=$2
  local enhansome_name
  enhansome_name=$(transform_to_enhansome_name "$name")

  local repo_dest
  repo_dest=$(get_repo_dest "$enhansome_name")

  # Check local directory
  if [[ -d "$repo_dest" ]]; then
    echo "local directory exists at $repo_dest"
    return
  fi

  # Check GitHub repo
  local full_repo_name="$GH_USERNAME/${enhansome_name}"
  if gh_repo_exists "$full_repo_name"; then
    echo "GitHub repo exists at $full_repo_name"
    return
  fi

  # No skip reason - should process this repo
  echo ""
}

# Build the WHERE clause dynamically based on filters
build_where_clause() {
  local where_parts=()

  # Default: exclude repos with errors (check for both NULL and empty string)
  where_parts+=("(error IS NULL OR error = '')")

  # Min links filter
  if [[ -n "$MIN_LINKS" ]]; then
    where_parts+=("github_links >= $MIN_LINKS")
  fi

  # Max links filter
  if [[ -n "$MAX_LINKS" ]]; then
    where_parts+=("github_links < $MAX_LINKS")
  fi

  # Updated after filter
  if [[ -n "$UPDATED_AFTER" ]]; then
    where_parts+=("last_modified > '$UPDATED_AFTER'")
  fi

  # Updated before filter
  if [[ -n "$UPDATED_BEFORE" ]]; then
    where_parts+=("last_modified < '$UPDATED_BEFORE'")
  fi

  # Join all parts with AND
  local result=""
  local first=true
  for part in "${where_parts[@]}"; do
    if [[ "$first" == "true" ]]; then
      result="$part"
      first=false
    else
      result="$result AND $part"
    fi
  done
  echo "$result"
}

# Query the database and output qualifying repos
# Note: We don't use SQL LIMIT when --limit is specified because we need to
# count only successfully processed repos (not skipped ones)
query_repos() {
  local where_clause
  where_clause=$(build_where_clause)

  local offset_clause=""

  # Only use SQL LIMIT if we don't have a processing limit
  # (i.e., we want to limit the total query, not just processed repos)
  if [[ -z "$LIMIT" ]]; then
    # No processing limit, but we still apply offset
    if [[ $OFFSET -gt 0 ]]; then
      offset_clause="OFFSET $OFFSET"
    fi

    sqlite3 "$DB_PATH" <<EOF
SELECT owner, name, github_links, last_modified
FROM repos
WHERE $where_clause
ORDER BY github_links DESC
$offset_clause;
EOF
  else
    # We have a processing limit - query all repos (with offset) and limit in the loop
    if [[ $OFFSET -gt 0 ]]; then
      offset_clause="OFFSET $OFFSET"
    fi

    sqlite3 "$DB_PATH" <<EOF
SELECT owner, name, github_links, last_modified
FROM repos
WHERE $where_clause
ORDER BY github_links DESC
$offset_clause;
EOF
  fi
}

# Get count of repos matching the criteria
get_matching_count() {
  local where_clause
  where_clause=$(build_where_clause)

  sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM repos WHERE $where_clause;"
}

# Main script execution
parse_args "$@"

log "Checking prerequisites..."
check_prerequisites || exit 1

log "Getting GitHub username..."
GH_USERNAME=$(get_gh_username) || exit 1
log "Authenticated as: $GH_USERNAME"

log "Database: $DB_PATH"

# Build and display filter criteria
where_clause=$(build_where_clause)
log "Filter criteria:"
if [[ -n "$MIN_LINKS" ]]; then
  log "  - github_links >= $MIN_LINKS"
fi
if [[ -n "$MAX_LINKS" ]]; then
  log "  - github_links < $MAX_LINKS"
fi
if [[ -n "$UPDATED_AFTER" ]]; then
  log "  - last_modified > '$UPDATED_AFTER'"
fi
if [[ -n "$UPDATED_BEFORE" ]]; then
  log "  - last_modified < '$UPDATED_BEFORE'"
fi
log "  - error IS NULL"

# Get count of qualifying repos
total_count=$(get_matching_count)
log "Total qualifying repos in database: $total_count"

# Calculate offset impact
remaining_count=$((total_count - OFFSET))
if [[ $remaining_count -le 0 ]]; then
  error "Offset $OFFSET exceeds total count $total_count"
  exit 1
fi

# Apply limit to remaining count
if [[ -n "$LIMIT" ]]; then
  max_processing="$LIMIT"
  log "Target: Successfully process up to $LIMIT repos (skipping existing repos)"
else
  log "Repos to process (after offset $OFFSET): $remaining_count"
fi

# If count-only mode, exit here
if [[ "$COUNT_ONLY" == "true" ]]; then
  exit 0
fi

# Show first few repos that will be processed
log ""
log "Sample repos to be processed:"
query_repos | head -5 | while IFS='|' read -r owner name links last_modified; do
  repo="${owner}/${name}"

  # Check if this repo would be skipped (uses same logic as processing loop)
  skip_reason=$(get_skip_reason "$owner" "$name")

  if [[ -n "$skip_reason" ]]; then
    echo "  - ⊘ SKIP: ${owner}/${name} ($links links, updated: ${last_modified}) - $skip_reason"
  else
    echo "  - ✓ PROCESS: ${owner}/${name} ($links links, updated: ${last_modified})"
  fi
done

if [[ -n "$LIMIT" ]]; then
  log ""
  log "Note: Will successfully process up to $LIMIT repos (skipped repos don't count toward limit)"
  log "Repos that already exist will be skipped and not counted."
fi

if [[ "$DRY_RUN" != "true" ]]; then
  log ""
  log "Press Enter to continue or Ctrl+C to cancel..."
  read -r
fi

log ""

# Build base setup.sh arguments (will add per-repo args in loop)
setup_base_args=()
if [[ "$DRY_RUN" == "true" ]]; then
  setup_base_args+=("--dry-run")
fi
if [[ "$NO_REGISTER" == "true" ]]; then
  setup_base_args+=("--no-register")
fi

# Process repos
log "Starting batch setup..."
log ""

queried=0
processed=0
succeeded=0
skipped=0
failed=0

while IFS='|' read -r owner name links last_modified; do
  ((queried++)) || true

  repo="${owner}/${name}"

  # Check if we've hit the limit (stop after LIMIT repos are actually processed, not counting skipped)
  if [[ -n "$LIMIT" ]] && [[ $succeeded -ge "$LIMIT" ]]; then
    log "Reached limit of $LIMIT repos successfully processed. Stopping."
    log "Queried: $queried, Processed: $processed, Succeeded: $succeeded, Skipped: $skipped, Failed: $failed"
    break
  fi

  # Display progress info
  if [[ -n "$LIMIT" ]]; then
    log "[$processed/$LIMIT] Checking: $repo ($links links, updated: ${last_modified})"
  else
    log "[$queried/$processing_count] Processing: $repo ($links links, updated: ${last_modified})"
  fi

  # Build setup args for this specific repo
  setup_args=("${setup_base_args[@]:+${setup_base_args[@]}}")

  # Determine the destination directory name (same logic as setup.sh)
  enhansome_name=$(transform_to_enhansome_name "$name")
  repo_dest=$(get_repo_dest "$enhansome_name")

  if [[ -n "$DEST_DIR" ]]; then
    setup_args+=("--dest" "$repo_dest")
  fi

  # Check if repo already exists (skip it) - uses same logic as preview
  skip_reason=$(get_skip_reason "$owner" "$name")

  if [[ -n "$skip_reason" ]]; then
    log "⊘ Skipped: $repo - $skip_reason"
    ((skipped++)) || true
    ((processed++)) || true
    log ""
    continue
  fi

  # Run setup.sh
  ((processed++)) || true

  if "$SETUP_SCRIPT" --repo "$repo" "${setup_args[@]:+${setup_args[@]}}"; then
    log "✓ Success: $repo"
    ((succeeded++)) || true
  else
    exit_code=$?
    log "✗ Failed: $repo (exit code: $exit_code)"
    ((failed++)) || true

    if [[ "$CONTINUE_ON_ERROR" != "true" ]]; then
      log ""
      error "Setup failed for $repo. Aborting."
      log "Queried: $queried, Processed: $processed, Succeeded: $succeeded, Skipped: $skipped, Failed: $failed"
      log "To continue from this point, run: $0 --offset $((OFFSET + queried))"
      exit 1
    fi
  fi

  log ""
done < <(query_repos)

log "Batch setup complete!"
log "Total queried: $queried"
log "Total processed: $processed"
log "Succeeded: $succeeded"
log "Skipped: $skipped"
log "Failed: $failed"
