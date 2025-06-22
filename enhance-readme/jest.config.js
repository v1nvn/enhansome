/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true, // Automatically clear mock calls and instances between every test
  coverageProvider: "v8",
  testMatch: [
    "**/tests/**/*.test.ts", // A common pattern for test files
    "**/?(*.)+(spec|test).ts" // Default Jest pattern
  ],
};
