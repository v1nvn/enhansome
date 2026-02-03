#!/bin/bash

# Tests for CLI argument parsing functions in setup.sh

# Source setup.sh for testing (functions only, main logic won't execute)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../setup.sh"

# ============================================================================
# SETUP AND TEARDOWN
# ============================================================================

# Save original values
setup_test_env() {
  OLD_SUBMODULE_REPO="$SUBMODULE_REPO"
  OLD_REPO_NAME="$REPO_NAME"
  OLD_DEST_DIR="$DEST_DIR"
  OLD_FILE_TO_ENHANCE="$FILE_TO_ENHANCE"
  OLD_REGISTER_REGISTRY="$REGISTER_REGISTRY"
  OLD_DRY_RUN="$DRY_RUN"
  OLD_VERBOSE="$VERBOSE"
  OLD_CLEANUP_ON_ERROR="$CLEANUP_ON_ERROR"
}

teardown_test_env() {
  SUBMODULE_REPO="$OLD_SUBMODULE_REPO"
  REPO_NAME="$OLD_REPO_NAME"
  DEST_DIR="$OLD_DEST_DIR"
  FILE_TO_ENHANCE="$OLD_FILE_TO_ENHANCE"
  REGISTER_REGISTRY="$OLD_REGISTER_REGISTRY"
  DRY_RUN="$OLD_DRY_RUN"
  VERBOSE="$OLD_VERBOSE"
  CLEANUP_ON_ERROR="$OLD_CLEANUP_ON_ERROR"
}

# Reset to defaults before each test
reset_to_defaults() {
  SUBMODULE_REPO=""
  REPO_NAME=""
  DEST_DIR=""
  FILE_TO_ENHANCE=""
  REGISTER_REGISTRY="true"
  DRY_RUN="false"
  VERBOSE="false"
  CLEANUP_ON_ERROR="true"
}

# ============================================================================
# --repo ARGUMENT
# ============================================================================

function test_parse_args_with_repo() {
  reset_to_defaults

  parse_args --repo "owner/repo"

  assert_equals "owner/repo" "$SUBMODULE_REPO"
}

function test_parse_args_with_repo_and_dashes() {
  reset_to_defaults

  parse_args --repo "my-owner/my-repo"

  assert_equals "my-owner/my-repo" "$SUBMODULE_REPO"
}

function test_parse_args_with_repo_and_dots() {
  reset_to_defaults

  parse_args --repo "owner/repo.name"

  assert_equals "owner/repo.name" "$SUBMODULE_REPO"
}

# ============================================================================
# --name ARGUMENT
# ============================================================================

function test_parse_args_with_name() {
  reset_to_defaults

  parse_args --name "custom/repo"

  assert_equals "custom/repo" "$REPO_NAME"
}

function test_parse_args_with_repo_and_name() {
  reset_to_defaults

  parse_args --repo "awesome/go" --name "custom/repo"

  assert_equals "awesome/go" "$SUBMODULE_REPO"
  assert_equals "custom/repo" "$REPO_NAME"
}

# ============================================================================
# --dest ARGUMENT
# ============================================================================

function test_parse_args_with_dest() {
  reset_to_defaults

  parse_args --dest "/custom/path"

  assert_equals "/custom/path" "$DEST_DIR"
}

function test_parse_args_with_dest_relative_path() {
  reset_to_defaults

  parse_args --dest "relative/path"

  assert_equals "relative/path" "$DEST_DIR"
}

function test_parse_args_with_multiple_flags() {
  reset_to_defaults

  parse_args --repo "owner/repo" --name "custom/repo" --dest "/path"

  assert_equals "owner/repo" "$SUBMODULE_REPO"
  assert_equals "custom/repo" "$REPO_NAME"
  assert_equals "/path" "$DEST_DIR"
}

# ============================================================================
# --file / -f ARGUMENT
# ============================================================================

function test_parse_args_with_file_short() {
  reset_to_defaults

  parse_args -f "custom.md"

  assert_equals "custom.md" "$FILE_TO_ENHANCE"
}

function test_parse_args_with_file_long() {
  reset_to_defaults

  parse_args --file "README.md"

  assert_equals "README.md" "$FILE_TO_ENHANCE"
}

function test_parse_args_with_custom_file() {
  reset_to_defaults

  parse_args --file "awesome-list.md"

  assert_equals "awesome-list.md" "$FILE_TO_ENHANCE"
}

# ============================================================================
# --no-register ARGUMENT
# ============================================================================

function test_parse_args_with_no_register() {
  reset_to_defaults

  parse_args --no-register

  assert_equals "false" "$REGISTER_REGISTRY"
}

function test_parse_args_with_no_register_default_is_true() {
  reset_to_defaults
  # Default should be true
  assert_equals "true" "$REGISTER_REGISTRY"
}

function test_parse_args_no_register_with_other_args() {
  reset_to_defaults

  parse_args --repo "owner/repo" --no-register --dry-run

  assert_equals "owner/repo" "$SUBMODULE_REPO"
  assert_equals "false" "$REGISTER_REGISTRY"
  assert_equals "true" "$DRY_RUN"
}

# ============================================================================
# --dry-run ARGUMENT
# ============================================================================

function test_parse_args_with_dry_run() {
  reset_to_defaults

  parse_args --dry-run

  assert_equals "true" "$DRY_RUN"
}

function test_parse_args_dry_run_default_is_false() {
  reset_to_defaults
  # Default should be false
  assert_equals "false" "$DRY_RUN"
}

# ============================================================================
# --verbose ARGUMENT
# ============================================================================

function test_parse_args_with_verbose() {
  reset_to_defaults

  parse_args --verbose

  assert_equals "true" "$VERBOSE"
}

function test_parse_args_verbose_default_is_false() {
  reset_to_defaults
  # Default should be false
  assert_equals "false" "$VERBOSE"
}

# ============================================================================
# --no-cleanup ARGUMENT
# ============================================================================

function test_parse_args_with_no_cleanup() {
  reset_to_defaults

  parse_args --no-cleanup

  assert_equals "false" "$CLEANUP_ON_ERROR"
}

function test_parse_args_cleanup_default_is_true() {
  reset_to_defaults
  # Default should be true
  assert_equals "true" "$CLEANUP_ON_ERROR"
}

# ============================================================================
# COMBINATION TESTS
# ============================================================================

function test_parse_args_with_all_flags() {
  reset_to_defaults

  parse_args \
    --repo "avelino/awesome-go" \
    --name "myuser/enhansome-go" \
    --dest "~/dev/my-go" \
    --file "README.md" \
    --no-register \
    --dry-run \
    --verbose \
    --no-cleanup

  assert_equals "avelino/awesome-go" "$SUBMODULE_REPO"
  assert_equals "myuser/enhansome-go" "$REPO_NAME"
  assert_equals "~/dev/my-go" "$DEST_DIR"
  assert_equals "README.md" "$FILE_TO_ENHANCE"
  assert_equals "false" "$REGISTER_REGISTRY"
  assert_equals "true" "$DRY_RUN"
  assert_equals "true" "$VERBOSE"
  assert_equals "false" "$CLEANUP_ON_ERROR"
}

function test_parse_args_preserves_ordering() {
  reset_to_defaults

  parse_args --repo "first/repo" --name "second/repo" --dest "third/path"

  assert_equals "first/repo" "$SUBMODULE_REPO"
  assert_equals "second/repo" "$REPO_NAME"
  assert_equals "third/path" "$DEST_DIR"
}

# ============================================================================
# --help / -h ARGUMENT
# ============================================================================

function test_show_help_exits_successfully() {
  # show_help calls exit 0, so we need to capture that
  # In bashunit, we can test that the function is callable
  # but we can't actually test the exit without terminating the test suite

  # Just verify the function exists and can be called in subshell
  local result
  result=$(show_help 2>&1 || true)

  assert_contains "Usage:" "$result"
  assert_contains "Enhansome Setup Script" "$result"
}

# ============================================================================
# UNKNOWN OPTION HANDLING
# ============================================================================

function test_parse_args_with_unknown_option() {
  reset_to_defaults

  # This should print an error and exit 1
  # We need to run in subshell to capture the exit
  local output
  output=$(parse_args --unknown-option 2>&1 || true)

  assert_contains "Unknown option" "$output"
}

function test_parse_args_with_invalid_flag() {
  reset_to_defaults

  local output
  output=$(parse_args --invalid 2>&1 || true)

  assert_contains "Unknown option" "$output"
}

# ============================================================================
# ARGUMENT ORDERING TESTS
# ============================================================================

function test_parse_args_flags_in_different_orders() {
  reset_to_defaults

  # Order 1
  parse_args --repo "owner/repo" --dry-run --verbose
  assert_equals "true" "$DRY_RUN"
  assert_equals "true" "$VERBOSE"

  reset_to_defaults

  # Order 2 (reversed)
  parse_args --verbose --repo "owner/repo" --dry-run
  assert_equals "true" "$VERBOSE"
  assert_equals "true" "$DRY_RUN"
}

# ============================================================================
# EDGE CASES
# ============================================================================

function test_parse_args_with_empty_arguments() {
  reset_to_defaults

  parse_args

  # All should remain at defaults
  assert_equals "" "$SUBMODULE_REPO"
  assert_equals "" "$REPO_NAME"
  assert_equals "" "$DEST_DIR"
  assert_equals "true" "$REGISTER_REGISTRY"
}

function test_parse_args_with_spaces_in_values() {
  reset_to_defaults

  parse_args --dest "/path with spaces/repo"

  assert_equals "/path with spaces/repo" "$DEST_DIR"
}

function test_parse_args_repo_with_underscores() {
  reset_to_defaults

  parse_args --repo "my_owner/my_repo"

  assert_equals "my_owner/my_repo" "$SUBMODULE_REPO"
}

# ============================================================================
# INTEGRATION TESTS
# ============================================================================

function test_parse_args_typical_usage() {
  reset_to_defaults

  parse_args --repo "avelino/awesome-go"

  assert_equals "avelino/awesome-go" "$SUBMODULE_REPO"
  assert_equals "" "$REPO_NAME"  # Should use default
  assert_equals "" "$DEST_DIR"    # Should use default
  assert_equals "true" "$REGISTER_REGISTRY"  # Default
}

function test_parse_args_dry_run_usage() {
  reset_to_defaults

  parse_args --repo "avelino/awesome-go" --dry-run --no-register

  assert_equals "avelino/awesome-go" "$SUBMODULE_REPO"
  assert_equals "true" "$DRY_RUN"
  assert_equals "false" "$REGISTER_REGISTRY"
}

function test_parse_args_custom_usage() {
  reset_to_defaults

  parse_args \
    --repo "sindresorhus/awesome" \
    --name "myuser/awesome-stuff" \
    --dest "~/dev/awesome" \
    --file "readme.md"

  assert_equals "sindresorhus/awesome" "$SUBMODULE_REPO"
  assert_equals "myuser/awesome-stuff" "$REPO_NAME"
  assert_equals "~/dev/awesome" "$DEST_DIR"
  assert_equals "readme.md" "$FILE_TO_ENHANCE"
}
