import * as core from "@actions/core";
import * as fs from "fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Link } from "mdast";
import { getRepoInfo, parseGitHubUrl, RepoInfoDetails } from "./github.js";

// Common interface for all replacement operations
export type ReplacementRule =
  | {
      type: "literal" | "regex";
      find: string;
      replace: string;
    }
  | { type: "branding" };

/**
 * Formats an ISO date string into YYYY-MM-DD format.
 */
function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  return new Date(isoString).toISOString().split("T")[0];
}

/**
 * Builds the text for the information badge.
 */
function formatRepoInfo(info: RepoInfoDetails): string {
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

function applyReplacements(content: string, rules: ReplacementRule[]): string {
  let processedContent = content;

  for (const rule of rules) {
    if (rule.type === "literal") {
      core.debug(
        `Applying literal replacement: '${rule.find}' -> '${rule.replace}'`
      );
      processedContent = processedContent.replaceAll(rule.find, rule.replace);
    } else if (rule.type === "regex") {
      try {
        const regex = new RegExp(rule.find, "gm");
        core.debug(
          `Applying regex replacement: /${rule.find}/gm -> '${rule.replace}'`
        );
        processedContent = processedContent.replace(regex, rule.replace);
      } catch (e: any) {
        core.warning(
          `Skipping invalid regex pattern '${rule.find}': ${e.message}`
        );
      }
    } else if (rule.type === "branding") {
      core.debug("Applying default branding replacement for title.");
      const brandingRegex = new RegExp("^# (Awesome[\\s-].+)$", "gm");
      processedContent = processedContent.replace(
        brandingRegex,
        "# $1 with stars"
      );
    }
  }

  return processedContent;
}

export async function processMarkdownFile(
  filePath: string,
  token: string,
  rules: ReplacementRule[] = []
): Promise<void> {
  core.info(`Processing file: ${filePath}`);
  try {
    const originalContent = await fs.readFile(filePath, "utf-8");

    const contentAfterReplacements = applyReplacements(originalContent, rules);

    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkInfoBadges, { token })
      .use(remarkStringify);

    const vfile = await processor.process(contentAfterReplacements);
    let finalContent = String(vfile);

    const originalHadNewline =
      originalContent.endsWith("\n") || originalContent === "";
    if (finalContent.endsWith("\n") && !originalHadNewline) {
      finalContent = finalContent.slice(0, -1);
    }

    if (finalContent !== originalContent) {
      await fs.writeFile(filePath, finalContent, "utf-8");
      core.info(`Successfully updated ${filePath}.`);
    } else {
      core.info(`No changes needed for ${filePath}.`);
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

    visit(tree, "link", (node: Link, index, parent) => {
      if (index === undefined || !parent) return;
      const nextNode = parent.children[index + 1];
      if (nextNode?.type === "text" && /^\s*(⭐|⚠️)/.test(nextNode.value)) {
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

    const infoPromises = linkNodesToUpdate.map(({ node }) => {
      const repoDetails = parseGitHubUrl(node.url)!;
      return getRepoInfo(repoDetails.owner, repoDetails.repo, token);
    });

    const repoInfos = await Promise.all(infoPromises);

    for (let i = linkNodesToUpdate.length - 1; i >= 0; i--) {
      const { parent, index } = linkNodesToUpdate[i];
      const info = repoInfos[i];
      if (info) {
        parent.children.splice(index + 1, 0, {
          type: "text",
          value: formatRepoInfo(info),
        });
      }
    }
  };
}