import * as fs from "fs/promises";
import * as github from "./github.js";
import { processMarkdownFile, ReplacementRule } from "./markdown.js";
import { vi, describe, it, expect, beforeEach } from "vitest";

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

  it("should NOT add a badge if a star badge already exists", async () => {
    const originalContent =
      "Check out [my-project](https://github.com/test-user/test-repo) ⭐ 1,234 | 🐛 42.";

    mockedFs.readFile.mockResolvedValue(originalContent);
    mockedGithub.parseGitHubUrl.mockReturnValue({
      owner: "test-user",
      repo: "test-repo",
    });

    await processMarkdownFile(filePath, token);

    // The key assertions: if a badge is found, we should not fetch new info or write the file.
    expect(mockedGithub.getRepoInfo).not.toHaveBeenCalled();
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it("should NOT add a badge if an archived badge already exists", async () => {
    const originalContent =
      "Check out [my-project](https://github.com/test-user/test-repo) ⚠️ Archived.";

    mockedFs.readFile.mockResolvedValue(originalContent);
    mockedGithub.parseGitHubUrl.mockReturnValue({
      owner: "test-user",
      repo: "test-repo",
    });

    await processMarkdownFile(filePath, token);

    expect(mockedGithub.getRepoInfo).not.toHaveBeenCalled();
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
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
    const rules: ReplacementRule[] = [{ type: 'literal', find: 'v__VERSION__', replace: 'v1.2.3' }];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(filePath, expectedContent, "utf-8");
  });

  it("should perform a regex find and replace", async () => {
    const originalContent = "Release date: 2025-01-10\nAnother date: 2024-12-25";
    const expectedContent = "Release date: TBD\nAnother date: TBD";
    const rules: ReplacementRule[] = [{ type: 'regex', find: '\\d{4}-\\d{2}-\\d{2}', replace: 'TBD' }];
    
    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(filePath, expectedContent, "utf-8");
  });

  it("should perform multiple rules of both types", async () => {
    const originalContent = "Status: __STATUS__. Release date: 2025-01-10.";
    const expectedContent = "Status: Final. Release date: TBD.";
    const rules: ReplacementRule[] = [
        { type: 'literal', find: '__STATUS__', replace: 'Final' },
        { type: 'regex', find: '\\d{4}-\\d{2}-\\d{2}', replace: 'TBD' }
    ];

    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(filePath, expectedContent, "utf-8");
  });

  it("should perform replacements AND add a star badge in the correct order", async () => {
    const originalContent = "Project: [my-project](https://github.com/test-user/test-repo). Status: __STATUS__.";
    const expectedContent = "Project: [my-project](https://github.com/test-user/test-repo) ⭐ 500 | 🐛 10. Status: Released.";
    
    const rules: ReplacementRule[] = [{ type: 'literal', find: '__STATUS__', replace: 'Released' }];
    mockedFs.readFile.mockResolvedValue(originalContent);

    mockedGithub.parseGitHubUrl.mockImplementation((url: string) => url.includes('github.com') ? { owner: 'test-user', repo: 'test-repo' } : null);
    mockedGithub.getRepoInfo.mockResolvedValue({
      stargazers_count: 500, pushed_at: null, open_issues_count: 10, language: null, archived: false,
    });

    await processMarkdownFile(filePath, token, rules);
    expect(mockedGithub.getRepoInfo).toHaveBeenCalledWith("test-user", "test-repo", token);
    expect(mockedFs.writeFile).toHaveBeenCalledWith(filePath, expectedContent, "utf-8");
  });

  it("should not write the file if no changes are made", async () => {
    const originalContent = "This file has no placeholders and no github links.";
    const rules: ReplacementRule[] = [{ type: 'literal', find: 'non_existent', replace: 'string' }];
    
    mockedFs.readFile.mockResolvedValue(originalContent);
    await processMarkdownFile(filePath, token, rules);
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });
});