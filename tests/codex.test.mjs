// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  formatCodexEventMessage,
  isBenignCodexDiagnostic,
  readEventType,
  summarizeWorktreeChanges,
} from '../actions/codex/index.mjs';
import { buildMarkdownSyncPrompt, buildScopePrompt } from '../utils/prompts.mjs';

describe('codex scope prompt', () => {
  it('includes the PRD path, active scope, gates, and progress contract', async () => {
    const prompt = await buildScopePrompt({
      prdPath: 'docs/prds/example.md',
      scope: {
        body: `### Scope 1: Example

- [ ] Status: In progress`,
      },
      qualityGates: ['yarn types'],
    });

    expect(prompt).toContain('PRD path: docs/prds/example.md');
    expect(prompt).toContain('### Scope 1: Example');
    expect(prompt).toContain('`yarn types`');
    expect(prompt).toContain('Do not mark the scope complete in the Markdown PRD');
    expect(prompt).toContain('temporary code');
  });

  it('builds a markdown sync prompt with task marker instructions', async () => {
    const prompt = await buildMarkdownSyncPrompt({
      prdPath: 'docs/prds/example.md',
      planPath: '.agent/example/plan.yaml',
      scope: {
        id: 'scope-1',
        title: 'Example',
        status: 'complete',
        acceptanceCriteria: ['US-001'],
        qualityGates: ['yarn types'],
        temporaryFollowUps: [],
      },
      gateResults: [{ command: 'yarn types', exitCode: 0 }],
    });

    expect(prompt).toContain('Mark completed relevant PRD tasks with [+]');
    expect(prompt).toContain('Leave not-started tasks as [ ]');
    expect(prompt).toContain('Do not edit source code or tests');
  });

  it('includes failed quality gate output for repair prompts', async () => {
    const prompt = await buildScopePrompt({
      prdPath: 'docs/prds/example.md',
      scope: {
        body: '### Scope 1: Example',
      },
      qualityGates: ['yarn types'],
      repairFailure: {
        command: 'yarn types',
        exitCode: 2,
        outputSummary: 'Type error',
      },
    });

    expect(prompt).toContain('The previous verification failed.');
    expect(prompt).toContain('Exit code: 2');
    expect(prompt).toContain('Type error');
  });
});

describe('codex progress events', () => {
  it('reads event types from codex JSON lines', () => {
    expect(readEventType(JSON.stringify({ type: 'response_item' }))).toBe('response_item');
    expect(readEventType('not json')).toBeNull();
  });

  it('formats response item messages for CLI progress', () => {
    expect(
      formatCodexEventMessage({
        type: 'response_item',
        item: {
          type: 'message',
          content: [{ text: 'Planning the scope.' }],
        },
      }),
    ).toBe('[codex] Planning the scope.');
  });

  it('formats tool and lifecycle events', () => {
    expect(
      formatCodexEventMessage({
        type: 'response_item',
        item: { type: 'function_call', name: 'exec_command' },
      }),
    ).toBe('[codex:tool] exec_command');
    expect(formatCodexEventMessage({ type: 'turn.started' })).toBe('[codex:stage] turn started');
  });

  it('formats actual codex exec json events', () => {
    expect(formatCodexEventMessage({ type: 'thread.started', thread_id: 'thread-1' })).toBe(
      '[codex:stage] thread started',
    );
    expect(
      formatCodexEventMessage({
        type: 'item.completed',
        item: { id: 'item_0', type: 'agent_message', text: 'ok' },
      }),
    ).toBe('[codex] ok');
    expect(
      formatCodexEventMessage({
        type: 'turn.completed',
        usage: {
          input_tokens: 10,
          cached_input_tokens: 2,
          output_tokens: 3,
          reasoning_output_tokens: 1,
        },
      }),
    ).toBe('[codex:done] turn completed (input 10, cached 2, output 3, reasoning 1)');
  });

  it('suppresses command execution lifecycle events without command details', () => {
    expect(
      formatCodexEventMessage({
        type: 'item.started',
        item: { type: 'command_execution' },
      }),
    ).toBeNull();
    expect(
      formatCodexEventMessage({
        type: 'item.completed',
        item: { type: 'command_execution', command: 'yarn types' },
      }),
    ).toBe('[codex:cmd] yarn types');
  });

  it('formats reasoning summaries as thinking updates', () => {
    expect(
      formatCodexEventMessage({
        type: 'item.completed',
        item: { type: 'reasoning', summary: [{ text: 'Reviewing files.' }] },
      }),
    ).toBe('[codex:think] Reviewing files.');
  });

  it('summarizes changed files from git status', () => {
    expect(summarizeWorktreeChanges(' M src/a.ts\n?? scripts/agent/index.mjs')).toEqual({
      summary: 'changed 2 files',
      files: [
        { status: 'M', path: 'src/a.ts' },
        { status: '??', path: 'scripts/agent/index.mjs' },
      ],
    });
    expect(summarizeWorktreeChanges('')).toBeNull();
  });

  it('classifies repeated Codex rollout persistence errors as benign diagnostics', () => {
    expect(
      isBenignCodexDiagnostic(
        '2026-04-30T07:12:27Z ERROR codex_core::session: failed to record rollout items: thread 019ddd40-373b-7630-b010-a521442ab7a9 not found',
      ),
    ).toBe(true);
    expect(isBenignCodexDiagnostic('ERROR something else')).toBe(false);
  });
});
