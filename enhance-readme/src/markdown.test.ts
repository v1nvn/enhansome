import * as fs from 'fs/promises';
import * as github from './github.js';
import { processMarkdownFile } from './markdown.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  ...vi.importActual('fs/promises'),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('./github.js');

const mockedFs = fs as any; // Using 'any' for simplicity here, or use Vitest's Mocked type
const mockedGithub = github as any;


describe('processMarkdownFile (AST-based)', () => {
    const token = 'test-token';
    const filePath = 'README.md';

    beforeEach(() => {
        // Reset all mocks before each test
        vi.clearAllMocks();
    });

      it('should add a star badge to a valid GitHub link', async () => {
        const originalContent = 'Check out [my-project](https://github.com/test-user/test-repo).';
        const expectedContent = 'Check out [my-project](https://github.com/test-user/test-repo) ⭐ 500.';

        mockedFs.readFile.mockResolvedValue(originalContent);
        mockedGithub.parseGitHubUrl.mockReturnValue({ owner: 'test-user', repo: 'test-repo' });
        mockedGithub.getStarCount.mockResolvedValue(500);

        await processMarkdownFile(filePath, token);

        expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
        expect(mockedFs.writeFile).toHaveBeenCalledWith(filePath, expectedContent, 'utf-8');
    });


    it('should NOT add a badge if one already exists', async () => {
        const originalContent = 'Check out [my-project](https://github.com/test-user/test-repo) ⭐ 500.';
        
        mockedFs.readFile.mockResolvedValue(originalContent);
        mockedGithub.parseGitHubUrl.mockReturnValue({ owner: 'test-user', repo: 'test-repo' });

        await processMarkdownFile(filePath, token);

        // The key assertion: writeFile should NOT be called if no changes are made
        expect(mockedFs.writeFile).not.toHaveBeenCalled();
        // getStarCount shouldn't even be called if a badge is detected
        expect(mockedGithub.getStarCount).not.toHaveBeenCalled();
    });

    it('should NOT modify a link inside a code block', async () => {
        const originalContent = 'Here is some code:\n\n```\nSee [this link](https://github.com/test-user/test-repo)\n```';

        mockedFs.readFile.mockResolvedValue(originalContent);

        await processMarkdownFile(filePath, token);

        // The AST parser will not see the link inside the code block as a "link" node,
        // so our mocks for parseGitHubUrl and getStarCount won't be called.
        expect(mockedGithub.parseGitHubUrl).not.toHaveBeenCalled();
        expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });

    it('should correctly handle a file with no GitHub links', async () => {
        const originalContent = 'This file has [a link to Google](https://google.com) but no GitHub repos.';
        mockedFs.readFile.mockResolvedValue(originalContent);
        mockedGithub.parseGitHubUrl.mockReturnValue(null); // Simulate parse failure

        await processMarkdownFile(filePath, token);
        
        expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });
});