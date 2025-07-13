import * as core from "@actions/core";
import * as fs from "fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Link, ListItem, List, Node } from "mdast";
import { getRepoInfo, parseGitHubUrl, RepoInfoDetails } from "./github.js";

// Common interface for all replacement operations
export type ReplacementRule =
  | {
      type: "literal" | "regex";
      find: string;
      replace: string;
    }
  | { type: "branding" };

export interface SortOptions {
  by: 'stars' | 'last_commit' | '';
  minLinks: number;
}

interface EnrichedListItem {
  node: ListItem;
  repoInfo: RepoInfoDetails | null;
  githubUrl?: string;
}


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

// Helper to find the first valid GitHub link in a list item
function findGitHubLink(node: ListItem): string | undefined {
  let linkUrl: string | undefined;
  visit(node, "link", (linkNode: Link) => {
    if (!linkUrl && parseGitHubUrl(linkNode.url)) {
      linkUrl = linkNode.url;
    }
  });
  return linkUrl;
}

// The new recursive processor for sorting and enhancing
async function recursiveEnhancer(node: Node, token: string, options: SortOptions): Promise<void> {
  // Check if the node is a parent node that can have children
  if (!("children" in node) || !Array.isArray(node.children)) return;

  // 1. Recurse down to handle nested structures first
  // FIX: Cast node.children to Node[] to resolve the 'unknown' type error.
  for (const child of (node.children as Node[])) {
    await recursiveEnhancer(child, token, options);
  }

  // 2. Process all lists at the current level
  const listsInNode = (node.children as Node[]).filter((child): child is List => child.type === 'list');
  
  for (const list of listsInNode) {
    // Heuristic: Check if the list is a candidate for sorting
    const itemsWithLinks = list.children.filter(item => findGitHubLink(item));
    if (options.by && itemsWithLinks.length >= options.minLinks) {
      core.info(`Found a sortable list with ${itemsWithLinks.length} GitHub links.`);
      
      // 3. Enrich items with repository data
      const enrichedItems: EnrichedListItem[] = await Promise.all(
        list.children.map(async (itemNode) => {
          const url = findGitHubLink(itemNode);
          if (url) {
            const details = parseGitHubUrl(url);
            if (details) {
              const repoInfo = await getRepoInfo(details.owner, details.repo, token);
              return { node: itemNode, repoInfo, githubUrl: url };
            }
          }
          return { node: itemNode, repoInfo: null };
        })
      );

      // 4. Sort the enriched items
      enrichedItems.sort((a, b) => {
        if (!a.repoInfo) return 1; // a is pushed to the bottom
        if (!b.repoInfo) return -1; // b is pushed to the bottom

        if (options.by === 'stars') {
          return (b.repoInfo.stargazers_count ?? 0) - (a.repoInfo.stargazers_count ?? 0);
        }
        if (options.by === 'last_commit') {
          const dateA = a.repoInfo.pushed_at ? new Date(a.repoInfo.pushed_at) : new Date(0);
          const dateB = b.repoInfo.pushed_at ? new Date(b.repoInfo.pushed_at) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        }
        return 0;
      });

      // 5. Replace the list's children with the sorted nodes
      list.children = enrichedItems.map(enrichedItem => enrichedItem.node);
    }
  }
}


async function badgeEnhancer(tree: Root, token: string) {
    // The badge enhancer logic from before, slightly adapted
    // It will run after sorting is complete
    const nodesToUpdate: { node: Link, parent: any, index: number }[] = [];
    visit(tree, 'link', (node: Link, index, parent) => {
        if (index === undefined || !parent) return;
        const nextNode = parent.children[index + 1];
        if (nextNode?.type === 'text' && /^\s*(⭐|⚠️)/.test(nextNode.value)) return;
        if (parseGitHubUrl(node.url)) {
            nodesToUpdate.push({ node, parent, index });
        }
    });

    const promises = nodesToUpdate.map(async ({ node }) => {
        const details = parseGitHubUrl(node.url)!;
        const info = await getRepoInfo(details.owner, details.repo, token);
        return { info, node };
    });

    const results = await Promise.all(promises);
    const infoMap = new Map(results.map(r => [r.node, r.info]));

    for (let i = nodesToUpdate.length - 1; i >= 0; i--) {
        const { node, parent, index } = nodesToUpdate[i];
        const info = infoMap.get(node);
        if (info) {
            parent.children.splice(index + 1, 0, { type: 'text', value: formatRepoInfo(info) });
        }
    }
}


export async function processMarkdownFile(
  filePath: string,
  token: string,
  rules: ReplacementRule[] = [],
  sortOptions: SortOptions = {by: "", minLinks: 1}
): Promise<void> {
  core.info(`Processing file: ${filePath}`);
  try {
    const originalContent = await fs.readFile(filePath, "utf-8");
    const contentAfterReplacements = applyReplacements(originalContent, rules);

    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(contentAfterReplacements);

    // Run sorting first if enabled
    if (sortOptions.by) {
      await recursiveEnhancer(tree, token, sortOptions);
    }
    
    // Always run badge enhancer
    await badgeEnhancer(tree, token);

    let finalContent = unified().use(remarkStringify).stringify(tree);

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
    if (error.stack) core.debug(error.stack);
  }
}
