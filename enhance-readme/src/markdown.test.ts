import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as github from './github.js';
import { RepoInfoDetails } from './github.js';
import {
  fetchAllRepoInfo,
  processMarkdownContent,
  ReplacementRule,
  SortOptions,
} from './markdown.js';

// Mock the modules we depend on
vi.mock('./github.js');

describe('processMarkdownContent (AST-based)', () => {
  const token = 'test-token';

  beforeEach(() => {
    // Reset all mocks before each test to ensure isolation
    vi.clearAllMocks();
  });

  it('should add a rich info badge to a valid GitHub link', async () => {
    const originalContent =
      'Check out [my-project](https://github.com/test-user/test-repo).';
    // The expected output with all the rich information
    const expectedContent =
      'Check out [my-project](https://github.com/test-user/test-repo) ⭐ 1,234 | 🐛 42 | 🌐 TypeScript | 📅 2025-06-29.';

    const mockRepoData: github.RepoInfoDetails = {
      archived: false,
      language: 'TypeScript',
      open_issues_count: 42,
      pushed_at: '2025-06-29T10:00:00Z',
      stargazers_count: 1234,
    };

    vi.mocked(github.parseGitHubUrl).mockReturnValue({
      owner: 'test-user',
      repo: 'test-repo',
    });
    // Mock getRepoInfo to return our rich data object
    vi.mocked(github.getRepoInfo).mockResolvedValue(mockRepoData);

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
    );

    expect(github.getRepoInfo).toHaveBeenCalledWith(
      'test-user',
      'test-repo',
      token,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should add an "Archived" badge if the repository is archived', async () => {
    const originalContent =
      'This is an [old-project](https://github.com/test-user/old-repo).';
    const expectedContent =
      'This is an [old-project](https://github.com/test-user/old-repo) ⚠️ Archived.';

    const mockRepoData: github.RepoInfoDetails = {
      archived: true, // The key property for this test
      language: 'JavaScript',
      open_issues_count: 1,
      pushed_at: '2020-01-01T10:00:00Z',
      stargazers_count: 500,
    };

    vi.mocked(github.parseGitHubUrl).mockReturnValue({
      owner: 'test-user',
      repo: 'old-repo',
    });
    vi.mocked(github.getRepoInfo).mockResolvedValue(mockRepoData);

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
    );

    expect(github.getRepoInfo).toHaveBeenCalled();
    expect(finalContent).toBe(expectedContent);
  });

  it('should NOT modify a link inside a code block', async () => {
    const originalContent =
      'Here is some code:\n\n```\nSee [this link](https://github.com/test-user/test-repo)\n```';

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
    );

    // The AST parser will ignore the link inside the code block.
    expect(github.parseGitHubUrl).not.toHaveBeenCalled();
    expect(finalContent).toBe(originalContent);
  });

  it('should correctly handle a file with no GitHub links', async () => {
    const originalContent =
      'This file has [a link to Google](https://google.com) but no GitHub repos.';
    // Simulate parseGitHubUrl returning null for non-GitHub links
    vi.mocked(github.parseGitHubUrl).mockReturnValue(null);

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
    );

    expect(github.getRepoInfo).not.toHaveBeenCalled();
    expect(finalContent).toBe(originalContent);
  });
});

describe('processMarkdownContent (Find and Replace)', () => {
  const token = 'test-token';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(github.parseGitHubUrl).mockReturnValue(null);
    vi.mocked(github.getRepoInfo).mockResolvedValue(null);
  });

  it('should perform a literal find and replace', async () => {
    const originalContent = 'This is version v__VERSION__.';
    const expectedContent = 'This is version v1.2.3.';
    const rules: ReplacementRule[] = [
      { find: 'v__VERSION__', replace: 'v1.2.3', type: 'literal' },
    ];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should perform a regex find and replace', async () => {
    const originalContent =
      'Release date: 2025-01-10\nAnother date: 2024-12-25';
    const expectedContent = 'Release date: TBD\nAnother date: TBD';
    const rules: ReplacementRule[] = [
      { find: '\\d{4}-\\d{2}-\\d{2}', replace: 'TBD', type: 'regex' },
    ];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should perform multiple rules of both types', async () => {
    const originalContent = 'Status: __STATUS__. Release date: 2025-01-10.';
    const expectedContent = 'Status: Final. Release date: TBD.';
    const rules: ReplacementRule[] = [
      { find: '__STATUS__', replace: 'Final', type: 'literal' },
      { find: '\\d{4}-\\d{2}-\\d{2}', replace: 'TBD', type: 'regex' },
    ];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should perform replacements AND add a star badge in the correct order', async () => {
    const originalContent =
      'Project: [my-project](https://github.com/test-user/test-repo). Status: __STATUS__.';
    const expectedContent =
      'Project: [my-project](https://github.com/test-user/test-repo) ⭐ 500 | 🐛 10. Status: Released.';

    const rules: ReplacementRule[] = [
      { find: '__STATUS__', replace: 'Released', type: 'literal' },
    ];

    vi.mocked(github.parseGitHubUrl).mockImplementation((url: string) =>
      url.includes('github.com')
        ? { owner: 'test-user', repo: 'test-repo' }
        : null,
    );
    vi.mocked(github.getRepoInfo).mockResolvedValue({
      archived: false,
      language: null,
      open_issues_count: 10,
      pushed_at: null,
      stargazers_count: 500,
    });

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(github.getRepoInfo).toHaveBeenCalledWith(
      'test-user',
      'test-repo',
      token,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should not make changes if no rules match', async () => {
    const originalContent =
      'This file has no placeholders and no github links.';
    const rules: ReplacementRule[] = [
      { find: 'non_existent', replace: 'string', type: 'literal' },
    ];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(finalContent).toBe(originalContent);
  });
});

describe('Branding and Default Replacements', () => {
  const token = 'test-token';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(github.parseGitHubUrl).mockReturnValue(null);
    vi.mocked(github.getRepoInfo).mockResolvedValue(null);
  });

  it('should apply branding rule for space-based titles', async () => {
    const originalContent = '# Awesome Go\n\nA list of awesome Go frameworks.';
    const expectedContent =
      '# Awesome Go with stars\n\nA list of awesome Go frameworks.';
    const rules: ReplacementRule[] = [{ type: 'branding' }];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should apply branding rule for hyphen-based titles', async () => {
    const originalContent =
      '# Awesome-Selfhosted\n\nA list of awesome selfhosted software.';
    const expectedContent =
      '# Awesome-Selfhosted with stars\n\nA list of awesome selfhosted software.';
    const rules: ReplacementRule[] = [{ type: 'branding' }];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );
    expect(finalContent).toBe(expectedContent);
  });

  it('should NOT apply branding if the rule is not in the rule set', async () => {
    const originalContent = '# Awesome Go\n\nThis title should not change.';
    const rules: ReplacementRule[] = []; // Empty rule set

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
    );

    expect(finalContent).toBe(originalContent);
  });

  it('should still apply user-defined rules when the branding rule is absent', async () => {
    const originalContent =
      '# Awesome Go\n\nMy custom placeholder: __PLACEHOLDER__';
    const expectedContent = '# Awesome Go\n\nMy custom placeholder: Replaced!';

    const customRules: ReplacementRule[] = [
      { find: '__PLACEHOLDER__', replace: 'Replaced!', type: 'literal' },
    ];

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      customRules,
    );

    expect(finalContent).toBe(expectedContent);
  });
});

describe('Sorting', () => {
  const token = 'test-token';
  const rules: ReplacementRule[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the GitHub API calls for all sorting tests
    vi.mocked(github.parseGitHubUrl).mockImplementation((url: string) => ({
      owner: 'user',
      repo: url.split('/')[4],
    }));
    vi.mocked(github.getRepoInfo).mockImplementation(
      (owner: string, repo: string) => {
        const repoData: Record<string, RepoInfoDetails> = {
          'inner-a': {
            archived: false,
            language: 'JS',
            open_issues_count: 1,
            pushed_at: '2025-04-01T00:00:00Z',
            stargazers_count: 900,
          },
          'inner-b': {
            archived: false,
            language: 'JS',
            open_issues_count: 1,
            pushed_at: '2025-05-01T00:00:00Z',
            stargazers_count: 500,
          },
          'repo-a': {
            archived: false,
            language: 'Go',
            open_issues_count: 1,
            pushed_at: '2025-01-01T00:00:00Z',
            stargazers_count: 200,
          },
          'repo-b': {
            archived: false,
            language: 'Go',
            open_issues_count: 1,
            pushed_at: '2025-02-01T00:00:00Z',
            stargazers_count: 100,
          },
          'repo-c': {
            archived: false,
            language: 'Go',
            open_issues_count: 1,
            pushed_at: '2025-03-01T00:00:00Z',
            stargazers_count: 300,
          },
        };
        return Promise.resolve(repoData[repo]);
      },
    );
  });

  it('should sort a list by stars', async () => {
    const originalContent = `
* [Project B](https://github.com/user/repo-b) - 100 stars
* [Project C](https://github.com/user/repo-c) - 300 stars
* [Project A](https://github.com/user/repo-a) - 200 stars
    `;
    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      {
        by: 'stars',
        minLinks: 2,
      },
    );

    expect(finalContent.indexOf('repo-c')).toBeLessThan(
      finalContent.indexOf('repo-a'),
    );
    expect(finalContent.indexOf('repo-a')).toBeLessThan(
      finalContent.indexOf('repo-b'),
    );
  });

  it('should sort a list by last commit date', async () => {
    const originalContent = `
* [Project A](https://github.com/user/repo-a) - Jan 1
* [Project C](https://github.com/user/repo-c) - Mar 1
* [Project B](https://github.com/user/repo-b) - Feb 1
    `;
    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      {
        by: 'last_commit',
        minLinks: 2,
      },
    );

    expect(finalContent.indexOf('repo-c')).toBeLessThan(
      finalContent.indexOf('repo-b'),
    );
    expect(finalContent.indexOf('repo-b')).toBeLessThan(
      finalContent.indexOf('repo-a'),
    );
  });

  it('should correctly sort nested lists recursively by stars', async () => {
    const originalContent = `
* [Outer C](https://github.com/user/repo-c) - 300 stars
* [Outer A](https://github.com/user/repo-a) - 200 stars
  * [Inner B](https://github.com/user/inner-b) - 500 stars
  * [Inner A](https://github.com/user/inner-a) - 900 stars
* [Outer B](https://github.com/user/repo-b) - 100 stars
    `;
    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      {
        by: 'stars',
        minLinks: 2,
      },
    );

    // 1. Check that the inner list was sorted correctly (900 stars > 500 stars)
    expect(finalContent.indexOf('inner-a')).toBeLessThan(
      finalContent.indexOf('inner-b'),
    );

    // 2. Check that the outer list was sorted correctly (300 > 200 > 100)
    expect(finalContent.indexOf('Outer C')).toBeLessThan(
      finalContent.indexOf('Outer A'),
    );
    expect(finalContent.indexOf('Outer A')).toBeLessThan(
      finalContent.indexOf('Outer B'),
    );

    // 3. Check that the sorted inner list is still properly nested within its original parent item
    const outerA_Index = finalContent.indexOf('Outer A');
    const innerA_Index = finalContent.indexOf('inner-a');
    const outerB_Index = finalContent.indexOf('Outer B');
    expect(innerA_Index).toBeGreaterThan(outerA_Index);
    expect(innerA_Index).toBeLessThan(outerB_Index);
  });

  it('should not sort a list if it does not meet the minLinks threshold', async () => {
    const originalContent = `
* [Project A](https://github.com/user/repo-a)
* Just a normal list item
* And another one
    `;

    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      {
        by: 'stars',
        minLinks: 2,
      },
    );

    // Expect the original order to be preserved since no sorting occurred
    expect(finalContent.indexOf('repo-a')).toBeLessThan(
      finalContent.indexOf('normal list item'),
    );
  });
});

describe('Comprehensive End-to-End Test', () => {
  const token = 'test-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle a complex document with branding, replacements, nested sorting, and badges', async () => {
    // 1. Define the complex initial state of the Markdown file
    const originalContent = `
# Awesome Test List

Version: __VERSION__ | Last Updated: 2025-01-01

This is a test list.

* [Repo C](https://github.com/user/repo-c) - A new project.
* [Repo A](https://github.com/user/repo-a) - An older, popular project.
  * [Inner B](https://github.com/user/inner-b) - A JS utility.
  * [Inner A](https://github.com/user/inner-a) - Another JS utility.
* [Archived Repo](https://github.com/user/archived) - This project is no longer maintained.
* \`[Ignored Link](https://github.com/user/ignored)\`

### A List That Should Not Be Sorted

* [Single Repo](https://github.com/user/single)
* An item without a link.
`;

    // 2. Define the expected final state with corrected badge positions and sorting
    const expectedContent = `# Awesome Test List with stars

Version: 1.5.0 | Last Updated: TBD

This is a test list.

* [Repo A](https://github.com/user/repo-a) ⭐ 1,000 | 🐛 10 | 🌐 Go | 📅 2024-05-10 - An older, popular project.
  * [Inner A](https://github.com/user/inner-a) ⭐ 500 | 🐛 5 | 🌐 JavaScript | 📅 2025-07-13 - Another JS utility.
  * [Inner B](https://github.com/user/inner-b) ⭐ 250 | 🐛 2 | 🌐 JavaScript | 📅 2025-06-01 - A JS utility.
* [Archived Repo](https://github.com/user/archived) ⚠️ Archived - This project is no longer maintained.
* [Repo C](https://github.com/user/repo-c) ⭐ 50 | 🐛 1 | 🌐 Rust | 📅 2025-07-12 - A new project.
* \`[Ignored Link](https://github.com/user/ignored)\`

### A List That Should Not Be Sorted

* [Single Repo](https://github.com/user/single) ⭐ 10 | 🐛 0 | 🌐 Python | 📅 2023-01-01
* An item without a link.
`;

    // 3. Set up mocks for the GitHub API
    vi.mocked(github.parseGitHubUrl).mockImplementation((url: string) => {
      if (url.includes('github.com')) {
        return { owner: 'user', repo: url.split('/')[4] };
      }
      return null;
    });
    vi.mocked(github.getRepoInfo).mockImplementation(
      (owner: string, repo: string): Promise<null | RepoInfoDetails> => {
        const db: Record<string, RepoInfoDetails> = {
          archived: {
            archived: true,
            language: 'C++',
            open_issues_count: 0,
            pushed_at: '2022-01-01T12:00:00Z',
            stargazers_count: 99,
          },
          'inner-a': {
            archived: false,
            language: 'JavaScript',
            open_issues_count: 5,
            pushed_at: '2025-07-13T12:00:00Z',
            stargazers_count: 500,
          },
          'inner-b': {
            archived: false,
            language: 'JavaScript',
            open_issues_count: 2,
            pushed_at: '2025-06-01T12:00:00Z',
            stargazers_count: 250,
          },
          'repo-a': {
            archived: false,
            language: 'Go',
            open_issues_count: 10,
            pushed_at: '2024-05-10T12:00:00Z',
            stargazers_count: 1000,
          },
          'repo-c': {
            archived: false,
            language: 'Rust',
            open_issues_count: 1,
            pushed_at: '2025-07-12T12:00:00Z',
            stargazers_count: 50,
          },
          single: {
            archived: false,
            language: 'Python',
            open_issues_count: 0,
            pushed_at: '2023-01-01T12:00:00Z',
            stargazers_count: 10,
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        return Promise.resolve(db[repo] || null);
      },
    );

    // 4. Define the rules and options for the run
    const rules: ReplacementRule[] = [
      { type: 'branding' },
      { find: '__VERSION__', replace: '1.5.0', type: 'literal' },
      { find: '\\d{4}-\\d{2}-\\d{2}', replace: 'TBD', type: 'regex' },
    ];
    const sortOptions: SortOptions = { by: 'stars', minLinks: 2 };

    // 5. Execute the process
    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      sortOptions,
    );

    // 6. Assert the final output
    expect(finalContent).toEqual(expectedContent);
  });
});

describe('fetchAllRepoInfo with Concurrency', () => {
  const token = 'test-token';
  const mockRepoData: github.RepoInfoDetails = {
    archived: false,
    language: 'TypeScript',
    open_issues_count: 5,
    pushed_at: '2025-01-01T00:00:00Z',
    stargazers_count: 100,
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
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

describe('Relative Link Rewriting', () => {
  const token = 'test-token';
  const rules: ReplacementRule[] = [];
  const sortOptions: SortOptions = { by: '', minLinks: 999 }; // Disable sorting for this test

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(github.getRepoInfo).mockResolvedValue(null); // Disable badge enhancement for this test
  });

  it('should prepend a prefix to relative links', async () => {
    const originalContent = `
- [Local Doc](./docs/PAGE.md)
- [Image](../images/asset.png)
    `;
    const expectedContent = `* [Local Doc](origin/docs/PAGE.md)
* [Image](images/asset.png)`;
    const { finalContent } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      sortOptions,
      'origin',
    );

    expect(finalContent).toEqual(expectedContent);
  });

  it('should NOT prepend a prefix to absolute or fragment links', async () => {
    const originalContent = `
* [GitHub](https://github.com)
* [Heading](#heading)
    `;
    const { isChanged } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      sortOptions,
      'origin',
    );

    expect(isChanged).toBe(false);
  });
});
