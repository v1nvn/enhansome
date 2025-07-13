import * as fs from "fs/promises";
import * as github from "./github.js";
import {
  fetchAllRepoInfo,
  processMarkdownFile,
  ReplacementRule,
  SortOptions,
} from "./markdown.js";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { RepoInfoDetails } from "./github.js";

// Mock the modules we depend on
vi.mock("fs/promises", () => ({
  ...vi.importActual("fs/promises"),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("./github.js");

const mockedFs = fs as any;
const mockedGithub = github as any;

describe("processMarkdownFile (AST-based)", () => {
  const token = "test-token";
  const filePath = "README.md";

  beforeEach(() => {
    // Reset all mocks before each test to ensure isolation
    vi.clearAllMocks();
  });

  it("should add a rich info badge to a valid GitHub link", async () => {
    const originalContent =
      "Check out [my-project](https://github.com/test-user/test-repo).";
    // The expected output with all the rich information
    const expectedContent =
      "Check out [my-project](https://github.com/test-user/test-repo) ⭐ 1,234 | 🐛 42 | 🌐 TypeScript | 📅 2025-06-29.";

    const mockRepoData: github.RepoInfoDetails = {
      stargazers_count: 1234,
      pushed_at: "2025-06-29T10:00:00Z",
      open_issues_count: 42,
      language: "TypeScript",
      archived: false,
    };

    mockedFs.readFile.mockResolvedValue(originalContent);
    // Ensure parseGitHubUrl is mocked to return a valid identifier
    mockedGithub.parseGitHubUrl.mockReturnValue({
      owner: "test-user",
      repo: "test-repo",
    });
    // Mock getRepoInfo to return our rich data object
    mockedGithub.getRepoInfo.mockResolvedValue(mockRepoData);

    await processMarkdownFile(filePath, token);

    expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, "utf-8");
    expect(mockedGithub.getRepoInfo).toHaveBeenCalledWith(
      "test-user",
      "test-repo",
      token
    );
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it('should add an "Archived" badge if the repository is archived', async () => {
    const originalContent =
      "This is an [old-project](https://github.com/test-user/old-repo).";
    const expectedContent =
      "This is an [old-project](https://github.com/test-user/old-repo) ⚠️ Archived.";

    const mockRepoData: github.RepoInfoDetails = {
      stargazers_count: 500,
      pushed_at: "2020-01-01T10:00:00Z",
      open_issues_count: 1,
      language: "JavaScript",
      archived: true, // The key property for this test
    };

    mockedFs.readFile.mockResolvedValue(originalContent);
    mockedGithub.parseGitHubUrl.mockReturnValue({
      owner: "test-user",
      repo: "old-repo",
    });
    mockedGithub.getRepoInfo.mockResolvedValue(mockRepoData);

    await processMarkdownFile(filePath, token);

    expect(mockedGithub.getRepoInfo).toHaveBeenCalled();
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should NOT modify a link inside a code block", async () => {
    const originalContent =
      "Here is some code:\n\n```\nSee [this link](https://github.com/test-user/test-repo)\n```";

    mockedFs.readFile.mockResolvedValue(originalContent);

    await processMarkdownFile(filePath, token);

    // The AST parser will ignore the link inside the code block.
    expect(mockedGithub.parseGitHubUrl).not.toHaveBeenCalled();
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it("should correctly handle a file with no GitHub links", async () => {
    const originalContent =
      "This file has [a link to Google](https://google.com) but no GitHub repos.";
    mockedFs.readFile.mockResolvedValue(originalContent);
    // Simulate parseGitHubUrl returning null for non-GitHub links
    mockedGithub.parseGitHubUrl.mockReturnValue(null);

    await processMarkdownFile(filePath, token);

    expect(mockedGithub.getRepoInfo).not.toHaveBeenCalled();
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });
});

describe("processMarkdownFile (Find and Replace)", () => {
  const token = "test-token";
  const filePath = "CHANGELOG.md";

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGithub.parseGitHubUrl.mockReturnValue(null);
    mockedGithub.getRepoInfo.mockResolvedValue(null);
  });

  it("should perform a literal find and replace", async () => {
    const originalContent = "This is version v__VERSION__.";
    const expectedContent = "This is version v1.2.3.";
    const rules: ReplacementRule[] = [
      { type: "literal", find: "v__VERSION__", replace: "v1.2.3" },
    ];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should perform a regex find and replace", async () => {
    const originalContent =
      "Release date: 2025-01-10\nAnother date: 2024-12-25";
    const expectedContent = "Release date: TBD\nAnother date: TBD";
    const rules: ReplacementRule[] = [
      { type: "regex", find: "\\d{4}-\\d{2}-\\d{2}", replace: "TBD" },
    ];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should perform multiple rules of both types", async () => {
    const originalContent = "Status: __STATUS__. Release date: 2025-01-10.";
    const expectedContent = "Status: Final. Release date: TBD.";
    const rules: ReplacementRule[] = [
      { type: "literal", find: "__STATUS__", replace: "Final" },
      { type: "regex", find: "\\d{4}-\\d{2}-\\d{2}", replace: "TBD" },
    ];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should perform replacements AND add a star badge in the correct order", async () => {
    const originalContent =
      "Project: [my-project](https://github.com/test-user/test-repo). Status: __STATUS__.";
    const expectedContent =
      "Project: [my-project](https://github.com/test-user/test-repo) ⭐ 500 | 🐛 10. Status: Released.";

    const rules: ReplacementRule[] = [
      { type: "literal", find: "__STATUS__", replace: "Released" },
    ];
    mockedFs.readFile.mockResolvedValue(originalContent);

    mockedGithub.parseGitHubUrl.mockImplementation((url: string) =>
      url.includes("github.com")
        ? { owner: "test-user", repo: "test-repo" }
        : null
    );
    mockedGithub.getRepoInfo.mockResolvedValue({
      stargazers_count: 500,
      pushed_at: null,
      open_issues_count: 10,
      language: null,
      archived: false,
    });

    await processMarkdownFile(filePath, token, rules);
    expect(mockedGithub.getRepoInfo).toHaveBeenCalledWith(
      "test-user",
      "test-repo",
      token
    );
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should not write the file if no changes are made", async () => {
    const originalContent =
      "This file has no placeholders and no github links.";
    const rules: ReplacementRule[] = [
      { type: "literal", find: "non_existent", replace: "string" },
    ];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });
});

describe("Branding and Default Replacements", () => {
  const token = "test-token";
  const filePath = "README.md";

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGithub.parseGitHubUrl.mockReturnValue(null);
    mockedGithub.getRepoInfo.mockResolvedValue(null);
  });

  it("should apply branding rule for space-based titles", async () => {
    const originalContent = "# Awesome Go\n\nA list of awesome Go frameworks.";
    const expectedContent =
      "# Awesome Go with stars\n\nA list of awesome Go frameworks.";
    const rules: ReplacementRule[] = [{ type: "branding" }];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should apply branding rule for hyphen-based titles", async () => {
    const originalContent =
      "# Awesome-Selfhosted\n\nA list of awesome selfhosted software.";
    const expectedContent =
      "# Awesome-Selfhosted with stars\n\nA list of awesome selfhosted software.";
    const rules: ReplacementRule[] = [{ type: "branding" }];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });

  it("should NOT apply branding if the rule is not in the rule set", async () => {
    const originalContent = "# Awesome Go\n\nThis title should not change.";
    const rules: ReplacementRule[] = []; // Empty rule set

    mockedFs.readFile.mockResolvedValue(originalContent);

    await processMarkdownFile(filePath, token, rules);

    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it("should still apply user-defined rules when the branding rule is absent", async () => {
    const originalContent =
      "# Awesome Go\n\nMy custom placeholder: __PLACEHOLDER__";
    const expectedContent = "# Awesome Go\n\nMy custom placeholder: Replaced!";

    const customRules: ReplacementRule[] = [
      { type: "literal", find: "__PLACEHOLDER__", replace: "Replaced!" },
    ];

    mockedFs.readFile.mockResolvedValue(originalContent);

    await processMarkdownFile(filePath, token, customRules);

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      filePath,
      expectedContent,
      "utf-8"
    );
  });
});

describe("Sorting", () => {
  const token = "test-token";
  const filePath = "test.md";
  const rules: ReplacementRule[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the GitHub API calls for all sorting tests
    mockedGithub.parseGitHubUrl.mockImplementation((url: string) => ({
      owner: "user",
      repo: url.split("/")[4],
    }));
    mockedGithub.getRepoInfo.mockImplementation(
      async (owner: string, repo: string) => {
        const repoData: { [key: string]: RepoInfoDetails } = {
          "repo-a": {
            stargazers_count: 200,
            pushed_at: "2025-01-01T00:00:00Z",
            open_issues_count: 1,
            language: "Go",
            archived: false,
          },
          "repo-b": {
            stargazers_count: 100,
            pushed_at: "2025-02-01T00:00:00Z",
            open_issues_count: 1,
            language: "Go",
            archived: false,
          },
          "repo-c": {
            stargazers_count: 300,
            pushed_at: "2025-03-01T00:00:00Z",
            open_issues_count: 1,
            language: "Go",
            archived: false,
          },
          "inner-a": {
            stargazers_count: 900,
            pushed_at: "2025-04-01T00:00:00Z",
            open_issues_count: 1,
            language: "JS",
            archived: false,
          },
          "inner-b": {
            stargazers_count: 500,
            pushed_at: "2025-05-01T00:00:00Z",
            open_issues_count: 1,
            language: "JS",
            archived: false,
          },
        };
        return repoData[repo] || null;
      }
    );
  });

  it("should sort a list by stars", async () => {
    const originalContent = `
* [Project B](https://github.com/user/repo-b) - 100 stars
* [Project C](https://github.com/user/repo-c) - 300 stars
* [Project A](https://github.com/user/repo-a) - 200 stars
    `;
    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules, {
      by: "stars",
      minLinks: 2,
    });

    const writtenContent = mockedFs.writeFile.mock.calls[0][1];
    expect(writtenContent.indexOf("repo-c")).toBeLessThan(
      writtenContent.indexOf("repo-a")
    );
    expect(writtenContent.indexOf("repo-a")).toBeLessThan(
      writtenContent.indexOf("repo-b")
    );
  });

  it("should sort a list by last commit date", async () => {
    const originalContent = `
* [Project A](https://github.com/user/repo-a) - Jan 1
* [Project C](https://github.com/user/repo-c) - Mar 1
* [Project B](https://github.com/user/repo-b) - Feb 1
    `;
    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules, {
      by: "last_commit",
      minLinks: 2,
    });

    const writtenContent = mockedFs.writeFile.mock.calls[0][1];
    expect(writtenContent.indexOf("repo-c")).toBeLessThan(
      writtenContent.indexOf("repo-b")
    );
    expect(writtenContent.indexOf("repo-b")).toBeLessThan(
      writtenContent.indexOf("repo-a")
    );
  });

  it("should correctly sort nested lists recursively by stars", async () => {
    const originalContent = `
* [Outer C](https://github.com/user/repo-c) - 300 stars
* [Outer A](https://github.com/user/repo-a) - 200 stars
  * [Inner B](https://github.com/user/inner-b) - 500 stars
  * [Inner A](https://github.com/user/inner-a) - 900 stars
* [Outer B](https://github.com/user/repo-b) - 100 stars
    `;
    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules, {
      by: "stars",
      minLinks: 2,
    });

    const writtenContent = mockedFs.writeFile.mock.calls[0][1];

    // 1. Check that the inner list was sorted correctly (900 stars > 500 stars)
    expect(writtenContent.indexOf("inner-a")).toBeLessThan(
      writtenContent.indexOf("inner-b")
    );

    // 2. Check that the outer list was sorted correctly (300 > 200 > 100)
    expect(writtenContent.indexOf("Outer C")).toBeLessThan(
      writtenContent.indexOf("Outer A")
    );
    expect(writtenContent.indexOf("Outer A")).toBeLessThan(
      writtenContent.indexOf("Outer B")
    );

    // 3. Check that the sorted inner list is still properly nested within its original parent item
    const outerA_Index = writtenContent.indexOf("Outer A");
    const innerA_Index = writtenContent.indexOf("inner-a");
    const outerB_Index = writtenContent.indexOf("Outer B");
    expect(innerA_Index).toBeGreaterThan(outerA_Index);
    expect(innerA_Index).toBeLessThan(outerB_Index);
  });

  it("should not sort a list if it does not meet the minLinks threshold", async () => {
    const originalContent = `
* [Project A](https://github.com/user/repo-a)
* Just a normal list item
* And another one
    `;
    mockedFs.readFile.mockResolvedValue(originalContent);

    await processMarkdownFile(filePath, token, rules, {
      by: "stars",
      minLinks: 2,
    });

    const writtenContent =
      mockedFs.writeFile.mock.calls[0]?.[1] ?? originalContent;
    // Expect the original order to be preserved since no sorting occurred
    expect(writtenContent.indexOf("repo-a")).toBeLessThan(
      writtenContent.indexOf("normal list item")
    );
  });
});

describe("Comprehensive End-to-End Test", () => {
  const token = "test-token";
  const filePath = "COMPLEX_README.md";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle a complex document with branding, replacements, nested sorting, and badges", async () => {
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
    mockedFs.readFile.mockResolvedValue(originalContent);
    mockedGithub.parseGitHubUrl.mockImplementation((url: string) => {
      if (url.includes("github.com")) {
        return { owner: "user", repo: url.split("/")[4] };
      }
      return null;
    });
    mockedGithub.getRepoInfo.mockImplementation(
      async (owner: string, repo: string): Promise<RepoInfoDetails | null> => {
        const db: { [key: string]: RepoInfoDetails } = {
          "repo-a": {
            stargazers_count: 1000,
            pushed_at: "2024-05-10T12:00:00Z",
            open_issues_count: 10,
            language: "Go",
            archived: false,
          },
          "repo-c": {
            stargazers_count: 50,
            pushed_at: "2025-07-12T12:00:00Z",
            open_issues_count: 1,
            language: "Rust",
            archived: false,
          },
          "inner-a": {
            stargazers_count: 500,
            pushed_at: "2025-07-13T12:00:00Z",
            open_issues_count: 5,
            language: "JavaScript",
            archived: false,
          },
          "inner-b": {
            stargazers_count: 250,
            pushed_at: "2025-06-01T12:00:00Z",
            open_issues_count: 2,
            language: "JavaScript",
            archived: false,
          },
          archived: {
            stargazers_count: 99,
            pushed_at: "2022-01-01T12:00:00Z",
            open_issues_count: 0,
            language: "C++",
            archived: true,
          },
          single: {
            stargazers_count: 10,
            pushed_at: "2023-01-01T12:00:00Z",
            open_issues_count: 0,
            language: "Python",
            archived: false,
          },
        };
        return db[repo] || null;
      }
    );

    // 4. Define the rules and options for the run
    const rules: ReplacementRule[] = [
      { type: "branding" },
      { type: "literal", find: "__VERSION__", replace: "1.5.0" },
      { type: "regex", find: "\\d{4}-\\d{2}-\\d{2}", replace: "TBD" },
    ];
    const sortOptions: SortOptions = { by: "stars", minLinks: 2 };

    // 5. Execute the process
    await processMarkdownFile(filePath, token, rules, sortOptions);

    // 6. Assert the final output
    expect(mockedFs.writeFile).toHaveBeenCalledTimes(1);
    const writtenContent = mockedFs.writeFile.mock.calls[0][1].trim();
    expect(writtenContent).toEqual(expectedContent.trim());
  });
});

describe("fetchAllRepoInfo with Concurrency", () => {
  const token = "test-token";
  const mockRepoData: github.RepoInfoDetails = {
    stargazers_count: 100,
    pushed_at: "2025-01-01T00:00:00Z",
    open_issues_count: 5,
    language: "TypeScript",
    archived: false,
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it("should respect the concurrency limit when fetching many URLs", async () => {
    const CONCURRENCY_LIMIT = 10; // This must match the value in fetchAllRepoInfo
    const totalUrls = 25;
    const urls = new Set(
      Array.from(
        { length: totalUrls },
        (_, i) => `https://github.com/user/repo-${i}`
      )
    );

    let activeRequests = 0;
    let maxConcurrentRequests = 0;

    // Mock getRepoInfo with a delay to simulate real network calls
    mockedGithub.getRepoInfo.mockImplementation(async () => {
      activeRequests++;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
      activeRequests--;
      return { ...mockRepoData };
    });

    const result = await fetchAllRepoInfo(urls, token);

    // 1. All URLs should have been processed successfully
    expect(result.size).toBe(totalUrls);
    expect(mockedGithub.getRepoInfo).toHaveBeenCalledTimes(totalUrls);

    // 2. The number of concurrent requests should never exceed the limit
    expect(maxConcurrentRequests).toBe(CONCURRENCY_LIMIT);

    // 3. All requests should be finished by the end
    expect(activeRequests).toBe(0);
  }, 1000); // Increase timeout for this time-based test

  it("should use a concurrency level equal to the URL count if it is less than the limit", async () => {
    const totalUrls = 4;
    const urls = new Set(
      Array.from(
        { length: totalUrls },
        (_, i) => `https://github.com/user/repo-${i}`
      )
    );

    let activeRequests = 0;
    let maxConcurrentRequests = 0;

    mockedGithub.getRepoInfo.mockImplementation(async () => {
      activeRequests++;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeRequests--;
      return { ...mockRepoData };
    });

    const result = await fetchAllRepoInfo(urls, token);

    expect(result.size).toBe(totalUrls);
    // Max concurrency should be the number of URLs, not the hard limit of 10
    expect(maxConcurrentRequests).toBe(totalUrls);
  });

  it("should continue processing the queue even if some fetches fail", async () => {
    const urls = new Set([
      "https://github.com/user/success-1",
      "https://github.com/user/fail-1",
      "https://github.com/user/success-2",
      "https://github.com/user/fail-2",
      "https://github.com/user/success-3",
    ]);

    mockedGithub.getRepoInfo.mockImplementation(
      async (owner: string, repo: string) => {
        if (repo.startsWith("fail")) {
          throw new Error(`API failed for ${repo}`);
        }
        return { ...mockRepoData, language: repo };
      }
    );

    const result = await fetchAllRepoInfo(urls, token);

    // It should attempt to fetch all URLs
    expect(mockedGithub.getRepoInfo).toHaveBeenCalledTimes(5);

    // The final map should only contain the successful results
    expect(result.size).toBe(3);
    expect(result.has("https://github.com/user/success-1")).toBe(true);
    expect(result.has("https://github.com/user/fail-1")).toBe(false);
  });

  it("should handle an empty set of URLs gracefully", async () => {
    const result = await fetchAllRepoInfo(new Set<string>(), token);
    expect(result.size).toBe(0);
    expect(mockedGithub.getRepoInfo).not.toHaveBeenCalled();
  });
});
