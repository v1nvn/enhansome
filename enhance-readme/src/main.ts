import * as core from "@actions/core";
import { processMarkdownFile, ReplacementRule } from "./markdown.js";

function parseReplacementRules(
  findAndReplaceRaw: string,
  regexFindAndReplaceRaw: string
): ReplacementRule[] {
  const rules: ReplacementRule[] = [];
  const separator = ":::";

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

async function run(): Promise<void> {
  try {
    const token = core.getInput("github_token", { required: true });
    const markdownFilesRaw = core.getInput("markdown_files", { required: true });
    const findAndReplaceRaw = core.getInput("find_and_replace");
    const regexFindAndReplaceRaw = core.getInput("regex_find_and_replace");
    const disableBranding = core.getInput("disable_branding") === 'true';

    const filePaths = markdownFilesRaw.split(/\s+/).filter(Boolean);
    if (filePaths.length === 0) {
      core.warning("No markdown files specified to process.");
      return;
    }

    // Start with user-defined rules
    const rules = parseReplacementRules(findAndReplaceRaw, regexFindAndReplaceRaw);

    // Prepend the default branding rule unless disabled
    if (!disableBranding) {
      rules.unshift({ type: 'branding' });
      core.debug("Default branding is enabled.");
    }

    core.info(`Markdown files to process: ${filePaths.join(", ")}`);
    for (const filePath of filePaths) {
      await processMarkdownFile(filePath, token, rules);
    }

    core.info("Process finished.");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed with error: ${error.message}`);
    } else {
      core.setFailed(`Action failed with an unknown error: ${error}`);
    }
  }
}

run();