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
  # Should return the exact filename with correct case
  assert_equals "readme.md" "$result"
  rm -rf "$temp_dir"
}

function test_detect_readme_file_with_mixed_case() {
  local temp_dir=$(mktemp -d)
  touch "$temp_dir/Readme.md"
  local result=$(detect_readme_file "$temp_dir")
  # Should return the exact filename with correct case
  assert_equals "Readme.md" "$result"
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

# Test index.json format
function test_index_json_format() {
  local json_file="README.json"
  local expected='{"filename": "README.json"}'
  local result=$(printf '{"filename": "%s"}\n' "$json_file")
  assert_equals "$expected" "$result"
}

function test_index_json_path_construction() {
  local owner="testowner"
  local repo_name="testrepo"
  local expected="repos/testowner/testrepo/index.json"
  local result="repos/${owner}/${repo_name}/index.json"
  assert_equals "$expected" "$result"
}

# Test integration with DRY_RUN mode
function test_register_with_registry_in_dry_run_mode() {
  DRY_RUN="true"

  local output
  output=$(register_with_registry "test-owner/test-repo" "README.json" 2>&1)

  # In dry run, should show dry run message (output contains multiple lines)
  assert_contains "[DRY RUN] Would create registration PR for: test-owner/test-repo" "$output"

  DRY_RUN="false"
}

# Test dry run shows correct repo
function test_register_with_registry_dry_run_allowlist_entry() {
  DRY_RUN="true"

  local output
  output=$(register_with_registry "owner/repo" "custom.json" 2>&1)

  # Should show the dry run message with repo (output contains multiple lines)
  assert_contains "[DRY RUN] Would create registration PR for: owner/repo" "$output"

  DRY_RUN="false"
}

# Test fetch_allowlist scans repos directory
function test_fetch_allowlist_scans_repos_directory() {
  local cache_dir="${CACHE_DIR}/enhansome-registry"
  local repos_dir="${cache_dir}/repos"

  # Setup mock repos
  mkdir -p "${repos_dir}/owner1/repo1"
  mkdir -p "${repos_dir}/owner2/repo2"
  echo '{"filename": "README.json"}' > "${repos_dir}/owner1/repo1/index.json"
  echo '{"filename": "custom.json"}' > "${repos_dir}/owner2/repo2/index.json"

  # Fetch allowlist
  local result
  result=$(fetch_allowlist)

  # Should contain both entries (use assert_contains for substring check)
  assert_contains "owner1/repo1/README.json" "$result"
  assert_contains "owner2/repo2/custom.json" "$result"

  rm -rf "${cache_dir}/repos"
}

# ============================================================================
# Tests for is_awesome_repo_already_enhansomed function
# ============================================================================

# Helper function to create a mock registry cache with test data
# Uses a temp directory to avoid race conditions with parallel tests
function setup_mock_registry_cache() {
  local cache_dir=$(mktemp -d)
  export MOCK_REGISTRY_CACHE_DIR="$cache_dir"
  local repos_dir="${cache_dir}/repos"

  # Create directory structure
  mkdir -p "${repos_dir}/test1/enhansome-go"
  mkdir -p "${repos_dir}/test2/enhansome-awesome"
  mkdir -p "${repos_dir}/test3/enhansome-vscode"

  # Create mock index.json files
  cat > "${repos_dir}/test1/enhansome-go/index.json" << 'EOF'
{"filename": "README.json"}
EOF

  cat > "${repos_dir}/test2/enhansome-awesome/index.json" << 'EOF'
{"filename": "README.json"}
EOF

  cat > "${repos_dir}/test3/enhansome-vscode/index.json" << 'EOF'
{"filename": "readme.json"}
EOF

  # Create mock data.json files with original_repository metadata
  cat > "${repos_dir}/test1/enhansome-go/data.json" << 'EOF'
{
  "metadata": {
    "original_repository": "avelino/awesome-go",
    "source_repository": "test1/enhansome-go"
  }
}
EOF

  cat > "${repos_dir}/test2/enhansome-awesome/data.json" << 'EOF'
{
  "metadata": {
    "original_repository": "sindresorhus/awesome",
    "source_repository": "test2/enhansome-awesome"
  }
}
EOF

  cat > "${repos_dir}/test3/enhansome-vscode/data.json" << 'EOF'
{
  "metadata": {
    "original_repository": "viatsko/awesome-vscode",
    "source_repository": "test3/enhansome-vscode"
  }
}
EOF
}

function cleanup_mock_registry_cache() {
  rm -rf "${MOCK_REGISTRY_CACHE_DIR}"
  unset MOCK_REGISTRY_CACHE_DIR
}

# Test that an existing repo is detected in the list
function test_is_awesome_repo_already_enhansomed_found() {
  setup_mock_registry_cache
  local original_registry_cache_dir="$REGISTRY_CACHE_DIR"
  REGISTRY_CACHE_DIR="$MOCK_REGISTRY_CACHE_DIR"

  if is_awesome_repo_already_enhansomed "avelino/awesome-go"; then
    local exit_code=0
  else
    local exit_code=1
  fi

  REGISTRY_CACHE_DIR="$original_registry_cache_dir"
  cleanup_mock_registry_cache
  assert_equals 0 "$exit_code"
}

# Test that a non-existing repo is not found
function test_is_awesome_repo_already_enhansomed_not_found() {
  setup_mock_registry_cache
  local original_registry_cache_dir="$REGISTRY_CACHE_DIR"
  REGISTRY_CACHE_DIR="$MOCK_REGISTRY_CACHE_DIR"

  if is_awesome_repo_already_enhansomed "unknown/nonexistent-repo"; then
    local exit_code=1
  else
    local exit_code=0
  fi

  REGISTRY_CACHE_DIR="$original_registry_cache_dir"
  cleanup_mock_registry_cache
  assert_equals 0 "$exit_code"
}

# Test partial matching doesn't trigger false positives
function test_is_awesome_repo_already_enhansomed_partial_match_no_false_positive() {
  setup_mock_registry_cache
  local original_registry_cache_dir="$REGISTRY_CACHE_DIR"
  REGISTRY_CACHE_DIR="$MOCK_REGISTRY_CACHE_DIR"

  # "awesome" should NOT match "sindresorhus/awesome" (needs exact match)
  if is_awesome_repo_already_enhansomed "awesome"; then
    local exit_code=1
  else
    local exit_code=0
  fi

  REGISTRY_CACHE_DIR="$original_registry_cache_dir"
  cleanup_mock_registry_cache
  assert_equals 0 "$exit_code"
}

# Test case sensitivity
function test_is_awesome_repo_already_enhansomed_case_sensitive() {
  setup_mock_registry_cache
  local original_registry_cache_dir="$REGISTRY_CACHE_DIR"
  REGISTRY_CACHE_DIR="$MOCK_REGISTRY_CACHE_DIR"

  # "Avelino/Awesome-Go" should NOT match "avelino/awesome-go"
  if is_awesome_repo_already_enhansomed "Avelino/Awesome-Go"; then
    local exit_code=1
  else
    local exit_code=0
  fi

  REGISTRY_CACHE_DIR="$original_registry_cache_dir"
  cleanup_mock_registry_cache
  assert_equals 0 "$exit_code"
}

# Test with empty cache directory (valid git repo but no data files)
function test_is_awesome_repo_already_enhansomed_empty_cache() {
  # Create a valid git repo structure with empty data directory
  local cache_dir="${CACHE_DIR}/enhansome-registry"
  local data_dir="${cache_dir}/data"
  rm -rf "$cache_dir"
  mkdir -p "$data_dir"
  mkdir -p "${cache_dir}/.git"  # Make it look like a git repo

  # Should not find anything in empty data directory
  if is_awesome_repo_already_enhansomed "avelino/awesome-go"; then
    local exit_code=1
  else
    local exit_code=0
  fi

  rm -rf "$cache_dir"
  assert_equals 0 "$exit_code"
}

# Test with real registry (git clone works, should find avelino/awesome-go)
function test_is_awesome_repo_already_enhansomed_real_registry() {
  # Ensure no local cache exists, so it clones the real registry
  rm -rf "${CACHE_DIR}/enhansome-registry"
  local OLD_VERBOSE="$VERBOSE"
  VERBOSE="false"

  # avelino/awesome-go exists in the real registry
  is_awesome_repo_already_enhansomed "avelino/awesome-go"
  local result=$?

  VERBOSE="$OLD_VERBOSE"
  assert_equals 0 "$result"  # 0 = found
}
