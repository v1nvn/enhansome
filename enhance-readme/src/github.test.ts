import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import * as core from "@actions/core";
import { parseGitHubUrl, getStarCount } from "./github.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // It's good practice to import vi

vi.mock("@actions/core", () => ({
  ...vi.importActual("@actions/core"),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
}));

describe("github.ts", () => {
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    vi.useFakeTimers();
  });

  afterEach(() => {
    mockAxios.restore();
    vi.useRealTimers();
  });

  describe("parseGitHubUrl", () => {
    it("should parse a standard GitHub URL", () => {
      const url = "https://github.com/owner/repo";
      expect(parseGitHubUrl(url)).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should parse a URL with a trailing slash", () => {
      const url = "https://github.com/owner/repo/";
      expect(parseGitHubUrl(url)).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should parse a URL with a .git suffix", () => {
      const url = "https://github.com/owner/repo.git";
      expect(parseGitHubUrl(url)).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should parse a URL with subpaths", () => {
      const url = "https://github.com/owner/repo/issues/1";
      expect(parseGitHubUrl(url)).toEqual({ owner: "owner", repo: "repo" });
    });

    it("should return null for non-GitHub URLs", () => {
      const url = "https://gitlab.com/owner/repo";
      expect(parseGitHubUrl(url)).toBeNull();
    });

    it("should return null for invalid URLs", () => {
      const url = "not-a-url";
      expect(parseGitHubUrl(url)).toBeNull();
    });
  });

  describe("getStarCount", () => {
    const owner = "test-owner";
    const repo = "test-repo";
    const token = "test-token";
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;

    it("should return star count on successful API call", async () => {
      const stars = 1234;
      mockAxios.onGet(apiUrl).reply(200, {
        stargazers_count: stars,
      });

      const result = await getStarCount(owner, repo, token);
      expect(result).toBe(stars);
    });

    it("should return null if API call fails", async () => {
      mockAxios.onGet(apiUrl).reply(404, { message: "Not Found" });

      const result = await getStarCount(owner, repo, token);
      expect(result).toBeNull();
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to fetch star count for ${owner}/${repo}: Request failed with status code 404 (Status: 404)`
        )
      );
    });

    it("should return null if response data is missing star count", async () => {
      mockAxios.onGet(apiUrl).reply(200, {
        // Missing stargazers_count
        name: "test-repo",
      });

      const result = await getStarCount(owner, repo, token);
      expect(result).toBeNull();
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          `Received an unexpected successful response for ${owner}/${repo}`
        )
      );
    });

    it("should retry on a 403 rate-limit error and then succeed", async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 2; // 2 seconds in the future

      // Setup a sequence of responses: the first fails, the second succeeds.
      mockAxios
        .onGet(apiUrl)
        .replyOnce(
          403,
          { message: "API rate limit exceeded" },
          // GitHub API headers for rate limiting
          {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(resetTime),
          }
        )
        .onGet(apiUrl)
        .replyOnce(200, { stargazers_count: 999 });

      // Call the function but don't await it immediately
      const getStarCountPromise = getStarCount(owner, repo, token);

      // Advance the fake clock to trigger the retry
      await vi.advanceTimersToNextTimerAsync();

      // Now await the final result
      const result = await getStarCountPromise;

      // Assertions
      expect(result).toBe(999);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("Primary rate limit hit")
      );
      expect(mockAxios.history.get.length).toBe(2); // Check that two API calls were made
    });

    it("should respect the Retry-After header on a 429 error and then succeed", async () => {
      // Setup a sequence: first fails with 429, second succeeds
      mockAxios
        .onGet(apiUrl)
        .replyOnce(
          429,
          { message: "Throttled" },
          // Secondary rate limit header
          { "retry-after": "2" } // Wait for 2 seconds
        )
        .onGet(apiUrl)
        .replyOnce(200, { stargazers_count: 777 });

      const getStarCountPromise = getStarCount(owner, repo, token);

      // Advance the fake clock by the specified time
      await vi.advanceTimersByTimeAsync(3000); // 3 seconds, more than retry-after

      const result = await getStarCountPromise;

      expect(result).toBe(777);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          "Request for test-owner/test-repo was throttled (Status: 429)"
        )
      );
      expect(mockAxios.history.get.length).toBe(2);
    });

    it("should return null after exhausting all retries on persistent rate limit", async () => {
      // Setup the mock to always fail with a rate limit error
      mockAxios.onGet(apiUrl).reply(
        403,
        { message: "API rate limit exceeded" },
        {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1),
        }
      );

      const getStarCountPromise = getStarCount(owner, repo, token);

      // Advance timers to simulate waiting and retrying for all 3 attempts
      await vi.advanceTimersToNextTimerAsync(); // After attempt 1
      await vi.advanceTimersToNextTimerAsync(); // After attempt 2

      const result = await getStarCountPromise;

      expect(result).toBeNull();
      expect(mockAxios.history.get.length).toBe(3); // Should have tried 3 times
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to fetch star count for test-owner/test-repo after 3 attempts."
        )
      );
    });

    it("should abort retries if wait time exceeds MAX_WAIT_TIME_SECONDS", async () => {
      // Mock a response with a retry-after header that exceeds our defined maximum
      mockAxios.onGet(apiUrl).replyOnce(
        429,
        { message: "Throttled for a very long time" },
        { "retry-after": "301" } // 301 seconds is > MAX_WAIT_TIME_SECONDS (300)
      );

      const result = await getStarCount(owner, repo, token);

      // Assertions
      expect(result).toBeNull();
      // The API should only be called once because we abort retrying
      expect(mockAxios.history.get.length).toBe(1);
      // Check that the specific error for exceeding the max wait time was logged
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining(`exceeds the maximum wait time of 300s`)
      );
      // Check that the final summary error is also logged
      expect(core.error).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to fetch star count for test-owner/test-repo after 3 attempts.`
        )
      );
    });
  });
});
