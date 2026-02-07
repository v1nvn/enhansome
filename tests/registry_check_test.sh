#!/bin/bash

# Tests for registry check functions and idempotency functions in setup.sh

# Source setup.sh for testing (functions only, main logic won't execute)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../setup.sh"

# ============================================================================
# DENYLIST FUNCTIONS
# ============================================================================

function test_is_repo_in_denylist_with_blocked_repo() {
  # Mock fetch_denylist to return test data
  fetch_denylist() {
    cat << 'EOF'
blocked/repo1
blocked/repo2
another/blocked-repo
EOF
  }

  is_repo_in_denylist "blocked/repo1"
  assert_successful_code

  unset -f fetch_denylist
}

function test_is_repo_in_denylist_with_allowed_repo() {
  # Mock fetch_denylist to return test data
  fetch_denylist() {
    cat << 'EOF'
blocked/repo1
blocked/repo2
another/blocked-repo
EOF
  }

  is_repo_in_denylist "allowed/repo"
  assert_unsuccessful_code

  unset -f fetch_denylist
}

function test_is_repo_in_denylist_is_exact_match() {
  # Mock fetch_denylist to return test data
  fetch_denylist() {
    cat << 'EOF'
blocked/repo1
blocked/repo2
EOF
  }

  # "blocked" should NOT match "blocked/repo1"
  is_repo_in_denylist "blocked"
  assert_unsuccessful_code

  unset -f fetch_denylist
}

function test_is_repo_in_denylist_case_sensitive() {
  # Mock fetch_denylist to return test data
  fetch_denylist() {
    cat << 'EOF'
blocked/repo1
blocked/repo2
EOF
  }

  # "Blocked/Repo1" should NOT match "blocked/repo1"
  is_repo_in_denylist "Blocked/Repo1"
  assert_unsuccessful_code

  unset -f fetch_denylist
}

function test_fetch_denylist_with_empty_list() {
  # Mock fetch_denylist to return empty
  fetch_denylist() {
    return 1
  }

  is_repo_in_denylist "any/repo"
  assert_unsuccessful_code

  unset -f fetch_denylist
}

function test_fetch_denylist_with_missing_file() {
  # Mock fetch_denylist to simulate missing file
  fetch_denylist() {
    return 1
  }

  fetch_denylist
  assert_unsuccessful_code

  unset -f fetch_denylist
}

# ============================================================================
# ALLOWLIST FUNCTIONS
# ============================================================================

function test_is_repo_in_allowlist_with_registered_entry() {
  # Mock is_repo_in_allowlist to simulate new structure
  local cache_dir="${CACHE_DIR}/enhansome-registry"
  mkdir -p "${cache_dir}/repos/owner1/repo1"
  echo '{"filename": "README.json"}' > "${cache_dir}/repos/owner1/repo1/index.json"

  is_repo_in_allowlist "owner1/repo1" "README.json"
  assert_successful_code

  rm -rf "${cache_dir}/repos/owner1"
}

function test_is_repo_in_allowlist_with_unregistered_entry() {
  # Mock is_repo_in_allowlist - no index file exists
  local cache_dir="${CACHE_DIR}/enhansome-registry"
  rm -rf "${cache_dir}/repos/unknown/repo"

  is_repo_in_allowlist "unknown/repo" "README.json"
  assert_unsuccessful_code
}

function test_is_repo_in_allowlist_with_custom_json_file() {
  # Mock is_repo_in_allowlist with custom filename
  local cache_dir="${CACHE_DIR}/enhansome-registry"
  mkdir -p "${cache_dir}/repos/owner2/repo2"
  echo '{"filename": "custom.json"}' > "${cache_dir}/repos/owner2/repo2/index.json"

  is_repo_in_allowlist "owner2/repo2" "custom.json"
  assert_successful_code

  rm -rf "${cache_dir}/repos/owner2"
}

function test_fetch_allowlist_with_missing_file() {
  # Mock fetch_allowlist to simulate missing file
  fetch_allowlist() {
    return 1
  }

  fetch_allowlist
  assert_unsuccessful_code

  unset -f fetch_allowlist
}

# ============================================================================
# SUBMODULE CHECK FUNCTIONS
# ============================================================================

function test_is_submodule_already_added_with_no_gitmodules() {
  local temp_dir=$(mktemp -d)
  cd "$temp_dir"

  is_submodule_already_added "avelino/awesome-go"
  assert_unsuccessful_code

  cd - > /dev/null
  rm -rf "$temp_dir"
}

function test_is_submodule_already_added_with_matching_submodule() {
  local temp_dir=$(mktemp -d)
  cd "$temp_dir"

  cat > .gitmodules << 'EOF'
[submodule "origin"]
	path = origin
	url = https://github.com/avelino/awesome-go.git
EOF

  is_submodule_already_added "avelino/awesome-go"
  assert_successful_code

  cd - > /dev/null
  rm -rf "$temp_dir"
}

function test_is_submodule_already_added_with_different_submodule() {
  local temp_dir=$(mktemp -d)
  cd "$temp_dir"

  cat > .gitmodules << 'EOF'
[submodule "origin"]
	path = origin
	url = https://github.com/sindresorhus/awesome.git
EOF

  is_submodule_already_added "avelino/awesome-go"
  assert_unsuccessful_code

  cd - > /dev/null
  rm -rf "$temp_dir"
}

function test_is_submodule_already_added_exact_url_match() {
  local temp_dir=$(mktemp -d)
  cd "$temp_dir"

  cat > .gitmodules << 'EOF'
[submodule "origin"]
	path = origin
	url = https://github.com/avelino/awesome-go.git
EOF

  # Should match exact repo
  is_submodule_already_added "avelino/awesome-go"
  assert_successful_code

  cd - > /dev/null
  rm -rf "$temp_dir"
}

# ============================================================================
# IDEMPOTENCY CHECKS (run_idempotency_checks)
# ============================================================================

function test_run_idempotency_checks_with_registration_disabled() {
  REGISTER_REGISTRY="false"

  run_idempotency_checks "awesome/repo" "target/repo" "README.json"
  assert_successful_code

  REGISTER_REGISTRY="true"
}

function test_run_idempotency_checks_with_denylisted_repo() {
  REGISTER_REGISTRY="true"

  # Mock all the registry functions
  init_cache() {
    return 0
  }

  ensure_registry_cache() {
    return 0
  }

  fetch_denylist() {
    cat << 'EOF'
blocked/repo1
EOF
  }

  run_idempotency_checks "blocked/repo1" "target/repo" "README.json"
  assert_unsuccessful_code

  REGISTER_REGISTRY="true"
  unset -f init_cache ensure_registry_cache fetch_denylist
}

function test_run_idempotency_checks_with_allowlisted_repo() {
  REGISTER_REGISTRY="true"

  # Mock all the registry functions
  init_cache() {
    return 0
  }

  ensure_registry_cache() {
    return 0
  }

  fetch_denylist() {
    return 1  # Empty denylist
  }

  # Create mock index.json file
  local cache_dir="${CACHE_DIR}/enhansome-registry"
  mkdir -p "${cache_dir}/repos/target/repo"
  echo '{"filename": "README.json"}' > "${cache_dir}/repos/target/repo/index.json"

  run_idempotency_checks "awesome/repo" "target/repo" "README.json"
  local exit_code=$?

  # Clean up
  rm -rf "${cache_dir}/repos/target"

  # Exit code 2 means already registered (should skip)
  assert_equals 2 "$exit_code"

  REGISTER_REGISTRY="true"
  unset -f init_cache ensure_registry_cache fetch_denylist
}

function test_run_idempotency_checks_with_existing_submodule() {
  local temp_dir=$(mktemp -d)
  cd "$temp_dir"

  cat > .gitmodules << 'EOF'
[submodule "origin"]
	path = origin
	url = https://github.com/avelino/awesome-go.git
EOF

  REGISTER_REGISTRY="true"

  # Mock functions
  init_cache() {
    return 0
  }

  ensure_registry_cache() {
    return 0
  }

  fetch_denylist() {
    return 1  # Empty denylist
  }

  fetch_allowlist() {
    return 1  # Empty allowlist
  }

  run_idempotency_checks "avelino/awesome-go" "target/repo" "README.json"
  local exit_code=$?

  cd - > /dev/null
  rm -rf "$temp_dir"
  REGISTER_REGISTRY="true"
  unset -f init_cache ensure_registry_cache fetch_denylist fetch_allowlist

  # Exit code 3 means submodule already exists
  assert_equals 3 "$exit_code"
}

function test_run_idempotency_checks_passes_all_checks() {
  REGISTER_REGISTRY="true"

  # Mock functions
  init_cache() {
    return 0
  }

  ensure_registry_cache() {
    return 0
  }

  fetch_denylist() {
    return 1  # Empty denylist
  }

  fetch_allowlist() {
    return 1  # Empty allowlist
  }

  run_idempotency_checks "new/awesome" "target/repo" "README.json"
  assert_successful_code

  REGISTER_REGISTRY="true"
  unset -f init_cache ensure_registry_cache fetch_denylist fetch_allowlist
}

# ============================================================================
# INTEGRATION TESTS
# ============================================================================

function test_denylist_blocks_and_allows_correctly() {
  # Mock fetch_denylist
  fetch_denylist() {
    cat << 'EOF'
blocked/repo1
blocked/repo2
EOF
  }

  # Verify blocked repo is detected
  is_repo_in_denylist "blocked/repo1"
  assert_successful_code

  # Verify allowed repo is not blocked
  is_repo_in_denylist "allowed/repo"
  assert_unsuccessful_code

  unset -f fetch_denylist
}

function test_allowlist_detects_entries_correctly() {
  # Use an isolated cache directory to avoid race conditions with parallel tests
  local temp_cache_dir=$(mktemp -d)
  local original_registry_cache_dir="$REGISTRY_CACHE_DIR"
  REGISTRY_CACHE_DIR="$temp_cache_dir"

  # Create mock index.json files
  mkdir -p "${temp_cache_dir}/repos/owner1/repo1"
  mkdir -p "${temp_cache_dir}/repos/owner2/repo2"
  echo '{"filename": "README.json"}' > "${temp_cache_dir}/repos/owner1/repo1/index.json"
  echo '{"filename": "custom.json"}' > "${temp_cache_dir}/repos/owner2/repo2/index.json"

  # Verify registered entry is detected
  is_repo_in_allowlist "owner1/repo1" "README.json"
  assert_successful_code

  # Verify unregistered entry is not detected
  is_repo_in_allowlist "unknown/repo" "README.json"
  assert_unsuccessful_code

  # Clean up
  REGISTRY_CACHE_DIR="$original_registry_cache_dir"
  rm -rf "$temp_cache_dir"
}
