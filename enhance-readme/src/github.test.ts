import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import * as core from '@actions/core';
import { parseGitHubUrl, getStarCount } from './github.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'; // It's good practice to import vi

// Use vi instead of jest for mocking
vi.mock('@actions/core', () => ({
  ...vi.importActual('@actions/core'),
  error: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
}));


describe("github.ts", () => {
  let mockAxios: MockAdapter;

  beforeEach(() => {
    // Create a new mock adapter for every test
    mockAxios = new MockAdapter(axios);
  });

  afterEach(() => {
    mockAxios.restore();
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
        expect.stringContaining("Error fetching star count")
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
        expect.stringContaining("Failed to get star count")
      );
    });
  });
});
