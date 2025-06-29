import * as core from "@actions/core";
import * as fs from "fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Link } from "mdast"; // Markdown AST types
import { getRepoInfo, parseGitHubUrl, RepoInfoDetails } from "./github.js";

/**
 * Formats an ISO date string into YYYY-MM-DD format.
 * @param isoString The date string to format.
 */
function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  return new Date(isoString).toISOString().split("T")[0];
}

/**
 * Builds the text for the information badge.
 * @param info The repository information object.
 */
function formatRepoInfo(info: RepoInfoDetails): string {
  // If the repo is archived, that's the most important piece of information.
  if (info.archived) {
    return " ⚠️ Archived";
  }

  const parts: string[] = [];
  parts.push(`⭐ ${info.stargazers_count.toLocaleString()}`);
  parts.push(`🐛 ${info.open_issues_count.toLocaleString()}`);

  if (info.language) {
    parts.push(`🌐 ${info.language}`);
  }

  if (info.pushed_at) {
    parts.push(`📅 ${formatDate(info.pushed_at)}`);
  }

  return ` ${parts.join(" | ")}`;
}

/**
 * Processes a single markdown file to find GitHub links and append rich info badges.
 * @param filePath Path to the markdown file.
 * @param token GitHub API token.
 */
export async function processMarkdownFile(
  filePath: string,
  token: string
): Promise<void> {
  core.info(`Processing file: ${filePath}`);
  try {
    const originalContent = await fs.readFile(filePath, "utf-8");

    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkInfoBadges, { token })
      .use(remarkStringify);

    const vfile = await processor.process(originalContent);
    let processedContent = String(vfile);

    // Manually enforce the "minimal change" rule for the final newline.
    const originalHadNewline =
      originalContent.endsWith("\n") || originalContent === "";
    const processedHasNewline = processedContent.endsWith("\n");

    if (processedHasNewline && !originalHadNewline) {
      processedContent = processedContent.slice(0, -1);
    }

    if (vfile.data.changesMade) {
      await fs.writeFile(filePath, processedContent, "utf-8");
      core.info(`Successfully updated ${filePath} with rich info badges.`);
    } else {
      core.info(`No changes made to ${filePath}.`);
    }
  } catch (error: any) {
    core.error(`Error processing file ${filePath}: ${error.message}`);
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

/**
 * A custom 'remark' plugin to add rich information badges to GitHub links.
 */
function remarkInfoBadges(options: { token: string }) {
  return async function (tree: Root, file: any) {
    const { token } = options;
    const linkNodesToUpdate: { node: Link; parent: any; index: number }[] = [];

    // Synchronously collect all link nodes that might need a badge.
    visit(tree, "link", (node: Link, index, parent) => {
      if (index === undefined || !parent) return;

      // Check if the next sibling is already a badge from this action.
      const nextNode = parent.children[index + 1];
      if (
        nextNode &&
        nextNode.type === "text" &&
        /^\s*(⭐|⚠️)/.test(nextNode.value)
      ) {
        return;
      }

      const repoDetails = parseGitHubUrl(node.url);
      if (repoDetails) {
        linkNodesToUpdate.push({ node, parent, index });
      }
    });

    if (linkNodesToUpdate.length === 0) {
      return;
    }

    // Asynchronously fetch information for all collected links.
    const infoPromises = linkNodesToUpdate.map(async ({ node }) => {
      const repoDetails = parseGitHubUrl(node.url)!;
      return getRepoInfo(repoDetails.owner, repoDetails.repo, token);
    });

    const repoInfos = await Promise.all(infoPromises);
    let changesMade = false;

    // Iterate backwards to safely splice new nodes into the tree.
    for (let i = linkNodesToUpdate.length - 1; i >= 0; i--) {
      const { parent, index } = linkNodesToUpdate[i];
      const info = repoInfos[i];

      if (info) {
        const badgeNode = {
          type: "text",
          value: formatRepoInfo(info),
        };
        parent.children.splice(index + 1, 0, badgeNode);
        changesMade = true;
      }
    }

    if (changesMade) {
      file.data.changesMade = true;
    }
  };
}
