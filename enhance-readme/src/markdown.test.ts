import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as github from './github.js';
import { RepoInfoDetails } from './github.js';
import { fetchAllRepoInfo } from './markdown.js';

// Mock the modules we depend on
vi.mock('./github.js');

describe('fetchAllRepoInfo with Concurrency', () => {
  const token = 'test-token';
  const mockRepoData: RepoInfoDetails = {
    archived: false,
    language: 'TypeScript',
    open_issues_count: 5,
    pushed_at: '2025-01-01T00:00:00Z',
    stargazers_count: 100,
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    vi.mocked(github.parseGitHubUrl).mockImplementation((url: string) => {
      if (!url.includes('github.com')) {
        return null;
      }
      const parts = url.split('/');
      const repo = parts[parts.length - 1];
      const owner = parts[parts.length - 2];
      return { owner, repo };
    });
  });

  it('should respect the concurrency limit when fetching many URLs', async () => {
    const CONCURRENCY_LIMIT = 10; // This must match the value in fetchAllRepoInfo
    const totalUrls = 25;
    const urls = new Set(
      Array.from(
        { length: totalUrls },
        (_, i) => `https://github.com/user/repo-${i}`,
      ),
    );

    let activeRequests = 0;
    let maxConcurrentRequests = 0;

    // Mock getRepoInfo with a delay to simulate real network calls
    vi.mocked(github.getRepoInfo).mockImplementation(async () => {
      activeRequests++;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
      activeRequests--;
      return { ...mockRepoData };
    });

    const result = await fetchAllRepoInfo(urls, token);

    // 1. All URLs should have been processed successfully
    expect(result.size).toBe(totalUrls);
    expect(github.getRepoInfo).toHaveBeenCalledTimes(totalUrls);

    // 2. The number of concurrent requests should never exceed the limit
    expect(maxConcurrentRequests).toBe(CONCURRENCY_LIMIT);

    // 3. All requests should be finished by the end
    expect(activeRequests).toBe(0);
  }, 1000); // Increase timeout for this time-based test

  it('should use a concurrency level equal to the URL count if it is less than the limit', async () => {
    const totalUrls = 4;
    const urls = new Set(
      Array.from(
        { length: totalUrls },
        (_, i) => `https://github.com/user/repo-${i}`,
      ),
    );

    let activeRequests = 0;
    let maxConcurrentRequests = 0;

    vi.mocked(github.getRepoInfo).mockImplementation(async () => {
      activeRequests++;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      await new Promise(resolve => setTimeout(resolve, 20));
      activeRequests--;
      return { ...mockRepoData };
    });

    const result = await fetchAllRepoInfo(urls, token);

    expect(result.size).toBe(totalUrls);
    // Max concurrency should be the number of URLs, not the hard limit of 10
    expect(maxConcurrentRequests).toBe(totalUrls);
  });

  it('should continue processing the queue even if some fetches fail', async () => {
    const urls = new Set([
      'https://github.com/user/fail-1',
      'https://github.com/user/fail-2',
      'https://github.com/user/success-1',
      'https://github.com/user/success-2',
      'https://github.com/user/success-3',
    ]);

    vi.mocked(github.getRepoInfo).mockImplementation(
      (owner: string, repo: string) => {
        if (repo.startsWith('fail')) {
          throw new Error(`API failed for ${repo}`);
        }
        return Promise.resolve({ ...mockRepoData, language: repo });
      },
    );

    const result = await fetchAllRepoInfo(urls, token);

    // It should attempt to fetch all URLs
    expect(github.getRepoInfo).toHaveBeenCalledTimes(5);

    // The final map should only contain the successful results
    expect(result.size).toBe(3);
    expect(result.has('https://github.com/user/success-1')).toBe(true);
    expect(result.has('https://github.com/user/fail-1')).toBe(false);
  });

  it('should handle an empty set of URLs gracefully', async () => {
    const result = await fetchAllRepoInfo(new Set<string>(), token);
    expect(result.size).toBe(0);
    expect(github.getRepoInfo).not.toHaveBeenCalled();
  });
});
