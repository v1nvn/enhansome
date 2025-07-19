import * as core from "@actions/core";
import * as fs from "fs/promises";
import * as path from "path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { visit } from "unist-util-visit";
import type { Root, Link, ListItem, List, Node, Text, Parent } from "mdast";
import { getRepoInfo, parseGitHubUrl, RepoInfoDetails } from "./github.js";

// --- TYPE DEFINITIONS ---

export type ReplacementRule =
  | {
      type: "literal" | "regex";
      find: string;
      replace: string;
    }
  | { type: "branding" };

export interface SortOptions {
  by: "stars" | "last_commit" | "";
  minLinks: number;
}

interface EnrichedListItem {
  node: ListItem;
  repoInfo: RepoInfoDetails | null;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  return new Date(isoString).toISOString().split("T")[0];
}

function createBadgeText(info: RepoInfoDetails): string {
  if (info.archived) {
    return " ⚠️ Archived";
  }
  const parts: string[] = [
    `⭐ ${info.stargazers_count.toLocaleString()}`,
    `🐛 ${info.open_issues_count.toLocaleString()}`,
  ];
  if (info.language) {
    parts.push(`🌐 ${info.language}`);
  }
  if (info.pushed_at) {
    parts.push(`📅 ${formatDate(info.pushed_at)}`);
  }
  return ` ${parts.join(" | ")}`;
}

function findFirstGitHubLink(node: Parent): string | undefined {
  let linkUrl: string | undefined;
  visit(node, "link", (linkNode: Link) => {
    if (!linkUrl && parseGitHubUrl(linkNode.url)) {
      linkUrl = linkNode.url;
    }
  });
  return linkUrl;
}

function applyTextReplacements(
  content: string,
  rules: ReplacementRule[]
): string {
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
function collectGitHubLinks(tree: Root): Set<string> {
  const urls = new Set<string>();
  visit(tree, "link", (node: Link) => {
    if (parseGitHubUrl(node.url)) {
      urls.add(node.url);
    }
  });
  return urls;
}

export async function fetchAllRepoInfo(
  urls: Set<string>,
  token: string
): Promise<Map<string, RepoInfoDetails>> {
  const repoInfoMap = new Map<string, RepoInfoDetails>();
  const queue = Array.from(urls);
  const CONCURRENCY_LIMIT = 10; // Process up to 10 requests in parallel

  // A worker pulls a URL from the queue, processes it, and repeats
  // until the queue is empty.
  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) continue;

      const details = parseGitHubUrl(url);
      if (details) {
        try {
          const info = await getRepoInfo(details.owner, details.repo, token);
          if (info) {
            repoInfoMap.set(url, info);
          }
        } catch (error) {
          // Log errors but don't stop the other workers
          core.error(`Failed to process URL ${url}: ${error}`);
        }
      }
    }
  };

  // Create and start the pool of workers.
  const workers = Array(CONCURRENCY_LIMIT).fill(null).map(worker);
  await Promise.all(workers);

  core.debug(
    `Fetched info for ${repoInfoMap.size} repositories using a concurrency of ${CONCURRENCY_LIMIT}.`
  );
  return repoInfoMap;
}

function sortLists(
  root: Root,
  repoInfoMap: Map<string, RepoInfoDetails>,
  options: SortOptions
) {
  if (!options.by) return;

  visit(root, "list", (list: List) => {
    const itemsWithLinks = list.children.filter((item) =>
      findFirstGitHubLink(item)
    );
    if (itemsWithLinks.length < options.minLinks) {
      return;
    }

    const enrichedItems: EnrichedListItem[] = list.children.map((itemNode) => {
      const url = findFirstGitHubLink(itemNode);
      const repoInfo = url ? repoInfoMap.get(url) ?? null : null;
      return { node: itemNode, repoInfo };
    });

    enrichedItems.sort((a, b) => {
      if (!a.repoInfo) return 1;
      if (!b.repoInfo) return -1;
      if (options.by === "stars") {
        return (
          (b.repoInfo.stargazers_count ?? 0) -
          (a.repoInfo.stargazers_count ?? 0)
        );
      }

      if (options.by === "last_commit") {
        const dateA = a.repoInfo.pushed_at
          ? new Date(a.repoInfo.pushed_at).getTime()
          : 0;
        const dateB = b.repoInfo.pushed_at
          ? new Date(b.repoInfo.pushed_at).getTime()
          : 0;
        return dateB - dateA;
      }

      return 0;
    });

    list.children = enrichedItems.map((item) => item.node);
  });
}

function addInfoBadges(tree: Root, repoInfoMap: Map<string, RepoInfoDetails>) {
  const modifications = new Map<Parent, { node: Text; index: number }[]>();

  visit(tree, "link", (node: Link, index?: number, parent?: Parent) => {
    if (index === undefined || !parent) return;

    const repoInfo = repoInfoMap.get(node.url);
    if (!repoInfo) {
      return;
    }

    const badgeNode: Text = {
      type: "text",
      value: createBadgeText(repoInfo),
    };
    if (!modifications.has(parent)) {
      modifications.set(parent, []);
    }
    modifications.get(parent)!.push({ node: badgeNode, index: index + 1 });
  });

  for (const [parent, changes] of modifications.entries()) {
    changes.sort((a, b) => b.index - a.index);
    for (const { node, index } of changes) {
      parent.children.splice(index, 0, node);
    }
  }
}

function fixRelativeLinks(tree: Root, relativeLinkPrefix: string) {
  if (!relativeLinkPrefix) {
    return;
  }

  if (relativeLinkPrefix) {
    visit(tree, "link", (node) => {
      if (
        !node.url.startsWith("http") &&
        !node.url.startsWith("/") &&
        !node.url.startsWith("#")
      ) {
        node.url = path.join(relativeLinkPrefix, node.url).replace(/\\/g, "/");
      }
    });
  }
}

function serializeAst(tree: Root, originalContent: string): string {
  let finalContent = unified()
    .use(remarkStringify)
    .use(remarkGfm)
    .stringify(tree);

  const originalHadNewline =
    originalContent.endsWith("\n") || originalContent === "";
  if (finalContent.endsWith("\n") && !originalHadNewline) {
    finalContent = finalContent.slice(0, -1);
  } else if (!finalContent.endsWith("\n") && originalHadNewline) {
    finalContent += "\n";
  }
  return finalContent;
}

export async function processMarkdownFile(
  filePath: string,
  token: string,
  replacements: ReplacementRule[] = [],
  sortOptions: SortOptions = { by: "", minLinks: 2 },
  relativeLinkPrefix: string = ""
): Promise<void> {
  core.info(`Processing file: ${filePath}`);
  try {
    const originalContent = await fs.readFile(filePath, "utf-8");

    const contentAfterReplacements = applyTextReplacements(
      originalContent,
      replacements
    );

    const processor = unified().use(remarkParse).use(remarkGfm);
    const tree = processor.parse(contentAfterReplacements);

    // 1. Collect all unique GitHub links from the plain document.
    const githubUrls = collectGitHubLinks(tree);

    // 2. Fetch all required data in a single parallel batch.
    const repoInfoMap = await fetchAllRepoInfo(githubUrls, token);

    // 3. Modify the AST by sorting lists and adding badges.
    sortLists(tree, repoInfoMap, sortOptions);
    addInfoBadges(tree, repoInfoMap);
    fixRelativeLinks(tree, relativeLinkPrefix);

    // 4. Convert the modified AST back to a string.
    const finalContent = serializeAst(tree, originalContent);

    if (finalContent.trim() !== originalContent.trim()) {
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
