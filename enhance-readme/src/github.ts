import * as core from "@actions/core";
import axios from "axios";

const GITHUB_API_URL = "https://api.github.com";
const MAX_RETRIES = 3;
const MAX_WAIT_TIME_SECONDS = 300;

interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * A simple sleep utility.
 * @param ms Milliseconds to wait.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (parsedUrl.hostname !== "github.com") {
      return null;
    }
    const pathParts = parsedUrl.pathname
      .split("/")
      .filter((part) => part.length > 0);
    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1].replace(/\.git$/, ""); // Remove .git suffix if present
      return { owner, repo };
    }
    return null;
  } catch (error) {
    core.debug(`Failed to parse URL ${url}: ${error}`);
    return null;
  }
}

/**
 * Fetches star count for a given GitHub repository with robust, compliant retry logic.
 * @param owner The repository owner.
 * @param repo The repository name.
 * @param token GitHub API token.
 * @returns Star count or null if an error occurs.
 */
export async function getStarCount(
  owner: string,
  repo: string,
  token: string
): Promise<number | null> {
  const repoUrl = `${GITHUB_API_URL}/repos/${owner}/${repo}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      core.debug(
        `Fetching star count for ${owner}/${repo} (Attempt ${attempt}/${MAX_RETRIES})`
      );
      const response = await axios.get(repoUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      if (
        response.status === 200 &&
        response.data &&
        typeof response.data.stargazers_count === "number"
      ) {
        return response.data.stargazers_count;
      } else {
        core.warning(
          `Received an unexpected successful response for ${owner}/${repo}. Data: ${JSON.stringify(
            response.data
          )}`
        );
        return null;
      }
    } catch (error: any) {
      if (attempt === MAX_RETRIES) {
        break;
      }

      if (error.response) {
        const headers = error.response.headers;
        const status = error.response.status;
        let waitTimeSeconds = 0;

        // Guideline 1: Prioritize the 'Retry-After' header if present (sent with 403 or 429).
        if (headers["retry-after"]) {
          waitTimeSeconds = Number(headers["retry-after"]) + 1; // Add 1s buffer
          core.warning(
            `Request for ${owner}/${repo} was throttled (Status: ${status}). Respecting 'Retry-After' header. Waiting ${waitTimeSeconds} seconds.`
          );
        }
        // Guideline 2: Fallback to primary rate limit headers for 403 or 429 status codes.
        else if (
          (status === 403 || status === 429) &&
          headers["x-ratelimit-remaining"] === "0" &&
          headers["x-ratelimit-reset"]
        ) {
          const resetTimestamp = Number(headers["x-ratelimit-reset"]);
          const currentTime = Math.floor(Date.now() / 1000);
          waitTimeSeconds = Math.max(0, resetTimestamp - currentTime) + 1; // Add 1s buffer
          core.warning(
            `Primary rate limit hit for ${owner}/${repo} (Status: ${status}). Waiting for reset in ${waitTimeSeconds} seconds.`
          );
        }

        // If we have a calculated wait time, sleep and retry.
        if (waitTimeSeconds > 0) {
          if (waitTimeSeconds > MAX_WAIT_TIME_SECONDS) {
            core.error(
              `Rate limit reset time (${waitTimeSeconds}s) exceeds the maximum wait time of ${MAX_WAIT_TIME_SECONDS}s. Aborting retries for this URL.`
            );
            break;
          }

          await sleep(waitTimeSeconds * 1000);
          continue; // Go to the next attempt.
        }
      }

      // If we get here, it's a non-retriable error. Log it and exit immediately.
      if (error.response) {
        core.error(
          `Failed to fetch star count for ${owner}/${repo}: ${error.message} (Status: ${error.response.status})`
        );
        core.debug(`Response Data: ${JSON.stringify(error.response.data)}`);
      } else {
        core.error(
          `Network error fetching star count for ${owner}/${repo}: ${error.message}`
        );
      }
      return null; // Exit the function, no more retries.
    }
  }

  core.error(
    `Failed to fetch star count for ${owner}/${repo} after ${MAX_RETRIES} attempts.`
  );
  return null;
}
