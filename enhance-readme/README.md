# Awesome List Toolkit

This repository contains a collection of GitHub Actions designed to help maintain and enhance "awesome lists" or similar repositories that aggregate links, especially those pointing to GitHub projects.

The primary goal is to automate tasks like keeping content synchronized with an upstream source (via submodules) and enriching information, such as displaying GitHub star counts for linked repositories.

## Actions

This toolkit provides the following actions:

1.  **Composite: Awesome List Enhancer** (`your-username/awesome-list-toolkit@v1`)
    * **Description**: This is the main composite action that orchestrates the entire process:
        1.  Updates a specified Git submodule.
        2.  Syncs content from the submodule to a specified destination in your repository (e.g., the root).
        3.  Enhances specified markdown files by finding GitHub repository links and appending their current star counts.
    * **Usage**: Ideal for a workflow that regularly updates an enhanced version of an external awesome list.
    * **Path in toolkit**: `/action.yml` (root of this repository)

2.  **Individual: Update Git Submodule** (`your-username/awesome-list-toolkit/update-submodule@v1`)
    * **Description**: Initializes and updates a Git submodule to the latest commit on its default branch.
    * **Path in toolkit**: `update-submodule/action.yml`

3.  **Individual: Sync Submodule Content** (`your-username/awesome-list-toolkit/sync-submodule-content@v1`)
    * **Description**: Syncs content from a source directory (typically a submodule) to a destination directory using `rsync`. It supports excluding files and directories.
    * **Path in toolkit**: `sync-submodule-content/action.yml`

4.  **Individual: Enhance Markdown with GitHub Stars** (`your-username/awesome-list-toolkit/enhance-readme-stars@v1`)
    * **Description**: A Docker-based action that parses specified markdown files, identifies GitHub repository links, fetches their star counts via the GitHub API, and appends this information next to the links.
    * **Path in toolkit**: `enhance-readme-stars/action.yml`

## How to Use

Refer to the `action.yml` file of each action (or the main composite action) for detailed inputs, outputs, and usage examples.

### Example: Using the Main Composite Action

In your workflow file (e.g., `.github/workflows/main.yml` in the repository that uses this toolkit):

```yaml
name: Enhance Awesome List

on:
  schedule:
    - cron: '0 3 * * *' # Run daily at 3 AM UTC
  workflow_dispatch: # Allow manual triggering

jobs:
  enhance_list:
    runs-on: ubuntu-latest
    permissions:
      contents: write # Required for committing changes
      pull-requests: write # Optional: if you want the action to create PRs

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          # Token with push access to THIS repository, if different from GITHUB_TOKEN
          # For pushing changes back to the repo.
          # Ensure this token has 'contents: write' permission.
          token: ${{ secrets.PAT_FOR_COMMIT_ACCESS }} # Or use default GITHUB_TOKEN if permissions are set repo-wide
          submodules: 'true' # Checkout submodules, but our action will update it.

      - name: Run Awesome List Enhancer
        uses: your-username/awesome-list-toolkit@v1 # Replace with your GitHub username
        id: enhancer
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }} # Standard token for API calls
          submodule_path: 'origin' # Path to your submodule directory
          content_destination_path: '.' # Sync to the root of your repo
          files_to_enhance: 'README.md another-list.md' # Files to add stars to
          # Optional: Provide a file within your submodule listing rsync excludes
          # rsync_exclude_from_file: '.rsync-custom-excludes'

      - name: Commit and Push Changes
        if: success() # Or check outputs from the enhancer step if it provides change indicators
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "docs: ✨ Auto-enhance list with latest content and star counts"
          # commit_user_name: Your Bot Name
          # commit_user_email: your-bot-email@example.com
          # commit_author: Author <actions@github.com>
          # add: '*.md ${{ steps.enhancer.outputs.submodule_path_internal }}' # Be specific if possible, or let it auto-detect
          # The submodule path itself needs to be added if its commit hash changed.
          # The 'git add' for the submodule path (e.g., 'origin') should be handled by this commit action
          # if it detects changes there.
          # The submodule update action in the toolkit ensures the submodule is updated,
          # the auto-commit action should pick up the change to the submodule's recorded commit.
```

**Note on `rsync_exclude_from_file` for the composite action:**
The `sync-submodule-content` action (and thus the main composite action) uses `rsync --delete`. This means files in the `content_destination_path` that are *not* in the `submodule_path` (and not excluded) will be deleted. It's crucial to correctly configure exclusions to protect files unique to your "enhanced sister repo" (like `.github/workflows/main.yml`, your main `LICENSE`, `.gitmodules`, etc.).
The `rsync_exclude_from_file` input should point to a file *within the submodule directory* that lists patterns to exclude from being copied *from the submodule* or to prevent deletion *at the destination if they match patterns relative to the source*.
Alternatively, the `sync-submodule-content` action has some basic default excludes for `.git/` and `.github/` if no exclude file is found, but a custom exclude file is highly recommended for precise control.

## Development

(Add details about how to develop these actions, build the Docker image for `enhance-readme-stars`, etc.)

### `enhance-readme-stars` (TypeScript Action)

-   Source code is in `enhance-readme-stars/src/`.
-   Build with `npm run build` inside `enhance-readme-stars/`.
-   The `Dockerfile` compiles the TypeScript code when the Docker image for the action is built by GitHub Actions.

## License

This toolkit is available under the MIT License. See the [LICENSE](LICENSE) file for more info.
