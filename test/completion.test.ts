import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAgent } from '../src/agent.js';
import { parseCompletionVerdict } from '../src/completion.js';
import { ModelRegistry, type ModelMessage, type ModelProvider, type ToolDefinition } from '../src/models.js';

class SequenceProvider implements ModelProvider {
  readonly id = 'sequence';
  readonly calls: Array<{ messages: ModelMessage[]; tools: readonly ToolDefinition[] }> = [];
  constructor(private readonly responses: ModelMessage[]) {}
  async complete(messages: ModelMessage[], tools: readonly ToolDefinition[]): Promise<ModelMessage> {
    this.calls.push({ messages: messages.map((message) => ({ ...message })), tools });
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected model call');
    return response;
  }
}

async function withAgent(responses: ModelMessage[], run: (provider: SequenceProvider, workdir: string) => Promise<void>) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeal-completion-'));
  const provider = new SequenceProvider(responses);
  try { await run(provider, workdir); }
  finally { fs.rmSync(workdir, { recursive: true, force: true }); }
}

const verdict = (status: string, gaps: string[] = []): ModelMessage => ({
  role: 'assistant',
  content: JSON.stringify({ status, summary: `${status} summary`, gaps, evidence: [] }),
});

test('parses a structured completion verdict and rejects contradictory success', () => {
  assert.equal(parseCompletionVerdict(verdict('satisfied').content!).status, 'satisfied');
  assert.throws(() => parseCompletionVerdict(verdict('satisfied', ['missing test']).content!), /cannot contain gaps/);
});

test('forces a separate validation call before accepting TASK_DONE', async () => {
  await withAgent([{ role: 'assistant', content: 'Implemented it. TASK_DONE' }, verdict('satisfied')], async (provider, workdir) => {
    const result = await runAgent({
      task: 'Implement it', workdir, registry: registryFor(provider),
      selection: { provider: 'sequence', model: 'test' }, maxSteps: 2,
    });
    assert.match(result, /TASK_DONE/);
    assert.equal(provider.calls.length, 2);
    assert.deepEqual(provider.calls[1].tools, []);
    assert.match(provider.calls[1].messages[1].content || '', /USER TASK:\nImplement it/);
  });
});

test('feeds validation gaps back to the worker and validates the correction', async () => {
  await withAgent([
    { role: 'assistant', content: 'Mostly done. TASK_DONE' },
    verdict('needs_work', ['Add the requested test']),
    { role: 'assistant', content: 'Added the test. TASK_DONE' },
    verdict('satisfied'),
  ], async (provider, workdir) => {
    const result = await runAgent({
      task: 'Implement and test it', workdir, registry: registryFor(provider),
      selection: { provider: 'sequence', model: 'test' }, maxSteps: 3, maxCompletionAttempts: 2,
    });
    assert.match(result, /Added the test/);
    assert.match(provider.calls[2].messages.at(-1)?.content || '', /Add the requested test/);
  });
});

test('reports failure when completion validation attempts are exhausted', async () => {
  await withAgent([
    { role: 'assistant', content: 'Done. TASK_DONE' },
    verdict('needs_work', ['Missing requirement']),
  ], async (provider, workdir) => {
    await assert.rejects(runAgent({
      task: 'Do all requirements', workdir, registry: registryFor(provider),
      selection: { provider: 'sequence', model: 'test' }, maxSteps: 2, maxCompletionAttempts: 1,
    }), /exhausted 1 attempt/);
  });
});

test('does not return success when the worker exhausts its step budget', async () => {
  await withAgent([{ role: 'assistant', content: 'Still working' }], async (provider, workdir) => {
    await assert.rejects(runAgent({
      task: 'Finish the task', workdir, registry: registryFor(provider),
      selection: { provider: 'sequence', model: 'test' }, maxSteps: 1,
    }), /without validated completion/);
  });
});

function registryFor(provider: ModelProvider) {
  const registry = new ModelRegistry();
  registry.register(provider);
  return registry;
}
