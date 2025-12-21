# Development Guide

## Quick Start

### Prerequisites

Install required tools:

```bash
make check-deps        # Check what's installed
make install          # Install missing dependencies
```

Required tools:
- `bashunit` - Test framework
- `shellcheck` - Shell script linter
- `act` - Local GitHub Actions testing
- `gh` - GitHub CLI
- `git` - Version control

### Run Tests

```bash
make test             # Run all tests
make test-parallel    # Run tests in parallel (faster)
make test-verbose     # Run with verbose output
make lint             # Run shellcheck + validation
```

## Project Structure

```
.
├── .github/
│   └── workflows/
│       └── tests.yml           # GitHub Actions workflow
├── tests/
│   ├── validation_test.sh      # Input validation tests
│   └── cleanup_test.sh         # Cleanup & error handling tests
├── setup.sh                    # Main script (production-ready)
├── Makefile                    # Development commands
├── DEVELOPMENT.md              # This file
└── README.md                   # User documentation
```

## Makefile Commands

Run `make help` to see all available targets.

### Testing

| Command | Description |
|---------|-------------|
| `make test` | Run all tests |
| `make test-parallel` | Run tests in parallel (faster) |
| `make test-verbose` | Run tests with verbose output |
| `make test-dry-run` | Run tests in dry-run mode |
| `make test-validation` | Run only validation tests |
| `make test-cleanup` | Run only cleanup tests |
| `make test-single FILE=<name>` | Run a single test file |

### Code Quality

| Command | Description |
|---------|-------------|
| `make shellcheck` | Run shellcheck on setup.sh |
| `make shellcheck-all` | Run shellcheck on all shell files |
| `make validate` | Validate syntax and structure |
| `make lint` | Run all linting checks |

### CI/CD

| Command | Description |
|---------|-------------|
| `make ci` | Run CI checks locally (lint + test) |
| `make ci-full` | Run full CI pipeline locally |
| `make pre-commit` | Run pre-commit checks |
| `make pre-push` | Run pre-push checks |

### Utilities

| Command | Description |
|---------|-------------|
| `make coverage` | Generate test coverage report |
| `make stats` | Show test statistics |
| `make info` | Show project information |
| `make format` | Format shell scripts (requires shfmt) |
| `make clean` | Clean up test artifacts |

## Development Workflow

### 1. Make Changes

Edit `setup.sh` or test files in `tests/`.

### 2. Run Tests Locally

```bash
# Quick feedback loop
make test-validation     # If you changed validation logic
make test-cleanup        # If you changed cleanup logic

# Full test suite
make test-parallel       # Fast
make test               # Standard
```

### 3. Lint Your Code

```bash
make lint
```

### 4. Test with act (Optional but Recommended)

```bash
make act-tests
```

### 5. Commit Your Changes

```bash
git add .
git commit -m "fix: your change description"
```

### 6. Run Pre-Push Checks

```bash
make pre-push
```

### 7. Push and Create PR

```bash
git push origin your-branch
```

---

## Testing

### Test Framework

**bashunit v0.28.0** - A modern, fast, and simple testing library for Bash scripts.

- Pure Bash tests - No DSL to learn
- Parallel execution - Fast test runs
- Rich assertions - Comprehensive assertion library
- Test isolation - No state leakage between tests
- Compatible with Bash strict mode (`set -euo pipefail`)

Documentation: https://bashunit.typeddevs.com

### Test Suites

#### Validation Tests (`tests/validation_test.sh`)

Tests cover:
- Repository format validation
- Input sanitization (newlines, carriage returns)
- Path validation and traversal prevention
- Helper functions (extract owner/name, transformations)
- Prerequisites checking
- Directory state checks

#### Cleanup Tests (`tests/cleanup_test.sh`)

Tests cover:
- Cleanup on error scenarios
- Dry-run mode functionality
- Logging functions
- Error handling

### Writing Tests

#### Test File Structure

```bash
#!/bin/bash

# Source setup.sh for testing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../setup.sh"

function test_your_function() {
  # Arrange
  local input="test-value"

  # Act
  local result=$(your_function "$input")

  # Assert
  assert_equals "expected" "$result"
}
```

#### Common Assertions

```bash
assert_equals "expected" "$actual"
assert_contains "$haystack" "needle"
assert_matches "$string" "regex_pattern"
assert_successful_code "$?"
assert_general_error "$?"
```

#### Running Tests

```bash
bashunit tests/                    # Run all tests
bashunit --parallel tests/         # Parallel execution
bashunit tests/validation_test.sh  # Specific file
VERBOSE=true bashunit tests/       # Verbose mode
```

### Script Testability

The `setup.sh` script is structured to be testable:

```bash
#!/bin/bash

# Functions are defined first (testable)
function validate_repo_format() { ... }
function sanitize_input() { ... }

# Main logic only runs when executed (not when sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # Main script logic here
fi
```

This allows tests to source the script and test individual functions without executing the main logic.

### Configuration via Environment Variables

```bash
DRY_RUN=true ./setup.sh          # Preview actions
VERBOSE=true ./setup.sh          # Debug output
CLEANUP_ON_ERROR=false ./setup.sh # Disable auto-cleanup
```

---

## Local GitHub Actions Testing (act)

[act](https://github.com/nektos/act) allows you to run GitHub Actions workflows locally using Docker.

### Installation

```bash
# macOS
brew install act

# Or use the Makefile
make install
```

### List Workflow Jobs

```bash
make act-list
```

### Run Specific Jobs

```bash
make act-shellcheck      # Run shellcheck job
make act-tests           # Run tests job
make act-validate        # Run validation job
make act-dry-run         # Run dry-run test job
```

### Run All Workflow Jobs

```bash
make act-all             # Run all jobs
make act-pull-request    # Simulate PR event
make act-push            # Simulate push event
```

### Troubleshooting act

**Problem**: Docker images take time to download on first run
**Solution**: Be patient during the first run. Subsequent runs use cached images.

**Problem**: "Cannot connect to Docker daemon"
**Solution**: Ensure Docker or Colima is running:
```bash
docker ps
colima start  # if using Colima
```

**Problem**: Apple Silicon architecture warnings
**Solution**: Use `--container-architecture linux/amd64` (already in Makefile commands)

---

## GitHub Actions Workflow

The `.github/workflows/tests.yml` runs on:
- Pull requests
- Pushes to `main`
- Manual dispatch

### Workflow Jobs

| Job | Purpose |
|-----|---------|
| **ShellCheck** | Static analysis of shell scripts |
| **Tests** | Run bashunit tests on Ubuntu and macOS |
| **Test Dry-Run** | Validate dry-run functionality |
| **Validate Script** | Check executable, syntax, sourcing |
| **Coverage** | Generate test results (main branch only) |
| **Integration Test** | Run tests in Alpine Linux Docker container |
| **Summary** | Aggregate results, fail if any critical job fails |

### Success Criteria

The workflow passes if all of the following succeed:
- ShellCheck finds no warnings or errors
- All bashunit tests pass on Ubuntu and macOS
- Dry-run mode tests pass
- Script validation passes

### Running CI Locally

```bash
make ci-full    # Run full CI pipeline locally

# Or individual checks
make lint           # Linting (shellcheck + validation)
make test-parallel  # Tests (fast)
make act-tests      # GitHub Actions test job
```

---

## Docker Testing

Run tests in Alpine Linux container (simulates CI environment):

```bash
make docker-test      # Run tests in Alpine
make docker-shell     # Open shell in Alpine container
```

---

## Debugging

### Verbose Test Output

```bash
make test-verbose
```

### Debug Specific Function

```bash
# Source the script in a shell
source setup.sh

# Set verbose mode
VERBOSE=true

# Call the function
your_function "test-input"
```

### Debug with DRY_RUN

```bash
DRY_RUN=true make test
```

### Debug act Failures

```bash
# Run act job with verbose output
act -j tests -W .github/workflows/tests.yml --container-architecture linux/amd64 -v

# Interactive debugging
act -j tests -W .github/workflows/tests.yml --container-architecture linux/amd64 --bind
```

---

## Best Practices

### Code Style

1. **Use strict mode**: All scripts start with `set -euo pipefail`
2. **Document functions**: Include description, arguments, and return values
3. **Validate inputs**: Always validate user inputs
4. **Handle errors**: Use proper error handling and cleanup

### Testing

1. **Write tests first** (TDD): Write failing test → Make it pass → Refactor
2. **Test edge cases**: Empty inputs, invalid formats, null values
3. **Test error paths**: Not just happy paths
4. **Keep tests isolated**: Each test should be independent

### Git Workflow

1. **Small commits**: One logical change per commit
2. **Descriptive messages**: Use conventional commits format
3. **Run tests before pushing**: Use `make pre-push`
4. **Create focused PRs**: One feature/fix per PR

---

## Tools Reference

### bashunit

Documentation: https://bashunit.typeddevs.com

```bash
bashunit tests/                    # Run all tests
bashunit --parallel tests/         # Parallel execution
bashunit tests/validation_test.sh  # Specific file
```

### ShellCheck

Documentation: https://www.shellcheck.net

```bash
shellcheck setup.sh                    # Check single file
shellcheck -S warning setup.sh         # Only warnings and above
shellcheck --exclude=SC2086 setup.sh   # Exclude specific check
```

### act

Documentation: https://github.com/nektos/act

```bash
act -l                                 # List workflows
act -j job-name                        # Run specific job
act -n                                 # Dry-run
act --container-architecture linux/amd64  # For Apple Silicon
```

---

## Common Issues

### "bashunit: command not found"

```bash
make install  # Install all dependencies
```

### Tests fail locally but pass in CI

- Check bash version: `bash --version`
- Check environment variables
- Run in Docker: `make docker-test`

### act fails with "Cannot connect to Docker"

- Ensure Docker Desktop or Colima is running
- Check: `docker ps`

### ShellCheck warnings

- Review output carefully
- Fix or disable specific checks with `# shellcheck disable=SC####`
- Reference: https://www.shellcheck.net/wiki/
