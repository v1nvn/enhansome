import * as core from "@actions/core";
import { processMarkdownFile } from "./markdown.js";

/**
 * Main function for the GitHub Action.
 */
async function run(): Promise<void> {
  try {
    const token = core.getInput("github_token", { required: true });
    const markdownFilesRaw = core.getInput("markdown_files", {
      required: true,
    });
    // working_directory is handled by entrypoint.sh `cd` command.
    // Files are relative to GITHUB_WORKSPACE / INPUT_WORKING_DIRECTORY

    if (!token) {
      core.setFailed("GitHub token is required.");
      return;
    }
    if (!markdownFilesRaw) {
      core.setFailed("Markdown files input is required.");
      return;
    }

    const filePaths = markdownFilesRaw.split(/\s+/).filter(Boolean); // Split by space and remove empty strings

    if (filePaths.length === 0) {
      core.warning("No markdown files specified to process.");
      return;
    }

    core.info(`Markdown files to process: ${filePaths.join(", ")}`);

    for (const filePath of filePaths) {
      await processMarkdownFile(filePath, token);
    }

    core.info("Star enhancement process finished.");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed with error: ${error.message}`);
      if (error.stack) {
        core.debug(error.stack);
      }
    } else {
      core.setFailed(`Action failed with an unknown error: ${error}`);
    }
  }
}

// Execute the action
run();
