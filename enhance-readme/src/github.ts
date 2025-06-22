import * as core from '@actions/core';
import axios from 'axios';

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
export function parseGitHubUrl(url: string): RepoInfo | null {
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
export async function getStarCount(owner: string, repo: string, token: string): Promise<number | null> {
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
