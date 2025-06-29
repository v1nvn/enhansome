import * as core from "@actions/core";
import * as fs from "fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Link } from "mdast"; // Markdown AST types
import { getStarCount, parseGitHubUrl } from "./github.js";

/**
 * Processes a single markdown file to find GitHub links and append star counts.
 * This function uses an AST parser to safely modify the markdown content,
 * correctly ignoring links inside code blocks.
 *
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
    let changesMade = false;

    // The unified processor pipeline
    const processor = unified()
      .use(remarkParse) // 1. Parse markdown text into a syntax tree (mdast)
      .use(remarkGfm) // 2. Add support for GitHub Flavored Markdown (autolinks etc.)
      .use(remarkStarBadges, { token }) // 3. Our custom plugin to add star badges
      .use(remarkStringify); // 4. Turn the modified syntax tree back into markdown

    // Process the content
    const vfile = await processor.process(originalContent);
    // Get the content stringified by the processor
    let processedContent = String(vfile);

    // Manually enforce the "minimal change" rule for the final newline.
    const originalHadNewline =
      originalContent.endsWith("\n") || originalContent === "";
    const processedHasNewline = processedContent.endsWith("\n");

    // If the processor added a newline where there wasn't one, remove it.
    if (processedHasNewline && !originalHadNewline) {
      processedContent = processedContent.slice(0, -1);
    }

    // A custom property can be set on the vfile to track changes
    if (vfile.data.changesMade) {
      await fs.writeFile(filePath, processedContent, "utf-8");
      core.info(`Successfully updated ${filePath} with star counts.`);
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
 * A custom 'remark' plugin for the 'unified' processor.
 * A plugin is a function that can receive options and returns a "transformer".
 * A transformer is a function that operates on the AST.
 */
function remarkStarBadges(options: { token: string }) {
  // The transformer function
  return async function (tree: Root, file: any) {
    const { token } = options;
    const linkNodesToUpdate: { node: Link; parent: any; index: number }[] = [];

    // First, synchronously visit all link nodes and collect the ones we might update.
    // We do this to avoid modifying the tree while iterating over it.
    visit(tree, "link", (node: Link, index, parent) => {
      if (index === undefined || !parent) return; // Should not happen

      // Check if the next sibling is already a star badge. If so, skip.
      const nextNode = parent.children[index + 1];
      if (
        nextNode &&
        nextNode.type === "text" &&
        /^\s*⭐/.test(nextNode.value)
      ) {
        return;
      }

      const repoInfo = parseGitHubUrl(node.url);
      if (repoInfo) {
        linkNodesToUpdate.push({ node, parent, index });
      }
    });

    if (linkNodesToUpdate.length === 0) {
      return; // No links to update, exit early.
    }

    // Now, process the collected nodes asynchronously
    const starPromises = linkNodesToUpdate.map(async ({ node }) => {
      const repoInfo = parseGitHubUrl(node.url)!; // We know it's valid from the visit step
      return getStarCount(repoInfo.owner, repoInfo.repo, token);
    });

    const starCounts = await Promise.all(starPromises);
    let changesMade = false;

    // Iterate backwards to safely splice new nodes into the children array
    for (let i = linkNodesToUpdate.length - 1; i >= 0; i--) {
      const { parent, index } = linkNodesToUpdate[i];
      const starCount = starCounts[i];

      if (starCount !== null) {
        const badgeNode = {
          type: "text",
          value: ` ⭐ ${starCount.toLocaleString()}`,
        };
        // Insert the badge right after the link node
        parent.children.splice(index + 1, 0, badgeNode);
        changesMade = true;
      }
    }

    // Let the main function know if we made changes
    if (changesMade) {
      file.data.changesMade = true;
    }
  };
}
