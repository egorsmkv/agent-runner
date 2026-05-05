import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

const maxPrdSnippetChars = 30000;

export async function writeScopeContext({
  repoRoot,
  prdPath,
  relativePrdPath,
  planPath,
  planDir,
  contextDir = path.join(planDir, 'context'),
  plan,
  scope,
  qualityGates,
  baselineStatus,
}) {
  await mkdir(contextDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const contextPath = path.join(contextDir, `${timestamp}-${scope.id}.md`);
  const markdown = await readFile(prdPath, 'utf8');
  const content = formatScopeContext({
    relativePrdPath,
    planPath,
    plan,
    scope,
    qualityGates,
    prdSnippets: extractRelevantPrdSnippets(markdown, scope),
    baselineStatus,
  });

  await writeFile(contextPath, content);

  return contextPath;
}

export function extractRelevantPrdSnippets(markdown, scope) {
  const blocks = splitMarkdownBlocks(markdown);
  const needles = scopeNeedles(scope);
  const scored = blocks
    .map((block, index) => ({
      block,
      index,
      score: scoreBlock(block, needles, index),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = [];
  let totalChars = 0;

  for (const candidate of scored) {
    const text = candidate.block.trim();

    if (!text || totalChars + text.length > maxPrdSnippetChars) {
      continue;
    }

    selected.push(candidate);
    totalChars += text.length;
  }

  if (selected.length === 0) {
    return markdown.slice(0, maxPrdSnippetChars);
  }

  return selected
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.block.trim())
    .join('\n\n---\n\n');
}

function formatScopeContext({
  relativePrdPath,
  planPath,
  plan,
  scope,
  qualityGates,
  prdSnippets,
  baselineStatus,
}) {
  return `# Agent Scope Context

Use this bundle as the first source of context for the next Codex pass.
Read the full PRD or full YAML plan only if this bundle is insufficient.

PRD path: ${relativePrdPath}
YAML plan path: ${planPath}

## Active Scope

\`\`\`yaml
${YAML.stringify(scope, { lineWidth: 100 }).trim()}
\`\`\`

## Focused Quality Gates

${qualityGates.length > 0 ? qualityGates.map((gate) => `- ${gate}`).join('\n') : '- none'}

${verificationHints({ relativePrdPath, scope })}

## Plan Progress Summary

${plan.scopes
  .map((candidate) => {
    const suffix = candidate.id === scope.id ? ' (active)' : '';
    return `- ${candidate.id}: ${candidate.status}${suffix} - ${candidate.title}`;
  })
  .join('\n')}

## Worktree Baseline At Scope Start

\`\`\`text
${baselineStatus || 'clean'}
\`\`\`

## Relevant PRD Snippets

${prdSnippets}
`;
}

function verificationHints({ relativePrdPath, scope }) {
  const haystack = [
    relativePrdPath,
    scope.id,
    scope.title,
    ...scope.acceptanceCriteria,
    ...scope.qualityGates,
  ]
    .join('\n')
    .toLowerCase();

  if (!haystack.includes('workfloweditor') && !haystack.includes('workflow editor')) {
    return '';
  }

  return `## Repository Verification Hints

- Prefer \`yarn test:fe:unit <test files>\` for focused unit/component/store verification; WorkflowEditor tests are targetable through the normal Vitest config.
- Do not start with \`yarn vitest run ...\`; this repo does not expose that path reliably in agent worktrees.
- If a browser check is required, use a small focused Playwright command such as \`yarn test:e2e <spec>\`.
- Test auth credentials are \`test@test.com\` / \`test\`.
- If auth, dev-server bootstrap, or Playwright environment setup blocks verification after one focused attempt, stop and ask the user for help with the exact blocker instead of guessing through multiple broad rewrites.
`;
}

function splitMarkdownBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let current = [];

  for (const line of lines) {
    if (/^#{1,4}\s+/.test(line) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks;
}

function scopeNeedles(scope) {
  return [
    scope.id,
    scope.title,
    ...scope.acceptanceCriteria,
    ...scope.title.split(/\s+/).filter((word) => word.length > 4),
  ]
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
}

function scoreBlock(block, needles, index) {
  const lower = block.toLowerCase();
  let score = index === 0 ? 2 : 0;

  for (const needle of needles) {
    if (lower.includes(needle)) {
      score += needle.length > 8 ? 8 : 3;
    }
  }

  if (/^##\s+(summary|acceptance criteria|implementation plan|design progress)/im.test(block)) {
    score += 2;
  }

  return score;
}
