import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';

import { enhance } from './orchestrator.js';

async function run(): Promise<void> {
  try {
    // 1. Get all inputs from the GitHub Actions environment
    const token = core.getInput('github_token', { required: true });
    const markdownFile = core.getInput('markdown_file', {
      required: true,
    });
    const jsonOutputFile = core.getInput('json_output_file');
    const findAndReplaceRaw = core.getInput('find_and_replace');
    const regexFindAndReplaceRaw = core.getInput('regex_find_and_replace');
    const disableBranding = core.getInput('disable_branding') === 'true';
    const sortBy = core.getInput('sort_by') as '' | 'last_commit' | 'stars';
    const relativeLinkPrefix = core.getInput('relative_link_prefix');

    if (!markdownFile) {
      core.warning('No markdown file specified to process.');
      return;
    }

    core.info(`Processing file: ${markdownFile}`);

    // 2. Read the file content
    const originalContent = await fs.readFile(markdownFile, 'utf-8');

    // 3. Call the pure orchestrator function with all the data
    const result = await enhance({
      content: originalContent,
      disableBranding,
      findAndReplaceRaw,
      regexFindAndReplaceRaw,
      relativeLinkPrefix,
      sortBy,
      token,
    });

    // 4. Handle the results (write files)
    if (jsonOutputFile) {
      let fullJsonPath: string;

      if (jsonOutputFile.toLowerCase() === 'auto') {
        const baseName = path.basename(
          markdownFile,
          path.extname(markdownFile),
        );
        fullJsonPath = `${baseName}.json`;
      } else {
        fullJsonPath = jsonOutputFile;
      }

      const outputDir = path.dirname(fullJsonPath);
      await fs.mkdir(outputDir, { recursive: true });

      await fs.writeFile(
        fullJsonPath,
        JSON.stringify(result.jsonData, null, 2),
        'utf-8',
      );
      core.info(
        `Successfully generated hierarchical JSON file at ${fullJsonPath}`,
      );
    }

    if (result.isChanged) {
      await fs.writeFile(markdownFile, result.finalContent, 'utf-8');
      core.info(`Successfully updated ${markdownFile}.`);
    } else {
      core.info(`No changes needed for ${markdownFile}.`);
    }

    core.info('Process finished.');
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.setFailed(`Action failed with error: ${error.message}`);
    } else {
      core.setFailed(`Action failed with an unknown error: ${error}`);
    }
  }
}

void run();
