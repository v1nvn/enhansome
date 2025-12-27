#!/bin/bash

# Tests for cleanup and error handling functions in setup_lib.sh

# Source setup.sh for testing (functions only, main logic won't execute)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../setup.sh"

function test_cleanup_on_error_with_cleanup_disabled() {
  CLEANUP_ON_ERROR="false"
  local result
  result=$(cleanup_on_error 2>&1)
  assert_contains "Cleanup disabled" "$result"
  assert_contains "Manual cleanup may be required" "$result"
  CLEANUP_ON_ERROR="true"
}

function test_cleanup_on_error_with_no_resources() {
  CREATED_REPO=""
  CLONED_DIR=""
  CLEANUP_ON_ERROR="true"

  local result
  result=$(cleanup_on_error 2>&1)
  assert_contains "Cleaning up after error" "$result"
  assert_contains "Cleanup completed successfully" "$result"
}

function test_cleanup_on_error_removes_directory() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/test_file"
  CLONED_DIR="$temp_dir"
  CREATED_REPO=""
  CLEANUP_ON_ERROR="true"

  cleanup_on_error >/dev/null 2>&1

  # Check directory was removed
  if [[ -d "$temp_dir" ]]; then
    assert_fail "Directory still exists: $temp_dir"
  fi

  CLONED_DIR=""
}

function test_cleanup_on_error_with_nonexistent_directory() {
  CLONED_DIR="/nonexistent/test/directory"
  CREATED_REPO=""
  CLEANUP_ON_ERROR="true"

  local result
  result=$(cleanup_on_error 2>&1)
  # Should not fail if directory doesn't exist
  assert_successful_code "$?"

  CLONED_DIR=""
}

function test_execute_in_dry_run_mode() {
  DRY_RUN="true"
  local result
  result=$(execute "Test command" echo "hello")
  # Just check for key text, not emojis
  assert_matches ".*DRY RUN.*Would execute.*Test command.*" "$result"
  DRY_RUN="false"
}

function test_execute_in_normal_mode() {
  DRY_RUN="false"
  local result
  result=$(execute "Echo test" echo "hello world")
  assert_equals "hello world" "$result"
}

function test_execute_preserves_exit_code_on_success() {
  DRY_RUN="false"
  execute "Success test" true
  assert_successful_code "$?"
}

function test_execute_preserves_exit_code_on_failure() {
  DRY_RUN="false"
  execute "Failure test" false
  assert_general_error "$?"
}

function test_log_outputs_message() {
  local result
  result=$(log "Test message")
  assert_equals "Test message" "$result"
}

function test_log_verbose_with_verbose_enabled() {
  VERBOSE="true"
  local result
  result=$(log_verbose "Debug info" 2>&1)
  # Just check for the text content
  assert_matches ".*DEBUG.*Debug info.*" "$result"
  VERBOSE="false"
}

function test_log_verbose_with_verbose_disabled() {
  VERBOSE="false"
  local result
  result=$(log_verbose "Debug info" 2>&1)
  assert_equals "" "$result"
}

function test_warn_outputs_message() {
  local result
  result=$(warn "Warning message" 2>&1)
  assert_matches ".*Warning.*Warning message.*" "$result"
}

function test_error_outputs_message_and_returns_1() {
  local result
  result=$(error "Error message" 2>&1)
  local exit_code=$?

  assert_matches ".*Error.*Error message.*" "$result"
  assert_equals 1 "$exit_code"
}
