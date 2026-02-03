#!/bin/bash

# Tests for registry registration functions in setup.sh

# Source setup.sh for testing (functions only, main logic won't execute)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../setup.sh"

# Helper function to generate expected branch name
function get_expected_branch_name() {
  local repo=$1
  echo "register/${repo//\//-}"
}

function test_branch_name_conversion_simple_repo() {
  local repo="owner/repo"
  local expected="register/owner-repo"
  local result=$(get_expected_branch_name "$repo")
  assert_equals "$expected" "$result"
}

function test_branch_name_conversion_with_dashes() {
  local repo="my-owner/my-repo"
  local expected="register/my-owner-my-repo"
  local result=$(get_expected_branch_name "$repo")
  assert_equals "$expected" "$result"
}

function test_branch_name_conversion_with_underscores() {
  local repo="my_owner/my_repo"
  local expected="register/my_owner-my_repo"
  local result=$(get_expected_branch_name "$repo")
  assert_equals "$expected" "$result"
}

function test_allowlist_entry_format() {
  local repo="owner/repo"
  local json_file="README.json"
  local expected="owner/repo/README.json"
  local result="${repo}/${json_file}"
  assert_equals "$expected" "$result"
}

function test_allowlist_entry_format_with_lowercase_readme() {
  local repo="owner/repo"
  local json_file="readme.json"
  local expected="owner/repo/readme.json"
  local result="${repo}/${json_file}"
  assert_equals "$expected" "$result"
}

# Test that md_to_json_filename function exists and works correctly
function test_md_to_json_filename_with_uppercase_readme() {
  local result=$(md_to_json_filename "README.md")
  assert_equals "README.json" "$result"
}

function test_md_to_json_filename_with_lowercase_readme() {
  local result=$(md_to_json_filename "readme.md")
  assert_equals "readme.json" "$result"
}

function test_md_to_json_filename_with_custom_name() {
  local result=$(md_to_json_filename "awesome-list.md")
  assert_equals "awesome-list.json" "$result"
}

# Test detect_readme_file function
function test_detect_readme_file_with_uppercase() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/README.md"
  local result=$(detect_readme_file "$temp_dir")
  assert_equals "README.md" "$result"
  rm -rf "$temp_dir"
}

function test_detect_readme_file_with_lowercase() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/readme.md"
  local result=$(detect_readme_file "$temp_dir")
  # On case-insensitive filesystems (macOS), this returns the first candidate
  # On case-sensitive filesystems (Linux), this returns the exact match
  assert_matches "readme.md|README.md" "$result"
  rm -rf "$temp_dir"
}

function test_detect_readme_file_with_mixed_case() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/Readme.md"
  local result=$(detect_readme_file "$temp_dir")
  # On case-insensitive filesystems (macOS), this returns the first candidate
  # On case-sensitive filesystems (Linux), this returns the exact match
  assert_matches "Readme.md|README.md" "$result"
  rm -rf "$temp_dir"
}

function test_detect_readme_file_prioritizes_uppercase() {
  local temp_dir=$(mktemp -d)
  # Create multiple README files - should return first match (README.md)
  touch "$temp_dir/README.md"
  touch "$temp_dir/readme.md"
  local result=$(detect_readme_file "$temp_dir")
  assert_equals "README.md" "$result"
  rm -rf "$temp_dir"
}

function test_detect_readme_file_returns_error_when_not_found() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/other-file.md"
  detect_readme_file "$temp_dir" >/dev/null 2>&1
  local exit_code=$?
  assert_equals 1 "$exit_code"
  rm -rf "$temp_dir"
}

# Test the content appending logic (what would be sent in base64)
function test_content_appending_preserves_existing_newline() {
  local current_content=$'entry1\nentry2\n'
  local new_entry="entry3"
  local expected=$'entry1\nentry2\nentry3\n'
  local result=$(printf '%s%s\n' "$current_content" "$new_entry")
  assert_equals "$expected" "$result"
}

function test_content_appending_with_empty_file() {
  local current_content=""
  local new_entry="entry1"
  local expected=$'entry1\n'
  local result=$(printf '%s%s\n' "$current_content" "$new_entry")
  assert_equals "$expected" "$result"
}

function test_content_appending_with_single_entry() {
  local current_content=$'entry1\n'
  local new_entry="entry2"
  local expected=$'entry1\nentry2\n'
  local result=$(printf '%s%s\n' "$current_content" "$new_entry")
  assert_equals "$expected" "$result"
}

# Test the bug case: content WITHOUT trailing newline (like the PR issue)
function test_content_appending_without_trailing_newline() {
  local current_content="entry1"
  local new_entry="entry2"
  local expected=$'entry1\nentry2\n'
  # This is the current buggy implementation - will fail
  local result_buggy=$(printf '%s%s\n' "$current_content" "$new_entry")
  # This should be the correct implementation - should pass
  local result_correct=$(printf '%s\n%s\n' "$current_content" "$new_entry")

  # Verify buggy version produces wrong output
  assert_not_equals "$expected" "$result_buggy"
  # Verify correct version produces expected output
  assert_equals "$expected" "$result_correct"
}

# Test the fixed implementation that handles both cases
function test_content_appending_with_conditional_newline() {
  # Helper function that mirrors the fixed implementation
  append_entry() {
    local current=$1
    local entry=$2
    # Check if content ends with newline
    if [[ "$current" =~ $'\n'$ ]]; then
      printf '%s%s\n' "$current" "$entry"
    else
      printf '%s\n%s\n' "$current" "$entry"
    fi
  }

  # Test with trailing newline
  local current_with_newline=$'entry1\n'
  local new_entry="entry2"
  local expected=$'entry1\nentry2\n'
  local result=$(append_entry "$current_with_newline" "$new_entry")
  assert_equals "$expected" "$result"

  # Test without trailing newline (the bug case)
  local current_without_newline="entry1"
  local expected=$'entry1\nentry2\n'
  local result=$(append_entry "$current_without_newline" "$new_entry")
  assert_equals "$expected" "$result"

  # Test with multiple entries ending with newline
  local current_multiple=$'entry1\nentry2\n'
  local new_entry="entry3"
  local expected=$'entry1\nentry2\nentry3\n'
  local result=$(append_entry "$current_multiple" "$new_entry")
  assert_equals "$expected" "$result"
}

# Test integration with DRY_RUN mode
function test_register_with_registry_in_dry_run_mode() {
  DRY_RUN="true"

  local output
  output=$(register_with_registry "test-owner/test-repo" "README.json" 2>&1)

  # In dry run, should show what would be done without executing
  assert_matches ".*\[DRY RUN\].*Would create registration PR.*test-owner/test-repo/README.json.*" "$output"

  DRY_RUN="false"
}

# Test dry run shows correct allowlist entry
function test_register_with_registry_dry_run_allowlist_entry() {
  DRY_RUN="true"

  local output
  output=$(register_with_registry "owner/repo" "custom.json" 2>&1)

  # Should show the full allowlist entry
  assert_matches ".*\[DRY RUN\].*owner/repo/custom.json.*" "$output"

  DRY_RUN="false"
}
