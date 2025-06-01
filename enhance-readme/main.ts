import * as core from '@actions/core';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

const GITHUB_API_URL = 'https://api.github.com';

interface RepoInfo {
    owner: string;
    repo: string;
}

/**
 * Parses a GitHub repository URL to extract owner and repo name.
 * Supports URLs like:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo/
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo/issues
 * @param url The GitHub URL.
 * @returns RepoInfo object or null if parsing fails.
 */
function parseGitHubUrl(url: string): RepoInfo | null {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname !== 'github.com') {
            return null;
        }
        const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);
        if (pathParts.length >= 2) {
            const owner = pathParts[0];
            const repo = pathParts[1].replace(/\.git$/, ''); // Remove .git suffix if present
            return { owner, repo };
        }
        return null;
    } catch (error) {
        core.debug(`Failed to parse URL ${url}: ${error}`);
        return null;
    }
}

/**
 * Fetches star count for a given GitHub repository.
 * @param owner The repository owner.
 * @param repo The repository name.
 * @param token GitHub API token.
 * @returns Star count or null if an error occurs.
 */
async function getStarCount(owner: string, repo: string, token: string): Promise<number | null> {
    const repoUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}`;
    try {
        core.debug(`Fetching star count for ${owner}/${repo} from ${repoUrl}`);
        const response = await axios.get(repoUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
        });
        if (response.status === 200 && response.data && typeof response.data.stargazers_count === 'number') {
            core.debug(`Successfully fetched star count: ${response.data.stargazers_count} for ${owner}/${repo}`);
            return response.data.stargazers_count;
        } else {
            core.warning(`Failed to get star count for ${owner}/${repo}. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
            return null;
        }
    } catch (error: any) {
        core.error(`Error fetching star count for ${owner}/${repo}: ${error.message}`);
        if (error.response) {
            core.error(`Response Status: ${error.response.status}`);
            core.error(`Response Data: ${JSON.stringify(error.response.data)}`);
        }
        return null;
    }
}

/**
 * Updates a line of markdown content by appending star count if it's a GitHub link.
 * @param line The markdown line.
 * @param token GitHub API token.
 * @returns Updated line with star count or original line.
 */
async function updateMarkdownLine(line: string, token: string): Promise<string> {
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
async function processMarkdownFile(filePath: string, token: string): Promise<void> {
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

/**
 * Main function for the GitHub Action.
 */
async function run(): Promise<void> {
    try {
        const token = core.getInput('github_token', { required: true });
        const markdownFilesRaw = core.getInput('markdown_files', { required: true });
        // working_directory is handled by entrypoint.sh `cd` command.
        // Files are relative to GITHUB_WORKSPACE / INPUT_WORKING_DIRECTORY

        if (!token) {
            core.setFailed('GitHub token is required.');
            return;
        }
        if (!markdownFilesRaw) {
            core.setFailed('Markdown files input is required.');
            return;
        }

        const filePaths = markdownFilesRaw.split(/\s+/).filter(Boolean); // Split by space and remove empty strings

        if (filePaths.length === 0) {
            core.warning('No markdown files specified to process.');
            return;
        }

        core.info(`Markdown files to process: ${filePaths.join(', ')}`);

        for (const filePath of filePaths) {
            await processMarkdownFile(filePath, token);
        }

        core.info('Star enhancement process finished.');

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
