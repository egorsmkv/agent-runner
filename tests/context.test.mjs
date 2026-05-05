// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { extractRelevantPrdSnippets } from '../actions/context/index.mjs';

describe('scope context action', () => {
  it('extracts PRD snippets related to the active scope criteria', () => {
    const markdown = `# PRD

## Summary
Use the editor.

## Scope A
US-001 unrelated work.

## Scope B
US-004 task sidebar store boundary.
Move task commands to the store.
`;

    const snippets = extractRelevantPrdSnippets(markdown, {
      id: 'scope-6',
      title: 'Task sidebar store boundary',
      acceptanceCriteria: ['US-004'],
    });

    expect(snippets).toContain('US-004 task sidebar store boundary');
    expect(snippets).not.toContain('US-001 unrelated work');
  });
});
