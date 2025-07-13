# Enhansome - Awesome List Enhancer

[](https://www.google.com/search?q=https://github.com/marketplace/actions/awesome-list-enhancer)
[](https://www.google.com/search?q=https://github.com/v1nvn/enhansome/actions/workflows/test-action.yml)

A GitHub Action that automatically syncs an external "Awesome List" and enriches it with up-to-date GitHub star counts and other metadata.

Never manually copy-paste from an upstream list again\! Keep your curated list effortlessly synchronized and enhanced.

-----

## Features

- 🔄 **Auto-Sync:** Keeps content synchronized with an upstream repository using Git submodules.
- ✨ **Enhance with Stars:** Automatically finds GitHub links in your markdown files and appends rich info badges with star counts, issue counts, language, and last update date.
- 📂 **Flexible Syncing:** Uses `rsync` to selectively sync files and directories from the submodule to your repository.
- 🤖 **Auto-Commit:** Commits any changes made during the enhancement process directly back to your repository.
- 🔧 **Fully Configurable:** Customize everything from commit messages to the files being processed.

-----

## Quick Start Guide

This guide provides two ways to set up the action: a fully automated one-liner script, and a manual step-by-step walkthrough.

### One-Liner Setup (Recommended)

This script will automate everything: create a new repository on your GitHub account, add the submodule, and set up the workflow file.

**Prerequisites:** You must have the [GitHub CLI (`gh`)](https://www.google.com/search?q=%5Bhttps://cli.github.com/%5D\(https://cli.github.com/\)) and `git` installed.

Run the following command in your terminal:

```sh
bash -c "$(curl -fsSL https://raw.githubusercontent.com/v1nvn/enhansome/main/setup.sh)"
```

The script will prompt you for the upstream "Awesome List" repository you want to use and the name for your new repository.

### Manual Setup Walkthrough

Follow these steps if you prefer to set up your repository manually.

#### Step 1: Create Your Repository

First, create a new, empty repository on your local machine and on GitHub.

1. **On your local machine**, create a new folder and initialize it as a Git repository.

    ```sh
    mkdir my-awesome-list
    cd my-awesome-list
    git init
    ```

2. **On GitHub**, create a new, empty repository (without a README or license). After creating it, copy the remote URL.

3. **Link your local repository to GitHub** and make your first commit.

    ```sh
    # Replace the URL with the one you copied from GitHub
    git remote add origin https://github.com/your-username/my-awesome-list.git

    # Create an empty commit to initialize the main branch
    git commit --allow-empty -m "Initial commit"
    git push -u origin main
    ```

#### Step 2: Add the Upstream List as a Submodule

Now, add the "Awesome List" you want to track as a **Git submodule**. The command below adds it to a directory named `origin`, which the action uses by default.

```sh
# This command adds the 'awsm.fish' list into a local folder named 'origin'
git submodule add https://github.com/jorgebucaran/awsm.fish origin
```

Commit and push this new submodule to your repository.

```sh
git add .
git commit -m "feat: Add awesome list submodule"
git push
```

#### Step 3: Create the GitHub Action Workflow

Create a workflow file to automate the enhancement process.

1. **Create the necessary folders** in your project.

    ```sh
    mkdir -p .github/workflows
    ```

2. **Create a new workflow file** named `sync.yml`.

    ```sh
    touch .github/workflows/sync.yml
    ```

3. **Paste the following code** into the `sync.yml` file:

    ```yml
    name: Sync and Enhance Awesome List

    on:
      schedule:
        # Runs daily at 4 AM UTC. You can change this schedule.
        - cron: "0 4 * * *"
      # Allows you to run this workflow manually from the Actions tab.
      workflow_dispatch: {}

    jobs:
      enhance-list:
        runs-on: ubuntu-latest
        
        # This permission is required for the action to commit changes.
        permissions:
          contents: write

        steps:
          - name: Checkout Repository
            uses: actions/checkout@v4
            with:
              # This is crucial for accessing the submodule's content.
              submodules: 'true'

          - name: Run Awesome List Enhancer
            uses: v1nvn/enhansome@v1 # Use the latest major version
            with:
              # This token is required for fetching star counts from the GitHub API.
              github_token: ${{ secrets.GITHUB_TOKEN }}
    ```

#### Step 4: Push and Verify

Commit the new workflow file and push it to GitHub. This will activate the action.

```sh
git add .github/workflows/sync.yml
git commit -m "ci: Add awesome list enhancement workflow"
git push
```

Your setup is complete\! The action will now run automatically on schedule. To run it immediately, go to the **Actions** tab on your GitHub repository page, select the workflow, and click **"Run workflow"**.

-----

## Action Inputs

| Input | Description | Required | Default |
|---|---|:---:|---|
| `github_token` | Token for GitHub API calls. `secrets.GITHUB_TOKEN` is recommended. | **`true`** | |
| `submodule_path` | The local path to the Git submodule. | `false` | `origin` |
| `content_destination_path` | The destination path in your repo where submodule content will be synced. | `false` | `.` (root) |
| `files_to_enhance` | A space-separated list of markdown files to enhance with star badges. | `false` | `README.md` |
| `items_to_sync` | Space-separated list of files/directories to sync from the submodule. | `false` | `README.md` |
| `extra_rsync_args` | Any extra arguments to pass to the `rsync` command. | `false` | |
| `do_commit` | Set to `'true'` to automatically commit changes. | `false` | `'true'` |
| `commit_message` | The commit message to use for the update. | `false` | `docs(enhance): ✨ Auto-update awesome list` |
| `commit_user_name` | The git user name for the commit. | `false` | `Enhansome Bot` |
| `commit_user_email` | The git user email for the commit. | `false` | `actions-bot@...` |
| `commit_branch` | The branch to commit the changes to. | `false` | The current branch |

-----

## Contributing

This project is a toolkit containing multiple individual and composite actions. For details on the project structure and how to contribute, please see [CONTRIBUTING.md](https://www.google.com/search?q=CONTRIBUTING.md).

## License

This project is licensed under the MIT License.
