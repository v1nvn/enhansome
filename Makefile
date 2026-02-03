.PHONY: help test test-parallel test-single shellcheck validate clean install act-test act-list act-shellcheck act-tests act-dry-run act-validate format

# Default target
.DEFAULT_GOAL := help

##@ General

help: ## Display this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Testing

test: ## Run all tests
	@echo "Running all tests..."
	@bashunit tests/

test-parallel: ## Run tests in parallel (faster)
	@echo "Running tests in parallel..."
	@bashunit --parallel tests/

test-single: ## Run a single test file (usage: make test-single FILE=validation_test.sh)
	@echo "Running single test: $(FILE)"
	@bashunit tests/$(FILE)

test-validation: ## Run only validation tests
	@echo "Running validation tests..."
	@bashunit tests/validation_test.sh

test-cleanup: ## Run only cleanup tests
	@echo "Running cleanup tests..."
	@bashunit tests/cleanup_test.sh

test-caching: ## Run only caching tests
	@echo "Running caching tests..."
	@bashunit tests/caching_test.sh

test-registry-check: ## Run only registry check tests
	@echo "Running registry check tests..."
	@bashunit tests/registry_check_test.sh

test-cli: ## Run only CLI tests
	@echo "Running CLI tests..."
	@bashunit tests/cli_test.sh

test-watch: ## Watch for changes and re-run tests (requires entr)
	@echo "Watching for changes... (Press Ctrl+C to stop)"
	@find . -name "*.sh" | entr -c make test

##@ Code Quality

shellcheck: ## Run shellcheck on setup.sh
	@echo "Running shellcheck..."
	@shellcheck setup.sh

shellcheck-all: ## Run shellcheck on all shell files
	@echo "Running shellcheck on all shell files..."
	@find . -name "*.sh" -not -path "./tests/*" -exec shellcheck {} +

validate: ## Validate setup.sh syntax and structure
	@echo "Validating setup.sh..."
	@chmod +x setup.sh
	@test -x setup.sh && echo "✅ Script is executable"
	@bash -n setup.sh && echo "✅ Syntax is valid"
	@bash -c 'source setup.sh && echo "✅ Script can be sourced"'

lint: shellcheck validate ## Run all linting checks

##@ Act (Local GitHub Actions Testing)

act-list: ## List all workflow jobs
	@echo "Listing workflow jobs..."
	@act -l -W .github/workflows/tests.yml

act-shellcheck: ## Run shellcheck job locally with act
	@echo "Running shellcheck job with act..."
	@act -j shellcheck -W .github/workflows/tests.yml

act-tests: ## Run tests job locally with act
	@echo "Running tests job with act..."
	@act -j tests -W .github/workflows/tests.yml

act-dry-run: ## Run dry-run test job locally with act
	@echo "Running dry-run test job with act..."
	@act -j test-dry-run -W .github/workflows/tests.yml

act-validate: ## Run validate job locally with act
	@echo "Running validate job with act..."
	@act -j validate-script -W .github/workflows/tests.yml

act-all: ## Run all workflow jobs locally with act
	@echo "Running all workflow jobs with act..."
	@act -W .github/workflows/tests.yml

act-pull-request: ## Simulate pull_request event with act
	@echo "Simulating pull_request event..."
	@act pull_request -W .github/workflows/tests.yml

act-push: ## Simulate push event with act
	@echo "Simulating push event..."
	@act push -W .github/workflows/tests.yml

##@ Installation

install: ## Install dependencies (bashunit, shellcheck)
	@echo "Installing dependencies..."
	@command -v bashunit >/dev/null 2>&1 || \
		(echo "Installing bashunit..." && curl -s https://bashunit.typeddevs.com/install.sh | bash)
	@command -v shellcheck >/dev/null 2>&1 || \
		(echo "Installing shellcheck..." && brew install shellcheck)
	@command -v act >/dev/null 2>&1 || \
		(echo "Installing act..." && brew install act)
	@echo "✅ All dependencies installed"

check-deps: ## Check if all dependencies are installed
	@echo "Checking dependencies..."
	@command -v bashunit >/dev/null 2>&1 && echo "✅ bashunit installed" || echo "❌ bashunit not installed"
	@command -v shellcheck >/dev/null 2>&1 && echo "✅ shellcheck installed" || echo "❌ shellcheck not installed"
	@command -v act >/dev/null 2>&1 && echo "✅ act installed" || echo "❌ act not installed"
	@command -v gh >/dev/null 2>&1 && echo "✅ gh (GitHub CLI) installed" || echo "❌ gh not installed"
	@command -v git >/dev/null 2>&1 && echo "✅ git installed" || echo "❌ git not installed"

##@ Cleanup

clean: ## Clean up test artifacts
	@echo "Cleaning up test artifacts..."
	@rm -f test-results.txt
	@rm -rf .act-cache
	@echo "✅ Cleanup complete"

clean-all: clean ## Clean up everything including dependencies
	@echo "Deep cleaning..."
	@rm -rf lib/bashunit 2>/dev/null || true
	@echo "✅ Deep cleanup complete"

##@ Utilities

format: ## Format shell scripts with shfmt (if installed)
	@command -v shfmt >/dev/null 2>&1 && \
		(echo "Formatting shell scripts..." && shfmt -w -i 2 setup.sh tests/*.sh) || \
		echo "⚠️  shfmt not installed (install with: brew install shfmt)"

coverage: ## Generate test coverage report
	@echo "Generating coverage report..."
	@bashunit tests/ > test-results.txt 2>&1 || true
	@echo "Coverage report saved to test-results.txt"
	@cat test-results.txt

stats: ## Show test statistics
	@echo "Test Statistics:"
	@echo "----------------"
	@echo "Total test files: $$(find tests -name "*_test.sh" | wc -l | tr -d ' ')"
	@echo "Total test functions: $$(grep -h "^function test_" tests/*.sh | wc -l | tr -d ' ')"
	@echo "Lines of code (setup.sh): $$(wc -l < setup.sh | tr -d ' ')"
	@echo "Lines of test code: $$(cat tests/*.sh | wc -l | tr -d ' ')"

##@ CI/CD

ci: lint test ## Run CI checks locally (lint + test)
	@echo "✅ CI checks passed!"

ci-full: clean lint test-parallel act-tests ## Run full CI pipeline locally
	@echo "✅ Full CI pipeline passed!"

pre-commit: lint test ## Run pre-commit checks
	@echo "✅ Pre-commit checks passed!"

pre-push: ci ## Run pre-push checks
	@echo "✅ Pre-push checks passed!"

##@ Docker

docker-test: ## Run tests in Alpine Docker container
	@echo "Running tests in Alpine container..."
	@docker run --rm -v $(PWD):/workspace -w /workspace alpine:latest sh -c '\
		apk add --no-cache bash git curl github-cli && \
		curl -s https://bashunit.typeddevs.com/install.sh | bash && \
		bashunit tests/'

docker-shell: ## Open shell in Alpine Docker container
	@echo "Opening shell in Alpine container..."
	@docker run --rm -it -v $(PWD):/workspace -w /workspace alpine:latest sh -c '\
		apk add --no-cache bash git curl github-cli && \
		bash'

##@ Development

dev-setup: install ## Set up development environment
	@echo "Setting up development environment..."
	@chmod +x setup.sh
	@echo "✅ Development environment ready!"

watch: test-watch ## Alias for test-watch

info: ## Show project information
	@echo "Project: Enhansome Action - setup.sh"
	@echo "Version: $$(head -1 setup.sh | grep -o 'Version: [0-9.]*' || echo 'N/A')"
	@echo "Test Framework: bashunit $$(bashunit --version 2>/dev/null | head -1 | awk '{print $$NF}' || echo 'N/A')"
	@echo "Shell: $$(bash --version | head -1)"
	@echo "Git Branch: $$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/A')"
	@echo "Git Status: $$(git status --short 2>/dev/null | wc -l | tr -d ' ') file(s) modified"
