#!/bin/bash

# Tests for validation functions in setup_lib.sh

# Source setup.sh for testing (functions only, main logic won't execute)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../setup.sh"

function test_validate_repo_format_with_valid_input() {
  assert_successful_code "$(validate_repo_format "owner/repo")"
}

function test_validate_repo_format_with_valid_input_with_dashes() {
  assert_successful_code "$(validate_repo_format "my-owner/my-repo")"
}

function test_validate_repo_format_with_valid_input_with_underscores() {
  assert_successful_code "$(validate_repo_format "my_owner/my_repo")"
}

function test_validate_repo_format_with_valid_input_with_dots() {
  assert_successful_code "$(validate_repo_format "owner/repo.name")"
}

function test_validate_repo_format_with_valid_input_with_numbers() {
  assert_successful_code "$(validate_repo_format "owner123/repo456")"
}

function test_validate_repo_format_with_empty_input() {
  assert_general_error "$(validate_repo_format "")"
}

function test_validate_repo_format_with_missing_slash() {
  assert_general_error "$(validate_repo_format "ownerrepo")"
}

function test_validate_repo_format_with_multiple_slashes() {
  assert_general_error "$(validate_repo_format "owner/repo/extra")"
}

function test_validate_repo_format_with_special_chars() {
  assert_general_error "$(validate_repo_format "owner@/repo")"
}

function test_validate_repo_format_with_spaces() {
  assert_general_error "$(validate_repo_format "owner /repo")"
}

function test_sanitize_input_removes_newlines() {
  local input=$'hello\nworld'
  local result=$(sanitize_input "$input")
  assert_equals "helloworld" "$result"
}

function test_sanitize_input_removes_carriage_returns() {
  local input=$'hello\rworld'
  local result=$(sanitize_input "$input")
  assert_equals "helloworld" "$result"
}

# Note: Null bytes test is skipped because bash strings are null-terminated
# and cannot contain null bytes. Any input with null bytes will be truncated
# at the null byte, which is the expected behavior in bash.
# function test_sanitize_input_removes_null_bytes() {
#   local input=$'hello\0world'
#   local result=$(sanitize_input "$input")
#   assert_equals "helloworld" "$result"
# }

function test_sanitize_input_preserves_valid_chars() {
  local input="owner/repo-name_123"
  local result=$(sanitize_input "$input")
  assert_equals "owner/repo-name_123" "$result"
}

function test_validate_path_with_empty_input() {
  assert_general_error "$(validate_path "")"
}

function test_validate_path_with_path_traversal() {
  assert_general_error "$(validate_path "../../etc/passwd")"
}

function test_validate_path_with_absolute_path_outside_home() {
  assert_general_error "$(validate_path "/etc/passwd")"
}

function test_validate_path_with_absolute_path_in_home() {
  local result=$(validate_path "$HOME/test")
  assert_equals "$HOME/test" "$result"
}

function test_validate_path_with_tmp_path() {
  local result=$(validate_path "/tmp/test")
  assert_equals "/tmp/test" "$result"
}

function test_validate_path_with_relative_path() {
  local result=$(validate_path "relative/path")
  assert_equals "$PWD/relative/path" "$result"
}

function test_extract_repo_owner() {
  local result=$(extract_repo_owner "avelino/awesome-go")
  assert_equals "avelino" "$result"
}

function test_extract_repo_name() {
  local result=$(extract_repo_name "avelino/awesome-go")
  assert_equals "awesome-go" "$result"
}

function test_transform_to_enhansome_name() {
  local result=$(transform_to_enhansome_name "awesome-go")
  assert_equals "enhansome-go" "$result"
}

function test_transform_to_enhansome_name_with_multiple_awesome() {
  local result=$(transform_to_enhansome_name "awesome-awesome-go")
  assert_equals "enhansome-enhansome-go" "$result"
}

function test_ensure_enhansome_prefix_with_awesome_in_name() {
  local result=$(ensure_enhansome_prefix "myuser/awesome-python")
  assert_equals "myuser/awesome-python" "$result"
}

function test_ensure_enhansome_prefix_without_awesome() {
  local result=$(ensure_enhansome_prefix "myuser/mycoolrepo")
  assert_equals "myuser/enhansome-mycoolrepo" "$result"
}

function test_ensure_enhansome_prefix_with_enhansome_already_present() {
  local result=$(ensure_enhansome_prefix "myuser/enhansome-python")
  assert_equals "myuser/enhansome-enhansome-python" "$result"
}

function test_ensure_enhansome_prefix_with_awesome_at_start() {
  local result=$(ensure_enhansome_prefix "owner/awesome-go")
  assert_equals "owner/awesome-go" "$result"
}

function test_ensure_enhansome_prefix_with_awesome_in_middle() {
  local result=$(ensure_enhansome_prefix "owner/my-awesome-list")
  assert_equals "owner/my-awesome-list" "$result"
}

function test_ensure_enhansome_prefix_without_awesome_simple_name() {
  local result=$(ensure_enhansome_prefix "owner/repo")
  assert_equals "owner/enhansome-repo" "$result"
}

function test_ensure_enhansome_prefix_with_dashes() {
  local result=$(ensure_enhansome_prefix "my-user/my-repo")
  assert_equals "my-user/enhansome-my-repo" "$result"
}

function test_check_prerequisites_with_existing_commands() {
  assert_successful_code "$(check_prerequisites "bash" "echo")"
}

function test_check_prerequisites_with_missing_command() {
  assert_general_error "$(check_prerequisites "bash" "nonexistent_command_xyz")"
}

function test_is_directory_nonempty_with_nonexistent_dir() {
  assert_general_error "$(is_directory_nonempty "/nonexistent/directory")"
}

function test_is_directory_nonempty_with_empty_dir() {
  local temp_dir=$(mktemp -d)
  assert_general_error "$(is_directory_nonempty "$temp_dir")"
  rmdir "$temp_dir"
}

function test_is_directory_nonempty_with_nonempty_dir() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/test_file"
  assert_successful_code "$(is_directory_nonempty "$temp_dir")"
  rm -rf "$temp_dir"
}
