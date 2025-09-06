import {
  JsonOutput,
  processMarkdownContent,
  ReplacementRule,
  SortOptions,
} from './markdown.js';

export interface EnhanceOptions {
  content: string;
  disableBranding?: boolean;
  findAndReplaceRaw?: string;
  regexFindAndReplaceRaw?: string;
  relativeLinkPrefix?: string;
  sortBy?: '' | 'last_commit' | 'stars';
  token: string;
}

export interface EnhanceResult {
  finalContent: string;
  isChanged: boolean;
  jsonData: JsonOutput;
}

export async function enhance(options: EnhanceOptions): Promise<EnhanceResult> {
  const {
    content,
    disableBranding = false,
    findAndReplaceRaw = '',
    regexFindAndReplaceRaw = '',
    relativeLinkPrefix = '',
    sortBy = '',
    token,
  } = options;

  const rules = parseReplacementRules(
    findAndReplaceRaw,
    regexFindAndReplaceRaw,
  );

  if (!disableBranding) {
    rules.unshift({ type: 'branding' });
  }

  const sortOptions: SortOptions = {
    by: sortBy,
    minLinks: 2,
  };

  const { finalContent, isChanged, jsonData } = await processMarkdownContent(
    content,
    token,
    rules,
    sortOptions,
    relativeLinkPrefix,
  );

  return {
    finalContent,
    isChanged,
    jsonData,
  };
}

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
