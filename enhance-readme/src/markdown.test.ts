import * as github from './github';
import { updateMarkdownLine } from './markdown'; // We'll test the core line-updater function

// Mock the entire github module
jest.mock('./github');

// Create typed mocks for our module's functions
const mockedGetStarCount = github.getStarCount as jest.Mock;
const mockedParseGitHubUrl = github.parseGitHubUrl as jest.Mock;

describe('markdown.ts', () => {
    const token = 'test-token';

    beforeEach(() => {
        // Reset mocks before each test
        mockedGetStarCount.mockClear();
        mockedParseGitHubUrl.mockClear();
    });

    describe('updateMarkdownLine', () => {
        it('should add a star badge to a valid GitHub link', async () => {
            const line = '- [My Project](https://github.com/user/repo)';
            mockedParseGitHubUrl.mockReturnValue({ owner: 'user', repo: 'repo' });
            mockedGetStarCount.mockResolvedValue(1500);

            const updatedLine = await updateMarkdownLine(line, token);

            expect(mockedParseGitHubUrl).toHaveBeenCalledWith('https://github.com/user/repo');
            expect(mockedGetStarCount).toHaveBeenCalledWith('user', 'repo', token);
            expect(updatedLine).toBe('- [My Project](https://github.com/user/repo) ⭐ 1,500');
        });

        it('should NOT add a star badge if one already exists', async () => {
            const line = '- [My Project](https://github.com/user/repo) ⭐ 1,500';
            mockedParseGitHubUrl.mockReturnValue({ owner: 'user', repo: 'repo' });

            const updatedLine = await updateMarkdownLine(line, token);

            expect(mockedGetStarCount).not.toHaveBeenCalled();
            expect(updatedLine).toBe(line);
        });

        it('should handle multiple links on the same line', async () => {
            const line = '* [Repo1](https://github.com/user/repo1) and [Repo2](https://github.com/user/repo2)';

            // Mocking for repo1
            mockedParseGitHubUrl.mockImplementation((url) => {
                if (url.includes('repo1')) return { owner: 'user', repo: 'repo1' };
                if (url.includes('repo2')) return { owner: 'user', repo: 'repo2' };
                return null;
            });

            mockedGetStarCount.mockImplementation(async (owner, repo) => {
                if (repo === 'repo1') return 100;
                if (repo === 'repo2') return 200;
                return null;
            });
            
            const updatedLine = await updateMarkdownLine(line, token);
            expect(updatedLine).toBe('* [Repo1](https://github.com/user/repo1) ⭐ 100 and [Repo2](https://github.com/user/repo2) ⭐ 200');
        });

        it('should do nothing if getStarCount returns null', async () => {
            const line = '- [My Project](https://github.com/user/repo)';
            mockedParseGitHubUrl.mockReturnValue({ owner: 'user', repo: 'repo' });
            mockedGetStarCount.mockResolvedValue(null);

            const updatedLine = await updateMarkdownLine(line, token);
            expect(updatedLine).toBe(line);
        });
        
        it('[EXPECTED TO FAIL] should NOT modify a link inside a code block', async () => {
            const line = '`[Not a real link](https://github.com/user/repo)`';
            
            const updatedLine = await updateMarkdownLine(line, token);

            // This test fails because the current regex doesn't distinguish code blocks
            expect(mockedParseGitHubUrl).not.toHaveBeenCalled();
            expect(updatedLine).toBe(line);
        });
    });
});