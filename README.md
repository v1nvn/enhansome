# Enhansome

> Enhance + awesome = **Enhansome**

This repository contains a collection of GitHub Actions designed to help maintain and enhance "awesome lists" or similar repositories that aggregate links, especially those pointing to GitHub projects.

The primary goal is to automate tasks like keeping content synchronized with an upstream source (via submodules) and enriching information, such as displaying GitHub star counts for linked repositories.

## Actions

This toolkit provides the following actions:

1. **Composite: Awesome List Enhancer** (`v1nvn/enhansome@v1`)

    - **Description**: This is the main composite action that orchestrates the entire process:
      1. Updates a specified Git submodule.
      2. Syncs content from the submodule to a specified destination in your repository (e.g., the root).
      3. Enhances specified markdown files by finding GitHub repository links and appending their current star counts.
    - **Usage**: Ideal for a workflow that regularly updates an enhanced version of an external awesome list.
    - **Path in toolkit**: `/action.yml` (root of this repository)

2. **Individual: Update Git Submodule** (`v1nvn/enhansome/update-submodule@v1`)

    - **Description**: Initializes and updates a Git submodule to the latest commit on its default branch.
    - **Path in toolkit**: `update-submodule/action.yml`

3. **Individual: Sync Submodule Content** (`v1nvn/enhansome/sync-submodule@v1`)

    - **Description**: Syncs content from a source directory (typically a submodule) to a destination directory using `rsync`. It supports including files and directories.
    - **Path in toolkit**: `sync-submodule/action.yml`

4. **Individual: Enhance Markdown with GitHub Stars** (`v1nvn/enhansome/enhance-readme@v1`)
    - **Description**: A Docker-based action that parses specified markdown files, identifies GitHub repository links, fetches their star counts via the GitHub API, and appends this information next to the links.
    - **Path in toolkit**: `enhance-readme-stars/action.yml`

## How to Use

1. Init a git repo

```shell
$ git init -y
```

2. Add a submodule of the target repo in your git repo.

```shell
$ git submodule add https://github.com/jorgebucaran/awsm.fish origin
```

> Using `origin` here as it is the default source directory used in action.

3. Create a github workflow.

### Example: Using the Main Composite Action

In your workflow file (e.g., `.github/workflows/main.yml` in the repository that uses this toolkit):

```yaml
name: Enhance Awesome List

on:
  schedule:
    - cron: "0 4 * * *" # Run daily at 4 AM UTC
  workflow_dispatch: # Allow manual triggering
  push: # For testing: trigger on push to main branch (remove for production if noisy)
    branches:
      - main # or your default branch

jobs:
  enhance_and_commit:
    runs-on: ubuntu-latest
    # Set permissions for GITHUB_TOKEN.
    # `contents: write` is needed to push changes to this repository.
    permissions:
      contents: write

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          # The token used here needs write permissions to THIS repository for the commit/push step
          # that is now INSIDE the composite action.
          # If using default GITHUB_TOKEN, ensure it has `contents: write` permission
          # (set at the job level or workflow level as above).
          # A PAT (secrets.PAT_FOR_COMMIT_ACCESS) can be used if more specific permissions are needed
          # or if committing as a different user identity is required by the commit action.
          # However, stefanzweifel/git-auto-commit-action typically uses the GITHUB_TOKEN.
          # token: ${{ secrets.PAT_FOR_COMMIT_ACCESS }} # Only if specific PAT is needed for checkout/commit identity
          submodules: "true" # Initialize submodules, though our action will update 'origin'

      - name: Run Awesome List Enhancer and Commit
        uses: v1nvn/enhansome@v1
        id: enhansome
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # submodule_path: 'origin'
          # content_destination_path: '.'
          # files_to_enhance: 'README.md'
          # items_to_sync: 'README.md'
          # extra_rsync_args: ""
          # do_commit: 'true' # Explicitly enable commit, though it's the default in the toolkit
          # commit_message: "docs(enhance): ✨ Auto-update awesome list with latest content and star counts"
          # commit_user_name: "Enhansome" # Custom bot name
          # commit_user_email: "actions-bot@users.noreply.github.com" # Standard GitHub Actions bot email
          # commit_branch: 'main' # Optional: specify branch if not current

      - name: Enhancement Complete
        if: success()
        run: echo "Awesome list enhancement process complete. Changes (if any) have been committed by the toolkit."
```

## Development

(Add details about how to develop these actions, build the Docker image for `enhance-readme`, etc.)

### `enhance-readme` (TypeScript Action)

- Source code is in `enhance-readme/src/`.
- Build with `npm run build` inside `enhance-readme/`.
- The `Dockerfile` compiles the TypeScript code when the Docker image for the action is built by GitHub Actions.

## License

This toolkit is available under the MIT License. See the [LICENSE](LICENSE) file for more info.
