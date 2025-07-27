import * as core from '@actions/core';
import * as fs from 'fs/promises';

import {
  processMarkdownContent,
  ReplacementRule,
  SortOptions,
} from './markdown.js';

function parseReplacementRules(
  findAndReplaceRaw: string,
  regexFindAndReplaceRaw: string,
): ReplacementRule[] {
  const rules: ReplacementRule[] = [];
  const separator = ':::';

  if (findAndReplaceRaw) {
    findAndReplaceRaw
      .split('\n')
      .filter(line => line.trim() && line.includes(separator))
      .forEach(line => {
        const [find, ...rest] = line.split(separator);
        rules.push({
          find,
          replace: rest.join(separator),
          type: 'literal',
        });
      });
  }

  if (regexFindAndReplaceRaw) {
    regexFindAndReplaceRaw
      .split('\n')
      .filter(line => line.trim() && line.includes(separator))
      .forEach(line => {
        const [find, ...rest] = line.split(separator);
        rules.push({
          find,
          replace: rest.join(separator),
          type: 'regex',
        });
      });
  }

  return rules;
}

async function processMarkdownFile(
  filePath: string,
  token: string,
  rules?: ReplacementRule[],
  sortOptions?: SortOptions,
  relativeLinkPrefix?: string,
) {
  core.info(`Processing file: ${filePath}`);
  try {
    const originalContent = await fs.readFile(filePath, 'utf-8');
    const { finalContent, isChanged } = await processMarkdownContent(
      originalContent,
      token,
      rules,
      sortOptions,
      relativeLinkPrefix,
    );

    if (isChanged) {
      await fs.writeFile(filePath, finalContent, 'utf-8');
      core.info(`Successfully updated ${filePath}.`);
    } else {
      core.info(`No changes needed for ${filePath}.`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      core.error(`Error processing file ${filePath}: ${error.message}`);
      if (error.stack) {
        core.debug(error.stack);
      }
    } else {
      core.error(`Error processing file ${filePath}: ${error}`);
    }
  }
}

async function run(): Promise<void> {
  try {
    const token = core.getInput('github_token', { required: true });
    const markdownFilesRaw = core.getInput('markdown_files', {
      required: true,
    });
    const findAndReplaceRaw = core.getInput('find_and_replace');
    const regexFindAndReplaceRaw = core.getInput('regex_find_and_replace');
    const disableBranding = core.getInput('disable_branding') === 'true';
    const sortBy = core.getInput('sort_by') as '' | 'last_commit' | 'stars';
    const relativeLinkPrefix = core.getInput('relative_link_prefix');

    const filePaths = markdownFilesRaw.split(/\s+/).filter(Boolean);
    if (filePaths.length === 0) {
      core.warning('No markdown files specified to process.');
      return;
    }

    const rules = parseReplacementRules(
      findAndReplaceRaw,
      regexFindAndReplaceRaw,
    );

    if (!disableBranding) {
      rules.unshift({ type: 'branding' });
      core.debug('Default branding is enabled.');
    }

    const sortOptions: SortOptions = {
      by: sortBy,
      minLinks: 2,
    };

    core.info(`Markdown files to process: ${filePaths.join(', ')}`);
    for (const filePath of filePaths) {
      await processMarkdownFile(
        filePath,
        token,
        rules,
        sortOptions,
        relativeLinkPrefix,
      );
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
