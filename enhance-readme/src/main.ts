import * as core from "@actions/core";
import { processMarkdownFile, ReplacementRule } from "./markdown.js";

/**
 * Parses the raw multiline input strings into a structured array of replacement rules.
 * @param findAndReplaceRaw Raw string for literal replacements.
 * @param regexFindAndReplaceRaw Raw string for regex replacements.
 * @returns An array of ReplacementRule objects.
 */
function parseReplacementRules(
  findAndReplaceRaw: string,
  regexFindAndReplaceRaw: string
): ReplacementRule[] {
  const rules: ReplacementRule[] = [];
  const separator = ":::";

  // Parse literal replacements
  if (findAndReplaceRaw) {
    findAndReplaceRaw
      .split("\n")
      .filter((line) => line.trim() && line.includes(separator))
      .forEach((line) => {
        const [find, ...rest] = line.split(separator);
        rules.push({
          type: "literal",
          find: find,
          replace: rest.join(separator),
        });
      });
  }

  // Parse regex replacements
  if (regexFindAndReplaceRaw) {
    regexFindAndReplaceRaw
      .split("\n")
      .filter((line) => line.trim() && line.includes(separator))
      .forEach((line) => {
        const [find, ...rest] = line.split(separator);
        rules.push({
          type: "regex",
          find: find,
          replace: rest.join(separator),
        });
      });
  }

  return rules;
}

/**
 * Main function for the GitHub Action.
 */
async function run(): Promise<void> {
  try {
    // --- Get Inputs ---
    const token = core.getInput("github_token", { required: true });
    const markdownFilesRaw = core.getInput("markdown_files", {
      required: true,
    });
    const findAndReplaceRaw = core.getInput("find_and_replace");
    const regexFindAndReplaceRaw = core.getInput("regex_find_and_replace");

    // --- Validate Inputs ---
    if (!markdownFilesRaw) {
      core.setFailed("Markdown files input is required.");
      return;
    }
    const filePaths = markdownFilesRaw.split(/\s+/).filter(Boolean);
    if (filePaths.length === 0) {
      core.warning("No markdown files specified to process.");
      return;
    }

    // --- Parse Rules ---
    const rules = parseReplacementRules(findAndReplaceRaw, regexFindAndReplaceRaw);

    // --- Process Files ---
    core.info(`Markdown files to process: ${filePaths.join(", ")}`);
    for (const filePath of filePaths) {
      await processMarkdownFile(filePath, token, rules);
    }

    core.info("Process finished.");
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