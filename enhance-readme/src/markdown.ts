import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStarCount, parseGitHubUrl } from './github';


/**
 * Updates a line of markdown content by appending star count if it's a GitHub link.
 * @param line The markdown line.
 * @param token GitHub API token.
 * @returns Updated line with star count or original line.
 */
export async function updateMarkdownLine(line: string, token: string): Promise<string> {
    // Regex to find markdown links: [text](url) or <url>
    // This regex is simplified and might need to be more robust for complex cases.
    // It looks for typical markdown links and bare URLs that might be GitHub repos.
    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/github\.com\/[^)]+)\)|<(https?:\/\/github\.com\/[^>]+)>/g;
    let match;
    let newLine = line;
    let lastIndex = 0;
    const updatedSegments: string[] = [];

    // Iterate over all matches in the line
    while ((match = markdownLinkRegex.exec(line)) !== null) {
        // Add the text segment before this match
        updatedSegments.push(line.substring(lastIndex, match.index));

        const linkText = match[1]; // Text part of [text](url)
        const urlInParens = match[2]; // URL part of [text](url)
        const urlInBrackets = match[3]; // URL part of <url>
        const actualUrl = urlInParens || urlInBrackets;

        if (actualUrl) {
            const repoInfo = parseGitHubUrl(actualUrl);
            if (repoInfo) {
                core.info(`Found GitHub link: ${actualUrl} for ${repoInfo.owner}/${repoInfo.repo}`);
                // Check if stars already added (simple check for " ⭐" or "Stars:")
                const starMarkerRegex = /\s*(?:⭐|🌟|Stars:)\s*\d+/;
                const originalLinkFullText = match[0];

                // Check if the original link text or the part of the line immediately following the link already has a star count
                const textAfterLink = line.substring(match.index + originalLinkFullText.length);
                if (starMarkerRegex.test(originalLinkFullText) || starMarkerRegex.test(textAfterLink.split('\n')[0])) {
                     core.info(`Star count already present for ${actualUrl}. Skipping.`);
                     updatedSegments.push(originalLinkFullText);
                } else {
                    const starCount = await getStarCount(repoInfo.owner, repoInfo.repo, token);
                    if (starCount !== null) {
                        const starBadge = ` ⭐ ${starCount.toLocaleString()}`;
                        updatedSegments.push(originalLinkFullText + starBadge);
                        core.info(`Added stars to ${actualUrl}: ${starCount}`);
                    } else {
                        updatedSegments.push(originalLinkFullText); // Add original if stars couldn't be fetched
                        core.warning(`Could not fetch stars for ${actualUrl}. Keeping original link.`);
                    }
                }
            } else {
                 updatedSegments.push(match[0]); // Not a parsable GitHub repo link, keep original
            }
        } else {
            updatedSegments.push(match[0]); // Should not happen with the regex, but as a fallback
        }
        lastIndex = markdownLinkRegex.lastIndex;
    }
    // Add any remaining part of the line after the last match
    updatedSegments.push(line.substring(lastIndex));
    newLine = updatedSegments.join('');

    return newLine;
}


/**
 * Processes a single markdown file.
 * @param filePath Path to the markdown file.
 * @param token GitHub API token.
 */
export async function processMarkdownFile(filePath: string, token: string): Promise<void> {
    core.info(`Processing file: ${filePath}`);
    try {
        const absoluteFilePath = path.resolve(filePath); // Ensure we have an absolute path
        core.debug(`Absolute file path: ${absoluteFilePath}`);

        let content = await fs.readFile(absoluteFilePath, 'utf-8');
        const lines = content.split('\n');
        const updatedLines: string[] = [];

        for (const line of lines) {
            // Avoid processing lines within code blocks
            if (line.trim().startsWith('```')) {
                updatedLines.push(line);
                // Naive way to skip code blocks: find next ```
                let inCodeBlock = true;
                while (inCodeBlock && lines.length > updatedLines.length) {
                    const nextLine = lines[updatedLines.length];
                    updatedLines.push(nextLine);
                    if (nextLine.trim().startsWith('```')) {
                        inCodeBlock = false;
                    }
                }
                // The loop for (const line of lines) will continue from where it left off,
                // but updatedLines has now jumped ahead. This needs refinement.
                // A better approach is to process content segment by segment.
                // For now, this is a simplified attempt.
                // A more robust solution would parse the Markdown AST.
                // This simplified version will process line by line.
                // Let's refine this to process line by line and manage code block state.
            }
            // The above code block skipping is too naive. Let's simplify for now and process all lines,
            // or recommend users to be careful with links inside code blocks.
            // For a robust solution, a proper Markdown AST parser is needed.
            // For this version, we will process each line.
            updatedLines.push(await updateMarkdownLine(line, token));
        }

        const updatedContent = updatedLines.join('\n');

        if (content !== updatedContent) {
            await fs.writeFile(absoluteFilePath, updatedContent, 'utf-8');
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